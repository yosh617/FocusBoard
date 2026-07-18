import type { RepeatRule, TaskRecord } from "../types/task";
import { addLocalDays, toLocalDateKey } from "./taskQueries";

function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
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

export function createNextRepeatedTask(task: TaskRecord, id: string, now: number): TaskRecord | null {
  if (!task.repeatRule || !task.dueDate) return null;
  const nextDueDate = getNextDueDate(task.dueDate, task.repeatRule);
  let reminderAt = task.reminderAt;
  if (reminderAt !== null) {
    const currentDue = parseLocalDate(task.dueDate);
    const nextDue = parseLocalDate(nextDueDate);
    const dayDifference = Math.round((Date.UTC(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate()) - Date.UTC(currentDue.getFullYear(), currentDue.getMonth(), currentDue.getDate())) / 86_400_000);
    const shiftedReminder = new Date(reminderAt);
    shiftedReminder.setDate(shiftedReminder.getDate() + dayDifference);
    reminderAt = shiftedReminder.getTime();
  }
  return {
    ...task,
    id,
    status: "open",
    dueDate: nextDueDate,
    reminderAt,
    repeatSeriesId: task.repeatSeriesId ?? task.id,
    order: task.order + .001,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}
