import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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

function Pill({ icon, label, value, muted, onClick }) {
  if (!value) return null;
  return (
    <button
      type="button"
      className={`bt-pill${muted ? " bt-pill--muted" : ""}`}
      title={label || undefined}
      onClick={onClick}
    >
      {icon ? (
        <span className="bt-pill__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="bt-pill__value">{value}</span>
    </button>
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

function TaskActionsMenu({ task, controller, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const setOpenState = useCallback(
    (next) => {
      setOpen((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (value !== prev) {
          onOpenChange?.(value);
        }
        return value;
      });
    },
    [onOpenChange]
  );

  useEffect(() => {
    return () => {
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 200; // provide enough room for the menu
    const openUpwards = rect.bottom + estimatedHeight > viewportHeight && rect.top > estimatedHeight;
    setCoords({
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: rect.right,
      align: openUpwards ? "top" : "bottom",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        buttonRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpenState(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpenState(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const actions = useMemo(() => {
    if (!task || !controller) return [];
    const list = [];
    const labels = {
      repeat: "repeat",
      start: "start date",
      defer: "defer date",
      due: "due date",
    };
    const hasRepeat = !!task.repeatText;
    const hasStart = task.startAt instanceof Date;
    const hasDefer = task.deferUntil instanceof Date;
    const hasDue = task.dueAt instanceof Date;

    const pushDateActions = (type, hasValue) => {
      if (hasValue) {
        list.push({
          key: `edit-${type}`,
          label: `Edit ${labels[type]}`,
          handler: () =>
            controller.editDate(task.uid, type, { intent: "menu-edit" }),
        });
        list.push({
          key: `remove-${type}`,
          label: `Remove ${labels[type]}`,
          handler: () => controller.removeTaskAttribute(task.uid, type),
          danger: true,
        });
      } else {
        list.push({
          key: `add-${type}`,
          label: `Add ${labels[type]}`,
          handler: () =>
            controller.editDate(task.uid, type, { intent: "menu-add" }),
        });
      }
    };

    if (hasRepeat) {
      list.push({
        key: "edit-repeat",
        label: "Edit repeat",
        handler: () => controller.editRepeat(task.uid),
      });
      list.push({
        key: "remove-repeat",
        label: "Remove repeat",
        handler: () => controller.removeTaskAttribute(task.uid, "repeat"),
        danger: true,
      });
    } else {
      list.push({
        key: "add-repeat",
        label: "Add repeat",
        handler: () => controller.editRepeat(task.uid),
      });
    }

    pushDateActions("start", hasStart);
    pushDateActions("defer", hasDefer);
    pushDateActions("due", hasDue);

    return list;
  }, [controller, task]);

  if (!actions.length) return null;

  const menuRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    const root = document.createElement("div");
    root.className = "bt-task-menu-portal";
    root.setAttribute("data-bt-portal", "task-menu");
    root.style.position = "relative";
    root.style.zIndex = "1000";
    return root;
  }, []);

  useEffect(() => {
    if (!menuRoot || typeof document === "undefined") return undefined;
    const host = document.querySelector(".bt-dashboard-host") || document.body;
    host.appendChild(menuRoot);
    return () => {
      menuRoot.remove();
    };
  }, [menuRoot]);

  const menu = open && menuRoot
    ? createPortal(
        <div
          className="bt-task-menu__popover"
          role="menu"
          ref={menuRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            transform:
              coords.align === "top"
                ? "translate(-100%, -100%)"
                : "translate(-100%, 0)",
          }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={`bt-task-menu__item${action.danger ? " bt-task-menu__item--danger" : ""}`}
              onClick={() => {
                setOpenState(false);
                action.handler();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        menuRoot
      )
    : null;

  return (
    <div className={`bt-task-menu${open ? " bt-task-menu--open" : ""}`}>
      <button
        type="button"
        className="bt-task-menu__trigger"
        onClick={() => setOpenState((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Task options"
        ref={buttonRef}
      >
        ⋯
      </button>
      {menu}
    </div>
  );
}

function TaskRow({ task, controller }) {
  const checkboxLabel = task.isCompleted ? "Mark as open" : "Mark as done";
  const [menuOpen, setMenuOpen] = useState(false);
  const handleMenuOpenChange = useCallback((value) => {
    setMenuOpen(value);
  }, []);
  const contextBits = [];
  if (task.pageTitle) {
    contextBits.push({
      key: "page",
      type: "page",
      text: task.pageTitle,
      pageUid: task.pageUid,
    });
  }
  if (task.isCompleted) contextBits.push({ key: "completed", type: "text", text: "Completed" });
  else if (task.availabilityLabel) contextBits.push({ key: "availability", type: "text", text: task.availabilityLabel });
  const showSnooze = !task.isCompleted;
  const handlePillClick = (event, pill, taskRow, ctrl) => {
    const type = pill.type;
    if (type === "repeat") {
      ctrl.editRepeat(taskRow.uid, event);
    } else if (type === "start" || type === "defer" || type === "due") {
      ctrl.editDate(taskRow.uid, type, { event });
    }
  };
  return (
    <div className={`bt-task-row${menuOpen ? " bt-task-row--menu-open" : ""}`}>
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
          <div className="bt-task-row__meta-pills">
            {(task.metaPills || []).map((pill) => (
              <div key={`${task.uid}-${pill.type}`} className="bt-pill-wrap">
                <Pill
                  icon={pill.icon}
                  label={pill.label}
                  value={pill.value}
                  muted={!pill.value}
                  onClick={(e) => handlePillClick(e, pill, task, controller)}
                />
              </div>
            ))}
          </div>
          <TaskActionsMenu task={task} controller={controller} onOpenChange={handleMenuOpenChange} />
        </div>
        <div className="bt-task-row__context">
          {contextBits.map((bit, idx) => {
            const prefix = idx > 0 ? (
              <span key={`sep-${task.uid}-${idx}`} className="bt-task-row__context-sep">
                &middot;
              </span>
            ) : null;
            const key = `${task.uid}-${bit.key || idx}`;
            if (bit.type === "page" && bit.pageUid) {
              return (
                <React.Fragment key={key}>
                  {prefix}
                  <button
                    type="button"
                    className="bt-task-row__context-link"
                    onClick={(event) => controller.openPage(bit.pageUid, { inSidebar: event.shiftKey })}
                    title="Open page (Shift+Click → sidebar)"
                  >
                    [[{bit.text}]]
                  </button>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={key}>
                {prefix}
                <span>{bit.text}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <div className="bt-task-row__actions">
        <button
          type="button"
          className="bp3-button bp3-small"
          onClick={() =>
            controller.openBlock(task.uid, { skipCompletionToast: task.isCompleted })
          }
        >
          View
        </button>
        {showSnooze ? (
          <div className="bt-task-row__snooze">
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={() => controller.snoozeTask(task.uid, 1)}
            >
              +1d
            </button>
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={() => controller.snoozeTask(task.uid, 7)}
            >
              +7d
            </button>
            <button
              type="button"
              className="bp3-button bp3-small"
              onClick={() => controller.snoozeTask(task.uid, "pick")}
            >
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
    getItemKey: (index) => rows[index]?.key ?? index,
    getScrollElement: () => parentRef.current,
    overscan: 8,
    measureElement,
  });

  const handleFilterToggle = (section, value) => {
    dispatchFilters({ type: "toggle", section, value });
  };

  const [quickText, setQuickText] = useState("");

  const handleQuickAddSubmit = async () => {
    const value = quickText.trim();
    if (!value) return;
    try {
      await controller.quickAdd?.(value);
      setQuickText("");
    } catch (err) {
      console.error("[BetterTasks] quick add failed", err);
    }
  };

  const handleQuickAddKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleQuickAddSubmit();
    }
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
          <button type="button" className="bp3-button bp3-small" onClick={handleRefresh}>
            Refresh
          </button>
          <button
            type="button"
            className="bp3-button bp3-small"
            onClick={onRequestClose}
            aria-label="Close dashboard"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="bt-dashboard__quick-add">
        <div className="bt-quick-add">
          <input
            type="text"
            className="bt-quick-add__input"
            placeholder="Add a Better Task"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
          />
          <button type="button" className="bp3-button bp3-small" onClick={handleQuickAddSubmit}>
            OK
          </button>
        </div>
      </div>

      <div className="bt-dashboard__controls">
        <div className="bt-search-row">
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
                <div
                  style={style}
                  key={row.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                >
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
              <div
                style={style}
                key={row.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
              >
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
