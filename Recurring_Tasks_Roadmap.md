# 🌀 Recurring Tasks — Extension Roadmap

> **Project:** Roam Research Extensions  
> **Owner:** Mark Lavercombe  
> **Status:** Actively iterating (vNext under test)  
> **Last updated:** 2025-11-10

---

## ✅ Current Functionality (as of v2025.11)

| Area | Description | Status |
|------|--------------|--------|
| **Trigger logic** | Spawns next task when TODO → DONE | ✅ Working reliably |
| **Date anchor** | Uses `due::` (or user-configured alias) as the anchor date | ✅ Implemented |
| **Repeat rule parsing** | Natural language rules: daily, weekdays, weekends, every N days/weeks/months, monthly by date/weekday | ✅ Implemented |
| **Child-block attributes** | `attrDue_RT::`, `attrRepeat_RT::` supported (Roam-style child attributes) | ✅ Implemented |
| **User-configurable attribute names** | `due` and `repeat` attribute names configurable via settings | ✅ Done |
| **Hidden vs. deleted children** | Children now hidden via CSS instead of deleted | ✅ Implemented |
| **Settings panel** | Added Roam Depot settings (destination, heading, FDOW, etc.) | ✅ Implemented |
| **Create Recurring Task command** | Palette command for fast task creation | ✅ Implemented |
| **Rule aliases & natural language** | “every other day,” “weekends,” “every 3rd Thursday,” quarterly/annual phrasing, etc. | ✅ Implemented |
| **Monthly/quarterly/yearly rules** | Supports ordinal weekdays, multi-ordinal combos, keywords like “semiannual”/“twice a year” | ✅ Implemented |
| **Edge handling** | Month-length clamping, DST-safe noon timestamps | ✅ Implemented |
| **FDOW (first day of week)** | Setting respected for parsing, scheduling, and previews | ✅ Implemented |

---

## 🧩 Next Iteration Steps

| Step | Focus | Description |
|------|--------|-------------|
| **1. Start & Defer Dates** | 📅 | Add optional `start::` and `defer::` attributes (user-configurable names). Rules should handle visibility (“show after defer”). |
| **2. Dashboard View** | 📊 | Build a lightweight React dashboard embedded in Roam (tabs: Today / Upcoming / Deferred / Completed). Lazy-load blocks for performance. |
| **3. Priority & Context Support** | 🏷️ | Add parsing and optional attributes like `priority::`, `context::`, `energy::`. Allow user-defined attribute names. |
| **4. Project Support** | 🗂️ | Add optional `project::` attribute or page link grouping (e.g., like Todoist projects). Use for dashboard grouping/filtering. |
| **5. Dashboard Filters** | 🔍 | Filter by project, context, priority, or due range (e.g., “next 7 days”). |
| **6. Bulk Operations** | ⚙️ | Add checkboxes and batch actions (complete / skip / snooze / reschedule). |
| **7. Recurrence Editor UI** | 🧠 | Inline “pill” editor for repeat rules (parse + regenerate rule text). |
| **8. Audit Trail** | 🪵 | Maintain lightweight hidden metadata (`rt-id`, `rt-parent`, `rt-lastCompleted`) for tracking chain history. |
| **9. Cross-Device Consistency** | 📱 | Ensure task creation and spawn work under mobile Roam with offline latency. |

---

## 🧠 Parsing & Rule Engine Enhancements

| Area | Status | Notes |
|------|--------|-------|
| **Fortnightly vs every 2 weeks** | ✅ | Normalized aliases share the same base interval. |
| **Monthly rules** | ✅ | Handles fixed dates, ordinal weekdays, multi-ordinal combos, child/inline attr removal. |
| **Natural language** | ✅ | Supports keywords like “weekends”, “every 3rd Thursday”, quarterly/annual phrases, semiannual variants. |
| **Edge handling** | ⚙️ In progress | Month-length clamping + DST-safe noon timestamps shipped; continue monitoring. |
| **User FDOW setting** | ✅ | Setting implemented and respected by parsing, scheduling, and previews. |

---

## ⚙️ Settings (Current & Planned)

| Setting ID | Name | Description | Status |
|-------------|------|-------------|--------|
| `rt-destination` | Destination for next task | DNP / Same page / DNP under heading | ✅ |
| `rt-dnp-heading` | Heading under DNP | Optional | ✅ |
| `rt-due-attr` | Attribute name for due date | Default `due` | ✅ |
| `rt-repeat-attr` | Attribute name for repeat rule | Default `repeat` | ✅ |
| `rt-fdow` | First day of week | User preference (Sunday–Saturday) | ✅ |
| `rt-start-attr` | Attribute name for start date | Default `start` | 🚧 Planned |
| `rt-defer-attr` | Attribute name for defer date | Default `defer` | 🚧 Planned |
| `rt-priority-attr`, `rt-context-attr` | Attribute names for optional metadata | Planned | 🚧 |
| `rt-hide-completed` | Hide completed recurring series | Optional toggle | 🚧 |

---

## 🔬 Testing Plan

| Area | Test Focus |
|------|-------------|
| Repeat parsing | All known syntaxes (“every N days”, “fortnightly”, “weekdays/weekends”, “monthly on Xth”) |
| Attribute detection | Works with user-defined attribute names and child-block syntax |
| Completion trigger | Correct spawn on DONE, no duplicates |
| Destination handling | Correct placement per user setting |
| Hidden mode | Hidden children preserved, not deleted |
| Create-Recurring-Task UI | Command works for all settings |
| FDOW influence | Weekly rules respect user’s setting |
| Edge cases | Leap years, month-end boundaries, DST transitions |

---

## 🌱 Future Ideas / Optional Features

* **Skip / Snooze buttons** inline next to tasks.  
* **Calendar integration** (sync or export `.ics`).  
* **Natural-language creation** (“Every Monday at 9am until June”).  
* **Series completion summary** (“Task completed 12 times this year”).  
* **Smart defaults by page/project type** (e.g., “Work” page defaults to Monday–Friday).  
* **Multi-user support** for shared graphs.  
