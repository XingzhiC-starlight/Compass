import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { renameProject, reorderProjects, signOut, storesOnThisDevice } from "../lib/db";
import { TEXT_LIMITS } from "../lib/limits";
import type { ID, Project } from "../lib/types";
import { isSubmitEnter } from "./keys";
import { useDeleteConfirm } from "./useDeleteConfirm";
import { useDragReorder, reorder } from "./useDragReorder";

export default function Sidebar({
  projects,
  archived,
  finishedIds,
  activeProjectId,
  onRenamed,
  onReorderProjects,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onArchiveProject,
  onUnarchiveProject,
  onSignOut,
  onOpenCompanion,
  companionOpen,
}: {
  projects: Project[];
  archived: Project[];
  finishedIds: Set<ID>;
  activeProjectId: ID | null;
  onRenamed: (name: string) => void;
  onReorderProjects: (projects: Project[]) => void;
  onSelectProject: (id: ID) => void;
  onNewProject: () => void;
  onDeleteProject: (id: ID) => void;
  onArchiveProject: (id: ID) => void;
  onUnarchiveProject: (id: ID) => void;
  onSignOut: () => void;
  /** Open the companion window, or bring it forward (spec §23). */
  onOpenCompanion: () => void;
  companionOpen: boolean;
}) {
  const [view, setView] = useState<"active" | "archive">("active");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const deleteConfirm = useDeleteConfirm((p) => onDeleteProject(p.id));
  const settingsPanelId = useId();
  const settingsTitleId = useId();
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsCloseRef = useRef<HTMLButtonElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  const dnd = useDragReorder((from, to) => {
    const next = reorder(projects, from, to);
    onReorderProjects(next);
    reorderProjects(next.map((p) => p.id));
  });

  function armDrag(e: MouseEvent, id: ID) {
    if ((e.target as HTMLElement).closest(".pill-rename, .pill-act")) return;
    dnd.gripProps(id).onMouseDown();
  }

  function flipView() {
    setDraft(null);
    setView((v) => (v === "active" ? "archive" : "active"));
  }

  async function commitRename() {
    if (draft === null) return;
    const name = draft.trim() || "My project";
    setDraft(null);
    onRenamed(name);
    await renameProject(name);
  }

  function askToDelete(p: Project, opener: HTMLElement) {
    setSettingsOpen(false);
    deleteConfirm.ask(p, opener);
  }

  const closeSettings = useCallback((restoreFocus = true) => {
    setSettingsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => settingsButtonRef.current?.focus());
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    closeSettings(false);
    try {
      await signOut();
      onSignOut();
    } finally {
      if (mountedRef.current) setSigningOut(false);
    }
  }

  useEffect(() => {
    if (!settingsOpen) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (settingsPanelRef.current?.contains(target)) return;
      if (settingsButtonRef.current?.contains(target)) return;
      closeSettings(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettings();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSettings, settingsOpen]);

  useEffect(() => {
    if (settingsOpen) settingsCloseRef.current?.focus();
  }, [settingsOpen]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-label sidebar-toggle"
        onClick={flipView}
        title={view === "active" ? "Show the archive" : "Back to your projects"}
      >
        {view === "active" ? "Projects" : "Archive"}
        <span className="toggle-glyph">⇄</span>
      </button>

      {view === "active" ? (
        <div className="project-pills">
          {projects.map((p, i) => {
            const active = p.id === activeProjectId;
            const dropCue =
              dnd.dropAt?.index === i ? (dnd.dropAt.after ? " drop-after" : " drop-before") : "";
            return (
              <div
                key={p.id}
                className={
                  "project-pill" +
                  (active ? " active" : "") +
                  (dnd.grabbedId === p.id ? " dragging" : "") +
                  dropCue
                }
                style={
                  {
                    "--pill-accent": p.accentColor,
                    opacity: dnd.grabbedId === p.id ? 0.5 : 1,
                  } as CSSProperties
                }
                onClick={active ? undefined : () => onSelectProject(p.id)}
                title={active ? undefined : `Switch to ${p.name}`}
                onMouseDown={(e) => armDrag(e, p.id)}
                onMouseUp={() => dnd.gripProps(p.id).onMouseUp()}
                {...dnd.rowProps(i, p.id)}
              >
                <span className="pill-dot" />

                {active && draft !== null ? (
                  <input
                    autoFocus
                    className="pill-rename"
                    maxLength={TEXT_LIMITS.projectName}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (isSubmitEnter(e)) commitRename();
                      if (e.key === "Escape") setDraft(null);
                    }}
                  />
                ) : (
                  <span
                    className="pill-name"
                    style={active ? { cursor: "text" } : undefined}
                    onClick={active ? () => setDraft(p.name) : undefined}
                    title={active ? "Click to rename" : undefined}
                  >
                    {p.name}
                  </span>
                )}

                {finishedIds.has(p.id) && (
                  <button
                    type="button"
                    className="pill-act pill-archive"
                    aria-label={`Archive ${p.name}`}
                    title="Archive (finished) — move to the archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchiveProject(p.id);
                    }}
                  >
                    <ArchiveGlyph />
                  </button>
                )}

                <button
                  type="button"
                  className="pill-act pill-del"
                  aria-label={`Delete ${p.name}`}
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    askToDelete(p, e.currentTarget);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}

          <button type="button" className="project-pill new-pill" onClick={onNewProject}>
            <span className="pill-plus">+</span>
            New project
          </button>
        </div>
      ) : (
        <div className="project-pills">
          {archived.length === 0 ? (
            <p className="archive-empty">
              Nothing archived yet. Finish a project and you can tuck it away here.
            </p>
          ) : (
            archived.map((p) => (
              <div
                key={p.id}
                className="project-pill archived-pill"
                style={{ "--pill-accent": p.accentColor } as CSSProperties}
              >
                <span className="pill-dot" />
                <span className="pill-name">
                  {p.name}
                  {p.archivedAt && (
                    <span className="pill-sub">archived {fmtArchived(p.archivedAt)}</span>
                  )}
                </span>

                <button
                  type="button"
                  className="pill-act pill-restore"
                  aria-label={`Restore ${p.name}`}
                  title="Restore — bring this project back"
                  onClick={() => onUnarchiveProject(p.id)}
                >
                  <ArchiveGlyph restore />
                </button>

                <button
                  type="button"
                  className="pill-act pill-del"
                  aria-label={`Delete ${p.name}`}
                  title="Delete permanently"
                  onClick={(e) => askToDelete(p, e.currentTarget)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {deleteConfirm.panel}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className={"sidebar-companion" + (companionOpen ? " active" : "")}
        title={companionOpen ? "The companion is open: bring it forward" : "Open the small companion window"}
        onClick={onOpenCompanion}
      >
        <CompanionGlyph />
        <span>Companion</span>
      </button>

      <button
        ref={settingsButtonRef}
        type="button"
        className={"sidebar-settings" + (settingsOpen ? " active" : "")}
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        aria-controls={settingsOpen ? settingsPanelId : undefined}
        onClick={toggleSettings}
      >
        <SettingsGlyph />
        <span>Settings</span>
      </button>

      {settingsOpen && (
        <div
          ref={settingsPanelRef}
          id={settingsPanelId}
          className="settings-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={settingsTitleId}
        >
          <div className="settings-panel-head">
            <h2 id={settingsTitleId}>Settings</h2>
            <button
              ref={settingsCloseRef}
              type="button"
              className="settings-close"
              aria-label="Close settings"
              onClick={() => closeSettings()}
            >
              <CloseGlyph />
            </button>
          </div>

          {storesOnThisDevice() ? (
            <div className="settings-row-copy">
              <span className="settings-row-title">Saved on this device</span>
              <span className="settings-row-subtitle">No account. Your work stays on this device.</span>
            </div>
          ) : (
            <>
              <a
                className="settings-row"
                href="/privacy.html"
                aria-label="Privacy Notice, read our privacy policy"
              >
                <LockGlyph />
                <span className="settings-row-copy">
                  <span className="settings-row-title">Privacy Notice</span>
                  <span className="settings-row-subtitle">Read our privacy policy</span>
                </span>
                <ChevronGlyph />
              </a>

              <div className="settings-divider" />

              <button
                type="button"
                className="settings-row"
                aria-label="Log out, sign out from your account"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                <LogoutGlyph />
                <span className="settings-row-copy">
                  <span className="settings-row-title">Log out</span>
                  <span className="settings-row-subtitle">Sign out from your account</span>
                </span>
                <ChevronGlyph />
              </button>
            </>
          )}

          <p className="settings-version">Version {__APP_VERSION__}</p>
        </div>
      )}
    </aside>
  );
}

function CompanionGlyph() {
  return (
    <svg className="sidebar-settings-icon" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="3.5" width="14" height="11" rx="2.2" />
      <rect x="8.8" y="8.8" width="4.9" height="3.4" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SettingsGlyph() {
  return (
    <svg className="sidebar-settings-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7.7 2.4 H10.3 L10.8 4.1 C11.2 4.2 11.6 4.4 11.9 4.6 L13.6 4.2 L14.9 6.5 L13.7 7.8 C13.7 8 13.8 8.5 13.8 9 C13.8 9.5 13.7 10 13.7 10.2 L14.9 11.5 L13.6 13.8 L11.9 13.4 C11.6 13.6 11.2 13.8 10.8 13.9 L10.3 15.6 H7.7 L7.2 13.9 C6.8 13.8 6.4 13.6 6.1 13.4 L4.4 13.8 L3.1 11.5 L4.3 10.2 C4.3 10 4.2 9.5 4.2 9 C4.2 8.5 4.3 8 4.3 7.8 L3.1 6.5 L4.4 4.2 L6.1 4.6 C6.4 4.4 6.8 4.2 7.2 4.1 Z" />
      <circle cx="9" cy="9" r="2.15" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg className="settings-row-icon" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="4" y="8" width="10" height="7" rx="1.5" />
      <path d="M6.2 8 V6.2 C6.2 4.5 7.4 3.3 9 3.3 C10.6 3.3 11.8 4.5 11.8 6.2 V8" />
      <path d="M9 10.8 V12.2" />
    </svg>
  );
}

function LogoutGlyph() {
  return (
    <svg className="settings-row-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7.5 4 H4.5 C3.7 4 3.2 4.5 3.2 5.3 V12.7 C3.2 13.5 3.7 14 4.5 14 H7.5" />
      <path d="M8.2 9 H14.5" />
      <path d="M12 6.5 L14.5 9 L12 11.5" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg className="settings-chevron" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M5.2 3.2 L8.8 7 L5.2 10.8" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg className="settings-close-icon" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3.5 3.5 L10.5 10.5" />
      <path d="M10.5 3.5 L3.5 10.5" />
    </svg>
  );
}

function ArchiveGlyph({ restore = false }: { restore?: boolean }) {
  return (
    <svg className="pill-archive-icon" viewBox="0 0 14 14" aria-hidden="true">
      {restore ? (
        <path d="M7 8.5 V2.5 M4.5 5 L7 2.5 L9.5 5" />
      ) : (
        <path d="M7 2 V8 M4.5 5.5 L7 8 L9.5 5.5" />
      )}
      <path d="M3 10.5 H11" />
    </svg>
  );
}

function fmtArchived(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
