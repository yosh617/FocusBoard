export type TimerMode = "work" | "shortBreak" | "longBreak";
export type TimerStatus = "idle" | "running" | "paused" | "completed";
export type TimerProgram = "pomodoro" | "countdown" | "countup";
export type SessionCategory = "focus" | "break";

export type FloatingPosition = {
  x: number;
  y: number;
};

export type TimerState = {
  version: 2;
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
};
