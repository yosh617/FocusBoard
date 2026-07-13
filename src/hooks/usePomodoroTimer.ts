import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings } from "../types/settings";
import type { TimerMode, TimerState } from "../types/timer";
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

export function usePomodoroTimer(settings: AppSettings) {
  const [timer, setTimer] = useState<TimerState>(() => loadTimerState(settings.workMinutes));
  const [announcement, setAnnouncement] = useState("");
  const settingsRef = useRef(settings);
  const skipNextSaveRef = useRef(false);
  settingsRef.current = settings;

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveTimerState(timer);
  }, [timer]);

  const tick = useCallback(() => {
    setTimer((current) => {
      if (current.status !== "running" || current.endAt === null) return current;
      const remainingMs = Math.max(0, current.endAt - Date.now());
      if (remainingMs <= 0) return { ...current, status: "completed", remainingMs: 0, endAt: null };
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
    if (timer.status !== "completed") return;
    const completedWorkSessions = timer.mode === "work"
      ? timer.completedWorkSessions + 1
      : timer.completedWorkSessions;
    const nextMode: TimerMode = timer.mode === "work"
      ? (completedWorkSessions % 4 === 0 ? "longBreak" : "shortBreak")
      : "work";

    setAnnouncement(`${modeLabels[timer.mode]}が終了しました。次は${modeLabels[nextMode]}です。`);
    if (settingsRef.current.soundEnabled) playChime();
    setTimer({
      version: 1,
      mode: nextMode,
      status: "paused",
      remainingMs: getDurationMs(nextMode, settingsRef.current),
      endAt: null,
      completedWorkSessions
    });
  }, [timer.status, timer.mode, timer.completedWorkSessions]);

  const start = useCallback(() => {
    if (settingsRef.current.soundEnabled) prepareAudio();
    setAnnouncement("");
    setTimer((current) => {
      if (current.status === "running") return current;
      const remainingMs = current.remainingMs > 0
        ? current.remainingMs
        : getDurationMs(current.mode, settingsRef.current);
      return { ...current, status: "running", remainingMs, endAt: Date.now() + remainingMs };
    });
  }, []);

  const pause = useCallback(() => {
    setTimer((current) => {
      if (current.status !== "running") return current;
      const remainingMs = current.endAt ? Math.max(0, current.endAt - Date.now()) : current.remainingMs;
      return { ...current, status: "paused", remainingMs, endAt: null };
    });
  }, []);

  const reset = useCallback(() => {
    setAnnouncement("");
    setTimer((current) => ({
      ...current,
      status: "idle",
      remainingMs: getDurationMs(current.mode, settingsRef.current),
      endAt: null
    }));
  }, []);

  const selectMode = useCallback((mode: TimerMode) => {
    setAnnouncement("");
    setTimer((current) => ({
      ...current,
      mode,
      status: "idle",
      remainingMs: getDurationMs(mode, settingsRef.current),
      endAt: null
    }));
  }, []);

  const clearTimer = useCallback(() => {
    removeTimerState();
    skipNextSaveRef.current = true;
    setAnnouncement("タイマー状態を削除しました。");
    setTimer(createInitialTimerState(settingsRef.current.workMinutes));
  }, []);

  return { timer, announcement, setAnnouncement, start, pause, reset, selectMode, clearTimer };
}
