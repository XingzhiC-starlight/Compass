import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  getProjectDashboardData,
  savesInFlight,
  whenSavesSettle,
  type DashboardShellData,
  type ProjectDashboardData,
} from "../lib/db";
import type { ID, Phase, Project } from "../lib/types";
import { projectCardTreeKey, shouldAcceptProjectPayload } from "./dashboardLoad";
import Sidebar from "./Sidebar";
import TimeCard from "./TimeCard";
import TimelineCard from "./TimelineCard";
import LearningCard from "./LearningCard";
import TaskPanel from "./TaskPanel";

type ViewMode = "summary" | "depth";

const INTERACTIVE = "button, input, select, textarea, a, .cslider, .row";

export default function Dashboard({
  activeProjectId,
  shell,
  quietRefreshRequest,
  onQuietRefreshSettled,
  onSignOut,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onArchiveProject,
  onUnarchiveProject,
  onProjectRenamed,
  onProjectsReordered,
  onProjectCompletionChange,
}: {
  activeProjectId: ID | null;
  shell: DashboardShellData;
  quietRefreshRequest: number;
  onQuietRefreshSettled: (ok: boolean) => void;
  onSignOut: () => void;
  onSelectProject: (id: ID) => void;
  onNewProject: () => void;
  onDeleteProject: (id: ID) => void;
  onArchiveProject: (id: ID) => void;
  onUnarchiveProject: (id: ID) => void;
  onProjectRenamed: (name: string) => void;
  onProjectsReordered: (projects: Project[]) => void;
  onProjectCompletionChange: (id: ID, done: boolean) => void;
}) {
  const [data, setData] = useState<ProjectDashboardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<ViewMode>("summary");
  const [projectDataVersion, setProjectDataVersion] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const latestRequestId = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  async function loadProject() {
    if (!activeProjectId) return;
    const requestId = ++latestRequestId.current;
    setLoadError(false);
    setData(null);
    try {
      const payload = await getProjectDashboardData(activeProjectId);
      if (!payload) {
        if (requestId === latestRequestId.current) setLoadError(true);
        return;
      }
      if (!shouldAcceptProjectPayload(payload.project.id, activeProjectId, requestId, latestRequestId.current)) return;
      setData(payload);
      setProjectDataVersion((v) => v + 1);
    } catch {
      if (requestId === latestRequestId.current) setLoadError(true);
    }
  }

  useEffect(() => {
    loadProject();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loads when the active project changes, and only then
  }, [activeProjectId]);

  async function refreshQuietly() {
    const projectId = activeProjectId;
    if (!projectId || !dataRef.current) return onQuietRefreshSettled(true);
    const requestId = ++latestRequestId.current;
    const apply = (payload: ProjectDashboardData | null) => {
      if (!payload) return;
      if (!shouldAcceptProjectPayload(payload.project.id, projectId, requestId, latestRequestId.current)) return;
      setData(payload);
      setSyncVersion((v) => v + 1);
    };
    try {
      const busy = savesInFlight() > 0;
      apply(await getProjectDashboardData(projectId));
      if (busy) {
        await whenSavesSettle();
        if (requestId !== latestRequestId.current) return;
        apply(await getProjectDashboardData(projectId));
      }
      if (requestId === latestRequestId.current) onQuietRefreshSettled(true);
    } catch {
      if (requestId === latestRequestId.current) onQuietRefreshSettled(false);
    }
  }

  const answeredRefresh = useRef(quietRefreshRequest);
  useEffect(() => {
    if (quietRefreshRequest === answeredRefresh.current) return;
    answeredRefresh.current = quietRefreshRequest;
    void refreshQuietly();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- answers a new refresh request, and nothing else
  }, [quietRefreshRequest]);

  const onRenamed = (name: string) => {
    setData((d) => (d ? { ...d, project: { ...d.project, name } } : d));
    onProjectRenamed(name);
  };

  const onPhasesChange = (phases: Phase[]) => {
    setData((d) => (d ? { ...d, phases } : d));
    if (data) {
      onProjectCompletionChange(data.project.id, phases.length > 0 && phases.every((p) => p.isDone));
    }
  };

  const toggleView = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    // Don't toggle when the click is really the END of a text-selection drag:
    // selecting text you typed in an add-input can start inside the input and
    // release on the bubble's negative space, whose `click` target is the bubble
    // (so the guard above misses it). A live, non-empty selection means "the user
    // was selecting text", not "tap to switch views".
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim() !== "") return;
    setView((v) => (v === "summary" ? "depth" : "summary"));
  };

  const depth = view === "depth";

  const completedDates = (data?.phases ?? [])
    .filter((p) => p.isDone && p.completedAt)
    .map((p) => p.completedAt as string);
  const currentPhaseStart = completedDates.length
    ? completedDates.reduce((a, b) => (b > a ? b : a))
    : data?.project.startedAt ?? "";
  const remainingDays = (data?.phases ?? []).filter((p) => !p.isDone).reduce((s, p) => s + p.estDays, 0);
  const allPhasesDone = !!data && data.phases.length > 0 && data.phases.every((p) => p.isDone);

  const finishedIds = new Set(
    Object.entries(shell.completion).filter(([, done]) => done).map(([id]) => id),
  );
  if (data) {
    if (allPhasesDone) finishedIds.add(data.project.id);
    else finishedIds.delete(data.project.id);
  }

  return (
    <div className="app">
      <Sidebar
        projects={shell.projects}
        archived={shell.archived}
        finishedIds={finishedIds}
        activeProjectId={activeProjectId}
        onRenamed={onRenamed}
        onReorderProjects={onProjectsReordered}
        onSelectProject={onSelectProject}
        onNewProject={onNewProject}
        onDeleteProject={onDeleteProject}
        onArchiveProject={onArchiveProject}
        onUnarchiveProject={onUnarchiveProject}
        onSignOut={onSignOut}
      />
      <main className={"dashboard" + (depth ? " depth" : "")}>
        {loadError ? (
          <ProjectLoadFailed onRetry={loadProject} />
        ) : !data ? (
          <ProjectLoading />
        ) : (
          <Fragment key={projectCardTreeKey(data.project.id, projectDataVersion)}>
        <div className="upper-row">
          <TimeCard
            project={data.project}
            currentPhaseStart={currentPhaseStart}
            remainingDays={remainingDays}
            allPhasesDone={allPhasesDone}
            initialLoggedSeconds={data.loggedSeconds}
            initiallyRunning={data.running}
            initialDaily={data.daily}
            depth={depth}
            onToggle={toggleView}
            syncVersion={syncVersion}
          />
          <TimelineCard
            phases={data.phases}
            project={data.project}
            depth={depth}
            onToggle={toggleView}
            onPhasesChange={onPhasesChange}
            syncVersion={syncVersion}
          />
          <LearningCard items={data.learning} depth={depth} onToggle={toggleView} syncVersion={syncVersion} />
        </div>
        <TaskPanel
          initialTasks={data.tasks}
          initialThoughts={data.thoughts}
          initialThoughtGroups={data.thoughtGroups}
          syncVersion={syncVersion}
        />
          </Fragment>
        )}
      </main>
    </div>
  );
}

function ProjectLoading() {
  return (
    <div className="project-load-state">
      Loading…
    </div>
  );
}

function ProjectLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="project-load-state">
      <div>
        <p style={{ marginBottom: 12, lineHeight: 1.55 }}>
          Couldn't load this project just now.
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            font: "inherit",
            color: "var(--text)",
            background: "transparent",
            border: "1px solid var(--text-muted)",
            borderRadius: "var(--r-pill)",
            padding: "6px 18px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
