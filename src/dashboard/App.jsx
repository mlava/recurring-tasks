import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useVirtualizer, measureElement } from "@tanstack/react-virtual";

const FILTER_DEFS = {
  recurrence: [
    { value: "recurring", label: "Recurring" },
    { value: "one-off", label: "One-off" },
  ],
  start: [
    { value: "not-started", label: "Not Started" },
    { value: "started", label: "Started" },
  ],
  defer: [
    { value: "deferred", label: "Deferred" },
    { value: "available", label: "Available" },
  ],
  due: [
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "none", label: "No Due" },
  ],
  completion: [
    { value: "open", label: "Open" },
    { value: "completed", label: "Completed" },
  ],
};

const DEFAULT_FILTERS = {
  recurrence: [],
  start: [],
  defer: [],
  due: [],
  completion: ["open"],
};

const GROUPING_OPTIONS = [
  { value: "time", label: "By Time" },
  { value: "recurrence", label: "By Recurrence" },
];

const GROUP_LABELS = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No Due Date",
  recurring: "Recurring",
  "one-off": "One-off",
};

const GROUP_ORDER_TIME = ["overdue", "today", "upcoming", "none"];
const GROUP_ORDER_RECURRENCE = ["recurring", "one-off"];

const INITIAL_SNAPSHOT = {
  tasks: [],
  status: "idle",
  error: null,
  lastUpdated: null,
};

function filtersReducer(state, action) {
  switch (action.type) {
    case "toggle": {
      const current = new Set(state[action.section] || []);
      if (current.has(action.value)) {
        current.delete(action.value);
      } else {
        current.add(action.value);
      }
      return { ...state, [action.section]: Array.from(current) };
    }
    case "reset":
      return { ...DEFAULT_FILTERS };
    default:
      return state;
  }
}

function useControllerSnapshot(controller) {
  const [snapshot, setSnapshot] = useState(() =>
    controller?.getSnapshot ? controller.getSnapshot() : INITIAL_SNAPSHOT
  );
  useEffect(() => {
    if (!controller) return undefined;
    const unsub = controller.subscribe((next) => setSnapshot({ ...next, tasks: [...next.tasks] }));
    controller.ensureInitialLoad?.();
    return unsub;
  }, [controller]);
  return snapshot;
}

function applyFilters(tasks, filters, query) {
  const queryText = query.trim().toLowerCase();
  const recurrenceFilter = new Set(filters.recurrence);
  const startFilter = new Set(filters.start);
  const deferFilter = new Set(filters.defer);
  const dueFilter = new Set(filters.due);
  const completionFilter = new Set(filters.completion);
  return tasks.filter((task) => {
    if (completionFilter.size) {
      const value = task.isCompleted ? "completed" : "open";
      if (!completionFilter.has(value)) return false;
    }
    if (recurrenceFilter.size && !recurrenceFilter.has(task.recurrenceBucket)) return false;
    if (startFilter.size && !startFilter.has(task.startBucket)) return false;
    if (deferFilter.size && !deferFilter.has(task.deferBucket)) return false;
    if (dueFilter.size && !dueFilter.has(task.dueBucket)) return false;
    if (queryText) {
      const haystack = `${task.title} ${task.pageTitle || ""} ${task.text}`.toLowerCase();
      if (!haystack.includes(queryText)) return false;
    }
    return true;
  });
}

function groupTasks(tasks, grouping, options = {}) {
  const completionFilter = options.completion || [];
  const completedOnly = completionFilter.length === 1 && completionFilter[0] === "completed";
  const completedTasks = completedOnly ? tasks.filter((task) => task.isCompleted) : [];
  const workingTasks = completedOnly ? tasks.filter((task) => !task.isCompleted) : tasks;
  const groups = [];
  if (grouping === "recurrence") {
    for (const key of GROUP_ORDER_RECURRENCE) {
      const items = workingTasks.filter((task) => task.recurrenceBucket === key);
      if (items.length) {
        groups.push({ id: key, title: GROUP_LABELS[key], items });
      }
    }
    if (completedTasks.length) {
      groups.unshift({ id: "completed", title: "Completed", items: completedTasks });
    }
    return groups;
  }
  for (const key of GROUP_ORDER_TIME) {
    const items = workingTasks.filter((task) => task.dueBucket === key);
    if (items.length) {
      groups.push({ id: key, title: GROUP_LABELS[key], items });
    }
  }
  if (completedTasks.length) {
    groups.unshift({ id: "completed", title: "Completed", items: completedTasks });
  }
  return groups;
}

