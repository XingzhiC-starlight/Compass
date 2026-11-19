import type { ID } from "../lib/types";

export function shouldAcceptProjectPayload(
  payloadProjectId: ID,
  activeProjectId: ID | null,
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId && payloadProjectId === activeProjectId;
}

export function projectCardTreeKey(activeProjectId: ID, projectDataVersion: number): string {
  return `${activeProjectId}:${projectDataVersion}`;
}
