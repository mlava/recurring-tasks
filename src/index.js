import iziToast from "izitoast";
import { createRoot } from "react-dom/client";
import DashboardApp from "./dashboard/App";

const DEFAULT_REPEAT_ATTR = "BT_attrRepeat";
const DEFAULT_START_ATTR = "BT_attrStart";
const DEFAULT_DEFER_ATTR = "BT_attrDefer";
const DEFAULT_DUE_ATTR = "BT_attrDue";
const DEFAULT_COMPLETED_ATTR = "BT_attrCompleted";
const ADVANCE_ATTR = "BT_attrAdvance";
const INSTALL_TOAST_KEY = "rt-intro-toast";
const AI_MODE_SETTING = "bt-ai-mode";
const AI_KEY_SETTING = "bt-ai-openai-key";
const AI_MODE_OPTIONS = ["Off", "Use my OpenAI key"];
const AI_MODEL = "gpt-4o-mini";
const AI_SYSTEM_PROMPT = [
  "You are a strict JSON generator for task parsing. Return ONLY JSON with no prose.",
  'Required: { "title": string }',
  'Optional: "repeatRule", "dueDateText", "startDateText", "deferDateText", "project", "context", "priority", "energy".',
  'priority/energy must be one of: "low", "medium", "high", or null.',
  "Dates: prefer Roam page links like [[November 18th, 2025]]; if unsure, use short phrases like \"next Monday\" (not bare weekday names).",
  "If you see time (e.g., 3pm), include it only in dueDateText/startDateText (e.g., \"next Wednesday at 3pm\").",
  "For wording that implies when work can start (beginning/starting/available/from/after), use startDateText; for deadlines (by/before/due), use dueDateText; for postponement, use deferDateText.",
  "For vague spans like \"this week/this weekend/this month/this quarter\", prefer concrete dates (start of span for startDateText, end of span for dueDateText when only one date is given).",
  "Please consider words like every, each, daily, weekly, monthly, yearly, annually, weekdays, weekends, biweekly, fortnightly, quarterly, semiannual(ly), semi-annual(ly), twice a year, every N days/weeks/months/years as indicators of repeat rules.",
  "Keep scheduling details (repeat/dates) OUT of the title; place them only in repeatRule/dueDateText/startDateText/deferDateText. The title should just be the task text.",
  "Do not invent details not implied.",
  'If input lacks a clear task title, set "title" to the original input.',
].join(" ");
const START_ICON = "⏱";
const DEFER_ICON = "⏳";
const DUE_ICON = "📅";
const WEEK_START_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PARENT_WRITE_DELAY_MS = 120;
const TOAST_HIDE_DELAY_MS = 120;
const DASHBOARD_TOPBAR_BUTTON_ID = "bt-dashboard-button";

let lastAttrNames = null;
let activeDashboardController = null;
const dashboardWatchers = new Map();
let topbarButtonObserver = null;
let themeObserver = null;
let themeSyncTimer = null;
let lastThemeSample = null;
let themeStyleObserver = null;

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
const ORD_MAP = { "1st": 1, "first": 1, "2nd": 2, "second": 2, "3rd": 3, "third": 3, "4th": 4, "fourth": 4, "last": -1 };
const DOW_ALIASES = {
  su: "sunday",
  sun: "sunday",
  sunday: "sunday",
  mo: "monday",
  mon: "monday",
  monday: "monday",
  tu: "tuesday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  we: "wednesday",
  wed: "wednesday",
  wednesday: "wednesday",
  th: "thursday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fr: "friday",
  fri: "friday",
  friday: "friday",
  sa: "saturday",
  sat: "saturday",
  saturday: "saturday",
};
const DOW_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DEFAULT_WEEK_START_CODE = "MO";
const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_KEYWORD_INTERVAL_LOOKUP = {
  quarterly: 3,
  "every quarter": 3,
  semiannual: 6,
  "semi annual": 6,
  semiannually: 6,
  "semi annually": 6,
  "semi-annual": 6,
  "semi-annually": 6,
  "twice a year": 6,
  "twice-a-year": 6,
  "twice per year": 6,
  "twice-per-year": 6,
};

