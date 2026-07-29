import type { OrientationPositions } from "./settings";

export type TimerMode = "work" | "shortBreak" | "longBreak";
export type TimerStatus = "idle" | "running" | "paused" | "completed" | "overtime";
export type TimerProgram = "pomodoro" | "countdown" | "countup";
export type SessionCategory = "focus" | "break";

export type FloatingPosition = {
  x: number;
  y: number;
};

export type TimerState = {
  version: 5;
  program: TimerProgram;
  mode: TimerMode;
  category: SessionCategory;
  status: TimerStatus;
  durationMs: number;
  customDurationMs: number;
  remainingMs: number;
  endAt: number | null;
  completedWorkSessions: number;
  floatingPosition: FloatingPosition;
  floatingPositions: OrientationPositions;
  activeTaskId: string | null;
  activeSessionId: string | null;
  sessionStartedAt: number | null;
};

export type TimerSessionEvent = {
  id: string;
  taskId: string | null;
  program: TimerProgram;
  mode: TimerMode;
  result: "completed" | "cancelled";
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
  focusedDurationMs: number;
};
