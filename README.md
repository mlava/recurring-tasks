# 🌀 Recurring Tasks for Roam Research

Bring true recurring task automation to Roam Research!

This extension automatically recognizes and manages TODO items that match defined repeat pattern and due date attributes, generating the next instance when a task is completed.

**Note 1:** 
This extension is in active development and should be considered an early beta release. Please let me know of any bugs or unexpected behaviours in Slack  - https://app.slack.com/client/TNEAEL9QW/

**Note 2:** 
The settings pane for the extension allows you to use whatever name for the repeat and due date atttributes you choose. The extension defaults to using 'RT_attrRepeat' and 'RT_attrDue' for the recurrence pattern and due date respectively. If you happen to already use these attributes for other purposes, the extension will recognise and attempt to use them if you don't set alternatives in the settings. Using 'frequency' and 'when' for example, would prevent the extension from acting on anything for which you already use 'RT_attrRepeat' and 'RT_attrDue'.

---

## 📘 Quick Overview

You can record a recurring task in **two styles** — both behave identically and the extension will keep the canonical copies in child blocks for reliability.

### 🔹 Inline Attribute Style

Use Roam attributes directly within the task block:

```markdown
{{[[TODO]]}} Review project metrics repeat:: every weekday due:: [[2025-11-06]]
```

You can add other metadata such as completion date:

```markdown
{{[[DONE]]}} Send team update
repeat:: every 2 weeks on Friday
due:: [[2025-11-07]]
completed:: [[2025-10-24]]
```

Optionally include `start::` (when the task becomes available) and/or `defer::` (when it should resurface). These labels are configurable in settings; defaults are `RT_attrStart` and `RT_attrDefer`.

### 🔹 Child Block Style

If you prefer to keep the task text clean, choose “Child” mode. The repeat and due info will appear as sub-blocks:

```markdown
{{[[TODO]]}} Write weekly newsletter
  - repeat:: every Friday
  - due:: [[2025-11-07]]
```

When completed:

```markdown
{{[[DONE]]}} Write weekly newsletter
  - repeat:: every Friday
  - due:: [[2025-11-07]]
  - completed:: [[2025-10-31]]
```

### 🔹 Inline Pill Indicators

Regardless of how you enter the attributes, the extension emits a compact **pill** next to each recurring TODO whenever its child blocks are collapsed:

```
☑️ Write weekly newsletter  ↻ every Friday · ⏳ Mon 3 Nov · 📅 Fri 7 Nov ⋯
```

- Pills disappear automatically when you expand the task (so you can edit the child blocks directly) and reappear when the block is collapsed.
- Marking the TODO complete hides the pill until the extension spawns the next occurrence, keeping finished items visually quiet.
- Dates within the next 7 days show the weekday name (`Wed`, `Thu`); anything further out shows a short date (`Feb 26`), so you can scan upcoming items quickly.
- **↻ Repeat pill** — Click to edit; **Alt+Click** copies the rule to the clipboard.
- **⏱ Start / ⏳ Defer / 📅 Next** — Click to open the corresponding Daily Note Page.  
  **Shift+Click** on the due pill snoozes +1 day.  
  **Alt/Ctrl/Meta+Click** on any date pill opens a date picker to change that date.
- **⋯ Menu** — Opens the full recurring-task menu (see below).

---

## ⚙️ Settings

### Destination for Next Task
Determines where the next instance of a recurring task appears:
- **Daily Notes Page (DNP)** — Default; next occurrence is created on its due date’s DNP.  
- **Same Page** — Next occurrence appears below the current one.
- **Under a Heading on DNP** — Adds the new task under the heading you specify (default: “Tasks”).

### DNP heading
Heading for **Under a Heading on DNP**

### Repeat attribute name
Label for a child block attribute for the recurrence pattern

### Due attribute name
Label for a child block attribute for due date

### Start attribute name
Label for the optional “start/available on” date attribute (default `RT_attrStart`)

### Defer attribute name
Label for the optional “defer/snooze until” date attribute (default `RT_attrDefer`)

### Confirm Before Spawning Next Task
If enabled, shows a confirmation dialog (“Spawn next occurrence?”) when you complete a recurring TODO.

### First day of the week
Tells Recurring Tasks which weekday your graph treats as the start of the week (matches Roam’s regional preference).  
Weekly rules that span multiple days or intervals (e.g., `every 2 weeks on Sat & Sun`, `Mon-Fri`) interpret ranges using this anchor. Default is **Monday**.

---

## 🧩 Pills and Menus

Each task with hidden attributes shows an inline “pill” next to its checkbox.

**Pill actions:**
- **Repeat pill (↻)** — Click to edit; Alt+Click to copy rule text.
- **Due pill (Next:)** — Click to open DNP; Shift+Click to snooze 1 day; Alt/Ctrl/Meta+Click to edit due date.
- **⋯ (menu)** — Opens the task menu with more options:

| Action | Description |
|--------|--------------|
| Snooze +1 day | Push due date forward 1 day |
| Snooze +3 days | Push due date forward 3 days |
| Snooze to next Monday | Move to the next Monday |
| Snooze (pick date) | Choose a custom snooze date |
| Skip this occurrence | Jump directly to next repeat cycle |
| Generate next now | Immediately create the next task |
| End recurrence | Stop this task from recurring |

All actions support **Undo** via a toast notification.

---

## 🧭 Commands

You can trigger these from Roam’s Command Palette (`Ctrl+P` / `Cmd+P`) or block context menu:

- **Convert TODO to Recurring Task**
- **Create a Recurring TODO**

These commands let you turn an existing task into a recurring one or start a new recurring TODO directly.

---
## 📆 Repeat Field Syntax (Current Support)

The `repeat::` attribute accepts **natural-language** patterns. Parsing is **case-insensitive**, tolerates **extra whitespace**, and supports separators like commas, `/`, `&`, and the word **and**.  
**Abbreviations and ranges are supported** (e.g., `Mon`, `Tue`, `Thu`, `MWF`, `TTh`, `Mon–Fri`).  
**Anchor date**: the next occurrence is calculated from `due::` (preferred). If no `due::` is present, the current date is used as the anchor.  
**Week start**: ranges and some weekly rules respect your **First day of the week** setting in the extension.

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
- **Pluralization** is flexible: `monday`/`mondays`, `week`/`weeks`, etc.

---

## 💡 Tips

- Any TODO with a `repeat::` value automatically becomes a recurring task.
- Completing it will **spawn the next occurrence** (optionally after confirmation).
- Collapsing a recurring TODO shows its pill; expanding it reveals the underlying child blocks for editing.
- Most actions (skip, snooze, edit) display an **Undo** toast.

---

## 🧰 Example Workflow

1. Draft the task (inline or empty block), then run **Convert TODO to Recurring Task** (or **Create a Recurring TODO** if you’re starting fresh). The dialog lets you enter the title, repeat rule, and optional due/start/defer dates; it stores the canonical data in child blocks and shows the inline pill.
2. Mark it done — the extension automatically creates the next task on its start date (or due date if no start is provided) so it appears on the right Daily Note or page.
3. If you snooze or skip via the pill menu, the defer/due child blocks update and the pill reflects the new dates immediately.

---

Enjoy effortless recurring task management directly inside Roam Research!
