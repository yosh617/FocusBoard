import type { TimerMode, TimerProgram } from "./timer";

export type FocusSessionRecord = {
  version: 1;
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
};
