/* Preview stories for TimeCard — the Time Commitment bubble.
   Day math (Day n / N, week buckets) derives from the REAL clock via
   project.startedAt, so all dates here are computed relative to today —
   the stories stay correct no matter when they're captured. */
import { TimeCard } from "compass";

// Local-calendar "yyyy-mm-dd", n days before today (n=0 → today).
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The card expects a 49-day history, oldest first, today last. A steady-ish
// builder rhythm: most days near the 4h goal, a few off days.
const HOURS_PATTERN = [3.2, 4.1, 2.5, 0, 3.8, 4.5, 1.6];
const daily = Array.from({ length: 49 }, (_, i) => ({
  date: daysAgo(48 - i),
  loggedSeconds: Math.round(HOURS_PATTERN[i % 7] * 3600),
}));

// Project started 10 days ago → "Day 11" project-wide; the current phase
// began 5 days ago → the glance eyebrow reads "Day 6 / 14".
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
  startedAt: daysAgo(10),
  createdAt: daysAgo(10) + "T09:00:00Z",
};

const shared = {
  project,
  currentPhaseStart: daysAgo(5),
  remainingDays: 14,
  allPhasesDone: false,
  initialDaily: daily,
  onToggle: () => {},
};

/** Summary state — clock stopped: play button, 2.4/4h hero, sparkline, goal bar. */
export const Glance = () => (
  <div className="dashboard" style={{ width: 400 }}>
    <TimeCard
      {...shared}
      initialLoggedSeconds={Math.round(2.4 * 3600)}
      initiallyRunning={false}
      depth={false}
    />
  </div>
);

/** A session in progress — stop button showing, today's clock live. */
export const Running = () => (
  <div className="dashboard" style={{ width: 400 }}>
    <TimeCard
      {...shared}
      initialLoggedSeconds={Math.round(3.1 * 3600)}
      initiallyRunning={true}
      depth={false}
    />
  </div>
);

/** Depth state — the 7-day history list (past days click-to-edit) + total/avg footer. */
export const History = () => (
  <div className="dashboard depth" style={{ width: 420 }}>
    <TimeCard
      {...shared}
      initialLoggedSeconds={Math.round(2.4 * 3600)}
      initiallyRunning={false}
      depth={true}
    />
  </div>
);
