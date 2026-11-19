/* Preview stories for TaskPanel — the lower-row Daily Task bubble
   (task list + thought log behind a header icon toggle). The bubble has
   no height of its own (the dashboard grid sizes it), so cells host it
   in a fixed-size `.dashboard` grid wrapper that stretches it to fill.
   The Thoughts tab needs a click to show, so it isn't captured here —
   ThoughtLog has its own preview card. */
import { TaskPanel } from "compass";

const base = {
  projectId: "p-demo",
  userId: "u-demo",
  phaseId: null,
  learningItemId: null,
};

const tasks = [
  {
    ...base,
    id: "t-1",
    text: "Push learning-focus commit to main",
    isDone: true,
    sortOrder: 0,
    taskDate: "2026-08-09",
    createdAt: "2026-08-09T08:20:00Z",
  },
  {
    ...base,
    id: "t-2",
    text: "Draft beta invite email — three sentences, one link",
    isDone: false,
    sortOrder: 1,
    taskDate: "2026-08-09",
    createdAt: "2026-08-09T08:22:00Z",
  },
  {
    ...base,
    id: "t-3",
    text: "Check Supabase auth logs after the deploy",
    isDone: false,
    sortOrder: 2,
    taskDate: "2026-08-10",
    createdAt: "2026-08-10T07:05:00Z",
  },
  {
    ...base,
    id: "t-4",
    text: "Turn on MFA for the Vercel and GitHub accounts",
    isDone: false,
    sortOrder: 3,
    taskDate: "2026-08-10",
    createdAt: "2026-08-10T07:06:00Z",
  },
  {
    ...base,
    id: "t-5",
    text: "Smoke-test the password reset flow on production",
    isDone: true,
    sortOrder: 4,
    taskDate: "2026-08-08",
    createdAt: "2026-08-08T18:40:00Z",
  },
];

/** The running to-do list — open tasks on top, finished ones sunk to the bottom. */
export const TaskList = () => (
  <div className="dashboard" style={{ width: 700, height: 420, display: "grid" }}>
    <TaskPanel initialTasks={tasks} initialThoughts={[]} initialThoughtGroups={[]} />
  </div>
);

/** Fresh panel — no tasks yet, just the quiet "+ Add a task" row. */
export const Empty = () => (
  <div className="dashboard" style={{ width: 700, height: 260, display: "grid" }}>
    <TaskPanel initialTasks={[]} initialThoughts={[]} initialThoughtGroups={[]} />
  </div>
);
