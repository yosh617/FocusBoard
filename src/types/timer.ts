export type TimerMode = "work" | "shortBreak" | "longBreak";
export type TimerStatus = "idle" | "running" | "paused" | "completed";

export type TimerState = {
  version: 1;
  mode: TimerMode;
  status: TimerStatus;
  remainingMs: number;
  endAt: number | null;
  completedWorkSessions: number;
};
