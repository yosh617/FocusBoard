import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionCompleteDialog } from "./SessionCompleteDialog";

describe("SessionCompleteDialog", () => {
  it("offers the next focus actions without completing the task automatically", () => {
    const onStartBreak = vi.fn();
    const onContinueTask = vi.fn();
    const onCompleteTask = vi.fn();
    render(<SessionCompleteDialog open taskTitle="英文法の問題集" focusedDurationLabel="25:00" nextModeLabel="短い休憩" onStartBreak={onStartBreak} onContinueTask={onContinueTask} onCompleteTask={onCompleteTask} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "集中セッション完了" }).textContent).toContain("英文法の問題集");
    expect(screen.getByLabelText("完了した集中の概要").textContent).toContain("25:00");
    expect(screen.getByLabelText("完了した集中の概要").textContent).toContain("短い休憩");
    fireEvent.click(screen.getByRole("button", { name: "休憩を開始" }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);
    expect(onCompleteTask).not.toHaveBeenCalled();
  });

  it("lets the user explicitly complete or continue the task", () => {
    const onContinueTask = vi.fn();
    const onCompleteTask = vi.fn();
    render(<SessionCompleteDialog open taskTitle="数学" focusedDurationLabel="50:00" nextModeLabel="長い休憩" onStartBreak={vi.fn()} onContinueTask={onContinueTask} onCompleteTask={onCompleteTask} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "同じタスクを続ける" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを完了" }));
    expect(onContinueTask).toHaveBeenCalledTimes(1);
    expect(onCompleteTask).toHaveBeenCalledTimes(1);
  });
});
