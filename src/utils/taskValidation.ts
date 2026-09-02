import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { RepeatRule, TaskPriority, TaskRecord, TaskStatus } from "../types/task";
import type { PauseInterval, TimerMode, TimerProgram } from "../types/timer";

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const colorPattern = /^#[0-9a-f]{6}$/i;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const taskStatuses: TaskStatus[] = ["open", "completed", "archived"];
const taskPriorities: TaskPriority[] = ["none", "low", "medium", "high"];
const timerPrograms: TimerProgram[] = ["pomodoro", "countdown", "countup"];
const timerModes: TimerMode[] = ["work", "shortBreak", "longBreak"];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isEntityId = (value: unknown): value is string =>
  typeof value === "string" && idPattern.test(value);

export function hasCyclicTaskParents(tasks: TaskRecord[]) {
  const parents = new Map(tasks.map((task) => [task.id, task.parentTaskId]));
  const states = new Map<string, "visiting" | "visited">();
  const visit = (id: string): boolean => {
    const state = states.get(id);
    if (state === "visiting") return true;
    if (state === "visited") return false;
    states.set(id, "visiting");
    const parentId = parents.get(id);
    if (parentId !== null && parentId !== undefined && parents.has(parentId) && visit(parentId)) return true;
    states.set(id, "visited");
    return false;
  };
  return tasks.some((task) => visit(task.id));
}

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isOptionalTimestamp = (value: unknown): value is number | null => value === null || isTimestamp(value);
const isOptionalId = (value: unknown): value is string | null => value === null || isEntityId(value);
const isBoundedInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function validateRepeatRule(value: unknown): RepeatRule | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "weekdays") return { type: "weekdays" };
  if (value.type === "daily" && isBoundedInteger(value.interval, 1, 365)) {
    return { type: "daily", interval: value.interval };
  }
  if (value.type === "weekly" && isBoundedInteger(value.interval, 1, 52) && Array.isArray(value.weekdays)) {
    const weekdays = [...new Set(value.weekdays.filter((day): day is number => isBoundedInteger(day, 0, 6)))].sort();
    return weekdays.length > 0 ? { type: "weekly", interval: value.interval, weekdays } : undefined;
  }
  if (value.type === "monthly" && isBoundedInteger(value.interval, 1, 24) && isBoundedInteger(value.day, 1, 31)) {
    return { type: "monthly", interval: value.interval, day: value.day };
  }
  return undefined;
}

export function validateTaskRecord(value: unknown): TaskRecord | null {
  if (!isRecord(value) || value.version !== 1 || !isEntityId(value.id)) return null;
  if (typeof value.title !== "string" || value.title.trim().length === 0 || value.title.length > 200) return null;
  if (!taskStatuses.includes(value.status as TaskStatus)) return null;
  if (value.bucket !== "inbox" && value.bucket !== "someday") return null;
  if (!isOptionalId(value.projectId) || !isOptionalId(value.parentTaskId)) return null;
  if (typeof value.note !== "string" || value.note.length > 10_000) return null;
  if (value.dueDate !== null && !isLocalDate(value.dueDate)) return null;
  if (!isOptionalTimestamp(value.reminderAt) || !isOptionalId(value.repeatSeriesId)) return null;
  const repeatRule = validateRepeatRule(value.repeatRule);
  if (repeatRule === undefined) return null;
  if (!isBoundedInteger(value.estimatedPomodoros, 0, 99)) return null;
  const priority = value.priority === undefined ? "none" : value.priority;
  if (!taskPriorities.includes(priority as TaskPriority)) return null;
  const tags = value.tags === undefined ? [] : value.tags;
  if (!Array.isArray(tags) || tags.length > 10 || tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0 || tag.length > 24)) return null;
  const normalizedTags = tags.map((tag) => (tag as string).trim());
  if (new Set(normalizedTags).size !== normalizedTags.length) return null;
  if (typeof value.order !== "number" || !Number.isFinite(value.order)) return null;
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || !isOptionalTimestamp(value.completedAt)) return null;
  return {
    version: 1,
    id: value.id,
    title: value.title.trim(),
    status: value.status as TaskStatus,
    bucket: value.bucket,
    projectId: value.projectId,
    parentTaskId: value.parentTaskId,
    note: value.note,
    dueDate: value.dueDate,
    reminderAt: value.reminderAt,
    repeatRule,
    repeatSeriesId: value.repeatSeriesId,
    estimatedPomodoros: value.estimatedPomodoros,
    priority: priority as TaskPriority,
    tags: normalizedTags,
    order: value.order,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt
  };
}

export function validateProjectRecord(value: unknown): ProjectRecord | null {
  if (!isRecord(value) || value.version !== 1 || !isEntityId(value.id)) return null;
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80) return null;
  if (typeof value.color !== "string" || !colorPattern.test(value.color)) return null;
  if (typeof value.order !== "number" || !Number.isFinite(value.order)) return null;
  if (!isOptionalTimestamp(value.archivedAt) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return null;
  return {
    version: 1,
    id: value.id,
    name: value.name.trim(),
    color: value.color.toLowerCase(),
    order: value.order,
    archivedAt: value.archivedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

export function validateFocusSessionRecord(value: unknown): FocusSessionRecord | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !isEntityId(value.id)) return null;
  if (!isOptionalId(value.taskId) || !isOptionalId(value.projectIdSnapshot)) return null;
  if (value.taskTitleSnapshot !== null && (typeof value.taskTitleSnapshot !== "string" || value.taskTitleSnapshot.length > 200)) return null;
  if (value.projectNameSnapshot !== null && (typeof value.projectNameSnapshot !== "string" || value.projectNameSnapshot.length > 80)) return null;
  if (!timerPrograms.includes(value.program as TimerProgram) || !timerModes.includes(value.mode as TimerMode)) return null;
  if (value.result !== "completed" && value.result !== "cancelled") return null;
  if (!isTimestamp(value.startedAt) || !isTimestamp(value.endedAt) || value.endedAt < value.startedAt) return null;
  const startedAt = value.startedAt;
  const endedAt = value.endedAt;
  if (!isTimestamp(value.plannedDurationMs) || !isTimestamp(value.focusedDurationMs)) return null;
  const pauseIntervals: PauseInterval[] = [];
  if (value.version === 2) {
    if (!Array.isArray(value.pauseIntervals)) return null;
    let previousEndedAt = startedAt;
    for (const item of value.pauseIntervals) {
      if (!isRecord(item) || !isTimestamp(item.startedAt) || !isTimestamp(item.endedAt)) return null;
      const pauseStartedAt = item.startedAt;
      const pauseEndedAt = item.endedAt;
      if (pauseStartedAt < startedAt || pauseEndedAt < pauseStartedAt || pauseEndedAt > endedAt || pauseStartedAt < previousEndedAt) return null;
      pauseIntervals.push({ startedAt: pauseStartedAt, endedAt: pauseEndedAt });
      previousEndedAt = pauseEndedAt;
    }
  }
  return {
    version: 2,
    id: value.id,
    taskId: value.taskId,
    taskTitleSnapshot: value.taskTitleSnapshot,
    projectIdSnapshot: value.projectIdSnapshot,
    projectNameSnapshot: value.projectNameSnapshot,
    program: value.program as TimerProgram,
    mode: value.mode as TimerMode,
    result: value.result,
    startedAt,
    endedAt,
    plannedDurationMs: value.plannedDurationMs,
    focusedDurationMs: value.focusedDurationMs,
    pauseIntervals
  };
}
