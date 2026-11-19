import { useRef, useState } from "react";
import { useAddBox } from "./useAddBox";
import { TEXT_LIMITS } from "../lib/limits";
import { useServerState } from "./useServerState";
import { addTask, updateTask, removeTask, reorderTasks } from "../lib/db";
import type { Task, Thought, ThoughtGroup } from "../lib/types";
import ThoughtLog from "./ThoughtLog";
import AutoTextarea from "./AutoTextarea";
import { isSubmitEnter } from "./keys";
import { reorder } from "./useDragReorder";
import { useEdgeAutoScroll } from "./useEdgeAutoScroll";

export default function TaskPanel({
  initialTasks,
  initialThoughts,
  initialThoughtGroups,
  syncVersion = 0,
}: {
  initialTasks: Task[];
  initialThoughts: Thought[];
  initialThoughtGroups: ThoughtGroup[];
  syncVersion?: number;
}) {
  const [panelView, setPanelView] = useState<"tasks" | "thoughts">("tasks");
  const [tasks, setTasks] = useServerState<Task[]>(initialTasks, syncVersion);

  const [edits, setEditsState] = useState<Record<string, { text: string; focus: boolean }>>({});
  const editsRef = useRef(edits);
  const setEdits = (next: (prev: typeof edits) => typeof edits) => {
    editsRef.current = next(editsRef.current);
    setEditsState(editsRef.current);
  };
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const add = useAddBox(addTask, (created: Task) => setTasks((arr) => [...arr, created]));

  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const dragFrom = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; after: boolean } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const edgeScroll = useEdgeAutoScroll(listRef);

  function toggleDone(t: Task) {
    setTasks((arr) => arr.map((x) => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)));
    updateTask(t.id, { isDone: !t.isDone });
  }

  function startEdit(t: Task) {
    setEdits((e) => ({ ...e, [t.id]: { text: t.text, focus: true } }));
  }

  function closeEdit(id: string) {
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  async function commitEdit(id: string) {
    const draft = editsRef.current[id];
    if (!draft) return;
    closeEdit(id);
    const text = draft.text.trim();
    if (!text) return;
    setTasks((arr) => arr.map((x) => (x.id === id ? { ...x, text } : x)));
    const saved = await updateTask(id, { text });
    if (!saved && !editsRef.current[id] && tasksRef.current.some((t) => t.id === id)) {
      setEdits((e) => ({ ...e, [id]: { text, focus: false } }));
    }
  }

  function deleteTask(id: string) {
    setTasks((arr) => arr.filter((x) => x.id !== id));
    removeTask(id);
  }

  function onDragStart(index: number) {
    return () => {
      if (grabbedId !== displayTasks[index]?.id) return;
      dragFrom.current = displayTasks[index]?.id ?? null;
      edgeScroll.start();
    };
  }
  function onDragOver(index: number, atEnd = false) {
    return (e: React.DragEvent) => {
      if (dragFrom.current === null) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = atEnd || e.clientY - rect.top > rect.height / 2;
      setDropAt({ index, after });
    };
  }
  function onDrop(index: number, atEnd = false) {
    return (e: React.DragEvent) => {
      const held = dragFrom.current;
      if (held === null) return;
      e.preventDefault();
      const from = displayTasks.findIndex((t) => t.id === held);
      if (from === -1) return endDrag();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = atEnd || e.clientY - rect.top > rect.height / 2;
      const to = index + (after ? 1 : 0);
      const moved = displayTasks[from];
      const group = reorder(displayTasks, from, to).filter((t) => t.isDone === moved.isDone);
      let place = 0;
      const next = tasks.map((t) => (t.isDone === moved.isDone ? group[place++] : t));
      setTasks(next);
      reorderTasks(next.map((t) => t.id));
      endDrag();
    };
  }
  function endDrag() {
    dragFrom.current = null;
    edgeScroll.stop();
    setGrabbedId(null);
    setDropAt(null);
  }

  const displayTasks = [...tasks].sort((a, b) => Number(a.isDone) - Number(b.isDone));

  return (
    <section className="bubble bubble-task">
      <header className="bubble-header">
        <span className="bubble-dot" style={{ background: "var(--accent-task)" }} />
        <h2 className="bubble-title">{panelView === "tasks" ? "Daily Task" : "Thoughts"}</h2>
        <div className="panel-toggle" role="group" aria-label="Switch panel view">
          <button
            type="button"
            className={"panel-toggle-btn" + (panelView === "tasks" ? " active" : "")}
            aria-pressed={panelView === "tasks"}
            aria-label="Task list"
            onClick={() => setPanelView("tasks")}
          >
            <svg viewBox="0 0 16 14" fill="none" aria-hidden="true">
              <rect x="0" y="0.5" width="5" height="1.8" rx="0.9" fill="currentColor"/>
              <rect x="7" y="0.5" width="9" height="1.8" rx="0.9" fill="currentColor"/>
              <rect x="0" y="6.1" width="5" height="1.8" rx="0.9" fill="currentColor"/>
              <rect x="7" y="6.1" width="9" height="1.8" rx="0.9" fill="currentColor"/>
              <rect x="0" y="11.7" width="5" height="1.8" rx="0.9" fill="currentColor"/>
              <rect x="7" y="11.7" width="9" height="1.8" rx="0.9" fill="currentColor"/>
            </svg>
          </button>
          <button
            type="button"
            className={"panel-toggle-btn" + (panelView === "thoughts" ? " active" : "")}
            aria-pressed={panelView === "thoughts"}
            aria-label="Thought log"
            onClick={() => setPanelView("thoughts")}
          >
            <svg viewBox="0 0 18 14" fill="none" aria-hidden="true">
              <circle cx="4" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="14" cy="4" r="2.4" stroke="currentColor" strokeWidth="1.6"/>
              <circle cx="13" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.6"/>
              <line x1="7.1" y1="6.2" x2="11.7" y2="4.6" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="7" y1="7.8" x2="11.3" y2="10.2" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>
        </div>
      </header>

      <div style={{ display: panelView === "thoughts" ? "flex" : "none", flex: 1, minHeight: 0, flexDirection: "column" }}>
        <ThoughtLog
          initialThoughts={initialThoughts}
          initialGroups={initialThoughtGroups}
          syncVersion={syncVersion}
        />
      </div>

      <div style={{ display: panelView === "tasks" ? "flex" : "none", flex: 1, minHeight: 0, flexDirection: "column" }}>
        <ul className="task-list" ref={listRef}>
          {displayTasks.map((t, i) => {
            const dropCue =
              dropAt && dropAt.index === i
                ? dropAt.after
                  ? { boxShadow: "inset 0 -2px 0 var(--accent-task)" }
                  : { boxShadow: "inset 0 2px 0 var(--accent-task)" }
                : undefined;
            return (
              <li
                key={t.id}
                className={"task-item" + (t.isDone ? " checked" : "")}
                draggable={grabbedId === t.id}
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDrop={onDrop(i)}
                onDragEnd={endDrag}
                style={{ opacity: grabbedId === t.id ? 0.5 : 1, ...dropCue }}
              >
                <svg
                  className="task-handle"
                  viewBox="0 0 8 14"
                  aria-hidden="true"
                  onMouseDown={() => setGrabbedId(t.id)}
                  onMouseUp={() => setGrabbedId(null)}
                >
                  <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                  <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
                  <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
                </svg>

                <button
                  className="task-check"
                  type="button"
                  aria-pressed={t.isDone}
                  aria-label={t.isDone ? "Mark task incomplete" : "Mark task complete"}
                  onClick={() => toggleDone(t)}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6 L5 8.5 L9.5 3.5" />
                  </svg>
                </button>

                {edits[t.id] ? (
                  <AutoTextarea
                    className="task-text task-text-input"
                    autoFocus={edits[t.id].focus}
                    maxLength={TEXT_LIMITS.taskText}
                    value={edits[t.id].text}
                    onChange={(e) => {
                      const text = e.target.value;
                      setEdits((all) => (all[t.id] ? { ...all, [t.id]: { ...all[t.id], text } } : all));
                    }}
                    onBlur={() => commitEdit(t.id)}
                    onKeyDown={(e) => {
                      if (isSubmitEnter(e)) { e.preventDefault(); commitEdit(t.id); }
                      if (e.key === "Escape") closeEdit(t.id);
                    }}
                  />
                ) : (
                  <span
                    className="task-text"
                    style={{ cursor: "text" }}
                    onClick={() => startEdit(t)}
                    title="Click to edit"
                  >
                    {t.text}
                  </span>
                )}

                <button
                  type="button"
                  className="task-delete"
                  aria-label="Delete task"
                  onClick={() => deleteTask(t.id)}
                >
                  ×
                </button>
              </li>
            );
          })}

          <li className={"task-item task-add-row" + (add.adding ? " adding" : "")}
              onDragOver={onDragOver(displayTasks.length - 1, true)}
              onDrop={onDrop(displayTasks.length - 1, true)}>
            {add.adding ? (
              <AutoTextarea
                className={"task-add" + (add.slow ? " saving-slow" : "")}
                autoFocus
                placeholder="Type a task, press Enter…"
                maxLength={TEXT_LIMITS.taskText}
                value={add.text}
                {...add.fieldProps}
                onChange={(e) => add.change(e.target.value)}
                onBlur={add.commit}
                onKeyDown={(e) => {
                  if (isSubmitEnter(e)) { e.preventDefault(); add.commit(); }
                  if (e.key === "Escape") add.cancel();
                }}
              />
            ) : (
              <button type="button" className="task-add" onClick={add.open}>
                + Add a task
              </button>
            )}
          </li>
        </ul>
      </div>
    </section>
  );
}
