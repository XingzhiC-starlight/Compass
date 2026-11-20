import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  addThought,
  getProjectDashboardData,
  onSavesSettled,
  onWriteError,
  startSession,
  stopSession,
  todayDate,
  updateTask,
  type ProjectDashboardData,
} from "../lib/db";
import type { ID, Task } from "../lib/types";
import { TEXT_LIMITS } from "../lib/limits";
import { isSubmitEnter } from "../dashboard/keys";
import { commitmentEyebrow, learningGlance, phasePacing, timelineGlance } from "../dashboard/projectTime";
import {
  clockSeconds,
  formatClock,
  goalPct,
  listedTaskIds,
  taskGlance,
  type CompanionClock,
} from "./companionSummary";
import { COMPANION_HEIGHT, COMPANION_SMALL_HEIGHT, COMPANION_WIDTH } from "./companionWindow";

/**
 * The companion (spec §23): the active project's clock, and on a press its three other cards
 * in short, drawn into a small window of its own that stays beside the person's other work.
 *
 * All of it runs in the main page. React draws it through a portal into the other window's
 * document, so it shares the page's seam and its design system, and nothing is passed between
 * two programs. It keeps its own reading of the project and takes a new one whenever the last
 * save in flight has answered, wherever the save came from; after a save of its own it asks
 * the dashboard to take one too.
 */

const INTERACTIVE = "button, input, textarea, a";

