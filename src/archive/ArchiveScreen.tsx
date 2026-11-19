import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDeleteConfirm } from "../dashboard/useDeleteConfirm";
import { listArchivedProjects, deleteProject } from "../lib/db";
import type { Project, ID } from "../lib/types";
import "../styles/interview.css";

export default function ArchiveScreen({
  onRestore,
  onBack,
}: {
  onRestore: (id: ID) => void;
  onBack: () => void;
}) {
  const [archived, setArchived] = useState<Project[] | null>(null);

  useEffect(() => {
    listArchivedProjects().then(setArchived);
  }, []);

  const deleting = useRef(new Set<ID>());
  const latestRead = useRef(0);

  async function handleDelete(p: Project) {
    if (deleting.current.has(p.id)) return;
    deleting.current.add(p.id);
    try {
      await deleteProject(p.id);
    } finally {
      deleting.current.delete(p.id);
    }
    const read = ++latestRead.current;
    const next = await listArchivedProjects();
    if (read !== latestRead.current) return;
    if (next.length === 0) return onBack();
    setArchived(next);
  }
  const deleteConfirm = useDeleteConfirm(handleDelete);

  return (
    <main className="setup">
      <button type="button" className="setup-cancel" onClick={onBack}>
        ← Back
      </button>

      <header className="setup-head">
        <div className="brand">Compass</div>
        <h1>Archive</h1>
        <p className="sub">
          Projects you've finished and tucked away. Restore one to pick it back up, or remove it for
          good.
        </p>
      </header>

      <section className="card" data-section="time">
        {archived === null ? (
          <p className="archive-screen-empty">Loading…</p>
        ) : archived.length === 0 ? (
          <p className="archive-screen-empty">Nothing archived yet.</p>
        ) : (
          <ul className="archive-list">
            {archived.map((p) => (
              <li
                key={p.id}
                className="archive-item"
                style={{ "--pill-accent": p.accentColor } as CSSProperties}
              >
                <span className="pill-dot" />
                <span className="archive-item-name">
                  {p.name}
                  {p.archivedAt && (
                    <span className="archive-item-sub">archived {fmtArchived(p.archivedAt)}</span>
                  )}
                </span>
                <button type="button" className="archive-restore" onClick={() => onRestore(p.id)}>
                  Restore
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete ${p.name}`}
                  title="Delete permanently"
                  onClick={(e) => deleteConfirm.ask(p, e.currentTarget)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteConfirm.panel}
    </main>
  );
}

function fmtArchived(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
