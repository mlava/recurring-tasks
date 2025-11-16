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
- Draggable dashboard with persistent positioning.
- Topbar icon + command-palette toggles.
- Live sync between dashboard and inline pills.
- First-day-of-week setting.
- Ability to add/remove repeat/start/defer/due attributes directly from the dashboard menu.

**Pending**

- Improve adaptive theming for Roam themes (light/dark and popular theme packs).
- Add **project attribute** support.
- Add **context attribute** support.
- Introduce **priority** and **energy** attributes.
- Explore richer Smart UI components (hover cards, quick editors, multi-select, etc.).

---

## Phase 5 — Cleanup & Release (⏳ Pending)

- Final docs/README/Roam Depot listing pass.
- Refactor internal namespace from `rt-` → `bt-`.
- Broader validation via user testing and feedback.
- Final consistency pass on attribute parsing, writing, date handling, and pill sync.

---

## AI Task Input Parsing — Phase 1 (Planned)

High-level plan for adding optional AI-assisted task creation using a user-supplied OpenAI API key.

1. **Settings & Feature Flag**
   - Add a Better Tasks setting group for AI parsing.
   - Options:
     - `AI parsing mode: Off / Use my OpenAI key`.
     - Hidden input field for the user’s OpenAI API key.
   - Default to **Off**; feature is opt-in and clearly labelled as experimental.

2. **Client-Side OpenAI Call (BYO Key)**
   - When AI parsing is enabled and a key is present, send the raw task input string directly to the OpenAI API from the extension.
   - Use a strict JSON-output format (or function calling) that returns a `ParsedTask` object with fields like `title`, `repeatRule`, `dueDate`, and optional metadata (project/context/priority/energy).
   - Enforce small, bounded prompts and responses (token limits, defensive parsing).

3. **Mapping JSON → Better Tasks Block Structure**
   - Validate the returned JSON against a lightweight schema.
   - Convert `ParsedTask` into:
     - A TODO block string (task title only).
     - Child blocks using the configured attribute names (`BT_attrRepeat`, `BT_attrStart`, `BT_attrDefer`, `BT_attrDue`, `BT_attrCompleted`, and future project/context/priority/energy attributes).
   - Reuse existing repeat/date parsing logic whenever possible (AI outputs rules/text that your current parser already understands).

4. **Fallback Behaviour**
   - If the OpenAI call fails, times out, or returns invalid JSON:
     - Log a console warning in dev builds.
     - Show a small notification (e.g. iziToast) that AI parsing is unavailable.
     - Fall back to the current “Create a Better Task” flow, creating a normal TODO using the raw input text and no AI-derived attributes.
   - Ensure that failure never blocks task creation.

5. **UX Integration**
   - Add an “AI create task” option to the command palette and/or dashboard “New task” UI.
   - When enabled, the AI path is used; otherwise, the existing manual create-task flow runs unchanged.
   - Keep AI parsing optional and clearly separated so users can choose their preferred flow.

6. **Documentation & Safety Notes**
   - Update README / docs to include:
     - What AI task parsing does.
     - That it is BYO OpenAI key, stored in Roam settings and used client-side.
     - Clear notes on privacy and limitations (e.g. experimental, may misinterpret ambiguous text).
   - Add a short troubleshooting section for common failure modes (invalid key, network issues).

7. **Initial Testing & Iteration**
   - Create a small test suite of sample input strings in Roam to exercise AI parsing (simple, recurring, messy/ambiguous).
   - Iterate on prompts and output schema as needed, without changing the underlying Better Tasks storage model.
   - Only consider Phase 2 (e.g. hosted proxy, richer models) after Phase 1 is stable and useful for power users.

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
