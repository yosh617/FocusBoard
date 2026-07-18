import type { FocusSessionRecord } from "../types/focusSession";
import type { TaskRecord } from "../types/task";
import { toLocalDateKey } from "./taskQueries";

export type ReportPeriod = "day" | "week" | "month";

export type ReportBreakdown = {
  key: string;
  label: string;
  focusedMs: number;
  ratio: number;
};

export type ReportTaskComparison = {
  id: string;
  title: string;
  estimatedMinutes: number;
  focusedMs: number;
};

export type ProductivityReport = {
  period: ReportPeriod;
  periodLabel: string;
  startAt: number;
  endAt: number;
  focusedMs: number;
  completedSessions: number;
  cancelledSessions: number;
  todayEstimatedMinutes: number;
  todayRemainingTasks: number;
  todayCompletedTasks: number;
  projectBreakdown: ReportBreakdown[];
  taskComparisons: ReportTaskComparison[];
  dailyFocus: { date: string; focusedMs: number }[];
  history: FocusSessionRecord[];
};

export function getLocalPeriodRange(period: ReportPeriod, now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (period === "month") {
    start.setDate(1);
  }
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  if (period === "week") end.setDate(end.getDate() + 7);
  if (period === "month") end.setMonth(end.getMonth() + 1);
  const periodLabel = period === "day"
    ? start.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })
    : `${start.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}〜${new Date(end.getTime() - 1).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}`;
  return { startAt: start.getTime(), endAt: end.getTime(), periodLabel };
}

export function createProductivityReport(
  tasks: TaskRecord[],
  sessions: FocusSessionRecord[],
  period: ReportPeriod,
  now = new Date(),
  workMinutes = 25
): ProductivityReport {
  const { startAt, endAt, periodLabel } = getLocalPeriodRange(period, now);
  const todayRange = getLocalPeriodRange("day", now);
  const todayKey = toLocalDateKey(now);
  const periodSessions = sessions
    .filter((session) => session.mode === "work" && session.endedAt >= startAt && session.endedAt < endAt)
    .sort((a, b) => b.endedAt - a.endedAt || b.startedAt - a.startedAt);
  const focusedMs = periodSessions.reduce((sum, session) => sum + session.focusedDurationMs, 0);
  const todayTasks = tasks.filter((task) => task.parentTaskId === null && task.status !== "archived" && (
    (task.status === "open" && task.dueDate !== null && task.dueDate <= todayKey)
    || (task.status === "completed" && task.completedAt !== null && task.completedAt >= todayRange.startAt && task.completedAt < todayRange.endAt)
  ));

  const projectTotals = new Map<string, { label: string; focusedMs: number }>();
  const taskTotals = new Map<string, { title: string; focusedMs: number }>();
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const dailyTotals = new Map<string, number>();
  for (const session of periodSessions) {
    const projectKey = session.projectIdSnapshot ?? "unassigned";
    const project = projectTotals.get(projectKey) ?? { label: session.projectNameSnapshot ?? "プロジェクトなし", focusedMs: 0 };
    project.focusedMs += session.focusedDurationMs;
    projectTotals.set(projectKey, project);
    const taskKey = session.taskId ?? `session:${session.id}`;
    const task = taskTotals.get(taskKey) ?? { title: session.taskTitleSnapshot ?? "タスクなし", focusedMs: 0 };
    task.focusedMs += session.focusedDurationMs;
    taskTotals.set(taskKey, task);
    const dateKey = toLocalDateKey(new Date(session.endedAt));
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + session.focusedDurationMs);
  }

  const dailyFocus: { date: string; focusedMs: number }[] = [];
  const day = new Date(startAt);
  while (day.getTime() < endAt) {
    const date = toLocalDateKey(day);
    dailyFocus.push({ date, focusedMs: dailyTotals.get(date) ?? 0 });
    day.setDate(day.getDate() + 1);
  }

  return {
    period,
    periodLabel,
    startAt,
    endAt,
    focusedMs,
    completedSessions: periodSessions.filter((session) => session.result === "completed").length,
    cancelledSessions: periodSessions.filter((session) => session.result === "cancelled").length,
    todayEstimatedMinutes: todayTasks.reduce((sum, task) => sum + task.estimatedPomodoros * workMinutes, 0),
    todayRemainingTasks: todayTasks.filter((task) => task.status === "open").length,
    todayCompletedTasks: todayTasks.filter((task) => task.status === "completed").length,
    projectBreakdown: [...projectTotals.entries()]
      .map(([key, value]) => ({ key, ...value, ratio: focusedMs > 0 ? value.focusedMs / focusedMs : 0 }))
      .sort((a, b) => b.focusedMs - a.focusedMs || a.label.localeCompare(b.label, "ja")),
    taskComparisons: [...taskTotals.entries()]
      .map(([id, value]) => ({
        id,
        title: value.title,
        focusedMs: value.focusedMs,
        estimatedMinutes: tasksById.get(id)?.estimatedPomodoros
          ? (tasksById.get(id)?.estimatedPomodoros ?? 0) * workMinutes
          : 0
      }))
      .sort((a, b) => b.focusedMs - a.focusedMs || a.title.localeCompare(b.title, "ja")),
    dailyFocus,
    history: periodSessions
  };
}

export function formatFocusedTime(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}
