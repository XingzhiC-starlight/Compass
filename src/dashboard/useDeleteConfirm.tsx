import { useState, type ReactNode } from "react";
import type { Project } from "../lib/types";
import DeleteConfirm from "./DeleteConfirm";

type Pending = { project: Project; opener: HTMLElement };

export function useDeleteConfirm(onDelete: (project: Project) => void): {
  ask: (project: Project, opener: HTMLElement) => void;
  panel: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  const panel = pending && (
    <DeleteConfirm
      key={pending.project.id}
      project={pending.project}
      opener={pending.opener}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null);
        onDelete(pending.project);
      }}
    />
  );

  return { ask: (project, opener) => setPending({ project, opener }), panel };
}
