import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, Orientation } from "../types/settings";
import type { FloatingPosition, SessionCategory, TimerMode, TimerProgram, TimerState } from "../types/timer";
import { createInitialTimerState, loadTimerState, removeTimerState, saveTimerState } from "../utils/storage";
import { getDurationMs, modeLabels } from "../utils/time";

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
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

export function usePomodoroTimer(settings: AppSettings, orientation: Orientation = "portrait") {
  const [timer, setTimer] = useState<TimerState>(() => loadTimerState(settings.workMinutes, orientation));
  const [announcement, setAnnouncement] = useState("");
  const settingsRef = useRef(settings);
  const skipNextSaveRef = useRef(false);
  settingsRef.current = settings;

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
      if (remainingMs <= 0) return { ...current, status: "overtime", remainingMs: Math.max(0, now - current.endAt) };
      return Math.ceil(current.remainingMs / 1000) === Math.ceil(remainingMs / 1000)
        ? current
        : { ...current, remainingMs };
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
    if (timer.status !== "overtime") return;
    if (settingsRef.current.soundEnabled) playChime();

    const direction = timer.program === "countup" ? "カウントアップ" : timer.program === "pomodoro" ? modeLabels[timer.mode] : "カウントダウン";
    setAnnouncement(`${categoryLabel[timer.category]}の${direction}が終了しました。延長中です。`);
  }, [timer.status, timer.program, timer.mode, timer.category]);

  const start = useCallback(() => {
    if (settingsRef.current.soundEnabled) prepareAudio();
    setAnnouncement("");
    setTimer((current) => {
      if (current.status === "running" || current.status === "overtime" || (current.status === "completed" && current.program !== "countup")) return current;
      if (current.program === "countup") {
        const elapsedMs = Math.max(0, current.remainingMs);
        return { ...current, status: "running", remainingMs: elapsedMs, endAt: Date.now() - elapsedMs };
      }
      const remainingMs = current.remainingMs > 0 ? current.remainingMs : current.durationMs;
      return { ...current, status: "running", remainingMs, endAt: Date.now() + remainingMs };
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
    setAnnouncement("");
    setTimer((current) => {
      const durationMs = current.program === "pomodoro"
        ? getDurationMs(current.mode, settingsRef.current)
        : current.customDurationMs;
      return { ...current, status: "idle", durationMs, remainingMs: current.program === "countup" ? 0 : durationMs, endAt: null };
    });
  }, []);

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
      endAt: null
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
        endAt: null
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
    removeTimerState();
    skipNextSaveRef.current = true;
    setAnnouncement("タイマー状態を削除しました。");
    setTimer(createInitialTimerState(settingsRef.current.workMinutes, orientation));
  }, [orientation]);

  return {
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
  };
}