export default {
  onload: ({ extensionAPI }) => {
    const config = {
      tabTitle: "Better Tasks",
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
          id: "rt-repeat-attr",
          name: "Repeat attribute name",
          description: "Label for the recurrence rule attribute",
          action: { type: "input", placeholder: DEFAULT_REPEAT_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-start-attr",
          name: "Start attribute name",
          description: "Label for start/available date attribute",
          action: { type: "input", placeholder: DEFAULT_START_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-defer-attr",
          name: "Defer attribute name",
          description: "Label for defer/snooze date attribute",
          action: { type: "input", placeholder: DEFAULT_DEFER_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-due-attr",
          name: "Due attribute name",
          description: "Label for due date attribute",
          action: { type: "input", placeholder: DEFAULT_DUE_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-completed-attr",
          name: "Completed attribute name",
          description: "Label written when a recurring/scheduled task is completed",
          action: { type: "input", placeholder: DEFAULT_COMPLETED_ATTR, onChange: handleAttributeNameChange },
        },
        {
          id: "rt-confirm",
          name: "Confirm before spawning next task",
          description: "Ask for confirmation before spawning when a repeating Better Task is completed",
          action: { type: "switch" },
        },
        {
          id: "rt-week-start",
          name: "First day of the week",
          description: "Used to align weekly schedules with your graph preference",
          action: { type: "select", items: WEEK_START_OPTIONS },
        },
        {
          id: AI_MODE_SETTING,
          name: "AI parsing mode",
          description: "Optional: use your OpenAI API key for AI-assisted task parsing",
          action: { type: "select", items: AI_MODE_OPTIONS },
        },
        {
          id: AI_KEY_SETTING,
          name: "OpenAI API key",
          description: "Sensitive: stored in Roam settings; used client-side only for AI parsing",
          action: { type: "input", placeholder: "sk-...", onChange: () => { } },
        },
      ],
    };
    extensionAPI.settings.panel.create(config);
    lastAttrNames = resolveAttributeNames();

    const introSeen = extensionAPI.settings.get(INSTALL_TOAST_KEY);
    if (!introSeen) {
      toast(
        "This extension automatically recognises {{[[TODO]]}} tasks in your graph and uses attributes to determine a recurrence pattern and due date. By default, it uses 'BT_attrRepeat' and 'BT_attrDue' as those attributes. These can be changed in the extension settings.<BR><BR>If you already happen to use 'BT_attrRepeat' and/or 'BT_attrDue' attributes for other functions in your graph, please change the defaults in Roam Depot Settings for this extension BEFORE testing it's functionality to avoid any unexpected behaviour."
      );
      extensionAPI.settings.set(INSTALL_TOAST_KEY, "1");
    }

    extensionAPI.ui.commandPalette.addCommand({
      label: "Convert TODO to Better Task",
      callback: () => convertTODO(null),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Convert TODO to Better Task",
      callback: (e) => convertTODO(e),
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: "Create a Better Task",
      callback: () => createBetterTaskEntryPoint(),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Create a Better Task",
      callback: (e) => createBetterTaskEntryPoint(e),
    });

    activeDashboardController = createDashboardController(extensionAPI);
    extensionAPI.ui.commandPalette.addCommand({
      label: "Toggle Better Tasks Dashboard",
      callback: () => activeDashboardController.toggle(),
    });
    ensureDashboardTopbarButton();
    observeTopbarButton();
    observeThemeChanges();

    // Placeholder for future feature - deconvert Better Tasks TODOs
    /* 
    extensionAPI.ui.commandPalette.addCommand({
      label: "Convert Better Task to plain TODO",
      callback: () => disableRecTODO(null),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Convert Better Task to plain TODO",
      callback: (e) => disableRecTODO(e),
    });
    */

    async function convertTODO(e) {
      let fuid = null;
      if (e && e["block-uid"]) {
        fuid = e["block-uid"];
      } else {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        fuid = focused && focused["block-uid"];
        if (!fuid) {
          toast("Place the cursor in the block you wish to convert.");
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
      const attrNames = resolveAttributeNames();
      const childRepeatEntry = pickChildAttr(childAttrs, attrNames.repeatAliases);
      const childDueEntry = pickChildAttr(childAttrs, attrNames.dueAliases);
      const childStartEntry = pickChildAttr(childAttrs, attrNames.startAliases);
      const childDeferEntry = pickChildAttr(childAttrs, attrNames.deferAliases);
      const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
        ]),
      ];
      const baseWithoutAttrs = removeInlineAttributes(fstring, removalKeys);
      const initialTaskText = baseWithoutAttrs.trim();

      const promptResult = await promptForRepeatAndDue({
        includeTaskText: true,
        forceTaskInput: true,
        taskText: initialTaskText,
        repeat: props.repeat || childRepeatEntry?.value || inlineRepeatVal || "",
        due: props.due || childDueEntry?.value || inlineDueVal || "",
        start: props.start || childStartEntry?.value || inlineStartVal || "",
        defer: props.defer || childDeferEntry?.value || inlineDeferVal || "",
      });
      if (!promptResult) return;

      const set = S(attrNames);
      const normalizedRepeat =
        promptResult.repeat ? normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat : "";
      if (normalizedRepeat && !parseRuleText(normalizedRepeat, set)) {
        toast("Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      const promptDueSource = promptResult.due || "";
      if (promptDueSource) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptDueSource);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast("Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const startSourceFromPrompt = promptResult.start || "";
      const startFallbackSource = props.start || childStartEntry?.value || inlineStartVal || "";
      const startSource = startSourceFromPrompt || startFallbackSource;
      let startDate = null;
      let startStr = null;
      if (startSource) {
        startDate =
          promptResult.startDate instanceof Date && startSourceFromPrompt
            ? new Date(promptResult.startDate.getTime())
            : parseRoamDate(startSource);
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
          toast("Couldn't parse that start date.");
          return;
        }
        startStr = formatDate(startDate, set);
      }

      const deferSourceFromPrompt = promptResult.defer || "";
      const deferFallbackSource = props.defer || childDeferEntry?.value || inlineDeferVal || "";
      const deferSource = deferSourceFromPrompt || deferFallbackSource;
      let deferDate = null;
      let deferStr = null;
      if (deferSource) {
        deferDate =
          promptResult.deferDate instanceof Date && deferSourceFromPrompt
            ? new Date(promptResult.deferDate.getTime())
            : parseRoamDate(deferSource);
        if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
          toast("Couldn't parse that defer date.");
          return;
        }
        deferStr = formatDate(deferDate, set);
      }

      const taskSource =
        typeof promptResult.taskText === "string" && promptResult.taskText
          ? promptResult.taskText
          : typeof promptResult.taskTextRaw === "string" && promptResult.taskTextRaw
            ? promptResult.taskTextRaw
            : initialTaskText;
      const cleanedTaskText = removeInlineAttributes(taskSource || "", removalKeys).trim();
      const todoString = normalizeToTodoMacro(cleanedTaskText);
      if (todoString !== fstring) {
        await updateBlockString(fuid, todoString);
      }

      const hasRepeat = !!normalizedRepeat;
      const hasTimingInput = !!(dueStr || startStr || deferStr);
      if (!hasRepeat && !hasTimingInput) {
        toast("Add a repeat rule or at least one start/defer/due date.");
        return;
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      await updateBlockProps(fuid, { rt: rtProps });

      const attrNamesForWrite = set.attrNames;
      if (hasRepeat) {
        await ensureChildAttrForType(fuid, "repeat", normalizedRepeat, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "repeat", attrNamesForWrite);
      }
      if (dueStr) {
        await ensureChildAttrForType(fuid, "due", dueStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "due", attrNamesForWrite);
      }
      if (startStr) {
        await ensureChildAttrForType(fuid, "start", startStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "start", attrNamesForWrite);
      }
      if (deferStr) {
        await ensureChildAttrForType(fuid, "defer", deferStr, attrNamesForWrite);
      } else {
        await removeChildAttrsForType(fuid, "defer", attrNamesForWrite);
      }

      repeatOverrides.delete(fuid);
      toast(hasRepeat ? "Created recurring TODO" : "Created scheduled TODO");
      scheduleSurfaceSync(set.attributeSurface);
    }

    async function createBetterTaskEntryPoint(e) {
      let targetUid = null;
      if (e && e["block-uid"]) {
        targetUid = e["block-uid"];
      } else {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        targetUid = focused && focused["block-uid"];
        if (!targetUid) {
          toast("Place the cursor in the block where you wish to create the Better Task.");
          return;
        }
      }

      const block = await getBlock(targetUid);
      if (!block) {
        toast("Unable to read the current block.");
        return;
      }

      let rawText = (block.string || "").trim();
      if (!rawText) {
        const input = await promptForValue({
          title: "Create a Better Task",
          message: "Enter task text",
          placeholder: "Task text",
          initial: "",
        });
        if (!input) return;
        rawText = input.trim();
        if (!rawText) {
          toast("Enter some task text.");
          return;
        }
        await updateBlockString(targetUid, input);
      }

      const attrNames = resolveAttributeNames();
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
          "completed",
        ]),
      ];
      const cleanedInput = removeInlineAttributes(rawText, removalKeys)
        .replace(/^\{\{\[\[(?:TODO|DONE)\]\]\}\}\s*/i, "")
        .trim();
      const aiInput = cleanedInput || rawText;

      const aiSettings = getAiSettings();
      if (isAiEnabled(aiSettings)) {
        const pending = showPersistentToast("Parsing task with AI…");
        let aiResult = null;
        try {
          aiResult = await parseTaskWithOpenAI(aiInput, aiSettings);
        } catch (err) {
          console.warn("[BetterTasks] AI parsing threw unexpectedly", err);
          aiResult = { ok: false, error: err };
        } finally {
          hideToastInstance(pending);
        }
        if (aiResult.ok) {
          const applied = await createTaskFromParsedJson(targetUid, aiResult.task, aiInput);
          if (applied) {
            toast("Created Better Task with AI parsing");
            return;
          }
        } else {
          console.warn("[BetterTasks] AI parsing unavailable", aiResult.error || aiResult.reason);
          if (aiResult.status === 429 || aiResult.code === "insufficient_quota") {
            toast(
              `AI parsing unavailable (429 from OpenAI). Check your billing/credit: https://platform.openai.com/settings/organization/billing/overview`
            );
          } else {
            toast("AI parsing unavailable, creating a normal Better Task instead.");
          }
        }
      }

      await createRecurringTODO(targetUid);
    }

    async function createRecurringTODO(fuid) {
      if (!fuid) {
        const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
        const fuid = focused && focused["block-uid"];
        if (fuid == null || fuid == undefined) {
          toast("Place the cursor in the block where you wish to create the TODO.");
          return;
        }
      }

      const block = await getBlock(fuid);
      if (!block) {
        toast("Unable to read the current block.");
        return;
      }

      const props = parseProps(block.props);
      const inlineAttrs = parseAttrsFromBlockText(block.string || "");
      const childAttrs = parseAttrsFromChildBlocks(block.children || []);
      const attrNames = resolveAttributeNames();
      const childRepeatEntry = pickChildAttr(childAttrs, attrNames.repeatAliases);
      const childDueEntry = pickChildAttr(childAttrs, attrNames.dueAliases);
      const childStartEntry = pickChildAttr(childAttrs, attrNames.startAliases);
      const childDeferEntry = pickChildAttr(childAttrs, attrNames.deferAliases);
      const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const removalKeys = [
        ...new Set([
          ...attrNames.repeatRemovalKeys,
          ...attrNames.dueRemovalKeys,
          ...attrNames.startRemovalKeys,
          ...attrNames.deferRemovalKeys,
        ]),
      ];
      const baseWithoutAttrs = removeInlineAttributes(block.string || "", removalKeys);
      const initialTaskText = baseWithoutAttrs.replace(/^\{\{\[\[(?:TODO|DONE)\]\]\}\}\s*/i, "").trim();
      const promptResult = await promptForRepeatAndDue({
        includeTaskText: true,
        forceTaskInput: true,
        taskText: initialTaskText,
        repeat: props.repeat || childRepeatEntry?.value || inlineRepeatVal || "",
        due: props.due || childDueEntry?.value || inlineDueVal || "",
        start: props.start || childStartEntry?.value || inlineStartVal || "",
        defer: props.defer || childDeferEntry?.value || inlineDeferVal || "",
      });
      if (!promptResult) return;

      const set = S(attrNames);
      const normalizedRepeat =
        promptResult.repeat ? normalizeRepeatRuleText(promptResult.repeat) || promptResult.repeat : "";
      if (normalizedRepeat && !parseRuleText(normalizedRepeat, set)) {
        toast("Unable to understand that repeat rule.");
        return;
      }

      let dueDate = null;
      let dueStr = null;
      const promptDueSource = promptResult.due || "";
      if (promptDueSource) {
        dueDate =
          promptResult.dueDate instanceof Date && !Number.isNaN(promptResult.dueDate.getTime())
            ? new Date(promptResult.dueDate.getTime())
            : parseRoamDate(promptDueSource);
        if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
          toast("Couldn't parse that due date.");
          return;
        }
        dueStr = formatDate(dueDate, set);
      }

      const startSourceFromPrompt = promptResult.start || "";
      const startFallbackSource = props.start || childStartEntry?.value || inlineStartVal || "";
      const startSource = startSourceFromPrompt || startFallbackSource;
      let startDate = null;
      let startStr = null;
      if (startSource) {
        startDate =
          promptResult.startDate instanceof Date && startSourceFromPrompt
            ? new Date(promptResult.startDate.getTime())
            : parseRoamDate(startSource);
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
          toast("Couldn't parse that start date.");
          return;
        }
        startStr = formatDate(startDate, set);
      }

      const deferSourceFromPrompt = promptResult.defer || "";
      const deferFallbackSource = props.defer || childDeferEntry?.value || inlineDeferVal || "";
      const deferSource = deferSourceFromPrompt || deferFallbackSource;
      let deferDate = null;
      let deferStr = null;
      if (deferSource) {
        deferDate =
          promptResult.deferDate instanceof Date && deferSourceFromPrompt
            ? new Date(promptResult.deferDate.getTime())
            : parseRoamDate(deferSource);
        if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
          toast("Couldn't parse that defer date.");
          return;
        }
        deferStr = formatDate(deferDate, set);
      }

      const hasRepeat = !!normalizedRepeat;
      const hasTimingInput = !!(dueStr || startStr || deferStr);
      if (!hasRepeat && !hasTimingInput) {
        toast("Add a repeat rule or at least one start/defer/due date.");
        return;
      }

      const taskTextInput =
        typeof promptResult.taskText === "string" && promptResult.taskText
          ? promptResult.taskText
          : typeof promptResult.taskTextRaw === "string" && promptResult.taskTextRaw
            ? promptResult.taskTextRaw
            : initialTaskText;
      const cleanedTaskText = removeInlineAttributes(taskTextInput || "", removalKeys).trim();
      const todoString = normalizeToTodoMacro(cleanedTaskText);
      if (todoString !== (block.string || "")) {
        await updateBlockString(fuid, todoString);
      }

      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;

      await updateBlockProps(fuid, { rt: rtProps });

      if (hasRepeat) await ensureChildAttrForType(fuid, "repeat", normalizedRepeat, set.attrNames);
      else await removeChildAttrsForType(fuid, "repeat", set.attrNames);
      if (dueStr) await ensureChildAttrForType(fuid, "due", dueStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "due", set.attrNames);
      if (startStr) await ensureChildAttrForType(fuid, "start", startStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "start", set.attrNames);
      if (deferStr) await ensureChildAttrForType(fuid, "defer", deferStr, set.attrNames);
      else await removeChildAttrsForType(fuid, "defer", set.attrNames);

      repeatOverrides.delete(fuid);
      toast(hasRepeat ? "Created your recurring TODO" : "Created your scheduled TODO");
      scheduleSurfaceSync(set.attributeSurface);
    }

    async function createTaskFromParsedJson(blockUid, parsed, rawInput = "") {
      if (!blockUid || !parsed) return false;
      const block = await getBlock(blockUid);
      if (!block) return false;
      const baseTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
      if (!baseTitle) return false;
      const cleanedTitle = stripSchedulingFromTitle(baseTitle, parsed);
      const attrNames = resolveAttributeNames();
      const set = S(attrNames);

      const todoString = normalizeToTodoMacro(cleanedTitle);
      if (todoString !== (block.string || "")) {
        await updateBlockString(blockUid, todoString);
      }

      let repeatVal = "";
      if (typeof parsed.repeatRule === "string" && parsed.repeatRule.trim()) {
        const normalizedRepeat = normalizeRepeatRuleText(parsed.repeatRule) || parsed.repeatRule.trim();
        if (parseRuleText(normalizedRepeat, set)) {
          repeatVal = normalizedRepeat;
        } else {
          console.warn("[BetterTasks] AI repeat rule invalid, ignoring", normalizedRepeat);
        }
      }

      const parseAndFormatDate = (value) => {
        if (typeof value !== "string" || !value.trim()) return null;
        const original = value.trim();
        const cleaned = stripTimeFromDateText(original);
        let dt = parseRoamDate(cleaned) || parseRelativeDateText(cleaned, set.weekStartCode);
        if (!dt && hasTimeOnlyHint(original)) {
          dt = pickAnchorDateFromTimeHint(original, set);
        }
        if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
        return formatDate(dt, set);
      };

      const weekendSpan = parseWeekendSpan(parsed.dueDateText || parsed.startDateText || "", set);
      const weekSpan = parseWeekSpan(parsed.dueDateText || parsed.startDateText || "", set);

      const dueStr =
        (weekendSpan?.due ? formatDate(weekendSpan.due, set) : null) ||
        (weekSpan?.due ? formatDate(weekSpan.due, set) : null) ||
        parseAndFormatDate(parsed.dueDateText);
      const startStr =
        (weekendSpan?.start ? formatDate(weekendSpan.start, set) : null) ||
        (weekSpan?.start ? formatDate(weekSpan.start, set) : null) ||
        parseAndFormatDate(parsed.startDateText);
      const deferStr = parseAndFormatDate(parsed.deferDateText);

      const props = parseProps(block.props);
      const rtProps = { ...(props.rt || {}) };
      if (!rtProps.id) rtProps.id = shortId();
      if (!rtProps.tz) rtProps.tz = set.timezone;
      await updateBlockProps(blockUid, { rt: rtProps });

      if (repeatVal) await ensureChildAttrForType(blockUid, "repeat", repeatVal, set.attrNames);
      else await removeChildAttrsForType(blockUid, "repeat", set.attrNames);
      if (dueStr) await ensureChildAttrForType(blockUid, "due", dueStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "due", set.attrNames);
      if (startStr) await ensureChildAttrForType(blockUid, "start", startStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "start", set.attrNames);
      if (deferStr) await ensureChildAttrForType(blockUid, "defer", deferStr, set.attrNames);
      else await removeChildAttrsForType(blockUid, "defer", set.attrNames);

      repeatOverrides.delete(blockUid);
      scheduleSurfaceSync(set.attributeSurface);
      return true;
    }

    function getWeekStartSetting() {
      const raw = extensionAPI.settings.get("rt-week-start");
      if (typeof raw === "string" && WEEK_START_OPTIONS.includes(raw)) return raw;
      return "Monday";
    }

    function enforceChildAttrSurface(api = extensionAPI) {
      try {
        const stored = api?.settings?.get("rt-attribute-surface");
        if (stored !== "Child") {
          api?.settings?.set("rt-attribute-surface", "Child");
        }
      } catch (err) {
        console.warn("[RecurringTasks] failed to enforce Child attribute surface", err);
      }
      return "Child";
    }

    function S(attrNamesOverride = null) {
      const attrSurface = enforceChildAttrSurface(extensionAPI);
      if (attrSurface !== lastAttrSurface) {
        lastAttrSurface = attrSurface;
        scheduleSurfaceSync(attrSurface);
      }
      const attrNames = attrNamesOverride || resolveAttributeNames();
      lastAttrNames = attrNames;
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
      const weekStartLabel = getWeekStartSetting();
      const weekStartCode = dowFromAlias(weekStartLabel) || "MO";
      return {
        destination: extensionAPI.settings.get("rt-destination") || "DNP",
        dnpHeading: extensionAPI.settings.get("rt-dnp-heading") || "Tasks",
        dateFormat: "ROAM",
        advanceFrom: "due",
        attributeSurface: attrSurface,
        confirmBeforeSpawn: !!extensionAPI.settings.get("rt-confirm"),
        timezone: tz,
        locale,
        attrNames,
        weekStart: weekStartLabel,
        weekStartCode,
      };
    }

    function getAiSettings() {
      const modeRaw = extensionAPI.settings.get(AI_MODE_SETTING);
      const mode = AI_MODE_OPTIONS.includes(modeRaw) ? modeRaw : "Off";
      const keyRaw = extensionAPI.settings.get(AI_KEY_SETTING);
      const apiKey = typeof keyRaw === "string" ? keyRaw.trim() : "";
      return { mode, apiKey };
    }

    function isAiEnabled(aiSettings) {
      return aiSettings?.mode === "Use my OpenAI key" && !!aiSettings.apiKey;
    }

    async function parseTaskWithOpenAI(input, aiSettings) {
      if (!isAiEnabled(aiSettings)) return { ok: false, reason: "disabled" };
      const payload = {
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      };
      // console.info("[BetterTasks] OpenAI request", {
      //   model: payload.model,
      //   messages: payload.messages?.map((m) => ({
      //     role: m.role,
      //     contentLength: m.content?.length,
      //     content: m.content,
      //   })),
      //   messageCount: payload.messages?.length,
      //   userLength: input?.length,
      //   response_format: payload.response_format,
      //   max_tokens: payload.max_tokens,
      // });
      let response = null;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${aiSettings.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn("[BetterTasks] OpenAI request failed", err);
        return { ok: false, error: err };
      }
      let responseBodyText = null;
      try {
        responseBodyText = await response.text();
      } catch (_) {
        // non-fatal
      }
      let parsedBody = null;
      try {
        parsedBody = responseBodyText ? JSON.parse(responseBodyText) : null;
      } catch (_) {
        // leave parsedBody null
      }
      let parsedContent = null;
      try {
        const contentRaw = parsedBody?.choices?.[0]?.message?.content;
        parsedContent = contentRaw ? JSON.parse(contentRaw) : null;
      } catch (_) {
        parsedContent = null;
      }
      // console.info("[BetterTasks] OpenAI response", {
      //   status: response?.status,
      //   ok: response?.ok,
      //   body: parsedBody ?? responseBodyText,
      //   contentJson: parsedContent,
      // });
      if (!response || !response.ok) {
        let errorText = null;
        let errorJson = null;
        try {
          errorText = responseBodyText;
          errorJson = parsedBody || JSON.parse(errorText || "{}");
        } catch (_) {
          // ignore parse issues
        }
        const message =
          errorJson?.error?.message || errorText || `OpenAI response ${response?.status || "unknown"}`;
        const code = errorJson?.error?.code || errorJson?.error?.type || null;
        return {
          ok: false,
          error: new Error(message),
          status: response?.status,
          code,
        };
      }
      const data = parsedBody;
      if (!data) {
        return { ok: false, error: new Error("Empty response body") };
      }
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return { ok: false, error: new Error("Empty response") };
      }
      let parsed = null;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return { ok: false, error: err };
      }
      const validated = validateParsedTask(parsed);
      if (!validated.ok) return validated;
      return validated;
    }

    function validateParsedTask(raw) {
      if (!raw || typeof raw !== "object") return { ok: false, error: new Error("Invalid JSON shape") };
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!title) return { ok: false, error: new Error("Missing title") };
      const task = { title };
      if (typeof raw.repeatRule === "string" && raw.repeatRule.trim()) task.repeatRule = raw.repeatRule.trim();
      if (typeof raw.dueDateText === "string" && raw.dueDateText.trim()) task.dueDateText = raw.dueDateText.trim();
      if (typeof raw.startDateText === "string" && raw.startDateText.trim()) task.startDateText = raw.startDateText.trim();
      if (typeof raw.deferDateText === "string" && raw.deferDateText.trim()) task.deferDateText = raw.deferDateText.trim();
      if (typeof raw.project === "string" && raw.project.trim()) task.project = raw.project.trim();
      if (typeof raw.context === "string" && raw.context.trim()) task.context = raw.context.trim();
      const allowedRatings = new Set(["low", "medium", "high"]);
      if (typeof raw.priority === "string" && allowedRatings.has(raw.priority)) task.priority = raw.priority;
      if (raw.priority === null) task.priority = null;
      if (typeof raw.energy === "string" && allowedRatings.has(raw.energy)) task.energy = raw.energy;
      if (raw.energy === null) task.energy = null;
      return { ok: true, task };
    }

    function stripSchedulingFromTitle(title, parsed) {
      const hasRepeat = typeof parsed?.repeatRule === "string" && parsed.repeatRule.trim();
      const hasDate =
        typeof parsed?.dueDateText === "string" && parsed.dueDateText.trim() ||
        typeof parsed?.startDateText === "string" && parsed.startDateText.trim() ||
        typeof parsed?.deferDateText === "string" && parsed.deferDateText.trim();
      let t = (title || "").trim();
      if (!t) return t;
      if (hasRepeat) {
        t = t.replace(/,\s*every\b.+$/i, "").trim();
        t = t.replace(/\bevery\s+.+$/i, "").trim();
        // Only drop bare cadence words when they are effectively trailing schedule hints (optionally with at/on ...)
        t = t.replace(/\b(daily|weekly|monthly|yearly|annually|weekdays|weekends)\b\s*(?:(?:at|on)\b.*)?$/i, "").trim();
      }
      if (hasDate) {
        t = t.replace(/\s*(on|by|due|for)\s+(tomorrow|today|next\s+[a-z]+|this\s+[a-z]+)$/i, "").trim();
        t = t.replace(/\s*(on\s+)?\[\[[^\]]+\]\]\s*$/i, "").trim();
        t = t.replace(/\s*(tomorrow|today|next\s+[a-z]+)$/i, "").trim();
      }
      return t || (title || "").trim();
    }

    const processedMap = new Map();
    const repeatOverrides = new Map();
    const invalidRepeatToasted = new Set();
    const invalidDueToasted = new Set();
    const deletingChildAttrs = new Set();

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
      const attrNames = set?.attrNames || resolveAttributeNames();
      const attrSurface = set?.attributeSurface || "Child";
      const dueInfo = pickChildAttr(childMap, attrNames.dueAliases, { allowFallback: false }) || null;
      const repeatInfo = pickChildAttr(childMap, attrNames.repeatAliases, { allowFallback: false }) || null;
      const inlineDueValue = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineRepeatValue = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
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
        previousInlineDue: inlineDueValue || null,
        hadInlineDue: inlineDueValue != null,
        previousChildDue: dueInfo?.value || null,
        hadChildDue: !!dueInfo,
        previousChildDueUid: dueInfo?.uid || null,
        previousChildRepeat: repeatInfo?.value || null,
        previousChildRepeatUid: repeatInfo?.uid || null,
        previousParentUid: location.parentUid,
        previousOrder: location.order,
        previousProps: props && typeof props === "object" ? clonePlain(props) : {},
        previousInlineRepeat: inlineRepeatValue || null,
        hadInlineRepeat: inlineRepeatValue != null,
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
        class: "betterTasks",
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

          // Clear current attrs first to avoid duplicates
          await removeChildAttrsForType(uid, "repeat", set.attrNames);
          await removeChildAttrsForType(uid, "due", set.attrNames);
          await removeChildAttr(uid, "rt-processed");
          const childAttrs = snapshot.childAttrs || {};
          if (childAttrs.repeat?.value != null && childAttrs.repeat.value !== "") {
            await ensureChildAttrForType(uid, "repeat", childAttrs.repeat.value, set.attrNames);
          }
          if (childAttrs.due?.value != null && childAttrs.due.value !== "") {
            await ensureChildAttrForType(uid, "due", childAttrs.due.value, set.attrNames);
          }
          if (childAttrs["rt-processed"]?.value != null && childAttrs["rt-processed"].value !== "") {
            await ensureChildAttr(uid, "rt-processed", childAttrs["rt-processed"].value);
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
          if (payload.previousChildRepeat != null) {
            await ensureChildAttrForType(uid, "repeat", payload.previousChildRepeat, set.attrNames);
          } else {
            await removeChildAttrsForType(uid, "repeat", set.attrNames);
          }
          if (payload.hadChildDue && payload.previousChildDue != null) {
            await ensureChildAttrForType(uid, "due", payload.previousChildDue, set.attrNames);
          } else {
            await removeChildAttrsForType(uid, "due", set.attrNames);
          }
          if (snapshot?.childAttrs?.["rt-processed"]?.value != null && snapshot.childAttrs["rt-processed"].value !== "") {
            await ensureChildAttr(uid, "rt-processed", snapshot.childAttrs["rt-processed"].value);
          } else {
            await removeChildAttr(uid, "rt-processed");
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

    function isValidDateValue(value) {
      return value instanceof Date && !Number.isNaN(value.getTime());
    }

    function pickPlacementDate(candidates = {}) {
      if (!candidates || typeof candidates !== "object") return null;
      const { start, due, defer } = candidates;
      if (isValidDateValue(start)) return start;
      if (isValidDateValue(due)) return due;
      if (isValidDateValue(defer)) return defer;
      return null;
    }

    async function ensureTargetReady(anchorDate, prevBlock, set) {
      let uid = null;
      try {
        uid = await chooseTargetPageUid(anchorDate, prevBlock, set);
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
          const dnpTitle = toDnpTitle(anchorDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          uid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
        } else if (set.destination !== "Same Page") {
          const dnpTitle = toDnpTitle(anchorDate);
          uid = await getOrCreatePageUid(dnpTitle);
        }
      } catch (err) {
        console.warn("[RecurringTasks] ensureTargetReady fallback failed", err);
      }
      return uid;
    }

    async function relocateBlockForPlacement(block, candidates, set) {
      const locationBefore = captureBlockLocation(block);
      const result = {
        moved: false,
        targetUid: locationBefore.parentUid,
        previousParentUid: locationBefore.parentUid,
        previousOrder: locationBefore.order,
      };
      if (!block || !set) return result;
      const anchorDate = pickPlacementDate(candidates);
      if (!anchorDate) return result;
      let targetUid = locationBefore.parentUid;
      if (set.destination !== "Same Page") {
        targetUid = await ensureTargetReady(anchorDate, block, set);
      }
      if (targetUid) result.targetUid = targetUid;
      if (targetUid && targetUid !== locationBefore.parentUid) {
        try {
          await window.roamAlphaAPI.moveBlock({
            location: { "parent-uid": targetUid, order: 0 },
            block: { uid: block.uid },
          });
          result.moved = true;
        } catch (err) {
          console.warn("[RecurringTasks] relocateBlockForPlacement failed", err);
        }
      }
      return result;
    }
    const pendingPillTimers = new Map();

    function clearPendingPillTimer(uid) {
      if (!uid) return;
      const timer = pendingPillTimers.get(uid);
      if (timer) {
        clearTimeout(timer);
        pendingPillTimers.delete(uid);
      }
    }

    function schedulePillRefresh(mainEl, uid = null, delay = 60) {
      if (!mainEl) return;
      const targetUid = uid || findBlockUidFromElement(mainEl);
      if (!targetUid) return;
      clearPendingPillTimer(targetUid);
      const timer = setTimeout(() => {
        pendingPillTimers.delete(targetUid);
        void decorateBlockPills(mainEl);
      }, delay);
      pendingPillTimers.set(targetUid, timer);
    }

    function findMainForChildrenContainer(childrenEl) {
      if (!childrenEl) return null;
      const prev = childrenEl.previousElementSibling;
      if (prev?.classList?.contains("rm-block-main")) {
        return prev;
      }
      const container = childrenEl.closest?.(".roam-block-container, .roam-block");
      if (!container) return null;
      return (
        container.querySelector?.(":scope > .rm-block-main") ||
        container.querySelector?.(".rm-block-main") ||
        null
      );
    }
    const childEditDebounce = new Map();
    let observer = null;
    let observerReinitTimer = null;
    let lastSweep = 0;
    let lastAttrSurface = null;
    let pendingSurfaceSync = null;

    lastAttrSurface = enforceChildAttrSurface(extensionAPI);
    void syncPillsForSurface(lastAttrSurface);
    initiateObserver();
    window.addEventListener("hashchange", handleHashChange);

    delete window.roamAlphaAPI?.__rtWrapped;

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

      const obsConfig = {
        attributes: true,
        attributeFilter: ["class", "style", "open", "aria-expanded"],
        childList: true,
        subtree: true,
      };
      const callback = async function (mutationsList, obs) {
        sweepProcessed();

        // Ensure roots still exist; reconnect if Roam re-renders the main areas.
        if (!document.body.contains(targetNode1) || !document.body.contains(targetNode2)) {
          try {
            obs.disconnect();
          } catch (err) {
            console.warn("[BetterTasks] observer disconnect failed", err);
          }
          // Re-grab nodes and restart
          targetNode1 = document.getElementsByClassName("roam-main")[0];
          targetNode2 = document.getElementById("right-sidebar");
          if (targetNode1 || targetNode2) {
            obs.observe(targetNode1, obsConfig);
            if (targetNode2) obs.observe(targetNode2, obsConfig);
          }
          return;
        }

        // 1️⃣ First pass: track blocks where a TODO checkbox was removed.
        const todoRemovedByBlockUid = new Set();

        for (const mutation of mutationsList) {
          if (mutation.type !== "childList") continue;
          if (!mutation.removedNodes || mutation.removedNodes.length === 0) continue;

          for (const node of mutation.removedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            // Look for a TODO checkbox in the removed node subtree.
            const todoCheckboxSpan =
              node.matches(".rm-checkbox.rm-todo")
                ? node
                : node.querySelector?.(".rm-checkbox.rm-todo");

            if (!todoCheckboxSpan) continue;

            const blockEl =
              todoCheckboxSpan.closest(".rm-block-main") ||
              mutation.target?.closest?.(".rm-block-main") ||
              todoCheckboxSpan.closest(".roam-block") ||
              mutation.target?.closest?.(".roam-block");

            if (!blockEl) continue;

            const uid = findBlockUidFromElement(blockEl);
            if (uid) {
              todoRemovedByBlockUid.add(uid);
            }
          }
        }

        // 2️⃣ Second pass: handle attributes & added DONE checkboxes.
        for (const mutation of mutationsList) {
          // Existing attributes branch (pills when editing the same DOM node)
          if (mutation.type === "attributes") {
            const target = mutation.target;
            if (target instanceof HTMLElement) {
              const main =
                target.closest(".rm-block-main") || target.closest(".roam-block");
              if (main) {
                void decorateBlockPills(main);
              }
            }
            continue;
          }

          if (mutation.type !== "childList") continue;
          if (!mutation.addedNodes || mutation.addedNodes.length === 0) continue;

          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            // Always (re)decorate pills for any newly-added block subtree.
            void decorateBlockPills(node);

            // Find any checkbox inputs under this new subtree.
            const inputs = node.matches(".check-container input[type='checkbox']")
              ? [node]
              : Array.from(
                node.querySelectorAll?.(
                  ".check-container input[type='checkbox']"
                ) || []
              );

            for (const input of inputs) {
              const checkbox = /** @type {HTMLInputElement} */ (input);

              // We only care about checked checkboxes (DONE).
              if (!(checkbox.checked || checkbox.control?.checked)) continue;

              const blockEl =
                checkbox.closest(".rm-block-main") ||
                node.closest(".rm-block-main") ||
                checkbox.closest(".roam-block") ||
                node.closest(".roam-block");

              if (!blockEl) continue;

              const uid = findBlockUidFromElement(blockEl);
              if (!uid) continue;

              // 🔑 Critical gating: only treat this as a new completion if
              // we saw a TODO removed for this block in this batch.
              if (!todoRemovedByBlockUid.has(uid)) {
                // Most likely page load / hydration of an already-DONE task.
                continue;
              }

              try {
                await processTaskCompletion(uid, { checkbox });
              } catch (err) {
                console.error("[BetterTasks] processTaskCompletion failed", err);
              }
            }
          }
        }

        sweepProcessed();
      };

      observer = new MutationObserver(callback);
      if (targetNode1) observer.observe(targetNode1, obsConfig);
      if (targetNode2) observer.observe(targetNode2, obsConfig);
      const surface = lastAttrSurface || enforceChildAttrSurface(extensionAPI);
      lastAttrSurface = surface;
      void syncPillsForSurface(surface);
    }

    async function processTaskCompletion(uid, options = {}) {
      if (!uid) return null;
      if (processedMap.has(uid)) {
        return null;
      }
      processedMap.set(uid, Date.now());
      const checkbox = options.checkbox || null;
      try {
        const set = S();
        await flushChildAttrSync(uid);
        await delay(60);
        let block = await getBlock(uid);
        await delay(60);
        const refreshed = await getBlock(uid);
        if (refreshed) block = refreshed;
        if (!block) {
          processedMap.delete(uid);
          return null;
        }

        const meta = await readRecurringMeta(block, set);
        const hasTimingOnly = !!meta?.hasTimingAttrs;
        if (!meta.repeat && !hasTimingOnly) {
          processedMap.delete(uid);
          return null;
        }

        const now = Date.now();
        if (meta.processedTs && now - meta.processedTs < 4000) {
          processedMap.delete(uid);
          return null;
        }

        const isOneOff = !meta.repeat && hasTimingOnly;
        if (isOneOff) {
          const snapshot = captureBlockSnapshot(block);
          try {
            const completion = await markCompleted(block, meta, set);
            processedMap.set(uid, completion.processedAt);
            const anchor =
              pickPlacementDate({ start: meta.start, defer: meta.defer, due: meta.due }) || meta.due || null;
            registerUndoAction({
              blockUid: uid,
              snapshot,
              completion,
              newBlockUid: null,
              nextDue: meta.due || null,
              nextAnchor: anchor,
              set,
              overrideEntry: null,
              toastMessage: "Task completion recorded",
            });
            repeatOverrides.delete(uid);
            void syncPillsForSurface(lastAttrSurface);
            activeDashboardController?.notifyBlockChange?.(uid);
            return { type: "one-off" };
          } catch (err) {
            console.error("[RecurringTasks] one-off completion failed", err);
            await revertBlockCompletion(block);
            processedMap.delete(uid);
            return null;
          }
        }

        if (set.confirmBeforeSpawn && !options.skipConfirmation) {
          const confirmed = await requestSpawnConfirmation(meta, set);
          if (!confirmed) {
            processedMap.delete(uid);
            return null;
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
        const advanceMode = await ensureAdvancePreference(uid, block, meta, set, checkbox);
        if (!advanceMode) {
          processedMap.delete(uid);
          return null;
        }
        meta.advanceFrom = advanceMode;
        const setWithAdvance = { ...set, advanceFrom: advanceMode };
        const completion = await markCompleted(block, meta, setWithAdvance);
        processedMap.set(uid, completion.processedAt);

        const { meta: resolvedMeta, block: resolvedBlock } = await resolveMetaAfterCompletion(
          snapshot,
          uid,
          meta,
          setWithAdvance
        );
        if (overrideRepeat) {
          resolvedMeta.repeat = overrideRepeat;
          resolvedMeta.props = { ...(resolvedMeta.props || {}), repeat: overrideRepeat };
        }
        if (overrideDue) {
          resolvedMeta.due = overrideDue;
          resolvedMeta.props = { ...(resolvedMeta.props || {}), due: formatDate(overrideDue, set) };
        }
        const overrideRule = overrideRepeat ? parseRuleText(overrideRepeat, setWithAdvance) : null;
        const nextDueCandidate =
          overrideDue && overrideDue instanceof Date && !Number.isNaN(overrideDue.getTime()) ? overrideDue : null;
        const nextDue = nextDueCandidate || computeNextDue(resolvedMeta, setWithAdvance, 0, overrideRule);
        if (!nextDue) {
          processedMap.delete(uid);
          return null;
        }
        const startOffsetMs =
          resolvedMeta.start instanceof Date && resolvedMeta.due instanceof Date
            ? resolvedMeta.start.getTime() - resolvedMeta.due.getTime()
            : null;
        const deferOffsetMs =
          resolvedMeta.defer instanceof Date && resolvedMeta.due instanceof Date
            ? resolvedMeta.defer.getTime() - resolvedMeta.due.getTime()
            : null;
        const nextStartDate = startOffsetMs != null ? applyOffsetToDate(nextDue, startOffsetMs) : null;
        const nextDeferDate = deferOffsetMs != null ? applyOffsetToDate(nextDue, deferOffsetMs) : null;
        const parentForSpawn = resolvedBlock || (await getBlock(uid)) || block;
        const newUid = await spawnNextOccurrence(parentForSpawn, resolvedMeta, nextDue, setWithAdvance);
        registerUndoAction({
          blockUid: uid,
          snapshot,
          completion,
          newBlockUid: newUid,
          nextDue,
          nextAnchor: pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDue }) || nextDue,
          set: setWithAdvance,
          overrideEntry: overrideEntry
            ? {
              ...(overrideEntry.repeat ? { repeat: overrideEntry.repeat } : {}),
              ...(overrideEntry.due ? { due: new Date(overrideEntry.due.getTime()) } : {}),
            }
            : null,
        });
        repeatOverrides.delete(uid);
        void syncPillsForSurface(lastAttrSurface);
        activeDashboardController?.notifyBlockChange?.(uid);
        if (newUid) {
          activeDashboardController?.notifyBlockChange?.(newUid);
        }
        return { type: "recurring", nextUid: newUid };
      } catch (err) {
        console.error("[RecurringTasks] error:", err);
        processedMap.delete(uid);
        return null;
      }
    }

    async function getBlock(uid) {
      const res = await window.roamAlphaAPI.q(`
        [:find
          (pull ?b [:block/uid :block/string :block/props :block/order :block/open
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

    function syncActiveTextarea(uid, string) {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      if (!active || typeof string !== "string") return false;
      const host = active.closest?.(".rm-block-main");
      if (!host) return false;
      const hostUid = host.getAttribute("data-uid");
      if (hostUid !== uid) return false;
      if (typeof active.value === "string" && active.value !== string) {
        active.value = string;
        active.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    }

    async function updateBlockString(uid, string) {
      if (PARENT_WRITE_DELAY_MS > 0) {
        await delay(PARENT_WRITE_DELAY_MS);
      }
      const result = await window.roamAlphaAPI.updateBlock({ block: { uid, string } });
      try {
        if (typeof string === "string") {
          const synced = syncActiveTextarea(uid, string);
          if (!synced) {
            const blockMain = document.querySelector(`.rm-block-main[data-uid="${uid}"]`);
            const textarea =
              blockMain?.querySelector?.("textarea.rm-block-input") ||
              blockMain?.querySelector?.("textarea.rm-block__input") ||
              document.querySelector(`textarea.rm-block-input[data-roamjs-block-uid="${uid}"]`);
            if (textarea && textarea.value !== string) {
              textarea.value = string;
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
        }
      } catch (_) { }
      return result;
    }

    async function updateBlockProps(uid, merge) {
      const attrSnapshot = lastAttrNames || resolveAttributeNames();
      const enrichedMerge = { ...(merge || {}) };
      if (attrSnapshot) {
        enrichedMerge.rt = {
          ...(enrichedMerge.rt || {}),
          attrRepeat: attrSnapshot.repeatAttr,
          attrDue: attrSnapshot.dueAttr,
          attrRepeatLabel: attrSnapshot.repeatAttr,
          attrDueLabel: attrSnapshot.dueAttr,
          attrStart: attrSnapshot.startAttr,
          attrStartLabel: attrSnapshot.startAttr,
          attrDefer: attrSnapshot.deferAttr,
          attrDeferLabel: attrSnapshot.deferAttr,
          attrCompleted: attrSnapshot.completedAttr,
          attrCompletedLabel: attrSnapshot.completedAttr,
        };
      }
      const current = await window.roamAlphaAPI.q(
        `[:find ?p :where [?b :block/uid "${uid}"] [?b :block/props ?p]]`
      );
      let props = {};
      try {
        props = current?.[0]?.[0] ? JSON.parse(current[0][0]) : {};
      } catch (e) {
        props = {};
      }
      const next = { ...props, ...enrichedMerge };
      if (props.rt && enrichedMerge?.rt) {
        next.rt = { ...props.rt, ...enrichedMerge.rt };
      }
      for (const key of Object.keys(next)) {
        if (next[key] === undefined) delete next[key];
      }
      return window.roamAlphaAPI.updateBlock({ block: { uid, props: next } });
    }

    async function setBlockProps(uid, propsObject) {
      const nextProps = propsObject && typeof propsObject === "object" ? { ...propsObject } : {};
      if (nextProps.repeat !== undefined) delete nextProps.repeat;
      if (nextProps.due !== undefined) delete nextProps.due;
      if (nextProps.start !== undefined) delete nextProps.start;
      if (nextProps.defer !== undefined) delete nextProps.defer;
      return window.roamAlphaAPI.updateBlock({ block: { uid, props: nextProps } });
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
      const attrSurface = set?.attributeSurface || "Child";
      const attrNames = set?.attrNames || resolveAttributeNames();
      const props = parseProps(block.props);
      const rt = props.rt || {};
      const childAttrMap = parseAttrsFromChildBlocks(block?.children || []);
      const repeatChild = pickChildAttr(childAttrMap, attrNames.repeatAliases, {
        allowFallback: false,
      });
      const dueChild = pickChildAttr(childAttrMap, attrNames.dueAliases, {
        allowFallback: false,
      });
      const startChild = pickChildAttr(childAttrMap, attrNames.startAliases, {
        allowFallback: false,
      });
      const deferChild = pickChildAttr(childAttrMap, attrNames.deferAliases, {
        allowFallback: false,
      });
      const processedChild = childAttrMap["rt-processed"];
      const inlineAttrs = parseAttrsFromBlockText(block.string || "");
      const inlineRepeat = pickInlineAttr(inlineAttrs, attrNames.repeatAliases, { allowFallback: false });
      const inlineDue = pickInlineAttr(inlineAttrs, attrNames.dueAliases, { allowFallback: false });
      const inlineStart = pickInlineAttr(inlineAttrs, attrNames.startAliases, { allowFallback: false });
      const inlineDefer = pickInlineAttr(inlineAttrs, attrNames.deferAliases, { allowFallback: false });

      const canonicalRepeatKey = DEFAULT_REPEAT_ATTR.toLowerCase();
      const canonicalDueKey = DEFAULT_DUE_ATTR.toLowerCase();
      const canonicalStartKey = DEFAULT_START_ATTR.toLowerCase();
      const canonicalDeferKey = DEFAULT_DEFER_ATTR.toLowerCase();
      const hasCanonicalRepeatSignal =
        !!childAttrMap[canonicalRepeatKey] || inlineAttrs[canonicalRepeatKey] != null;
      const hasCanonicalDueSignal =
        !!childAttrMap[canonicalDueKey] || inlineAttrs[canonicalDueKey] != null;
      const hasCanonicalStartSignal =
        !!childAttrMap[canonicalStartKey] || inlineAttrs[canonicalStartKey] != null;
      const hasCanonicalDeferSignal =
        !!childAttrMap[canonicalDeferKey] || inlineAttrs[canonicalDeferKey] != null;
      const hasCustomRepeatSignal =
        !!childAttrMap[attrNames.repeatKey] || inlineAttrs[attrNames.repeatKey] != null;
      const hasCustomDueSignal =
        !!childAttrMap[attrNames.dueKey] || inlineAttrs[attrNames.dueKey] != null;
      const hasCustomStartSignal =
        !!childAttrMap[attrNames.startKey] || inlineAttrs[attrNames.startKey] != null;
      const hasCustomDeferSignal =
        !!childAttrMap[attrNames.deferKey] || inlineAttrs[attrNames.deferKey] != null;
      const propsRepeatMatches =
        attrNames.repeatAttr === DEFAULT_REPEAT_ATTR ||
        props.rt?.attrRepeat === attrNames.repeatAttr;
      const propsDueMatches =
        attrNames.dueAttr === DEFAULT_DUE_ATTR || props.rt?.attrDue === attrNames.dueAttr;
      const propsStartMatches =
        attrNames.startAttr === DEFAULT_START_ATTR || props.rt?.attrStart === attrNames.startAttr;
      const propsDeferMatches =
        attrNames.deferAttr === DEFAULT_DEFER_ATTR || props.rt?.attrDefer === attrNames.deferAttr;
      const allowPropsRepeat = propsRepeatMatches || hasCustomRepeatSignal;
      const allowPropsDue = propsDueMatches || hasCustomDueSignal;
      const allowPropsStart = propsStartMatches || hasCustomStartSignal || hasCanonicalStartSignal;
      const allowPropsDefer = propsDeferMatches || hasCustomDeferSignal || hasCanonicalDeferSignal;

      const startSignals = [
        startChild?.value,
        inlineStart,
        allowPropsStart ? props.start : null,
      ];
      const deferSignals = [
        deferChild?.value,
        inlineDefer,
        allowPropsDefer ? props.defer : null,
      ];
      const dueSignals = [
        dueChild?.value,
        inlineDue,
        allowPropsDue ? props.due : null,
      ];
      const hasTimingSignal =
        startSignals.some((value) => !!value) ||
        deferSignals.some((value) => !!value) ||
        dueSignals.some((value) => !!value);

      let repeatText = null;
      let dueDate = null;
      let startDate = null;
      let deferDate = null;
      let processedTs = rt.processed ? Number(rt.processed) : null;

      if (attrSurface === "Child") {
        repeatText = repeatChild?.value || inlineRepeat || null;
        dueDate = null;
        const dueSource = dueChild?.value || inlineDue || null;
        if (dueSource) {
          const parsed = parseRoamDate(dueSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            dueDate = parsed;
            clearDueParseFailure(block?.uid || null);
          } else if (dueChild?.value) {
            noteDueParseFailure(block?.uid || null);
          }
        } else {
          clearDueParseFailure(block?.uid || null);
        }
        const startSource = startChild?.value || inlineStart || null;
        if (startSource) {
          const parsed = parseRoamDate(startSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            startDate = parsed;
          }
        }
        const deferSource = deferChild?.value || inlineDefer || null;
        if (deferSource) {
          const parsed = parseRoamDate(deferSource);
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            deferDate = parsed;
          }
        }
        if (processedChild?.value) {
          const parsed = Number(processedChild.value);
          if (!Number.isNaN(parsed)) processedTs = parsed;
        }
      } else {
        if (allowPropsRepeat && typeof props.repeat === "string" && props.repeat) {
          repeatText = props.repeat;
        } else if (inlineRepeat) {
          repeatText = inlineRepeat;
        } else if (repeatChild?.value) {
          repeatText = repeatChild.value;
        }
        let dueSource = null;
        if (allowPropsDue && typeof props.due === "string" && props.due) {
          dueSource = props.due;
        } else if (inlineDue) {
          dueSource = inlineDue;
        } else if (dueChild?.value) {
          dueSource = dueChild.value;
        }
        if (dueSource) {
          const parsed = parseRoamDate(dueSource);
          if (parsed) dueDate = parsed;
        }
        let startSource = null;
        if (allowPropsStart && typeof props.start === "string" && props.start) {
          startSource = props.start;
        } else if (inlineStart) {
          startSource = inlineStart;
        } else if (startChild?.value) {
          startSource = startChild.value;
        }
        if (startSource) {
          const parsed = parseRoamDate(startSource);
          if (parsed) startDate = parsed;
        }
        let deferSource = null;
        if (allowPropsDefer && typeof props.defer === "string" && props.defer) {
          deferSource = props.defer;
        } else if (inlineDefer) {
          deferSource = inlineDefer;
        } else if (deferChild?.value) {
          deferSource = deferChild.value;
        }
        if (deferSource) {
          const parsed = parseRoamDate(deferSource);
          if (parsed) deferDate = parsed;
        }
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

      const hasTimingValue = !!(startDate || deferDate || dueDate);
      const hasRepeat = !!repeatText;
      const hasTimingAttrs = hasTimingSignal || hasTimingValue;
      const isOneOff = !hasRepeat && hasTimingAttrs;

      const advanceEntry = childAttrMap[ADVANCE_ATTR.toLowerCase()];
      const advanceFrom = normalizeAdvanceValue(advanceEntry?.value) || null;

      return {
        uid: block.uid,
        repeat: repeatText,
        due: dueDate,
        start: startDate,
        defer: deferDate,
        childAttrMap,
        processedTs: processedTs || null,
        rtId: rt.id || null,
        rtParent: rt.parent || null,
        pageUid: block.page?.uid || null,
        props,
        advanceFrom,
        hasRepeat,
        hasTimingAttrs,
        isRecurring: hasRepeat,
        isOneOff,
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
      const attrNames = set?.attrNames || resolveAttributeNames();
      const inlineRepeat = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
      const inlineDue = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
      const inlineStart = pickInlineAttr(inlineAttrs, attrNames.startAliases);
      const inlineDefer = pickInlineAttr(inlineAttrs, attrNames.deferAliases);
      const valueSources = [
        inlineRepeat,
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
        inlineDue,
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
      const startSources = [
        inlineStart,
        metaCandidate?.props?.start,
        baseMeta?.props?.start,
        baseMeta?.start,
      ];
      for (const value of startSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.start = parsed;
            break;
          }
        }
      }
      const deferSources = [
        inlineDefer,
        metaCandidate?.props?.defer,
        baseMeta?.props?.defer,
        baseMeta?.defer,
      ];
      for (const value of deferSources) {
        if (value) {
          const parsed = parseRoamDate(value);
          if (parsed) {
            fallbackMeta.defer = parsed;
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
      const attrNames = resolveAttributeNames();
      const lines = text.split("\n").slice(0, 12);
      for (const line of lines) {
        const inlineRegex =
          /(?:^|\s)([\p{L}\p{N}_\-\/]+)::\s*([^\n]*?)(?=(?:\s+[\p{L}\p{N}_\-\/]+::)|$)/gu;
        let match;
        while ((match = inlineRegex.exec(line)) !== null) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();
          if (!(key in out)) out[key] = value;
          if (key === attrNames.repeatKey && out.repeat == null) {
            out.repeat = value;
          } else if (key === attrNames.dueKey && out.due == null) {
            out.due = value;
          } else if (key === attrNames.startKey && out.start == null) {
            out.start = value;
          } else if (key === attrNames.deferKey && out.defer == null) {
            out.defer = value;
          } else if (key === attrNames.completedKey && out.completed == null) {
            out.completed = value;
          }
        }
      }
      return out;
    }

    function parseAttrsFromChildBlocks(children) {
      if (!Array.isArray(children)) return {};
      const out = {};
      const attrNames = resolveAttributeNames();
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
          if (key === attrNames.repeatKey && out.repeat == null) {
            out.repeat = out[key];
          } else if (key === attrNames.dueKey && out.due == null) {
            out.due = out[key];
          } else if (key === attrNames.startKey && out.start == null) {
            out.start = out[key];
          } else if (key === attrNames.deferKey && out.defer == null) {
            out.defer = out[key];
          } else if (key === attrNames.completedKey && out.completed == null) {
            out.completed = out[key];
          }
        }
      }
      return out;
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function hasInlineAttrLabel(text, label) {
      if (!text || !label) return false;
      const escaped = escapeRegExp(label.trim());
      if (!escaped) return false;
      const regex = new RegExp(`(^|\\s)${escaped}::`, "i");
      return regex.test(text);
    }

    function hasChildAttrLabel(children, label) {
      if (!Array.isArray(children) || !label) return false;
      const escaped = escapeRegExp(label.trim());
      if (!escaped) return false;
      const regex = new RegExp(`^\\s*${escaped}::`, "i");
      return children.some((child) => regex.test((child?.string || "").trim()));
    }

    function hasAnyAttributeChild(children) {
      if (!Array.isArray(children)) return false;
      return children.some((child) => {
        const text = (child?.string || "").trim();
        return ATTR_RE.test(text);
      });
    }

    function sanitizeAttrName(value, fallback) {
      if (value == null) return fallback;
      const trimmed = String(value).trim().replace(/:+$/, "");
      return trimmed || fallback;
    }

    function normalizeAttrLabel(value) {
      if (typeof value !== "string") return "";
      return value.trim().replace(/:+$/, "").toLowerCase();
    }

    function isChildrenVisible(el) {
      if (!el) return false;
      if (el.childElementCount === 0) return false;
      if (el.style?.display === "none" || el.style?.visibility === "hidden") return false;
      const computed = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (computed && (computed.display === "none" || computed.visibility === "hidden")) return false;
      return el.offsetHeight > 0;
    }

    function buildAttrConfig(settingId, defaultName) {
      const attr = sanitizeAttrName(extensionAPI.settings.get(settingId) || defaultName, defaultName);
      const key = attr.toLowerCase();
      const defaultKey = defaultName.toLowerCase();
      const isDefault = key === defaultKey;
      return {
        attr,
        key,
        aliases: [key],
        removalKeys: isDefault ? [defaultName] : [attr],
        defaultName,
        canonicalKey: defaultKey,
        isDefault,
      };
    }

    function resolveAttributeNames() {
      const repeat = buildAttrConfig("rt-repeat-attr", DEFAULT_REPEAT_ATTR);
      const due = buildAttrConfig("rt-due-attr", DEFAULT_DUE_ATTR);
      const start = buildAttrConfig("rt-start-attr", DEFAULT_START_ATTR);
      const defer = buildAttrConfig("rt-defer-attr", DEFAULT_DEFER_ATTR);
      const completed = buildAttrConfig("rt-completed-attr", DEFAULT_COMPLETED_ATTR);
      const attrByType = { repeat, due, start, defer, completed };
      return {
        repeatAttr: repeat.attr,
        repeatKey: repeat.key,
        repeatAliases: repeat.aliases,
        repeatRemovalKeys: repeat.removalKeys,
        dueAttr: due.attr,
        dueKey: due.key,
        dueAliases: due.aliases,
        dueRemovalKeys: due.removalKeys,
        startAttr: start.attr,
        startKey: start.key,
        startAliases: start.aliases,
        startRemovalKeys: start.removalKeys,
        deferAttr: defer.attr,
        deferKey: defer.key,
        deferAliases: defer.aliases,
        deferRemovalKeys: defer.removalKeys,
        completedAttr: completed.attr,
        completedKey: completed.key,
        completedAliases: completed.aliases,
        completedRemovalKeys: completed.removalKeys,
        attrByType,
      };
    }

    function pickInlineAttr(inlineMap, aliases, options = {}) {
      if (!inlineMap) return null;
      const { allowFallback = true } = options;
      const [primary, ...fallbacks] = aliases;
      if (primary && inlineMap[primary] != null && inlineMap[primary] !== "") {
        return inlineMap[primary];
      }
      if (!allowFallback) return null;
      for (const key of fallbacks) {
        if (inlineMap[key] != null && inlineMap[key] !== "") {
          return inlineMap[key];
        }
      }
      return null;
    }

    function pickChildAttr(childMap, aliases, options = {}) {
      if (!childMap) return null;
      const { allowFallback = true } = options;
      const [primary, ...fallbacks] = aliases;
      if (primary && childMap[primary]) return childMap[primary];
      if (!allowFallback) return null;
      for (const key of fallbacks) {
        if (childMap[key]) return childMap[key];
      }
      return null;
    }

    const CHILD_ATTR_ORDER = {
      completed: 0,
      repeat: 1,
      advance: 2,
      start: 3,
      defer: 4,
      due: 5,
    };

    function getChildOrderForType(type) {
      if (!type) return 0;
      const key = String(type).toLowerCase();
      return Number.isFinite(CHILD_ATTR_ORDER[key]) ? CHILD_ATTR_ORDER[key] : 0;
    }

    function buildOrderedChildAttrLabels(attrNames = resolveAttributeNames()) {
      return [
        { type: "completed", label: getAttrLabel("completed", attrNames) || "completed" },
        { type: "repeat", label: getAttrLabel("repeat", attrNames) },
        { type: "advance", label: ADVANCE_ATTR },
        { type: "start", label: getAttrLabel("start", attrNames) },
        { type: "defer", label: getAttrLabel("defer", attrNames) },
        { type: "due", label: getAttrLabel("due", attrNames) },
      ].filter((entry) => typeof entry.label === "string" && entry.label.trim());
    }

    async function enforceChildAttrOrder(parentUid, attrNames = resolveAttributeNames()) {
      if (!parentUid) return;
      const parent = await getBlock(parentUid);
      if (!parent) return;
      const children = Array.isArray(parent.children) ? parent.children : [];
      if (!children.length) return;
      const orderedLabels = buildOrderedChildAttrLabels(attrNames);
      const labelToIndex = new Map(
        orderedLabels.map((entry, idx) => [entry.label.trim().toLowerCase(), idx])
      );
      const managed = [];
      for (const child of children) {
        const text = typeof child?.string === "string" ? child.string : "";
        const match = text.match(/^\s*([^:]+)::/);
        if (!match) continue;
        const label = match[1].trim().toLowerCase();
        if (!labelToIndex.has(label)) continue;
        managed.push({ uid: child.uid, desiredIndex: labelToIndex.get(label) });
      }
      if (managed.length <= 1) return;
      managed.sort((a, b) => a.desiredIndex - b.desiredIndex);
      let nextOrder = 0;
      for (const entry of managed) {
        if (!entry.uid) continue;
        try {
          await window.roamAlphaAPI.moveBlock({
            location: { "parent-uid": parentUid, order: nextOrder },
            block: { uid: entry.uid },
          });
        } catch (err) {
          console.warn("[RecurringTasks] enforceChildAttrOrder move failed", err);
        }
        nextOrder += 1;
      }
    }

    function getAttrMeta(type, attrNames) {
      if (!type || !attrNames) return null;
      if (attrNames.attrByType && attrNames.attrByType[type]) {
        return attrNames.attrByType[type];
      }
      switch (type) {
        case "repeat":
          return {
            attr: attrNames.repeatAttr,
            key: attrNames.repeatKey,
            aliases: attrNames.repeatAliases,
            removalKeys: attrNames.repeatRemovalKeys,
          };
        case "due":
          return {
            attr: attrNames.dueAttr,
            key: attrNames.dueKey,
            aliases: attrNames.dueAliases,
            removalKeys: attrNames.dueRemovalKeys,
          };
        case "start":
          return {
            attr: attrNames.startAttr,
            key: attrNames.startKey,
            aliases: attrNames.startAliases,
            removalKeys: attrNames.startRemovalKeys,
          };
        case "defer":
          return {
            attr: attrNames.deferAttr,
            key: attrNames.deferKey,
            aliases: attrNames.deferAliases,
            removalKeys: attrNames.deferRemovalKeys,
          };
        case "completed":
          return {
            attr: attrNames.completedAttr,
            key: attrNames.completedKey,
            aliases: attrNames.completedAliases,
            removalKeys: attrNames.completedRemovalKeys,
          };
        default:
          return null;
      }
    }

    function getAttrLabel(type, attrNames) {
      return getAttrMeta(type, attrNames)?.attr || "";
    }

    function getAttrKey(type, attrNames) {
      return getAttrMeta(type, attrNames)?.key || "";
    }

    function getAttrRemovalKeys(type, attrNames) {
      return getAttrMeta(type, attrNames)?.removalKeys || [];
    }

    function getAttrAliases(type, attrNames) {
      return getAttrMeta(type, attrNames)?.aliases || [];
    }

    async function ensureChildAttrForType(uid, type, value, attrNames) {
      const order = getChildOrderForType(type);
      const result = await ensureChildAttr(uid, getAttrLabel(type, attrNames), value, order);
      await enforceChildAttrOrder(uid, attrNames);
      return result;
    }

    async function removeChildAttrsForType(uid, type, attrNames) {
      for (const key of getAttrRemovalKeys(type, attrNames)) {
        await removeChildAttr(uid, key);
      }
    }

    async function clearAttrForType(uid, type, options = {}) {
      if (!uid) return false;
      const allowed = new Set(["repeat", "start", "defer", "due"]);
      if (!allowed.has(type)) return false;
      const set = options.set || S();
      const attrNames = set?.attrNames || resolveAttributeNames();
      const block = options.block || (await getBlock(uid));
      if (!block) return false;
      await updateBlockProps(uid, { [type]: undefined });
      await removeChildAttrsForType(uid, type, attrNames);
      const removalKeys = getAttrRemovalKeys(type, attrNames);
      if (removalKeys.length) {
        const cleaned = removeInlineAttributes(block.string || "", removalKeys);
        if (cleaned !== (block.string || "")) {
          await updateBlockString(uid, cleaned);
        }
      }
      if (type === "repeat") {
        repeatOverrides.delete(uid);
      } else if (type === "due") {
        mergeRepeatOverride(uid, { due: null });
      }
      return true;
    }

    async function ensureInlineAttrForType(block, type, value, attrNames) {
      const label = getAttrLabel(type, attrNames);
      const aliases = getAttrRemovalKeys(type, attrNames).filter((name) => name !== label);
      await ensureInlineAttribute(block, label, value, { aliases });
    }

    function replaceInlineAttrForType(text, type, value, attrNames) {
      if (!text) return text;
      const keys = getAttrRemovalKeys(type, attrNames);
      let current = text;
      for (const key of keys) {
        const next = replaceAttributeInString(current, key, value);
        if (next !== current) {
          current = next;
          break;
        }
      }
      return current;
    }

    function getMetaChildAttr(meta, type, attrNames, options = {}) {
      if (!meta) return null;
      return pickChildAttr(meta.childAttrMap || {}, getAttrAliases(type, attrNames), options);
    }

    function setMetaChildAttr(meta, type, entry, attrNames) {
      if (!meta) return;
      meta.childAttrMap = meta.childAttrMap || {};
      const label = getAttrLabel(type, attrNames);
      meta.childAttrMap[label] = entry;
      if (label === type) {
        meta.childAttrMap[type] = entry;
      } else {
        delete meta.childAttrMap[type];
      }
    }

    function clearMetaChildAttr(meta, type, attrNames) {
      if (!meta || !meta.childAttrMap) return;
      delete meta.childAttrMap[getAttrLabel(type, attrNames)];
      const label = getAttrLabel(type, attrNames);
      if (label === type) delete meta.childAttrMap[type];
    }

    function normalizeAdvanceValue(value) {
      if (!value) return null;
      const v = String(value).trim().toLowerCase();
      if (v === "completion" || v === "completion date") return "completion";
      if (v === "due" || v === "due date") return "due";
      return null;
    }

    function advanceLabelForMode(mode) {
      return mode === "completion" ? "completion date" : "due date";
    }

    async function ensureAdvanceChildAttr(uid, mode, meta, attrNames = resolveAttributeNames()) {
      const label = advanceLabelForMode(mode);
      const order = getChildOrderForType("advance");
      const result = await ensureChildAttr(uid, ADVANCE_ATTR, label, order);
      await enforceChildAttrOrder(uid, attrNames);
      if (meta) {
        meta.childAttrMap = meta.childAttrMap || {};
        meta.childAttrMap[ADVANCE_ATTR.toLowerCase()] = { value: label, uid: result.uid };
      }
    }

    async function revertBlockCompletion(block) {
      if (!block) return;
      const uid = block.uid;
      const current = block.string || "";
      const reverted = current.replace(/{{\[\[DONE\]\]}}/i, "{{[[TODO]]}}");
      if (reverted !== current) {
        await updateBlockString(uid, reverted);
      }
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
    async function ensureChildAttr(uid, key, value, order = 0) {
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
        await createBlock(uid, order, `${key}:: ${value}`, newUid);
        await moveChildToOrder(uid, newUid, order);
        return { created: true, uid: newUid, previousValue: null };
      }
      const existingChild = await getBlock(matchUid);
      if (!existingChild) {
        const newUid = window.roamAlphaAPI.util.generateUID();
        await createBlock(uid, order, `${key}:: ${value}`, newUid);
        await moveChildToOrder(uid, newUid, order);
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
          await createBlock(uid, order, `${key}:: ${value}`, newUid);
          await moveChildToOrder(uid, newUid, order);
          return { created: true, uid: newUid, previousValue: curVal };
        }
      }
      await moveChildToOrder(uid, matchUid, order);
      return { created: false, uid: matchUid, previousValue: curVal };
    }

    async function moveChildToOrder(parentUid, childUid, order) {
      if (!parentUid || !childUid || !Number.isFinite(order)) return;
      const normalizedOrder = Math.max(0, Math.floor(order));
      try {
        await window.roamAlphaAPI.moveBlock({
          location: { "parent-uid": parentUid, order: normalizedOrder },
          block: { uid: childUid },
        });
      } catch (err) {
        console.warn("[RecurringTasks] moveChildToOrder failed", err);
      }
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

      completedAttrChange = await ensureChildAttrForType(uid, "completed", completedDate, set.attrNames);
      await removeChildAttr(uid, "rt-processed");

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
      const { nextAnchor, nextDue, toastMessage } = data;
      const displaySource = nextAnchor || nextDue;
      const displayDate = displaySource ? formatRoamDateTitle(displaySource) : "";
      const message = toastMessage
        ? toastMessage
        : displaySource
          ? `Next occurrence scheduled for ${displayDate}`
          : "Next occurrence scheduled";
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks",
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
      const attrNames = set?.attrNames || resolveAttributeNames();
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
        const hadRepeatChild = !!snapshot.childAttrs?.["repeat"];
        const hadDueChild = !!snapshot.childAttrs?.["due"];
        const hadStartChild = !!snapshot.childAttrs?.["start"];
        const hadDeferChild = !!snapshot.childAttrs?.["defer"];

        const restoreOrRemove = async (type, snapshotEntry) => {
          if (snapshotEntry) {
            await ensureChildAttrForType(blockUid, type, snapshotEntry.value || "", attrNames);
          } else {
            await removeChildAttrsForType(blockUid, type, attrNames);
          }
        };

        await restoreOrRemove("repeat", hadRepeatChild ? snapshot.childAttrs["repeat"] : null);
        await restoreOrRemove("due", hadDueChild ? snapshot.childAttrs["due"] : null);
        await restoreOrRemove("start", hadStartChild ? snapshot.childAttrs["start"] : null);
        await restoreOrRemove("defer", hadDeferChild ? snapshot.childAttrs["defer"] : null);
      } catch (err) {
        console.warn("[RecurringTasks] undo restore recurring attrs failed", err);
      }

      if (newBlockUid) {
        try {
          await deleteBlock(newBlockUid);
        } catch (err) {
          console.warn("[RecurringTasks] undo remove new block failed", err);
        }
      }

      await restoreChildAttr(
        blockUid,
        "completed",
        snapshot.childAttrs?.["completed"],
        completion.childChanges.completed,
        attrNames
      );
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

      processedMap.set(blockUid, Date.now());
      setTimeout(() => processedMap.delete(blockUid), 750);
      if (overrideEntry) mergeRepeatOverride(blockUid, overrideEntry);
      if (activeDashboardController) {
        await activeDashboardController.notifyBlockChange?.(blockUid);
        if (newBlockUid) {
          activeDashboardController.removeTask?.(newBlockUid);
        }
        if (activeDashboardController.isOpen?.()) {
          await activeDashboardController.refresh?.({ reason: "undo" });
        }
      }
      toast("Changes un-done successfully");
      void syncPillsForSurface(lastAttrSurface);
    }

    async function restoreChildAttr(blockUid, type, beforeInfo, changeInfo, attrNames = resolveAttributeNames()) {
      const label = getAttrLabel(type, attrNames) || type;
      if (beforeInfo?.uid) {
        const value = beforeInfo.value || "";
        try {
          await window.roamAlphaAPI.updateBlock({
            block: { uid: beforeInfo.uid, string: `${label}:: ${value}` },
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
      } else {
        await removeChildAttr(blockUid, label);
      }
    }

    async function spawnNextOccurrence(prevBlock, meta, nextDueDate, set) {
      const nextDueStr = formatDate(nextDueDate, set);
      const startOffsetMs =
        meta?.start instanceof Date && meta?.due instanceof Date
          ? meta.start.getTime() - meta.due.getTime()
          : null;
      const deferOffsetMs =
        meta?.defer instanceof Date && meta?.due instanceof Date
          ? meta.defer.getTime() - meta.due.getTime()
          : null;
      const nextStartDate =
        startOffsetMs != null ? applyOffsetToDate(nextDueDate, startOffsetMs) : null;
      const nextDeferDate =
        deferOffsetMs != null ? applyOffsetToDate(nextDueDate, deferOffsetMs) : null;
      const nextStartStr = nextStartDate ? formatDate(nextStartDate, set) : null;
      const nextDeferStr = nextDeferDate ? formatDate(nextDeferDate, set) : null;
      const removalKeys = [
        ...new Set([
          ...set.attrNames.repeatRemovalKeys,
          ...set.attrNames.dueRemovalKeys,
          ...set.attrNames.startRemovalKeys,
          ...set.attrNames.deferRemovalKeys,
          "completed",
        ]),
      ];
      const prevText = removeInlineAttributes(prevBlock.string || "", removalKeys);

      const seriesId = meta.rtId || shortId();
      if (!meta.rtId) await updateBlockProps(prevBlock.uid, { rt: { id: seriesId, tz: set.timezone } });

      const placementDate =
        pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDueDate }) || nextDueDate;
      let targetPageUid = await chooseTargetPageUid(placementDate, prevBlock, set);
      let parentBlock = await getBlock(targetPageUid);
      if (!parentBlock) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        parentBlock = await getBlock(targetPageUid);
      }
      if (!parentBlock) {
        if (set.destination === "DNP under heading" && set.dnpHeading) {
          const dnpTitle = toDnpTitle(placementDate);
          const dnpUid = await getOrCreatePageUid(dnpTitle);
          targetPageUid = await getOrCreateChildUnderHeading(dnpUid, set.dnpHeading);
          parentBlock = await getBlock(targetPageUid);
        } else if (set.destination === "Same Page") {
          const parent = prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
          targetPageUid = parent;
          parentBlock = await getBlock(targetPageUid);
        } else {
          const dnpTitle = toDnpTitle(placementDate);
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

      await ensureChildAttrForType(newUid, "repeat", meta.repeat, set.attrNames);
      await ensureChildAttrForType(newUid, "due", nextDueStr, set.attrNames);
      if (nextStartStr) {
        await ensureChildAttrForType(newUid, "start", nextStartStr, set.attrNames);
      } else {
        await removeChildAttrsForType(newUid, "start", set.attrNames);
      }
      if (nextDeferStr) {
        await ensureChildAttrForType(newUid, "defer", nextDeferStr, set.attrNames);
      } else {
        await removeChildAttrsForType(newUid, "defer", set.attrNames);
      }
      const advanceEntry = meta.childAttrMap?.[ADVANCE_ATTR.toLowerCase()];
      if (advanceEntry?.value) {
        await ensureChildAttr(newUid, ADVANCE_ATTR, advanceEntry.value, getChildOrderForType("advance"));
        await enforceChildAttrOrder(newUid, set.attrNames);
      }

      await updateBlockProps(newUid, {
        repeat: meta.repeat,
        due: nextDueStr,
        start: nextStartStr || undefined,
        defer: nextDeferStr || undefined,
        rt: { id: shortId(), parent: seriesId, tz: set.timezone },
      });

      return newUid;
    }

    // ========================= Destination helpers =========================
    async function chooseTargetPageUid(anchorDate, prevBlock, set) {
      if (set.destination === "Same Page") {
        return prevBlock.page?.uid || (await getOrCreatePageUid("Misc"));
      }
      const targetDate = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate : todayLocal();
      const dnpTitle = toDnpTitle(targetDate);
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

    // === Merged + extended parser ===
    function parseRuleText(s, options = {}) {
      if (!s) return null;
      const t = s.trim().replace(/\s+/g, " ").toLowerCase();
      const weekStartCode = normalizeWeekStartCode(
        options.weekStartCode || options.weekStart || getWeekStartSetting()
      );
      const ordinalHint = /\b(first|second|third|fourth|fifth|last|day|month)\b/.test(t) || /\d/.test(t);
      if (!ordinalHint) {
        const quickSet = parseAbbrevSet(t);
        if (quickSet) return { kind: "WEEKLY", interval: 1, byDay: quickSet };
        const looseDays = normalizeByDayList(t, weekStartCode);
        if (looseDays.length) return { kind: "WEEKLY", interval: 1, byDay: looseDays };
      }

      const keywordInterval = keywordIntervalFromText(t);
      if (keywordInterval) {
        return { kind: "MONTHLY_DAY", interval: keywordInterval };
      }

      // 0) Simple daily & weekday/weekend anchors
      if (t === "daily" || t === "every day") return { kind: "DAILY", interval: 1 };
      if (
        t === "every other day" || t === "every second day" ||
        t === "every two days" || t === "second daily"
      ) return { kind: "DAILY", interval: 2 };
      if (t === "every third day" || t === "every three days") return { kind: "DAILY", interval: 3 };
      if (t === "every fourth day" || t === "every four days") return { kind: "DAILY", interval: 4 };
      if (t === "every fifth day" || t === "every five days") return { kind: "DAILY", interval: 5 };

      if (t === "every weekday" || t === "weekdays" || t === "on weekdays" || t === "business days" || t === "workdays")
        return { kind: "WEEKDAY" };
      if (t === "every weekend" || t === "weekend" || t === "weekends")
        return { kind: "WEEKLY", interval: 1, byDay: ["SA", "SU"] };

      // 1) "every <dow>" (singular/plural) — use your DOW_MAP and aliases
      const singleDow = Object.keys(DOW_ALIASES).find(
        a => t === `every ${a}` || t === `every ${a}s`
      );
      if (singleDow) return { kind: "WEEKLY", interval: 1, byDay: [dowFromAlias(singleDow)] };

      // 2) "every N days"
      let m = t.match(/^every (\d+)\s*days?$/);
      if (m) return { kind: "DAILY", interval: parseInt(m[1], 10) };

      // 3) "every N weekdays/business days"
      m = t.match(/^every (\d+)\s*(?:weekdays?|business days?)$/);
      if (m) return { kind: "BUSINESS_DAILY", interval: parseInt(m[1], 10) };

      // 4) Weekly base words + biweekly/fortnightly
      if (t === "weekly" || t === "every week") return { kind: "WEEKLY", interval: 1, byDay: null };
      if (t === "every other week" || t === "every second week" || t === "biweekly" || t === "fortnightly" || t === "every fortnight")
        return { kind: "WEEKLY", interval: 2, byDay: null };
      m = t.match(/^every\s+(other|second|2nd)\s+([a-z]+)s?$/);
      if (m) {
        const dowCode = dowFromAlias(m[2]);
        if (dowCode) return { kind: "WEEKLY", interval: 2, byDay: [dowCode] };
      }
      m = t.match(/^every\s+(\d+)(?:st|nd|rd|th)?\s+([a-z]+)s?$/);
      if (m) {
        const intervalNum = parseInt(m[1], 10);
        const dowCode = dowFromAlias(m[2]);
        if (dowCode && intervalNum >= 1) {
          if (intervalNum === 1) return { kind: "WEEKLY", interval: 1, byDay: [dowCode] };
          return { kind: "WEEKLY", interval: intervalNum, byDay: [dowCode] };
        }
      }

      // 5) Weekly with "on …"
      let weeklyOn = t.match(/^(?:every week|weekly)\s+on\s+(.+)$/);
      if (weeklyOn) {
        const byDay = normalizeByDayList(weeklyOn[1], weekStartCode);
        return { kind: "WEEKLY", interval: 1, byDay: byDay.length ? byDay : null };
      }
      // 5b) "every N weeks (on …)?"
      m = t.match(/^every (\d+)\s*weeks?(?:\s*on\s*(.+))?$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const byDay = m[2] ? normalizeByDayList(m[2], weekStartCode) : null;
        return { kind: "WEEKLY", interval, byDay: (byDay && byDay.length) ? byDay : null };
      }
      // 5c) "weekly on …"
      m = t.match(/^weekly on (.+)$/);
      if (m) {
        const byDay = normalizeByDayList(m[1], weekStartCode);
        if (byDay.length) return { kind: "WEEKLY", interval: 1, byDay };
      }
      // 5d) Bare "every <list/range/shorthand>"
      if (t.startsWith("every ")) {
        const after = t.slice(6).trim();
        const byDay = normalizeByDayList(after, weekStartCode);
        if (byDay.length) return { kind: "WEEKLY", interval: 1, byDay };
        // also accept "every monday(s)" etc. via your earlier path already handled above
      }

      // 6) Monthly: explicit EOM
      if (t === "last day of the month" || t === "last day of each month" || t === "eom")
        return { kind: "MONTHLY_LAST_DAY" };

      // 7) Monthly: semimonthly / multi-day
      m = t.match(/^(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:,|and|&)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const d1 = parseInt(m[1], 10), d2 = parseInt(m[2], 10);
        return { kind: "MONTHLY_MULTI_DAY", days: [d1, d2] };
      }
      m = t.match(/^(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+and\s+last\s+day\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const d = parseInt(m[1], 10);
        return { kind: "MONTHLY_MIXED_DAY", days: [d], last: true };
      }
      m = t.match(/^on\s+the\s+(.+)\s+of\s+(?:each|every)\s+month$/);
      if (m) {
        const parts = splitList(m[1].replace(/\b(?:and|&)\b/g, ","));
        const days = parts
          .map(x => x.replace(/(st|nd|rd|th)$/i, ""))
          .map(x => parseInt(x, 10))
          .filter(n => Number.isInteger(n) && n >= 1 && n <= 31);
        if (days.length >= 1) return { kind: "MONTHLY_MULTI_DAY", days };
      }

      // 8) Monthly: your existing single-day variants
      if (t === "monthly") return { kind: "MONTHLY_DAY", day: todayLocal().getDate() };
      m = t.match(/^every month on day (\d{1,2})$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };
      m = t.match(/^(?:the\s+)?(\d{1,2}|1st|2nd|3rd|4th)\s+day\s+of\s+(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: ordFromText(m[1]) };
      m = t.match(/^day\s+(\d{1,2})\s+(?:of|in)?\s*(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_DAY", day: parseInt(m[1], 10) };

      // 9) Monthly: ordinal weekday (incl. compact), plus penultimate/weekday
      m = t.match(/^(?:every month on the|on the|every month the|the)\s+(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        if (dow) return { kind: "MONTHLY_NTH", nth, dow };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth)\s+and\s+(1st|first|2nd|second|3rd|third|4th|fourth)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const nths = [m[1].toLowerCase(), m[2].toLowerCase()];
        const dow = dowFromAlias(m[3]);
        if (dow) return { kind: "MONTHLY_MULTI_NTH", nths, dow };
      }
      m = t.match(/^(?:second\s+last|penultimate)\s+([a-z]+)\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) {
        const dow = dowFromAlias(m[1]);
        if (dow) return { kind: "MONTHLY_NTH_FROM_END", nth: 2, dow };
      }
      m = t.match(/^(first|last)\s+weekday\s+(?:of\s+)?(?:each|every)\s+month$/);
      if (m) return { kind: "MONTHLY_NTH_WEEKDAY", nth: m[1].toLowerCase() };

      // 10) Every N months (date or ordinal weekday)
      m = t.match(/^every (\d+)\s*months?(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const day = m[2] ? parseInt(m[2], 10) : todayLocal().getDate();
        return { kind: "MONTHLY_DAY", interval, day };
      }
      m = t.match(/^every (\d+)\s*months?\s+on\s+the\s+(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)$/);
      if (m) {
        const interval = parseInt(m[1], 10);
        const nth = m[2].toLowerCase();
        const dow = dowFromAlias(m[3]);
        if (dow) return { kind: "MONTHLY_NTH", interval, nth, dow };
      }

      // 11) Quarterly / semiannual / annual synonyms
      const yearlyKeyword = t.match(/^(annually|yearly|every year)$/);
      if (yearlyKeyword) {
        return { kind: "YEARLY" };
      }

      // 12) Yearly: explicit month/day or ordinal weekday-in-month
      m = t.match(/^(?:every|each)\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
      if (m) {
        const month = monthFromText(m[1]);
        const day = parseInt(m[2], 10);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^every\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^on\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(?:every\s+year|annually|yearly)$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
      if (m) {
        const month = monthFromText(m[1]);
        const day = parseInt(m[2], 10);
        if (month && day) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(?:every\s+year)?$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = monthFromText(m[2]);
        if (month && day) return { kind: "YEARLY", month, day };
      }
      m = t.match(/^(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+([a-z]+)\s+of\s+([a-z]+)\s+(?:every\s+year|annually|yearly)?$/);
      if (m) {
        const nth = m[1].toLowerCase();
        const dow = dowFromAlias(m[2]);
        const month = monthFromText(m[3]);
        if (dow && month) return { kind: "YEARLY_NTH", month, nth, dow };
      }

      // No match
      return null;
    }

    function resolveMonthlyInterval(rule) {
      const raw = Number.parseInt(rule?.interval, 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }

    function resolveMonthlyDay(rule, meta) {
      if (Number.isInteger(rule?.day) && rule.day >= 1) return rule.day;
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getDate();
      return todayLocal().getDate();
    }

    function computeNextDue(meta, set, depth = 0, ruleOverride = null) {
      const rule = ruleOverride || parseRuleText(meta.repeat, set);
      if (rule) {
        clearRepeatParseFailure(meta?.uid || null);
      }
      if (!rule) {
        console.warn(`[RecurringTasks] Unable to parse repeat rule "${meta.repeat}"`);
        noteRepeatParseFailure(meta?.uid || null);
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
          next = nextWeekly(base, rule, set);
          break;
        case "MONTHLY_DAY": {
          const interval = resolveMonthlyInterval(rule);
          const day = resolveMonthlyDay(rule, meta);
          next = nextMonthOnDay(base, day, interval);
          break;
        }
        case "MONTHLY_NTH": {
          const interval = resolveMonthlyInterval(rule);
          next = nextMonthOnNthDow(base, rule.nth, rule.dow, interval);
          break;
        }
        case "MONTHLY_LAST_DAY":
          next = nextMonthLastDay(base);
          break;
        case "MONTHLY_MULTI_DAY":
          next = nextMonthlyMultiDay(base, rule);
          break;
        case "MONTHLY_MIXED_DAY":
          next = nextMonthlyMixedDay(base, rule);
          break;
        case "MONTHLY_MULTI_NTH":
          next = nextMonthlyMultiNth(base, rule);
          break;
        case "MONTHLY_NTH_FROM_END":
          next = nextMonthlyNthFromEnd(base, rule);
          break;
        case "MONTHLY_NTH_WEEKDAY":
          next = nextMonthlyWeekday(base, rule);
          break;
        case "YEARLY":
          next = nextYearlyOnDay(base, rule, meta);
          break;
        case "YEARLY_NTH":
          next = nextYearlyNthDow(base, rule, meta);
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
    function nextWeekly(base, rule, set) {
      const interval = Math.max(1, rule.interval || 1);
      const weekStartCode =
        (set && (set.weekStartCode || normalizeWeekStartCode(set.weekStart))) || DEFAULT_WEEK_START_CODE;
      if (!rule.byDay || rule.byDay.length === 0) {
        return addDaysLocal(base, 7 * interval);
      }
      const offsets = getOrderedWeekdayOffsets(rule.byDay, weekStartCode);
      if (!offsets.length) return addDaysLocal(base, 7 * interval);
      const weekAnchor = startOfWeek(base, weekStartCode);
      for (const offset of offsets) {
        const candidate = addDaysLocal(weekAnchor, offset);
        if (candidate > base) return candidate;
      }
      const nextAnchor = addDaysLocal(weekAnchor, 7 * interval);
      return addDaysLocal(nextAnchor, offsets[0]);
    }
    function nextMonthOnDay(base, day, interval = 1) {
      const step = Number.isFinite(interval) && interval > 0 ? Math.trunc(interval) : 1;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      const currentMonthCandidate = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
      if (currentMonthCandidate > base && step === 1) return currentMonthCandidate;
      ({ year, month: monthIndex } = advanceMonth(year, monthIndex, step));
      const safeDay = clampDayInMonth(year, monthIndex, day);
      return new Date(year, monthIndex, safeDay, 12, 0, 0, 0);
    }
    function nextMonthOnNthDow(base, nthText, dowCode, interval = 1) {
      const nthValue = ordFromText(nthText);
      if (nthValue == null) return null;
      const step = Number.isFinite(interval) && interval > 0 ? Math.trunc(interval) : 1;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      let candidate = computeNthDowForMonth(year, monthIndex, nthValue, dowCode);
      if (candidate && candidate > base && step === 1) {
        return candidate;
      }
      for (let attempts = 0; attempts < 48; attempts++) {
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, step));
        candidate = computeNthDowForMonth(year, monthIndex, nthValue, dowCode);
        if (candidate) return candidate;
      }
      return null;
    }

    function clampDayInMonth(year, monthIndex, desired) {
      const lastDay = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0).getDate();
      const numeric = Number.isFinite(desired) ? Math.trunc(desired) : lastDay;
      if (numeric < 1) return 1;
      if (numeric > lastDay) return lastDay;
      return numeric;
    }

    function applyOffsetToDate(base, offsetMs) {
      if (!(base instanceof Date) || Number.isNaN(base.getTime())) return null;
      if (!Number.isFinite(offsetMs)) return null;
      const next = new Date(base.getTime() + offsetMs);
      next.setHours(12, 0, 0, 0);
      return next;
    }

    function advanceMonth(year, monthIndex, step) {
      let nextMonth = monthIndex + step;
      let nextYear = year;
      while (nextMonth > 11) {
        nextMonth -= 12;
        nextYear += 1;
      }
      while (nextMonth < 0) {
        nextMonth += 12;
        nextYear -= 1;
      }
      return { year: nextYear, month: nextMonth };
    }

    function nextMonthLastDay(base) {
      const y = base.getFullYear();
      const m = base.getMonth();
      return new Date(y, m + 1, 0, 12, 0, 0, 0);
    }

    function resolveYearlyMonth(rule, meta) {
      if (Number.isInteger(rule?.month) && rule.month >= 1 && rule.month <= 12) {
        return Math.trunc(rule.month);
      }
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getMonth() + 1;
      return todayLocal().getMonth() + 1;
    }

    function resolveYearlyDay(rule, meta) {
      if (Number.isInteger(rule?.day) && rule.day >= 1 && rule.day <= 31) {
        return Math.trunc(rule.day);
      }
      const due = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      if (due) return due.getDate();
      return todayLocal().getDate();
    }

    function nextYearlyOnDay(base, rule, meta) {
      const month = resolveYearlyMonth(rule, meta);
      const day = resolveYearlyDay(rule, meta);
      if (!month || !day) return null;
      const monthIndex = month - 1;
      let year = base.getFullYear();
      const candidate = new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
      if (candidate > base) return candidate;
      year += 1;
      return new Date(year, monthIndex, clampDayInMonth(year, monthIndex, day), 12, 0, 0, 0);
    }

    function nextYearlyNthDow(base, rule, meta) {
      const month = resolveYearlyMonth(rule, meta);
      const nthValue = ordFromText(rule?.nth);
      const dow = rule?.dow;
      if (!month || nthValue == null || !dow) return null;
      const monthIndex = month - 1;
      let year = base.getFullYear();
      let candidate = computeNthDowForMonth(year, monthIndex, nthValue, dow);
      if (candidate && candidate > base) return candidate;
      for (let i = 0; i < 5; i++) {
        year += 1;
        candidate = computeNthDowForMonth(year, monthIndex, nthValue, dow);
        if (candidate) return candidate;
      }
      return null;
    }

    function nextMonthlyMultiNth(base, rule) {
      const dow = rule?.dow;
      const nths = Array.isArray(rule?.nths) ? rule.nths : [];
      if (!dow || !nths.length) return null;
      const ordinalValues = nths
        .map((token) => ordFromText(token))
        .filter((value) => value != null)
        .sort((a, b) => a - b);
      if (!ordinalValues.length) return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const monthCandidates = ordinalValues
          .map((nth) => computeNthDowForMonth(year, monthIndex, nth, dow))
          .filter(Boolean)
          .sort((a, b) => a - b);
        for (const candidate of monthCandidates) {
          if (attempts > 0 || candidate > base) {
            return candidate;
          }
        }
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function nextMonthlyNthFromEnd(base, rule) {
      const nth = Number.isInteger(rule?.nth) ? rule.nth : Number.parseInt(rule?.nth, 10);
      const dow = rule?.dow;
      if (!nth || !dow) return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const candidate = nthDowFromEnd(year, monthIndex, dow, nth);
        if (candidate && (attempts > 0 || candidate > base)) return candidate;
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function nextMonthlyWeekday(base, rule) {
      const nth = (rule?.nth || "").toString().toLowerCase();
      if (nth !== "first" && nth !== "last") return null;
      let year = base.getFullYear();
      let monthIndex = base.getMonth();
      for (let attempts = 0; attempts < 48; attempts++) {
        const candidate =
          nth === "first" ? firstWeekdayOfMonth(year, monthIndex) : lastWeekdayOfMonth(year, monthIndex);
        if (candidate && (attempts > 0 || candidate > base)) return candidate;
        ({ year, month: monthIndex } = advanceMonth(year, monthIndex, 1));
      }
      return null;
    }

    function firstWeekdayOfMonth(year, monthIndex) {
      let d = new Date(year, monthIndex, 1, 12, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        if (!isWeekend(d)) return d;
        d = addDaysLocal(d, 1);
      }
      return null;
    }

    function lastWeekdayOfMonth(year, monthIndex) {
      let d = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        if (!isWeekend(d)) return d;
        d = addDaysLocal(d, -1);
      }
      return null;
    }

    function nextMonthlyMultiDay(base, rule) {
      const list = Array.isArray(rule.days) ? rule.days : [];
      if (!list.length) return null;
      const normalized = list
        .map((token) => (typeof token === "string" ? token.toUpperCase() : token))
        .map((token) => (token === "LAST" ? "LAST" : Number(token)))
        .filter((token) => token === "LAST" || (Number.isInteger(token) && token >= 1 && token <= 31))
        .sort((a, b) => {
          if (a === "LAST") return 1;
          if (b === "LAST") return -1;
          return a - b;
        });
      if (!normalized.length) return null;
      const y = base.getFullYear();
      const m = base.getMonth();
      const day = base.getDate();
      for (const token of normalized) {
        if (token === "LAST") {
          const candidate = new Date(y, m + 1, 0, 12, 0, 0, 0);
          if (candidate.getDate() > day) return candidate;
        } else if (token > day) {
          return new Date(y, m, token, 12, 0, 0, 0);
        }
      }
      const nextMonthBase = new Date(y, m + 1, 1, 12, 0, 0, 0);
      return nextMonthlyMultiDay(nextMonthBase, rule);
    }

    function nextMonthlyMixedDay(base, rule) {
      const days = Array.isArray(rule.days) ? rule.days : [];
      const includeLast = !!rule.last;
      const combined = [...days];
      if (includeLast) combined.push("LAST");
      return nextMonthlyMultiDay(base, { days: combined });
    }
    function nthDowOfMonth(first, dowCode, nth) {
      const target = DOW_IDX.indexOf(dowCode);
      if (target < 0) return null;
      let d = new Date(first.getTime());
      while (d.getDay() !== target) d = addDaysLocal(d, 1);
      d = addDaysLocal(d, 7 * (nth - 1));
      if (d.getMonth() !== first.getMonth()) return null;
      return d;
    }
    function nthDowFromEnd(year, monthIndex, dowCode, nthFromEnd) {
      const target = DOW_IDX.indexOf(dowCode);
      if (target < 0) return null;
      let x = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
      let count = 0;
      while (x.getMonth() === monthIndex) {
        if (x.getDay() === target) {
          count += 1;
          if (count === nthFromEnd) return new Date(x.getTime());
        }
        x = addDaysLocal(x, -1);
      }
      return null;
    }

    function computeNthDowForMonth(year, monthIndex, nthValue, dowCode) {
      if (nthValue == null) return null;
      if (nthValue > 0) {
        return nthDowOfMonth(new Date(year, monthIndex, 1, 12, 0, 0, 0), dowCode, nthValue);
      }
      return nthDowFromEnd(year, monthIndex, dowCode, Math.abs(nthValue));
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
    function startOfWeek(date, weekStartCode) {
      const target = weekStartCode && DOW_IDX.includes(weekStartCode) ? weekStartCode : DEFAULT_WEEK_START_CODE;
      let cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
      for (let i = 0; i < 7 && DOW_IDX[cursor.getDay()] !== target; i++) {
        cursor = addDaysLocal(cursor, -1);
      }
      return cursor;
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
    function stripTimeFromDateText(text) {
      if (!text || typeof text !== "string") return text;
      let t = text.trim();
      // strip "at 3pm" or "at 15:30"
      t = t.replace(/\s+at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, "");
      // strip trailing "3pm" or "15:30"
      t = t.replace(/\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, "");
      // strip time-of-day words
      t = t
        .replace(/\b(morning|afternoon|evening|night)\b/gi, "")
        .replace(/\b(before|by)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, "")
        .replace(/\b(before|by)\s+lunch\b/gi, "")
        .replace(/\blunch\b/gi, "")
        .replace(/\b(noon|midnight)\b/gi, "")
        .replace(/\b(end of day|eod)\b/gi, "")
        .replace(/\bat\b\s*$/gi, "")
        .trim();
      // strip leading "every "
      t = t.replace(/^\s*every\s+/i, "").trim();
      return t.trim();
    }
    function hasTimeOnlyHint(text) {
      if (!text || typeof text !== "string") return false;
      const raw = text.toLowerCase();
      return (
        /\b(before|by)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(raw) ||
        /\b\d{1,2}(:\d{2})?\s*(am|pm)?\b/.test(raw) ||
        /\b(morning|afternoon|evening|night|end of day|eod|lunch)\b/.test(raw) ||
        /\b(before|by)\s+lunch\b/.test(raw) ||
        /\b(noon|midnight)\b/.test(raw)
      );
    }

    function pickAnchorDateFromTimeHint(text, set) {
      if (!text || typeof text !== "string") return todayLocal();
      const raw = text.toLowerCase();
      const m =
        raw.match(/(before|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
        (/\bmorning\b/.test(raw) ? ["", "", "9", "00", "am"] : null) ||
        (/\bafternoon\b/.test(raw) ? ["", "", "14", "00", ""] : null) ||
        (/\bevening\b/.test(raw) ? ["", "", "18", "00", ""] : null) ||
        (/\bnight\b/.test(raw) ? ["", "", "20", "00", ""] : null) ||
        (/\b(end of day|eod)\b/.test(raw) ? ["", "", "17", "00", ""] : null) ||
        (/\blunch\b/.test(raw) ? ["", "", "12", "30", ""] : null) ||
        (/\bnoon\b/.test(raw) ? ["", "", "12", "00", ""] : null) ||
        (/\bmidnight\b/.test(raw) ? ["", "", "00", "00", ""] : null);
      if (!m) return todayLocal();
      let hour = parseInt(m[2], 10);
      const minute = m[3] ? parseInt(m[3], 10) : 0;
      const suffix = m[4]?.toLowerCase();
      if (suffix === "pm" && hour < 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      const anchor = now.getTime() <= target.getTime() ? todayLocal() : addDaysLocal(todayLocal(), 1);
      return anchor;
    }

    function parseWeekSpan(text, set) {
      if (!text || typeof text !== "string") return null;
      const raw = text.toLowerCase();
      if (!/\b(this week|sometime this week|later this week|start of this week|end of the week|end of week|before the end of the week)\b/.test(raw))
        return null;
      const start = startOfWeek(todayLocal(), set?.weekStartCode);
      const due = addDaysLocal(start, 6);
      return { start, due };
    }

    function parseWeekendSpan(text, set) {
      if (!text || typeof text !== "string") return null;
      const raw = text.toLowerCase();
      if (!/\b(this weekend|next weekend)\b/.test(raw)) return null;
      const now = new Date();
      const dow = now.getDay(); // 0 Sun .. 6 Sat
      const baseStart = startOfWeek(todayLocal(), set?.weekStartCode);
      const isLateSunday = raw.includes("this weekend") && dow === 0 && now.getHours() >= 12;
      const weekOffset = raw.includes("next weekend") || isLateSunday ? 7 : 0;
      const saturday = addDaysLocal(baseStart, weekOffset + 5);
      const sunday = addDaysLocal(saturday, 1);
      return { start: saturday, due: sunday };
    }
    function parseRelativeDateText(s, weekStartCode = DEFAULT_WEEK_START_CODE) {
      if (!s || typeof s !== "string") return null;
      let raw = s.trim().toLowerCase();
      if (!raw) return null;
      if (raw.startsWith("[[") && raw.endsWith("]]")) {
        raw = raw.slice(2, -2).trim();
      }
      if (raw === "today") return todayLocal();
      if (/^tomor+ow$/.test(raw) || raw === "tmr" || raw === "tmrw") {
        return addDaysLocal(todayLocal(), 1);
      }
      if (raw === "tonight") {
        return todayLocal();
      }
      if (raw === "next month") {
        const now = todayLocal();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = new Date(y, m + 1, 1, 12, 0, 0, 0);
        return d;
      }
      const nextMonthMatch = raw.match(/^(early|mid|late)\s+next\s+([a-z]+)$/);
      if (nextMonthMatch) {
        const descriptor = nextMonthMatch[1];
        const monthName = nextMonthMatch[2];
        const monthIndex = MONTH_MAP[monthName];
        if (monthIndex != null) {
          const now = todayLocal();
          const year = now.getFullYear() + (monthIndex - 1 < now.getMonth() ? 1 : 0);
          const day = descriptor === "early" ? 5 : descriptor === "mid" ? 15 : 25;
          return new Date(year, monthIndex - 1, day, 12, 0, 0, 0);
        }
      }
      const earlyMonthMatch = raw.match(/^(?:early|mid|late)\s+([a-z]+)$/);
      if (earlyMonthMatch) {
        const monthName = earlyMonthMatch[1];
        const monthIndex = MONTH_MAP[monthName];
        if (monthIndex != null) {
          const now = todayLocal();
          const year = now.getFullYear() + (monthIndex - 1 < now.getMonth() ? 1 : 0);
          const day = raw.startsWith("early") ? 5 : raw.startsWith("mid") ? 15 : 25;
          return new Date(year, monthIndex - 1, day, 12, 0, 0, 0);
        }
      }
      const nextWeekMatch = raw.match(/^(early|mid|late)\s+next\s+week$/);
      if (nextWeekMatch) {
        const descriptor = nextWeekMatch[1];
        const anchor = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
        if (descriptor === "early") return anchor;
        if (descriptor === "mid") return addDaysLocal(anchor, 3);
        return addDaysLocal(anchor, 5);
      }
      if (raw === "next week") {
        const anchor = todayLocal();
        const thisWeekStart = startOfWeek(anchor, weekStartCode);
        return addDaysLocal(thisWeekStart, 7);
      }
      const thisWeekMatch = raw.match(/^(?:sometime|later|early)\s+this\s+week$/);
      if (thisWeekMatch) {
        const anchor = startOfWeek(todayLocal(), weekStartCode);
        if (/early/.test(raw)) return anchor;
        if (/later/.test(raw)) return addDaysLocal(anchor, 4);
        return anchor;
      }
      const thisDowMatch = raw.match(/^this\s+([a-z]+)$/);
      if (thisDowMatch) {
        const dowCode = dowFromAlias(thisDowMatch[1]);
        if (dowCode) {
          const today = todayLocal();
          const todayIdx = today.getDay(); // 0 Sun .. 6 Sat
          const targetIdx = DOW_IDX.indexOf(dowCode);
          let delta = targetIdx - todayIdx;
          if (delta <= 0) delta += 7;
          return addDaysLocal(today, delta);
        }
      }
      const theFirstMatch = raw.match(/^the\s+first(?:\s+of)?\s+every\s+month$/);
      if (theFirstMatch) {
        const now = todayLocal();
        const y = now.getFullYear();
        const m = now.getMonth();
        const todayDay = now.getDate();
        // if past the first, move to next month
        const targetMonth = todayDay > 1 ? m + 1 : m;
        return new Date(y, targetMonth, 1, 12, 0, 0, 0);
      }
      const nextDowMatch = raw.match(/^next\s+([a-z]+)$/);
      if (nextDowMatch) {
        const dowCode = dowFromAlias(nextDowMatch[1]);
        if (dowCode) return nextDowDate(todayLocal(), dowCode);
      }
      const weekdayCode = dowFromAlias(raw);
      if (weekdayCode) return nextDowDate(todayLocal(), weekdayCode);
      if (raw === "this weekend") {
        const now = new Date();
        const dow = now.getDay(); // 0 Sun .. 6 Sat
        if (dow === 0 && now.getHours() >= 12) {
          const anchorNext = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
          return addDaysLocal(anchorNext, 5);
        }
        const anchor = startOfWeek(todayLocal(), weekStartCode);
        // weekend = Saturday of this week
        return addDaysLocal(anchor, 5);
      }
      if (raw === "next weekend") {
        const anchor = addDaysLocal(startOfWeek(todayLocal(), weekStartCode), 7);
        return addDaysLocal(anchor, 5);
      }
      return null;
    }
    function nextDowDate(anchor, dowCode) {
      if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) return null;
      if (!dowCode || !DOW_IDX.includes(dowCode)) return null;
      const current = DOW_IDX[anchor.getDay()];
      const curIdx = DOW_IDX.indexOf(current);
      const targetIdx = DOW_IDX.indexOf(dowCode);
      let delta = targetIdx - curIdx;
      if (delta <= 0) delta += 7;
      return addDaysLocal(anchor, delta);
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
    const TODO_MACRO_PREFIX_RE = /^\s*\{\{\s*(?:\[\[\s*TODO\s*\]\]|TODO)\s*\}\}\s*/i;
    const TODO_WORD_PREFIX_RE = /^\s*TODO\s+/i;
    const DONE_MACRO_PREFIX_RE = /^\s*\{\{\s*(?:\[\[\s*(?:DONE)\s*\]\]|DONE)\s*\}\}\s*/i;
    const DONE_WORD_PREFIX_RE = /^\s*DONE\s+/i;

    function normalizeToTodoMacro(s) {
      var t = s.replace(/^\s+/, "");
      if (/^\-\s+/.test(t)) t = t.replace(/^\-\s+/, "");
      // Match {{[[TODO]]}}, {{TODO}}, {{ [[DONE]] }}, etc.
      t = t.replace(/^\{\{\s*(?:\[\[(?:TODO|DONE)\]\]|(?:TODO|DONE))\s*\}\}\s*/i, "");
      t = t.replace(/^(?:TODO|DONE)\s+/i, "");
      return "{{[[TODO]]}} " + t;
    }

    function isBlockCompleted(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      return DONE_MACRO_PREFIX_RE.test(text) || DONE_WORD_PREFIX_RE.test(text);
    }

    function isTaskBlock(block) {
      const text = (block?.string || "").trim();
      if (!text) return false;
      return (
        TODO_MACRO_PREFIX_RE.test(text) ||
        TODO_WORD_PREFIX_RE.test(text) ||
        DONE_MACRO_PREFIX_RE.test(text) ||
        DONE_WORD_PREFIX_RE.test(text)
      );
    }

    function formatTodoStateString(text, state = "TODO") {
      const base = normalizeToTodoMacro(text || "");
      if (state === "DONE") {
        return base.replace("{{[[TODO]]}}", "{{[[DONE]]}}");
      }
      return base;
    }

    async function setTaskTodoState(uid, state = "TODO") {
      const block = await getBlock(uid);
      if (!block) return;
      const alreadyDone = isBlockCompleted(block);
      if (state === "DONE" && alreadyDone) return;
      if (state === "TODO" && !alreadyDone) return;
      const next = formatTodoStateString(block.string || "", state);
      if (next === block.string) return;
      await updateBlockString(uid, next);
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

    async function ensureInlineAttribute(block, key, value, options = {}) {
      if (!block || !block.uid) return;
      const original = block.string || "";
      const candidateKeys = Array.from(new Set([key, ...(options.aliases || [])]));
      let current = original;
      for (const candidate of candidateKeys) {
        const keyEsc = escapeRegExp(candidate);
        const hasAttr = new RegExp(`${keyEsc}::`, "i").test(current);
        if (!hasAttr) continue;
        const next = replaceAttributeInString(current, candidate, value);
        if (next && next !== current) {
          await updateBlockString(block.uid, next);
          block.string = next;
          current = next;
        }
        return;
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
          class: 'betterTasks',
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title: "Better Tasks",
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
            .iziToast.betterTasks .iziToast-body {
              display: flex;
              align-items: center;
            }
          `;
          document.head.appendChild(style);
        }
        */

    function toast(msg) {
      if (!msg) return;
      try {
        // Ensure only one toast is visible at a time
        iziToast.destroy();

        iziToast.show({
          theme: "light",
          color: "black",
          message: String(msg),
          class: "betterTasks",
          position: "center",
          close: false,
          timeout: 3000,
          closeOnClick: true,
          displayMode: 1, // single-instance behaviour
        });
      } catch (err) {
        console.warn("[BetterTasks] toast failed", err);
      }
    }

    function showPersistentToast(msg) {
      try {
        // Clear any existing toasts (including older AI-status toasts)
        iziToast.destroy();

        return iziToast.show({
          theme: "light",
          color: "black",
          message: String(msg),
          class: "betterTasks",
          position: "center",
          id: "betterTasks-ai-pending",
          close: true,
          timeout: false,
          closeOnClick: true,
          displayMode: 1,
        });
      } catch (err) {
        console.warn("[BetterTasks] showPersistentToast failed", err);
        return null;
      }
    }

    function hideToastInstance(instance) {
      const fallbackId = "betterTasks-ai-pending";
      const targetEl =
        (instance && instance.toastRef) ||
        (instance && instance.toast) ||
        (instance && instance.el) ||
        (typeof instance === "string" ? document.getElementById(instance) : null) ||
        document.getElementById(fallbackId);
      if (!targetEl) return;
      try {
        iziToast.hide({ transitionOut: "fadeOut" }, targetEl);
      } catch (err) {
        console.warn("[BetterTasks] hideToastInstance failed", err);
      }
      try {
        if (targetEl.id) {
          iziToast.destroy(targetEl.id);
        }
      } catch (_) {
        // best effort cleanup
      }
    }

    function noteRepeatParseFailure(uid) {
      if (!uid || invalidRepeatToasted.has(uid)) return;
      invalidRepeatToasted.add(uid);
      toast("Could not parse the task recurrence pattern. Please check your task and review the README for supported patterns.");
    }

    function clearRepeatParseFailure(uid) {
      if (!uid) return;
      invalidRepeatToasted.delete(uid);
    }

    function noteDueParseFailure(uid) {
      if (!uid || invalidDueToasted.has(uid)) return;
      invalidDueToasted.add(uid);
      toast("Could not parse the task due date. Please ensure it uses Roam's standard date format (e.g. [[November 8th, 2025]]).");
    }

    function clearDueParseFailure(uid) {
      if (!uid) return;
      invalidDueToasted.delete(uid);
    }

    // ========================= Pill UI helpers =========================
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
          class: "betterTasks2",
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
          buttons: [/*
            [
              "<button>Today</button>",
              (instance, toastInstance) => {
                const today = todayLocal();
                const formatted = formatDate(today, S());
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(formatted);
              },
            ],
            [
              "<button>Tomorrow</button>",
              (instance, toastInstance) => {
                const tomorrow = addDaysLocal(todayLocal(), 1);
                const formatted = formatDate(tomorrow, S());
                instance.hide({ transitionOut: "fadeOut" }, toastInstance, "button");
                finish(formatted);
              },
            ],*/
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
        let inputEl = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const dateInputClass = `rt-inline-date-${Date.now()}`;
        const inputHtml = `<input type="date" class="${dateInputClass}" value="${escapeHtml(current)}" />`;
        const shortcutSet = S();
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks2",
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
                const raw =
                  inputEl?.value ??
                  inputs?.[0]?.value ??
                  current ??
                  "";
                const val = raw.trim();
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
          onOpening: (_instance, toastEl) => {
            const input = toastEl.querySelector(`.${dateInputClass}`);
            if (!input) return;
            inputEl = input;
            let row = input.parentElement;
            if (!row || !row.classList.contains("rt-date-inline-wrap")) {
              row = document.createElement("div");
              row.className = "rt-date-inline-wrap";
              input.parentNode?.insertBefore(row, input);
              row.appendChild(input);
            }
            const shortcutWrap = document.createElement("div");
            shortcutWrap.className = "rt-date-shortcuts-inline";
            const makeBtn = (label, offsetDays) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = label;
              btn.addEventListener("click", () => {
                const date = addDaysLocal(todayLocal(), offsetDays);
                const iso = formatIsoDate(date, shortcutSet);
                input.value = iso;
                current = iso;
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              return btn;
            };
            shortcutWrap.appendChild(makeBtn("Today", 0));
            shortcutWrap.appendChild(makeBtn("Tomorrow", 1));
            row.appendChild(shortcutWrap);
          },
          onClosed: () => finish(null),
        });
      });
    }

    function promptForRepeatAndDue(initial = {}) {
      const includeTaskText = true;
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
        start:
          typeof initial.start === "string" && initial.start
            ? initial.start
            : initial.startText || initial.rawStart || "",
        defer:
          typeof initial.defer === "string" && initial.defer
            ? initial.defer
            : initial.deferText || initial.rawDefer || "",
      };
      const initialDueDate = snapshot.due ? parseRoamDate(snapshot.due) : null;
      const initialDueIso =
        initialDueDate instanceof Date && !Number.isNaN(initialDueDate.getTime())
          ? formatIsoDate(initialDueDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.due || "")
            ? snapshot.due
            : "";
      snapshot.dueIso = initialDueIso;
      const initialStartDate = snapshot.start ? parseRoamDate(snapshot.start) : null;
      const initialStartIso =
        initialStartDate instanceof Date && !Number.isNaN(initialStartDate.getTime())
          ? formatIsoDate(initialStartDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.start || "")
            ? snapshot.start
            : "";
      snapshot.startIso = initialStartIso;
      const initialDeferDate = snapshot.defer ? parseRoamDate(snapshot.defer) : null;
      const initialDeferIso =
        initialDeferDate instanceof Date && !Number.isNaN(initialDeferDate.getTime())
          ? formatIsoDate(initialDeferDate, setSnapshot)
          : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.defer || "")
            ? snapshot.defer
            : "";
      snapshot.deferIso = initialDeferIso;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const taskInputHtml = `<label class="rt-input-wrap">Task *<br/><input data-rt-field="task" type="text" placeholder="Task text" value="${escapeHtml(
          snapshot.task || ""
        )}" /></label>`;
        const repeatInputHtml = `<label class="rt-input-wrap">Repeat<br/><input data-rt-field="repeat" type="text" placeholder="Repeat rule (optional)" value="${escapeHtml(
          snapshot.repeat || ""
        )}" /></label>`;
        const dateInputClass = `rt-date-input-${Date.now()}`;
        const startInputHtml = `<label class="rt-input-wrap">Start<br/><input data-rt-field="start" type="date" value="${escapeHtml(
          snapshot.startIso || ""
        )}" /></label>`;
        const deferInputHtml = `<label class="rt-input-wrap">Defer<br/><input data-rt-field="defer" type="date" value="${escapeHtml(
          snapshot.deferIso || ""
        )}" /></label>`;
        const dueInputHtml = `<label class="rt-input-wrap">Due<br/><input data-rt-field="due" type="date" class="${dateInputClass}" value="${escapeHtml(
          snapshot.dueIso || ""
        )}" /></label>`;
        const fieldSelectors = {
          task: 'input[data-rt-field="task"]',
          repeat: 'input[data-rt-field="repeat"]',
          due: 'input[data-rt-field="due"]',
          start: 'input[data-rt-field="start"]',
          defer: 'input[data-rt-field="defer"]',
        };
        const promptMessage = includeTaskText
          ? "Enter the task text, and the optional repeat rule and dates."
          : "Enter an optional repeat rule and dates.";
        const inputs = [];
        if (includeTaskText) {
          inputs.push([
            taskInputHtml,
            "input",
            function (_instance, _toast, input) {
              snapshot.task = input.value;
            },
            true,
          ]);
        }
        const repeatConfig = [
          repeatInputHtml,
          "input",
          function (_instance, _toast, input) {
            snapshot.repeat = input.value;
          },
        ];
        if (!includeTaskText) repeatConfig.push(true);
        inputs.push(repeatConfig);
        inputs.push([
          startInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.startIso = input.value;
            }
          },
        ]);
        inputs.push([
          deferInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.deferIso = input.value;
            }
          },
        ]);
        inputs.push([
          dueInputHtml,
          "input",
          function (_instance, _toast, input) {
            if (input?.type === "date") {
              snapshot.dueIso = input.value;
            }
          },
        ]);
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks2",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          closeOnEscape: true,
          overlay: true,
          title: "Better Tasks",
          icon: "",
          iconText: "✓",
          message: promptMessage,
          inputs,
          buttons: [
            [
              "<button type=\"button\">Save</button>",
              async (instance, toastEl, _btn, _event, inputsArray) => {
                const getFieldValue = (name) => {
                  const el = toastEl?.querySelector(fieldSelectors[name]);
                  const domVal = typeof el?.value === "string" ? el.value : "";
                  if (domVal && domVal.trim()) return domVal.trim();
                  if (Array.isArray(inputsArray)) {
                    const indexMap = includeTaskText
                      ? { task: 0, repeat: 1, start: 2, defer: 3, due: 4 }
                      : { repeat: 0, start: 1, defer: 2, due: 3 };
                    const idx = indexMap[name];
                    if (idx != null && inputsArray[idx]?.value) {
                      const v = String(inputsArray[idx].value).trim();
                      if (v) return v;
                    }
                  }
                  switch (name) {
                    case "task":
                      return (snapshot.task || "").trim();
                    case "repeat":
                      return (snapshot.repeat || "").trim();
                    case "start":
                      return snapshot.startIso || "";
                    case "defer":
                      return snapshot.deferIso || "";
                    case "due":
                      return snapshot.dueIso || "";
                    default:
                      return "";
                  }
                };
                const taskValueRaw = includeTaskText ? getFieldValue("task") : "";
                if (includeTaskText) snapshot.task = taskValueRaw;
                const taskValue = taskValueRaw.trim();
                if (includeTaskText && !taskValue) {
                  toast("Task text is required.");
                  toastEl?.querySelector(fieldSelectors.task)?.focus?.();
                  return;
                }
                const repeatValue = getFieldValue("repeat");
                const dueIso = getFieldValue("due");
                const startIso = getFieldValue("start");
                const deferIso = getFieldValue("defer");
                const normalizedRepeat =
                  repeatValue ? normalizeRepeatRuleText(repeatValue) || repeatValue : "";
                let dueText = null;
                let dueDate = null;
                if (dueIso) {
                  dueDate = parseRoamDate(dueIso);
                  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.due)?.focus?.();
                    return;
                  }
                  dueText = dueIso;
                }
                let startText = null;
                let startDate = null;
                if (startIso) {
                  startDate = parseRoamDate(startIso);
                  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.start)?.focus?.();
                    return;
                  }
                  startText = startIso;
                }
                let deferText = null;
                let deferDate = null;
                if (deferIso) {
                  deferDate = parseRoamDate(deferIso);
                  if (!(deferDate instanceof Date) || Number.isNaN(deferDate.getTime())) {
                    toast("Couldn't parse that date.");
                    toastEl?.querySelector(fieldSelectors.defer)?.focus?.();
                    return;
                  }
                  deferText = deferIso;
                }
                await delay(TOAST_HIDE_DELAY_MS);
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish({
                  repeat: normalizedRepeat || "",
                  repeatRaw: repeatValue,
                  due: dueText,
                  dueDate,
                  start: startText,
                  startDate,
                  defer: deferText,
                  deferDate,
                  taskText: includeTaskText ? taskValue : undefined,
                  taskTextRaw: includeTaskText ? taskValueRaw : undefined,
                });
              },
              true,
            ],
            [
              "<button type=\"button\">Cancel</button>",
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish(null);
              },
            ],
          ],
          onOpened: (_instance, toastEl) => {
            if (!toastEl) return;
            const focusPrimaryInput = () => {
              const selectors = includeTaskText
                ? ["input[data-rt-field=\"task\"]", "input[data-rt-field=\"repeat\"]"]
                : ["input[data-rt-field=\"repeat\"]"];
              for (const selector of selectors) {
                const field = toastEl.querySelector(selector);
                if (field) {
                  field.focus();
                  if (field.setSelectionRange && typeof field.value === "string") {
                    const len = field.value.length;
                    field.setSelectionRange(len, len);
                  }
                  return true;
                }
              }
              return false;
            };
            let attempts = 0;
            const tryFocus = () => {
              attempts += 1;
              if (focusPrimaryInput()) return;
              if (attempts < 5) requestAnimationFrame(tryFocus);
            };
            requestAnimationFrame(tryFocus);

            const handleArrowToPicker = (event) => {
              if (event.key !== "ArrowDown") return;
              const input = event.currentTarget;
              if (!input) return;
              event.preventDefault();
              if (typeof input.showPicker === "function") {
                try {
                  input.showPicker();
                  return;
                } catch (_) { }
              }
              try {
                input.focus();
                input.click();
              } catch (_) { }
            };
            for (const key of ["start", "defer", "due"]) {
              toastEl.querySelectorAll(fieldSelectors[key])?.forEach((input) => {
                input.addEventListener("keydown", handleArrowToPicker);
              });
            }
          },
          onClosed: () => finish(null),
        });
      });
    }

    async function ensureAdvancePreference(uid, block, meta, set, checkbox) {
      const existing = normalizeAdvanceValue(meta.advanceFrom);
      if (existing) return existing;
      const choice = await promptAdvanceModeSelection(meta, set);
      if (!choice) {
        await revertBlockCompletion(block);
        if (checkbox) checkbox.checked = false;
        toast("Better Task completion cancelled.");
        if (activeDashboardController) {
          await activeDashboardController.notifyBlockChange?.(uid);
          if (activeDashboardController.isOpen?.()) {
            await activeDashboardController.refresh?.({ reason: "advance-cancel" });
          }
        }
        return null;
      }
      await ensureAdvanceChildAttr(uid, choice, meta, set.attrNames);
      meta.advanceFrom = choice;
      return choice;
    }

    async function promptAdvanceModeSelection(meta, set) {
      const rule = parseRuleText(meta.repeat, set);
      const dueSet = { ...set, advanceFrom: "due" };
      const completionSet = { ...set, advanceFrom: "completion" };
      const previewLimit = determineAdvancePreviewLimit(rule);
      const duePreview = previewOccurrences(meta, dueSet, previewLimit);
      const completionPreview = previewOccurrences(meta, completionSet, previewLimit);
      const message = `
        <div class="rt-advance-choice">
          <p>Select how this series should schedule future occurrences.</p>
          <p><strong>Due date</strong>: ${escapeHtml(formatPreviewDates(duePreview, set))}</p>
          <p><strong>Completion date</strong>: ${escapeHtml(formatPreviewDates(completionPreview, set))}</p>
          <p class="rt-note">You can change this later by editing the <code>${ADVANCE_ATTR}</code> child block.</p>
        </div>
      `;
      return new Promise((resolve) => {
        let resolved = false;
        const finish = (value) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };
        iziToast.question({
          theme: "light",
          color: "black",
          layout: 2,
          class: "betterTasks",
          position: "center",
          drag: false,
          timeout: false,
          close: true,
          overlay: true,
          title: "Choose scheduling mode",
          message,
          buttons: [
            [
              "<button>Due date</button>",
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish("due");
              },
              true,
            ],
            [
              "<button>Completion date</button>",
              (instance, toastEl) => {
                instance.hide({ transitionOut: "fadeOut" }, toastEl, "button");
                finish("completion");
              },
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

    function determineAdvancePreviewLimit(rule) {
      if (!rule) return 1;
      if (rule.kind === "WEEKLY" && Array.isArray(rule.byDay) && rule.byDay.length > 1) {
        return Math.min(rule.byDay.length, 3);
      }
      return 1;
    }

    function previewOccurrences(meta, setOverride, limit = 1) {
      const clone = cloneMetaForPreview(meta);
      const dates = [];
      for (let i = 0; i < limit; i++) {
        const next = computeNextDue(clone, setOverride);
        if (!(next instanceof Date)) break;
        dates.push(new Date(next.getTime()));
        clone.due = new Date(next.getTime());
      }
      return dates;
    }

    function cloneMetaForPreview(meta) {
      return {
        uid: meta.uid,
        repeat: meta.repeat,
        due: meta.due ? new Date(meta.due.getTime()) : null,
        start: meta.start ? new Date(meta.start.getTime()) : null,
        defer: meta.defer ? new Date(meta.defer.getTime()) : null,
        childAttrMap: clonePlain(meta.childAttrMap || {}),
        props: clonePlain(meta.props || {}),
        advanceFrom: meta.advanceFrom || null,
      };
    }

    function formatPreviewDates(dates, set) {
      if (!dates.length) return "Not available";
      if (dates.length === 1) return formatFriendlyDate(dates[0], set);
      return dates.map((d) => formatFriendlyDate(d, set)).join(" → ");
    }

    function handleAttributeNameChange() {
      repeatOverrides.clear();
      scheduleSurfaceSync(lastAttrSurface);
    }

    function scheduleSurfaceSync(surface) {
      if (pendingSurfaceSync) clearTimeout(pendingSurfaceSync);
      pendingSurfaceSync = setTimeout(() => {
        pendingSurfaceSync = null;
        const current = lastAttrSurface || surface || "Child";
        void syncPillsForSurface(current);
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
        .rt-pill-due,
        .rt-pill-start,
        .rt-pill-defer {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .rt-pill-icon {
          font-size: 11px;
          line-height: 1;
          opacity: 0.8;
        }
        .rt-pill-text {
          line-height: 1.2;
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

    function renderPillDateSpan(span, { icon, date, set, label, tooltip }) {
      if (!span) return;
      span.textContent = "";
      if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "rt-pill-icon";
        iconEl.textContent = icon;
        iconEl.setAttribute("aria-hidden", "true");
        span.appendChild(iconEl);
      }
      const textEl = document.createElement("span");
      textEl.className = "rt-pill-text";
      const formatted = formatPillDateText(date, set);
      textEl.textContent = formatted;
      span.appendChild(textEl);
      if (tooltip) span.title = tooltip;
      if (label) span.setAttribute("aria-label", `${label}: ${formatted}`);
    }

    function formatPillDateText(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      const today = todayLocal();
      const diffMs = date.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays >= 0 && diffDays <= 7) {
        return new Intl.DateTimeFormat(set.locale || undefined, { weekday: "short" }).format(date);
      }
      return new Intl.DateTimeFormat(set.locale || undefined, { month: "short", day: "numeric" }).format(date);
    }

    async function syncPillsForSurface(surface) {
      if (!surface) return;
      ensurePillStyles();
      const root = document.body || document;
      if (!root) return;
      try {
        const once = () => Promise.resolve(decorateBlockPills(root));
        await once();
        await new Promise((resolve) => requestAnimationFrame(() => once().then(resolve, resolve)));
        await new Promise((resolve) => setTimeout(() => once().then(resolve, resolve), 50));
      } catch (err) {
        console.warn("[RecurringTasks] pill decoration failed", err);
      }
    }

    async function decorateBlockPills(rootEl) {
      const selector = ".rm-block-main, .roam-block-container, .roam-block";
      const nodes = rootEl.matches?.(selector)
        ? [rootEl]
        : Array.from(rootEl.querySelectorAll?.(selector) || []);
      const seen = new Set();
      const set = S();
      const attrNames = set.attrNames;
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
          clearPendingPillTimer(uid);

          if (seen.has(uid)) {
            if (main.querySelector?.(".rt-pill-wrap")) continue;
            schedulePillRefresh(main, uid, 60);
            continue;
          }
          seen.add(uid);

          const isFocused = !!main.querySelector?.(".rm-block__input--active, .rm-block__input--focused");
          if (isFocused) {
            schedulePillRefresh(main, uid, 120);
          }

          const block = await getBlock(uid);
          if (!block) continue;
          if (isTaskInCodeBlock(block)) continue;
          activeDashboardController?.notifyBlockChange?.(uid);

          const originalString = block.string;
          const meta = await readRecurringMeta(block, set);
          const hasTiming = !!meta.hasTimingAttrs;
          const isRecurring = !!meta.repeat;
          if (!isRecurring && !hasTiming) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            continue;
          }
          if (isBlockCompleted(block)) {
            main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());
            continue;
          }
          const inlineAttrs = parseAttrsFromBlockText(block.string || "");
          const inlineRepeatVal = pickInlineAttr(inlineAttrs, attrNames.repeatAliases);
          const inlineDueVal = pickInlineAttr(inlineAttrs, attrNames.dueAliases);
          const inlineStartVal = pickInlineAttr(inlineAttrs, attrNames.startAliases);
          const inlineDeferVal = pickInlineAttr(inlineAttrs, attrNames.deferAliases);

          const caret = main.querySelector?.(".rm-caret");
          const caretClosed = caret?.classList?.contains("rm-caret-right");
          const caretOpen = caret?.classList?.contains("rm-caret-down");
          const inlineCaretOpen = caret?.getAttribute?.("aria-expanded") === "true";
          const inlineCaretClosed = caret?.getAttribute?.("aria-expanded") === "false";
          const childrenContainer =
            main.querySelector?.(":scope > .rm-block__children") ||
            main.querySelector?.(":scope > .rm-block-children");
          const childrenVisible = isChildrenVisible(childrenContainer);
          const isOpen =
            block.open === true ||
              inlineCaretOpen ||
              caretOpen ||
              childrenVisible
              ? true
              : block.open === false || inlineCaretClosed || caretClosed
                ? false
                : childrenContainer
                  ? childrenVisible
                  : false;

          main.querySelectorAll(".rt-pill-wrap")?.forEach((el) => el.remove());

          if (isOpen) {
            continue;
          }

          const humanRepeat = meta.repeat || inlineRepeatVal || "";
          const startDate = meta.start || (inlineStartVal ? parseRoamDate(inlineStartVal) : null);
          const deferDate = meta.defer || (inlineDeferVal ? parseRoamDate(inlineDeferVal) : null);
          const dueDate =
            meta.due ||
            (inlineDueVal ? parseRoamDate(inlineDueVal) : null);
          const startDisplay = startDate ? formatFriendlyDate(startDate, set) : null;
          const deferDisplay = deferDate ? formatFriendlyDate(deferDate, set) : null;
          const dueDisplay = dueDate ? formatFriendlyDate(dueDate, set) : null;
          const tooltipParts = [];
          if (startDate) tooltipParts.push(`Start: ${formatIsoDate(startDate, set)}`);
          if (deferDate) tooltipParts.push(`Defer: ${formatIsoDate(deferDate, set)}`);
          if (dueDate) tooltipParts.push(`Next: ${formatIsoDate(dueDate, set)}`);
          const tooltip = tooltipParts.length
            ? tooltipParts.join(" • ")
            : isRecurring
              ? "Repeating Better Task"
              : "Scheduled Better Task";

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

          let repeatSpan = null;
          let startSpan = null;
          let deferSpan = null;
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
              (repeatSpan && target === repeatSpan) ||
              (startSpan && target === startSpan) ||
              (deferSpan && target === deferSpan) ||
              (dueSpan && target === dueSpan) ||
              target === menuBtn
            ) {
              return;
            }
            showPillMenu({ uid, set, isRecurring });
          });

          if (isRecurring && humanRepeat) {
            repeatSpan = document.createElement("span");
            repeatSpan.className = "rt-pill-repeat";
            repeatSpan.textContent = `↻ ${humanRepeat}`;
            repeatSpan.title = `Repeat rule: ${humanRepeat}`;
            repeatSpan.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRepeatEdit(e, { uid, set, meta, span: repeatSpan });
            });

            pill.appendChild(repeatSpan);
          }

          const addSeparator = () => {
            const sep = document.createElement("span");
            sep.className = "rt-pill-separator";
            sep.textContent = " · ";
            pill.appendChild(sep);
          };

          if (startDisplay) {
            if (repeatSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            startSpan = document.createElement("span");
            startSpan.className = "rt-pill-start";
            renderPillDateSpan(startSpan, {
              icon: START_ICON,
              date: startDate,
              set,
              label: "Start",
              tooltip: `Start: ${formatIsoDate(startDate, set)}`,
            });
            startSpan.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              handleStartClick(e, { uid, set, span: startSpan });
            });
            pill.appendChild(startSpan);
          }

          if (deferDisplay) {
            if (repeatSpan || startSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            deferSpan = document.createElement("span");
            deferSpan.className = "rt-pill-defer";
            renderPillDateSpan(deferSpan, {
              icon: DEFER_ICON,
              date: deferDate,
              set,
              label: "Defer",
              tooltip: `Defer: ${formatIsoDate(deferDate, set)}`,
            });
            deferSpan.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDeferClick(e, { uid, set, span: deferSpan });
            });
            pill.appendChild(deferSpan);
          }

          if (dueDisplay) {
            if (repeatSpan || startSpan || deferSpan) addSeparator();
            else if (pill.childElementCount > 0) addSeparator();

            dueSpan = document.createElement("span");
            dueSpan.className = "rt-pill-due";
            renderPillDateSpan(dueSpan, {
              icon: DUE_ICON,
              date: dueDate,
              set,
              label: "Due",
              tooltip: `Due: ${formatIsoDate(dueDate, set)}`,
            });
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
          menuBtn.title = "More task actions";
          menuBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showPillMenu({ uid, set, isRecurring });
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
      const attrNames = set.attrNames;
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
      const dueDateToPersist = priorDue || null;
      const updates = { repeat: normalized };
      if (dueDateToPersist) {
        updates.due = formatDate(dueDateToPersist, set);
      }
      await updateBlockProps(uid, updates);
      const repeatRes = await ensureChildAttrForType(uid, "repeat", normalized, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      setMetaChildAttr(meta, "repeat", { uid: repeatRes.uid, value: normalized }, attrNames);
      if (dueDateToPersist) {
        const dueRes = await ensureChildAttrForType(uid, "due", updates.due, attrNames);
        setMetaChildAttr(meta, "due", { uid: dueRes.uid, value: updates.due }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "due", attrNames);
        clearMetaChildAttr(meta, "due", attrNames);
      }
      await ensureInlineAttrForType(block, "repeat", normalized, attrNames);
      if (dueDateToPersist) {
        await ensureInlineAttrForType(block, "due", updates.due, attrNames);
      }
      meta.repeat = normalized;
      meta.due = dueDateToPersist || null;
      mergeRepeatOverride(uid, { repeat: normalized, due: dueDateToPersist || null });
      const currentLocation = captureBlockLocation(block);
      const relocation = {
        moved: false,
        targetUid: currentLocation.parentUid,
      };
      if (span) {
        span.textContent = `↻ ${normalized}`;
        span.title = `Repeat rule: ${normalized}`;
        const pill = span.closest(".rt-pill");
        if (pill) {
          const dueSpanEl = pill.querySelector(".rt-pill-due");
          if (dueDateToPersist && dueSpanEl) {
            const friendly = formatFriendlyDate(dueDateToPersist, set);
            const tooltip = `Due: ${formatIsoDate(dueDateToPersist, set)}`;
            renderPillDateSpan(dueSpanEl, {
              icon: DUE_ICON,
              date: dueDateToPersist,
              set,
              label: "Due",
              tooltip,
            });
            pill.title = tooltip;
          } else {
            pill.title = `Repeat rule: ${normalized}`;
          }
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
      return normalized;
    }

    async function handleStartClick(event, context) {
      await handleFlexibleDateAttrClick(event, { ...context, type: "start" });
    }

    async function handleDeferClick(event, context) {
      await handleFlexibleDateAttrClick(event, { ...context, type: "defer" });
    }

    async function handleFlexibleDateAttrClick(event, context) {
      const { type, uid, set, span, forcePrompt = false, allowCreate = false } = context;
      if (!type || !uid || !set) return;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const attrNames = set.attrNames;
      const currentDate = type === "start" ? meta.start : meta.defer;
      const hasDate = currentDate instanceof Date && !Number.isNaN(currentDate.getTime());
      if (!hasDate && !allowCreate) return;

      const label = type === "start" ? "Start" : "Defer";
      if (event.shiftKey && hasDate && !forcePrompt) {
        await openDatePage(currentDate, { inSidebar: true });
        return;
      }
      const shouldPrompt = forcePrompt || !hasDate || event.altKey || event.metaKey || event.ctrlKey;
      if (shouldPrompt) {
        const existing = hasDate ? formatIsoDate(currentDate, set) : "";
        const nextIso = await promptForDate({
          title: `Edit ${label} Date`,
          message: `Select the ${label.toLowerCase()} date`,
          initial: existing,
        });
        if (!nextIso) return;
        const parsed = parseRoamDate(nextIso);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
          toast("Couldn't parse that date.");
          return;
        }
        const nextStr = formatDate(parsed, set);
        await updateBlockProps(uid, { [type]: nextStr });
        const childInfo = await ensureChildAttrForType(uid, type, nextStr, attrNames);
        await ensureInlineAttrForType(block, type, nextStr, attrNames);
        meta.childAttrMap = meta.childAttrMap || {};
        const existingEntry = getMetaChildAttr(meta, type, attrNames, { allowFallback: false });
        const storedUid = childInfo?.uid || existingEntry?.uid || null;
        setMetaChildAttr(meta, type, { value: nextStr, uid: storedUid }, attrNames);
        meta[type] = parsed;
        if (span) {
          renderPillDateSpan(span, {
            icon: type === "start" ? START_ICON : DEFER_ICON,
            date: parsed,
            set,
            label,
            tooltip: `${label}: ${formatIsoDate(parsed, set)}`,
          });
        }
        if (type === "start" || !isValidDateValue(meta.start)) {
          await relocateBlockForPlacement(block, meta, set);
        }
        toast(`${label} → [[${formatRoamDateTitle(parsed)}]]`);
        void syncPillsForSurface(lastAttrSurface);
        return parsed;
      }

      if (hasDate) {
        await openDatePage(currentDate);
      }
    }

    async function handleDueClick(event, context) {
      const { uid, set, span, forcePrompt = false, allowCreate = false } = context;
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const attrNames = set.attrNames;
      const contextSnapshot = prepareDueChangeContext(block, meta, set);
      const due = meta.due;
      const hasDue = due instanceof Date && !Number.isNaN(due?.getTime?.());
      if (!hasDue && !allowCreate) return;
      if (!forcePrompt && event.altKey && (event.metaKey || event.ctrlKey)) {
        await snoozeDeferByDays(uid, set, 1);
        return;
      }
      if (event.shiftKey && hasDue && !forcePrompt) {
        await openDatePage(due, { inSidebar: true });
        return;
      }
      const shouldPrompt = forcePrompt || !hasDue || event.altKey || event.metaKey || event.ctrlKey;
      if (shouldPrompt) {
        const existing = hasDue ? formatIsoDate(due, set) : "";
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
        const dueChildInfo = await ensureChildAttrForType(uid, "due", nextStr, attrNames);
        await ensureInlineAttrForType(block, "due", nextStr, attrNames);
        meta.due = parsed;
        meta.childAttrMap = meta.childAttrMap || {};
        const existingEntry = getMetaChildAttr(meta, "due", attrNames, { allowFallback: false });
        const storedUid = dueChildInfo?.uid || existingEntry?.uid || null;
        setMetaChildAttr(meta, "due", { value: nextStr, uid: storedUid }, attrNames);
        mergeRepeatOverride(uid, { due: parsed });
        if (span) {
          renderPillDateSpan(span, {
            icon: DUE_ICON,
            date: parsed,
            set,
            label: "Due",
            tooltip: `Due: ${formatIsoDate(parsed, set)}`,
          });
          const pill = span.closest?.(".rt-pill");
          if (pill) pill.title = span.title;
        }
        const dueChanged =
          (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== parsed.getTime();
        if (dueChanged) {
          registerDueUndoAction({
            blockUid: uid,
            message: `Due date changed to ${formatRoamDateTitle(parsed)}`,
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
            newDue: new Date(parsed.getTime()),
            newDueStr: nextStr,
            newParentUid: contextSnapshot.previousParentUid,
            wasMoved: false,
            snapshot: contextSnapshot.snapshot,
          });
        }
        void syncPillsForSurface(lastAttrSurface);
        return parsed;
      }
      if (hasDue) {
        await openDatePage(due);
      }
    }

    async function openDatePage(date, options = {}) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
      const dnpTitle = toDnpTitle(date);
      const dnpUid = await getOrCreatePageUid(dnpTitle);
      if (!dnpUid) return;
      const { inSidebar = false } = options;
      if (inSidebar) {
        window.roamAlphaAPI.ui.rightSidebar.addWindow({
          window: { type: "outline", "page-uid": dnpUid, "block-uid": dnpUid },
        });
      } else {
        window.roamAlphaAPI.ui.mainWindow.openPage({ page: { uid: dnpUid } });
      }
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

    function showPillMenu({ uid, set, isRecurring = true }) {
      const menuId = `rt-pill-menu-${uid}-${Date.now()}`;
      const recurringBlock = isRecurring
        ? `
         <button data-action="skip">Skip this occurrence</button>
         <button data-action="generate">Generate next now</button>
          <button data-action="end" data-danger="1">End recurrence</button>
        `
        : "";
      const html = `
        <div class="rt-pill-menu" id="${menuId}">
          <button data-action="snooze-1">Snooze +1 day</button>
         <button data-action="snooze-3">Snooze +3 days</button>
         <button data-action="snooze-next-mon">Snooze to next Monday</button>
         <button data-action="snooze-pick">Snooze (pick date)</button>
         ${recurringBlock}
        </div>
      `;
      iziToast.show({
        theme: "light",
        color: "black",
        class: "betterTasks",
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
          attach('[data-action="snooze-1"]', () => snoozeDeferByDays(uid, set, 1));
          attach('[data-action="snooze-3"]', () => snoozeDeferByDays(uid, set, 3));
          attach('[data-action="snooze-next-mon"]', () => snoozeDeferToNextMonday(uid, set));
          attach('[data-action="snooze-pick"]', () => snoozePickDeferDate(uid, set));
          attach('[data-action="skip"]', () => skipOccurrence(uid, set));
          attach('[data-action="generate"]', () => generateNextNow(uid, set));
          attach('[data-action="end"]', () => endRecurrence(uid, set));
        },
      });
    }

    async function updateDeferDate(uid, set, targetDate, options = {}) {
      if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
      const block = options.block || (await getBlock(uid));
      if (!block) return;
      const meta = options.meta || (await readRecurringMeta(block, set));
      const attrNames = set.attrNames;
      const nextStr = formatDate(targetDate, set);
      await updateBlockProps(uid, { defer: nextStr });
      const deferChildInfo = await ensureChildAttrForType(uid, "defer", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "defer", attrNames, { allowFallback: false });
      const storedUid = deferChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "defer", { value: nextStr, uid: storedUid }, attrNames);
      await ensureInlineAttrForType(block, "defer", nextStr, attrNames);
      meta.defer = targetDate;
      if (!isValidDateValue(meta.start)) {
        await relocateBlockForPlacement(block, meta, set);
      }
      toast(options.toastMessage || `Snoozed to [[${formatRoamDateTitle(targetDate)}]]`);
      void syncPillsForSurface(lastAttrSurface);
    }

    async function snoozeDeferByDays(uid, set, days) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const base = meta.defer || todayLocal();
      const next = addDaysLocal(base, days);
      await updateDeferDate(uid, set, next, { block, meta });
    }

    async function snoozeDeferToNextMonday(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      let cursor = meta.defer || todayLocal();
      for (let i = 0; i < 7; i++) {
        cursor = addDaysLocal(cursor, 1);
        if (cursor.getDay() === 1) break;
      }
      await updateDeferDate(uid, set, cursor, { block, meta });
    }

    async function snoozePickDeferDate(uid, set) {
      const block = await getBlock(uid);
      if (!block) return;
      const meta = await readRecurringMeta(block, set);
      const initial = meta.defer ? formatIsoDate(meta.defer, set) : "";
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
      await updateDeferDate(uid, set, parsed, { block, meta });
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
      const startOffsetMs =
        meta.start instanceof Date && meta.due instanceof Date ? meta.start.getTime() - meta.due.getTime() : null;
      const deferOffsetMs =
        meta.defer instanceof Date && meta.due instanceof Date ? meta.defer.getTime() - meta.due.getTime() : null;
      const nextStartDate = startOffsetMs != null ? applyOffsetToDate(nextDue, startOffsetMs) : null;
      const nextDeferDate = deferOffsetMs != null ? applyOffsetToDate(nextDue, deferOffsetMs) : null;
      const nextStr = formatDate(nextDue, set);
      const nextStartStr = nextStartDate ? formatDate(nextStartDate, set) : null;
      const nextDeferStr = nextDeferDate ? formatDate(nextDeferDate, set) : null;
      await updateBlockProps(uid, {
        due: nextStr,
        start: nextStartStr || undefined,
        defer: nextDeferStr || undefined,
      });
      const attrNames = set.attrNames;
      const dueChildInfo = await ensureChildAttrForType(uid, "due", nextStr, attrNames);
      meta.childAttrMap = meta.childAttrMap || {};
      const existingEntry = getMetaChildAttr(meta, "due", attrNames, { allowFallback: false });
      const storedUid = dueChildInfo?.uid || existingEntry?.uid || null;
      setMetaChildAttr(meta, "due", { value: nextStr, uid: storedUid }, attrNames);
      if (nextStartStr) {
        const startChildInfo = await ensureChildAttrForType(uid, "start", nextStartStr, attrNames);
        setMetaChildAttr(meta, "start", { value: nextStartStr, uid: startChildInfo.uid }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "start", attrNames);
        clearMetaChildAttr(meta, "start", attrNames);
      }
      if (nextDeferStr) {
        const deferChildInfo = await ensureChildAttrForType(uid, "defer", nextDeferStr, attrNames);
        setMetaChildAttr(meta, "defer", { value: nextDeferStr, uid: deferChildInfo.uid }, attrNames);
      } else {
        await removeChildAttrsForType(uid, "defer", attrNames);
        clearMetaChildAttr(meta, "defer", attrNames);
      }
      await ensureInlineAttrForType(block, "due", nextStr, attrNames);
      if (nextStartStr) await ensureInlineAttrForType(block, "start", nextStartStr, attrNames);
      if (nextDeferStr) await ensureInlineAttrForType(block, "defer", nextDeferStr, attrNames);
      meta.due = nextDue;
      meta.start = nextStartDate;
      meta.defer = nextDeferDate;
      mergeRepeatOverride(uid, { due: nextDue });
      const skipAnchor = pickPlacementDate({ start: nextStartDate, defer: nextDeferDate, due: nextDue }) || nextDue;
      const relocation = await relocateBlockForPlacement(
        block,
        { start: nextStartDate, defer: nextDeferDate, due: nextDue },
        set
      );
      const dueChanged =
        (contextSnapshot.previousDueDate ? contextSnapshot.previousDueDate.getTime() : null) !== nextDue.getTime();
      if (dueChanged || relocation.moved) {
        registerDueUndoAction({
          blockUid: uid,
          message: `Skipped to ${formatRoamDateTitle(skipAnchor)}`,
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
      const nextStart =
        meta.start instanceof Date && meta.due instanceof Date
          ? applyOffsetToDate(nextDue, meta.start.getTime() - meta.due.getTime())
          : null;
      const nextDefer =
        meta.defer instanceof Date && meta.due instanceof Date
          ? applyOffsetToDate(nextDue, meta.defer.getTime() - meta.due.getTime())
          : null;
      const anchor = pickPlacementDate({ start: nextStart, defer: nextDefer, due: nextDue }) || nextDue;
      toast(`Next occurrence created (${formatRoamDateTitle(anchor)})`);
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
      const childMap = parseAttrsFromChildBlocks(block.children || []);
      const removalKeys = [set.attrNames.repeatKey, set.attrNames.dueKey, "rt-processed"];
      for (const key of removalKeys) {
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
      const cleaned = removeInlineAttributes(block.string || "", [
        ...new Set([...set.attrNames.repeatRemovalKeys, ...set.attrNames.dueRemovalKeys]),
      ]);
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
        class: "betterTasks",
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
      const set = S();

      const uid = findBlockUidFromElement(evt.target);
      if (!uid) return;

      // Is this block a "repeat:: ..." or "due:: ..." child?
      const child = await getBlock(uid);
      const line = (child?.string || "").trim();
      const m = line.match(ATTR_RE);
      if (!m) return;

      const key = m[1].trim().toLowerCase();
      const attrNames = set.attrNames;
      let attrType = null;
      if (key === attrNames.repeatKey) attrType = "repeat";
      else if (key === attrNames.dueKey) attrType = "due";
      if (!attrType) return;

      // Get parent task uid
      const parentUid = await getParentUid(uid);
      if (!parentUid) return;

      // Debounce per parent to avoid thrashing while typing, remember source event
      if (childEditDebounce.has(parentUid)) clearTimeout(childEditDebounce.get(parentUid));
      const srcType = evt.type;
      childEditDebounce.set(parentUid, setTimeout(() => {
        childEditDebounce.delete(parentUid);
        void syncChildAttrToParent(parentUid, attrType, { sourceEvent: srcType, suppressToast: true });
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

    async function syncChildAttrToParent(parentUid, attrType, opts = {}) {
      const sourceEvent = opts?.sourceEvent || "input";
      const suppressToast = !!opts?.suppressToast;
      const set = S();
      const parent = await getBlock(parentUid);
      if (!parent) return;
      const attrNames = set.attrNames;
      const attrKey = getAttrKey(attrType, attrNames);
      if (deletingChildAttrs.has(`${parentUid}::${attrKey}`)) {
        return;
      }

      // read current child values
      const childMap = parseAttrsFromChildBlocks(parent.children || []);
      const attrLabel = getAttrLabel(attrType, attrNames).toLowerCase();
      const info = childMap[attrLabel] || null;
      const rawValue = (info?.value || "").trim();

      // If empty, only remove after a blur (don't spam while user is typing).
      if (!rawValue) {
        if (sourceEvent !== "blur") {
          return; // wait until editing finishes
        }
        const props = parseProps(parent.props);
        if (props[attrType] !== undefined) {
          delete props[attrType];
          await setBlockProps(parentUid, props);
        }
        await ensureInlineAttrForType(parent, attrType, "", attrNames); // no-op unless inline exists
        // Quietly remove on blur; no toast to avoid noise.
        void syncPillsForSurface(lastAttrSurface);
        return;
      }

      // Normalize and write to props
      if (attrType === "repeat") {
        const normalized = normalizeRepeatRuleText(rawValue) || rawValue;
        const props = parseProps(parent.props);
        if (props.repeat !== normalized) {
          try {
            await updateBlockProps(parentUid, { repeat: normalized });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent repeat update failed", err);
            return;
          }
          await ensureChildAttrForType(parentUid, "repeat", normalized, attrNames);
          await ensureInlineAttrForType(parent, "repeat", normalized, attrNames);
          if (!suppressToast) {
            toast(`Repeat → ${normalized}`);
          }
        }
      } else if (attrType === "due") {
        const props = parseProps(parent.props);
        if (props.due !== rawValue) {
          try {
            await updateBlockProps(parentUid, { due: rawValue });
          } catch (err) {
            console.warn("[RecurringTasks] syncChildAttrToParent due update failed", err);
            return;
          }
          await ensureChildAttrForType(parentUid, "due", rawValue, attrNames);
          await ensureInlineAttrForType(parent, "due", rawValue, attrNames);
          if (!suppressToast) {
            toast(`Due → ${rawValue}`);
          }
        }
      }

      // Refresh pills if needed (only relevant when pills are visible)
      if (!opts?.skipRefresh) {
        void syncPillsForSurface(lastAttrSurface || "Child");
      }
    }

    async function flushChildAttrSync(parentUid, options = {}) {
      if (childEditDebounce.has(parentUid)) {
        clearTimeout(childEditDebounce.get(parentUid));
        childEditDebounce.delete(parentUid);
      }
      const baseOpts = { sourceEvent: "flush", skipRefresh: true, suppressToast: true };
      await syncChildAttrToParent(parentUid, "repeat", { ...baseOpts, ...options });
      await syncChildAttrToParent(parentUid, "due", { ...baseOpts, ...options });
    }

    async function undoTaskCompletion(uid) {
      if (!uid) return;
      try {
        const block = await getBlock(uid);
        if (!block) return;
        const normalized = normalizeToTodoMacro(block.string || "");
        await updateBlockString(uid, normalized);
        const attrNames = lastAttrNames || resolveAttributeNames();
        await removeChildAttrsForType(uid, "completed", attrNames);
        await updateBlockProps(uid, {
          rt: {
            processed: null,
            lastCompleted: null,
          },
        });
        repeatOverrides.delete(uid);
        activeDashboardController?.notifyBlockChange?.(uid);
      } catch (err) {
        console.warn("[RecurringTasks] undoTaskCompletion failed", err);
      }
    }

    function createDashboardController(extensionAPI) {
      const initialState = { tasks: [], status: "idle", error: null, lastUpdated: null };
      let state = { ...initialState };
      const subscribers = new Set();
      let container = null;
      let root = null;
      let refreshPromise = null;
      const DASHBOARD_POSITION_KEY = "betterTasks.dashboard.position";
      let savedPosition =
        typeof window !== "undefined" ? loadSavedDashboardPosition() : null;
      let dragHandle = null;
      let dragPointerId = null;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      let isDraggingDashboard = false;
      let resizeListenerAttached = false;

      const controller = {
        getSnapshot: () => state,
        subscribe,
        ensureInitialLoad,
        refresh,
        open,
        close,
        toggle,
        toggleTask,
        snoozeTask,
        openBlock,
        openPage,
        notifyBlockChange,
        removeTask,
        openSettings,
        isOpen: () => !!root,
        editRepeat,
        editDate,
        openPillMenuForTask,
        removeTaskAttribute,
        dispose,
      };

      function emit() {
        const snapshot = {
          ...state,
          tasks: state.tasks.map((task) => ({ ...task })),
        };
        subscribers.forEach((callback) => {
          try {
            callback(snapshot);
          } catch (err) {
            console.warn("[BetterTasks] dashboard subscriber failed", err);
          }
        });
      }

      function subscribe(listener) {
        if (typeof listener === "function") {
          subscribers.add(listener);
          listener({ ...state, tasks: state.tasks.map((task) => ({ ...task })) });
        }
        return () => subscribers.delete(listener);
      }

      function ensureInitialLoad() {
        if (state.status === "idle" && !refreshPromise) {
          void refresh({ reason: "initial" });
        }
      }

      async function refresh({ reason = "manual" } = {}) {
        if (refreshPromise) return refreshPromise;
        state = {
          ...state,
          status: state.tasks.length ? "refreshing" : "loading",
          error: null,
        };
        emit();
        refreshPromise = collectDashboardTasks()
          .then((tasks) => {
            state = {
              ...state,
              tasks,
              status: "ready",
              error: null,
              lastUpdated: Date.now(),
              lastReason: reason,
            };
            emit();
          })
          .catch((err) => {
            console.error("[BetterTasks] dashboard refresh failed", err);
            state = {
              ...state,
              status: "error",
              error: err,
            };
            emit();
          })
          .finally(() => {
            refreshPromise = null;
          });
        return refreshPromise;
      }

      function ensureContainer() {
        if (container && root) return;
        container = document.createElement("div");
        container.className = "bt-dashboard-host";
        document.body.appendChild(container);
        root = createRoot(container);
        if (!resizeListenerAttached && typeof window !== "undefined") {
          window.addEventListener("resize", handleWindowResize);
          resizeListenerAttached = true;
        }
      }

      function setTopbarActive(active) {
        if (typeof document === "undefined") return;
        const button = document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID);
        if (!button) return;
        if (active) button.classList.add("bt-dashboard-button--active");
        else button.classList.remove("bt-dashboard-button--active");
      }

      function open() {
        ensureContainer();
        root.render(
          <DashboardApp
            controller={controller}
            onRequestClose={close}
            onHeaderReady={registerDragHandle}
          />
        );
        ensureInitialLoad();
        setTopbarActive(true);
        if (savedPosition) {
          requestAnimationFrame(() => {
            applySavedPosition();
          });
        }
      }

      function close() {
        cleanupDragListeners();
        registerDragHandle(null);
        setTopbarActive(false);
        if (root) {
          root.unmount();
          root = null;
        }
        if (container) {
          container.remove();
          container = null;
        }
        if (resizeListenerAttached && typeof window !== "undefined") {
          window.removeEventListener("resize", handleWindowResize);
          resizeListenerAttached = false;
        }
      }

      function toggle() {
        if (root) {
          close();
        } else {
          open();
        }
      }

      async function toggleTask(uid, action) {
        if (!uid) return;
        try {
          if (action === "complete") {
            await setTaskTodoState(uid, "DONE");
          } else {
            await setTaskTodoState(uid, "TODO");
            await undoTaskCompletion(uid);
          }
        } catch (err) {
          console.error("[BetterTasks] toggleTask failed", err);
          toast("Unable to update task.");
        }
        await refresh({ reason: "toggle" });
      }

      async function snoozeTask(uid, preset) {
        if (!uid) return;
        try {
          const set = S();
          if (preset === "pick") {
            await snoozePickDeferDate(uid, set);
          } else if (typeof preset === "number") {
            await snoozeDeferByDays(uid, set, preset);
          } else {
            await snoozeDeferByDays(uid, set, 1);
          }
          activeDashboardController?.notifyBlockChange?.(uid);
        } catch (err) {
          console.error("[BetterTasks] snoozeTask failed", err);
          toast("Could not snooze task.");
        }
        await refresh({ reason: "snooze" });
      }

      function removeTask(uid) {
        if (!uid) return;
        removeDashboardWatch(uid);
        const tasks = state.tasks.filter((task) => task.uid !== uid);
        if (tasks.length === state.tasks.length) return;
        state = { ...state, tasks };
        emit();
      }

      function openBlock(uid, options = {}) {
        if (!uid) return;
        if (options.skipCompletionToast) {
          processedMap.set(uid, Date.now());
          setTimeout(() => processedMap.delete(uid), 2000);
        }
        try {
          window.roamAlphaAPI?.ui?.mainWindow?.openBlock?.({ block: { uid } });
        } catch (err) {
          console.warn("[BetterTasks] openBlock failed", err);
        }
      }

      function openPage(pageUid, options = {}) {
        if (!pageUid) return;
        const { inSidebar = false } = options;
        try {
          if (inSidebar) {
            window.roamAlphaAPI?.ui?.rightSidebar?.addWindow?.({
              window: { type: "outline", "page-uid": pageUid, "block-uid": pageUid },
            });
          } else {
            window.roamAlphaAPI?.ui?.mainWindow?.openPage?.({ page: { uid: pageUid } });
          }
        } catch (err) {
          console.warn("[BetterTasks] openPage failed", err);
        }
      }

      function openSettings() {
        try {
          if (extensionAPI?.settings?.open) {
            extensionAPI.settings.open();
          } else {
            toast("Open the Roam Depot settings for Better Tasks to adjust options.");
          }
        } catch (err) {
          console.warn("[BetterTasks] openSettings failed", err);
        }
      }

      async function notifyBlockChange(uid, options = {}) {
        if (!uid) return;
        try {
          const set = S();
          const block = await getBlock(uid);
          if (!block) {
            removeTask(uid);
            return;
          }
          if (!isTaskBlock(block)) return;
          const meta = await readRecurringMeta(block, set);
          if (!isBetterTasksTask(meta) && !options.bypassFilters) return;
          const task = deriveDashboardTask(block, meta, set);
          if (!task) return;
          const tasks = state.tasks.slice();
          const index = tasks.findIndex((entry) => entry.uid === uid);
          if (index >= 0) {
            tasks[index] = task;
          } else {
            tasks.push(task);
          }
          state = { ...state, tasks: sortDashboardTasksList(tasks) };
          emit();
          ensureDashboardWatch(uid);
        } catch (err) {
          console.warn("[BetterTasks] notifyBlockChange failed", err);
        }
      }

      function dispose() {
        subscribers.clear();
        close();
        state = { ...initialState };
      }

      function registerDragHandle(node) {
        if (dragHandle === node) return;
        if (dragHandle) {
          dragHandle.removeEventListener("pointerdown", handlePointerDown);
          dragHandle.classList.remove("bt-dashboard__header--dragging");
          dragHandle.classList.remove("bt-dashboard__header--draggable");
        }
        dragHandle = node;
        if (dragHandle) {
          dragHandle.classList.add("bt-dashboard__header--draggable");
          dragHandle.addEventListener("pointerdown", handlePointerDown);
        }
      }

      function handlePointerDown(event) {
        if (!container || !dragHandle) return;
        if (event.button !== undefined && event.button !== 0) return;
        const blocker = event.target?.closest?.("button, a, input, textarea, select");
        if (blocker) return;
        isDraggingDashboard = true;
        dragPointerId = event.pointerId;
        const rect = container.getBoundingClientRect();
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        container.classList.add("bt-dashboard-host--dragging");
        dragHandle.classList.add("bt-dashboard__header--dragging");
        if (dragHandle.setPointerCapture && dragPointerId != null) {
          try {
            dragHandle.setPointerCapture(dragPointerId);
          } catch (_) {
            // best effort only
          }
        }
        if (typeof window !== "undefined") {
          window.addEventListener("pointermove", handlePointerMove);
          window.addEventListener("pointerup", handlePointerUp);
        }
        event.preventDefault();
      }

      function handlePointerMove(event) {
        if (!isDraggingDashboard || event.pointerId !== dragPointerId) return;
        if (!container) return;
        const desired = {
          left: event.clientX - dragOffsetX,
          top: event.clientY - dragOffsetY,
        };
        const clamped = clampPosition(desired);
        if (!clamped) return;
        setContainerPosition(clamped);
      }

      function handlePointerUp(event) {
        if (!isDraggingDashboard || event.pointerId !== dragPointerId) return;
        if (dragHandle?.releasePointerCapture && dragPointerId != null) {
          try {
            dragHandle.releasePointerCapture(dragPointerId);
          } catch (_) {
            // ignore release failures
          }
        }
        isDraggingDashboard = false;
        dragPointerId = null;
        container?.classList?.remove("bt-dashboard-host--dragging");
        dragHandle?.classList?.remove("bt-dashboard__header--dragging");
        if (typeof window !== "undefined") {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
        }
        if (savedPosition) {
          persistDashboardPosition(savedPosition);
        }
      }

      function cleanupDragListeners() {
        if (typeof window !== "undefined") {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
        }
        isDraggingDashboard = false;
        dragPointerId = null;
        container?.classList?.remove("bt-dashboard-host--dragging");
        dragHandle?.classList?.remove("bt-dashboard__header--dragging");
      }

      function loadSavedDashboardPosition() {
        if (typeof window === "undefined") return null;
        try {
          const raw = window.localStorage?.getItem(DASHBOARD_POSITION_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed.top === "number" &&
            Number.isFinite(parsed.top) &&
            typeof parsed.left === "number" &&
            Number.isFinite(parsed.left)
          ) {
            return { top: parsed.top, left: parsed.left };
          }
        } catch (err) {
          console.warn("[BetterTasks] failed to read dashboard position", err);
        }
        return null;
      }

      function persistDashboardPosition(pos) {
        if (typeof window === "undefined" || !pos) return;
        try {
          window.localStorage?.setItem(DASHBOARD_POSITION_KEY, JSON.stringify(pos));
        } catch (err) {
          console.warn("[BetterTasks] failed to store dashboard position", err);
        }
      }

      function clampNumber(value, min, max) {
        if (!Number.isFinite(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
      }

      function clampPosition(pos) {
        if (!container || !pos || typeof window === "undefined") return null;
        const margin = 12;
        const rect = container.getBoundingClientRect();
        const width = rect.width || 600;
        const height = rect.height || Math.min(window.innerHeight - margin * 2, 700);
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const left = clampNumber(pos.left, margin, maxLeft);
        const top = clampNumber(pos.top, margin, maxTop);
        return { left, top };
      }

      function setContainerPosition(pos) {
        if (!container || !pos) return;
        container.style.left = `${pos.left}px`;
        container.style.top = `${pos.top}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
        savedPosition = pos;
      }

      function applySavedPosition(options = {}) {
        if (!savedPosition) return;
        const clamped = clampPosition(savedPosition);
        if (!clamped) return;
        setContainerPosition(clamped);
        if (options.persist) {
          persistDashboardPosition(clamped);
        }
      }

      function handleWindowResize() {
        if (!container) return;
        if (savedPosition) {
          applySavedPosition({ persist: true });
        }
      }

      return controller;
    }

    async function editRepeat(uid, event, options = {}) {
      if (!uid) return;
      const set = S();
      const result = await handleRepeatEdit(event || new MouseEvent("click"), { uid, set, span: null });
      if (typeof result === "string" && result) {
        await waitForRepeatState(uid, set, { expectedValue: result }, 6, getBlock, readRecurringMeta);
      }
      await delay(250);
      await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
      await delay(120);
      await activeDashboardController?.refresh?.({ reason: "pill-repeat" });
    }

    async function editDate(uid, type, options = {}) {
      if (!uid || !["start", "defer", "due"].includes(type)) return;
      const set = S();
      const handler =
        type === "start"
          ? handleStartClick
          : type === "defer"
            ? handleDeferClick
            : handleDueClick;
      const intent = options.intent || "direct";
      const forcePrompt = intent === "menu-edit" || intent === "menu-add";
      const allowCreate = intent === "menu-add";
      const baseEvent = options.event || {};
      const syntheticEvent = {
        altKey: !!baseEvent.altKey,
        metaKey: !!baseEvent.metaKey,
        ctrlKey: !!baseEvent.ctrlKey,
        shiftKey: !!baseEvent.shiftKey,
      };
      const resultDate = await handler(syntheticEvent, {
        uid,
        set,
        span: null,
        forcePrompt,
        allowCreate,
      });
      if (resultDate instanceof Date) {
        await waitForAttrDate(uid, type, resultDate, set, 6, getBlock, readRecurringMeta);
      }
      await delay(120);
      await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
      await activeDashboardController?.refresh?.({ reason: `pill-${type}` });
    }

    function openPillMenuForTask(uid) {
      if (!uid) return;
      const set = S();
      showPillMenu({ uid, set });
    }

    async function removeTaskAttribute(uid, type) {
      if (!uid || !["repeat", "start", "defer", "due"].includes(type)) return;
      try {
        const set = S();
        const cleared = await clearAttrForType(uid, type, { set });
        if (cleared) {
          await waitForAttrClear(uid, type, set, 6, getBlock, readRecurringMeta);
          void syncPillsForSurface(lastAttrSurface || "Child");
        }
        await delay(120);
        await activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
        await activeDashboardController?.refresh?.({ reason: `remove-${type}` });
        const labels = {
          repeat: "Repeat rule removed",
          start: "Start date removed",
          defer: "Defer date removed",
          due: "Due date removed",
        };
        toast(labels[type] || "Attribute removed");
      } catch (err) {
        console.error("[BetterTasks] removeTaskAttribute failed", err);
        toast("Unable to remove that attribute.");
      }
    }

    async function collectDashboardTasks() {
      const set = S();
      const [todoRows, doneRows, attrRows] = await Promise.all([
        fetchBlocksByPageRef("TODO"),
        fetchBlocksByPageRef("DONE"),
        fetchBlocksByAttributes(set),
      ]);
      const blockMap = new Map();
      for (const rows of [todoRows, doneRows, attrRows]) {
        for (const row of rows || []) {
          const block = row?.[0];
          if (block?.uid) {
            blockMap.set(block.uid, block);
          }
        }
      }
      const tasks = [];
      for (const block of blockMap.values()) {
        try {
          const meta = await readRecurringMeta(block, set);
          if (!isBetterTasksTask(meta) || !isTaskBlock(block)) continue;
          const task = deriveDashboardTask(block, meta, set);
          if (task) {
            tasks.push(task);
            ensureDashboardWatch(task.uid);
          }
        } catch (err) {
          console.warn("[BetterTasks] deriveDashboardTask failed", err);
        }
      }
      return sortDashboardTasksList(tasks);
    }

    async function fetchBlocksByPageRef(title) {
      const pull = `[:block/uid :block/string :block/props :block/order :block/open
        {:block/children [:block/uid :block/string]}
        {:block/page [:block/uid :node/title]}
        {:block/parents [:block/uid]}]`;
      const query = `
        [:find (pull ?b ${pull})
         :where
           [?b :block/refs ?ref]
           [?ref :node/title "${title}"]]`;
      try {
        return (await window.roamAlphaAPI.q(query)) || [];
      } catch (err) {
        console.warn("[BetterTasks] fetchBlocksByPageRef failed", err);
        return [];
      }
    }

    async function fetchBlocksByAttributes(set) {
      const attrNames = set?.attrNames || resolveAttributeNames();
      const labels = new Set(
        [
          getAttrLabel("repeat", attrNames),
          getAttrLabel("start", attrNames),
          getAttrLabel("defer", attrNames),
          getAttrLabel("due", attrNames),
          getAttrLabel("completed", attrNames),
        ].filter(Boolean)
      );
      const results = [];
      const pull = `[:block/uid :block/string :block/props :block/order :block/open
        {:block/children [:block/uid :block/string]}
        {:block/page [:block/uid :node/title]}
        {:block/parents [:block/uid]}]`;
      for (const label of labels) {
        const safe = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const query = `
          [:find (pull ?b ${pull})
           :where
            [?attr :node/title "${safe}"]
            [?c :block/refs ?attr]
            [?b :block/children ?c]]`;
        try {
          const rows = await window.roamAlphaAPI.q(query);
          if (Array.isArray(rows)) {
            results.push(...rows);
          }
        } catch (err) {
          console.warn("[BetterTasks] fetchBlocksByAttributes failed", err);
        }
      }
      return results;
    }

    function deriveDashboardTask(block, meta, set) {
      if (!block) return null;
      const title = formatDashboardTitle(block.string || "");
      const isCompleted = isBlockCompleted(block);
      const startAt = meta?.start instanceof Date && !Number.isNaN(meta.start.getTime()) ? meta.start : null;
      const deferUntil = meta?.defer instanceof Date && !Number.isNaN(meta.defer.getTime()) ? meta.defer : null;
      const dueAt = meta?.due instanceof Date && !Number.isNaN(meta.due.getTime()) ? meta.due : null;
      const now = new Date();
      const startBucket = startAt && now < startAt ? "not-started" : "started";
      const deferBucket = deferUntil && now < deferUntil ? "deferred" : "available";
      const dueBucket = computeDueBucket(dueAt, now);
      const recurrenceBucket = meta?.repeat ? "recurring" : "one-off";
      const availabilityLabel = isCompleted
        ? null
        : startBucket === "not-started"
          ? "Not started"
          : deferBucket === "deferred"
            ? "Deferred"
            : "Available";
      const metaPills = buildDashboardPills({ startAt, deferUntil, dueAt, repeatText: meta?.repeat }, set);
      return {
        uid: block.uid,
        text: block.string || "",
        title,
        pageUid: block.page?.uid || null,
        pageTitle: block.page?.title || block.page?.["node/title"] || "",
        repeatText: meta?.repeat || "",
        isRecurring: !!meta?.repeat,
        isCompleted,
        startAt,
        deferUntil,
        dueAt,
        startBucket,
        deferBucket,
        dueBucket,
        recurrenceBucket,
        availabilityLabel,
        isCompleted,
        startDisplay: formatDateDisplay(startAt, set),
        deferDisplay: formatDateDisplay(deferUntil, set),
        dueDisplay: formatDateDisplay(dueAt, set),
        metaPills,
      };
    }

    function buildDashboardPills(info, set) {
      const pills = [];
      if (info.repeatText) {
        pills.push({
          type: "repeat",
          icon: "↻",
          value: info.repeatText,
          label: `Repeat: ${info.repeatText}`,
        });
      }
      if (info.startAt instanceof Date && !Number.isNaN(info.startAt.getTime())) {
        pills.push({
          type: "start",
          icon: START_ICON,
          value: formatPillDateText(info.startAt, set),
          label: `Start: ${formatIsoDate(info.startAt, set)}`,
        });
      }
      if (info.deferUntil instanceof Date && !Number.isNaN(info.deferUntil.getTime())) {
        pills.push({
          type: "defer",
          icon: DEFER_ICON,
          value: formatPillDateText(info.deferUntil, set),
          label: `Defer: ${formatIsoDate(info.deferUntil, set)}`,
        });
      }
      if (info.dueAt instanceof Date && !Number.isNaN(info.dueAt.getTime())) {
        pills.push({
          type: "due",
          icon: DUE_ICON,
          value: formatPillDateText(info.dueAt, set),
          label: `Due: ${formatIsoDate(info.dueAt, set)}`,
        });
      }
      return pills;
    }

    function formatDashboardTitle(text) {
      if (!text) return "";
      return text
        .replace(/^\s*\{\{\s*\[\[\s*(?:TODO|DONE)\s*\]\]\s*\}\}\s*/i, "")
        .replace(/^\s*(?:TODO|DONE)\s+/i, "")
        .trim();
    }

    function formatDateDisplay(date, set) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
      return formatFriendlyDate(date, set);
    }

    function computeDueBucket(dueDate, now = new Date()) {
      if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return "none";
      if (now > endOfDay(dueDate)) return "overdue";
      if (isSameDay(dueDate, now)) return "today";
      if (dueDate > endOfDay(now)) return "upcoming";
      return "none";
    }

    function endOfDay(date) {
      const d = new Date(date.getTime());
      d.setHours(23, 59, 59, 999);
      return d;
    }

    function isSameDay(a, b) {
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    }

    function isBetterTasksTask(meta) {
      if (!meta) return false;
      return !!(meta.repeat || meta.hasTimingAttrs);
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

    function sortDashboardTasksList(tasks) {
      const bucketWeight = { overdue: 0, today: 1, upcoming: 2, none: 3 };
      return tasks
        .slice()
        .sort((a, b) => {
          const bucketDiff = (bucketWeight[a.dueBucket] ?? 99) - (bucketWeight[b.dueBucket] ?? 99);
          if (bucketDiff !== 0) return bucketDiff;
          const dueA = a.dueAt ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
          const dueB = b.dueAt ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
          if (dueA !== dueB) return dueA - dueB;
          return (a.title || "").localeCompare(b.title || "");
        });
    }
  },

  onunload: async () => {
    if (typeof window !== "undefined") {
      try {
        window.__RecurringTasksCleanup?.();
      } finally {
        delete window.__RecurringTasksCleanup;
      }
    }

    removeDashboardTopbarButton();
    disconnectTopbarObserver();
    clearDashboardWatches();
    if (activeDashboardController) {
      try {
        activeDashboardController.dispose?.();
      } catch (_) {
        // ignore dispose errors
      }
      activeDashboardController = null;
    }

    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label: "Convert TODO to Better Task" });
    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label: "Create a Better Task" });
    // window.roamAlphaAPI.ui.blockContextMenu.removeCommand({label: "Convert Better Task to plain TODO",});
    disconnectThemeObserver();
  },
};

function ordFromText(value) {
  if (!value) return null;
  const numeric = Number(value.replace(/(st|nd|rd|th)$/i, ""));
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 31) return numeric;
  return ORD_MAP[value.toLowerCase()] ?? null;
}

function dowFromAlias(token) {
  if (!token) return null;
  const norm = (DOW_ALIASES[token.toLowerCase()] || token).toLowerCase();
  return DOW_MAP[norm] || null;
}

function normalizeWeekStartCode(value) {
  if (typeof value === "string") {
    const code = dowFromAlias(value);
    if (code) return code;
  }
  if (typeof value === "string" && DOW_ORDER.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return DEFAULT_WEEK_START_CODE;
}

function getDowOrderForWeekStart(weekStartCode) {
  const code = weekStartCode && DOW_ORDER.includes(weekStartCode) ? weekStartCode : DEFAULT_WEEK_START_CODE;
  const idx = DOW_ORDER.indexOf(code);
  if (idx <= 0) return DOW_ORDER;
  return [...DOW_ORDER.slice(idx), ...DOW_ORDER.slice(0, idx)];
}

function getOrderedWeekdayOffsets(byDay, weekStartCode) {
  const order = getDowOrderForWeekStart(weekStartCode);
  const seen = new Set();
  const offsets = [];
  for (const code of Array.isArray(byDay) ? byDay : []) {
    if (typeof code !== "string") continue;
    const idx = order.indexOf(code);
    if (idx === -1 || seen.has(code)) continue;
    seen.add(code);
    offsets.push(idx);
  }
  offsets.sort((a, b) => a - b);
  return offsets;
}

function monthFromText(x) {
  if (!x) return null;
  const m = MONTH_MAP[x.toLowerCase()];
  return m || null;
}
function expandDowRange(startISO, endISO, dowOrder = DOW_ORDER) {
  const s = dowOrder.indexOf(startISO), e = dowOrder.indexOf(endISO);
  if (s === -1 || e === -1) return [];
  if (s <= e) return dowOrder.slice(s, e + 1);
  return [...dowOrder.slice(s), ...dowOrder.slice(0, e + 1)]; // wrap
}
function splitList(str) {
  return str
    .replace(/&/g, ",")
    .replace(/\band\b/gi, ",")
    .split(/[,\s/]+/)
    .filter(Boolean);
}
// Recognize MWF / TTh sets
function parseAbbrevSet(token) {
  const t = token.toLowerCase();
  if (t === "mwf") return ["MO", "WE", "FR"];
  if (t === "tth" || t === "tu/th" || t === "t/th") return ["TU", "TH"];
  return null;
}
// Turn mixed text, ranges, and shorthands into ISO DOW array
function normalizeByDayList(raw, weekStartCode = DEFAULT_WEEK_START_CODE) {
  const tokens = splitList(raw.replace(/[-–—]/g, "-"));
  const dowOrder = getDowOrderForWeekStart(weekStartCode);
  let out = [];
  for (const tok of tokens) {
    if (tok.includes("-")) {
      const [a, b] = tok.split("-");
      const A = dowFromAlias(a), B = dowFromAlias(b);
      if (A && B) { out.push(...expandDowRange(A, B, dowOrder)); continue; }
    }
    const set = parseAbbrevSet(tok);
    if (set) { out.push(...set); continue; }
    const d = dowFromAlias(tok);
    if (d) { out.push(d); continue; }
  }
  const seen = new Set();
  return out.filter(d => (seen.has(d) ? false : (seen.add(d), true)));
}

function keywordIntervalFromText(text) {
  return MONTH_KEYWORD_INTERVAL_LOOKUP[text] || null;
}

function ensureDashboardTopbarButton(retry = true) {
  if (typeof document === "undefined") return;
  if (!activeDashboardController) return;
  if (document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID)) return;
  const button = document.createElement("span");
  button.id = DASHBOARD_TOPBAR_BUTTON_ID;
  button.className = "bp3-button bp3-minimal bp3-small bp3-icon-form";
  button.setAttribute("role", "button");
  button.setAttribute("title", "Better Tasks Dashboard");
  button.setAttribute("aria-label", "Better Tasks Dashboard");
  button.addEventListener("click", () => activeDashboardController?.toggle());
  const placed = insertDashboardButton(button);
  if (!placed && retry) {
    setTimeout(() => ensureDashboardTopbarButton(false), 600);
  }
}

function insertDashboardButton(button) {
  const sidebarBtn = document.querySelector(".rm-open-left-sidebar-btn");
  if (sidebarBtn?.parentNode) {
    sidebarBtn.parentNode.insertBefore(button, sidebarBtn.nextSibling);
    return true;
  }
  const topbar = document.querySelector(".rm-topbar");
  if (topbar) {
    topbar.appendChild(button);
    return true;
  }
  const mainTopbar = document.querySelector(
    "#app > div > div > div.flex-h-box > div.roam-main > div.rm-files-dropzone > div"
  );
  const row = mainTopbar?.childNodes?.[1];
  if (row?.parentNode) {
    row.parentNode.insertBefore(button, row);
    return true;
  }
  return false;
}

function removeDashboardTopbarButton() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID);
  if (existing) existing.remove();
}

function observeTopbarButton() {
  if (typeof document === "undefined") return;
  if (topbarButtonObserver) return;
  const target = document.querySelector(".rm-topbar") || document.body;
  if (!target) return;
  topbarButtonObserver = new MutationObserver(() => {
    if (!activeDashboardController) return;
    if (!document.getElementById(DASHBOARD_TOPBAR_BUTTON_ID)) {
      ensureDashboardTopbarButton(false);
    }
  });
  try {
    topbarButtonObserver.observe(target, { childList: true, subtree: true });
  } catch (_) {
    topbarButtonObserver = null;
  }
}

function observeThemeChanges() {
  if (typeof document === "undefined") return;
  syncDashboardThemeVars();
  if (themeObserver || !document.body) return;
  themeObserver = new MutationObserver(() => {
    if (themeSyncTimer) clearTimeout(themeSyncTimer);
    themeSyncTimer = setTimeout(() => {
      syncDashboardThemeVars();
      themeSyncTimer = null;
    }, 180);
  });
  try {
    const targets = [document.body, document.documentElement].filter(Boolean);
    for (const target of targets) {
      themeObserver.observe(target, { attributes: true, attributeFilter: ["class", "data-theme"] });
    }
  } catch (_) {
    themeObserver = null;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    if (!window.__btThemeMediaQuery) {
      window.__btThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      window.__btThemeMediaQuery.addEventListener?.("change", syncDashboardThemeVars);
    }
  }
  observeThemeStyles();
}

function disconnectThemeObserver() {
  if (themeObserver) {
    try {
      themeObserver.disconnect();
    } catch (_) {
      // ignore
    }
    themeObserver = null;
  }
  if (themeStyleObserver) {
    try {
      themeStyleObserver.disconnect();
    } catch (_) {
      // ignore
    }
    themeStyleObserver = null;
  }
  if (themeSyncTimer) {
    clearTimeout(themeSyncTimer);
    themeSyncTimer = null;
  }
  if (typeof window !== "undefined" && window.__btThemeMediaQuery) {
    window.__btThemeMediaQuery.removeEventListener?.("change", syncDashboardThemeVars);
    window.__btThemeMediaQuery = null;
  }
}

function pickColorValue(defaultValue, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = typeof candidate === "function" ? candidate() : candidate;
    if (typeof value !== "string") {
      if (value != null) {
        const str = String(value).trim();
        if (str && str !== "initial" && str !== "inherit") return str;
      }
      continue;
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== "initial" && trimmed !== "inherit") return trimmed;
  }
  return defaultValue;
}

function syncDashboardThemeVars() {
  if (typeof document === "undefined") return;
  const body = document.body;
  const root = document.documentElement;
  if (!body || !root) return;

  const computed = window.getComputedStyle(body);

  const systemPrefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const explicitDark =
    body.classList.contains("bp3-dark") ||
    /dark/i.test(body.className) ||
    body.dataset.theme === "dark";

  const layoutBg = sampleBackgroundColor([
    ".roam-main",
    ".roam-body .bp3-card",
    ".roam-body",
    "#app",
  ]);

  const baseSurface = pickColorValue(
    explicitDark ? "#1f2428" : "#ffffff",
    computed.getPropertyValue("--bt-surface"),
    computed.getPropertyValue("--bp3-surface"),
    computed.getPropertyValue("--background-color"),
    layoutBg,
    computed.backgroundColor
  );

  if (baseSurface === (lastThemeSample?.surface || null)) {
    // No change; avoid flicker
    return;
  }

  const panelRgb = parseColorToRgb(baseSurface);
  const derivedDark = panelRgb ? computeLuminance(panelRgb) < 0.45 : null;
  const finalIsDark = explicitDark || (derivedDark != null ? derivedDark : systemPrefersDark);

  const textColor = pickColorValue(
    finalIsDark ? "#f5f8fa" : "#111111",
    computed.getPropertyValue("--bt-text"),
    computed.getPropertyValue("--bp3-text-color"),
    computed.color
  );

  const borderColor = pickColorValue(
    finalIsDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    computed.getPropertyValue("--bt-border-color"),
    computed.getPropertyValue("--bp3-border-color"),
    computed.getPropertyValue("--border-color")
  );

  const mutedColor = pickColorValue(
    finalIsDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
    computed.getPropertyValue("--bt-muted-color"),
    computed.getPropertyValue("--text-color-muted")
  );

  const pillBg = pickColorValue(
    finalIsDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
    computed.getPropertyValue("--bt-pill-bg")
  );

  body.classList.toggle("bt-theme-dark", finalIsDark);
  body.classList.toggle("bt-theme-light", !finalIsDark);

  const adjustedPanel = adjustColor(panelRgb, finalIsDark ? -0.08 : 0.03) || baseSurface;
  const borderStrong = adjustColor(panelRgb, finalIsDark ? -0.25 : 0.15) || borderColor;

  root.style.setProperty("--bt-panel-bg", adjustedPanel);
  root.style.setProperty("--bt-panel-text", textColor);
  root.style.setProperty("--bt-border", borderColor);
  root.style.setProperty("--bt-border-strong", borderStrong);
  root.style.setProperty("--bt-muted", mutedColor);
  root.style.setProperty("--bt-pill-bg", pillBg);

  lastThemeSample = { surface: baseSurface, dark: finalIsDark };
}

function parseColorToRgb(value) {
  if (!value || typeof value !== "string") return null;
  const str = value.trim();
  if (!str) return null;
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      if (Number.isNaN(num)) return null;
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }
    return null;
  }
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

function computeLuminance(rgb) {
  if (!rgb) return null;
  const toLinear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustColor(rgb, delta = 0) {
  if (!rgb || typeof delta !== "number" || delta === 0) return null;
  const mix = (channel) => {
    const target = delta > 0 ? 255 : 0;
    const ratio = Math.min(Math.abs(delta), 1);
    return Math.round(channel + (target - channel) * ratio);
  };
  const r = mix(rgb.r);
  const g = mix(rgb.g);
  const b = mix(rgb.b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function sampleBackgroundColor(selectors = []) {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    const node = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!node) continue;
    const style = window.getComputedStyle(node);
    const color = style?.backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
      return color;
    }
  }
  return null;
}

async function waitForAttrDate(uid, attr, targetDate, set, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || !(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return;
  if (typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    const metaDate = meta?.[attr] instanceof Date ? meta[attr] : null;
    if (metaDate && !Number.isNaN(metaDate.getTime())) {
      if (Math.abs(metaDate.getTime() - targetDate.getTime()) < 1000) return;
    }
  }
}

async function waitForAttrClear(uid, attr, set, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    if (!meta) break;
    let hasValue = false;
    if (attr === "repeat") {
      hasValue = !!meta.repeat;
    } else if (["start", "defer", "due"].includes(attr)) {
      const val = meta[attr];
      hasValue = val instanceof Date && !Number.isNaN(val.getTime());
    }
    if (!hasValue) return;
  }
}

async function waitForRepeatState(uid, set, options = {}, retries = 6, getBlockFn, readMetaFn) {
  if (!uid || typeof getBlockFn !== "function" || typeof readMetaFn !== "function") return;
  const expectValue =
    typeof options.expectedValue === "string" && options.expectedValue ? options.expectedValue.trim() : null;
  const expectPresence = typeof options.expectPresence === "boolean" ? options.expectPresence : null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < retries; i++) {
    await sleep(150);
    const block = await getBlockFn(uid);
    if (!block) break;
    const meta = await readMetaFn(block, set);
    const repeatVal = (meta?.repeat || "").trim();
    if (expectValue != null) {
      if (repeatVal === expectValue) return repeatVal;
    } else if (expectPresence != null) {
      if (!!repeatVal === expectPresence) return repeatVal;
    } else if (repeatVal) {
      return repeatVal;
    }
  }
}

function observeThemeStyles() {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head || themeStyleObserver) return;
  themeStyleObserver = new MutationObserver(() => {
    if (themeSyncTimer) clearTimeout(themeSyncTimer);
    themeSyncTimer = setTimeout(() => {
      syncDashboardThemeVars();
      themeSyncTimer = null;
    }, 200);
  });
  try {
    themeStyleObserver.observe(head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "data-theme"],
    });
  } catch (_) {
    themeStyleObserver = null;
  }
}

function disconnectTopbarObserver() {
  if (!topbarButtonObserver) return;
  try {
    topbarButtonObserver.disconnect();
  } catch (_) {
    // ignore
  }
  topbarButtonObserver = null;
}

function ensureDashboardWatch(uid) {
  if (!uid || dashboardWatchers.has(uid)) return;
  if (!window.roamAlphaAPI?.data?.addPullWatch) return;
  const pattern = "[:block/uid]";
  const selector = [":block/uid", uid];
  try {
    window.roamAlphaAPI.data.addPullWatch(
      pattern,
      selector,
      (_, after) => {
        if (!after) {
          removeDashboardWatch(uid);
          activeDashboardController?.removeTask?.(uid);
        } else {
          activeDashboardController?.notifyBlockChange?.(uid, { bypassFilters: true });
        }
      }
    );
    dashboardWatchers.set(uid, { pattern, selector });
  } catch (err) {
    console.warn("[BetterTasks] addPullWatch failed", err);
  }
}

function removeDashboardWatch(uid) {
  if (!uid) return;
  const entry = dashboardWatchers.get(uid);
  if (!entry) return;
  try {
    window.roamAlphaAPI?.data?.removePullWatch?.(entry.pattern, entry.selector);
  } catch (err) {
    console.warn("[BetterTasks] removePullWatch failed", err);
  }
  dashboardWatchers.delete(uid);
}

function clearDashboardWatches() {
  for (const uid of Array.from(dashboardWatchers.keys())) {
    removeDashboardWatch(uid);
  }
}
