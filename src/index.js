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
          action: { type: "select", items: ["Child", "Hidden"], onChange: handleAttributeSurfaceChange },
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

    extensionAPI.ui.commandPalette.addCommand({
      label: "Convert TODO to Recurring Task",
      callback: () => convertTODO(null),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Convert TODO to Recurring Task",
      callback: (e) => convertTODO(e),
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: "Create a Recurring TODO",
      callback: () => createRecurringTODO(),
    });

    async function convertTODO(e) {
      let fuid = null;
      if (e && e["block-uid"]) {
        fuid = e["block-uid"];
      } else {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        fuid = focused && focused["block-uid"];
        if (!fuid) {
          alert("Place the cursor in the block you want to teleport first."); // TODO convert to izitoast
          return;
        }
      }

      const block = await getBlock(fuid);
      if (!block) {
        toast("Unable to read the current block.");
        return;
      }
      const fstring = block.string || "";
      const props = parseProps(block.props);
      const inlineAttrs = parseAttrsFromBlockText(fstring);
      const childAttrs = parseAttrsFromChildBlocks(block.children || []);

      const promptResult = await promptForRepeatAndDue({
        repeat: props.repeat || childAttrs.repeat?.value || inlineAttrs.repeat || "",
        due: props.due || childAttrs.due?.value || inlineAttrs.due || "",
      });
      if (!promptResult) return;

      const set = S();
      const normalizedRepeat = normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat;
      if (!normalizedRepeat) {
        toast("Repeat rule is required.");
        return;
      }
      if (!parseRuleText(normalizedRepeat)) {
        toast("Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      if (promptResult.due) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptResult.due);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast("Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const baseWithoutAttrs = removeInlineAttributes(fstring, ["repeat", "due"]);
      const todoString = normalizeToTodoMacro(baseWithoutAttrs);
      if (todoString !== fstring) {
        await updateBlockString(fuid, todoString);
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      const propsPatch = { repeat: normalizedRepeat, rt: rtProps };
      if (dueStr) propsPatch.due = dueStr;
      else propsPatch.due = undefined;

      await updateBlockProps(fuid, propsPatch);

      if (set.attributeSurface === "Child") {
        await ensureChildAttr(fuid, "repeat", normalizedRepeat);
        if (dueStr) await ensureChildAttr(fuid, "due", dueStr);
        else await removeChildAttr(fuid, "due");
      } else {
        await removeChildAttr(fuid, "repeat");
        await removeChildAttr(fuid, "due");
      }

      repeatOverrides.delete(fuid);
      toast("Recurring TODO ready");
      scheduleSurfaceSync(set.attributeSurface);
    }

    async function createRecurringTODO() {
      const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
      const fuid = focused && focused["block-uid"];
      if (fuid == null || fuid == undefined) {
        alert("Place the cursor in the block you want to teleport first."); // TODO convert to izitoast
        return;
      }

      const block = await getBlock(fuid);
      if (!block) {
        toast("Unable to read the current block.");
        return;
      }

      const props = parseProps(block.props);
      const inlineAttrs = parseAttrsFromBlockText(block.string || "");
      const childAttrs = parseAttrsFromChildBlocks(block.children || []);
      const baseWithoutAttrs = removeInlineAttributes(block.string || "", ["repeat", "due"]);
      const initialTaskText = normalizeToTodoMacro(baseWithoutAttrs).replace(/^{{\[\[TODO\]\]}}\s*/i, "");
      const promptResult = await promptForRepeatAndDue({
        includeTaskText: true,
        taskText: initialTaskText,
        repeat: props.repeat || childAttrs.repeat?.value || inlineAttrs.repeat || "",
        due:
          props.due ||
          childAttrs.due?.value ||
          inlineAttrs.due ||
          "",
      });
      if (!promptResult) return;

      const set = S();
      const normalizedRepeat = normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat;
      if (!normalizedRepeat) {
        toast("Repeat rule is required.");
        return;
      }
      if (!parseRuleText(normalizedRepeat)) {
        toast("Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      if (promptResult.due) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptResult.due);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast("Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const taskTextInput =
        typeof promptResult.taskText === "string" ? promptResult.taskText : initialTaskText;
      const cleanedTaskText = removeInlineAttributes(taskTextInput, ["repeat", "due"]);
      const todoString = normalizeToTodoMacro(cleanedTaskText);
      if (todoString !== (block.string || "")) {
        await updateBlockString(fuid, todoString);
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      const propsPatch = { repeat: normalizedRepeat, rt: rtProps };
      if (dueStr) propsPatch.due = dueStr;
      else propsPatch.due = undefined;

      await updateBlockProps(fuid, propsPatch);

      if (set.attributeSurface === "Child") {
        await ensureChildAttr(fuid, "repeat", normalizedRepeat);
        if (dueStr) await ensureChildAttr(fuid, "due", dueStr);
        else await removeChildAttr(fuid, "due");
      } else {
        await removeChildAttr(fuid, "repeat");
        await removeChildAttr(fuid, "due");
      }

      repeatOverrides.delete(fuid);
      toast("Created your recurring TODO");
      scheduleSurfaceSync(set.attributeSurface);
    }

    function S() {
      const adv = (extensionAPI.settings.get("rt-advance-from") || "Due").toString().toLowerCase();
      const attrSurface = extensionAPI.settings.get("rt-attribute-surface") || "Hidden";
      if (attrSurface !== lastAttrSurface) {
        lastAttrSurface = attrSurface;
        scheduleSurfaceSync(attrSurface);
      }
      let tz = "UTC";
      let locale = "en-US";
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch (_) {
        tz = "UTC";
      }
      try {
        locale =
          (typeof navigator !== "undefined" && navigator.language) ||
          Intl.DateTimeFormat().resolvedOptions().locale ||
          "en-US";
      } catch (_) {
        locale = "en-US";
      }
      return {
        destination: extensionAPI.settings.get("rt-destination") || "DNP",
        dnpHeading: extensionAPI.settings.get("rt-dnp-heading") || "Tasks",
        dateFormat: "ROAM",
        advanceFrom: adv,
        attributeSurface: attrSurface,
        confirmBeforeSpawn: !!extensionAPI.settings.get("rt-confirm"),
        timezone: tz,
        locale,
      };
    }

    const processedMap = new Map();
    const repeatOverrides = new Map();
    const deletingChildAttrs = new Set();
    let childAttrMigrationRunning = false;
    let migratingChildToHidden = false;

    function normalizeOverrideEntry(entry) {
      if (!entry) return null;
      if (typeof entry === "string") {
        const normalized = normalizeRepeatRuleText(entry) || entry;
        return normalized ? { repeat: normalized } : null;
      }
      if (typeof entry === "object") {
        const out = {};
        if (typeof entry.repeat === "string" && entry.repeat) {
          out.repeat = normalizeRepeatRuleText(entry.repeat) || entry.repeat;
        }
        if (entry.due instanceof Date && !Number.isNaN(entry.due.getTime())) {
          out.due = entry.due;
        }
        return Object.keys(out).length ? out : null;
      }
      return null;
    }

    function mergeRepeatOverride(uid, patch) {
      if (!uid || !patch) return;
      const current = normalizeOverrideEntry(repeatOverrides.get(uid)) || {};
      const next = { ...current };
      if (typeof patch.repeat === "string" && patch.repeat) {
        next.repeat = normalizeRepeatRuleText(patch.repeat) || patch.repeat;
      }
      if (patch.due instanceof Date && !Number.isNaN(patch.due.getTime())) {
        next.due = patch.due;
      }
      if (patch.due === null) {
        delete next.due;
      }
      if (!next.repeat && !next.due) {
        repeatOverrides.delete(uid);
        return;
      }
      repeatOverrides.set(uid, next);
    }

    function captureBlockLocation(block) {
      const parents = Array.isArray(block?.parents) ? block.parents : [];
      const parentUid = parents.length ? parents[0]?.uid : block?.page?.uid || null;
      const order = typeof block?.order === "number" ? block.order : 0;
      return { parentUid, order };
    }

    function prepareDueChangeContext(block, meta, set) {
      const props = parseProps(block?.props);
      const inlineAttrs = parseAttrsFromBlockText(block?.string || "");
      const location = captureBlockLocation(block);
      const childMap = meta?.childAttrMap || {};
      const dueInfo = childMap["due"] || null;
      const repeatInfo = childMap["repeat"] || null;
      const snapshot = captureBlockSnapshot(block);
      const previousDueDate =
        meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? new Date(meta.due.getTime()) : null;
      const previousDueStr =
        typeof props?.due === "string"
          ? props.due
          : previousDueDate
            ? formatDate(previousDueDate, set)
            : null;
      return {
        previousDueDate,
        previousDueStr,
        previousInlineDue: inlineAttrs?.due || null,
        hadInlineDue: inlineAttrs?.due != null,
        previousChildDue: dueInfo?.value || null,
        hadChildDue: !!dueInfo,
        previousChildDueUid: dueInfo?.uid || null,
        previousChildRepeat: repeatInfo?.value || null,
        previousChildRepeatUid: repeatInfo?.uid || null,
        previousParentUid: location.parentUid,
        previousOrder: location.order,
        previousProps: props && typeof props === "object" ? clonePlain(props) : {},
        previousInlineRepeat: inlineAttrs?.repeat || null,
        hadInlineRepeat: inlineAttrs?.repeat != null,
        snapshot,
      };
    }

    const dueUndoRegistry = new Map();

    function registerDueUndoAction(payload) {
      if (!payload?.blockUid) return;
      dueUndoRegistry.set(payload.blockUid, payload);
      iziToast.show({
        theme: "light",
        color: "black",
        class: "recTasks",
        position: "center",
        timeout: 5000,
        close: true,
        closeOnClick: false,
        message: payload.message || "Due updated",
        buttons: [
          [
            "<button>Undo</button>",
            (instance, toastEl) => {
              instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
              performDueUndo(payload).catch((err) => console.error("[RecurringTasks] due undo failed", err));
            },
            true,
          ],
        ],
        onClosed: () => {
          dueUndoRegistry.delete(payload.blockUid);
        },
      });
    }

    async function performDueUndo(payload) {
      if (!payload?.blockUid) return;
      dueUndoRegistry.delete(payload.blockUid);
      const uid = payload.blockUid;
      repeatOverrides.delete(uid);
      const set = payload.setSnapshot || S();
      const snapshot = payload.snapshot || null;
      try {
        // Move back before restoring metadata so child updates apply under the correct parent
        if (payload.wasMoved && payload.previousParentUid && payload.previousParentUid !== payload.newParentUid) {
          try {
            const order = payload.previousOrder != null ? payload.previousOrder : 0;
            await window.roamAlphaAPI.moveBlock({
              location: { "parent-uid": payload.previousParentUid, order },
              block: { uid },
            });
          } catch (err) {
            console.warn("[RecurringTasks] undo move failed", err);
          }
        }
        let block = await getBlock(uid);

        if (snapshot) {
          if (typeof snapshot.string === "string" && block?.string !== snapshot.string) {
            await updateBlockString(uid, snapshot.string);
            block = await getBlock(uid);
          }
          await setBlockProps(uid, snapshot.props || {});
          block = await getBlock(uid);

          if (set.attributeSurface === "Child") {
            // Clear current attrs first to avoid duplicates
            await removeChildAttr(uid, "repeat");
            await removeChildAttr(uid, "due");
            await removeChildAttr(uid, "rt-processed");
            const childAttrs = snapshot.childAttrs || {};
            if (childAttrs.repeat?.value != null && childAttrs.repeat.value !== "") {
              await ensureChildAttr(uid, "repeat", childAttrs.repeat.value);
            }
            if (childAttrs.due?.value != null && childAttrs.due.value !== "") {
              await ensureChildAttr(uid, "due", childAttrs.due.value);
            }
            if (childAttrs["rt-processed"]?.value != null && childAttrs["rt-processed"].value !== "") {
              await ensureChildAttr(uid, "rt-processed", childAttrs["rt-processed"].value);
            }
          } else if (payload.hadInlineDue && typeof payload.previousInlineDue === "string" && block?.string) {
            const restored = replaceAttributeInString(block.string, "due", payload.previousInlineDue);
            if (restored && restored !== block.string) {
              await updateBlockString(uid, restored);
              block = await getBlock(uid);
            }
            if (payload.hadInlineRepeat && typeof payload.previousInlineRepeat === "string") {
              const repeatRestored = replaceAttributeInString(block.string || "", "repeat", payload.previousInlineRepeat);
              if (repeatRestored && repeatRestored !== (block.string || "")) {
                await updateBlockString(uid, repeatRestored);
                block = await getBlock(uid);
              }
            }
          }
        } else {
          const propsUpdate = {};
          if (payload.previousDueStr) propsUpdate.due = payload.previousDueStr;
          else propsUpdate.due = undefined;
          if (payload.previousInlineRepeat || payload.previousChildRepeat) {
            propsUpdate.repeat = payload.previousInlineRepeat || payload.previousChildRepeat;
          } else {
            propsUpdate.repeat = undefined;
          }
          await updateBlockProps(uid, propsUpdate);
          block = await getBlock(uid);
          if (set.attributeSurface === "Child") {
            if (payload.previousChildRepeat != null) {
              await ensureChildAttr(uid, "repeat", payload.previousChildRepeat);
            } else {
              await removeChildAttr(uid, "repeat");
            }
            if (payload.hadChildDue && payload.previousChildDue != null) {
              await ensureChildAttr(uid, "due", payload.previousChildDue);
            } else {
              await removeChildAttr(uid, "due");
            }
            if (snapshot?.childAttrs?.["rt-processed"]?.value != null && snapshot.childAttrs["rt-processed"].value !== "") {
              await ensureChildAttr(uid, "rt-processed", snapshot.childAttrs["rt-processed"].value);
            } else {
              await removeChildAttr(uid, "rt-processed");
            }
          } else if (payload.hadInlineDue && block?.string) {
            const restored = replaceAttributeInString(block.string, "due", payload.previousInlineDue || "");
            if (restored && restored !== block.string) {
              await updateBlockString(uid, restored);
              block = await getBlock(uid);
            }
            if (payload.hadInlineRepeat && typeof payload.previousInlineRepeat === "string") {
              const repeatRestored = replaceAttributeInString(block.string || "", "repeat", payload.previousInlineRepeat);
              if (repeatRestored && repeatRestored !== (block.string || "")) {
                await updateBlockString(uid, repeatRestored);
                block = await getBlock(uid);
              }
            }
          }
        }

        const previousDueDate =
          payload.previousDueDate instanceof Date && !Number.isNaN(payload.previousDueDate.getTime())
            ? new Date(payload.previousDueDate.getTime())
            : null;
        const snapshotRepeat =
          snapshot?.props?.repeat ||
          snapshot?.childAttrs?.repeat?.value ||
          payload.previousInlineRepeat ||
          payload.previousChildRepeat ||
          null;

        const normalizedRepeat =
          snapshotRepeat != null
            ? normalizeRepeatRuleText(snapshotRepeat) || snapshotRepeat
            : payload.previousInlineRepeat != null
              ? normalizeRepeatRuleText(payload.previousInlineRepeat) || payload.previousInlineRepeat
              : payload.previousChildRepeat != null
                ? normalizeRepeatRuleText(payload.previousChildRepeat) || payload.previousChildRepeat
                : undefined;
        const restoreDueStr =
          payload.previousDueStr != null
            ? payload.previousDueStr
            : previousDueDate
              ? formatDate(previousDueDate, set)
              : undefined;
        const restoreDueDate = restoreDueStr ? parseRoamDate(restoreDueStr) || previousDueDate : previousDueDate;

        const propsPatch = {};
        if (set.attributeSurface !== "Child" && normalizedRepeat !== undefined) {
          propsPatch.repeat = normalizedRepeat;
        }
        if (restoreDueStr !== undefined) {
          propsPatch.due = restoreDueStr;
        }
        if (Object.keys(propsPatch).length) {
          await updateBlockProps(uid, propsPatch);
        }

        const overridePatch = {};
        if (normalizedRepeat) overridePatch.repeat = normalizedRepeat;
        if (restoreDueStr !== undefined) {
          if (restoreDueDate instanceof Date && !Number.isNaN(restoreDueDate.getTime())) {
            overridePatch.due = restoreDueDate;
          } else {
            overridePatch.due = null;
          }
        }

        if (Object.keys(overridePatch).length) {
          mergeRepeatOverride(uid, overridePatch);
        } else {
          repeatOverrides.delete(uid);
        }

        toast("Changes un-done successfully");
      } catch (err) {
        console.warn("[RecurringTasks] due undo error", err);
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function ensureTargetReady(dueDate, prevBlock, set) {
      let uid = null;
      try {
        uid = await chooseTargetPageUid(dueDate, prevBlock, set);
      } catch (err) {
        console.warn("[RecurringTasks] choose target failed (initial)", err);
      }
      if (!uid) return null;
      // Wait for Roam's DB/index to see the newly created page/heading
      for (let i = 0; i < 5; i++) {
        const exists = await getBlock(uid);
        if (exists) return uid;
        await delay(60 * (i + 1)); // 60ms, 120ms, 180ms, ...
      }
      // Last resort: explicitly (re)create the expected target
      try {
        if (set.destination === "DNP under heading" && set.dnpHeading) {
          const dnpTitle = toDnpTitle(dueDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          uid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
        } else if (set.destination !== "Same Page") {
          const dnpTitle = toDnpTitle(dueDate);
          uid = await getOrCreatePageUid(dnpTitle);
        }
      } catch (err) {
        console.warn("[RecurringTasks] ensureTargetReady fallback failed", err);
      }
      return uid;
    }

    async function relocateBlockForDue(block, dueDate, set, meta = null) {
      const locationBefore = captureBlockLocation(block);
      const result = {
        moved: false,
        targetUid: locationBefore.parentUid,
        previousParentUid: locationBefore.parentUid,
        previousOrder: locationBefore.order,
      };
      if (!block || !set) return result;
      const hasDue = dueDate instanceof Date && !Number.isNaN(dueDate.getTime());
      let targetUid = locationBefore.parentUid;
      if (hasDue && set.destination !== "Same Page") {
        targetUid = await ensureTargetReady(dueDate, block, set);
      }
      if (targetUid) result.targetUid = targetUid;
      if (hasDue && set.destination !== "Same Page" && targetUid && targetUid !== locationBefore.parentUid) {
        try {
          await window.roamAlphaAPI.moveBlock({
            location: { "parent-uid": targetUid, order: 0 },
            block: { uid: block.uid },
          });
          result.moved = true;
        } catch (err) {
          console.warn("[RecurringTasks] relocateBlockForDue failed", err);
        }
      }
      await delay(40);
      try {
        const latest = await getBlock(block.uid);
        const props = parseProps(latest?.props);
        const updates = {};
        const repeatValue = meta?.repeat || props.repeat || null;
        const dueStr = hasDue ? formatDate(dueDate, set) : null;
        if (repeatValue && !props.repeat) updates.repeat = repeatValue;
        if (dueStr) {
          if (props.due !== dueStr) updates.due = dueStr;
        } else if (props.due) {
          updates.due = undefined;
        }
        if (Object.keys(updates).length) {
          await updateBlockProps(block.uid, updates);
        }
        if (set.attributeSurface === "Child") {
          const childMap = (meta && meta.childAttrMap) || {};
          const repeatChildVal = childMap.repeat?.value || repeatValue;
          if (repeatChildVal) await ensureChildAttr(block.uid, "repeat", repeatChildVal);
          if (dueStr) await ensureChildAttr(block.uid, "due", dueStr);
          else if (childMap.due) await removeChildAttr(block.uid, "due");
        }
      } catch (err) {
        console.warn("[RecurringTasks] relocate metadata sync failed", err);
      }
      return result;
    }
    const pendingPillTimers = new Map();
    const childEditDebounce = new Map(); // parentUid -> timer
    let observer = null;
    let observerReinitTimer = null;
    let lastSweep = 0;
    let lastAttrSurface = null;
    let pendingSurfaceSync = null;

    lastAttrSurface = extensionAPI.settings.get("rt-attribute-surface") || "Hidden";
    void syncPillsForSurface(lastAttrSurface);
    initiateObserver();
    window.addEventListener("hashchange", handleHashChange);

    // === Child -> Props sync listeners (only used when attribute surface is "Child")
    const _handleAnyEdit = handleAnyEdit.bind(null);
    document.addEventListener("input", _handleAnyEdit, true);
    document.addEventListener("blur", _handleAnyEdit, true);

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

    function findBlockUidFromElement(el) {
      if (!el) return null;

      const direct = normalizeUid(el.getAttribute?.("data-uid") || el.dataset?.uid);
      if (direct) return direct;

      const withData = el.closest?.("[data-uid]");
      if (withData) {
        const cand = normalizeUid(withData.getAttribute?.("data-uid") || withData.dataset?.uid);
        if (cand) return cand;
      }

      const id = el.id || "";
      if (id.startsWith("block-input-")) return normalizeUid(id.slice("block-input-".length));
      if (id.startsWith("block-")) return normalizeUid(id.slice("block-".length));

      const blockInput =
        el.querySelector?.("[id^='block-input-']") || el.closest?.("[id^='block-input-']");
      if (blockInput) {
        const extracted = normalizeUid(blockInput.id.replace(/^block-input-/, ""));
        if (extracted) return extracted;
      }

      const roamBlock = el.closest?.(".roam-block") || el.querySelector?.(".roam-block");
      if (roamBlock) {
        const cand = normalizeUid(roamBlock.getAttribute?.("data-uid") || roamBlock.dataset?.uid);
        if (cand) return cand;
      }

      const domUtil = window.roamAlphaAPI?.util?.dom;
      if (domUtil) {
        try {
          if (typeof domUtil.elToUid === "function") {
            const cand = normalizeUid(domUtil.elToUid(el));
            if (cand) return cand;
          }
          if (typeof domUtil.blockUidFromTarget === "function") {
            const cand = normalizeUid(domUtil.blockUidFromTarget(el));
            if (cand) return cand;
          }
        } catch (err) {
          console.warn("[RecurringTasks] Failed to derive UID from element", err);
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
        if (pendingSurfaceSync) {
          clearTimeout(pendingSurfaceSync);
          pendingSurfaceSync = null;
        }
        for (const timer of pendingPillTimers.values()) {
          clearTimeout(timer);
        }
        pendingPillTimers.clear();
        // remove child->props listeners
        document.removeEventListener("input", _handleAnyEdit, true);
        document.removeEventListener("blur", _handleAnyEdit, true);
        clearAllPills();
        disconnectObserver();
      };
    }

    function initiateObserver() {
      disconnectObserver();
      // Targets: main + right sidebar
      const targetNode1 = document.getElementsByClassName("roam-main")[0];
      const targetNode2 = document.getElementById("right-sidebar");
      if (!targetNode1 && !targetNode2) return;

      const obsConfig = { attributes: false, childList: true, subtree: true };
      const callback = async function (mutationsList, obs) {
        for (const mutation of mutationsList) {
          if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            void decorateBlockPills(node);

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

                const now = Date.now();
                if (meta.processedTs && now - meta.processedTs < 4000) {
                  processedMap.delete(uid);
                  continue;
                }

                if (set.confirmBeforeSpawn) {
                  const confirmed = await requestSpawnConfirmation(meta, set);
                  if (!confirmed) {
                    processedMap.delete(uid);
                    continue;
                  }
                }

                const snapshot = captureBlockSnapshot(block);
                const overrideEntry = normalizeOverrideEntry(repeatOverrides.get(uid));
                const overrideRepeat = overrideEntry?.repeat || null;
                const overrideDue = overrideEntry?.due || null;
                if (overrideRepeat) {
                  meta.repeat = overrideRepeat;
                  meta.props = { ...(meta.props || {}), repeat: overrideRepeat };
                }
                if (overrideDue) {
                  meta.due = overrideDue;
                  meta.props = { ...(meta.props || {}), due: formatDate(overrideDue, set) };
                }
                const completion = await markCompleted(block, meta, set);
                processedMap.set(uid, completion.processedAt);

                const { meta: resolvedMeta, block: resolvedBlock } = await resolveMetaAfterCompletion(
                  snapshot,
                  uid,
                  meta,
                  set
                );
                if (overrideRepeat) {
                  resolvedMeta.repeat = overrideRepeat;
                  resolvedMeta.props = { ...(resolvedMeta.props || {}), repeat: overrideRepeat };
                }
                if (overrideDue) {
                  resolvedMeta.due = overrideDue;
                  resolvedMeta.props = { ...(resolvedMeta.props || {}), due: formatDate(overrideDue, set) };
                }
                const overrideRule = overrideRepeat ? parseRuleText(overrideRepeat) : null;
                const nextDueCandidate =
                  overrideDue && overrideDue instanceof Date && !Number.isNaN(overrideDue.getTime())
                    ? overrideDue
                    : null;
                const nextDue = nextDueCandidate || computeNextDue(resolvedMeta, set, 0, overrideRule);
                if (!nextDue) {
                  processedMap.delete(uid);
                  continue;
                }

                const parentForSpawn = resolvedBlock || (await getBlock(uid)) || block;
                const newUid = await spawnNextOccurrence(parentForSpawn, resolvedMeta, nextDue, set);
                registerUndoAction({
                  blockUid: uid,
                  snapshot,
                  completion,
                  newBlockUid: newUid,
                  nextDue,
                  set,
                  overrideEntry: overrideEntry
                    ? {
                      ...(overrideEntry.repeat ? { repeat: overrideEntry.repeat } : {}),
                      ...(overrideEntry.due ? { due: new Date(overrideEntry.due.getTime()) } : {}),
                    }
                    : null,
                });
                repeatOverrides.delete(uid);
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
      const surface = lastAttrSurface || extensionAPI.settings.get("rt-attribute-surface") || "Hidden";
      lastAttrSurface = surface;
      void syncPillsForSurface(surface);
    }

    async function getBlock(uid) {
      const res = await window.roamAlphaAPI.q(`
        [:find (pull ?b [:block/uid :block/string :block/props :block/order
                         {:block/children [:block/uid :block/string]}
                         {:block/page [:block/uid :node/title]}
                         {:block/parents [:block/uid]}])
         :where [?b :block/uid "${uid}"]]`);
      return res?.[0]?.[0] || null;
    }

    function clonePlain(value) {
      if (value == null || typeof value !== "object") return value;
      if (value instanceof Date) return new Date(value.getTime());
      if (Array.isArray(value)) return value.map((item) => clonePlain(item));
      const out = {};
      for (const key of Object.keys(value)) {
        out[key] = clonePlain(value[key]);
      }
      return out;
    }

    function captureBlockSnapshot(block) {
      const props = parseProps(block?.props);
      return {
        string: block?.string || "",
        props: props && typeof props === "object" ? clonePlain(props) : {},
        childAttrs: parseAttrsFromChildBlocks(block?.children || []),
      };
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
      if (props.rt && merge?.rt) {
        next.rt = { ...props.rt, ...merge.rt };
      }
      for (const key of Object.keys(next)) {
        if (next[key] === undefined) delete next[key];
      }
      return window.roamAlphaAPI.updateBlock({ block: { uid, props: next } });
    }

    async function setBlockProps(uid, propsObject) {
      return window.roamAlphaAPI.updateBlock({ block: { uid, props: propsObject || {} } });
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function deleteBlock(uid) {
      return window.roamAlphaAPI.deleteBlock({ block: { "uid": uid.toString() } });
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
      let processedTs = rt.processed ? Number(rt.processed) : null;
      // Parse child attributes once (works even if there are no children)
      const childAttrMap = parseAttrsFromChildBlocks(block?.children || []);
      const repeatChild = childAttrMap["repeat"];
      const dueChild = childAttrMap["due"];
      const processedChild = childAttrMap["rt-processed"];

      const fromText = parseAttrsFromBlockText(block.string || "");
      if (!repeatText && fromText["repeat"]) repeatText = fromText["repeat"];
      if (!dueDate && fromText["due"]) {
        const parsed = parseRoamDate(fromText["due"]);
        if (parsed) dueDate = parsed;
      }
      if (!processedTs && fromText["rt-processed"]) {
        const parsed = Number(fromText["rt-processed"]);
        if (!Number.isNaN(parsed)) processedTs = parsed;
      }
      // In "Child" surface mode, child attrs are the source of truth and should override props.
      if (set.attributeSurface === "Child") {
        if (repeatChild?.value) repeatText = repeatChild.value;
        if (dueChild?.value) dueDate = parseRoamDate(dueChild.value);
        if (processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      } else {
        if (!repeatText && repeatChild?.value) repeatText = repeatChild.value;
        if (!dueDate && dueChild?.value) dueDate = parseRoamDate(dueChild.value);
        if (!processedTs && processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      }

      // Child-mode precedence: child attrs override props/inline.
      if (set.attributeSurface === "Child") {
        if (repeatChild?.value) repeatText = repeatChild.value;
        if (dueChild?.value) dueDate = parseRoamDate(dueChild.value);
        if (processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      } else {
        // Non-child mode: only use child attrs as fallback if missing
        if (!repeatText && repeatChild?.value) repeatText = repeatChild.value;
        if (!dueDate && dueChild?.value) dueDate = parseRoamDate(dueChild.value);
        if (!processedTs && processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      }

      const overrideEntry = normalizeOverrideEntry(repeatOverrides.get(block.uid));
      const overrideRepeat = overrideEntry?.repeat || null;
      if (overrideRepeat) {
        repeatText = normalizeRepeatRuleText(overrideRepeat) || overrideRepeat;
      } else {
        repeatText = normalizeRepeatRuleText(repeatText);
      }
      if (overrideEntry?.due) {
        dueDate = overrideEntry.due;
      }

      return {
        uid: block.uid,
        repeat: repeatText,
        due: dueDate,
        childAttrMap,
        processedTs: processedTs || null,
        rtId: rt.id || null,
        rtParent: rt.parent || null,
        pageUid: block.page?.uid || null,
        props,
      };
    }

    async function resolveMetaAfterCompletion(snapshot, uid, baseMeta, set, attempts = 3) {
      let lastBlock = null;
      let metaCandidate = baseMeta;
      for (let i = 0; i < attempts; i++) {
        const block = await getBlock(uid);
        if (!block) break;
        lastBlock = block;
        const candidate = await readRecurringMeta(block, set);
        if (candidate?.repeat) {
          return { meta: candidate, block };
        }
        metaCandidate = candidate;
        await delay(60 * (i + 1));
      }

      const fallbackMeta = { ...(metaCandidate || baseMeta || {}) };
      const inlineAttrs = parseAttrsFromBlockText(snapshot.string || "");
      const valueSources = [
        inlineAttrs.repeat,
        metaCandidate?.props?.repeat,
        baseMeta?.props?.repeat,
        baseMeta?.repeat,
      ];
      for (const value of valueSources) {
        if (value) {
          fallbackMeta.repeat = normalizeRepeatRuleText(value);
          break;
        }
      }
      const dueSources = [
        inlineAttrs.due,
        metaCandidate?.props?.due,
        baseMeta?.props?.due,
        baseMeta?.due,
      ];
      for (const value of dueSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.due = parsed;
            break;
          }
        }
      }
      fallbackMeta.childAttrMap = metaCandidate?.childAttrMap || baseMeta?.childAttrMap || {};
      fallbackMeta.rtId = metaCandidate?.rtId || baseMeta?.rtId || null;
      fallbackMeta.rtParent = metaCandidate?.rtParent || baseMeta?.rtParent || null;
      fallbackMeta.props = metaCandidate?.props || baseMeta?.props || {};
      return { meta: fallbackMeta, block: lastBlock };
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
      if (!text) return {};
      const out = {};
      const lines = text.split("\n").slice(0, 12);
      for (const line of lines) {
        const inlineRegex =
          /(?:^|\s)([\p{L}\p{N}_\-\/]+)::\s*([^\n]*?)(?=(?:\s+[\p{L}\p{N}_\-\/]+::)|$)/gu;
        let match;
        while ((match = inlineRegex.exec(line)) !== null) {
          const key = match[1].trim().toLowerCase();
          if (!(key in out)) out[key] = match[2].trim();
        }
      }
      return out;
    }

    function parseAttrsFromChildBlocks(children) {
      if (!Array.isArray(children)) return {};
      const out = {};
      for (const child of children) {
        const text = typeof child?.string === "string" ? child.string : null;
        if (!text) continue;
        const m = text.match(ATTR_RE);
        if (m) {
          const key = m[1].trim().toLowerCase();
          if (!(key in out)) {
            out[key] = {
              value: m[2].trim(),
              uid: child?.uid || null,
            };
          }
        }
      }
      return out;
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
      const parent = await getBlock(uid);
      if (!parent) {
        return { created: false, uid: null, previousValue: null };
      }
      const children = Array.isArray(parent.children) ? parent.children : [];
      const keyRegex = new RegExp(`^\\s*${key}::\\s*`, "i");
      const match = children.find((child) => keyRegex.test((child?.string || "").trim()));
      const matchUid = typeof match?.uid === "string" ? match.uid.trim() : "";
      if (!matchUid) {
        const newUid = window.roamAlphaAPI.util.generateUID();
        await createBlock(uid, 0, `${key}:: ${value}`, newUid);
        return { created: true, uid: newUid, previousValue: null };
      }
      const existingChild = await getBlock(matchUid);
      if (!existingChild) {
        const newUid = window.roamAlphaAPI.util.generateUID();
        await createBlock(uid, 0, `${key}:: ${value}`, newUid);
        return { created: true, uid: newUid, previousValue: null };
      }
      const curVal =
        existingChild.string?.replace(/^[^:]+::\s*/i, "")?.trim() ||
        match.string?.replace(/^[^:]+::\s*/i, "")?.trim() ||
        "";
      if (curVal !== value) {
        try {
          await window.roamAlphaAPI.updateBlock({ block: { uid: matchUid, string: `${key}:: ${value}` } });
        } catch (err) {
          console.warn("[RecurringTasks] ensureChildAttr update failed, recreating", err);
          const newUid = window.roamAlphaAPI.util.generateUID();
          await createBlock(uid, 0, `${key}:: ${value}`, newUid);
          return { created: true, uid: newUid, previousValue: curVal };
        }
      }
      return { created: false, uid: matchUid, previousValue: curVal };
    }

    async function removeChildAttr(uid, key) {
      const token = `${uid}::${key}`;
      if (deletingChildAttrs.has(token)) return;
      deletingChildAttrs.add(token);
      try {
        const block = await getBlock(uid);
        if (!block) return;
        const children = Array.isArray(block?.children) ? block.children : [];
        const matches = children.filter((entry) =>
          new RegExp(`^\\s*${key}::\\s*`, "i").test((entry?.string || "").trim())
        );
        if (!matches.length) return;
        for (const entry of matches) {
          const targetUid = typeof entry?.uid === "string" ? entry.uid.trim() : "";
          if (!targetUid) continue;
          try {
            const exists = await getBlock(targetUid);
            if (!exists) continue;
            await deleteBlock(targetUid);
          } catch (err) {
            console.warn("[RecurringTasks] removeChildAttr failed", err);
          }
        }
      } finally {
        deletingChildAttrs.delete(token);
      }
    }

    async function markCompleted(block, meta, set) {
      const uid = block.uid;
      const beforeString = block.string || "";
      const processedAt = Date.now();
      const completedDate = formatDate(todayLocal(), set);
      let updatedString = beforeString;
      let stringChanged = false;
      let completedAttrChange = null;

      if (set.attributeSurface === "Child") {
        completedAttrChange = await ensureChildAttr(uid, "completed", completedDate);
        await removeChildAttr(uid, "rt-processed");
      } else {
        const lines = beforeString.split("\n");
        const idx = lines.findIndex((line) => /^completed::/i.test(line.trim()));
        if (idx >= 0) lines[idx] = `completed:: ${completedDate}`;
        else lines.splice(1, 0, `completed:: ${completedDate}`);
        updatedString = lines.join("\n");
        if (updatedString !== beforeString) {
          stringChanged = true;
          await updateBlockString(uid, updatedString);
        }
      }

      await updateBlockProps(uid, {
        rt: {
          lastCompleted: new Date(processedAt).toISOString(),
          processed: processedAt,
          tz: set.timezone,
        },
      });

      return {
        processedAt,
        completedDate,
        stringChanged,
        beforeString,
        updatedString,
        childChanges: {
          completed: completedAttrChange,
        },
      };
    }

    const undoRegistry = new Map();

    function registerUndoAction(data) {
      undoRegistry.set(data.blockUid, data);
      showUndoToast(data);
    }

    function showUndoToast(data) {
      const { nextDue, set } = data;
      const displayDate = nextDue ? formatRoamDateTitle(nextDue) : "";
      const message = nextDue
        ? `Next occurrence scheduled for ${displayDate}`
        : "Next occurrence scheduled";
      iziToast.show({
        theme: "light",
        color: "black",
        class: "recTasks",
        position: "center",
        message,
        timeout: 5000,
        close: true,
        closeOnClick: false,
        buttons: [
          [
            "<button>Undo</button>",
            (instance, toastEl) => {
              instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
              performUndo(data).catch((err) =>
                console.error("[RecurringTasks] undo failed", err)
              );
            },
            true,
          ],
        ],
        onClosed: () => {
          undoRegistry.delete(data.blockUid);
        },
      });
    }

    async function performUndo(data) {
      const { blockUid, snapshot, completion, newBlockUid, set, overrideEntry } = data;
      undoRegistry.delete(blockUid);
      try {
        const restoredString = normalizeToTodoMacro(snapshot.string);
        await updateBlockString(blockUid, restoredString);
      } catch (err) {
        console.warn("[RecurringTasks] undo string failed", err);
      }
      try {
        await setBlockProps(blockUid, snapshot.props);
      } catch (err) {
        console.warn("[RecurringTasks] undo props failed", err);
      }

      // === NEW: restore repeat/due depending on surface ===
      try {
        const surface = (set && set.attributeSurface) || lastAttrSurface || "Child";
        const hadRepeatChild = !!snapshot.childAttrs?.["repeat"];
        const hadDueChild = !!snapshot.childAttrs?.["due"];

        if (surface === "Child") {
          // Rebuild the child attributes exactly as they were
          if (hadRepeatChild) {
            await ensureChildAttr(blockUid, "repeat", snapshot.childAttrs["repeat"].value || "");
          } else {
            await removeChildAttr(blockUid, "repeat");
          }
          if (hadDueChild) {
            await ensureChildAttr(blockUid, "due", snapshot.childAttrs["due"].value || "");
          } else {
            await removeChildAttr(blockUid, "due");
          }
        } else {
          // Hidden: ensure repeat/due live in props (pills read from props)
          const needRepeat =
            !snapshot.props?.repeat && !!snapshot.childAttrs?.["repeat"]?.value;
          const needDue =
            !snapshot.props?.due && !!snapshot.childAttrs?.["due"]?.value;
          if (needRepeat || needDue) {
            const merge = {};
            if (needRepeat) merge.repeat = snapshot.childAttrs["repeat"].value;
            if (needDue) merge.due = snapshot.childAttrs["due"].value;
            await updateBlockProps(blockUid, merge);
          }
        }
      } catch (err) {
        console.warn("[RecurringTasks] undo restore repeat/due failed", err);
      }

      if (newBlockUid) {
        try {
          await deleteBlock(newBlockUid);
        } catch (err) {
          console.warn("[RecurringTasks] undo remove new block failed", err);
        }
      }

      if (set.attributeSurface === "Child") {
        await restoreChildAttr(blockUid, "completed", snapshot.childAttrs?.["completed"], completion.childChanges.completed);
        const processedSnapshot = snapshot.childAttrs?.["rt-processed"];
        if (processedSnapshot?.uid) {
          try {
            await window.roamAlphaAPI.updateBlock({
              block: { uid: processedSnapshot.uid, string: `rt-processed:: ${processedSnapshot.value}` },
            });
          } catch (err) {
            console.warn("[RecurringTasks] restore processed attr failed", err);
          }
        } else {
          await removeChildAttr(blockUid, "rt-processed");
        }
      }

      processedMap.set(blockUid, Date.now());
      setTimeout(() => processedMap.delete(blockUid), 750);
      if (overrideEntry) mergeRepeatOverride(blockUid, overrideEntry);
      toast("Changes un-done successfully");
      void syncPillsForSurface(lastAttrSurface);
    }

    async function restoreChildAttr(blockUid, key, beforeInfo, changeInfo) {
      if (beforeInfo?.uid) {
        const value = beforeInfo.value || "";
        try {
          await window.roamAlphaAPI.updateBlock({
            block: { uid: beforeInfo.uid, string: `${key}:: ${value}` },
          });
        } catch (err) {
          console.warn("[RecurringTasks] restore child attr failed", err);
        }
        return;
      }
      if (changeInfo?.uid) {
        try {
          await deleteBlock(changeInfo.uid);
        } catch (err) {
          console.warn("[RecurringTasks] remove child attr failed", err);
        }
      }
    }

    async function spawnNextOccurrence(prevBlock, meta, nextDueDate, set) {
      const nextDueStr = formatDate(nextDueDate, set);
      const prevText = removeInlineAttributes(prevBlock.string || "", ["repeat", "due", "completed"]);

      const seriesId = meta.rtId || shortId();
      if (!meta.rtId) await updateBlockProps(prevBlock.uid, { rt: { id: seriesId, tz: set.timezone } });

      let targetPageUid = await chooseTargetPageUid(nextDueDate, prevBlock, set);
      let parentBlock = await getBlock(targetPageUid);
      if (!parentBlock) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        parentBlock = await getBlock(targetPageUid);
      }
      if (!parentBlock) {
        if (set.destination === "DNP under heading" && set.dnpHeading) {
          const dnpTitle = toDnpTitle(nextDueDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          targetPageUid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
          parentBlock = await getBlock(targetPageUid);
        } else if (set.destination === "Same Page") {
          const parent = prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
          targetPageUid = parent;
          parentBlock = await getBlock(targetPageUid);
        } else {
          const dnpTitle = toDnpTitle(nextDueDate);
          targetPageUid = await getOrCreatePageUid(dnpTitle);
          parentBlock = await getBlock(targetPageUid);
        }
      }
      if (!parentBlock) {
        throw new Error(`Parent entity ${targetPageUid} unavailable`);
      }

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
        rt: { id: shortId(), parent: seriesId, tz: set.timezone },
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
      if (t === "every other day"
        || t === "every second day"
        || t === "every two days"
        || t === "second daily") return { kind: "DAILY", interval: 2 };
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
        return { kind: "WEEKLY", interval: 1, byDay: ["SA", "SU"] };

      return null;
    }

    function computeNextDue(meta, set, depth = 0, ruleOverride = null) {
      const rule = ruleOverride || parseRuleText(meta.repeat);
      if (!rule) {
        console.warn(`[RecurringTasks] Unable to parse repeat rule "${meta.repeat}"`);
        return null;
      }
      const base = set.advanceFrom === "completion" ? todayLocal() : meta.due || todayLocal();
      let next = null;
      switch (rule.kind) {
        case "DAILY":
          next = addDaysLocal(base, rule.interval || 1);
          break;
        case "WEEKDAY":
          next = nextWeekday(base);
          break;
        case "WEEKLY":
          next = nextWeekly(base, rule);
          break;
        case "MONTHLY_DAY":
          next = nextMonthOnDay(base, rule.day);
          break;
        case "MONTHLY_NTH":
          next = nextMonthOnNthDow(base, rule.nth, rule.dow);
          break;
        default:
          next = null;
      }
      if (!next) return null;
      const today = todayLocal();
      if (next < today && depth < 36) {
        const updatedMeta = { ...meta, due: next };
        return computeNextDue(updatedMeta, set, depth + 1, ruleOverride);
      }
      return next;
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
      const raw = String(s).trim();

      // 1) [[YYYY-MM-DD]] or bare YYYY-MM-DD
      let m = raw.match(/^\[\[(\d{4})-(\d{2})-(\d{2})\]\]$/);
      if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T12:00:00`);

      // 2) [[DNP title]] e.g. [[November 5th, 2025]] or bare DNP title "November 5th, 2025"
      const dnpTitle = raw.startsWith("[[") && raw.endsWith("]]") ? raw.slice(2, -2) : raw;

      // Prefer Roam's converter if available
      const util = window.roamAlphaAPI?.util;
      if (util?.pageTitleToDate) {
        try {
          const dt = util.pageTitleToDate(dnpTitle);
          if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
            // Normalize to noon to dodge DST edges
            dt.setHours(12, 0, 0, 0);
            return dt;
          }
        } catch (_) { }
      }

      // Fallback: strip ordinal ("st/nd/rd/th") and parse "Month Day, Year"
      const cleaned = dnpTitle.replace(/\b(\d{1,2})(st|nd|rd|th)\b/i, "$1");
      const parsed = new Date(`${cleaned} 12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;

      return null;
    }
    function formatDate(d, set) {
      if (set.dateFormat === "ISO") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      }
      // ROAM: always link to the Daily Note Page title, e.g. [[November 5th, 2025]]
      const title = toDnpTitle(d);
      return `[[${title}]]`;
    }

    // ========================= Render helpers =========================
    function normalizeToTodoMacro(s) {
      var t = s.replace(/^\s+/, "");
      if (/^\-\s+/.test(t)) t = t.replace(/^\-\s+/, "");
      // Match {{[[TODO]]}}, {{TODO}}, {{ [[DONE]] }}, etc.
      t = t.replace(/^\{\{\s*(?:\[\[(?:TODO|DONE)\]\]|(?:TODO|DONE))\s*\}\}\s*/i, "");
      t = t.replace(/^(?:TODO|DONE)\s+/i, "");
      return "{{[[TODO]]}} " + t;
    }

    function removeInlineAttributes(text, keys) {
      if (!text) return text;
      const lower = keys.map((k) => k.toLowerCase());
      const cleanedLines = text.split("\n").map((line) => {
        let result = line;
        for (const key of lower) {
          const keyEsc = escapeRegExp(key);
          const inlinePattern = new RegExp(
            `(^|\\s)(${keyEsc}::\\s*[^\\n]*?)(?=(?:\\s+[\\p{L}\\p{N}_\\-/]+::)|$)`,
            "giu"
          );
          result = result.replace(inlinePattern, (match, leading) => leading || "");
        }
        return result;
      });
      return cleanedLines
        .filter((line) => {
          const trimmed = line.trim().toLowerCase();
          if (!trimmed) return false;
          return !lower.some((key) => trimmed.startsWith(`${key}::`));
        })
        .join("\n")
        .trimEnd();
    }

    function escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function replaceAttributeInString(text, key, value) {
      const source = typeof text === "string" ? text : "";
      const keyEsc = escapeRegExp(key);
      const regex = new RegExp(
        `(^|\\s)(${keyEsc}::\\s*)([^\\n]*?)(?=(?:\\s+[\\p{L}\\p{N}_\\-/]+::)|$)`,
        "iu"
      );
      if (regex.test(source)) {
        return source.replace(regex, (match, leading, prefix) => `${leading}${prefix}${value}`);
      }
      return source;
    }

    async function ensureInlineAttribute(block, key, value) {
      if (!block || !block.uid) return;
      const original = block.string || "";
      const keyEsc = escapeRegExp(key);
      const hasAttr = new RegExp(`${keyEsc}::`, "i").test(original);
      if (!hasAttr) return;
      const next = replaceAttributeInString(original, key, value);
      if (next && next !== original) {
        await updateBlockString(block.uid, next);
        block.string = next;
      }
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
    /*
        function ensureToastStyles() {
          if (document.getElementById("rt-toast-style")) return;
          const style = document.createElement("style");
          style.id = "rt-toast-style";
          style.textContent = `
            .iziToast.recTasks .iziToast-body {
              display: flex;
              align-items: center;
            }
          `;
          document.head.appendChild(style);
        }
        */

    function toast(msg) {
      // ensureToastStyles();
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
    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function promptForValue({ title, message, placeholder, initial }) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const inputHtml = `<input type="text" placeholder="${escapeHtml(
          placeholder || ""
        )}" value="${escapeHtml(initial || "")}" />`;
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "recTasks2",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title,
          message,
          inputs: [
            [
              inputHtml,
              "keyup",
              function (_instance, _toast, input) {
                initial = input.value;
              },
            ],
          ],
          buttons: [
            [
              "<button>Save</button>",
              (instance, toastInstance, _button, _e, inputs) => {
                const val = inputs?.[0]?.value?.trim();
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(val || null);
              },
              true,
            ],
            [
              "<button>Cancel</button>",
              (instance, toastInstance) => {
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(null);
              },
            ],
          ],
          onClosed: () => finish(null),
        });
      });
    }

    function promptForDate({ title, message, initial }) {
      return new Promise((resolve) => {
        let settled = false;
        let current = typeof initial === "string" ? initial : "";
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const inputHtml = `<input type="date" value="${escapeHtml(current)}" />`;
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "recTasks2",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title,
          message,
          inputs: [
            [
              inputHtml,
              "input",
              function (_instance, _toast, input) {
                current = input.value;
              },
              true,
            ],
          ],
          buttons: [
            [
              "<button>Save</button>",
              (instance, toastInstance, _button, _e, inputs) => {
                const val = inputs?.[0]?.value?.trim();
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(val || null);
              },
              true,
            ],
            [
              "<button>Cancel</button>",
              (instance, toastInstance) => {
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(null);
              },
            ],
          ],
          onClosed: () => finish(null),
        });
      });
    }

    function promptForRepeatAndDue(initial = {}) {
      const includeTaskText = !!initial.includeTaskText;
      const setSnapshot = S();
      const snapshot = {
        repeat: typeof initial.repeat === "string" && initial.repeat ? initial.repeat : initial.repeatRaw || "",
        due:
          typeof initial.due === "string" && initial.due
            ? initial.due
            : initial.dueText || initial.rawDue || "",
        task:
          includeTaskText && typeof initial.taskText === "string" && initial.taskText
            ? initial.taskText
            : includeTaskText && typeof initial.taskTextRaw === "string"
              ? initial.taskTextRaw
              : "",
      };
      const initialDueDate = snapshot.due ? parseRoamDate(snapshot.due) : null;
      const initialDueIso =
        initialDueDate instanceof Date && !Number.isNaN(initialDueDate.getTime())
          ? formatIsoDate(initialDueDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.due || "")
            ? snapshot.due
            : "";
      snapshot.dueIso = initialDueIso;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const taskInputHtml = `<input type="text" placeholder="Task text" value="${escapeHtml(
          snapshot.task || ""
        )}" />`;
        const repeatInputHtml = `<input type="text" placeholder="Repeat rule (required)" value="${escapeHtml(
          snapshot.repeat || ""
        )}" />`;
        const dueInputHtml = `<input type="date" value="${escapeHtml(snapshot.dueIso || "")}" />`;
        const promptMessage = includeTaskText
          ? "Enter the task text, repeat rule, and optional due date."
          : "Enter the repeat rule and, optionally, pick a due date.";
        const inputs = [];
        const indexes = {};
        if (includeTaskText) {
          indexes.task = inputs.length;
          inputs.push([
            taskInputHtml,
            "keyup",
            function (_instance, _toast, input) {
              snapshot.task = input.value;
            },
            true,
          ]);
        }
        indexes.repeat = inputs.length;
        const repeatConfig = [
          repeatInputHtml,
          "input",
          function (_instance, _toast, input) {
            snapshot.repeat = input.value;
          },
        ];
        if (!includeTaskText) repeatConfig.push(true);
        inputs.push(repeatConfig);
        indexes.due = inputs.length;
        inputs.push([
          dueInputHtml,
          "input",
          function (_instance, _toast, input) {
            snapshot.dueIso = input.value;
          },
        ]);
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "recTasks2",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title: "Recurring Task",
          message: promptMessage,
          inputs,
          buttons: [
            [
              "<button>Save</button>",
              (instance, toastEl, _button, _event, inputs) => {
                const repeatValue = inputs?.[indexes.repeat]?.value?.trim();
                if (!repeatValue) {
                  toast("Repeat rule is required.");
                  inputs?.[indexes.repeat]?.focus?.();
                  return;
                }
                const dueIso = inputs?.[indexes.due]?.value?.trim() || "";
                const taskValue =
                  includeTaskText && indexes.task != null
                    ? (inputs?.[indexes.task]?.value || "").trim()
                    : undefined;
                const normalizedRepeat = normalizeRepeatRuleText(repeatValue) || repeatValue;
                let dueText = null;
                let dueDate = null;
                if (dueIso) {
                  dueDate = parseRoamDate(dueIso);
                  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
                    toast("Couldn't parse that date.");
                    inputs?.[indexes.due]?.focus?.();
                    return;
                  }
                  dueText = dueIso;
                }
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish({
                  repeat: normalizedRepeat,
                  repeatRaw: repeatValue,
                  due: dueText,
                  dueDate,
                  taskText: includeTaskText ? taskValue : undefined,
                });
              },
              true,
            ],
            [
              "<button>Cancel</button>",
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish(null);
              },
            ],
          ],
          onClosed: () => finish(null),
        });
      });
    }

    function handleAttributeSurfaceChange(evtOrValue) {
      const prev = lastAttrSurface || extensionAPI.settings.get("rt-attribute-surface") || "Hidden";
      let next =
        typeof evtOrValue === "string"
          ? evtOrValue
          : evtOrValue?.target?.value || extensionAPI.settings.get("rt-attribute-surface") || "Hidden";
      if (next === lastAttrSurface) {
        if (next === "Hidden") void syncPillsForSurface(next);
        return;
      }
      if (prev === "Child" && next === "Hidden") {
        migratingChildToHidden = true;
      }
      lastAttrSurface = next;
      if (pendingSurfaceSync) {
        clearTimeout(pendingSurfaceSync);
        pendingSurfaceSync = null;
      }
      void syncPillsForSurface(next);
      if (next === "Child") {
        void populateChildAttrsFromProps();
      }
    }

    function scheduleSurfaceSync(surface) {
      if (pendingSurfaceSync) clearTimeout(pendingSurfaceSync);
      pendingSurfaceSync = setTimeout(() => {
        pendingSurfaceSync = null;
        const current = lastAttrSurface || surface || "Child";
        void syncPillsForSurface(current);
        if (current === "Child") {
          void populateChildAttrsFromProps();
        }
      }, 0);
    }

    function clearAllPills(removeStyle = true) {
      document.querySelectorAll?.(".rt-pill-wrap")?.forEach((el) => el.remove());
      if (removeStyle) {
        const style = document.getElementById("rt-pill-style");
        if (style?.parentNode) style.parentNode.removeChild(style);
        const menuStyle = document.getElementById("rt-pill-menu-style");
        if (menuStyle?.parentNode) menuStyle.parentNode.removeChild(menuStyle);
      }
    }

    function ensurePillStyles() {
      if (document.getElementById("rt-pill-style")) return;
      const style = document.createElement("style");
      style.id = "rt-pill-style";
      style.textContent = `
        .rt-pill-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-left: 12px;
          flex-wrap: wrap;
        }
        .rt-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 12px;
          border: 1px solid var(--rt-pill-border, #ccc);
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease, border-color 0.15s ease;
          background: var(--rt-pill-bg, rgba(0, 0, 0, 0.03));
        }
        .rt-pill:hover {
          background: rgba(0,0,0,0.08);
          border-color: var(--rt-pill-border-hover, #bbb);
        }
        .rt-pill-inline {
          float: right;
        }
        .rt-pill-repeat,
        .rt-pill-due {
          cursor: pointer;
        }
        .rt-pill-menu-btn {
          margin-left: 6px;
          font-weight: 600;
          cursor: pointer;
          padding: 0 4px;
        }
        .rt-pill-menu-btn:hover {
          background: rgba(0,0,0,0.12);
        }
      `;
      document.head.appendChild(style);
    }

    async function syncPillsForSurface(surface) {
      if (!surface) return;
      if (surface === "Hidden") {
        clearAllPills(false);
        ensurePillStyles();
        const root = document.body || document;
        if (root) {
          try {
            const once = () => Promise.resolve(decorateBlockPills(root));
            await once();
            await new Promise((resolve) => requestAnimationFrame(() => once().then(resolve, resolve)));
            await new Promise((resolve) => setTimeout(() => once().then(resolve, resolve), 50));
          } catch (err) {
            console.warn("[RecurringTasks] pill decoration failed", err);
          }
        }
        migratingChildToHidden = false;
      } else {
        clearAllPills();
        if (surface === "Child") {
          void populateChildAttrsFromProps();
        }
      }
    }

    async function populateChildAttrsFromProps() {
      if (lastAttrSurface !== "Child" || childAttrMigrationRunning) return;
      childAttrMigrationRunning = true;
      try {
        const set = S();
        let rows = [];
        try {
          rows =
            (await window.roamAlphaAPI.q(`
              [:find (pull ?b [:block/uid :block/props {:block/children [:block/uid :block/string]}])
               :where
               [?b :block/props ?p]]`)) || [];
        } catch (err) {
          console.warn("[RecurringTasks] populateChildAttrsFromProps query failed", err);
          return;
        }
        for (const row of rows) {
          if (lastAttrSurface !== "Child") break;
          const block = row?.[0];
          const uid = block?.uid;
          if (!uid) continue;
          const props = parseProps(block.props);
          let repeatVal = typeof props.repeat === "string" && props.repeat ? props.repeat : null;
          let dueVal = typeof props.due === "string" && props.due ? props.due : null;
          try {
            const meta = await readRecurringMeta(block, set);
            if (!repeatVal && typeof meta?.repeat === "string" && meta.repeat) {
              repeatVal = meta.repeat;
            }
            if (!repeatVal && typeof meta?.props?.repeat === "string" && meta.props.repeat) {
              repeatVal = meta.props.repeat;
            }
            if (!repeatVal && typeof meta?.childAttrMap?.repeat?.value === "string") {
              repeatVal = meta.childAttrMap.repeat.value;
            }
            if (!dueVal && typeof meta?.props?.due === "string" && meta.props.due) {
              dueVal = meta.props.due;
            }
            if (!dueVal && meta?.due instanceof Date && !Number.isNaN(meta.due.getTime())) {
              dueVal = formatDate(meta.due, set);
            }
            if (!dueVal && typeof meta?.childAttrMap?.due?.value === "string") {
              dueVal = meta.childAttrMap.due.value;
            }
          } catch (err) {
            console.warn("[RecurringTasks] populateChildAttrsFromProps meta read failed", err);
          }
          if (!repeatVal && !dueVal) continue;
          try {
            if (repeatVal) {
              await ensureChildAttr(uid, "repeat", repeatVal);
            }
            if (dueVal) {
              await ensureChildAttr(uid, "due", dueVal);
            }
          } catch (err) {
            console.warn("[RecurringTasks] populateChildAttrsFromProps sync failed", err);
          }
        }
      } finally {
        childAttrMigrationRunning = false;
      }
    }

    async function decorateBlockPills(rootEl) {
      const selector = ".rm-block-main, .roam-block-container, .roam-block";
      const nodes = rootEl.matches?.(selector)
        ? [rootEl]
        : Array.from(rootEl.querySelectorAll?.(selector) || []);
      const seen = new Set();
      const set = S();
      if (set.attributeSurface !== "Hidden") return;
      ensurePillMenuStyles();
      for (const node of nodes) {
        try {
          const mainCandidate =
            node.classList?.contains("rm-block-main")
              ? node
              : node.closest?.(".rm-block-main") || node.querySelector?.(".rm-block-main");
          const main = mainCandidate || document.querySelector(`.rm-block-main[data-uid="${normalizeUid(node.getAttribute?.("data-uid") || node.dataset?.uid)}"]`);
          if (!main) continue;
          if (main.closest?.(".rm-code-block")) continue;

          const uid =
            findBlockUidFromElement(main) ||
            findBlockUidFromElement(node) ||
            normalizeUid(node.getAttribute?.("data-uid") || node.dataset?.uid);
          if (!uid) continue;
          if (pendingPillTimers.has(uid)) {
            clearTimeout(pendingPillTimers.get(uid));
            pendingPillTimers.delete(uid);
          }
          const schedule = (delay = 0) => {
            if (pendingPillTimers.has(uid)) {
              clearTimeout(pendingPillTimers.get(uid));
              pendingPillTimers.delete(uid);
            }
            const timer = setTimeout(() => {
              pendingPillTimers.delete(uid);
              void decorateBlockPills(main);
            }, delay);
            pendingPillTimers.set(uid, timer);
          };

          if (seen.has(uid)) {
            if (main.querySelector?.(".rt-pill-wrap")) continue;
            schedule(60);
            continue;
          }
          seen.add(uid);

          const isFocused = !!main.querySelector?.(".rm-block__input--active, .rm-block__input--focused");
          if (isFocused) {
            schedule(120);
          }

          const block = await getBlock(uid);
          if (!block) continue;
          if (isTaskInCodeBlock(block)) continue;

          const originalString = block.string;
          const props = parseProps(block.props);
          const meta = await readRecurringMeta(block, set);
          if (!meta.repeat) continue;
          const inlineAttrs = parseAttrsFromBlockText(block.string || "");

          if (set.attributeSurface === "Hidden") {
          const childRepeatVal = meta.childAttrMap?.repeat?.value || null;
          const childDueVal = meta.childAttrMap?.due?.value || null;
          const cameFromChildSurface = migratingChildToHidden && !!childRepeatVal;
          const inlineDueVal = inlineAttrs.due || null;
          const repeatSource =
            (typeof meta.repeat === "string" && meta.repeat) ||
            (typeof meta?.props?.repeat === "string" && meta.props.repeat) ||
            inlineAttrs.repeat ||
            meta.childAttrMap?.repeat?.value ||
            null;
          let dueSource = null;
          if (typeof meta?.props?.due === "string" && meta.props.due) {
            dueSource = meta.props.due;
          } else if (meta.due instanceof Date && !Number.isNaN(meta.due.getTime())) {
            dueSource = formatDate(meta.due, set);
          } else if (inlineAttrs.due) {
            dueSource = inlineAttrs.due;
          } else if (typeof meta.childAttrMap?.due?.value === "string" && meta.childAttrMap.due.value) {
            dueSource = meta.childAttrMap.due.value;
          }
          if (cameFromChildSurface && !childDueVal && !inlineDueVal) {
            dueSource = null;
            meta.due = null;
          }
          await updateBlockProps(uid, {
            repeat: repeatSource || undefined,
            due: dueSource || undefined,
          });
          if (repeatSource) meta.repeat = repeatSource;
          if (dueSource) {
            const parsed = parseRoamDate(dueSource);
            meta.due = parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : meta.due;
          } else if (cameFromChildSurface) {
            repeatOverrides.delete(uid);
            meta.due = null;
          }
          const cleaned = removeInlineAttributes(block.string || "", ["repeat", "due"]);
          if (cleaned !== block.string) {
            await updateBlockString(uid, cleaned);
            block.string = cleaned;
            schedule(0);       // next tick
            schedule(100);      // after first paint
            // schedule(200);  // later retry if lagging
          }
          await removeChildAttr(uid, "repeat");
          // Wait a beat so Roam registers the removal before due updates fire
          await delay(30);
          await removeChildAttr(uid, "due");
          const childAttrMap = { ...(meta.childAttrMap || {}) };
          delete childAttrMap.repeat;
          delete childAttrMap.due;
          meta.childAttrMap = childAttrMap;
        }

          const humanRepeat = meta.repeat || inlineAttrs.repeat || "";
          const dueDate = meta.due || null;
          const dueDisplay = dueDate ? formatFriendlyDate(dueDate, set) : null;
          const tooltip = dueDate
            ? `Next occurrence: ${formatIsoDate(dueDate, set)}`
            : "Recurring task";

          main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());

          const pillWrap = document.createElement("span");
          pillWrap.className = "rt-pill-wrap";
          pillWrap.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          pillWrap.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          let dueSpan = null;

          const pill = document.createElement("span");
          pill.className = "rt-pill";
          pill.title = tooltip;
          pill.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          pill.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const target = e.target;
            if (
              target === repeatSpan ||
              (dueSpan && target === dueSpan) ||
              target === menuBtn
            ) {
              return;
            }
            showPillMenu({ uid, set });
          });

          const repeatSpan = document.createElement("span");
          repeatSpan.className = "rt-pill-repeat";
          repeatSpan.textContent = `↻ ${humanRepeat}`;
          repeatSpan.title = `Repeat rule: ${humanRepeat}`;
          repeatSpan.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRepeatEdit(e, { uid, set, meta, span: repeatSpan });
          });

          pill.appendChild(repeatSpan);

          if (dueDisplay) {
            const sep = document.createElement("span");
            sep.className = "rt-pill-separator";
            sep.textContent = " · ";
            pill.appendChild(sep);

            dueSpan = document.createElement("span");
            dueSpan.className = "rt-pill-due";
            dueSpan.textContent = `Next: ${dueDisplay}`;
            dueSpan.title = tooltip;
            dueSpan.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDueClick(e, { uid, set, meta, span: dueSpan });
            });
            pill.appendChild(dueSpan);
          }

          const menuBtn = document.createElement("span");
          menuBtn.className = "rt-pill-menu-btn";
          menuBtn.textContent = "⋯";
          menuBtn.title = "More recurring task actions";
          menuBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPillMenu({ uid, set });
          });
          pill.appendChild(menuBtn);

          pillWrap.appendChild(pill);

          const check = main.querySelector?.(".check-container, .rm-checkbox") || main.firstElementChild;
          insertPillWrap(main, check, pillWrap);
        } catch (err) {
          console.warn("[RecurringTasks] decorate pill failed", err);
        }
      }
    }

    async function handleRepeatEdit(event, context) {
      const { uid, set, span } = context;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const current = meta.repeat || "";
      const priorDue = contextSnapshot.previousDueDate;
      if (event.altKey) {
        try {
          await navigator.clipboard?.writeText?.(current);
          toast("Repeat copied");
        } catch (err) {
          console.warn("[RecurringTasks] copy repeat failed", err);
        }
        return;
      }
      const next = await promptForValue({
        title: "Edit Repeat",
        message: "Update repeat rule",
        placeholder: "e.g. every Friday",
        initial: current,
      });
      if (!next || next === current) return;
      const normalized = normalizeRepeatRuleText(next) || next.trim();
      const rule = parseRuleText(normalized);
      const metaForCalc = { ...meta, repeat: normalized };
      const anchorMeta = { ...metaForCalc, due: metaForCalc.due || todayLocal() };
      let newDueDate = null;
      if (rule) {
        const anchorSet = { ...set, advanceFrom: "Due" };
        newDueDate = computeNextDue(anchorMeta, anchorSet, 0, rule);
      }
      const dueDateToPersist = newDueDate || priorDue || null;
      const updates = { repeat: normalized };
      if (dueDateToPersist) {
        updates.due = formatDate(dueDateToPersist, set);
      }
      await updateBlockProps(uid, updates);
      if (set.attributeSurface === "Child") {
        meta.childAttrMap = meta.childAttrMap || {};
        const repeatRes = await ensureChildAttr(uid, "repeat", normalized);
        meta.childAttrMap.repeat = { uid: repeatRes.uid, value: normalized };
        if (dueDateToPersist) {
          const dueRes = await ensureChildAttr(uid, "due", updates.due);
          meta.childAttrMap.due = { uid: dueRes.uid, value: updates.due };
        } else if (meta.childAttrMap.due) {
          await removeChildAttr(uid, "due");
          delete meta.childAttrMap.due;
        }
      }
      await ensureInlineAttribute(block, "repeat", normalized);
      if (dueDateToPersist) await ensureInlineAttribute(block, "due", updates.due);
      meta.repeat = normalized;
      meta.due = dueDateToPersist || null;
      mergeRepeatOverride(uid, { repeat: normalized, due: dueDateToPersist || null });
      const relocation = await relocateBlockForDue(block, dueDateToPersist || null, set, meta);
      span.textContent = `↻ ${normalized}`;
      span.title = `Repeat rule: ${normalized}`;
      const pill = span.closest(".rt-pill");
      if (pill) {
        const dueSpanEl = pill.querySelector(".rt-pill-due");
        if (dueDateToPersist && dueSpanEl) {
          const friendly = formatFriendlyDate(dueDateToPersist, set);
          const tooltip = `Next occurrence: ${formatIsoDate(dueDateToPersist, set)}`;
          dueSpanEl.textContent = `Next: ${friendly}`;
          dueSpanEl.title = tooltip;
          pill.title = tooltip;
        } else {
          pill.title = `Repeat rule: ${normalized}`;
        }
      }
      toast(`Repeat → ${normalized}`);
      const dueChanged =
        (priorDue ? priorDue.getTime() : null) !== (dueDateToPersist ? dueDateToPersist.getTime() : null);
      if (dueChanged || relocation.moved) {
        const message = dueDateToPersist
          ? `Next occurrence → [[${formatRoamDateTitle(dueDateToPersist)}]]`
          : "Next occurrence cleared";
        registerDueUndoAction({
          blockUid: uid,
          message,
          setSnapshot: { ...set },
          previousDueDate: priorDue ? new Date(priorDue.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: dueDateToPersist ? new Date(dueDateToPersist.getTime()) : null,
          newDueStr: dueDateToPersist ? formatDate(dueDateToPersist, set) : null,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function handleDueClick(event, context) {
      const { uid, set, span } = context;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const due = meta.due;
      if (!due) return;
      if (event.altKey || event.metaKey || event.ctrlKey) {
        const existing = formatIsoDate(due, set);
        const nextIso = await promptForDate({
          title: "Edit Due Date",
          message: "Select the next due date",
          initial: existing,
        });
        if (!nextIso) return;
        const parsed = parseRoamDate(nextIso);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
          toast("Couldn't parse that date.");
          return;
        }
        const nextStr = formatDate(parsed, set);
        await updateBlockProps(uid, { due: nextStr });
        let dueChildInfo = null;
        if (set.attributeSurface === "Child") {
          dueChildInfo = await ensureChildAttr(uid, "due", nextStr);
        }
        await ensureInlineAttribute(block, "due", nextStr);
        meta.due = parsed;
        if (set.attributeSurface === "Child") {
          meta.childAttrMap = meta.childAttrMap || {};
          meta.childAttrMap.due = { value: nextStr, uid: dueChildInfo?.uid || meta.childAttrMap.due?.uid || null };
        }
        mergeRepeatOverride(uid, { due: parsed });
        const relocation = await relocateBlockForDue(block, parsed, set, meta);
        span.textContent = `Next: ${formatFriendlyDate(parsed, set)}`;
        span.title = `Next occurrence: ${formatIsoDate(parsed, set)}`;
        const pill = span.closest(".rt-pill");
        if (pill) pill.title = span.title;
        const dueChanged =
          (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== parsed.getTime();
        if (dueChanged || relocation.moved) {
          registerDueUndoAction({
            blockUid: uid,
            message: `Due date changed to ${formatRoamDateTitle(parsed)}`,
            setSnapshot: { ...set },
            previousDueDate: contextSnapshot.previousDueDate ? new Date(contextSnapshot.previousDueDate.getTime()) : null,
            previousDueStr: contextSnapshot.previousDueStr || null,
            previousInlineDue: contextSnapshot.previousInlineDue,
            hadInlineDue: contextSnapshot.hadInlineDue,
            previousInlineRepeat: contextSnapshot.previousInlineRepeat,
            hadInlineRepeat: contextSnapshot.hadInlineRepeat,
            previousChildDue: contextSnapshot.previousChildDue,
            previousChildDueUid: contextSnapshot.previousChildDueUid || null,
            hadChildDue: contextSnapshot.hadChildDue,
            previousChildRepeat: contextSnapshot.previousChildRepeat,
            previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
            previousParentUid: contextSnapshot.previousParentUid,
            previousOrder: contextSnapshot.previousOrder,
            newDue: new Date(parsed.getTime()),
            newDueStr: nextStr,
            newParentUid: relocation.targetUid,
            wasMoved: relocation.moved,
            snapshot: contextSnapshot.snapshot,
          });
        }
        void syncPillsForSurface(lastAttrSurface);
        return;
      }
      if (event.shiftKey) {
        await snoozeDueByDays(uid, set, 1);
        return;
      }
      const dnpTitle = toDnpTitle(due);
      const dnpUid = await getOrCreatePageUid(dnpTitle);
      window.roamAlphaAPI.ui.mainWindow.openPage({ page: { uid: dnpUid } });
    }

    function ensurePillMenuStyles() {
      if (document.getElementById("rt-pill-menu-style")) return;
      const style = document.createElement("style");
      style.id = "rt-pill-menu-style";
      style.textContent = `
        .rt-pill-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 220px;
        }
        .rt-pill-menu button {
          all: unset;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 6px;
          background: rgba(0,0,0,0.05);
          transition: background 0.15s ease;
        }
        .rt-pill-menu button:hover {
          background: rgba(0,0,0,0.1);
        }
        .rt-pill-menu button[data-danger="1"] {
          color: #b00020;
          background: rgba(176,0,32,0.08);
        }
        .rt-pill-menu button[data-danger="1"]:hover {
          background: rgba(176,0,32,0.16);
        }
        .rt-pill-menu small {
          color: rgba(0,0,0,0.6);
        }
      `;
      document.head.appendChild(style);
    }

    function showPillMenu({ uid, set }) {
      const menuId = `rt-pill-menu-${uid}-${Date.now()}`;
      const html = `
        <div class="rt-pill-menu" id="${menuId}">
          <button data-action="snooze-1">Snooze +1 day</button>
         <button data-action="snooze-3">Snooze +3 days</button>
         <button data-action="snooze-next-mon">Snooze to next Monday</button>
         <button data-action="snooze-pick">Snooze (pick date)</button>
         <button data-action="skip">Skip this occurrence</button>
         <button data-action="generate">Generate next now</button>
          <button data-action="end" data-danger="1">End recurrence</button>
        </div>
      `;
      iziToast.show({
        theme: "light",
        color: "black",
        class: "recTasks",
        overlay: true,
        timeout: false,
        close: true,
        drag: false,
        message: html,
        position: "center",
        onOpening: (_instance, toastEl) => {
          const root = toastEl.querySelector(`#${menuId}`);
          if (!root) return;
          const cleanup = () => iziToast.hide({}, toastEl);
          const attach = (selector, handler) => {
            const btn = root.querySelector(selector);
            if (!btn) return;
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              cleanup();
              await handler();
            });
          };
          attach('[data-action="snooze-1"]', () => snoozeDueByDays(uid, set, 1));
          attach('[data-action="snooze-3"]', () => snoozeDueByDays(uid, set, 3));
          attach('[data-action="snooze-next-mon"]', () => snoozeToNextMonday(uid, set));
          attach('[data-action="snooze-pick"]', () => snoozePickDate(uid, set));
          attach('[data-action="skip"]', () => skipOccurrence(uid, set));
          attach('[data-action="generate"]', () => generateNextNow(uid, set));
          attach('[data-action="end"]', () => endRecurrence(uid, set));
        },
      });
    }

    async function snoozeDueByDays(uid, set, days) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const base = meta.due || todayLocal();
      const next = addDaysLocal(base, days);
      const nextStr = formatDate(next, set);
      await updateBlockProps(uid, { due: nextStr });
      let dueChildInfo = null;
      if (set.attributeSurface === "Child") {
        dueChildInfo = await ensureChildAttr(uid, "due", nextStr);
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap.due = { value: nextStr, uid: dueChildInfo?.uid || meta.childAttrMap.due?.uid || null };
      }
      await ensureInlineAttribute(block, "due", nextStr);
      meta.due = next;
      mergeRepeatOverride(uid, { due: next });
      const relocation = await relocateBlockForDue(block, next, set, meta);
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== next.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Snoozed to ${formatRoamDateTitle(next)}`,
          setSnapshot: { ...set },
          previousDueDate: contextSnapshot.previousDueDate
            ? new Date(contextSnapshot.previousDueDate.getTime())
            : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: new Date(next.getTime()),
          newDueStr: nextStr,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function snoozeToNextMonday(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      let base = meta.due || todayLocal();
      for (let i = 0; i < 7; i++) {
        base = addDaysLocal(base, 1);
        if (base.getDay() === 1) break;
      }
      const nextStr = formatDate(base, set);
      await updateBlockProps(uid, { due: nextStr });
      let dueChildInfo = null;
      if (set.attributeSurface === "Child") {
        dueChildInfo = await ensureChildAttr(uid, "due", nextStr);
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap.due = {
          value: nextStr,
          uid: dueChildInfo?.uid || meta.childAttrMap.due?.uid || null,
        };
      }
      await ensureInlineAttribute(block, "due", nextStr);
      meta.due = base;
      mergeRepeatOverride(uid, { due: base });
      const relocation = await relocateBlockForDue(block, base, set, meta);
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== base.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Due date changed to ${formatRoamDateTitle(base)}`,
          setSnapshot: { ...set },
          previousDueDate: contextSnapshot.previousDueDate ? new Date(contextSnapshot.previousDueDate.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: new Date(base.getTime()),
          newDueStr: nextStr,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function snoozePickDate(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const initial = meta.due ? formatIsoDate(meta.due, set) : "";
      const nextIso = await promptForDate({
        title: "Snooze until",
        message: "Select the date to resume this task",
        initial,
      });
      if (!nextIso) return;
      const parsed = parseRoamDate(nextIso);
      if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        toast("Couldn't parse that date.");
        return;
      }
      const nextStr = formatDate(parsed, set);
      await updateBlockProps(uid, { due: nextStr });
      let dueChildInfo = null;
      if (set.attributeSurface === "Child") {
        dueChildInfo = await ensureChildAttr(uid, "due", nextStr);
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap.due = {
          value: nextStr,
          uid: dueChildInfo?.uid || meta.childAttrMap.due?.uid || null,
        };
      }
      await ensureInlineAttribute(block, "due", nextStr);
      meta.due = parsed;
      mergeRepeatOverride(uid, { due: parsed });
      const relocation = await relocateBlockForDue(block, parsed, set, meta);
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== parsed.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Due date changed to ${formatRoamDateTitle(parsed)}`,
          setSnapshot: { ...set },
          previousDueDate: contextSnapshot.previousDueDate ? new Date(contextSnapshot.previousDueDate.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: new Date(parsed.getTime()),
          newDueStr: nextStr,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function skipOccurrence(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      if (!meta.repeat) {
        toast("No repeat rule to skip.");
        return;
      }
      const nextDue = computeNextDue(meta, set);
      if (!nextDue) {
        toast("Could not compute the next occurrence.");
        return;
      }
      const nextStr = formatDate(nextDue, set);
      await updateBlockProps(uid, { due: nextStr });
      let dueChildInfo = null;
      if (set.attributeSurface === "Child") {
        dueChildInfo = await ensureChildAttr(uid, "due", nextStr);
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap.due = {
          value: nextStr,
          uid: dueChildInfo?.uid || meta.childAttrMap.due?.uid || null,
        };
      }
      await ensureInlineAttribute(block, "due", nextStr);
      meta.due = nextDue;
      mergeRepeatOverride(uid, { due: nextDue });
      const relocation = await relocateBlockForDue(block, nextDue, set, meta);
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== nextDue.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Skipped to ${formatRoamDateTitle(nextDue)}`,
          setSnapshot: { ...set },
          previousDueDate: contextSnapshot.previousDueDate ? new Date(contextSnapshot.previousDueDate.getTime()) : null,
          previousDueStr: contextSnapshot.previousDueStr || null,
          previousInlineDue: contextSnapshot.previousInlineDue,
          hadInlineDue: contextSnapshot.hadInlineDue,
          previousInlineRepeat: contextSnapshot.previousInlineRepeat,
          hadInlineRepeat: contextSnapshot.hadInlineRepeat,
          previousChildDue: contextSnapshot.previousChildDue,
          previousChildDueUid: contextSnapshot.previousChildDueUid || null,
          hadChildDue: contextSnapshot.hadChildDue,
          previousChildRepeat: contextSnapshot.previousChildRepeat,
          previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
          previousParentUid: contextSnapshot.previousParentUid,
          previousOrder: contextSnapshot.previousOrder,
          newDue: new Date(nextDue.getTime()),
          newDueStr: nextStr,
          newParentUid: relocation.targetUid,
          wasMoved: relocation.moved,
          snapshot: contextSnapshot.snapshot,
        });
      }
      void syncPillsForSurface(lastAttrSurface);
    }

    async function generateNextNow(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      if (!meta.repeat) {
        toast("No repeat rule found.");
        return;
      }
      const nextDue = computeNextDue(meta, set);
      if (!nextDue) {
        toast("Could not compute the next occurrence.");
        return;
      }
      const newUid = await spawnNextOccurrence(block, meta, nextDue, set);
      toast(`Next occurrence created (${formatRoamDateTitle(nextDue)})`);
      void syncPillsForSurface(lastAttrSurface);
      return newUid;
    }

    async function endRecurrence(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const props = parseProps(block.props);
      delete props.repeat;
      delete props.due;
      if (props.rt) {
        delete props.rt.id;
        delete props.rt.parent;
        delete props.rt.lastCompleted;
        delete props.rt.processed;
        delete props.rt.tz;
      }
      await setBlockProps(uid, props);
      if (set.attributeSurface === "Child") {
        const childMap = parseAttrsFromChildBlocks(block.children || []);
        for (const key of ["repeat", "due", "rt-processed"]) {
          const info = childMap[key];
          if (info?.uid) {
            try {
              const targetUid = info.uid.trim();
              if (!targetUid) continue;
              const exists = await getBlock(targetUid);
              if (!exists) continue;
              await deleteBlock(targetUid);
            } catch (err) {
              console.warn("[RecurringTasks] failed to remove child attr", err);
            }
          }
        }
      }
      const cleaned = removeInlineAttributes(block.string || "", ["repeat", "due"]);
      if (cleaned !== block.string) {
        await updateBlockString(uid, cleaned);
      }
      repeatOverrides.delete(uid);
      registerDueUndoAction({
        blockUid: uid,
        message: "Recurrence ended",
        setSnapshot: { ...set },
        previousDueDate: contextSnapshot.previousDueDate || null,
        previousDueStr: contextSnapshot.previousDueStr || null,
        previousInlineDue: contextSnapshot.previousInlineDue,
        hadInlineDue: contextSnapshot.hadInlineDue,
        previousInlineRepeat: contextSnapshot.previousInlineRepeat,
        hadInlineRepeat: contextSnapshot.hadInlineRepeat,
        previousChildDue: contextSnapshot.previousChildDue,
        previousChildDueUid: contextSnapshot.previousChildDueUid || null,
        hadChildDue: contextSnapshot.hadChildDue,
        previousChildRepeat: contextSnapshot.previousChildRepeat,
        previousChildRepeatUid: contextSnapshot.previousChildRepeatUid || null,
        previousParentUid: contextSnapshot.previousParentUid,
        previousOrder: contextSnapshot.previousOrder,
        newDue: null,
        newDueStr: null,
        newParentUid: contextSnapshot.previousParentUid,
        wasMoved: false,
        snapshot: contextSnapshot.snapshot,
      });
      void syncPillsForSurface(lastAttrSurface);
    }

    // possible future feature: view series history
    /* 
    async function openSeriesHistory(uid, set) {
      const history = await fetchSeriesHistory(uid);
      if (!history.length) {
        toast("No series history available.");
        return;
      }
      const html = history
        .map((item) => {
          const pageTitle = item.page?.title || item.page?.["node/title"] || "Unknown page";
          const snippet = (item.string || "").replace(/\n+/g, " ").slice(0, 120);
          const props = parseProps(item.props);
          const due = props.due || "";
          return `<button data-uid="${item.uid}">${escapeHtml(snippet)}<br/><small>${escapeHtml(
            pageTitle
          )}${due ? " · Due " + escapeHtml(due) : ""}</small></button>`;
        })
        .join("");
      const menuId = `rt-series-${uid}-${Date.now()}`;
      iziToast.show({
        theme: "light",
        color: "black",
        class: "recTasks",
        overlay: true,
        timeout: false,
        close: true,
        message: `<div class="rt-pill-menu" id="${menuId}">${html}</div>`,
        position: "center",
        onOpening: (_instance, toastEl) => {
          const root = toastEl.querySelector(`#${menuId}`);
          if (!root) return;
          root.querySelectorAll("button[data-uid]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const targetUid = btn.getAttribute("data-uid");
              if (targetUid) {
                window.roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid: targetUid } });
              }
            });
          });
        },
      });
    }

    async function fetchSeriesHistory(uid) {
      const out = [];
      const visited = new Set();
      let current = uid;
      while (current && !visited.has(current)) {
        visited.add(current);
        const block = await getBlock(current);
        if (!block) break;
        out.push(block);
        const props = parseProps(block.props);
        const parent = props.rt?.parent || null;
        current = parent;
      }
      return out;
    }
    */

    function formatFriendlyDate(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      try {
        const fmt = new Intl.DateTimeFormat(set.locale || undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: set.timezone || undefined,
        });
        return fmt.format(date);
      } catch {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
          date.getDate()
        ).padStart(2, "0")}`;
      }
    }

    function formatIsoDate(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const tzDate = new Date(date.getTime());
      if (set.timezone && typeof Intl === "object" && Intl.DateTimeFormat) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: set.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(tzDate);
        const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        if (map.year && map.month && map.day) {
          return `${map.year}-${map.month}-${map.day}`;
        }
      }
      return `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, "0")}-${String(
        tzDate.getDate()
      ).padStart(2, "0")}`;
    }

    function formatRoamDateTitle(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const util = window.roamAlphaAPI?.util;
      if (util?.dateToPageTitle) {
        try {
          return util.dateToPageTitle(date);
        } catch (err) {
          console.warn("[RecurringTasks] dateToPageTitle failed, falling back to friendly", err);
        }
      }
      const year = date.getFullYear();
      const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
      return `${month} ${ordinalSuffix(date.getDate())}, ${year}`;
    }

    function ordinalSuffix(n) {
      const rem10 = n % 10;
      const rem100 = n % 100;
      if (rem10 === 1 && rem100 !== 11) return `${n}st`;
      if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
      if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
      return `${n}th`;
    }

    function isTaskInCodeBlock(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      if (text.startsWith("```") || text.startsWith("{{[[code]]}}") || text.startsWith("<code")) {
        return true;
      }
      return false;
    }

    function insertPillWrap(main, check, pillWrap) {
      const inputContainer = main.querySelector?.(".rm-block__input");
      const inlineText =
        inputContainer && inputContainer.tagName !== "TEXTAREA"
          ? inputContainer.firstElementChild
          : null;
      const autocompleteWrapper = main.querySelector?.(".rm-autocomplete__wrapper");
      if (inlineText && inlineText.nodeType === 1) {
        inlineText.appendChild(pillWrap);
        pillWrap.classList.add("rt-pill-inline");
        return;
      }
      if (inputContainer && inputContainer.tagName !== "TEXTAREA" && !pillWrap.isConnected) {
        inputContainer.appendChild(pillWrap);
        pillWrap.classList.add("rt-pill-inline");
        return;
      }
      if (autocompleteWrapper?.parentNode && !pillWrap.isConnected) {
        autocompleteWrapper.parentNode.insertBefore(pillWrap, autocompleteWrapper.nextSibling);
        return;
      }
      if (check?.parentNode && !pillWrap.isConnected) {
        check.parentNode.appendChild(pillWrap);
        return;
      }
      if (!pillWrap.isConnected) {
        main.appendChild(pillWrap);
      }
    }

    // ========================= Child -> Props sync core =========================
    async function handleAnyEdit(evt) {
      // Only relevant when attributes are surfaced as child blocks
      const set = S();
      if (set.attributeSurface !== "Child") return;

      const uid = findBlockUidFromElement(evt.target);
      if (!uid) return;

      // Is this block a "repeat:: ..." or "due:: ..." child?
      const child = await getBlock(uid);
      const line = (child?.string || "").trim();
      const m = line.match(ATTR_RE);
      if (!m) return;

      const key = m[1].trim().toLowerCase();
      if (key !== "repeat" && key !== "due") return;

      // Get parent task uid
      const parentUid = await getParentUid(uid);
      if (!parentUid) return;

      // Debounce per parent to avoid thrashing while typing, remember source event
      if (childEditDebounce.has(parentUid)) clearTimeout(childEditDebounce.get(parentUid));
      const srcType = evt.type;
      childEditDebounce.set(parentUid, setTimeout(() => {
        childEditDebounce.delete(parentUid);
        void syncChildAttrToParent(parentUid, key, { sourceEvent: srcType });
      }, srcType === "blur" ? 0 : 250));
    }

    async function getParentUid(childUid) {
      const res = await window.roamAlphaAPI.q(`
        [:find ?puid
         :where
         [?c :block/uid "${childUid}"]
         [?c :block/parents ?p]
         [?p :block/uid ?puid]]`);
      return res?.[0]?.[0] || null;
    }

    async function syncChildAttrToParent(parentUid, key, opts = {}) {
      const sourceEvent = opts?.sourceEvent || "input";
      const set = S();
      const parent = await getBlock(parentUid);
      if (!parent) return;
      if (deletingChildAttrs.has(`${parentUid}::${key}`)) {
        return;
      }

      // read current child values
      const childMap = parseAttrsFromChildBlocks(parent.children || []);
      const info = childMap[key];
      const rawValue = (info?.value || "").trim();

      // If empty, only remove after a blur (don't spam while user is typing).
      if (!rawValue) {
        if (sourceEvent !== "blur") {
          return; // wait until editing finishes
        }
        const props = parseProps(parent.props);
        if (props[key] !== undefined) {
          delete props[key];
          await setBlockProps(parentUid, props);
        }
        await ensureInlineAttribute(parent, key, ""); // no-op unless inline exists
        // Quietly remove on blur; no toast to avoid noise.
        void syncPillsForSurface(lastAttrSurface);
        return;
      }

      // Normalize and write to props
      if (key === "repeat") {
        const normalized = normalizeRepeatRuleText(rawValue) || rawValue;
        const props = parseProps(parent.props);
        if (props.repeat !== normalized) {
          try {
            await updateBlockProps(parentUid, { repeat: normalized });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent repeat update failed", err);
            return;
          }
          const existingChildUid = typeof info?.uid === "string" ? info.uid.trim() : "";
          if (!existingChildUid) {
            await ensureChildAttr(parentUid, "repeat", normalized);
          }
          await ensureInlineAttribute(parent, "repeat", normalized);
          toast(`Repeat → ${normalized}`);
        }
      } else if (key === "due") {
        const props = parseProps(parent.props);
        if (props.due !== rawValue) {
          try {
            await updateBlockProps(parentUid, { due: rawValue });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent due update failed", err);
            return;
          }
          const existingChildUid = typeof info?.uid === "string" ? info.uid.trim() : "";
          if (!existingChildUid) {
            await ensureChildAttr(parentUid, "due", rawValue);
          }
          await ensureInlineAttribute(parent, "due", rawValue);
          toast(`Due → ${rawValue}`);
        }
      }

      // Refresh pills if needed
      void syncPillsForSurface(lastAttrSurface);
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
    };

    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label: "Convert TODO to Recurring Task" });
  },
};
