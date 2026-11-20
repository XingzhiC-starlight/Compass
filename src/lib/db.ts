import type {
  ID,
  InterviewInput,
  LearningItem,
  Phase,
  Project,
  Task,
  Thought,
  ThoughtGroup,
  TimeSession,
  User,
} from "./types";
import { getSupabase } from "./supabase";
import {
  projectFromRow,
  phaseFromRow,
  phaseToRow,
  learningItemFromRow,
  learningItemToRow,
  taskFromRow,
  taskToRow,
  thoughtFromRow,
  thoughtToRow,
  thoughtGroupFromRow,
  timeSessionFromRow,
  timeSessionToRow,
  loggedSecondsOn,
  bucketDailyTime,
  deriveDashboardTime,
  closeSessionAt,
  computeGroup,
  computeUngroup,
  computeMerge,
  computePop,
  localYMD,
  todayDate,
  type DailyTime,
} from "./transforms";

export { todayDate };
export type { DailyTime };

export interface DashboardShellData {
  projects: Project[];
  archived: Project[];
  completion: Record<ID, boolean>;
}

export interface ProjectDashboardData {
  project: Project;
  phases: Phase[];
  learning: LearningItem[];
  tasks: Task[];
  loggedSeconds: number;
  running: boolean;
  daily: DailyTime[];
  thoughts: Thought[];
  thoughtGroups: ThoughtGroup[];
}

const uid = (): ID =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

const nowISO = () => new Date().toISOString();

function requireUser(): User {
  if (!sessionUser) throw new Error("Not signed in");
  return sessionUser;
}

const ACCENT_PALETTE = [
  "#9A7B4F",
  "#7BC8B2",
  "#B8A9C9",
  "#E0A458",
  "#8FB996",
  "#C98BB9",
];

let sessionUser: User | null = null;

function toSessionUser(su: { id: string; email?: string; user_metadata?: Record<string, unknown> }): User {
  return {
    id: su.id,
    email: su.email ?? "",
    name: typeof su.user_metadata?.full_name === "string" ? su.user_metadata.full_name : undefined,
  };
}

function captchaOption(captchaToken?: string): { captchaToken?: string } {
  return captchaToken ? { captchaToken } : {};
}

function authOptions(captchaToken?: string): { options?: { captchaToken: string } } {
  return captchaToken ? { options: { captchaToken } } : {};
}

/**
 * Whether this copy keeps its data on the person's own device, with no accounts (I19): true
 * when the client behind the seam is the local one.
 */
export function storesOnThisDevice(): boolean {
  return (getSupabase() as { storesOnThisDevice?: unknown }).storesOnThisDevice === true;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await getSupabase().auth.getSession();
  sessionUser = data.session ? toSessionUser(data.session.user) : null;
  return sessionUser;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin, ...captchaOption(captchaToken) },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function resendEmailConfirmation(email: string, captchaToken?: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: window.location.origin, ...captchaOption(captchaToken) },
  });
  if (error) throw error;
}

export async function signInWithEmail(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
    ...authOptions(captchaToken),
  });
  if (error) throw error;
}

export async function sendPasswordReset(email: string, captchaToken?: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
    ...captchaOption(captchaToken),
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function verifyRecoveryToken(tokenHash: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) throw error;
}

export function isPasswordRecoveryUrl(rawUrl?: string): boolean {
  const href = rawUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!href) return false;

  try {
    const url = new URL(href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    return (
      url.searchParams.get("type") === "recovery" ||
      hashParams.get("type") === "recovery" ||
      url.searchParams.get("redirect_type") === "recovery" ||
      hashParams.get("redirect_type") === "recovery"
    );
  } catch {
    return false;
  }
}

export type AuthRedirectError = {
  code: string;
  description: string;
};

const AUTH_ERROR_PARAMS = ["error", "error_code", "error_description"];

