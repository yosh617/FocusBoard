import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { TaskRecord } from "../../types/task";
import { toLocalDateKey } from "../../utils/taskQueries";
import { ProductivityReport } from "./ProductivityReport";

const now = new Date(2026, 6, 18, 12);
const endedAt = new Date(2026, 6, 18, 11).getTime();
const task: TaskRecord = {
  version: 1, id: "task-1", title: "数学", status: "open", bucket: "inbox", projectId: "project-1",
  parentTaskId: null, note: "", dueDate: toLocalDateKey(now), reminderAt: null, repeatRule: null,
  repeatSeriesId: null, estimatedPomodoros: 2, order: 0, createdAt: 1, updatedAt: 1, completedAt: null
};
const session: FocusSessionRecord = {
  version: 1, id: "session-1", taskId: task.id, taskTitleSnapshot: task.title,
  projectIdSnapshot: "project-1", projectNameSnapshot: "勉強", program: "pomodoro", mode: "work",
  result: "completed", startedAt: endedAt - 25 * 60_000, endedAt,
  plannedDurationMs: 25 * 60_000, focusedDurationMs: 25 * 60_000
};

describe("ProductivityReport", () => {
  it("provides text values for summary, chart, breakdown, and history", () => {
    render(<ProductivityReport tasks={[task]} sessions={[session]} workMinutes={25} now={now} />);
    expect(screen.getAllByText("50分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("勉強").length).toBeGreaterThan(0);
    expect(screen.getAllByText("数学").length).toBeGreaterThan(0);
    expect(screen.getAllByText("完了").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "日" }));
    expect(screen.getByRole("button", { name: "日" }).getAttribute("aria-pressed")).toBe("true");
  });
});
