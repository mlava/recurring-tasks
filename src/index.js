import iziToast from "izitoast";

export default {
  onload: ({ extensionAPI }) => {
    const config = {
      tabTitle: "Recurring Tasks",
      settings: [
        {
          id: "rt-destination",
          name: "Destination for next task",
          description: "Where to create the next occurrence",
          action: { type: "select", items: ["DNP", "Same Page", "DNP under heading"] },
        },
        {
          id: "rt-dnp-heading",
          name: "DNP heading (optional)",
          description: "Create under this heading on DNP when destination is DNP under heading",
          action: { type: "input", placeholder: "Tasks" },
        },
        {
          id: "rt-advance-from",
          name: "Calculate next due date from",
          description: "Calculate next date from current due date or TODO completion date",
          action: { type: "select", items: ["Due", "Completion"] },
        },
        {
          id: "rt-attribute-surface",
          name: "Show repeat/due as",
          description: "Where to display human-visible repeat/due",
          action: { type: "select", items: ["Child", "Hidden"] },
        },
        {
          id: "rt-confirm",
          name: "Confirm before spawning next task",
          description: "Ask for confirmation when a recurring task is completed",
          action: { type: "switch" },
        },
      ],
    };
    extensionAPI.settings.panel.create(config);
    
    function S() {
      const adv = (extensionAPI.settings.get("rt-advance-from") || "Due").toString().toLowerCase();
      return {
        destination: extensionAPI.settings.get("rt-destination") || "DNP",
        dnpHeading: extensionAPI.settings.get("rt-dnp-heading") || "Tasks",
        dateFormat: "ROAM",
        advanceFrom: adv,
        attributeSurface: extensionAPI.settings.get("rt-attribute-surface") || "Child",
        confirmBeforeSpawn: !!extensionAPI.settings.get("rt-confirm"),
      };
    }
    
    const processedMap = new Map();
    let observer = null;
    let observerReinitTimer = null;
    let lastSweep = 0;
    
    initiateObserver();
    window.addEventListener("hashchange", handleHashChange);
    
    function normalizeUid(raw) {
      if (!raw) return null;
      const trimmed = String(raw).trim();
      if (!trimmed) return null;
      if (/^[A-Za-z0-9_-]{9}$/.test(trimmed)) return trimmed;

      if (trimmed.includes("/")) {
        const segment = trimmed.split("/").filter(Boolean).pop();
        const attempt = normalizeUid(segment);
        if (attempt) return attempt;
      }

      const tailMatch = trimmed.match(/[A-Za-z0-9_-]{9}$/);
      if (tailMatch) return tailMatch[0];
      return trimmed;
    }

    function findBlockUidFromCheckbox(input) {
      if (!input) return null;

      const candidates = [
        input.closest?.("[data-uid]"),
        input.closest?.(".roam-block"),
        input.closest?.(".rm-block-main"),
        input.closest?.(".roam-block-container"),
        input.closest?.(".roam-block-container > .roam-block"),
      ];

      for (const el of candidates) {
        if (!el) continue;
        const dataUid = normalizeUid(el.getAttribute?.("data-uid") || el.dataset?.uid);
        if (dataUid) return dataUid;
        const id = el.id || "";
        if (id.startsWith("block-input-")) return normalizeUid(id.slice("block-input-".length));
        if (id.startsWith("block-")) return normalizeUid(id.slice("block-".length));
      }

      const roamBlock = input.closest?.(".roam-block");
      const path = normalizeUid(roamBlock?.getAttribute?.("data-path"));
      if (path) {
        return path;
      }

      const domUtil = window.roamAlphaAPI?.util?.dom;
      if (domUtil) {
        try {
          if (typeof domUtil.elToUid === "function") {
            const uid = normalizeUid(domUtil.elToUid(input));
            if (uid) return uid;
          }
          if (typeof domUtil.blockUidFromTarget === "function") {
            const uid = normalizeUid(domUtil.blockUidFromTarget(input));
            if (uid) return uid;
          }
        } catch (err) {
          console.warn("[RecurringTasks] Failed to derive UID via dom util", err);
        }
      }

      return null;
    }

    function disconnectObserver() {
      if (!observer) return;
      try {
        observer.disconnect();
      } catch (_) {
        // Ignore disconnect errors
      }
      observer = null;
    }

    function scheduleObserverRestart(delay = 200) {
      if (observerReinitTimer) clearTimeout(observerReinitTimer);
      observerReinitTimer = setTimeout(() => {
        initiateObserver();
      }, delay);
    }

    function handleHashChange() {
      disconnectObserver();
      scheduleObserverRestart();
    }

    if (typeof window !== "undefined") {
      try {
        window.__RecurringTasksCleanup?.();
      } catch (_) {
        // ignore cleanup errors from previous runs
      }
      window.__RecurringTasksCleanup = () => {
        window.removeEventListener("hashchange", handleHashChange);
        if (observerReinitTimer) {
          clearTimeout(observerReinitTimer);
          observerReinitTimer = null;
        }
        disconnectObserver();
      };
    }

    function initiateObserver() {
      disconnectObserver();
      // Targets: main + right sidebar
      const targetNode1 = document.getElementsByClassName("roam-main")[0];
      const targetNode2 = document.getElementById("right-sidebar");
      if (!targetNode1 && !targetNode2) return;

      ensurePillStyles();

      const obsConfig = { attributes: false, childList: true, subtree: true };
      const callback = async function (mutationsList, obs) {
        for (const mutation of mutationsList) {
          if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            decorateBlockPills(node);
            
            const inputs = node.matches?.(".check-container input")
              ? [node]
              : Array.from(node.querySelectorAll?.(".check-container input") || []);

            for (const input of inputs) {
              if (!input?.control?.checked && !input?.checked) continue;
              const uid = findBlockUidFromCheckbox(input);
              if (!uid) {
                continue;
              }

              if (processedMap.has(uid)) {
                continue;
              }
              processedMap.set(uid, Date.now());

              try {
                const set = S();
                const block = await getBlock(uid);
                if (!block) {
                  processedMap.delete(uid);
                  continue;
                }

                const meta = await readRecurringMeta(block, set);
                if (!meta.repeat) {
                  processedMap.delete(uid);
                  continue; // Not a recurring task
                }

                if (set.confirmBeforeSpawn) {
                  const confirmed = await requestSpawnConfirmation(meta, set);
                  if (!confirmed) {
                    processedMap.delete(uid);
                    continue;
                  }
                }
                
                await markCompleted(uid, set);

                const nextDue = computeNextDue(meta, set);
                if (!nextDue) {
                  processedMap.delete(uid);
                  continue;
                }

                await spawnNextOccurrence(block, meta, nextDue, set);
                const displayDate = toDnpTitle(nextDue);
                toast(`Next occurrence scheduled for ${displayDate}`);
              } catch (err) {
                console.error("[RecurringTasks] error:", err);
                processedMap.delete(uid); // allow retry on failure
              }
            }
          }
        }

        sweepProcessed();
      };

      observer = new MutationObserver(callback);
      if (targetNode1) observer.observe(targetNode1, obsConfig);
      if (targetNode2) observer.observe(targetNode2, obsConfig);
    }
    
    async function getBlock(uid) {
      const res = await window.roamAlphaAPI.q(`
        [:find (pull ?b [:block/uid :block/string :block/props
                         {:block/children [:block/uid :block/string]}
                         {:block/page [:block/uid :node/title]}])
         :where [?b :block/uid "${uid}"]]`);
      return res?.[0]?.[0] || null;
    }

    async function updateBlockString(uid, string) {
      return window.roamAlphaAPI.updateBlock({ block: { uid, string } });
    }

    async function updateBlockProps(uid, merge) {
      const current = await window.roamAlphaAPI.q(
        `[:find ?p :where [?b :block/uid "${uid}"] [?b :block/props ?p]]`
      );
      let props = {};
      try {
        props = current?.[0]?.[0] ? JSON.parse(current[0][0]) : {};
      } catch (e) {
        props = {};
      }
      const next = { ...props, ...merge };
      return window.roamAlphaAPI.updateBlock({ block: { uid, props: next } });
    }

    async function createBlock(parentUid, order, string, uid) {
      return window.roamAlphaAPI.createBlock({
        location: { "parent-uid": parentUid, order },
        block: uid ? { uid, string } : { string },
      });
    }

    async function getOrCreatePageUid(title) {
      const found = await window.roamAlphaAPI.q(
        `[:find ?u :where [?p :node/title "${title}"] [?p :block/uid ?u]]`
      );
      if (found?.[0]?.[0]) return found[0][0];
      const uid = window.roamAlphaAPI.util.generateUID();
      await window.roamAlphaAPI.createPage({ page: { title, uid } });
      return uid;
    }

    async function getOrCreateChildUnderHeading(parentUid, headingText) {
      const children = await window.roamAlphaAPI.q(`
        [:find (pull ?c [:block/uid :block/string])
         :where [?p :block/uid "${parentUid}"] [?c :block/parents ?p]]`);
      const hit = children?.map((r) => r[0]).find((c) => (c.string || "").trim() === headingText.trim());
      if (hit) return hit.uid;
      const uid = window.roamAlphaAPI.util.generateUID();
      await createBlock(parentUid, 0, headingText, uid);
      return uid;
    }

    // ========================= Metadata =========================
    const ATTR_RE = /^([\p{L}\p{N}_\-\/\s]+)::\s*(.+)$/u;

    async function readRecurringMeta(block, set) {
      const props = parseProps(block.props);
      const rt = props.rt || {};

      const fromProps = {
        repeat: props.repeat || null,
        due: props.due ? parseRoamDate(props.due) : null,
      };

      let repeatText = fromProps.repeat;
      let dueDate = fromProps.due;

      if (set.attributeSurface !== "Hidden") {
        const fromText = parseAttrsFromBlockText(block.string);
        if (!repeatText && fromText.repeat) repeatText = fromText.repeat;
        if (!dueDate && fromText.due) dueDate = parseRoamDate(fromText.due);

        if ((!repeatText || !dueDate) && Array.isArray(block.children) && block.children.length) {
          const fromChildren = parseAttrsFromChildBlocks(block.children);
          if (!repeatText && fromChildren.repeat) repeatText = fromChildren.repeat;
          if (!dueDate && fromChildren.due) dueDate = parseRoamDate(fromChildren.due);
        }
      }

      repeatText = normalizeRepeatRuleText(repeatText);

      return {
        uid: block.uid,
        repeat: repeatText,
        due: dueDate,
        rtId: rt.id || null,
        pageUid: block.page?.uid || null,
      };
    }

    function parseProps(propsJson) {
      if (!propsJson) return {};
      try {
        return typeof propsJson === "string" ? JSON.parse(propsJson) : propsJson;
      } catch {
        return {};
      }
    }

    function parseAttrsFromBlockText(text) {
      const lines = text.split("\n");
      const out = {};
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const m = lines[i].match(ATTR_RE);
        if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
      }
      return { repeat: out["repeat"] || null, due: out["due"] || null };
    }

    function parseAttrsFromChildBlocks(children) {
      if (!Array.isArray(children)) return { repeat: null, due: null };
      const out = {};
      for (const child of children) {
        const text = typeof child?.string === "string" ? child.string : null;
        if (!text) continue;
        const m = text.match(ATTR_RE);
        if (m) {
          const key = m[1].trim().toLowerCase();
          if (!(key in out)) out[key] = m[2].trim();
        }
      }
      return { repeat: out["repeat"] || null, due: out["due"] || null };
    }

    function normalizeRepeatRuleText(value) {
      if (!value) return null;
      let s = String(value).trim();
      if (!s) return null;
      s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
      s = s.replace(/\{\{([^\}]+)\}\}/g, "$1");
      s = s.replace(/\(\(([^\)]+)\)\)/g, "$1");
      s = s.replace(/^\s*-/g, "").trim();
      return s || null;
    }

    // ========================= Completion + next spawn =========================
    async function ensureChildAttr(uid, key, value) {
      const current = await window.roamAlphaAPI.q(`
        [:find (pull ?c [:block/uid :block/string])
         :where [?p :block/uid "${uid}"] [?c :block/parents ?p]]`);
      const has = (current || []).some((r) =>
        new RegExp(`^\\s*${key}::\\s*`, "i").test((r[0]?.string || "").trim())
      );
      if (!has) await createBlock(uid, 0, `${key}:: ${value}`);
      else {
        // If exists and differs, update existing child
        const match = (current || []).find((r) =>
          new RegExp(`^\\s*${key}::\\s*`, "i").test((r[0]?.string || "").trim())
        );
        const curVal = match?.[0]?.string?.replace(/^[^:]+::\s*/i, "")?.trim();
        if (typeof curVal === "string" && curVal !== value) {
          await window.roamAlphaAPI.updateBlock({ block: { uid: match[0].uid, string: `${key}:: ${value}` } });
        }
      }
    }

    async function markCompleted(uid, set) {
      const d = formatDate(todayLocal(), set);

      if (set.attributeSurface === "Child") {
        await ensureChildAttr(uid, "completed", d);
      } else {
        const block = await getBlock(uid);
        const lines = block.string.split("\n");
        const i = lines.findIndex((l) => /^completed::/i.test(l.trim()));
        if (i >= 0) lines[i] = `completed:: ${d}`;
        else lines.splice(1, 0, `completed:: ${d}`);
        await updateBlockString(uid, lines.join("\n"));
      }

      await updateBlockProps(uid, {
        rt: { lastCompleted: new Date().toISOString() },
      });
    }

    async function spawnNextOccurrence(prevBlock, meta, nextDueDate, set) {
      const nextDueStr = formatDate(nextDueDate, set);
      const prevText = prevBlock.string;

      const seriesId = meta.rtId || shortId();
      if (!meta.rtId) await updateBlockProps(prevBlock.uid, { rt: { id: seriesId } });

      const targetPageUid = await chooseTargetPageUid(nextDueDate, prevBlock, set);

      const taskLine = normalizeToTodoMacro(prevText).trim();
      const newUid = window.roamAlphaAPI.util.generateUID();

      await createBlock(targetPageUid, 0, taskLine, newUid);

      if (set.attributeSurface === "Child") {
        await ensureChildAttr(newUid, "repeat", meta.repeat);
        await ensureChildAttr(newUid, "due", nextDueStr);
      }

      await updateBlockProps(newUid, {
        repeat: meta.repeat,
        due: nextDueStr,
        rt: { id: shortId(), parent: seriesId },
      });

      return newUid;
    }

    // ========================= Destination helpers =========================
    async function chooseTargetPageUid(nextDueDate, prevBlock, set) {
      if (set.destination === "Same Page") {
        return prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
      }
      const dnpTitle = toDnpTitle(nextDueDate);
      const dnpUid = await getOrCreatePageUid(dnpTitle);
      if (set.destination === "DNP under heading" && set.dnpHeading) {
        const headingUid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
        return headingUid || dnpUid;
      }
      return dnpUid;
    }

    function toDnpTitle(d) {
      const util = window.roamAlphaAPI?.util;
      if (util?.dateToPageTitle) {
        try {
          return util.dateToPageTitle(d);
        } catch (err) {
          console.warn("[RecurringTasks] dateToPageTitle failed, falling back to ISO", err);
        }
      }
      // Fallback: ISO style
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // ========================= Rule parsing + next date =========================
    const DOW_MAP = {
      sunday: "SU",
      monday: "MO",
      tuesday: "TU",
      wednesday: "WE",
      thursday: "TH",
      friday: "FR",
      saturday: "SA",
    };
    const DOW_IDX = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

    // NEW: helpers for ordinal + weekday aliasing
    const ORD_MAP = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "last": -1 };
    const DOW_ALIASES = {
      su: "sunday", sun: "sunday", sunday: "sunday",
      mo: "monday", mon: "monday", monday: "monday",
      tu: "tuesday", tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
      we: "wednesday", wed: "wednesday", wednesday: "wednesday",
      th: "thursday", thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
      fr: "friday", fri: "friday", friday: "friday",
      sa: "saturday", sat: "saturday", saturday: "saturday",
    };

    function ordFromText(s) {
      const n = Number(s);
      if (!Number.isNaN(n) && n >= 1 && n <= 31) return n;
      const key = s.toLowerCase();
      if (ORD_MAP[key] != null) return ORD_MAP[key];
      return null;
    }
    function dowFromAlias(s) {
      const norm = (DOW_ALIASES[s.toLowerCase()] || s).toLowerCase();
      return DOW_MAP[norm] || null;
    }

    function parseRuleText(s) {
      if (!s) return null;
      const t = s.trim().replace(/\s+/g, " ").toLowerCase();
      if (t === "daily") return { kind: "DAILY", interval: 1 };
      if (t === "every day") return { kind: "DAILY", interval: 1 };
      if (t === "every other day" || t === "every second day" || t === "every two days") return { kind: "DAILY", interval: 2 };
      if (t === "every third day" || t === "every three days") return { kind: "DAILY", interval: 3 };
      if (t === "every fourth day" || t === "every four days") return { kind: "DAILY", interval: 4 };
      if (t === "every fifth day" || t === "every five days") return { kind: "DAILY", interval: 5 };
      if (t === "every weekday") return { kind: "WEEKDAY" };
      let m = t.match(/^every (\d+)\s*days?$/);
      if (m) return { kind: "DAILY", interval: parseInt(m[1], 10) };

      const singleDow = Object.entries(DOW_MAP).find(
        ([name]) => t === `every ${name}` || t === `every ${name}s`
      );
      if (singleDow) return { kind: "WEEKLY", interval: 1, byDay: [singleDow[1]] };

      if (t.startsWith("every ")) {
        const dowCandidate = t.slice("every ".length).replace(/\s+/g, " ").trim();
        const direct = DOW_MAP[dowCandidate];
        if (direct) return { kind: "WEEKLY", interval: 1, byDay: [direct] };
        if (dowCandidate.endsWith("s")) {
          const singular = dowCandidate.slice(0, -1);
          const code = DOW_MAP[singular];
          if (code) return { kind: "WEEKLY", interval: 1, byDay: [code] };
        }
      }

      if (t === "weekly") return { kind: "WEEKLY", interval: 1, byDay: null };
      if (t === "every week") return { kind: "WEEKLY", interval: 1, byDay: null };
      if (t === "every other week" || t === "every second week") return { kind: "WEEKLY", interval: 2, byDay: null };

      let weeklyOn = t.match(/^(?:every week|weekly)\s+on\s+(.+)$/);
      if (weeklyOn) {
        const byDay = weeklyOn[1]
          .split(/[, ]+/)
          .map((x) => DOW_MAP[x.toLowerCase()] || null)
          .filter(Boolean);
        return { kind: "WEEKLY", interval: 1, byDay: byDay.length ? byDay : null };
      }
      m = t.match(/^every (\d+)\s*weeks?(?:\s*on\s*(.+))?$/);
      if (m) {
        const byDay = m[2]
          ? m[2].split(/[, ]+/).map((x) => DOW_MAP[x.toLowerCase()] || null).filter(Boolean)
          : null;
        return { kind: "WEEKLY", interval: parseInt(m[1], 10), byDay };
      }
      m = t.match(/^weekly on (.+)$/);
      if (m) {
        const byDay = m[1]
          .split(/[, ]+/)
          .map((x) => DOW_MAP[x.toLowerCase()] || null)
          .filter(Boolean);
        if (byDay.length) return { kind: "WEEKLY", interval: 1, byDay };
      }

      if (t === "monthly") return { kind: "MONTHLY_DAY", day: todayLocal().getDate() };
      m = t.match(/^every month on day (\d{1,2})$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };
      m = t.match(
        /^every month on the (1st|2nd|3rd|4th|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/
      );
      if (m) return { kind: "MONTHLY_NTH", nth: m[1], dow: DOW_MAP[m[2]] };
      
      m = t.match(/^(?:the\s+)?(\d{1,2}|1st|2nd|3rd|4th)\s+day\s+of\s+(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: ordFromText(m[1]) };
      m = t.match(/^day\s+(\d{1,2})\s+(?:of|in)?\s*(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };
      
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }
      // compact variant: “2nd Tue each month”
      m = t.match(/^(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+(?:each|every)\s+month$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }

      // “every weekend”
      if (t === "every weekend" || t === "weekend")
      return { kind: "WEEKLY", interval: 1, byDay: ["SA","SU"] };

      return null;
    }

    function computeNextDue(meta, set) {
      const rule = parseRuleText(meta.repeat);
      if (!rule) {
        console.warn(`[RecurringTasks] Unable to parse repeat rule "${meta.repeat}"`);
        return null;
      }
      const base = set.advanceFrom === "completion" ? todayLocal() : meta.due || todayLocal();
      switch (rule.kind) {
        case "DAILY":
          return addDaysLocal(base, rule.interval || 1);
        case "WEEKDAY":
          return nextWeekday(base);
        case "WEEKLY":
          return nextWeekly(base, rule);
        case "MONTHLY_DAY":
          return nextMonthOnDay(base, rule.day);
        case "MONTHLY_NTH":
          return nextMonthOnNthDow(base, rule.nth, rule.dow);
        default:
          return null;
      }
    }

    function nextWeekday(d) {
      let x = addDaysLocal(d, 1);
      while (isWeekend(x)) x = addDaysLocal(x, 1);
      return x;
    }
    function nextWeekly(base, rule) {
      const interval = rule.interval || 1;
      if (!rule.byDay || rule.byDay.length === 0) return addDaysLocal(base, 7 * interval);
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const cand = addDaysLocal(base, i);
        const dow = DOW_IDX[cand.getDay()];
        if (rule.byDay.includes(dow)) return cand;
      }
      return addDaysLocal(base, 7 * interval);
    }
    function nextMonthOnDay(base, day) {
      const y = base.getFullYear();
      const m = base.getMonth();
      const cand = new Date(y, m + 1, day, 12, 0, 0, 0);
      if (cand.getMonth() !== (m + 1) % 12) return new Date(y, m + 2, 0, 12, 0, 0, 0); // clamp
      return cand;
    }
    function nextMonthOnNthDow(base, nthText, dowCode) {
      const nthMap = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, last: -1 };
      const nth = nthMap[nthText];
      const y = base.getFullYear();
      const m = base.getMonth() + 1;
      if (nth === -1) {
        const last = new Date(y, m + 1, 0, 12, 0, 0, 0);
        return lastDowOnOrBefore(last, dowCode);
      }
      return nthDowOfMonth(new Date(y, m, 1, 12, 0, 0, 0), dowCode, nth);
    }
    function nthDowOfMonth(first, dowCode, nth) {
      const target = DOW_IDX.indexOf(dowCode);
      let d = new Date(first.getTime());
      while (d.getDay() !== target) d = addDaysLocal(d, 1);
      d = addDaysLocal(d, 7 * (nth - 1));
      return d;
    }
    function lastDowOnOrBefore(d, dowCode) {
      const target = DOW_IDX.indexOf(dowCode);
      let x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
      while (x.getDay() !== target) x = addDaysLocal(x, -1);
      return x;
    }

    // ========================= Date utils & formatting =========================
    function todayLocal() {
      const d = new Date();
      d.setHours(12, 0, 0, 0); // noon to dodge DST edges
      return d;
    }
    function addDaysLocal(d, n) {
      const x = new Date(d.getTime());
      x.setDate(x.getDate() + n);
      return x;
    }
    function isWeekend(d) {
      const w = d.getDay(); // 0 Sun .. 6 Sat
      return w === 0 || w === 6;
    }
    function parseRoamDate(s) {
      if (!s) return null;
      const m = String(s).match(/^\[\[(\d{4})-(\d{2})-(\d{2})\]\]$/);
      if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return new Date(`${s}T12:00:00`);
      return null;
    }
    function formatDate(d, set) {
      if (set.dateFormat === "ISO") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      }
      return `[[${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}]]`;
    }

    // ========================= Render helpers =========================
    function normalizeToTodoMacro(s) {
      var t = s.replace(/^\s+/, "");
      if (/^\-\s+/.test(t)) t = t.replace(/^\-\s+/, "");
      t = t.replace(/^\{\{\s*\[\[(?:TODO|DONE)\]\]\s*\}\}\s*/i, "");
      t = t.replace(/^(?:TODO|DONE)\s+/i, "");
      return "{{[[TODO]]}} " + t;
    }

    function shortId() {
      return Math.random().toString(36).slice(2, 8);
    }

    function requestSpawnConfirmation(meta, set) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        iziToast.question({
          theme: 'light',
          color: 'black',
          layout: 2,
          class: 'recTasks',
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title: "Recurring Tasks",
          message: "Spawn next occurrence?",
          position: 'center',
          buttons: [
            ['<button>Yes</button>', function (instance, toast, button, e, inputs) {
              instance.hide({ transitionOut: 'fadeOut' }, toast, 'button');
              finish(true);
            }, true], // true to focus
            [
              "<button>No</button>",
              function (instance, toast, button, e) {
                instance.hide({ transitionOut: "fadeOut" }, toast, "button");
                finish(false);
              },
            ],
          ],
          onClosed: () => finish(false),
        });
      });
    }

    function toast(msg) {
      iziToast.show({
        theme: 'light',
        color: 'black',
        message: msg,
        class: 'recTasks',
        position: 'center',
        close: false,
        timeout: 3000,
        closeOnClick: true,
        displayMode: 2
      });
    }

    // ========================= Hidden pills UI =========================
    function ensurePillStyles() {
      if (document.getElementById("rt-pill-style")) return;
      const style = document.createElement("style");
      style.id = "rt-pill-style";
      style.textContent = `
        .rt-pill-wrap { margin-left: 8px; }
        .rt-pill {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 10px;
          border: 1px solid var(--rt-pill-border, #ccc);
          font-size: 12px;
          cursor: pointer;
          margin-right: 6px;
          user-select: none;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .rt-pill:hover {
          background: rgba(0,0,0,0.04);
          border-color: var(--rt-pill-border-hover, #bbb);
        }
      `;
      document.head.appendChild(style);
    }

    function decorateBlockPills(rootEl) {
      const blocks = rootEl.matches?.(".roam-block") ? [rootEl] : Array.from(rootEl.querySelectorAll?.(".roam-block") || []);
      for (const b of blocks) {
        try {
          const uid = normalizeUid(b.getAttribute?.("data-uid") || b.dataset?.uid);
          if (!uid) continue;
          // skip if pills already added
          if (b.querySelector?.(".rt-pill-wrap")) continue;

          window.roamAlphaAPI.q(
            `[:find ?p :where [?b :block/uid "${uid}"] [?b :block/props ?p]]`
          ).then(async res => {
            let props = {};
            try { props = res?.[0]?.[0] ? JSON.parse(res[0][0]) : {}; } catch {}
            const repeat = props.repeat || null;
            const due = props.due || null;
            if (!repeat && !due) return;
            const set = S();
            if (set.attributeSurface !== "Hidden") return;

            const main = b.querySelector?.(".rm-block-main");
            if (!main) return;

            const check = main.querySelector?.(".check-container, .rm-checkbox") || main.firstElementChild;
            const pillWrap = document.createElement("span");
            pillWrap.className = "rt-pill-wrap";

            function makePill(label, title, onClick) {
              const el = document.createElement("span");
              el.className = "rt-pill";
              el.textContent = label;
              el.title = title;
              el.addEventListener("click", (e) => { e.stopPropagation(); onClick(e); });
              return el;
            }

            if (repeat) {
              pillWrap.appendChild(makePill(
                "Repeat",
                repeat,
                async (e) => {
                  if (e.altKey) {
                    // Alt-click: quick edit repeat
                    iziToast.question({
                      theme: 'light',
                      color: 'black',
                      layout: 2,
                      class: 'recTasks',
                      drag: false,
                      timeout: false,
                      close: true,
                      overlay: true,
                      title: "Edit Repeat",
                      message: `Current: ${repeat}`,
                      inputs: [
                        ['<input type="text" placeholder="e.g. 1st Monday of each month" />', 'keyup', function (instance, toast, input, e) {}]
                      ],
                      buttons: [
                        ['<button>Save</button>', async (instance, toast, button, e, inputs) => {
                          const val = inputs?.[0]?.value?.trim();
                          instance.hide({ transitionOut: 'fadeOut' }, toast, 'button');
                          if (!val) return;
                          await updateBlockProps(uid, { repeat: val });
                          if (set.attributeSurface === "Child") await ensureChildAttr(uid, "repeat", val);
                          toastMsg(`Repeat → ${val}`);
                          function toastMsg(m){ toast(m); }
                        }, false],
                        ['<button>Cancel</button>', (instance, toast) => {
                          instance.hide({ transitionOut: 'fadeOut' }, toast, 'button');
                        }]
                      ],
                      onClosing: () => {}
                    });
                  } else {
                    try { await navigator.clipboard?.writeText?.(repeat); toast("Repeat copied"); } catch { /*noop*/ }
                  }
                }
              ));
            }
            if (due) {
              pillWrap.appendChild(makePill(
                "Due",
                due,
                async (e) => {
                  const d = parseRoamDate(due) || todayLocal();
                  if (e.shiftKey) {
                    // Shift-click: snooze +1 day
                    const next = addDaysLocal(d, 1);
                    const nextStr = formatDate(next, set);
                    await updateBlockProps(uid, { due: nextStr });
                    if (set.attributeSurface === "Child") await ensureChildAttr(uid, "due", nextStr);
                    toast(`Due → ${nextStr}`);
                  } else {
                    // default: open due page in right sidebar
                    const title = toDnpTitle(d);
                    const dnpUid = await getOrCreatePageUid(title);
                    window.roamAlphaAPI.ui.rightSidebar.addWindow({ window: { type: "outline", "block-uid": dnpUid }});
                  }
                }
              ));
            }

            if (check?.nextSibling) {
              check.parentNode.insertBefore(pillWrap, check.nextSibling);
            } else {
              main.appendChild(pillWrap);
            }
          }).catch(() => {});
        } catch {}
      }
    }

    // ========================= Housekeeping =========================
    function sweepProcessed() {
      const now = Date.now();
      if (now - lastSweep < 60_000) return; // once per minute
      lastSweep = now;
      for (const [k, v] of processedMap) {
        if (now - v > 5 * 60_000) processedMap.delete(k); // 5 min TTL
      }
    }
  },

  onunload: () => {
    if (typeof window !== "undefined") {
      try {
        window.__RecurringTasksCleanup?.();
      } finally {
        delete window.__RecurringTasksCleanup;
      }
    }
  },
};
