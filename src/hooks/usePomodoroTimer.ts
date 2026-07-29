import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSettings, Orientation } from "../types/settings";
import type { FloatingPosition, SessionCategory, TimerMode, TimerProgram, TimerSessionEvent, TimerState } from "../types/timer";
import { createInitialTimerState, loadTimerState, removeTimerState, saveTimerState } from "../utils/storage";
import { getDurationMs, modeLabels } from "../utils/time";

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type SessionEndHandler = (event: TimerSessionEvent) => void;

let audioContext: AudioContext | null = null;

function prepareAudio() {
  const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  void audioContext.resume().catch(() => undefined);
}

function playChime() {
  if (!audioContext) return;
  void audioContext.resume().then(() => {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.45);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.7);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.72);
  }).catch(() => undefined);
}

const categoryLabel: Record<SessionCategory, string> = { focus: "実施中", break: "休憩" };
const createId = () => globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function resolveArgs(
  orientationOrHandler: Orientation | SessionEndHandler | undefined,
  maybeHandler: SessionEndHandler | undefined
) {
  if (typeof orientationOrHandler === "function") return { orientation: "portrait" as Orientation, onSessionEnd: orientationOrHandler };
  return { orientation: orientationOrHandler ?? "portrait", onSessionEnd: maybeHandler };
}

