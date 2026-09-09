import type { RepeatRule, TaskRecord } from "../types/task";
import { addLocalDays, toLocalDateKey } from "./taskQueries";

function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dateDifferenceInDays(fromDate: string, toDate: string) {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);
}

function monthDifference(fromDate: string, toDate: string) {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

export function getRepeatSeriesId(task: TaskRecord) {
  return task.repeatSeriesId ?? task.id;
}

export function isRepeatDueOnDate(task: TaskRecord, date: string) {
  if (!task.repeatRule || !task.dueDate || dateDifferenceInDays(task.dueDate, date) < 0) return false;
  const target = parseLocalDate(date);
  if (task.repeatRule.type === "daily") return dateDifferenceInDays(task.dueDate, date) % task.repeatRule.interval === 0;
  if (task.repeatRule.type === "weekdays") return ![0, 6].includes(target.getDay());
  if (task.repeatRule.type === "monthly") {
    const monthOffset = monthDifference(task.dueDate, date);
    return monthOffset % task.repeatRule.interval === 0
      && target.getDate() === Math.min(task.repeatRule.day, daysInMonth(target.getFullYear(), target.getMonth()));
  }

  const base = parseLocalDate(task.dueDate);
  const baseWeekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
  const targetWeekStart = new Date(target.getFullYear(), target.getMonth(), target.getDate() - target.getDay());
  const weekOffset = Math.round((Date.UTC(targetWeekStart.getFullYear(), targetWeekStart.getMonth(), targetWeekStart.getDate()) - Date.UTC(baseWeekStart.getFullYear(), baseWeekStart.getMonth(), baseWeekStart.getDate())) / 604_800_000);
  return weekOffset % task.repeatRule.interval === 0 && task.repeatRule.weekdays.includes(target.getDay());
}

export function getNextDueDate(dueDate: string, rule: RepeatRule) {
  if (rule.type === "daily") return addLocalDays(dueDate, rule.interval);

  if (rule.type === "weekdays") {
    let candidate = addLocalDays(dueDate, 1);
    while ([0, 6].includes(parseLocalDate(candidate).getDay())) candidate = addLocalDays(candidate, 1);
    return candidate;
  }

  if (rule.type === "monthly") {
    const current = parseLocalDate(dueDate);
    const firstOfTarget = new Date(current.getFullYear(), current.getMonth() + rule.interval, 1);
    const day = Math.min(rule.day, daysInMonth(firstOfTarget.getFullYear(), firstOfTarget.getMonth()));
    return toLocalDateKey(new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), day));
  }

  const base = parseLocalDate(dueDate);
  const baseWeekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
  for (let offset = 1; offset <= 7 * rule.interval * 2; offset += 1) {
    const candidateKey = addLocalDays(dueDate, offset);
    const candidate = parseLocalDate(candidateKey);
    const weekOffset = Math.floor((Date.UTC(candidate.getFullYear(), candidate.getMonth(), candidate.getDate()) - Date.UTC(baseWeekStart.getFullYear(), baseWeekStart.getMonth(), baseWeekStart.getDate())) / 604_800_000);
    if (weekOffset % rule.interval === 0 && rule.weekdays.includes(candidate.getDay())) return candidateKey;
  }
  return addLocalDays(dueDate, 7 * rule.interval);
}

export function createRepeatedTaskForDate(task: TaskRecord, dueDate: string, id: string, now: number): TaskRecord | null {
  if (!task.repeatRule || !task.dueDate || !isRepeatDueOnDate(task, dueDate)) return null;
  let reminderAt = task.reminderAt;
  if (reminderAt !== null) {
    const currentDue = parseLocalDate(task.dueDate);
    const nextDue = parseLocalDate(dueDate);
    const dayDifference = Math.round((Date.UTC(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate()) - Date.UTC(currentDue.getFullYear(), currentDue.getMonth(), currentDue.getDate())) / 86_400_000);
    const shiftedReminder = new Date(reminderAt);
    shiftedReminder.setDate(shiftedReminder.getDate() + dayDifference);
    reminderAt = shiftedReminder.getTime();
  }
  return {
    ...task,
    id,
    status: "open",
    dueDate,
    reminderAt,
    repeatSeriesId: task.repeatSeriesId ?? task.id,
    order: task.order + .001,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function createNextRepeatedTask(task: TaskRecord, id: string, now: number): TaskRecord | null {
  if (!task.repeatRule || !task.dueDate) return null;
  return createRepeatedTaskForDate(task, getNextDueDate(task.dueDate, task.repeatRule), id, now);
}

export function createTodayRepeatedTasks(tasks: TaskRecord[], today: string, createId: () => string, now: number) {
  const tasksBySeries = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    if (!task.repeatRule && task.repeatSeriesId === null) continue;
    const seriesId = getRepeatSeriesId(task);
    tasksBySeries.set(seriesId, [...(tasksBySeries.get(seriesId) ?? []), task]);
  }

  const generated: TaskRecord[] = [];
  for (const seriesTasks of tasksBySeries.values()) {
    const seriesId = getRepeatSeriesId(seriesTasks[0]);
    const root = seriesTasks.find((task) => task.id === seriesId) ?? seriesTasks.find((task) => task.repeatSeriesId === null);
    if (!root || root.status === "archived" || !root.repeatRule || !root.dueDate || root.repeatSkipDates?.includes(today)) continue;
    if (seriesTasks.some((task) => task.dueDate === today)) continue;
    const source = [...seriesTasks]
      .filter((task) => task.dueDate !== null && task.dueDate <= today && task.status !== "archived")
      .sort((left, right) => (right.dueDate ?? "").localeCompare(left.dueDate ?? "") || right.updatedAt - left.updatedAt)[0] ?? root;
    const occurrence = createRepeatedTaskForDate({ ...source, repeatRule: root.repeatRule }, today, createId(), now);
    if (occurrence) generated.push(occurrence);
  }
  return generated;
}
