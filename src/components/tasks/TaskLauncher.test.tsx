import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskLauncher } from "./TaskLauncher";

describe("TaskLauncher", () => {
  afterEach(() => vi.useRealTimers());

  it("dims after inactivity and becomes clear again on interaction", () => {
    vi.useFakeTimers();
    render(<TaskLauncher todayCount={3} activeTaskTitle={null} timerSummary={null} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "タスクを開く。今日の未完了は3件" });

    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(button.classList.contains("task-launcher--dimmed")).toBe(true);

    fireEvent.pointerDown(window);
    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
  });

  it("stays clear while a task is actively focused", () => {
    vi.useFakeTimers();
    render(<TaskLauncher todayCount={2} activeTaskTitle="英単語の復習" timerSummary={null} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "タスクを開く。集中中のタスクは英単語の復習。今日の未完了は2件" });

    act(() => { vi.advanceTimersByTime(8_000); });
    expect(button.classList.contains("task-launcher--dimmed")).toBe(false);
    expect(button.classList.contains("task-launcher--active")).toBe(true);
  });

  it("shows a timer-aware summary while a focus session is in progress", () => {
    render(
      <TaskLauncher
        todayCount={1}
        activeTaskTitle="英単語の復習"
        timerSummary={{ statusText: "集中中", title: "英単語の復習", detail: "集中 · 集中中 · 12:30" }}
        onClick={vi.fn()}
      />
    );
    const button = screen.getByRole("button", { name: "タスクを開く。集中中のタスクは英単語の復習。今日の未完了は1件" });
    expect(button.textContent).toContain("集中中");
    expect(button.textContent).toContain("12:30");
  });
});
