import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { toLocalDateKey } from "../../utils/taskQueries";
import { ProductivityReport } from "./ProductivityReport";

const now = new Date(2026, 6, 18, 12);
const endedAt = new Date(2026, 6, 18, 11).getTime();
const completedTask: TaskRecord = {
  version: 1, id: "task-1", title: "数学", status: "completed", bucket: "inbox", projectId: "project-1",
  parentTaskId: null, note: "", dueDate: toLocalDateKey(now), reminderAt: null, repeatRule: null,
  repeatSeriesId: null, estimatedPomodoros: 2, order: 0, createdAt: 1, updatedAt: 1, completedAt: endedAt
};
const todaySession: FocusSessionRecord = {
  version: 1, id: "session-1", taskId: completedTask.id, taskTitleSnapshot: completedTask.title,
  projectIdSnapshot: "project-1", projectNameSnapshot: "勉強", program: "pomodoro", mode: "work",
  result: "completed", startedAt: endedAt - 25 * 60_000, endedAt,
  plannedDurationMs: 25 * 60_000, focusedDurationMs: 25 * 60_000
};
const previousDaySession: FocusSessionRecord = {
  ...todaySession,
  id: "session-2",
  startedAt: new Date(2026, 6, 17, 10, 0).getTime(),
  endedAt: new Date(2026, 6, 17, 10, 25).getTime()
};

describe("ProductivityReport", () => {
  it("shows a flow-oriented overview with today progress, streak, and project focus", () => {
    render(<ProductivityReport tasks={[completedTask]} sessions={[todaySession, previousDaySession]} workMinutes={25} now={now} />);
    expect(screen.getAllByText("50分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25分").length).toBeGreaterThan(0);
    expect(screen.getByText("いまのペース")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("2日")).toBeTruthy();
    expect(screen.getByText("1 / 1件が完了")).toBeTruthy();
    expect(screen.getAllByText("勉強").length).toBeGreaterThan(0);
    expect(screen.getAllByText("数学").length).toBeGreaterThan(0);
    expect(screen.getAllByText("完了").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "日" }));
    expect(screen.getByRole("button", { name: "日" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows empty-state guidance when there is no task progress yet", () => {
    render(<ProductivityReport tasks={[]} sessions={[]} workMinutes={25} now={now} />);
    expect(screen.getByText("まだ今日のタスクはありません")).toBeTruthy();
    expect(screen.getByText("主なプロジェクト")).toBeTruthy();
    expect(screen.getByText("まだありません")).toBeTruthy();
  });
});
