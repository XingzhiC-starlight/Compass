import { type CSSProperties, useRef, useState } from "react";
import { saveInterview } from "../lib/db";
import { TEXT_LIMITS } from "../lib/limits";
import { randomId } from "../lib/transforms";
import { reorder } from "../dashboard/useDragReorder";
import "../styles/interview.css";

const LEVELS = [
  { v: "", label: "Starting level…" },
  { v: "10", label: "Beginner · ~10%" },
  { v: "30", label: "Some basics · ~30%" },
  { v: "50", label: "Comfortable · ~50%" },
  { v: "65", label: "Confident · ~65%" },
  { v: "80", label: "Almost fluent · ~80%" },
];

type PhaseRow = { id: string; name: string; days: string };
type LearnRow = { id: string; name: string; level: string };
type List = "phase" | "learn";
type ProgressStatus = "completed" | "active" | "upcoming";
type ProgressStep = {
  key: string;
  label: string;
  status: ProgressStatus;
  accent: string;
  previousAccent?: string;
  previousCompleted?: boolean;
};

let _seq = 0;
const uid = () => "row-" + _seq++;
const toNum = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

export default function Interview({
  onComplete,
  onCancel,
  archivedCount = 0,
  onViewArchive,
}: {
  onComplete: () => void;
  onCancel?: () => void;
  archivedCount?: number;
  onViewArchive?: () => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [days, setDays] = useState("");
  const [hrsPlanned, setHrsPlanned] = useState("");
  const [hrsActual, setHrsActual] = useState("");
  const [phases, setPhases] = useState<PhaseRow[]>(() => [
    { id: uid(), name: "", days: "" },
    { id: uid(), name: "", days: "" },
  ]);
  const [learn, setLearn] = useState<LearnRow[]>(() => [
    { id: uid(), name: "", level: "" },
    { id: uid(), name: "", level: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [setupId] = useState(randomId);

  const dragFrom = useRef<{ list: List; index: number } | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ list: List; index: number; after: boolean } | null>(null);

  function startDrag(list: List, index: number) {
    return (e: React.DragEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(tag)) {
        e.preventDefault();
        return;
      }
      dragFrom.current = { list, index };
      setDraggingKey(`${list}:${index}`);
      e.dataTransfer.effectAllowed = "move";
    };
  }
  function overRow(list: List, index: number) {
    return (e: React.DragEvent) => {
      const from = dragFrom.current;
      if (!from || from.list !== list) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      setDropAt({ list, index, after });
    };
  }
  function dropRow(list: List, index: number) {
    return (e: React.DragEvent) => {
      const from = dragFrom.current;
      if (!from || from.list !== list) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      const to = index + (after ? 1 : 0);
      if (list === "phase") setPhases((p) => reorder(p, from.index, to));
      else setLearn((l) => reorder(l, from.index, to));
      endDrag();
    };
  }
  function endDrag() {
    dragFrom.current = null;
    setDraggingKey(null);
    setDropAt(null);
  }
  function rowClass(list: List, index: number) {
    const cls = ["row"];
    if (draggingKey === `${list}:${index}`) cls.push("dragging");
    if (dropAt && dropAt.list === list && dropAt.index === index)
      cls.push(dropAt.after ? "drop-after" : "drop-before");
    return cls.join(" ");
  }

  const updatePhase = (i: number, patch: Partial<PhaseRow>) =>
    setPhases((arr) => arr.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const updateLearn = (i: number, patch: Partial<LearnRow>) =>
    setLearn((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const namedPhases = phases.filter((p) => p.name.trim());
  const namedLearn = learn.filter((l) => l.name.trim());
  const planned = toNum(hrsPlanned);
  const actual = toNum(hrsActual);
  const dayCount = toNum(days);
  const projectComplete = !!projectName.trim();
  const timeComplete = dayCount > 0 && planned > 0 && actual > 0;
  const timelineComplete = phases.every((p) => p.name.trim() && toNum(p.days) > 0);
  const learningComplete = learn.every((l) => l.name.trim() && l.level);
  const setupComplete = projectComplete && timeComplete && timelineComplete && learningComplete;

  const missing =
    !projectName.trim()
      ? "name your project"
      : !(dayCount > 0 && planned > 0)
        ? "add your project length and daily hours"
        : !(actual > 0)
          ? "note how many hours you actually have"
          : !timelineComplete
            ? "complete every timeline phase"
            : !learningComplete
              ? "complete every learning item"
              : null;

  const progressChecks = [
    { key: "project", label: "Project", complete: projectComplete, accent: "var(--primary-600)" },
    { key: "time", label: "Time", complete: timeComplete, accent: "var(--accent-time)" },
    { key: "timeline", label: "Timeline", complete: timelineComplete, accent: "var(--accent-timeline)" },
    { key: "learning", label: "Learning", complete: learningComplete, accent: "var(--accent-learning)" },
    { key: "dashboard", label: "Dashboard", complete: false, accent: "var(--primary-700)" },
  ];
  const activeProgressIndex = setupComplete
    ? progressChecks.length - 1
    : progressChecks.findIndex((step) => !step.complete);
  const progressSteps: ProgressStep[] = progressChecks.map((step, index) => ({
    key: step.key,
    label: step.label,
    accent: step.accent,
    previousAccent: progressChecks[index - 1]?.accent,
    previousCompleted: progressChecks[index - 1]?.complete,
    status:
      step.complete
        ? "completed"
        : index === activeProgressIndex
          ? "active"
          : "upcoming",
  }));

  async function handleOpen() {
    if (missing || saving) return;
    setSaving(true);
    try {
      await saveInterview({
        setupId,
        projectName: projectName.trim(),
        totalDays: dayCount,
        hoursPlannedPerDay: planned,
        hoursAvailablePerDay: actual,
        phases: namedPhases.map((p) => ({ name: p.name.trim(), estDays: toNum(p.days) })),
        learn: namedLearn.map((l) => ({ name: l.name.trim(), level: toNum(l.level) })),
      });
    } catch {
      setSaving(false);
      return;
    }
    onComplete();
  }

  return (
    <main className="setup">
      {onCancel && (
        <button type="button" className="setup-cancel" onClick={onCancel}>
          ← Back
        </button>
      )}
      {archivedCount > 0 && onViewArchive && (
        <button type="button" className="setup-archive-link" onClick={onViewArchive}>
          View archive ({archivedCount})
        </button>
      )}
      <header className="setup-head">
        <div className="brand">Compass</div>
      </header>

      <div className="setup-grid">
        <div className="interview-sections">
          <section className="project-step" aria-labelledby="projectStepLabel">
            <label className="lab" id="projectStepLabel" htmlFor="projectName">Project</label>
            <input id="projectName" className="project-title-input" type="text" placeholder="Name this project"
              maxLength={TEXT_LIMITS.projectName}
              value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </section>

          <section className="card time-card" data-section="time">
            <SectionHeader label="Time" prompt="Estimate your schedule." />
            <div className="time-flow">
              <div className="time-question">
                <label className="time-prompt" htmlFor="plannedHours">
                  How many hours would you like to spend on it each day?
                </label>
                <span className="with-unit time-input">
                  <input id="plannedHours" type="number" min={0.5} step={0.5} placeholder="4" value={hrsPlanned}
                    onChange={(e) => setHrsPlanned(e.target.value)} />
                  <span className="unit">hours/day</span>
                </span>
              </div>
              <div className="time-question">
                <label className="time-prompt" htmlFor="actualHours">
                  How much time do you actually have available each day?
                </label>
                <span className="with-unit time-input">
                  <input id="actualHours" type="number" min={0.5} step={0.5} placeholder="6" value={hrsActual}
                    onChange={(e) => setHrsActual(e.target.value)} />
                  <span className="unit">hours/day</span>
                </span>
              </div>
              <div className="time-question">
                <label className="time-prompt" htmlFor="projectDays">
                  How long do you think this project will take? (work more in designing timeline)
                </label>
                <span className="with-unit time-input">
                  <input id="projectDays" type="number" min={1} placeholder="90" value={days}
                    onChange={(e) => setDays(e.target.value)} />
                  <span className="unit">days</span>
                </span>
              </div>
            </div>
          </section>

          <section className="card timeline-card" data-section="timeline">
            <SectionHeader
              label="Timeline"
              prompt="Sketch the path from here to done."
            />
            <div className="rows">
              {phases.map((p, i) => (
                <div key={p.id} className={`${rowClass("phase", i)} phase-row`} draggable
                  onDragStart={startDrag("phase", i)} onDragOver={overRow("phase", i)}
                  onDrop={dropRow("phase", i)} onDragEnd={endDrag}>
                  <Grip />
                  <input className="grow" type="text" placeholder="e.g. create the design mockup"
                    maxLength={TEXT_LIMITS.phaseName}
                    value={p.name} onChange={(e) => updatePhase(i, { name: e.target.value })} />
                  <span className="with-unit days-input">
                    <input type="number" min={1} placeholder="0"
                      value={p.days} onChange={(e) => updatePhase(i, { days: e.target.value })} />
                    <span className="unit">days</span>
                  </span>
                  <button type="button" className="icon-btn" aria-label="Remove phase"
                    disabled={phases.length <= 1}
                    onClick={() => setPhases((arr) => arr.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
            <div className="rows-foot">
              <button type="button" className="add"
                onClick={() => setPhases((arr) => [...arr, { id: uid(), name: "", days: "" }])}>
                + Add a phase
              </button>
            </div>
          </section>

          <section className="card learning-card" data-section="learning">
            <SectionHeader
              label="Learning"
              prompt="List the things you need to learn to best move forward."
            />
            <div className="rows">
              {learn.map((l, i) => (
                <div key={l.id} className={`${rowClass("learn", i)} learn-row`} draggable
                  onDragStart={startDrag("learn", i)} onDragOver={overRow("learn", i)}
                  onDrop={dropRow("learn", i)} onDragEnd={endDrag}>
                  <Grip />
                  <input className="grow" type="text" placeholder="e.g. learning UI design principles"
                    maxLength={TEXT_LIMITS.learningItemName}
                    value={l.name} onChange={(e) => updateLearn(i, { name: e.target.value })} />
                  <select className="level-select" aria-label="Starting level of understanding"
                    value={l.level} onChange={(e) => updateLearn(i, { level: e.target.value })}>
                    {LEVELS.map((L) => (
                      <option key={L.label} value={L.v}>{L.label}</option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" aria-label="Remove item"
                    disabled={learn.length <= 1}
                    onClick={() => setLearn((arr) => arr.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
            <div className="rows-foot">
              <button type="button" className="add"
                onClick={() => setLearn((arr) => [...arr, { id: uid(), name: "", level: "" }])}>
                + Add something to learn
              </button>
            </div>
          </section>
        </div>
        <ProgressRail
          steps={progressSteps}
          missing={missing}
          saving={saving}
          onOpen={handleOpen}
        />
      </div>
    </main>
  );
}

function ProgressRail({
  steps,
  missing,
  saving,
  onOpen,
}: {
  steps: ProgressStep[];
  missing: string | null;
  saving: boolean;
  onOpen: () => void;
}) {
  return (
    <aside className="progress-rail" aria-label="Setup progress">
      <ol className="progress-list">
        {steps.map((step) => (
          <li
            key={step.key}
            className={`progress-step is-${step.status}${step.previousCompleted ? " has-prev-complete" : ""}`}
            style={{
              "--step-accent": step.accent,
              "--prev-accent": step.previousAccent ?? step.accent,
            } as CSSProperties}
            aria-current={step.status === "active" ? "step" : undefined}
            aria-label={`${step.label}: ${step.status}`}
          >
            <span className="progress-node" aria-hidden="true">
              {step.status === "completed" && (
                <svg viewBox="0 0 12 10" focusable="false">
                  <path d="M1.2 5.1 4.5 8.2 10.8 1.2" />
                </svg>
              )}
            </span>
            <span className="progress-label">{step.label}</span>
          </li>
        ))}
      </ol>
      <div className="setup-actions">
        <button type="button" className="cta" disabled={!!missing || saving} onClick={onOpen}>
          {saving ? "Opening…" : "Open my dashboard →"}
        </button>
        {missing && <p className="hint">Just a little more — {missing}.</p>}
      </div>
    </aside>
  );
}

function Grip() {
  return (
    <span className="grip" aria-hidden="true">
      <svg viewBox="0 0 10 16">
        <circle cx="3" cy="3" r="1.3" /><circle cx="7" cy="3" r="1.3" />
        <circle cx="3" cy="8" r="1.3" /><circle cx="7" cy="8" r="1.3" />
        <circle cx="3" cy="13" r="1.3" /><circle cx="7" cy="13" r="1.3" />
      </svg>
    </span>
  );
}

function SectionHeader({ label, prompt }: { label: string; prompt: string }) {
  return (
    <header className="card-head">
      <span className="dot" />
      <div className="head-copy">
        <h2>{label}</h2>
        <p>{prompt}</p>
      </div>
    </header>
  );
}
