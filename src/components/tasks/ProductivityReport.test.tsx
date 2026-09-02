import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  version: 2, id: "session-1", taskId: completedTask.id, taskTitleSnapshot: completedTask.title,
  projectIdSnapshot: "project-1", projectNameSnapshot: "勉強", program: "pomodoro", mode: "work",
  result: "completed", startedAt: endedAt - 25 * 60_000, endedAt,
  plannedDurationMs: 25 * 60_000, focusedDurationMs: 25 * 60_000, pauseIntervals: []
};
const previousDaySession: FocusSessionRecord = {
  ...todaySession,
  id: "session-2",
  startedAt: new Date(2026, 6, 17, 10, 0).getTime(),
  endedAt: new Date(2026, 6, 17, 10, 25).getTime()
};

describe("ProductivityReport", () => {
  it("shows one flat summary followed by trend, project, task, and history sections", () => {
    render(<ProductivityReport tasks={[completedTask]} sessions={[todaySession, previousDaySession]} workMinutes={25} now={now} onUpdateSession={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getAllByText("50分").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25分").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "勉強時間" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "実施時間帯" })).toBeTruthy();
    expect(screen.getByLabelText("直近1年の勉強時間ヒートマップ").querySelectorAll("[role=\"img\"]")).toHaveLength(371);
    expect(screen.getByRole("img", { name: /2026年7月18日 25分/ })).toBeTruthy();
    expect(screen.getAllByText("集中時間").length).toBeGreaterThan(0);
    expect(screen.getByText("完了セッション")).toBeTruthy();
    expect(screen.getByText("中断")).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "今日のタスク進捗 100%" })).toBeTruthy();
    expect(screen.getAllByText("勉強").length).toBeGreaterThan(0);
    expect(screen.getAllByText("数学").length).toBeGreaterThan(0);
    expect(screen.getAllByText("完了").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "日" }));
    expect(screen.getByRole("button", { name: "日" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows empty-state guidance when there is no task progress yet", () => {
    render(<ProductivityReport tasks={[]} sessions={[]} workMinutes={25} now={now} onUpdateSession={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByText("今日のタスク")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("この期間の集中記録はまだありません。")).toBeTruthy();
  });

  it("keeps zero-minute interrupted sessions available for editing", () => {
    const interruptedSession: FocusSessionRecord = {
      ...todaySession,
      id: "session-interrupted",
      result: "cancelled",
      focusedDurationMs: 0
    };
    render(<ProductivityReport tasks={[]} sessions={[interruptedSession]} workMinutes={25} now={now} onUpdateSession={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByRole("button", { name: "集中記録を編集：数学 7/18 11:00" })).toBeTruthy();
  });

  it("moves to previous periods and edits a selected session", async () => {
    const onUpdateSession = vi.fn().mockResolvedValue(true);
    render(<ProductivityReport tasks={[completedTask]} sessions={[todaySession, previousDaySession]} workMinutes={25} now={now} onUpdateSession={onUpdateSession} />);

    fireEvent.click(screen.getByRole("button", { name: "集中記録を編集：数学 7/18 11:00" }));
    fireEvent.change(screen.getByLabelText("勉強時間（分）"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "記録を保存" }));
    await waitFor(() => expect(onUpdateSession).toHaveBeenCalledWith("session-1", expect.objectContaining({
      startedAt: endedAt - 30 * 60_000,
      endedAt,
      focusedDurationMs: 30 * 60_000,
      result: "completed"
    })));

    const navigation = screen.getByLabelText("レポート期間の移動");
    const currentPeriod = navigation.textContent;
    fireEvent.click(screen.getByRole("button", { name: "前の週" }));
    expect(navigation.textContent).not.toBe(currentPeriod);
    expect((screen.getByRole("button", { name: "次の週" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "現在" }));
    expect((screen.getByRole("button", { name: "次の週" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "日" }));
    expect(screen.getByRole("button", { name: "前の日" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(screen.getByRole("button", { name: "前の月" })).toBeTruthy();
  });
});
