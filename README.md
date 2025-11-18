# 🌀 Better Tasks for Roam Research

Bring true task management to Roam Research!

This extension automatically recognises and manages TODO items that match defined repeat patterns and/or date attributes, optionally generating the next instance when a repeating Better Task is completed. 

**Note:** 
This extension is in active development and should be considered a beta release. Please let me know of any bugs or unexpected behaviours in Slack  - https://app.slack.com/client/TNEAEL9QW/

This video provides a basic overview of some of the functionality of this extension.

<p align="center">
https://www.loom.com/share/bb6ffd38ff35441ab2ed5138b5c2cb70
</p>

---

## 📘 Quick Overview

You can create a Better Task directly or via the Command Palette — both behave identically, store their data in child blocks for reliability, and can include either a repeat rule or just start/defer/due dates for one-off scheduling.

### 🔹 Child Block Style

```markdown
{{[[TODO]]}} Write weekly newsletter
  - BT_attrRepeat:: every Friday
  - BT_attrDue:: [[2025-11-07]]
```

When completed:

```markdown
{{[[DONE]]}} Write weekly newsletter
  - BT_attrRepeat:: every Friday
  - BT_attrDue:: [[2025-11-07]]
  - completed:: [[2025-10-31]]
```

Optionally include a start attribute `BT_attrStart::` (when the task becomes available) and/or defer attribute `BT_attrDefer::` (when it should resurface). These labels are configurable in settings; defaults are `BT_attrStart` and `BT_attrDefer`. The completion attribute defaults to `completed::` but can also be configured in Settings.

### 🔹 Scheduled (One-Off) Tasks

Leave the repeat field blank while setting any combination of `start::`, `defer::`, or `due::` to create a *scheduled one-off* task. It uses the same child-block storage, pills, snooze controls, and completion logic — just without spawning a follow-up block. Completing it writes `completed:: [[<today>]]` and hides the pill.

### 🔹 Inline Pill Indicators

Regardless of how you enter the attributes, the extension emits a compact **pill** next to each Better Task whenever its child blocks are collapsed:

