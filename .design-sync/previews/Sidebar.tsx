/* Preview stories for Sidebar — the left project rail.
   App.tsx hosts it as the 220px column of the `.app` grid, stretched to the
   shell height; a fixed 220×500 grid wrapper mirrors that so the Settings
   button pins to the bottom. The Archive view and the open Settings popover
   are internal state (no prop opens them), so they're not authored here. */
import { Sidebar } from "compass";

const shared = {
  totalDays: 30,
  hoursPlannedPerDay: 4,
  hoursAvailablePerDay: 5,
  startedAt: "2026-07-31",
  createdAt: "2026-07-31T09:00:00Z",
  archivedAt: null,
  userId: "u-demo",
};

const projects = [
  { ...shared, id: "p-1", name: "Compass beta", accentColor: "#7c6fa0", sortOrder: 0 },
  { ...shared, id: "p-2", name: "Landing page rewrite", accentColor: "#4a8f7b", sortOrder: 1 },
  { ...shared, id: "p-3", name: "Portfolio site", accentColor: "#c47a5a", sortOrder: 2 },
];

const noop = () => {};
const callbacks = {
  onRenamed: noop,
  onReorderProjects: noop,
  onSelectProject: noop,
  onNewProject: noop,
  onDeleteProject: noop,
  onArchiveProject: noop,
  onUnarchiveProject: noop,
  onSignOut: noop,
};

/** Three projects: the active pill (filled, accent dot), a finished one with
    its archive icon, and the "+ New project" pill; Settings pinned at bottom. */
export const Projects = () => (
  <div style={{ width: 220, height: 500, display: "grid" }}>
    <Sidebar
      projects={projects}
      archived={[]}
      finishedIds={new Set(["p-3"])}
      activeProjectId="p-1"
      {...callbacks}
    />
  </div>
);

/** A fresh account — one lone project and the invitation to start another. */
export const OneProject = () => (
  <div style={{ width: 220, height: 420, display: "grid" }}>
    <Sidebar
      projects={[projects[0]]}
      archived={[]}
      finishedIds={new Set<string>()}
      activeProjectId="p-1"
      {...callbacks}
    />
  </div>
);
