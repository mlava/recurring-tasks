# Better Tasks — Roadmap

## Phase 1 — Foundation (Complete)
- ✅ Implement recurring task creation based on `repeat::` rules.
- ✅ Add user-configurable attribute names for `due` and `repeat`.
- ✅ Migrate from destructive (delete child blocks) to non-destructive (retain structure) behavior.
- ✅ Support natural-language repeat patterns (daily, weekly, every 2 days, etc.).
- ✅ Add support for `start` and `defer` attributes.
- ✅ Transition from “Recurring Tasks” to **Better Tasks** naming.
- ✅ Update all UI labels, toasts, and manifest metadata.

## Phase 2 — One-Off Tasks Support (Complete)
- ✅ Extend timing logic (`start`, `defer`, `due`) to non-recurring tasks.
- ✅ Ensure completion writes `completed:: [[<today>]]` in Roam date format.
- ✅ Maintain identical parsing and writing logic between recurring and one-off tasks.
- ✅ Remove inline attribute parsing (child blocks only).
- ✅ Remove hidden blocks mode.
- ✅ Confirm key handling alignment with Roam native conventions (see below).

## Phase 3 — Input Handling & UX Polish (Complete)
- ✅ **Action:** Replace custom **Shift** key handling with **Roam native** behavior.
- ✅ **Change:** Choose an **alternative modifier** (Alt/Option, Ctrl/Cmd, etc.) for Better Tasks actions.
- **Follow-ups:**
  - ✅ Audit all shortcuts using Shift.
  - ✅ Implement new mapping.
  - ✅ Update tooltips, help text, and README.
  - ✅ Add regression tests for key handling during task toggles and completions.

## Phase 4 — Future Enhancements
- ⏳ Implement dashboard view (filter tasks by availability, defer, and due).
- ⏳ Add project and context attribute support.
- ⏳ Introduce priority and energy attributes.
- ✅ Add user setting for “first day of week” (already present for repeats).
- ⏳ Explore Smart UI components (task pills, hover info, snooze, etc.).

## Phase 5 — Cleanup & Release
- 🧹 Refactor code to use `bt-` namespace instead of `rt-` (for Better Tasks).
- 🧹 Update documentation, README, and Roam Depot listing.
- 🧹 Validate with user testing and collect feedback before next iteration.

---
