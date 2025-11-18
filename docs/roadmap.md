# Better Tasks — Roadmap

> Canonical roadmap for the Better Tasks Roam extension (updated 16 Nov 2025)

---

## Phase 1 — Foundation (✅ Complete)
Core functionality + safe recurring engine

- Recurring task creation from natural-language repeat rules.
- User-configurable attribute names (BT_attrRepeat, BT_attrStart, BT_attrDefer, BT_attrDue, BT_attrCompleted).
- Non-destructive behavior (hidden child blocks vs inline).
- Start/defer/due date attribute support.
- Rename extension to **Better Tasks**.
- UI/manifest & settings updates.
- Natural-language repeat patterns: daily, weekdays, weekly (multi-day), every N weeks, monthly by date, monthly by nth weekday, etc.

---

## Phase 2 — One-Off Tasks Support (✅ Complete)
Unifying recurring + non-recurring task logic

- Timing logic (start/defer/due) applies to non-recurring tasks.
- Completion writes `completed:: [[<today>]]` in Roam-formatted date.
- Unified parsing/writing logic for recurring + one-off tasks.
- Removed inline attribute pills & hidden-block mode complexity.
- Canonical storage via child blocks only.
- Key handling aligned with Roam.

---

## Phase 3 — Input Handling & UX Polish (✅ Complete)
Smooth authoring & editing

- Shift-key handling replaced with Roam-native behaviour.
- Reworked Better Tasks shortcut modifier.
- Updated tooltips, command-palette entries, help/README.
- Regression tests for task toggles, completions, and key handling.
- Inline display pills updated and synced.

---

## Phase 4 — Dashboard & UI Enhancements (🚧 In Progress)
Interactive task manager view

**Done**

- React dashboard view with filters, grouping, snooze/complete controls, and block-links.
- Dashboard quick-add input (AI when enabled; falls back to manual Better Task flow).
- Draggable dashboard with persistent positioning.
- Topbar icon + command-palette toggles.
- Live sync between dashboard and inline pills.
- First-day-of-week setting.
- Ability to add/remove repeat/start/defer/due attributes directly from the dashboard menu.
- Adaptive theming for Roam light/dark and popular theme packs (ongoing polish).
- Dashboard support for waiting-for, project, context, priority and energy attributes, including creating, editing and deleting.

**In Progress**

Inline Pills:
- Add **waiting for** support.
- Add **project attribute** support.
- Add **context attribute** support.
- Introduce **priority** and **energy** attributes.

**Pending**

- Explore richer Smart UI components (hover cards, quick editors, multi-select, etc.).

---

## Phase 5 — Cleanup & Release (⏳ Pending)

- Final docs/README/Roam Depot listing pass.
- Broader validation via user testing and feedback.
- Final consistency pass on attribute parsing, writing, date handling, and pill sync.

---

## AI Task Input Parsing — Phase 1 (🚧 In Progress)

Optional AI-assisted task creation using a user-supplied OpenAI API key.

**Done**
- Settings: AI parsing mode (Off / Use my OpenAI key) and API key input (opt-in, stored in Roam settings).
- Client-side OpenAI call with strict JSON response, defensive parsing, and repeat/date validation using existing logic.
- Mapping JSON → Better Tasks: title-only TODO text with child attrs for repeat/start/defer/due; relative dates parsed; repeat validated against current parser; scheduling text stripped from titles before write.
- Fallback: on any AI failure, toast + console warn + automatic fallback to the existing manual “Create a Better Task” flow.
- UX: integrated into existing command palette + block context menu (no separate AI command); spinner toast while awaiting OpenAI; quota-specific toast for 429/insufficient_quota.
- Docs: README section covering enablement, privacy, limitations, and failure behaviour.

**Pending**
- Mapping/storing project/context/priority/energy when those attributes are defined.
- Further prompt/model tuning once broader usage feedback arrives.

### Phase 2 AI Ideas (Not Yet Scheduled)

- **Help Me Plan** — given a single high-level task, use AI to suggest and optionally create a structured list of subtasks (each as its own Better Task), preserving links back to the parent.
- **Clipboard Events** — a “Create from Clipboard” mode that reads the current clipboard contents and turns it into one or more tasks with sensible titles, descriptions, and due dates (e.g. from an email, agenda, or notes dump).

---

## Future Enhancements (Backlog)

### Attributes & Metadata

- Add a settings switch to allow recurrence to anchor on the defer date instead of the due date.
- Implement task dependencies (e.g., “blocked by”, “waiting on”, sequential chains).
- Add a waiting-for attribute for GTD-style workflows.
- Add explicit GTD modes: next, waiting, delegated.
- Support shortcode input parsing (similar to Todoist’s syntax such as `!priority`, `@context`, etc.).
- Add AI-powered task input parsing for natural-language task creation.
- Add project categories and tag-like attributes.
- Add a roadmap item to review GTD literature, OmniFocus documentation, and Todoist documentation for idea generation and model alignment.

### Views / UI

- Series history / recurrence log view.
- Statistics & streaks.
- Week-ahead view.
- Additional visualization modes (e.g., Kanban / board, swimlanes, calendar heatmaps).
- Today widget.

### Optional Utility Features

- Simple reminders.
- Explore collaborative/shared-graph-safe features (e.g., @mention awareness).