export function usePomodoroTimer(settings: AppSettings, onSessionEnd?: SessionEndHandler): ReturnType<typeof createTimerApi>;
export function usePomodoroTimer(settings: AppSettings, orientation: Orientation, onSessionEnd?: SessionEndHandler): ReturnType<typeof createTimerApi>;
export function usePomodoroTimer(settings: AppSettings, orientationOrHandler?: Orientation | SessionEndHandler, maybeHandler?: SessionEndHandler) {
  const { orientation, onSessionEnd } = resolveArgs(orientationOrHandler, maybeHandler);
  const [timer, setTimer] = useState<TimerState>(() => loadTimerState(settings.workMinutes, orientation));
  const [announcement, setAnnouncement] = useState("");
  const settingsRef = useRef(settings);
  const timerRef = useRef(timer);
  const previousTimerSnapshotRef = useRef(timer);
  const skipNextSaveRef = useRef(false);
  settingsRef.current = settings;
  timerRef.current = timer;

  const emitSession = useCallback((current: TimerState, result: TimerSessionEvent["result"], endedAt: number) => {
    if (!current.activeSessionId || current.sessionStartedAt === null) return;
    const remainingMs = current.status === "running" && current.endAt !== null
      ? Math.max(0, current.endAt - endedAt)
      : current.remainingMs;
    onSessionEnd?.({
      id: current.activeSessionId,
      taskId: current.mode === "work" ? current.activeTaskId : null,
      program: current.program,
      mode: current.mode,
      result,
      startedAt: current.sessionStartedAt,
      endedAt,
      plannedDurationMs: current.durationMs,
      focusedDurationMs: Math.max(0, Math.min(current.durationMs, current.durationMs - remainingMs))
    });
  }, [onSessionEnd]);

  useEffect(() => {
    setTimer((current) => {
      const floatingPosition = current.floatingPositions[orientation] ?? current.floatingPosition;
      return current.floatingPosition.x === floatingPosition.x && current.floatingPosition.y === floatingPosition.y
        ? current
        : { ...current, floatingPosition };
    });
  }, [orientation]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveTimerState(timer);
  }, [timer]);

  const tick = useCallback(() => {
    setTimer((current) => {
      if (current.status === "overtime") {
        if (current.endAt === null) return current;
        const overtimeMs = Math.max(0, current.remainingMs, Date.now() - current.endAt);
        return Math.ceil(current.remainingMs / 1000) === Math.ceil(overtimeMs / 1000)
          ? current
          : { ...current, remainingMs: overtimeMs };
      }
      if (current.status !== "running" || current.endAt === null) return current;
      if (current.program === "countup") {
        const elapsedMs = Math.max(0, Date.now() - current.endAt);
        return Math.ceil(current.remainingMs / 1000) === Math.ceil(elapsedMs / 1000)
          ? current
          : { ...current, remainingMs: elapsedMs };
      }
      const now = Date.now();
      const remainingMs = Math.max(0, current.endAt - now);
      if (remainingMs > 0) {
        return Math.ceil(current.remainingMs / 1000) === Math.ceil(remainingMs / 1000)
          ? current
          : { ...current, remainingMs };
      }
      if (current.program === "pomodoro") {
        const completedWorkSessions = current.mode === "work" ? current.completedWorkSessions + 1 : current.completedWorkSessions;
        const nextMode: TimerMode = current.mode === "work"
          ? (completedWorkSessions % 4 === 0 ? "longBreak" : "shortBreak")
          : "work";
        const nextDurationMs = getDurationMs(nextMode, settingsRef.current);
        return {
          ...current,
          mode: nextMode,
          category: nextMode === "work" ? "focus" : "break",
          status: "paused",
          durationMs: nextDurationMs,
          remainingMs: nextDurationMs,
          endAt: null,
          completedWorkSessions,
          activeTaskId: null,
          activeSessionId: null,
          sessionStartedAt: null
        };
      }
      return {
        ...current,
        status: "overtime",
        remainingMs: Math.max(0, now - current.endAt),
        activeSessionId: null,
        sessionStartedAt: null
      };
    });
  }, []);

  useEffect(() => {
    tick();
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [tick]);

  useEffect(() => {
    const previous = previousTimerSnapshotRef.current;
    if (previous.status === "running" && previous.endAt !== null) {
      const endedAt = previous.endAt;
      const pomodoroCompleted = previous.program === "pomodoro"
        && timer.program === "pomodoro"
        && timer.status === "paused"
        && timer.mode !== previous.mode;
      const countdownCompleted = previous.program !== "pomodoro" && timer.status === "overtime";
      if (pomodoroCompleted) {
        if (settingsRef.current.soundEnabled) playChime();
        setAnnouncement(`${modeLabels[previous.mode]}が終了しました。次は${modeLabels[timer.mode]}です。`);
        emitSession(previous, "completed", endedAt);
      }
      if (countdownCompleted) emitSession(previous, "completed", endedAt);
    }
    previousTimerSnapshotRef.current = timer;
  }, [emitSession, timer]);

  useEffect(() => {
    if (timer.status !== "overtime") return;
    if (settingsRef.current.soundEnabled) playChime();
    const direction = timer.program === "countup" ? "カウントアップ" : timer.program === "pomodoro" ? modeLabels[timer.mode] : "カウントダウン";
    setAnnouncement(`${categoryLabel[timer.category]}の${direction}が終了しました。延長中です。`);
  }, [timer.status, timer.program, timer.mode, timer.category]);

  const start = useCallback((taskId?: string) => {
    if (settingsRef.current.soundEnabled) prepareAudio();
    setAnnouncement("");
    setTimer((current) => {
      if (current.status === "running" || current.status === "overtime" || (current.status === "completed" && current.program !== "countup")) return current;
      const now = Date.now();
      if (current.program === "countup") {
        const elapsedMs = Math.max(0, current.remainingMs);
        return {
          ...current,
          status: "running",
          remainingMs: elapsedMs,
          endAt: now - elapsedMs,
          activeTaskId: taskId === undefined ? current.activeTaskId : taskId,
          activeSessionId: current.activeSessionId ?? createId(),
          sessionStartedAt: current.sessionStartedAt ?? now
        };
      }
      const remainingMs = current.remainingMs > 0 ? current.remainingMs : current.durationMs;
      return {
        ...current,
        status: "running",
        remainingMs,
        endAt: now + remainingMs,
        activeTaskId: taskId === undefined ? current.activeTaskId : taskId,
        activeSessionId: current.activeSessionId ?? createId(),
        sessionStartedAt: current.sessionStartedAt ?? now
      };
    });
  }, []);

  const pause = useCallback(() => {
    setTimer((current) => {
      if (current.status !== "running") return current;
      if (current.program === "countup") {
        const elapsedMs = current.endAt ? Math.max(0, Date.now() - current.endAt) : current.remainingMs;
        return { ...current, status: "paused", remainingMs: elapsedMs, endAt: null };
      }
      const remainingMs = current.endAt ? Math.max(0, current.endAt - Date.now()) : current.remainingMs;
      return { ...current, status: "paused", remainingMs, endAt: null };
    });
  }, []);

  const reset = useCallback(() => {
    const current = timerRef.current;
    if (current.activeSessionId) emitSession(current, "cancelled", Date.now());
    setAnnouncement("");
    setTimer((state) => {
      const durationMs = state.program === "pomodoro"
        ? getDurationMs(state.mode, settingsRef.current)
        : state.customDurationMs;
      return {
        ...state,
        status: "idle",
        durationMs,
        remainingMs: state.program === "countup" ? 0 : durationMs,
        endAt: null,
        activeTaskId: null,
        activeSessionId: null,
        sessionStartedAt: null
      };
    });
  }, [emitSession]);

  const selectMode = useCallback((mode: TimerMode) => {
    const durationMs = getDurationMs(mode, settingsRef.current);
    setAnnouncement("");
    setTimer((current) => ({
      ...current,
      program: "pomodoro",
      mode,
      category: mode === "work" ? "focus" : "break",
      status: "idle",
      durationMs,
      remainingMs: durationMs,
      endAt: null,
      activeTaskId: null,
      activeSessionId: null,
      sessionStartedAt: null
    }));
  }, []);

  const selectProgram = useCallback((program: TimerProgram) => {
    setAnnouncement("");
    setTimer((current) => {
      const durationMs = program === "pomodoro"
        ? getDurationMs("work", settingsRef.current)
        : current.customDurationMs;
      return {
        ...current,
        program,
        mode: program === "pomodoro" ? "work" : current.mode,
        category: "focus",
        status: "idle",
        durationMs,
        remainingMs: program === "countup" ? 0 : durationMs,
        endAt: null,
        activeTaskId: null,
        activeSessionId: null,
        sessionStartedAt: null
      };
    });
  }, []);

  const selectCategory = useCallback((category: SessionCategory) => {
    setTimer((current) => current.program === "pomodoro" ? current : { ...current, category });
  }, []);

  const setCustomDurationMinutes = useCallback((minutes: number) => {
    const customDurationMs = Math.min(24 * 60, Math.max(1, Math.round(minutes))) * 60_000;
    setTimer((current) => {
      if (current.program === "pomodoro") return { ...current, customDurationMs };
      if (current.program === "countup") {
        return { ...current, customDurationMs, durationMs: customDurationMs, remainingMs: current.status === "idle" ? 0 : current.remainingMs };
      }
      return { ...current, customDurationMs, durationMs: customDurationMs, remainingMs: customDurationMs, endAt: null, status: "idle" };
    });
  }, []);

  const setFloatingPosition = useCallback((floatingPosition: FloatingPosition) => {
    setTimer((current) => ({ ...current, floatingPosition, floatingPositions: { ...current.floatingPositions, [orientation]: floatingPosition } }));
  }, [orientation]);

  const clearTimer = useCallback(() => {
    const current = timerRef.current;
    if (current.activeSessionId) emitSession(current, "cancelled", Date.now());
    removeTimerState();
    skipNextSaveRef.current = true;
    setAnnouncement("タイマー状態を削除しました。");
    setTimer(createInitialTimerState(settingsRef.current.workMinutes, orientation));
  }, [emitSession, orientation]);

  return createTimerApi({
    timer,
    announcement,
    setAnnouncement,
    start,
    pause,
    reset,
    selectMode,
    selectProgram,
    selectCategory,
    setCustomDurationMinutes,
    setFloatingPosition,
    clearTimer
  });
}

function createTimerApi(api: {
  timer: TimerState;
  announcement: string;
  setAnnouncement: Dispatch<SetStateAction<string>>;
  start: (taskId?: string) => void;
  pause: () => void;
  reset: () => void;
  selectMode: (mode: TimerMode) => void;
  selectProgram: (program: TimerProgram) => void;
  selectCategory: (category: SessionCategory) => void;
  setCustomDurationMinutes: (minutes: number) => void;
  setFloatingPosition: (position: FloatingPosition) => void;
  clearTimer: () => void;
}) {
  return api;
}
