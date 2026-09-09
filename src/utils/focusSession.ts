import type { PauseInterval } from "../types/timer";

export function calculateFocusedDurationMs(
  startedAt: number,
  endedAt: number,
  pauseIntervals: readonly PauseInterval[] = []
) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return 0;

  let pausedDurationMs = 0;
  let coveredUntil = startedAt;
  for (const interval of [...pauseIntervals].sort((left, right) => left.startedAt - right.startedAt)) {
    const pauseStartedAt = Math.max(startedAt, interval.startedAt);
    const pauseEndedAt = Math.min(endedAt, interval.endedAt);
    const effectiveStart = Math.max(coveredUntil, pauseStartedAt);
    if (pauseEndedAt <= effectiveStart) continue;
    pausedDurationMs += pauseEndedAt - effectiveStart;
    coveredUntil = Math.max(coveredUntil, pauseEndedAt);
  }

  return Math.max(0, endedAt - startedAt - pausedDurationMs);
}

export function getFocusedDurationMs(session: {
  startedAt: number;
  endedAt: number;
  pauseIntervals?: readonly PauseInterval[];
}) {
  return calculateFocusedDurationMs(session.startedAt, session.endedAt, session.pauseIntervals ?? []);
}
