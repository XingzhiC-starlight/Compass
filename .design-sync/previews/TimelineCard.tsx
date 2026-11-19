/* Preview stories for TimelineCard — the Projected Timeline bubble.
   The glance bar fills by calendar progress through the current phase
   (elapsed days ÷ estDays), so the project start date is computed relative
   to today: phases 1–2 (4d + 3d) are done, we're 3 days into the 6-day
   current phase → the bar sits at ~50%. */
import { TimelineCard } from "compass";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const project = {
  id: "p-compass",
  userId: "u-demo",
  name: "Compass beta",
  accentColor: "#7c6fa0",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 30,
  hoursPlannedPerDay: 4,
  hoursAvailablePerDay: 5,
  startedAt: daysAgo(10), // Day 11 → 10 elapsed days across the phase windows
  createdAt: daysAgo(10) + "T09:00:00Z",
};

const base = { projectId: project.id, userId: "u-demo", createdAt: project.createdAt };

const phases = [
  { ...base, id: "ph-1", name: "Interview flow", estDays: 4, sortOrder: 0, isDone: true, completedAt: daysAgo(7) },
  { ...base, id: "ph-2", name: "Dashboard polish", estDays: 3, sortOrder: 1, isDone: true, completedAt: daysAgo(4) },
  { ...base, id: "ph-3", name: "Supabase migration", estDays: 6, sortOrder: 2, isDone: false, completedAt: null },
  { ...base, id: "ph-4", name: "Beta invites", estDays: 5, sortOrder: 3, isDone: false, completedAt: null },
];

const donePhases = phases.map((p, i) => ({
  ...p,
  isDone: true,
  completedAt: p.completedAt ?? daysAgo(2 - Math.min(2, i)),
}));

/** Summary state — "Phase 3 of 4", current phase name, half-filled progress bar. */
export const Glance = () => (
  <div className="dashboard" style={{ width: 400 }}>
    <TimelineCard phases={phases} project={project} depth={false} onToggle={() => {}} onPhasesChange={() => {}} />
  </div>
);

/** Depth state — the phase checklist: done ticks, the "now" tag, day counts, add row. */
export const Checklist = () => (
  <div className="dashboard depth" style={{ width: 420 }}>
    <TimelineCard phases={phases} project={project} depth={true} onToggle={() => {}} onPhasesChange={() => {}} />
  </div>
);

/** Finished project — every phase ticked: "All phases done", bar at 100%. */
export const AllDone = () => (
  <div className="dashboard" style={{ width: 400 }}>
    <TimelineCard phases={donePhases} project={project} depth={false} onToggle={() => {}} onPhasesChange={() => {}} />
  </div>
);
