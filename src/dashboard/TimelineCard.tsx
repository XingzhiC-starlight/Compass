import { useEffect, useState, type MouseEvent } from "react";
import { useAddBox } from "./useAddBox";
import { TEXT_LIMITS } from "../lib/limits";
import { useServerState } from "./useServerState";
import {
  setPhaseDone,
  renamePhase,
  removePhase,
  addPhase,
  reorderPhases,
  setPhaseDays,
  todayDate,
} from "../lib/db";
import type { Phase, Project } from "../lib/types";
import { useDragReorder, reorder } from "./useDragReorder";
import { dayNumber } from "./projectTime";
import { isSubmitEnter } from "./keys";

export default function TimelineCard({
  phases: initial,
  project,
  depth,
  onToggle,
  onPhasesChange,
  syncVersion = 0,
}: {
  phases: Phase[];
  project: Project;
  depth: boolean;
  onToggle: (e: MouseEvent) => void;
  onPhasesChange: (phases: Phase[]) => void;
  syncVersion?: number;
}) {
  const [phases, setPhases] = useServerState<Phase[]>(initial, syncVersion);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const add = useAddBox(addPhase, (created: Phase) => {
    const next = [...phases, created];
    setPhases(next);
    onPhasesChange(next);
  });
  const [editingDaysId, setEditingDaysId] = useState<string | null>(null);
  const [daysText, setDaysText] = useState("");
  const [glanceEditing, setGlanceEditing] = useState(false);
  const [glanceText, setGlanceText] = useState("");

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const dnd = useDragReorder((from, to) => {
    const next = reorder(phases, from, to);
    setPhases(next);
    reorderPhases(next.map((p) => p.id));
  });

  const total = phases.length;
  const currentIndex = phases.findIndex((p) => !p.isDone);
  const allDone = total > 0 && currentIndex === -1;
  const doneCount = phases.filter((p) => p.isDone).length;
  const phaseN = allDone ? total : currentIndex + 1;
  const currentName = allDone ? "All phases done" : total > 0 ? phases[currentIndex].name : "—";

  const elapsed = Math.max(0, dayNumber(project.startedAt) - 1);
  let acc = 0;
  const windows = phases.map((p) => {
    const before = acc;
    acc += Math.max(0, p.estDays);
    return { before, after: acc };
  });

  const current = currentIndex >= 0 ? phases[currentIndex] : null;
  const phaseProgress = allDone
    ? 100
    : current && current.estDays > 0
      ? Math.max(0, Math.min(100, ((elapsed - windows[currentIndex].before) / current.estDays) * 100))
      : 0;


  function toggleDone(p: Phase) {
    const nowDone = !p.isDone;
    const next = phases.map((x) =>
      x.id === p.id ? { ...x, isDone: nowDone, completedAt: nowDone ? todayDate() : null } : x,
    );
    setPhases(next);
    onPhasesChange(next);
    setPhaseDone(p.id, nowDone);
  }
  function startDaysEdit(p: Phase) {
    setEditingDaysId(p.id);
    setDaysText(String(p.estDays));
  }
  function commitDaysEdit() {
    if (editingDaysId === null) return;
    const id = editingDaysId;
    setEditingDaysId(null);
    const days = Math.max(0, Math.floor(Number(daysText) || 0));
    const next = phases.map((x) => (x.id === id ? { ...x, estDays: days } : x));
    setPhases(next);
    onPhasesChange(next);
    setPhaseDays(id, days);
  }
  function startEdit(p: Phase) {
    setEditingId(p.id);
    setEditText(p.name);
  }
  function startGlanceEdit(e: MouseEvent) {
    e.stopPropagation();
    if (currentIndex < 0) return;
    setGlanceEditing(true);
    setGlanceText(phases[currentIndex].name);
  }
  function commitGlanceEdit() {
    const name = glanceText.trim();
    setGlanceEditing(false);
    if (!name || currentIndex < 0) return;
    const id = phases[currentIndex].id;
    setPhases((arr) => arr.map((x) => (x.id === id ? { ...x, name } : x)));
    renamePhase(id, name);
  }
  function commitEdit() {
    if (editingId === null) return;
    const name = editText.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;
    setPhases((arr) => arr.map((x) => (x.id === id ? { ...x, name } : x)));
    renamePhase(id, name);
  }
  function deletePhase(id: string) {
    const next = phases.filter((x) => x.id !== id);
    setPhases(next);
    onPhasesChange(next);
    removePhase(id);
  }

  return (
    <section className="bubble bubble-timeline glance-card" onClick={onToggle}>
      <header className="bubble-header">
        <span className="bubble-dot" style={{ background: "var(--accent-timeline)" }} />
        <h2 className="bubble-title">Timeline</h2>
        <span className="glance-cue" aria-hidden="true">
          {depth ? "▾" : "▸"}
        </span>
      </header>

      <div className="glance">
        <span className="glance-eyebrow">
          {total ? `Phase ${phaseN} of ${total}` : "No phases yet"}
        </span>

        <div className="glance-hero-row">
          {glanceEditing ? (
            <input
              className="glance-hero-input"
              autoFocus
              maxLength={TEXT_LIMITS.phaseName}
              value={glanceText}
              onChange={(e) => setGlanceText(e.target.value)}
              onBlur={commitGlanceEdit}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) commitGlanceEdit();
                if (e.key === "Escape") setGlanceEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="glance-hero" onClick={startGlanceEdit}>
              {currentName}
            </span>
          )}
        </div>

        <div className="glance-bar-wrap">
          <div
            className="glance-bar-fill"
            style={{ width: `${phaseProgress}%`, background: "var(--accent-timeline)" }}
          />
        </div>
      </div>

      {depth && (
        <div className="panel-scroll">
          <div className="col-head">
            <span>Phases</span>
            <span style={{ marginLeft: "auto" }}>
              {doneCount}/{total} done
            </span>
          </div>
          <ul className="list">
            {phases.map((p, i) => {
              const isCurrent = i === currentIndex;
              const cls =
                "row" +
                (p.isDone ? " done" : isCurrent ? " current" : "") +
                (dnd.grabbedId === p.id ? " dragging" : "") +
                (dnd.dropAt?.index === i ? (dnd.dropAt.after ? " drop-after" : " drop-before") : "");
              return (
                <li
                  key={p.id}
                  className={cls}
                  style={{ opacity: dnd.grabbedId === p.id ? 0.5 : 1 }}
                  {...dnd.rowProps(i, p.id)}
                >
                  <svg className="row-handle" viewBox="0 0 8 14" aria-hidden="true" {...dnd.gripProps(p.id)}>
                    <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                    <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
                    <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
                  </svg>

                  <button
                    className="ph-state"
                    type="button"
                    aria-pressed={p.isDone}
                    aria-label={p.isDone ? "Mark phase not done" : "Mark phase done"}
                    onClick={() => toggleDone(p)}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 6 L5 8.5 L9.5 3.5" />
                    </svg>
                  </button>

                  <div className="ph-main">
                    <div className="ph-title">
                      {editingId === p.id ? (
                        <input
                          className="row-name-input"
                          autoFocus
                          maxLength={TEXT_LIMITS.phaseName}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (isSubmitEnter(e)) commitEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <span className="row-name" onClick={() => startEdit(p)} title="Click to rename">
                          {p.name}
                        </span>
                      )}
                      {isCurrent && <span className="now-tag">now</span>}
                    </div>

                  </div>

                  <button className="row-del" type="button" aria-label="Delete phase" onClick={() => deletePhase(p.id)}>
                    ×
                  </button>

                  {editingDaysId === p.id ? (
                    <input
                      className="ph-days-input"
                      type="number"
                      min={0}
                      autoFocus
                      value={daysText}
                      onChange={(e) => setDaysText(e.target.value)}
                      onBlur={commitDaysEdit}
                      onKeyDown={(e) => {
                        if (isSubmitEnter(e)) { e.preventDefault(); commitDaysEdit(); }
                        if (e.key === "Escape") setEditingDaysId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Days for ${p.name}`}
                    />
                  ) : (
                    <span
                      className="ph-days"
                      title="Click to edit days"
                      onClick={() => startDaysEdit(p)}
                    >
                      {p.estDays}d
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {add.adding ? (
            <input
              className={"row-add" + (add.slow ? " saving-slow" : "")}
              autoFocus
              placeholder="Name a phase, press Enter…"
              maxLength={TEXT_LIMITS.phaseName}
              value={add.text}
              {...add.fieldProps}
              onChange={(e) => add.change(e.target.value)}
              onBlur={add.commit}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) add.commit();
                if (e.key === "Escape") add.cancel();
              }}
              style={{ outline: "none" }}
            />
          ) : (
            <button type="button" className="row-add" onClick={add.open}>
              + Add a phase
            </button>
          )}
        </div>
      )}
    </section>
  );
}
