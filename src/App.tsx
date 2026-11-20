import { useEffect, useReducer, useRef, useState } from "react";
import {
  getCurrentUser,
  consumeAuthRedirectError,
  isPasswordRecoveryUrl,
  onAuthChange,
  onPasswordRecovery,
  onWriteError,
  savesInFlight,
  whenSavesSettle,
  getActiveProjectId,
  getDashboardShellData,
  setActiveProject,
  storesOnThisDevice,
  deleteProject,
  archiveProject,
  unarchiveProject,
  type DashboardShellData,
} from "./lib/db";
import { chooseActiveProject, dashboardReloadReducer } from "./lib/projectRouting";
import { consumeRecoveryToken } from "./lib/recoveryLink";
import { authRedirectNotice } from "./auth/authRedirectNotice";
import type { ID, Project } from "./lib/types";
import Landing from "./landing/Landing";
import LoginScreen from "./auth/LoginScreen";
import SetNewPassword from "./auth/SetNewPassword";
import Interview from "./interview/Interview";
import Dashboard from "./dashboard/Dashboard";
import ArchiveScreen from "./archive/ArchiveScreen";

type Screen =
  | "loading"
  | "landing"
  | "login"
  | "interview"
  | "dashboard"
  | "archive"
  | "recovery"
  | "error";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [activeProjectId, setActiveProjectId] = useState<ID | null>(null);
  const [hasProjects, setHasProjects] = useState(false);
  const [shell, setShell] = useState<DashboardShellData | null>(null);
  const [reloadState, dispatchReload] = useReducer(dashboardReloadReducer, {
    quietRefreshRequest: 0,
  });
  const [archivedCount, setArchivedCount] = useState(0);
  const recoveryRouteRef = useRef(false);
  const pendingRecoveryTokenRef = useRef<string | null>(null);
  const authRedirectNoticeRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const shellRef = useRef<DashboardShellData | null>(null);
  shellRef.current = shell;
  const shellReadId = useRef(0);
  const owedParts = useRef({ shell: false, cards: false });
  const [refreshOwed, setRefreshOwed] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<"signin" | "forgot">("signin");

  async function resolveScreen() {
    try {
      const user = await getCurrentUser();
      if (!user) {
        setShell(null);
        owedParts.current = { shell: false, cards: false };
        setRefreshOwed(false);
        setActiveProjectId(null);
        setHasProjects(false);
        setArchivedCount(0);
        return setScreen(authRedirectNoticeRef.current ? "login" : "landing");
      }
      authRedirectNoticeRef.current = false;
      const nextShell = await getDashboardShellData();
      setShell(nextShell);
      setHasProjects(nextShell.projects.length > 0);
      setArchivedCount(nextShell.archived.length);
      if (nextShell.projects.length === 0) {
        setActiveProjectId(null);
        return setScreen("interview");
      }
      const id = chooseActiveProject(nextShell.projects, getActiveProjectId() ?? activeProjectId);
      if (!id) {
        setActiveProjectId(null);
        return setScreen("interview");
      }
      await setActiveProject(id);
      setActiveProjectId(id);
      setScreen("dashboard");
    } catch {
      setScreen("error");
    }
  }

  useEffect(() => {
    const authRedirectError = consumeAuthRedirectError();
    if (authRedirectError) {
      setAuthNotice(authRedirectNotice(authRedirectError));
      authRedirectNoticeRef.current = true;
    }

    const recoveryToken = consumeRecoveryToken();
    if (recoveryToken) pendingRecoveryTokenRef.current = recoveryToken;
    recoveryRouteRef.current = pendingRecoveryTokenRef.current !== null || isPasswordRecoveryUrl();
    const showRecovery = () => {
      recoveryRouteRef.current = true;
      setScreen("recovery");
    };

    const offRecovery = onPasswordRecovery(showRecovery);
    const offAuth = onAuthChange(() => {
      if (recoveryRouteRef.current || isPasswordRecoveryUrl()) {
        showRecovery();
        return;
      }
      resolveScreen();
    });

    // With no accounts (I19) there is no password to recover: an address shaped like a reset
    // link opens the app as any other address does. Asked here, after the address was read.
    if (storesOnThisDevice()) {
      recoveryRouteRef.current = false;
      pendingRecoveryTokenRef.current = null;
    }

    if (recoveryRouteRef.current) showRecovery();
    else resolveScreen();

    return () => {
      offAuth();
      offRecovery();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the gate and its listeners are set up once, on mount
  }, []);

  async function refreshShellQuietly() {
    if (!shellRef.current) return;
    const readId = ++shellReadId.current;
    const apply = (next: DashboardShellData) => {
      if (readId !== shellReadId.current || !shellRef.current) return;
      setShell(next);
      setHasProjects(next.projects.length > 0);
      setArchivedCount(next.archived.length);
    };
    try {
      const busy = savesInFlight() > 0;
      apply(await getDashboardShellData());
      if (busy) {
        await whenSavesSettle();
        if (readId !== shellReadId.current) return;
        apply(await getDashboardShellData());
      }
      if (readId === shellReadId.current) settleRefreshPart("shell", true);
    } catch {
      if (readId === shellReadId.current) settleRefreshPart("shell", false);
    }
  }

  function settleRefreshPart(part: "shell" | "cards", ok: boolean) {
    owedParts.current = { ...owedParts.current, [part]: !ok };
    setRefreshOwed(owedParts.current.shell || owedParts.current.cards);
  }

  function refreshQuietly() {
    dispatchReload({ type: "save-failed" });
    void refreshShellQuietly();
  }
  const refreshQuietlyRef = useRef(refreshQuietly);
  refreshQuietlyRef.current = refreshQuietly;

  useEffect(() => {
    return onWriteError(() => {
      setSaveFailed(true);
      refreshQuietlyRef.current();
    });
  }, []);

  useEffect(() => {
    if (!refreshOwed) return;
    const retry = () => refreshQuietlyRef.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(retry, 15_000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(every);
    };
  }, [refreshOwed]);

  useEffect(() => {
    if (!saveFailed) return;
    const t = setTimeout(() => setSaveFailed(false), 4000);
    return () => clearTimeout(t);
  }, [saveFailed]);

  const handleSelectProject = async (id: ID) => {
    await setActiveProject(id);
    setActiveProjectId(id);
  };

  const handleNewProject = () => setScreen("interview");

  const handleRecoveryDone = () => {
    recoveryRouteRef.current = false;
    pendingRecoveryTokenRef.current = null;
    resolveScreen();
  };

  const handleSendNewResetLink = () => {
    recoveryRouteRef.current = false;
    pendingRecoveryTokenRef.current = null;
    setAuthNotice(null);
    setLoginMode("forgot");
    setScreen("login");
  };

  const handleDeleteProject = async (id: ID) => {
    await deleteProject(id);
    await resolveScreen();
  };

  const handleArchiveProject = async (id: ID) => {
    await archiveProject(id);
    await resolveScreen();
  };

  const handleUnarchiveProject = async (id: ID) => {
    await unarchiveProject(id);
    await setActiveProject(id);
    await resolveScreen();
  };

  const handleProjectRenamed = (name: string) => {
    setShell((s) =>
      s
        ? {
            ...s,
            projects: s.projects.map((p) => (p.id === activeProjectId ? { ...p, name } : p)),
          }
        : s,
    );
  };

  const handleProjectsReordered = (projects: Project[]) => {
    setShell((s) => (s ? { ...s, projects } : s));
  };

  const handleProjectCompletionChange = (id: ID, done: boolean) => {
    setShell((s) =>
      s
        ? {
            ...s,
            completion: { ...s.completion, [id]: done },
          }
        : s,
    );
  };

  function renderScreen() {
    switch (screen) {
      case "loading":
        return <Loading />;
      case "error":
        return <LoadFailed onRetry={resolveScreen} />;
      case "landing":
        return (
          <Landing
            onLogIn={() => {
              setLoginMode("signin");
              setScreen("login");
            }}
          />
        );
      case "login":
        return (
          <LoginScreen
            key={loginMode}
            notice={authNotice}
            initialMode={loginMode}
            onBack={() => setScreen("landing")}
          />
        );
      case "recovery":
        return (
          <SetNewPassword
            onDone={handleRecoveryDone}
            pendingToken={pendingRecoveryTokenRef.current}
            onSendNewLink={handleSendNewResetLink}
          />
        );
      case "interview":
        return (
          <Interview
            onComplete={resolveScreen}
            onCancel={hasProjects ? resolveScreen : undefined}
            archivedCount={archivedCount}
            onViewArchive={() => setScreen("archive")}
          />
        );
      case "archive":
        return <ArchiveScreen onRestore={handleUnarchiveProject} onBack={resolveScreen} />;
      case "dashboard":
        if (!shell) return <Loading />;
        return (
          <Dashboard
            activeProjectId={activeProjectId}
            shell={shell}
            quietRefreshRequest={reloadState.quietRefreshRequest}
            onQuietRefreshSettled={(ok) => settleRefreshPart("cards", ok)}
            onSignOut={resolveScreen}
            onSelectProject={handleSelectProject}
            onNewProject={handleNewProject}
            onDeleteProject={handleDeleteProject}
            onArchiveProject={handleArchiveProject}
            onUnarchiveProject={handleUnarchiveProject}
            onProjectRenamed={handleProjectRenamed}
            onProjectsReordered={handleProjectsReordered}
            onProjectCompletionChange={handleProjectCompletionChange}
          />
        );
    }
  }

  return (
    <>
      {renderScreen()}
      {saveFailed && <SaveToast />}
    </>
  );
}

function SaveToast() {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--surface, #fff)",
        color: "var(--text-muted)",
        fontFamily: "var(--font-body)",
        fontSize: 14,
        border: "1px solid var(--text-muted)",
        borderRadius: "var(--r-pill)",
        padding: "8px 18px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        zIndex: 1000,
      }}
    >
      Couldn't save just now — try again in a moment.
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-body)",
        color: "var(--text-muted)",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ marginBottom: 12, lineHeight: 1.55 }}>
          Compass couldn't load just now.
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

function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-body)",
        color: "var(--text-muted)",
      }}
    >
      Loading…
    </div>
  );
}