function useVirtualRows(groups, expandedMap) {
  return useMemo(() => {
    const rows = [];
    for (const group of groups) {
      rows.push({ type: "group", key: `group-${group.id}`, groupId: group.id, group });
      if (expandedMap[group.id] !== false) {
        for (const task of group.items) {
          rows.push({ type: "task", key: `task-${task.uid}`, groupId: group.id, task });
        }
      }
    }
    return rows;
  }, [groups, expandedMap]);
}

function Pill({ icon, label, value, muted }) {
  if (!value) return null;
  return (
    <span className={`bt-pill${muted ? " bt-pill--muted" : ""}`} title={label || undefined}>
      {icon ? (
        <span className="bt-pill__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="bt-pill__value">{value}</span>
    </span>
  );
}

function FilterChips({ section, chips, activeValues, onToggle }) {
  return (
    <div className="bt-filter-row">
      <span className="bt-filter-row__label">{section}</span>
      <div className="bt-filter-row__chips">
        {chips.map((chip) => {
          const active = activeValues.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              className={`bt-chip${active ? " bt-chip--active" : ""}`}
              onClick={() => onToggle(section.toLowerCase(), chip.value)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupHeader({ title, count, isExpanded, onToggle }) {
  return (
    <button
      type="button"
      className="bt-group-header"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <span className="bt-group-header__title">
        <span className="bt-group-header__caret" aria-hidden="true">
          {isExpanded ? "▾" : "▸"}
        </span>
        {title}
      </span>
      <span className="bt-group-header__count">{count}</span>
    </button>
  );
}

function TaskRow({ task, controller }) {
  const checkboxLabel = task.isCompleted ? "Mark as open" : "Mark as done";
  const contextBits = [];
  if (task.pageTitle) contextBits.push({ key: "page", text: `In ${task.pageTitle}` });
  if (task.isCompleted) contextBits.push({ key: "completed", text: "Completed" });
  else if (task.availabilityLabel) contextBits.push({ key: "availability", text: task.availabilityLabel });
  const showSnooze = !task.isCompleted;
  return (
    <div className="bt-task-row">
      <button
        className={`bt-task-row__checkbox${task.isCompleted ? " bt-task-row__checkbox--done" : ""}`}
        onClick={() =>
          controller.toggleTask(task.uid, task.isCompleted ? "undo" : "complete")
        }
        title={checkboxLabel}
        aria-label={checkboxLabel}
      >
        {task.isCompleted ? "☑" : "☐"}
      </button>
      <div className="bt-task-row__body">
        <div className="bt-task-row__title">{task.title || "(Untitled task)"}</div>
        <div className="bt-task-row__meta">
          {(task.metaPills || []).map((pill) => (
            <Pill
              key={`${task.uid}-${pill.type}`}
              icon={pill.icon}
              label={pill.label}
              value={pill.value}
              muted={!pill.value}
            />
          ))}
        </div>
        <div className="bt-task-row__context">
          {contextBits.map((bit, idx) => (
            <span key={`${task.uid}-${bit.key || idx}`}>{bit.text}</span>
          ))}
        </div>
      </div>
      <div className="bt-task-row__actions">
        <button
          type="button"
          onClick={() =>
            controller.openBlock(task.uid, { skipCompletionToast: task.isCompleted })
          }
        >
          View
        </button>
        {showSnooze ? (
          <div className="bt-task-row__snooze">
            <button type="button" onClick={() => controller.snoozeTask(task.uid, 1)}>
              +1d
            </button>
            <button type="button" onClick={() => controller.snoozeTask(task.uid, 7)}>
              +7d
            </button>
            <button type="button" onClick={() => controller.snoozeTask(task.uid, "pick")}>
              Pick
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ status, onRefresh }) {
  if (status === "loading") {
    return <div className="bt-empty">Loading tasks…</div>;
  }
  if (status === "error") {
    return (
      <div className="bt-empty">
        <p>Couldn’t load tasks.</p>
        <button type="button" onClick={onRefresh}>
          Try again
        </button>
      </div>
    );
  }
  return <div className="bt-empty">No tasks match the selected filters.</div>;
}

export default function DashboardApp({ controller, onRequestClose, onHeaderReady }) {
  const snapshot = useControllerSnapshot(controller);
  const [filters, dispatchFilters] = useReducer(filtersReducer, DEFAULT_FILTERS);
  const [grouping, setGrouping] = useState("time");
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});
  const filteredTasks = useMemo(
    () => applyFilters(snapshot.tasks, filters, query),
    [snapshot.tasks, filters, query]
  );
  const groups = useMemo(
    () => groupTasks(filteredTasks, grouping, { completion: filters.completion }),
    [filteredTasks, grouping, filters.completion]
  );
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      const ids = new Set(groups.map((group) => group.id));
      groups.forEach((group) => {
        if (!(group.id in next)) {
          next[group.id] = true;
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groups]);

  const rows = useVirtualRows(groups, expandedGroups);
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => (rows[index].type === "group" ? 40 : 100),
    getScrollElement: () => parentRef.current,
    overscan: 8,
    measureElement,
  });

  const handleFilterToggle = (section, value) => {
    dispatchFilters({ type: "toggle", section, value });
  };

  const handleRefresh = () => controller.refresh?.({ reason: "manual" });

  const headerRef = useCallback(
    (node) => {
      if (typeof onHeaderReady === "function") {
        onHeaderReady(node);
      }
    },
    [onHeaderReady]
  );

  return (
    <div className="bt-dashboard">
      <header className="bt-dashboard__header" ref={headerRef}>
        <div>
          <h2>Better Tasks</h2>
          <p>Manage start, defer, due, and recurring tasks without leaving Roam.</p>
        </div>
        <div className="bt-dashboard__header-actions">
          <button type="button" onClick={handleRefresh}>
            Refresh
          </button>
          <button type="button" onClick={onRequestClose} aria-label="Close dashboard">
            ✕
          </button>
        </div>
      </header>

      <div className="bt-dashboard__controls">
        <input
          type="text"
          className="bt-search"
          placeholder="Search tasks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="bt-grouping">
          {GROUPING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`bt-chip${grouping === option.value ? " bt-chip--active" : ""}`}
              onClick={() => setGrouping(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bt-dashboard__filters">
        {Object.entries(FILTER_DEFS).map(([section, chips]) => (
          <FilterChips
            key={section}
            section={section}
            chips={chips}
            activeValues={filters[section]}
            onToggle={handleFilterToggle}
          />
        ))}
      </div>

      <div className="bt-dashboard__content" ref={parentRef}>
        <div
          className="bt-virtualizer"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const style = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            };
            if (row.type === "group") {
              const expanded = expandedGroups[row.group.id] !== false;
              return (
                <div style={style} key={row.key} ref={rowVirtualizer.measureElement}>
                  <GroupHeader
                    title={row.group.title}
                    count={row.group.items.length}
                    isExpanded={expanded}
                    onToggle={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [row.group.id]: !expanded,
                      }))
                    }
                  />
                </div>
              );
            }
            return (
              <div style={style} key={row.key} ref={rowVirtualizer.measureElement}>
                <TaskRow task={row.task} controller={controller} />
              </div>
            );
          })}
        </div>
        {!rows.length ? (
          <div className="bt-content-empty">
            <EmptyState status={snapshot.status} onRefresh={handleRefresh} />
          </div>
        ) : null}
      </div>

      <footer className="bt-dashboard__footer">
        <div>
          <strong>Legend:</strong> Repeat shows recurrence rule; Start/Defer/Due show Roam dates.
        </div>
        <div className="bt-dashboard__footer-actions">
          <button type="button" onClick={() => controller.openSettings?.()}>
            Settings
          </button>
        </div>
      </footer>
    </div>
  );
}
