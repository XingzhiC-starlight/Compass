import type {
  ID,
  LearningItem,
  Phase,
  Project,
  Task,
  Thought,
  ThoughtGroup,
  TimeSession,
} from "./types";

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  accent_color: string;
  sort_order: number;
  archived_at: string | null;
  total_days: number;
  hours_planned_per_day: number;
  hours_available_per_day: number;
  started_at: string;
  created_at: string;
}

export function projectFromRow(r: ProjectRow): Project {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    accentColor: r.accent_color,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    totalDays: r.total_days,
    hoursPlannedPerDay: r.hours_planned_per_day,
    hoursAvailablePerDay: r.hours_available_per_day,
    startedAt: r.started_at,
    createdAt: r.created_at,
  };
}

export interface PhaseRow {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  est_days: number;
  sort_order: number;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
}

export function phaseFromRow(r: PhaseRow): Phase {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    name: r.name,
    estDays: r.est_days,
    sortOrder: r.sort_order,
    isDone: r.is_done,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

export function phaseToRow(p: Partial<Phase>): Partial<PhaseRow> {
  const r: Partial<PhaseRow> = {};
  if (p.id !== undefined) r.id = p.id;
  if (p.userId !== undefined) r.user_id = p.userId;
  if (p.projectId !== undefined) r.project_id = p.projectId;
  if (p.name !== undefined) r.name = p.name;
  if (p.estDays !== undefined) r.est_days = p.estDays;
  if (p.sortOrder !== undefined) r.sort_order = p.sortOrder;
  if (p.isDone !== undefined) r.is_done = p.isDone;
  if (p.completedAt !== undefined) r.completed_at = p.completedAt;
  if (p.createdAt !== undefined) r.created_at = p.createdAt;
  return r;
}

export interface LearningItemRow {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  sort_order: number;
  progress_pct: number;
  is_focus: boolean;
  created_at: string;
}

export function learningItemFromRow(r: LearningItemRow): LearningItem {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    name: r.name,
    sortOrder: r.sort_order,
    progressPct: r.progress_pct,
    isFocus: r.is_focus,
    createdAt: r.created_at,
  };
}

export function learningItemToRow(l: Partial<LearningItem>): Partial<LearningItemRow> {
  const r: Partial<LearningItemRow> = {};
  if (l.id !== undefined) r.id = l.id;
  if (l.userId !== undefined) r.user_id = l.userId;
  if (l.projectId !== undefined) r.project_id = l.projectId;
  if (l.name !== undefined) r.name = l.name;
  if (l.sortOrder !== undefined) r.sort_order = l.sortOrder;
  if (l.progressPct !== undefined) r.progress_pct = l.progressPct;
  if (l.isFocus !== undefined) r.is_focus = l.isFocus;
  if (l.createdAt !== undefined) r.created_at = l.createdAt;
  return r;
}

export interface TaskRow {
  id: string;
  user_id: string;
  project_id: string;
  text: string;
  is_done: boolean;
  sort_order: number;
  task_date: string;
  phase_id: string | null;
  learning_item_id: string | null;
  created_at: string;
}

export function taskFromRow(r: TaskRow): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    text: r.text,
    isDone: r.is_done,
    sortOrder: r.sort_order,
    taskDate: r.task_date,
    phaseId: r.phase_id,
    learningItemId: r.learning_item_id,
    createdAt: r.created_at,
  };
}

export function taskToRow(t: Partial<Task>): Partial<TaskRow> {
  const r: Partial<TaskRow> = {};
  if (t.id !== undefined) r.id = t.id;
  if (t.userId !== undefined) r.user_id = t.userId;
  if (t.projectId !== undefined) r.project_id = t.projectId;
  if (t.text !== undefined) r.text = t.text;
  if (t.isDone !== undefined) r.is_done = t.isDone;
  if (t.sortOrder !== undefined) r.sort_order = t.sortOrder;
  if (t.taskDate !== undefined) r.task_date = t.taskDate;
  if (t.phaseId !== undefined) r.phase_id = t.phaseId;
  if (t.learningItemId !== undefined) r.learning_item_id = t.learningItemId;
  if (t.createdAt !== undefined) r.created_at = t.createdAt;
  return r;
}

export interface ThoughtRow {
  id: string;
  user_id: string;
  project_id: string;
  title: string | null;
  text: string;
  sort_order: number;
  group_id: string | null;
  created_at: string;
}

export function thoughtFromRow(r: ThoughtRow): Thought {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    title: r.title ?? "",
    text: r.text,
    sortOrder: r.sort_order,
    groupId: r.group_id,
    createdAt: r.created_at,
  };
}

export function thoughtToRow(t: Partial<Thought>): Partial<ThoughtRow> {
  const r: Partial<ThoughtRow> = {};
  if (t.id !== undefined) r.id = t.id;
  if (t.userId !== undefined) r.user_id = t.userId;
  if (t.projectId !== undefined) r.project_id = t.projectId;
  if (t.title !== undefined) r.title = t.title;
  if (t.text !== undefined) r.text = t.text;
  if (t.sortOrder !== undefined) r.sort_order = t.sortOrder;
  if (t.groupId !== undefined) r.group_id = t.groupId;
  if (t.createdAt !== undefined) r.created_at = t.createdAt;
  return r;
}

