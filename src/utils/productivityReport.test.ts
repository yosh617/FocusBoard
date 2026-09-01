import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../types/focusSession";
import type { TaskRecord } from "../types/task";
import { createFocusHeatmap, createProductivityReport, getLocalPeriodRange } from "./productivityReport";

const task: TaskRecord = {
  version: 1, id: "task-1", title: "数学", status: "open", bucket: "inbox", projectId: "project-1",
  parentTaskId: null, note: "", dueDate: "2026-07-18", reminderAt: null, repeatRule: null,
  repeatSeriesId: null, estimatedPomodoros: 2, order: 0, createdAt: 1, updatedAt: 1, completedAt: null
};

function session(id: string, endedAt: number, focusedDurationMs: number, result: FocusSessionRecord["result"] = "completed"): FocusSessionRecord {
  return {
    version: 1, id, taskId: task.id, taskTitleSnapshot: task.title, projectIdSnapshot: "project-1",
    projectNameSnapshot: "勉強", program: "pomodoro", mode: "work", result,
    startedAt: endedAt - focusedDurationMs, endedAt, plannedDurationMs: 25 * 60_000, focusedDurationMs
  };
}

describe("productivityReport", () => {
  it("moves the selected day, week, and month ranges backward", () => {
    const now = new Date(2026, 6, 18, 12);
    const previousDay = getLocalPeriodRange("day", now, -1);
    const previousWeek = getLocalPeriodRange("week", now, -1);
    const previousMonth = getLocalPeriodRange("month", now, -1);

    expect(new Date(previousDay.startAt).toLocaleDateString("ja-JP")).toBe("2026/7/17");
    expect(new Date(previousWeek.startAt).toLocaleDateString("ja-JP")).toBe("2026/7/6");
    expect(new Date(previousMonth.startAt).toLocaleDateString("ja-JP")).toBe("2026/6/1");
  });

  it("aggregates the same local-day records deterministically", () => {
    const now = new Date(2026, 6, 18, 12);
    const { startAt, endAt } = getLocalPeriodRange("day", now);
    const report = createProductivityReport(
      [task],
      [session("before", startAt - 1, 60_000), session("first", startAt, 10 * 60_000), session("last", endAt - 1, 5 * 60_000, "cancelled"), session("after", endAt, 60_000)],
      "day",
      now,
      25
    );
    expect(report.focusedMs).toBe(15 * 60_000);
    expect(report.completedSessions).toBe(1);
    expect(report.cancelledSessions).toBe(1);
    expect(report.todayEstimatedMinutes).toBe(50);
    expect(report.todayRemainingTasks).toBe(1);
    expect(report.projectBreakdown[0]).toMatchObject({ label: "勉強", focusedMs: 15 * 60_000, ratio: 1 });
  });

  it("uses local calendar boundaries for week and month ranges", () => {
    const now = new Date(2026, 7, 1, 0, 30);
    const week = getLocalPeriodRange("week", now);
    const month = getLocalPeriodRange("month", now);
    expect(new Date(week.startAt).getDay()).toBe(1);
    expect(new Date(week.endAt).getTime() - new Date(week.startAt).getTime()).toBeGreaterThanOrEqual(6 * 24 * 60 * 60_000);
    expect(new Date(month.startAt).getDate()).toBe(1);
    expect(new Date(month.endAt).getMonth()).toBe(8);
  });

  it("builds a 53-week heatmap from work sessions in the local calendar", () => {
    const now = new Date(2026, 6, 15, 12);
    const heatmap = createFocusHeatmap([
      session("recent", new Date(2026, 6, 14, 10).getTime(), 25 * 60_000),
      session("future", new Date(2026, 6, 16, 10).getTime(), 25 * 60_000),
      { ...session("break", new Date(2026, 6, 14, 11).getTime(), 25 * 60_000), mode: "shortBreak" },
      session("outside", new Date(2025, 6, 12, 10).getTime(), 25 * 60_000)
    ], now);
    const days = heatmap.weeks.flat();

    expect(days).toHaveLength(371);
    expect(heatmap.totalFocusedMs).toBe(25 * 60_000);
    expect(days.find((day) => day.date === "2026-07-14")).toMatchObject({ focusedMs: 25 * 60_000, level: 1, isFuture: false });
    expect(days.find((day) => day.date === "2026-07-16")).toMatchObject({ focusedMs: 0, level: 0, isFuture: true });
  });
});