function urlSearchParamsFromHash(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

export function getAuthRedirectError(rawUrl?: string): AuthRedirectError | null {
  const href = rawUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!href) return null;

  try {
    const url = new URL(href);
    const sources = [url.searchParams, urlSearchParamsFromHash(url.hash)];
    for (const params of sources) {
      const error = params.get("error");
      const code = params.get("error_code") ?? error;
      if (!error && !code) continue;
      return {
        code: code ?? "auth_error",
        description: params.get("error_description") ?? error ?? "Authentication did not finish.",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function cleanAuthRedirectErrorUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of AUTH_ERROR_PARAMS) {
      url.searchParams.delete(key);
    }

    const hashParams = urlSearchParamsFromHash(url.hash);
    for (const key of AUTH_ERROR_PARAMS) {
      hashParams.delete(key);
    }
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function consumeAuthRedirectError(): AuthRedirectError | null {
  if (typeof window === "undefined") return null;
  const err = getAuthRedirectError(window.location.href);
  if (!err) return null;

  const cleaned = cleanAuthRedirectErrorUrl(window.location.href);
  if (cleaned !== window.location.href) {
    const url = new URL(cleaned);
    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  return err;
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
  sessionUser = null;
}

export function onAuthChange(cb: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    const before = sessionUser?.id ?? null;
    sessionUser = session ? toSessionUser(session.user) : null;
    // A password-recovery link also establishes a session, but it must NOT
    // route the user into the app — onPasswordRecovery sends them to the
    // set-new-password screen instead.
    if (event === "PASSWORD_RECOVERY") return;
    if ((sessionUser?.id ?? null) !== before) cb();
  });
  return () => data.subscription.unsubscribe();
}

export function onPasswordRecovery(cb: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") cb();
  });
  return () => data.subscription.unsubscribe();
}

const ACTIVE_PROJECT_KEY = "compass.activeProjectId";

let activeProjectId: ID | null = (() => {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
})();

function setActiveProjectIdLocal(id: ID | null): void {
  activeProjectId = id;
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    /* storage may be unavailable; the module var still works in-memory */
  }
}

function requireActiveProjectId(): ID {
  if (!activeProjectId) throw new Error("No active project");
  return activeProjectId;
}

export interface WriteFailure {
  code: string;
  message: string;
}

export class SaveFailedError extends Error {
  readonly code: string;
  constructor(failure: WriteFailure) {
    super(failure.message);
    this.name = "SaveFailedError";
    this.code = failure.code;
  }
}

type WriteErrorListener = (failure: WriteFailure) => void;
let writeErrorListeners: WriteErrorListener[] = [];

export function onWriteError(cb: WriteErrorListener): () => void {
  writeErrorListeners.push(cb);
  return () => {
    writeErrorListeners = writeErrorListeners.filter((f) => f !== cb);
  };
}

export function savesInFlight(): number {
  return inFlight;
}

export function whenSavesSettle(): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => settleWaiters.push(resolve));
}

/**
 * Calls back every time the last save in flight has answered, whether it was kept or refused,
 * with nothing: a second surface over the same data (the companion window, spec §23) reads
 * again then. Returns the way to stop listening.
 */
export function onSavesSettled(cb: () => void): () => void {
  settledListeners.push(cb);
  return () => {
    settledListeners = settledListeners.filter((f) => f !== cb);
  };
}

let inFlight = 0;
let settleWaiters: (() => void)[] = [];
let settledListeners: (() => void)[] = [];

function tracked<A extends unknown[], R>(write: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => {
    inFlight += 1;
    const done = () => {
      inFlight -= 1;
      if (inFlight === 0) {
        const waiters = settleWaiters;
        settleWaiters = [];
        for (const resolve of waiters) resolve();
        for (const cb of [...settledListeners]) cb();
      }
    };
    let answer: Promise<R>;
    try {
      answer = write(...args);
    } catch (err) {
      done();
      throw err;
    }
    return answer.finally(done);
  };
}

function toWriteFailure(err: unknown): WriteFailure {
  const e = (typeof err === "object" && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" && e.message ? e.message.split("\n")[0] : "unknown error";
  return { code, message };
}

function reportWriteError(err: unknown): void {
  reportFailure(err);
}

function reportFailure(err: unknown): WriteFailure {
  const failure = toWriteFailure(err);
  console.error(`[compass] a save failed: ${failure.code ? `${failure.code} ` : ""}${failure.message}`);
  for (const cb of writeErrorListeners) cb({ ...failure });
  return failure;
}

function saveFailed(err: unknown): SaveFailedError {
  return new SaveFailedError(reportFailure(err));
}

function serialWriteQueue(): (write: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (write) => {
    const pending = tail.then(write, write);
    tail = pending.catch(() => undefined);
    return pending;
  };
}

const enqueueLearningFocusWrite = serialWriteQueue();
const enqueueTimeEdit = serialWriteQueue();

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(projectFromRow);
}

