import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { isRecord, validateFocusSessionRecord, validateProjectRecord, validateTaskRecord } from "./taskValidation";

export const PRODUCTIVITY_BACKUP_FORMAT = "focusboard-productivity-backup";

export type ProductivityBackup = {
  format: typeof PRODUCTIVITY_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
};

export function createProductivityBackup(
  tasks: TaskRecord[],
  projects: ProjectRecord[],
  sessions: FocusSessionRecord[],
  exportedAt = new Date()
): ProductivityBackup {
  return {
    format: PRODUCTIVITY_BACKUP_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    tasks,
    projects,
    sessions
  };
}

function hasUniqueIds(records: { id: string }[]) {
  return new Set(records.map((record) => record.id)).size === records.length;
}

export function parseProductivityBackup(value: unknown): ProductivityBackup | null {
  if (!isRecord(value) || value.format !== PRODUCTIVITY_BACKUP_FORMAT || value.version !== 1) return null;
  if (typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))) return null;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.projects) || !Array.isArray(value.sessions)) return null;
  const tasks = value.tasks.map(validateTaskRecord);
  const projects = value.projects.map(validateProjectRecord);
  const sessions = value.sessions.map(validateFocusSessionRecord);
  if (tasks.some((record) => record === null) || projects.some((record) => record === null) || sessions.some((record) => record === null)) return null;
  const validTasks = tasks.filter((record): record is TaskRecord => record !== null);
  const validProjects = projects.filter((record): record is ProjectRecord => record !== null);
  const validSessions = sessions.filter((record): record is FocusSessionRecord => record !== null);
  if (!hasUniqueIds(validTasks) || !hasUniqueIds(validProjects) || !hasUniqueIds(validSessions)) return null;
  const taskIds = new Set(validTasks.map((task) => task.id));
  const projectIds = new Set(validProjects.map((project) => project.id));
  if (validTasks.some((task) => task.parentTaskId === task.id || task.parentTaskId !== null && !taskIds.has(task.parentTaskId))) return null;
  if (validTasks.some((task) => task.projectId !== null && !projectIds.has(task.projectId))) return null;
  return {
    format: PRODUCTIVITY_BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date(value.exportedAt).toISOString(),
    tasks: validTasks,
    projects: validProjects,
    sessions: validSessions
  };
}

export function stringifyProductivityBackup(backup: ProductivityBackup) {
  return JSON.stringify(backup, null, 2);
}
