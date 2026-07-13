import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../types/settings";
import { TIMER_KEY } from "../utils/storage";
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

  it("runs a separate break count-up timer toward its configured duration", async () => {
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
    expect(result.current.timer.status).toBe("completed");
    expect(result.current.timer.remainingMs).toBe(0);
    expect(result.current.announcement).toContain("休憩");
  });

  it("persists a normalized floating position", () => {
    const { result } = renderHook(() => usePomodoroTimer({ ...defaultSettings, soundEnabled: false }));
    act(() => result.current.setFloatingPosition({ x: 0.2, y: 0.7 }));
    expect(result.current.timer.floatingPosition).toEqual({ x: 0.2, y: 0.7 });
  });
});