export async function listArchivedProjects(): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("*")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(projectFromRow);
}

export async function listProjectCompletion(): Promise<Record<ID, boolean>> {
  const sb = getSupabase();
  const [{ data: projects, error: e1 }, { data: phases, error: e2 }] = await Promise.all([
    sb.from("projects").select("id"),
    sb.from("phases").select("project_id, is_done"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const done: Record<ID, boolean> = {};
  for (const p of projects ?? []) {
    const phs = (phases ?? []).filter((ph) => ph.project_id === p.id);
    done[p.id] = phs.length > 0 && phs.every((ph) => ph.is_done);
  }
  return done;
}

export async function getDashboardShellData(): Promise<DashboardShellData> {
  const [projects, archived, completion] = await Promise.all([
    listProjects(),
    listArchivedProjects(),
    listProjectCompletion(),
  ]);
  return { projects, archived, completion };
}

export async function getProjectDashboardData(projectId: ID): Promise<ProjectDashboardData | null> {
  const sb = getSupabase();
  const [
    { data: project, error: e0 },
    { data: phases, error: e1 },
    { data: learning, error: e2 },
    { data: tasks, error: e3 },
    time,
    feed,
  ] = await Promise.all([
    sb.from("projects").select("*").eq("id", projectId).maybeSingle(),
    sb.from("phases").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
    sb.from("learning_items").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
    sb.from("daily_tasks").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
    fetchDashboardTime(projectId, 49),
    fetchProjectFeedForProject(projectId),
  ]);
  if (e0) throw e0;
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (!project) return null;
  return {
    project: projectFromRow(project),
    phases: (phases ?? []).map(phaseFromRow),
    learning: (learning ?? []).map(learningItemFromRow),
    tasks: (tasks ?? []).map(taskFromRow),
    loggedSeconds: time.loggedSeconds,
    running: time.running,
    daily: time.daily,
    thoughts: feed.thoughts,
    thoughtGroups: feed.groups,
  };
}

export const archiveProject = tracked(async function archiveProject(id: ID): Promise<void> {
  const { error } = await getSupabase()
    .from("projects")
    .update({ archived_at: nowISO() })
    .eq("id", id);
  if (error) reportWriteError(error);
});

export const unarchiveProject = tracked(async function unarchiveProject(id: ID): Promise<void> {
  const sb = getSupabase();
  const { data: live, error: e1 } = await sb
    .from("projects")
    .select("sort_order")
    .is("archived_at", null);
  if (e1) return reportWriteError(e1);
  const nextOrder = (live ?? []).reduce((m, p) => Math.max(m, p.sort_order + 1), 0);
  const { error } = await sb
    .from("projects")
    .update({ archived_at: null, sort_order: nextOrder })
    .eq("id", id);
  if (error) reportWriteError(error);
});

export const reorderProjects = tracked(async function reorderProjects(orderedIds: ID[]): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) => sb.from("projects").update({ sort_order: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

export async function setActiveProject(id: ID): Promise<void> {
  setActiveProjectIdLocal(id);
}

export function getActiveProjectId(): ID | null {
  return activeProjectId;
}

export const deleteProject = tracked(async function deleteProject(id: ID): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("projects").delete().eq("id", id);
  if (error) return reportWriteError(error);
  if (activeProjectId === id) {
    const { data } = await sb
      .from("projects")
      .select("id")
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .limit(1);
    setActiveProjectIdLocal(data?.[0]?.id ?? null);
  }
});

export const renameProject = tracked(async function renameProject(name: string): Promise<void> {
  const { error } = await getSupabase()
    .from("projects")
    .update({ name: name.trim() || "My project" })
    .eq("id", requireActiveProjectId());
  if (error) reportWriteError(error);
});

export const setHoursPlannedPerDay = tracked(async function setHoursPlannedPerDay(hours: number): Promise<void> {
  const { error } = await getSupabase()
    .from("projects")
    .update({ hours_planned_per_day: Math.max(0, hours) })
    .eq("id", requireActiveProjectId());
  if (error) reportWriteError(error);
});

export const saveInterview = tracked(async function saveInterview(input: InterviewInput): Promise<Project> {
  const sb = getSupabase();

  const { data: liveProjects, error: e0 } = await sb
    .from("projects")
    .select("accent_color, sort_order")
    .is("archived_at", null);
  if (e0) {
    throw saveFailed(e0);
  }
  const liveAccents = new Set((liveProjects ?? []).map((p) => p.accent_color));
  const autoAccent =
    ACCENT_PALETTE.find((c) => !liveAccents.has(c)) ??
    ACCENT_PALETTE[(liveProjects?.length ?? 0) % ACCENT_PALETTE.length];
  const sortOrder = (liveProjects ?? []).reduce((m, p) => Math.max(m, p.sort_order + 1), 0);

  const wholeDays = (days: number) => Math.ceil(days);
  const { data: projRow, error } = await sb.rpc("save_interview", {
    p_project_id: input.setupId,
    p_name: input.projectName.trim() || "My project",
    p_accent_color: input.accentColor ?? autoAccent,
    p_sort_order: sortOrder,
    p_total_days: wholeDays(input.totalDays),
    p_hours_planned_per_day: input.hoursPlannedPerDay,
    p_hours_available_per_day: input.hoursAvailablePerDay,
    p_started_at: todayDate(),
    p_phases: input.phases.map((ph) => ({ name: ph.name, est_days: wholeDays(ph.estDays) })),
    p_learning_items: input.learn.map((it, i) => ({
      name: it.name,
      progress_pct: Math.max(0, Math.min(100, Math.round(it.level))),
      is_focus: i === 0,
    })),
  });
  if (error) {
    throw saveFailed(error);
  }
  const project = projectFromRow(projRow);

  setActiveProjectIdLocal(project.id);
  return project;
});

export const setPhaseDone = tracked(async function setPhaseDone(id: ID, isDone: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from("phases")
    .update({ is_done: isDone, completed_at: isDone ? todayDate() : null })
    .eq("id", id);
  if (error) reportWriteError(error);
});

export const addPhase = tracked(async function addPhase(name: string, estDays: number = 1): Promise<Phase> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  const { data: existing, error: e0 } = await sb
    .from("phases")
    .select("sort_order")
    .eq("project_id", projectId);
  if (e0) {
    throw saveFailed(e0);
  }
  const sortOrder = (existing ?? []).reduce((m, p) => Math.max(m, p.sort_order + 1), 0);
  const { data, error } = await sb
    .from("phases")
    .insert(
      phaseToRow({
        projectId,
        name: name.trim() || "New phase",
        estDays,
        sortOrder,
        isDone: false,
        completedAt: null,
      }),
    )
    .select()
    .single();
  if (error) {
    throw saveFailed(error);
  }
  return phaseFromRow(data);
});

export const renamePhase = tracked(async function renamePhase(id: ID, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await getSupabase().from("phases").update({ name: clean }).eq("id", id);
  if (error) reportWriteError(error);
});

export const setPhaseDays = tracked(async function setPhaseDays(id: ID, estDays: number): Promise<void> {
  const { error } = await getSupabase()
    .from("phases")
    .update({ est_days: Math.max(0, Math.round(estDays)) })
    .eq("id", id);
  if (error) reportWriteError(error);
});

export const removePhase = tracked(async function removePhase(id: ID): Promise<void> {
  const { error } = await getSupabase().from("phases").delete().eq("id", id);
  if (error) reportWriteError(error);
});

export const reorderPhases = tracked(async function reorderPhases(orderedIds: ID[]): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) => sb.from("phases").update({ sort_order: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

export const setLearningProgress = tracked(async function setLearningProgress(id: ID, pct: number): Promise<void> {
  const { error } = await getSupabase()
    .from("learning_items")
    .update({ progress_pct: Math.max(0, Math.min(100, Math.round(pct))) })
    .eq("id", id);
  if (error) reportWriteError(error);
});

async function writeFocusItem(projectId: ID, id: ID): Promise<void> {
  const sb = getSupabase();
  const { error: e1 } = await sb
    .from("learning_items")
    .update({ is_focus: false })
    .eq("project_id", projectId);
  if (e1) return reportWriteError(e1);
  const { error: e2 } = await sb
    .from("learning_items")
    .update({ is_focus: true })
    .eq("id", id)
    .eq("project_id", projectId);
  if (e2) reportWriteError(e2);
}

export const setFocusItem = tracked(async function setFocusItem(id: ID): Promise<void> {
  const projectId = requireActiveProjectId();
  await enqueueLearningFocusWrite(() => writeFocusItem(projectId, id));
});

export const renameLearningItem = tracked(async function renameLearningItem(id: ID, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await getSupabase().from("learning_items").update({ name: clean }).eq("id", id);
  if (error) reportWriteError(error);
});

export const addLearningItem = tracked(async function addLearningItem(name: string): Promise<LearningItem> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  const { data: existing, error: e0 } = await sb
    .from("learning_items")
    .select("sort_order")
    .eq("project_id", projectId);
  if (e0) {
    throw saveFailed(e0);
  }
  const sortOrder = (existing ?? []).reduce((m, x) => Math.max(m, x.sort_order + 1), 0);
  const { data, error } = await sb
    .from("learning_items")
    .insert(learningItemToRow({ projectId, name, sortOrder, progressPct: 0, isFocus: false }))
    .select()
    .single();
  if (error) {
    throw saveFailed(error);
  }
  return learningItemFromRow(data);
});

export const removeLearningItem = tracked(async function removeLearningItem(id: ID, nextFocusId: ID | null = null): Promise<void> {
  const projectId = requireActiveProjectId();
  await enqueueLearningFocusWrite(async () => {
    const { error } = await getSupabase()
      .from("learning_items")
      .delete()
      .eq("id", id)
      .eq("project_id", projectId);
    if (error) return reportWriteError(error);
    if (nextFocusId) await writeFocusItem(projectId, nextFocusId);
  });
});

export const reorderLearningItems = tracked(async function reorderLearningItems(orderedIds: ID[]): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) => sb.from("learning_items").update({ sort_order: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

export const addTask = tracked(async function addTask(text: string): Promise<Task> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  const { data: existing, error: e0 } = await sb
    .from("daily_tasks")
    .select("sort_order")
    .eq("project_id", projectId);
  if (e0) {
    throw saveFailed(e0);
  }
  const sortOrder = (existing ?? []).reduce((m, t) => Math.max(m, t.sort_order + 1), 0);
  const { data, error } = await sb
    .from("daily_tasks")
    .insert(
      taskToRow({
        projectId,
        text,
        isDone: false,
        sortOrder,
        taskDate: todayDate(),
        phaseId: null,
        learningItemId: null,
      }),
    )
    .select()
    .single();
  if (error) {
    throw saveFailed(error);
  }
  return taskFromRow(data);
});

export const updateTask = tracked(async function updateTask(id: ID, patch: Partial<Pick<Task, "text" | "isDone">>): Promise<boolean> {
  const { error } = await getSupabase().from("daily_tasks").update(taskToRow(patch)).eq("id", id);
  if (error) {
    reportWriteError(error);
    return false;
  }
  return true;
});

export const removeTask = tracked(async function removeTask(id: ID): Promise<void> {
  const { error } = await getSupabase().from("daily_tasks").delete().eq("id", id);
  if (error) reportWriteError(error);
});

export const reorderTasks = tracked(async function reorderTasks(orderedIds: ID[]): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) => sb.from("daily_tasks").update({ sort_order: i }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

function closeRow(s: { started_at: string; session_date: string }, nowMs: number) {
  const { endedAt, durationSeconds } = closeSessionAt(s.started_at, s.session_date, nowMs);
  return { ended_at: endedAt, duration_seconds: durationSeconds };
}

async function closeStaleSessions(): Promise<void> {
  const sb = getSupabase();
  const today = todayDate();
  const { data: stale, error } = await sb
    .from("time_sessions")
    .select("id, started_at, session_date")
    .is("ended_at", null)
    .lt("session_date", today);
  if (error || !stale || stale.length === 0) return;
  const now = Date.now();
  await Promise.all(
    stale.map((s) => sb.from("time_sessions").update(closeRow(s, now)).eq("id", s.id)),
  );
}

async function fetchSessionsForProject(
  projectId: ID,
  opts: { date?: string; sinceDate?: string } = {},
): Promise<TimeSession[]> {
  let q = getSupabase().from("time_sessions").select("*").eq("project_id", projectId);
  if (opts.date) q = q.eq("session_date", opts.date);
  if (opts.sinceDate) q = q.gte("session_date", opts.sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(timeSessionFromRow);
}

async function fetchProjectSessions(opts: { date?: string; sinceDate?: string } = {}): Promise<TimeSession[]> {
  return fetchSessionsForProject(requireActiveProjectId(), opts);
}

async function fetchDashboardTime(projectId: ID, days: number): Promise<{ loggedSeconds: number; running: boolean; daily: DailyTime[] }> {
  await closeStaleSessions();
  const now = new Date();
  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const sessions = await fetchSessionsForProject(projectId, { sinceDate: localYMD(oldest) });
  return deriveDashboardTime(sessions, days, now);
}

export async function getTodayLoggedSeconds(): Promise<number> {
  await closeStaleSessions();
  const sessions = await fetchProjectSessions({ date: todayDate() });
  return loggedSecondsOn(sessions, todayDate(), Date.now());
}

export async function listDailyTime(days: number): Promise<DailyTime[]> {
  await closeStaleSessions();
  const now = new Date();
  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const sessions = await fetchProjectSessions({ sinceDate: localYMD(oldest) });
  return bucketDailyTime(sessions, days, now);
}

export const startSession = tracked(async function startSession(): Promise<TimeSession | null> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  await closeStaleSessions();
  const { data: running, error: e0 } = await sb
    .from("time_sessions")
    .select("id, started_at, session_date")
    .is("ended_at", null);
  if (e0) {
    reportWriteError(e0);
    return null;
  }
  const now = Date.now();
  const closes = await Promise.all(
    (running ?? []).map((s) => sb.from("time_sessions").update(closeRow(s, now)).eq("id", s.id)),
  );
  const failedClose = closes.find((c) => c.error);
  if (failedClose) {
    reportWriteError(failedClose.error);
    return null;
  }
  const { data, error } = await sb
    .from("time_sessions")
    .insert(
      timeSessionToRow({
        projectId,
        startedAt: new Date(now).toISOString(),
        endedAt: null,
        durationSeconds: 0,
        sessionDate: todayDate(),
      }),
    )
    .select()
    .single();
  if (error) {
    reportWriteError(error);
    return null;
  }
  return timeSessionFromRow(data);
});

export const stopSession = tracked(async function stopSession(): Promise<void> {
  const sb = getSupabase();
  const { data: running, error: e0 } = await sb
    .from("time_sessions")
    .select("id, started_at, session_date")
    .eq("project_id", requireActiveProjectId())
    .is("ended_at", null);
  if (e0) return reportWriteError(e0);
  if (!running || running.length === 0) return;
  const now = Date.now();
  const closes = await Promise.all(
    running.map((s) => sb.from("time_sessions").update(closeRow(s, now)).eq("id", s.id)),
  );
  const failedClose = closes.find((c) => c.error);
  if (failedClose) reportWriteError(failedClose.error);
});

export const setLoggedSecondsForDate = tracked(function setLoggedSecondsForDate(date: string, seconds: number): Promise<void> {
  return enqueueTimeEdit(async () => {
    const sb = getSupabase();
    const projectId = requireActiveProjectId();
    const nowIso = new Date().toISOString();
    const { data: written, error: e1 } = await sb
      .from("time_sessions")
      .insert(
        timeSessionToRow({
          projectId,
          startedAt: nowIso,
          endedAt: nowIso,
          durationSeconds: Math.max(0, Math.round(seconds)),
          sessionDate: date,
        }),
      )
      .select("id")
      .single();
    if (e1 || !written) return reportWriteError(e1 ?? new Error("the day's new total was not written"));
    const { error: e2 } = await sb
      .from("time_sessions")
      .delete()
      .eq("project_id", projectId)
      .eq("session_date", date)
      .neq("id", written.id);
    if (e2) reportWriteError(e2);
  });
});

async function fetchProjectFeedForProject(projectId: ID): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] }> {
  const sb = getSupabase();
  const [{ data: t, error: e1 }, { data: g, error: e2 }] = await Promise.all([
    sb.from("thoughts").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
    sb.from("thought_groups").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    thoughts: (t ?? []).map(thoughtFromRow),
    groups: (g ?? []).map(thoughtGroupFromRow),
  };
}

async function fetchProjectFeed(): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] }> {
  return fetchProjectFeedForProject(requireActiveProjectId());
}

async function applyFeedDiff(
  oldThoughts: Thought[],
  oldGroups: ThoughtGroup[],
  newThoughts: Thought[],
  newGroups: ThoughtGroup[],
): Promise<void> {
  const sb = getSupabase();
  const oldGById = new Map(oldGroups.map((g) => [g.id, g]));
  const newGIds = new Set(newGroups.map((g) => g.id));

  const inserts = newGroups.filter((g) => !oldGById.has(g.id));
  if (inserts.length) {
    const { error } = await sb.from("thought_groups").insert(
      inserts.map((g) => ({
        id: g.id,
        project_id: g.projectId,
        name: g.name,
        sort_order: g.sortOrder,
        created_at: g.createdAt,
      })),
    );
    if (error) return reportWriteError(error);
  }

  const ops: PromiseLike<{ error: unknown }>[] = [];
  for (const g of newGroups) {
    const prev = oldGById.get(g.id);
    if (prev && (prev.sortOrder !== g.sortOrder || prev.name !== g.name)) {
      ops.push(sb.from("thought_groups").update({ sort_order: g.sortOrder, name: g.name }).eq("id", g.id));
    }
  }
  const oldTById = new Map(oldThoughts.map((t) => [t.id, t]));
  for (const t of newThoughts) {
    const prev = oldTById.get(t.id);
    if (prev && (prev.groupId !== t.groupId || prev.sortOrder !== t.sortOrder)) {
      ops.push(sb.from("thoughts").update({ group_id: t.groupId, sort_order: t.sortOrder }).eq("id", t.id));
    }
  }
  if (ops.length) {
    const results = await Promise.all(ops);
    const failed = results.find((r) => r.error);
    if (failed?.error) return reportWriteError(failed.error);
  }

  const removed = oldGroups.filter((g) => !newGIds.has(g.id));
  if (removed.length) {
    const results = await Promise.all(removed.map((g) => sb.from("thought_groups").delete().eq("id", g.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) reportWriteError(failed.error);
  }
}

export const addThought = tracked(async function addThought(text: string): Promise<Thought> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  const [{ data: top, error: e1 }, { data: grps, error: e2 }] = await Promise.all([
    sb.from("thoughts").select("id").eq("project_id", projectId).is("group_id", null),
    sb.from("thought_groups").select("id").eq("project_id", projectId),
  ]);
  if (e1) {
    throw saveFailed(e1);
  }
  if (e2) {
    throw saveFailed(e2);
  }
  const sortOrder = (top?.length ?? 0) + (grps?.length ?? 0);
  const { data, error } = await sb
    .from("thoughts")
    .insert(thoughtToRow({ projectId, title: "", text: text.trim(), sortOrder, groupId: null }))
    .select()
    .single();
  if (error) {
    throw saveFailed(error);
  }
  return thoughtFromRow(data);
});

export const updateThought = tracked(async function updateThought(
  id: ID,
  patch: Partial<Pick<Thought, "text" | "title">>,
): Promise<boolean> {
  const { error } = await getSupabase().from("thoughts").update(thoughtToRow(patch)).eq("id", id);
  if (error) {
    reportWriteError(error);
    return false;
  }
  return true;
});

export const removeThought = tracked(async function removeThought(id: ID): Promise<void> {
  const { error } = await getSupabase().from("thoughts").delete().eq("id", id);
  if (error) reportWriteError(error);
});

export const reorderFeed = tracked(async function reorderFeed(
  items: Array<{ id: ID; kind: "thought" | "group" }>,
): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    items.map(({ id, kind }, i) =>
      kind === "thought"
        ? sb.from("thoughts").update({ sort_order: i }).eq("id", id)
        : sb.from("thought_groups").update({ sort_order: i }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

export const reorderThoughtsInGroup = tracked(async function reorderThoughtsInGroup(groupId: ID, orderedIds: ID[]): Promise<void> {
  const sb = getSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      sb.from("thoughts").update({ sort_order: i }).eq("id", id).eq("group_id", groupId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) reportWriteError(failed.error);
});

async function readFeedForReshape(): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] } | null> {
  try {
    return await fetchProjectFeed();
  } catch (err) {
    reportWriteError(err);
    return null;
  }
}

export const groupThoughts = tracked(async function groupThoughts(
  thoughtIds: ID[],
  name: string,
): Promise<{ group: ThoughtGroup; thoughts: Thought[]; groups: ThoughtGroup[] } | null> {
  const user = requireUser();
  const projectId = requireActiveProjectId();
  const feed = await readFeedForReshape();
  if (!feed) return null;
  const { thoughts: oldT, groups: oldG } = feed;
  const seed = { id: uid(), name, projectId, userId: user.id, createdAt: nowISO() };
  const { thoughts, groups } = computeGroup(oldT, oldG, thoughtIds, seed);
  await applyFeedDiff(oldT, oldG, thoughts, groups);
  const group = groups.find((g) => g.id === seed.id) as ThoughtGroup;
  return { group, thoughts, groups };
});

export const ungroupThoughts = tracked(async function ungroupThoughts(
  groupId: ID,
): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] } | null> {
  const feed = await readFeedForReshape();
  if (!feed) return null;
  const { thoughts: oldT, groups: oldG } = feed;
  const { thoughts, groups } = computeUngroup(oldT, oldG, groupId);
  await applyFeedDiff(oldT, oldG, thoughts, groups);
  return { thoughts, groups };
});

export const renameThoughtGroup = tracked(async function renameThoughtGroup(id: ID, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await getSupabase().from("thought_groups").update({ name: clean }).eq("id", id);
  if (error) reportWriteError(error);
});

export const moveThoughtToGroup = tracked(async function moveThoughtToGroup(thoughtId: ID, groupId: ID | null): Promise<void> {
  const sb = getSupabase();
  const projectId = requireActiveProjectId();
  if (groupId === null) {
    const [{ data: top }, { data: grps }] = await Promise.all([
      sb.from("thoughts").select("id").eq("project_id", projectId).is("group_id", null),
      sb.from("thought_groups").select("id").eq("project_id", projectId),
    ]);
    const sortOrder = (top?.length ?? 0) + (grps?.length ?? 0);
    const { error } = await sb.from("thoughts").update({ group_id: null, sort_order: sortOrder }).eq("id", thoughtId);
    if (error) reportWriteError(error);
  } else {
    const { data: inG } = await sb.from("thoughts").select("id").eq("group_id", groupId);
    const { error } = await sb
      .from("thoughts")
      .update({ group_id: groupId, sort_order: inG?.length ?? 0 })
      .eq("id", thoughtId);
    if (error) reportWriteError(error);
  }
});

export const mergeThoughtsIntoGroup = tracked(async function mergeThoughtsIntoGroup(
  targetGroupId: ID,
  thoughtIds: ID[],
): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] } | null> {
  const feed = await readFeedForReshape();
  if (!feed) return null;
  const { thoughts: oldT, groups: oldG } = feed;
  const { thoughts, groups } = computeMerge(oldT, oldG, targetGroupId, thoughtIds);
  await applyFeedDiff(oldT, oldG, thoughts, groups);
  return { thoughts, groups };
});

export const popThoughtsFromGroup = tracked(async function popThoughtsFromGroup(
  thoughtIds: ID[],
): Promise<{ thoughts: Thought[]; groups: ThoughtGroup[] } | null> {
  const feed = await readFeedForReshape();
  if (!feed) return null;
  const { thoughts: oldT, groups: oldG } = feed;
  const { thoughts, groups } = computePop(oldT, oldG, thoughtIds);
  await applyFeedDiff(oldT, oldG, thoughts, groups);
  return { thoughts, groups };
});

export function __setTestUser(user: User | null): void {
  sessionUser = user;
}