export default function Companion({
  win,
  projectId,
  projectName,
  accentColor,
  onOpenCompass,
  onDataWritten,
}: {
  /** The companion's window. */
  win: Window;
  /** The active project: the companion shows that one and no other. */
  projectId: ID;
  projectName: string;
  accentColor: string;
  onOpenCompass: () => void;
  /** A save made here has answered: the dashboard reads again. */
  onDataWritten: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ProjectDashboardData | null>(null);
  const [clock, setClock] = useState<CompanionClock>(() => ({
    baseSeconds: 0,
    baseAtMs: Date.now(),
    running: false,
    date: todayDate(),
  }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  // The tasks listed are chosen when a reading arrives, so one ticked here stays in its place,
  // struck through, and does not vanish under the pointer.
  const [taskIds, setTaskIds] = useState<ID[]>([]);
  const [thoughtText, setThoughtText] = useState("");
  const [thoughtSaved, setThoughtSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const readId = useRef(0);
  const clockDate = useRef(clock.date);
  clockDate.current = clock.date;

  async function read(keepListed: boolean) {
    const id = ++readId.current;
    try {
      const payload = await getProjectDashboardData(projectId);
      if (!payload || id !== readId.current) return;
      setSnapshot(payload);
      setTaskIds((listed) => listedTaskIds(payload.tasks, keepListed ? listed : []));
      setClock({ baseSeconds: payload.loggedSeconds, baseAtMs: Date.now(), running: payload.running, date: todayDate() });
      setNowMs(Date.now());
    } catch {
      /* the last reading stays; the next save or press reads again */
    }
  }
  const readRef = useRef(read);
  readRef.current = read;

  // A new project is a new companion: nothing typed for one project is filed under another,
  // and its clock does not show the other's time while its own reading is on the way.
  useEffect(() => {
    setSnapshot(null);
    setClock({ baseSeconds: 0, baseAtMs: Date.now(), running: false, date: todayDate() });
    setTaskIds([]);
    setThoughtText("");
    setThoughtSaved(false);
    void readRef.current(false);
  }, [projectId]);

  useEffect(() => onSavesSettled(() => void readRef.current(true)), []);

  useEffect(() => {
    let note: number | undefined;
    const stop = onWriteError(() => {
      setSaveFailed(true);
      win.clearTimeout(note);
      note = win.setTimeout(() => setSaveFailed(false), 4000);
    });
    return () => {
      stop();
      win.clearTimeout(note);
    };
  }, [win]);

  // The companion's own window keeps the time: a hidden main window's timers run late.
  useEffect(() => {
    if (!clock.running) return;
    const id = win.setInterval(() => setNowMs(Date.now()), 1000);
    return () => win.clearInterval(id);
  }, [clock.running, win]);

  // Past midnight the day's count starts again and the day number moves on.
  useEffect(() => {
    const id = win.setInterval(() => {
      if (todayDate() !== clockDate.current) void readRef.current(false);
    }, 60_000);
    return () => win.clearInterval(id);
  }, [win]);

  useEffect(() => {
    if (!thoughtSaved) return;
    const id = win.setTimeout(() => setThoughtSaved(false), 2400);
    return () => win.clearTimeout(id);
  }, [thoughtSaved, win]);

  async function toggleClock() {
    const next = !clock.running;
    setClock((c) => ({ baseSeconds: clockSeconds(c, Date.now()), baseAtMs: Date.now(), running: next, date: c.date }));
    try {
      if (next) await startSession();
      else await stopSession();
    } catch {
      /* the seam has reported it */
    }
    // Whether it was kept or refused, the reading taken as the save settled shows what is stored.
    onDataWritten();
  }

  async function toggleTask(task: Task) {
    const isDone = !task.isDone;
    setSnapshot((s) => (s ? { ...s, tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, isDone } : t)) } : s));
    await updateTask(task.id, { isDone });
    onDataWritten();
  }

  async function saveThought() {
    const text = thoughtText.trim();
    if (!text) return;
    setThoughtText("");
    try {
      await addThought(text);
      setThoughtSaved(true);
      onDataWritten();
    } catch {
      // The words go back in the box, unless the person has typed new ones since.
      setThoughtText((typed) => (typed === "" ? text : typed));
    }
  }

  function toggleExpanded(e?: MouseEvent) {
    if (e && (e.target as HTMLElement).closest(INTERACTIVE)) return;
    const selection = win.getSelection?.();
    if (selection && !selection.isCollapsed && selection.toString().trim() !== "") return;
    const next = !expanded;
    setExpanded(next);
    if (next) void read(false);
    try {
      win.resizeTo(COMPANION_WIDTH, next ? COMPANION_HEIGHT : COMPANION_SMALL_HEIGHT);
    } catch {
      /* a window that will not be resized shows the same companion at the size it has */
    }
  }

  const seconds = clockSeconds(clock, nowMs);
  const plannedHours = snapshot?.project.hoursPlannedPerDay ?? 0;
  const eyebrow = snapshot
    ? commitmentEyebrow(phasePacing(snapshot.phases, snapshot.project.startedAt), plannedHours)
    : "Today";
  const timeline = snapshot ? timelineGlance(snapshot.phases, snapshot.project.startedAt) : null;
  const learning = snapshot ? learningGlance(snapshot.learning) : null;
  const tasks = snapshot ? taskGlance(snapshot.tasks) : null;
  const listed = snapshot ? snapshot.tasks.filter((t) => taskIds.includes(t.id)) : [];
  const moreOpen = tasks ? tasks.openTasks.filter((t) => !taskIds.includes(t.id)).length : 0;

  return createPortal(
    <div className={"companion" + (expanded ? " expanded" : "")}>
      <section className="bubble bubble-time glance-card" onClick={toggleExpanded}>
        <header className="bubble-header">
          <span className="bubble-dot" style={{ background: accentColor }} />
          <h1 className="bubble-title">{projectName}</h1>
          <button
            type="button"
            className="glance-cue companion-cue"
            aria-expanded={expanded}
            aria-label={expanded ? "Show the clock alone" : "Show the timeline, learning and tasks"}
            onClick={() => toggleExpanded()}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </header>

        <div className="glance">
          <span className="glance-eyebrow">{eyebrow}</span>
          <div className="glance-hero-row">
            <button
              className="glance-clock"
              type="button"
              onClick={toggleClock}
              aria-label={clock.running ? "Stop work session" : "Start work session"}
            >
              {clock.running ? (
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 2 L12 7 L3 12 Z" />
                </svg>
              )}
            </button>
            <span className="glance-hero" aria-label="Time today">{formatClock(seconds)}</span>
          </div>
          <div className="glance-bar-wrap">
            <div
              className="glance-bar-fill"
              style={{ width: `${goalPct(seconds, plannedHours)}%`, background: "var(--accent-time)" }}
            />
          </div>
        </div>
      </section>

      {expanded && (
        <div className="companion-summary">
          {!snapshot || !timeline || !learning || !tasks ? (
            <span className="companion-note">Loading…</span>
          ) : (
            <>
              <section className="bubble bubble-timeline">
                <span className="glance-eyebrow">{timeline.eyebrow}</span>
                <span className="companion-line">{timeline.currentName}</span>
                <div className="glance-bar-wrap">
                  <div
                    className="glance-bar-fill"
                    style={{ width: `${timeline.phaseProgress}%`, background: "var(--accent-timeline)" }}
                  />
                </div>
              </section>

              <section className="bubble bubble-learning">
                <span className="glance-eyebrow">{learning.eyebrow}</span>
                <span className="companion-line">{learning.focus ? learning.focus.name : "Add something to learn"}</span>
                <div className="glance-bar-wrap">
                  <div
                    className="glance-bar-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, learning.focusPct))}%`,
                      background: "var(--accent-learning)",
                    }}
                  />
                </div>
              </section>

              <section className="bubble bubble-task">
                <span className="glance-eyebrow">{tasks.eyebrow}</span>
                {listed.length === 0 ? (
                  <span className="companion-note">{tasks.total === 0 ? "Add tasks in Compass" : "All caught up"}</span>
                ) : (
                  <ul className="task-list">
                    {listed.map((t) => (
                      <li key={t.id} className={"task-item" + (t.isDone ? " checked" : "")}>
                        <button
                          type="button"
                          className="task-check"
                          aria-pressed={t.isDone}
                          aria-label={t.isDone ? "Mark task incomplete" : "Mark task complete"}
                          onClick={() => toggleTask(t)}
                        >
                          <svg viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M2.5 6 L5 8.5 L9.5 3.5" />
                          </svg>
                        </button>
                        <span className="task-text">{t.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {moreOpen > 0 && <span className="companion-note">{moreOpen} more open in Compass</span>}
              </section>
            </>
          )}
        </div>
      )}

      {expanded && (
        <input
          className="th-add-input companion-thought"
          value={thoughtText}
          maxLength={TEXT_LIMITS.thoughtText}
          placeholder={thoughtSaved ? "Saved to the thought log" : "Capture a thought…"}
          aria-label="Add a thought"
          onChange={(e) => setThoughtText(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) {
              e.preventDefault();
              void saveThought();
            }
          }}
        />
      )}

      {saveFailed && (
        <span className="companion-note" role="status">
          Couldn't save just now — try again in a moment.
        </span>
      )}

      <button type="button" className="sidebar-companion companion-open" onClick={onOpenCompass}>
        Open Compass
      </button>
    </div>,
    win.document.body,
  );
}
