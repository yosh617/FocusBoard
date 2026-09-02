import type { PauseInterval, TimerMode, TimerProgram } from "./timer";

export type FocusSessionRecord = {
  version: 2;
  id: string;
  taskId: string | null;
  taskTitleSnapshot: string | null;
  projectIdSnapshot: string | null;
  projectNameSnapshot: string | null;
  program: TimerProgram;
  mode: TimerMode;
  result: "completed" | "cancelled";
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
  focusedDurationMs: number;
  pauseIntervals: PauseInterval[];
};
