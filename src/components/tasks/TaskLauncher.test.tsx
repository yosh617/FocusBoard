import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskLauncher } from "./TaskLauncher";

describe("TaskLauncher", () => {
  afterEach(() => vi.useRealTimers());

  it("dims after inactivity and becomes clear again on interaction", () => {
    vi.useFakeTimers();
    render(<TaskLauncher todayCount={3} todaySummary={{ completedCount: 1, totalCount: 4, focusedLabel: "25分", overdueCount: 0 }} activeTaskTitle={null} suggestedTask={null} timerSummary={null} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "タスクを開く。今日の未完了は3件" });

    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(button.classList.contains("task-launcher--dimmed")).toBe(true);

    fireEvent.pointerDown(window);
    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
  });

  it("shows at most two upcoming tasks with a compact daily summary", () => {
    render(
      <TaskLauncher
        todayCount={3}
        todaySummary={{ completedCount: 1, totalCount: 4, focusedLabel: "25分", overdueCount: 1 }}
        todayTasks={[
          { id: "task-1", title: "英単語の復習", meta: "期限切れ" },
          { id: "task-2", title: "数学の宿題", meta: "学校" },
          { id: "task-3", title: "読書", meta: "今日" }
        ]}
        activeTaskTitle={null}
        suggestedTask={null}
        timerSummary={null}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText("英単語の復習")).toBeTruthy();
    expect(screen.getByText("数学の宿題")).toBeTruthy();
    expect(screen.queryByText("読書")).toBeNull();
    expect(screen.getByText("1/4")).toBeTruthy();
    expect(screen.getByText("25分")).toBeTruthy();
  });

  it("stays clear while a task is actively focused", () => {
    vi.useFakeTimers();
    render(<TaskLauncher todayCount={2} todaySummary={{ completedCount: 1, totalCount: 3, focusedLabel: "25分", overdueCount: 0 }} activeTaskTitle="英単語の復習" suggestedTask={null} timerSummary={null} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは英単語の復習。今日の未完了は2件" });

    act(() => { vi.advanceTimersByTime(8_000); });
    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
    expect(button.classList.contains("task-launcher--active")).toBe(true);
  });

  it("shows the next suggested task while idle", () => {
    render(
      <TaskLauncher
        todayCount={2}
        todaySummary={{ completedCount: 1, totalCount: 3, focusedLabel: "25分", overdueCount: 1 }}
        activeTaskTitle={null}
        suggestedTask={{ id: "task-1", title: "英単語の復習", detail: "勉強 · 今日の予定 · 未完了 2件" }}
        timerSummary={null}
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "タスクを開く。次のおすすめは英単語の復習。今日の未完了は2件" });
    expect(button.textContent).toContain("NEXT");
    expect(button.textContent).toContain("英単語の復習");
    expect(button.textContent).toContain("勉強 · 今日の予定 · 未完了 2件");
    expect(button.textContent).not.toContain("完了 1 / 3");
    expect(button.textContent).not.toContain("集中 25分");
  });

  it("shows a timer-aware summary while a focus session is in progress", () => {
    render(
      <TaskLauncher
        todayCount={1}
        todaySummary={{ completedCount: 1, totalCount: 2, focusedLabel: "25分", overdueCount: 0 }}
        activeTaskTitle="英単語の復習"
        suggestedTask={{ id: "task-2", title: "数学", detail: "勉強 · 今日の予定 · 未完了 1件" }}
        timerSummary={{ statusText: "FOCUS", title: "英単語の復習", detail: "集中 · FOCUS · 12:30" }}
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは英単語の復習。今日の未完了は1件" });
    expect(button.textContent).toContain("FOCUS");
    expect(button.textContent).toContain("12:30");
    expect(button.textContent).not.toContain("完了 1 / 2");
  });

  it("shows the next recommended task while a break is running", () => {
    render(
      <TaskLauncher
        todayCount={2}
        todaySummary={{ completedCount: 1, totalCount: 3, focusedLabel: "25分", overdueCount: 0 }}
        activeTaskTitle={null}
        suggestedTask={{ id: "task-2", title: "英語の宿題", detail: "勉強 · 今日の予定 · 未完了 2件" }}
        timerSummary={{
          statusText: "休憩中",
          title: "短い休憩",
          detail: "短い休憩 · 休憩中 · 05:00 · 次は 英語の宿題",
          accessibleLabel: "タスクを開く。短い休憩中。次のおすすめは英語の宿題。今日の未完了は2件"
        }}
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "タスクを開く。短い休憩中。次のおすすめは英語の宿題。今日の未完了は2件" });
    expect(button.textContent).toContain("短い休憩");
    expect(button.textContent).toContain("次は 英語の宿題");
    expect(button.textContent).not.toContain("集中 25分");
  });

  it("moves by pointer drag without opening the task workspace", () => {
    const onClick = vi.fn();
    const onPositionChange = vi.fn();
    render(<TaskLauncher todayCount={1} activeTaskTitle={null} suggestedTask={null} timerSummary={null} position={{ x: .5, y: .5 }} onPositionChange={onPositionChange} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "タスクを開く。今日の未完了は1件" });

    fireEvent(button, new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    fireEvent(button, new MouseEvent("pointermove", { bubbles: true, clientX: 160, clientY: 140 }));
    fireEvent(button, new MouseEvent("pointerup", { bubbles: true, clientX: 160, clientY: 140 }));
    fireEvent.click(button);

    expect(onPositionChange).toHaveBeenCalled();
    expect(onPositionChange.mock.calls.at(-1)?.[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(onPositionChange.mock.calls.at(-1)?.[0].x).toBeGreaterThan(.5);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("moves by arrow keys with a larger shift step", () => {
    const onPositionChange = vi.fn();
    render(<TaskLauncher todayCount={1} activeTaskTitle={null} suggestedTask={null} timerSummary={null} position={{ x: .5, y: .5 }} onPositionChange={onPositionChange} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "タスクを開く。今日の未完了は1件" });

    fireEvent.keyDown(button, { key: "ArrowLeft" });
    fireEvent.keyDown(button, { key: "ArrowDown", shiftKey: true });

    expect(onPositionChange).toHaveBeenNthCalledWith(1, { x: .485, y: .5 });
    expect(onPositionChange).toHaveBeenNthCalledWith(2, { x: .5, y: .55 });
  });
});
