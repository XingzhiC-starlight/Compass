import type { ID, Project } from "./types";

export interface DashboardReloadState {
  quietRefreshRequest: number;
}

export type DashboardReloadEvent = { type: "save-failed" };

export function chooseActiveProject(projects: Project[], currentActiveId: ID | null): ID | null {
  if (currentActiveId && projects.some((p) => p.id === currentActiveId)) return currentActiveId;
  return projects[0]?.id ?? null;
}

export function dashboardReloadReducer(
  state: DashboardReloadState,
  event: DashboardReloadEvent,
): DashboardReloadState {
  switch (event.type) {
    case "save-failed":
      return { ...state, quietRefreshRequest: state.quietRefreshRequest + 1 };
  }
}
