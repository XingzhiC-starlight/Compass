import { useRef, useState, type MouseEvent } from "react";
import { useAddBox } from "./useAddBox";
import { TEXT_LIMITS } from "../lib/limits";
import { useServerState } from "./useServerState";
import {
  setLearningProgress,
  setFocusItem,
  renameLearningItem,
  removeLearningItem,
  addLearningItem,
  reorderLearningItems,
} from "../lib/db";
import type { LearningItem } from "../lib/types";
import { useDragReorder, reorder } from "./useDragReorder";
import CSlider from "./CSlider";
import { isSubmitEnter } from "./keys";
import { learningGlance } from "./projectTime";
import {
  firstOpenItem,
  focusAfterReorder,
  markLearningFocus,
  removeLearningItemAndAdvanceFocus,
  shouldFocusNewLearningItem,
} from "./learningFocus";

export default function LearningCard({
  items: initial,
  depth,
  onToggle,
  syncVersion = 0,
}: {
  items: LearningItem[];
  depth: boolean;
  onToggle: (e: MouseEvent) => void;
  syncVersion?: number;
}) {
  const [items, setItems] = useServerState<LearningItem[]>(initial, syncVersion);
  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const add = useAddBox(addLearningItem, (created: LearningItem) => {
    const shouldFocusCreated = shouldFocusNewLearningItem(latestItemsRef.current, created);
    const nextItem = shouldFocusCreated ? { ...created, isFocus: true } : created;
    setItems((arr) =>
      shouldFocusCreated
        ? markLearningFocus([...arr, nextItem], created.id)
        : [...arr, nextItem],
    );
    if (shouldFocusCreated) setFocusItem(created.id);
  });
  const [progressEditingId, setProgressEditingId] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const skipProgressCommitRef = useRef(false);
  const previousProgressRef = useRef<Record<string, number>>({});
  const [glanceEditing, setGlanceEditing] = useState(false);
  const [glanceText, setGlanceText] = useState("");

  const dnd = useDragReorder((from, to) => {
    const reordered = reorder(items, from, to);
    const shownBefore = items.find((it) => it.isFocus) ?? items[0];
    const nextFocusId = focusAfterReorder(reordered, shownBefore?.id ?? null);
    const next = nextFocusId ? markLearningFocus(reordered, nextFocusId) : reordered;

    setItems(next);
    reorderLearningItems(next.map((it) => it.id));
    if (nextFocusId) setFocusItem(nextFocusId);
  });

  const { focus, focusPct, eyebrow: focusEyebrow } = learningGlance(items);

  function nextOpenItemAfter(list: LearningItem[], id: string) {
    const index = list.findIndex((it) => it.id === id);
    if (index < 0) return null;
    const ordered = [...list.slice(index + 1), ...list.slice(0, index)];
    return ordered.find((it) => it.progressPct < 100) ?? null;
  }
  function slide(it: LearningItem, pct: number) {
    const becameDone = pct >= 100 && it.progressPct < 100;
    const becameOpen = pct < 100 && it.progressPct >= 100;
    if (becameDone) previousProgressRef.current[it.id] = it.progressPct;
    if (pct < 100) previousProgressRef.current[it.id] = pct;

    const withProgress = items.map((x) => (x.id === it.id ? { ...x, progressPct: pct } : x));
    const nextFocus = becameDone && it.isFocus
      ? nextOpenItemAfter(withProgress, it.id)
      : becameOpen
        ? firstOpenItem(withProgress)
        : null;
    const next = nextFocus
      ? withProgress.map((x) => ({ ...x, isFocus: x.id === nextFocus.id }))
      : withProgress;

    setItems(next);
    setLearningProgress(it.id, pct);
    if (nextFocus) setFocusItem(nextFocus.id);
  }
  function toggleComplete(it: LearningItem) {
    if (it.progressPct >= 100) {
      const previous = previousProgressRef.current[it.id];
      slide(it, previous !== undefined && previous < 100 ? previous : 0);
      return;
    }

    previousProgressRef.current[it.id] = it.progressPct;
    slide(it, 100);
  }
  function startEdit(it: LearningItem) {
    setEditingId(it.id);
    setEditText(it.name);
  }
  function startProgressEdit(it: LearningItem) {
    skipProgressCommitRef.current = false;
    setProgressEditingId(it.id);
    setProgressText(String(it.progressPct));
  }
  function commitProgressEdit(it: LearningItem) {
    if (skipProgressCommitRef.current) {
      skipProgressCommitRef.current = false;
      return;
    }

    const raw = progressText.trim();
    setProgressEditingId(null);
    if (!raw) return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;

    const pct = Math.max(0, Math.min(100, Math.round(parsed)));
    if (pct !== it.progressPct) slide(it, pct);
  }
  function cancelProgressEdit() {
    skipProgressCommitRef.current = true;
    setProgressEditingId(null);
    setProgressText("");
  }
  function startGlanceEdit(e: MouseEvent) {
    e.stopPropagation();
    if (!focus) return;
    setGlanceEditing(true);
    setGlanceText(focus.name);
  }
  function commitGlanceEdit() {
    const name = glanceText.trim();
    setGlanceEditing(false);
    if (!name || !focus) return;
    const id = focus.id;
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, name } : x)));
    renameLearningItem(id, name);
  }
  function commitEdit() {
    if (editingId === null) return;
    const name = editText.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, name } : x)));
    renameLearningItem(id, name);
  }
  function deleteItem(id: string) {
    const result = removeLearningItemAndAdvanceFocus(latestItemsRef.current, id);
    latestItemsRef.current = result.items;
    setItems(result.items);
    removeLearningItem(id, result.nextFocusId);
  }

  return (
    <section className="bubble bubble-learning glance-card" onClick={onToggle}>
      <header className="bubble-header">
        <span className="bubble-dot" style={{ background: "var(--accent-learning)" }} />
        <h2 className="bubble-title">Learning</h2>
        <span className="glance-cue" aria-hidden="true">
          {depth ? "▾" : "▸"}
        </span>
      </header>

      <div className="glance">
        <span className="glance-eyebrow">
          {focusEyebrow}
        </span>

        <div className="glance-hero-row">
          {glanceEditing ? (
            <input
              className="glance-hero-input"
              autoFocus
              maxLength={TEXT_LIMITS.learningItemName}
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
              {focus ? focus.name : "Add something to learn"}
            </span>
          )}
        </div>

        {focus ? (
          <CSlider
            value={focusPct}
            onChange={(next) => slide(focus, next)}
            accent="var(--accent-learning)"
            ariaLabel={`Progress for ${focus.name}`}
          />
        ) : (
          <div className="glance-bar-wrap">
            <div className="glance-bar-fill" style={{ width: "0%", background: "var(--accent-learning)" }} />
          </div>
        )}
      </div>

      {depth && (
        <div className="panel-scroll">
          <div className="col-head">
            <span>Skill</span>
            <span style={{ marginLeft: "auto" }}>Progress</span>
          </div>
          <ul className="list">
            {items.map((it, i) => {
              const isDone = it.progressPct >= 100;
              const cls =
                "row" +
                (isDone ? " done" : "") +
                (dnd.grabbedId === it.id ? " dragging" : "") +
                (dnd.dropAt?.index === i ? (dnd.dropAt.after ? " drop-after" : " drop-before") : "");
              return (
                <li
                  key={it.id}
                  className={cls}
                  style={{ opacity: dnd.grabbedId === it.id ? 0.5 : 1 }}
                  {...dnd.rowProps(i, it.id)}
                >
                  <svg className="row-handle" viewBox="0 0 8 14" aria-hidden="true" {...dnd.gripProps(it.id)}>
                    <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                    <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
                    <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
                  </svg>

                  <button
                    className="focus-target"
                    type="button"
                    aria-pressed={isDone}
                    aria-label={isDone ? "Mark learning item not done" : "Mark learning item done"}
                    onClick={() => toggleComplete(it)}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 6 L5 8.5 L9.5 3.5" />
                    </svg>
                  </button>

                  {editingId === it.id ? (
                    <input
                      className="row-name-input"
                      autoFocus
                      maxLength={TEXT_LIMITS.learningItemName}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (isSubmitEnter(e)) commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <span
                      className="row-name"
                      onClick={() => startEdit(it)}
                      title="Click to rename"
                    >
                      {it.name}
                    </span>
                  )}

                  {it.isFocus && <span className="focus-tag">focus</span>}

                  <button className="row-del" type="button" aria-label="Delete item" onClick={() => deleteItem(it.id)}>
                    ×
                  </button>

                  {progressEditingId === it.id ? (
                    <input
                      className="lr-pct-input"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      autoFocus
                      value={progressText}
                      onChange={(e) => setProgressText(e.target.value)}
                      onBlur={() => commitProgressEdit(it)}
                      onKeyDown={(e) => {
                        if (isSubmitEnter(e)) commitProgressEdit(it);
                        if (e.key === "Escape") cancelProgressEdit();
                      }}
                    />
                  ) : (
                    <span
                      className="lr-pct editable"
                      onClick={() => startProgressEdit(it)}
                      title="Click to edit progress"
                    >
                      {it.progressPct}%
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
              placeholder="Name a skill, press Enter…"
              maxLength={TEXT_LIMITS.learningItemName}
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
              + Add something to learn
            </button>
          )}
        </div>
      )}
    </section>
  );
}
