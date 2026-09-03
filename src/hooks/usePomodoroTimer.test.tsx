import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../types/settings";
import type { Orientation } from "../types/settings";
import { TIMER_KEY } from "../utils/storage";
import { getCountupLap } from "../utils/time";
import { usePomodoroTimer } from "./usePomodoroTimer";

describe("usePomodoroTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T05:00:00Z"));
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it("uses endAt to restore elapsed time and selects a long break after four work sessions", async () => {
    localStorage.setItem(TIMER_KEY, JSON.stringify({
      version: 1,
      mode: "work",
      status: "running",
      remainingMs: 1_000,
      endAt: Date.now() + 1_000,
      completedWorkSessions: 3
    }));
    const settings = { ...defaultSettings, soundEnabled: false };
    const { result } = renderHook(() => usePomodoroTimer(settings));

    await act(async () => { await vi.advanceTimersByTimeAsync(1_250); });

    expect(result.current.timer.mode).toBe("longBreak");
    expect(result.current.timer.status).toBe("paused");
    expect(result.current.timer.completedWorkSessions).toBe(4);
    expect(result.current.announcement).toContain("長い休憩");
  });

  it("freezes remaining time when paused", () => {
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }));
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(5_000); result.current.pause(); });
    const paused = result.current.timer.remainingMs;
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.timer.remainingMs).toBe(paused);
    expect(result.current.timer.status).toBe("paused");
  });

  it("deletes persisted state without immediately writing it back", () => {
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }));
    expect(localStorage.getItem(TIMER_KEY)).not.toBeNull();
    act(() => result.current.clearTimer());
    expect(localStorage.getItem(TIMER_KEY)).toBeNull();
    expect(result.current.timer.status).toBe("idle");
  });

  it("keeps counting up and starts a new progress lap after its configured duration", async () => {
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }));
    act(() => {
      result.current.selectProgram("countup");
      result.current.selectCategory("break");
      result.current.setCustomDurationMinutes(1);
    });
    act(() => result.current.start());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_250); });
    expect(result.current.timer.program).toBe("countup");
    expect(result.current.timer.category).toBe("break");
    expect(result.current.timer.status).toBe("running");
    expect(result.current.timer.remainingMs).toBeGreaterThanOrEqual(60_000);
    expect(getCountupLap(result.current.timer.remainingMs, result.current.timer.durationMs)).toBe(2);
    expect(result.current.announcement).toBe("");
  });

  it("persists a normalized floating position", () => {
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }));
    act(() => result.current.setFloatingPosition({ x: 0.2, y: 0.7 }));
    expect(result.current.timer.floatingPosition).toEqual({ x: 0.2, y: 0.7 });
  });

  it("restores a different floating position for each orientation", () => {
    const { result, rerender } = renderHook(({ orientation }: { orientation: Orientation }) => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, orientation), { initialProps: { orientation: "portrait" as Orientation } });
    act(() => result.current.setFloatingPosition({ x: 0.2, y: 0.7 }));
    rerender({ orientation: "landscape" });
    expect(result.current.timer.floatingPosition).toEqual({ x: 0.18, y: 0.38 });
    act(() => result.current.setFloatingPosition({ x: 0.8, y: 0.25 }));
    rerender({ orientation: "portrait" });
    expect(result.current.timer.floatingPosition).toEqual({ x: 0.2, y: 0.7 });
  });

  it("emits a completed task session when a pomodoro finishes", async () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, onSessionEnd));

    act(() => result.current.start("task-1"));
    await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

    expect(result.current.timer.mode).toBe("shortBreak");
    expect(result.current.timer.status).toBe("paused");
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      mode: "work",
      result: "completed",
      plannedDurationMs: 25 * 60_000,
      focusedDurationMs: 25 * 60_000
    }));
  });

  it("keeps a pomodoro in overtime until the user ends it when configured", async () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, workMinutes: 1, soundEnabled: false, pomodoroEndBehavior: "overtime" }, onSessionEnd));

    act(() => result.current.start("task-1"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_250); });

    expect(result.current.timer.mode).toBe("work");
    expect(result.current.timer.status).toBe("overtime");
    expect(onSessionEnd).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", result: "completed" }));

    act(() => result.current.end());
    expect(result.current.timer.status).toBe("idle");
  });

  it("sends a system notification when a pomodoro finishes", async () => {
    const NotificationMock = vi.fn();
    Object.defineProperty(globalThis, "Notification", { configurable: true, value: NotificationMock });
    Object.defineProperty(NotificationMock, "permission", { configurable: true, value: "granted" });
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, workMinutes: 1, soundEnabled: false }));

    act(() => result.current.start());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_250); });

    expect(NotificationMock).toHaveBeenCalledWith("FocusBoard", expect.objectContaining({ body: expect.stringContaining("終了しました") }));
  });

  it("sends timer notifications only while the document is hidden when configured", async () => {
    const NotificationMock = vi.fn();
    Object.defineProperty(globalThis, "Notification", { configurable: true, value: NotificationMock });
    Object.defineProperty(NotificationMock, "permission", { configurable: true, value: "granted" });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, workMinutes: 1, soundEnabled: false, timerNotificationBehavior: "background" }));

    act(() => result.current.start());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_250); });

    expect(NotificationMock).toHaveBeenCalledTimes(1);
  });

  it("emits a cancelled session when an active task timer is reset", () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, onSessionEnd));

    act(() => result.current.start("task-1"));
    act(() => { vi.advanceTimersByTime(5_000); });
    act(() => result.current.reset());

    expect(result.current.timer.status).toBe("idle");
    expect(result.current.timer.activeTaskId).toBeNull();
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    const event = onSessionEnd.mock.calls[0][0];
    expect(event.taskId).toBe("task-1");
    expect(event.result).toBe("cancelled");
    expect(event.focusedDurationMs).toBeGreaterThanOrEqual(5_000);
    expect(event.focusedDurationMs).toBeLessThan(6_000);
  });

  it("records the elapsed time when an active task timer is ended", () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, onSessionEnd));

    act(() => result.current.start("task-1"));
    act(() => { vi.advanceTimersByTime(5_000); });
    act(() => result.current.end());

    expect(result.current.timer.status).toBe("idle");
    expect(result.current.timer.activeTaskId).toBeNull();
    expect(result.current.announcement).toBe("集中時間を記録して終了しました。");
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd.mock.calls[0][0]).toEqual(expect.objectContaining({
      taskId: "task-1",
      result: "cancelled",
      focusedDurationMs: expect.any(Number)
    }));
  });

  it("records each pause interval and excludes it from focused time", () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, onSessionEnd));

    act(() => result.current.start("task-1"));
    act(() => { vi.advanceTimersByTime(5_000); result.current.pause(); });
    act(() => { vi.advanceTimersByTime(10_000); result.current.start(); });
    act(() => { vi.advanceTimersByTime(5_000); result.current.end(); });

    const event = onSessionEnd.mock.calls[0][0];
    expect(event.pauseIntervals).toHaveLength(1);
    expect(event.pauseIntervals[0].endedAt - event.pauseIntervals[0].startedAt).toBe(10_000);
    expect(event.focusedDurationMs).toBeGreaterThanOrEqual(9_000);
    expect(event.focusedDurationMs).toBeLessThan(11_000);
  });

  it("records real elapsed time for a countup session", () => {
    const onSessionEnd = vi.fn();
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }, onSessionEnd));

    act(() => {
      result.current.selectProgram("countup");
      result.current.start("task-1");
    });
    act(() => { vi.advanceTimersByTime(5_000); result.current.end(); });

    expect(onSessionEnd.mock.calls[0][0].focusedDurationMs).toBeGreaterThanOrEqual(5_000);
    expect(onSessionEnd.mock.calls[0][0].focusedDurationMs).toBeLessThan(6_000);
  });
});
