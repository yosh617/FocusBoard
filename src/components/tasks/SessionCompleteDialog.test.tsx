import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionCompleteDialog } from "./SessionCompleteDialog";

describe("SessionCompleteDialog", () => {
  it("offers the next focus actions without completing the task automatically", () => {
    const onStartBreak = vi.fn();
    const onStartNextTask = vi.fn();
    const onContinueTask = vi.fn();
    const onCompleteTask = vi.fn();
    render(<SessionCompleteDialog open taskTitle="英文法の問題集" focusedDurationLabel="25:00" nextModeLabel="短い休憩" remainingTodayCount={2} nextTaskTitle="長文読解" nextTaskDetail="英語 ・ 今日 ・ 目安 2セット" onStartBreak={onStartBreak} onStartNextTask={onStartNextTask} onContinueTask={onContinueTask} onCompleteTask={onCompleteTask} onOpenTaskList={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "集中セッション完了" }).textContent).toContain("英文法の問題集");
    expect(screen.getByLabelText("完了した集中の概要").textContent).toContain("25:00");
    expect(screen.getByLabelText("完了した集中の概要").textContent).toContain("短い休憩");
    expect(screen.getByLabelText("完了した集中の概要").textContent).toContain("2件");
    expect(screen.getByRole("button", { name: "長文読解を開始" }).textContent).toContain("長文読解");
    fireEvent.click(screen.getByRole("button", { name: "休憩を開始" }));
    fireEvent.click(screen.getByRole("button", { name: "長文読解を開始" }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);
    expect(onStartNextTask).toHaveBeenCalledTimes(1);
    expect(onCompleteTask).not.toHaveBeenCalled();
  });

  it("lets the user explicitly complete, continue, or open the task list", () => {
    const onContinueTask = vi.fn();
    const onCompleteTask = vi.fn();
    const onOpenTaskList = vi.fn();
    render(<SessionCompleteDialog open taskTitle="数学" focusedDurationLabel="50:00" nextModeLabel="長い休憩" remainingTodayCount={0} nextTaskTitle={null} nextTaskDetail={null} onStartBreak={vi.fn()} onStartNextTask={vi.fn()} onContinueTask={onContinueTask} onCompleteTask={onCompleteTask} onOpenTaskList={onOpenTaskList} onClose={vi.fn()} />);
    expect(document.querySelector<HTMLDetailsElement>(".session-complete__more")?.open).toBe(false);
    fireEvent.click(screen.getByText("ほかの操作"));
    expect(document.querySelector<HTMLDetailsElement>(".session-complete__more")?.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "同じタスクを続ける" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを完了" }));
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧を開く" }));
    expect(onContinueTask).toHaveBeenCalledTimes(1);
    expect(onCompleteTask).toHaveBeenCalledTimes(1);
    expect(onOpenTaskList).toHaveBeenCalledTimes(1);
  });
});