![alt text](https://raw.githubusercontent.com/mlava/better-tasks/main/images/image.png)

- Pills disappear automatically when you expand the task (so you can edit the child blocks directly) and reappear when the block is collapsed.
- Marking the TODO complete hides the pill until the extension spawns the next occurrence, keeping finished items visually quiet.
- Tasks without a repeat rule still show the pill with their start/defer/due dates, just without the ↻ segment.
- Dates within the next 7 days show the weekday name (`Wed`, `Thu`); anything further out shows a short date (`Feb 26`), so you can scan upcoming items quickly.
- **↻ Repeat pill** — Click to edit; **Alt+Click** copies the rule to the clipboard.
- **⏱ Start / ⏳ Defer / 📅 Next** — Click to open the corresponding Daily Note Page.  
  **Shift+Click** opens that page in the right sidebar (matches Roam).  
  **Alt+Cmd/Ctrl+Click** on the due pill snoozes +1 day.  
  **Alt/Ctrl/Meta+Click** on any date pill opens a date picker to change that date.
- **⋯ Menu** — Opens the full Better Task menu (see below).

---

## ⚙️ Settings

### Destination for Next Task
Determines where the next instance of a Better Task appears:
- **Daily Notes Page (DNP)** — Default; next occurrence is created on its due date’s DNP.  
- **Same Page** — Next occurrence appears below the current one.
- **Under a Heading on DNP** — Adds the new task under the heading you specify (default: “Tasks”).

### DNP heading
Heading for **Under a Heading on DNP**

### Repeat attribute name
Label for a child block attribute for the recurrence pattern

### Start attribute name
Label for the optional “start/available on” date attribute (default `BT_attrStart`)

### Defer attribute name
Label for the optional “defer/snooze until” date attribute (default `BT_attrDefer`)

### Due attribute name
Label for the optional “due” date attribute (default `BT_attrDue`)

### Completed attribute name
Label written when the task is marked DONE (default `BT_attrCompleted`).

You can change any of these attributes in Settings. These defaults have been chosen to minimise the risk of unexpected behaviours if you already use start:: defer:: repeat:: due:: or completed:: in your graph for other purposes.

### Confirm Before Spawning Next Task
If enabled, shows a confirmation dialogue (“Spawn next occurrence?”) when you complete a repeating Better Task.

### First day of the week
Tells Better Tasks which weekday your graph treats as the start of the week, and allows you to match your Roam Research preference setting.  
Weekly rules that span multiple days or intervals (e.g., `every 2 weeks on Sat & Sun`, `Mon-Fri`) interpret ranges using this anchor. Default is **Monday**.

## 🤖 AI Task Input Parsing (Experimental)
- What it does: optionally sends the raw task text to OpenAI (BYO key, client-side) and maps the returned JSON into Better Task title/repeat/date attributes. If anything fails, the normal “Create a Better Task” flow runs instead.
- How to enable: in Better Tasks settings, set **AI parsing mode** to “Use my OpenAI key” and paste your key into **AI API key**. When mode is Off or the key is blank, AI parsing is skipped automatically.
- Privacy: the key and task text are sent directly from your browser to OpenAI; no extra backend is used. The key is stored in Roam’s extension settings (standard for Roam Depot AI extensions).
- Limitations: early feature; repeat/date parsing may be conservative. Project/context/priority/energy fields are accepted but currently ignored. Ambiguous input may fall back to manual entry.
- Failure behaviour: network/JSON/validation issues show a small toast (“AI parsing unavailable…”) and the normal Better Task prompt runs so task creation never blocks.
- How it flows: use the existing “Create a Better Task” command palette entry or block context menu. If AI is enabled and you have text in the block, it’s sent to OpenAI; otherwise you’ll be prompted for text. A small spinner toast appears while waiting for the API.
- Data safety: only the task text you supply plus your API key are sent directly to OpenAI; no proxy/server is involved. Nothing else from your graph is transmitted. If you hit quota issues, you’ll see a toast pointing you to the provider’s billing/limits page (`https://platform.openai.com/settings/organization/billing/overview`).

**Note:** 
The settings pane for the extension allows you to use whatever name for the repeat and start/defer/due date atttributes you choose. The extension defaults to using 'BT_attrRepeat', 'BT_attrStart', 'BT_attrDefer' and 'BT_attrDue' for the recurrence pattern and start/defer/due dates respectively. If you happen to already use these attributes for other purposes, the extension will recognise and attempt to use them if you don't set alternatives in the settings. Using 'frequency' and 'when' for example, would prevent the extension from acting on anything for which you already use 'BT_attrRepeat' and 'BT_attrDue'.

---

## 🧩 Pills and Menus

Each task shows an inline “pill” next to its checkbox when the child blocks are collapsed.

**Pill actions:**
- **Repeat pill (↻)** — Click to edit; Alt+Click to copy rule text.
- **Due pill (Next:)** — Click to open DNP; Shift+Click opens in right sidebar; Alt+Cmd/Ctrl+Click snoozes +1 day; Alt/Ctrl/Meta+Click opens the date picker.
- **⋯ (menu)** — Opens the task menu with more options:

| Action | Description |
|--------|--------------|
| Snooze +1 day | Push start date forward 1 day |
| Snooze +3 days | Push start date forward 3 days |
| Snooze to next Monday | Move start to the next Monday |
| Snooze (pick date) | Choose a custom start date |
| Skip this occurrence | Jump directly to next repeat cycle |
| Generate next now | Immediately create the next task |
| End recurrence | Stop this task from repeating |

All actions support **Undo** via a toast notification. If a start date isn't configured the buttons snooze the due date instead. Skip / generate / end only appear for tasks with a repeat rule.

---

## 📊 Better Tasks Dashboard

Open the dashboard from the command palette (`Toggle Better Tasks Dashboard`) or the icon <img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/image-2.png" width="22"> that appears in Roam’s top bar. The dashboard lists every Better Task (recurring or scheduled one-off) with:

- Powerful filters for recurrence type, availability (start/defer), due bucket, and completion status.
- Quick snooze actions, completion toggles, and links back to the originating blocks.
- Background refreshes whenever task attributes change so pills and dashboard stay in sync.
- A floating panel you can drag anywhere within the Roam window. The position is remembered, so place it where it works best for your workflow.
- A subtle ⋯ menu beside each task’s pills that lets you add or remove repeat/start/defer/due attributes (or edit them) without leaving the dashboard.
- A quick-add input at the top: type a task and hit **OK** or Enter to create it (uses AI parsing when enabled, otherwise the manual Better Task flow with scheduling).
- Clicking the repeat or date pills in the dashboard mirrors the inline pill behaviour: you can open the same pickers, copy repeat text, or jump straight to the target Daily Note without expanding the block in Roam.

Use the dashboard to triage overdue work, snooze tasks, or jump straight to the next daily note page without leaving Roam.

### 🎨 Theme Compatibility (Adaptive)

Better Tasks samples colours from Roam’s active theme and applies a lightweight contrast layer so the dashboard and pills feel native in both light and dark modes. The adaptive styling now works with Roam Studio, CSS Dark Mode Toggle, Roam "Native" Dark and Blueprint light/dark themes; if you spot any illegible text or mismatched backgrounds in your graph, please report the theme so we can fine‑tune it.

<p align="center">
<img src="https://raw.githubusercontent.com/mlava/better-tasks/main/images/theming.gif"/>
</p>

---

## 🧭 Commands

You can trigger these from Roam’s Command Palette (`Ctrl+P` / `Cmd+P`) or block context menu:

- **Convert TODO to Better Task**
- **Create a Better Task**

These commands let you turn an existing task into a repeating Better Task or start a new scheduled TODO; just leave the repeat field blank to create a one-off with start/defer/due timing.

---
## 📆 Repeat Field Syntax (Current Support)

The `repeat::` attribute accepts **natural-language** patterns. Parsing is **case-insensitive**, tolerates **extra whitespace**, and supports separators like commas, `/`, `&`, and the word **and**.  
**Abbreviations and ranges are supported** (e.g., `Mon`, `Tue`, `Thu`, `MWF`, `TTh`, `Mon–Fri`).  
**Anchor date**: the next occurrence is calculated from `due::` (preferred). If no `due::` is present, the current date is used as the anchor.  
**Week start**: ranges and some weekly rules respect your **First day of the week** setting in the extension.

This video demonstrates some of the recurrence/repeat functions:

<p align="center">
https://www.loom.com/share/f8856114bfd14d40a228292e7bcff9ee
</p>

---

### 🗓️ Daily & Business Days
| Example | Meaning |
|---|---|
| `every day` \| `daily` | once per day |
| `every 2 days` \| `every other day` \| `every second day` | every 2 days |
| `every three days` | every 3 days |
| `every 5 days` | every 5 days |
| `every weekday` \| `business days` \| `workdays` | Monday–Friday |
| `every 2 weekdays` | every 2 business days (Mon–Fri cadence) |

---

### 📅 Weekly — Single Day (any case/abbrev)
| Example | Meaning |
|---|---|
| `every monday` | every week on Monday |
| `every mon` \| `EVERY MON` \| `every MOnDaY` | variants accepted |

---

### 📅 Weekly — Base Keywords & Intervals
| Example | Meaning |
|---|---|
| `weekly` \| `every week` | once per week (no fixed day) |
| `every other week` \| `every second week` \| `biweekly` \| `fortnightly` \| `every fortnight` | every 2 weeks |
| `every 3 weeks` | every third week (no fixed day) |

---

### 📅 Weekly — Multiple Days (lists & separators)
| Example | Meaning |
|---|---|
| `weekly on tue, thu` | Tuesday and Thursday |
| `weekly on tue thu` | same (spaces only) |
| `weekly on tue & thu` | same (`&` supported) |
| `weekly on tue/thu` \| `Tu/Th` \| `t/th` | slash shorthand |
| `every mon, wed, fri` \| `MWF` | Monday, Wednesday, Friday |
| `TTh` | Tuesday and Thursday |
| `weekly on tue, thu and sat & sun` | mixed separators supported |

---

### 📅 Weekly — Ranges (includes wrap-around)
| Example | Meaning |
|---|---|
| `every mon-fri` \| `every mon–fri` \| `every mon—fri` | Monday through Friday |
| `every fri–sun` | Friday → Sunday range |
| `every su–tu` | Sunday → Tuesday (wrap) |

---

### 📅 Weekly — Interval + Specific Day(s)
| Example | Meaning |
|---|---|
| `every 2 weeks on monday` | every 2nd Monday |
| `every 3 weeks on fri` | every 3rd Friday |
| `every 4 weeks on tue, thu` | every 4th week on Tue & Thu |

---

### 🗓️ Monthly — By Day Number (single/multi, clamps, EOM)
| Example | Meaning |
|---|---|
| `monthly` | same calendar day each month (uses `due::` day) |
| `every month on day 15` | 15th of each month |
| `the 1st day of each month` | 1st day every month |
| `day 31 of each month` | clamps to end of shorter months |
| `last day of the month` \| `EOM` | last calendar day each month |
| `on the 1st and 15th of each month` | 1st & 15th |
| `on the 15th and last day of each month` | 15th + EOM |
| `on the 5th, 12th, 20th of each month` \| `on the 5th/12th/20th of each month` \| `on the 5th & 12th & 20th of each month` | multiple specific dates |

### 🗓️ Monthly — Nth Weekday Variants
- `first monday of each month`
- `2nd wed every month`
- `last friday of each month`
- `1st and 3rd monday of each month`
- `penultimate friday of each month` / `second last friday ...`
- `first weekday of each month`
- `last weekday of each month`
- `every month on the second tuesday`
- `2nd Tue each month`
- `the last thu each month`

### 🗓️ Every N Months (date or Nth weekday)
- `every 2 months on the 10th`
- `every 3 months on the 2nd tuesday`
- `quarterly`
- `semiannual` / `semi-annually` / `twice a year`

---

### 🎉 Yearly — Fixed Date & Nth Weekday-in-Month
- `every March 10`, `on 10 March every year`
- `annually`, `yearly` (fixed-date anchor)
- `first Monday of May every year`

---

### 📆 Weekends
| Example | Meaning |
|---|---|
| `every weekend` \| `weekends` | Saturday & Sunday |


#### Notes
- **Abbreviations & aliases**: `Mon/Mon./Monday`, `Thu/Thurs/Thursday`, `MWF`, `TTh` are accepted.  
- **Ranges**: `Mon–Fri` (or `Mon-Fri`) expands to all included days.  
- **Clamping**: Day numbers beyond a month’s end **clamp** to the last valid date (e.g., `31st` → Feb 28/29).  
- **“Every N weekdays”** counts **business days** (Mon–Fri) only.  
- **Pluralisation** is flexible: `monday`/`mondays`, `week`/`weeks`, etc.

---

## 💡 Tips

- Any TODO with a `repeat::` value automatically becomes a repeating Better Task.
- Completing it will **spawn the next occurrence** (optionally after confirmation).
- Collapsing a Better Task shows its pill; expanding it reveals the underlying child blocks for editing.
- Most actions (skip, snooze, edit) display an **Undo** toast.

---

## 🧰 Example Workflow

1. Draft the task (inline or empty block), then run **Convert TODO to Better Task** (or simply **Create a Better Task** if you’re starting fresh). The toast lets you enter the title, optional repeat rule, and optional start/defer/due dates; it stores the canonical data in child blocks and shows the inline pill.
2. Mark it done — for repeating Better Tasks, the extension automatically creates the next task on its start date (or due date if no start is provided) so it appears on the right Daily Note or page.
3. If you snooze or skip via the pill menu, the defer/due child blocks update and the pill reflects the new dates immediately.

---

Enjoy Better Task management directly inside Roam Research!
