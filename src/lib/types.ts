export type ID = string;

export interface User {
  id: ID;
  email: string;
  name?: string;
}

export interface Project {
  id: ID;
  userId: ID;
  name: string;
  accentColor: string;
  sortOrder: number;
  archivedAt: string | null;
  totalDays: number;
  hoursPlannedPerDay: number;
  hoursAvailablePerDay: number;
  startedAt: string;
  createdAt: string;
}

export interface Phase {
  id: ID;
  projectId: ID;
  userId: ID;
  name: string;
  estDays: number;
  sortOrder: number;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface LearningItem {
  id: ID;
  projectId: ID;
  userId: ID;
  name: string;
  sortOrder: number;
  progressPct: number;
  isFocus: boolean;
  createdAt: string;
}

export interface Task {
  id: ID;
  projectId: ID;
  userId: ID;
  text: string;
  isDone: boolean;
  sortOrder: number;
  taskDate: string;
  phaseId: ID | null;
  learningItemId: ID | null;
  createdAt: string;
}

export interface Thought {
  id: ID;
  projectId: ID;
  userId: ID;
  title?: string;
  text: string;
  sortOrder: number;
  groupId: ID | null;
  createdAt: string;
}

export interface ThoughtGroup {
  id: ID;
  projectId: ID;
  userId: ID;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface TimeSession {
  id: ID;
  projectId: ID;
  userId: ID;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  sessionDate: string;
  createdAt: string;
}

export interface InterviewInput {
  setupId: ID;
  projectName: string;
  accentColor?: string;
  totalDays: number;
  hoursPlannedPerDay: number;
  hoursAvailablePerDay: number;
  phases: { name: string; estDays: number }[];
  learn: { name: string; level: number }[];
}