export interface ThoughtGroupRow {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export function thoughtGroupFromRow(r: ThoughtGroupRow): ThoughtGroup {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export interface TimeSessionRow {
  id: string;
  user_id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  session_date: string;
  created_at: string;
}

export function timeSessionFromRow(r: TimeSessionRow): TimeSession {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    sessionDate: r.session_date,
    createdAt: r.created_at,
  };
}

export function timeSessionToRow(s: Partial<TimeSession>): Partial<TimeSessionRow> {
  const r: Partial<TimeSessionRow> = {};
  if (s.id !== undefined) r.id = s.id;
  if (s.userId !== undefined) r.user_id = s.userId;
  if (s.projectId !== undefined) r.project_id = s.projectId;
  if (s.startedAt !== undefined) r.started_at = s.startedAt;
  if (s.endedAt !== undefined) r.ended_at = s.endedAt;
  if (s.durationSeconds !== undefined) r.duration_seconds = s.durationSeconds;
  if (s.sessionDate !== undefined) r.session_date = s.sessionDate;
  if (s.createdAt !== undefined) r.created_at = s.createdAt;
  return r;
}

const cloneThoughts = (ts: Thought[]): Thought[] => ts.map((t) => ({ ...t }));
const cloneGroups = (gs: ThoughtGroup[]): ThoughtGroup[] => gs.map((g) => ({ ...g }));

function dropEmptyGroups(thoughts: Thought[], groups: ThoughtGroup[], keepId?: ID): ThoughtGroup[] {
  return groups.filter((g) => g.id === keepId || thoughts.some((t) => t.groupId === g.id));
}

function renumberFeed(thoughts: Thought[], groups: ThoughtGroup[]): void {
  type Slot = { kind: "thought" | "group"; id: ID; order: number };
  const slots: Slot[] = [
    ...thoughts.filter((t) => t.groupId === null).map((t) => ({ kind: "thought" as const, id: t.id, order: t.sortOrder })),
    ...groups.map((g) => ({ kind: "group" as const, id: g.id, order: g.sortOrder })),
  ].sort((a, b) => a.order - b.order);
  slots.forEach(({ kind, id }, i) => {
    if (kind === "thought") {
      const t = thoughts.find((x) => x.id === id);
      if (t) t.sortOrder = i;
    } else {
      const g = groups.find((x) => x.id === id);
      if (g) g.sortOrder = i;
    }
  });
}

export function computeGroup(
  thoughtsIn: Thought[],
  groupsIn: ThoughtGroup[],
  thoughtIds: ID[],
  newGroup: { id: ID; name: string; projectId: ID; userId: ID; createdAt: string },
): { thoughts: Thought[]; groups: ThoughtGroup[] } {
  const thoughts = cloneThoughts(thoughtsIn);
  const groups = cloneGroups(groupsIn);

  const toGroup = thoughts.filter((t) => thoughtIds.includes(t.id));
  const maxOrder = toGroup.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  const removedOrders = new Set(toGroup.map((t) => t.sortOrder));

  const remaining = thoughts
    .filter((t) => t.groupId === null && !thoughtIds.includes(t.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedGroups = groups.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  type Slot = { kind: "thought" | "group"; id: ID; order: number };
  const slots: Slot[] = [
    ...remaining.map((t) => ({ kind: "thought" as const, id: t.id, order: t.sortOrder })),
    ...sortedGroups.map((g) => ({ kind: "group" as const, id: g.id, order: g.sortOrder })),
  ].sort((a, b) => a.order - b.order);

  const insertAt = slots.filter((s) => s.order < maxOrder || removedOrders.has(s.order)).length;
  slots.splice(insertAt, 0, { kind: "group", id: newGroup.id, order: -1 });

  slots.forEach(({ kind, id }, i) => {
    if (kind === "thought") {
      const t = thoughts.find((x) => x.id === id);
      if (t) t.sortOrder = i;
    } else if (id !== newGroup.id) {
      const g = groups.find((x) => x.id === id);
      if (g) g.sortOrder = i;
    }
  });

  const group: ThoughtGroup = {
    id: newGroup.id,
    projectId: newGroup.projectId,
    userId: newGroup.userId,
    name: newGroup.name.trim() || "Untitled group",
    sortOrder: insertAt,
    createdAt: newGroup.createdAt,
  };
  groups.push(group);

  toGroup
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((t, i) => {
      t.groupId = newGroup.id;
      t.sortOrder = i;
    });

  const kept = dropEmptyGroups(thoughts, groups, newGroup.id);
  renumberFeed(thoughts, kept);
  return { thoughts, groups: kept };
}

export function computeUngroup(
  thoughtsIn: Thought[],
  groupsIn: ThoughtGroup[],
  groupId: ID,
): { thoughts: Thought[]; groups: ThoughtGroup[] } {
  const thoughts = cloneThoughts(thoughtsIn);
  let groups = cloneGroups(groupsIn);

  if (!groups.some((g) => g.id === groupId)) return { thoughts, groups };

  const grouped = thoughts
    .filter((t) => t.groupId === groupId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const topThoughts = thoughts
    .filter((t) => t.groupId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const topGroups = groups
    .filter((g) => g.id !== groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  type Slot = { kind: "thought" | "group"; id: ID; order: number };
  const slots: Slot[] = [
    ...topThoughts.map((t) => ({ kind: "thought" as const, id: t.id, order: t.sortOrder })),
    ...topGroups.map((g) => ({ kind: "group" as const, id: g.id, order: g.sortOrder })),
  ].sort((a, b) => a.order - b.order);

  slots.push(...grouped.map((t) => ({ kind: "thought" as const, id: t.id, order: -1 })));

  slots.forEach(({ kind, id }, i) => {
    if (kind === "thought") {
      const t = thoughts.find((x) => x.id === id);
      if (t) {
        t.sortOrder = i;
        t.groupId = null;
      }
    } else {
      const g = groups.find((x) => x.id === id);
      if (g) g.sortOrder = i;
    }
  });

  groups = groups.filter((g) => g.id !== groupId);
  return { thoughts, groups };
}

export function computeMerge(
  thoughtsIn: Thought[],
  groupsIn: ThoughtGroup[],
  targetGroupId: ID,
  thoughtIds: ID[],
): { thoughts: Thought[]; groups: ThoughtGroup[] } {
  const thoughts = cloneThoughts(thoughtsIn);
  const groups = cloneGroups(groupsIn);

  if (!groups.some((g) => g.id === targetGroupId)) return { thoughts, groups };

  const idSet = new Set(thoughtIds);
  const existing = thoughts
    .filter((t) => t.groupId === targetGroupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const newcomers = thoughts
    .filter((t) => idSet.has(t.id) && t.groupId !== targetGroupId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  [...existing, ...newcomers].forEach((t, i) => {
    t.groupId = targetGroupId;
    t.sortOrder = i;
  });

  const kept = dropEmptyGroups(thoughts, groups, targetGroupId);
  renumberFeed(thoughts, kept);
  return { thoughts, groups: kept };
}

export function computePop(
  thoughtsIn: Thought[],
  groupsIn: ThoughtGroup[],
  thoughtIds: ID[],
): { thoughts: Thought[]; groups: ThoughtGroup[] } {
  const thoughts = cloneThoughts(thoughtsIn);
  const groups = cloneGroups(groupsIn);

  const idSet = new Set(thoughtIds);
  let nextOrder =
    thoughts.filter((t) => t.groupId === null).length + groups.length;
  thoughts
    .filter((t) => idSet.has(t.id) && t.groupId !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((t) => {
      t.groupId = null;
      t.sortOrder = nextOrder++;
    });

  const kept = dropEmptyGroups(thoughts, groups);
  renumberFeed(thoughts, kept);
  return { thoughts, groups: kept };
}

export function localYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayDate = (): string => localYMD();

export function localDayEnd(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d + 1);
}

export function closeSessionAt(
  startedAt: string,
  sessionDate: string,
  nowMs: number,
): { endedAt: string; durationSeconds: number } {
  const endMs = Math.min(nowMs, localDayEnd(sessionDate).getTime());
  const durationSeconds = Math.max(0, Math.floor((endMs - new Date(startedAt).getTime()) / 1000));
  return { endedAt: new Date(endMs).toISOString(), durationSeconds };
}

export interface DailyTime {
  date: string;
  loggedSeconds: number;
}

export function loggedSecondsOn(sessions: TimeSession[], date: string, now: number): number {
  return sessions
    .filter((s) => s.sessionDate === date)
    .reduce((sum, s) => {
      if (s.endedAt) return sum + s.durationSeconds;
      return sum + closeSessionAt(s.startedAt, s.sessionDate, now).durationSeconds;
    }, 0);
}

export function bucketDailyTime(sessions: TimeSession[], days: number, now: Date): DailyTime[] {
  const nowMs = now.getTime();
  const out: DailyTime[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const date = localYMD(d);
    out.push({ date, loggedSeconds: loggedSecondsOn(sessions, date, nowMs) });
  }
  return out;
}

export function deriveDashboardTime(
  sessions: TimeSession[],
  days: number,
  now: Date,
): { loggedSeconds: number; running: boolean; daily: DailyTime[] } {
  const today = localYMD(now);
  return {
    loggedSeconds: loggedSecondsOn(sessions, today, now.getTime()),
    running: sessions.some((s) => s.endedAt === null),
    daily: bucketDailyTime(sessions, days, now),
  };
}

/** Built on `crypto.getRandomValues`, which every supported browser has, rather
   than `crypto.randomUUID`, which iOS lacks before 15.4. */
export function randomId(): ID {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4: the random kind
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx: the standard layout
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
