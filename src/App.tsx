import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BackgroundSlideshow } from "./components/BackgroundSlideshow";
import { ClockWidget } from "./components/ClockWidget";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { FloatingTimer } from "./components/FloatingTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { TaskDrawer } from "./components/tasks/TaskDrawer";
import { TaskLauncher } from "./components/tasks/TaskLauncher";
import { SessionCompleteDialog } from "./components/tasks/SessionCompleteDialog";
import { useClock } from "./hooks/useClock";
import { useLocalStorageSettings } from "./hooks/useLocalStorageSettings";
import { usePomodoroTimer } from "./hooks/usePomodoroTimer";
import { useCustomBackgrounds } from "./hooks/useCustomBackgrounds";
import { useFullscreen } from "./hooks/useFullscreen";
import { useOrientation } from "./hooks/useOrientation";
import { useTasks } from "./hooks/useTasks";
import { useTaskReminders } from "./hooks/useTaskReminders";
import { defaultSettings, fontOptions, positionPresets, type OrientationPositions, type PositionPreset } from "./types/settings";
import type { TimerSessionEvent } from "./types/timer";
import { getAdaptivePalette, fallbackBackgroundRgb, getStrongAccent, type AdaptivePalette } from "./utils/adaptiveColor";
import { formatFocusedTime } from "./utils/productivityReport";
import { getTasksForView, sortTasksForFocus, toLocalDateKey } from "./utils/taskQueries";
import { formatDuration, getTimerElapsedMs, getTimerOvertimeMs, modeLabels } from "./utils/time";

const settingsButtonDisplayMs = 2_500;
const settingsButtonFadeMs = 280;

const toHistoryStateObject = (state: unknown): Record<string, unknown> => {
  if (state && typeof state === "object" && !Array.isArray(state)) return { ...(state as Record<string, unknown>) };
  return {};
};

const withoutOverlayHistoryState = (state: unknown): Record<string, unknown> | null => {
  const historyState = toHistoryStateObject(state);
  const { focusboardOverlay: _focusboardOverlay, ...nextState } = historyState;
  return Object.keys(nextState).length > 0 ? nextState : null;
};

export default function App() {
  const { settings, updateSettings, undoSettings, resetSettings, storageMessage, setStorageMessage, saveState } = useLocalStorageSettings();
  const orientation = useOrientation();
  const {
    tasks,
    projects,
    sessions,
    loading: tasksLoading,
    storageAvailable: taskStorageAvailable,
    taskMessage,
    setTaskMessage,
    canUndo: canUndoTask,
    addTask,
    updateTask,
    toggleTask,
    archiveTask,
    moveTask,
    addProject,
    archiveProject,
    undo: undoTask,
    recordTimerSession,
    importProductivityBackup
  } = useTasks();
  const { reminderMessage, setReminderMessage, notificationPermission, requestNotificationPermission } = useTaskReminders(tasks);
  const [completedSession, setCompletedSession] = useState<TimerSessionEvent | null>(null);
  const handleSessionEnd = useCallback((event: TimerSessionEvent) => {
    recordTimerSession(event);
    if (event.result === "completed" && event.mode === "work" && event.taskId) setCompletedSession(event);
  }, [recordTimerSession]);
  const {
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
  } = usePomodoroTimer(settings, orientation, handleSessionEnd);
  const { backgrounds, addBackgrounds, removeBackground, reorderBackgrounds, backgroundMessage, setBackgroundMessage } = useCustomBackgrounds();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskDrawerResumeContext, setTaskDrawerResumeContext] = useState<{
    label: string;
    title: string;
    detail: string;
    taskId: string | null;
    actionLabel?: string;
  } | null>(null);
  const [breakResumeTaskId, setBreakResumeTaskId] = useState<string | null>(null);
  const [timerSetupVisible, setTimerSetupVisible] = useState(false);
  const [settingsButtonVisible, setSettingsButtonVisible] = useState(false);
  const [settingsButtonFading, setSettingsButtonFading] = useState(false);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [activeBackgroundId, setActiveBackgroundId] = useState<string>(() => settings.backgroundChoice === "slideshow" ? "bg1" : settings.backgroundChoice);
  const [adaptivePalette, setAdaptivePalette] = useState<AdaptivePalette>(() => getAdaptivePalette(fallbackBackgroundRgb, settings.overlayOpacity));
  const settingsButtonTimeoutRef = useRef<number | null>(null);
  const settingsButtonFadeTimeoutRef = useRef<number | null>(null);
  const taskLauncherRef = useRef<HTMLButtonElement>(null);
  const homeTasksRef = useRef<HTMLButtonElement>(null);
  const homeSettingsRef = useRef<HTMLButtonElement>(null);
  const overlayReturnTargetRef = useRef<HTMLElement | null>(null);
  const overlayHistoryKindRef = useRef<"settings" | "tasks" | "session" | null>(null);
  const tasksOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const sessionOverlayOpenRef = useRef(false);
  const now = useClock(settings.showSeconds);
  const todayKey = toLocalDateKey(now);
  const activeTask = timer.activeTaskId ? tasks.find((task) => task.id === timer.activeTaskId) ?? null : null;
  const completedTask = completedSession?.taskId ? tasks.find((task) => task.id === completedSession.taskId) ?? null : null;
  const todayOpenTaskCount = useMemo(() => getTasksForView(tasks, "today", todayKey).length, [tasks, todayKey]);
  const todayCompletedTaskCount = useMemo(
    () => tasks.filter((task) => task.parentTaskId === null && task.status === "completed" && task.completedAt !== null && toLocalDateKey(new Date(task.completedAt)) === todayKey).length,
    [tasks, todayKey]
  );
  const todayTaskTotalCount = todayOpenTaskCount + todayCompletedTaskCount;
  const todayFocusedMs = useMemo(
    () => sessions
      .filter((session) => session.mode === "work" && toLocalDateKey(new Date(session.endedAt)) === todayKey)
      .reduce((sum, session) => sum + session.focusedDurationMs, 0),
    [sessions, todayKey]
  );
  const todayOverdueTaskCount = useMemo(
    () => tasks.filter((task) => task.parentTaskId === null && task.status === "open" && task.dueDate !== null && task.dueDate < todayKey).length,
    [tasks, todayKey]
  );
  const suggestedNextTask = useMemo(
    () => sortTasksForFocus(tasks, todayKey).find((task) => task.id !== completedSession?.taskId) ?? null,
    [completedSession?.taskId, tasks, todayKey]
  );
  const suggestedNextTaskProject = suggestedNextTask?.projectId
    ? projects.find((project) => project.id === suggestedNextTask.projectId) ?? null
    : null;
  const suggestedNextTaskDetail = useMemo(() => {
    if (!suggestedNextTask) return null;
    const labels: string[] = [];
    if (suggestedNextTaskProject) labels.push(suggestedNextTaskProject.name);
    if (suggestedNextTask.dueDate !== null) {
      if (suggestedNextTask.dueDate < todayKey) labels.push("期限切れ");
      else if (suggestedNextTask.dueDate === todayKey) labels.push("今日");
      else labels.push(suggestedNextTask.dueDate.replace(/-/g, "/"));
    } else if (suggestedNextTask.bucket === "someday") {
      labels.push("いつか");
    } else {
      labels.push("Inbox");
    }
    if (suggestedNextTask.estimatedPomodoros > 0) labels.push(`目安 ${suggestedNextTask.estimatedPomodoros}セット`);
    return labels.join(" ・ ");
  }, [suggestedNextTask, suggestedNextTaskProject, todayKey]);
  const breakResumeTask = useMemo(() => {
    if (timer.status === "idle" || timer.mode === "work" || !breakResumeTaskId) return null;
    return tasks.find((task) => task.id === breakResumeTaskId && task.status === "open") ?? null;
  }, [breakResumeTaskId, tasks, timer.mode, timer.status]);
  const launcherSuggestedTask = useMemo(() => {
    const task = breakResumeTask ?? (timer.status === "idle" ? sortTasksForFocus(tasks, todayKey)[0] ?? null : null);
    if (!task) return null;
    const project = task.projectId ? projects.find((item) => item.id === task.projectId) ?? null : null;
    const detailParts: string[] = [];
    if (project) detailParts.push(project.name);
    if (task.dueDate !== null) {
      if (task.dueDate < todayKey) detailParts.push("期限切れ");
      else if (task.dueDate === todayKey) detailParts.push("今日の予定");
      else detailParts.push(task.dueDate.replace(/-/g, "/"));
    } else if (task.bucket === "someday") {
      detailParts.push("いつか");
    } else {
      detailParts.push("Inbox");
    }
    detailParts.push(todayOpenTaskCount === 0 ? "次の追加を決める" : `未完了 ${todayOpenTaskCount}件`);
    return {
      id: task.id,
      title: task.title,
      detail: detailParts.join(" · ")
    };
  }, [breakResumeTask, projects, tasks, timer.status, todayKey, todayOpenTaskCount]);
  const taskLauncherSummary = useMemo(() => {
    if (timer.status === "idle") return null;
    const isBreakFlow = timer.mode !== "work";
    const statusText = timer.status === "running"
      ? timer.mode === "work" ? "集中中" : "休憩中"
      : timer.status === "paused"
        ? "一時停止中"
        : "延長中";
    const defaultTitle = timer.program === "pomodoro"
      ? modeLabels[timer.mode]
      : timer.category === "focus" ? "集中タイマー" : "休憩タイマー";
    const title = isBreakFlow
      ? defaultTitle
      : activeTask?.title ?? defaultTitle;
    const displayMs = timer.program === "countup"
      ? getTimerElapsedMs(timer)
      : timer.status === "overtime"
        ? getTimerOvertimeMs(timer)
        : timer.remainingMs;
    const detailPrefix = timer.program === "countup"
      ? `${statusText} · ${formatDuration(displayMs)}`
      : `${modeLabels[timer.mode]} · ${statusText} · ${formatDuration(displayMs)}`;
    const detail = isBreakFlow && launcherSuggestedTask?.title
      ? `${detailPrefix} · 次は ${launcherSuggestedTask.title}`
      : detailPrefix;
    const accessibleLabel = isBreakFlow
      ? `タスクを開く。${defaultTitle}中。${launcherSuggestedTask?.title ? `次のおすすめは${launcherSuggestedTask.title}。` : ""}今日の未完了は${todayOpenTaskCount}件`
      : activeTask?.title
        ? `タスクを開く。集中中のタスクは${activeTask.title}。今日の未完了は${todayOpenTaskCount}件`
        : `タスクを開く。${statusText}。今日の未完了は${todayOpenTaskCount}件`;
    return { statusText, title, detail, accessibleLabel };
  }, [activeTask?.title, launcherSuggestedTask?.title, timer, todayOpenTaskCount]);

  const activeClockSetting = settings.clockBackgroundSettings[activeBackgroundId] ?? {
    positions: { portrait: defaultSettings.clockDatePosition, landscape: defaultSettings.clockDatePosition } satisfies OrientationPositions,
    color: settings.clockColor,
    matchColors: settings.matchClockBackgroundColors
  };
  const clockDisplaySettings = useMemo(() => ({ ...settings, clockDatePosition: activeClockSetting.positions[orientation], clockColor: activeClockSetting.color, matchClockBackgroundColors: activeClockSetting.matchColors }), [activeClockSetting.color, activeClockSetting.matchColors, activeClockSetting.positions, orientation, settings]);
  const updateClockSettings = useCallback((patch: Partial<typeof settings>) => {
    const updatesClockSetting = "clockDatePosition" in patch || "clockColor" in patch || "matchClockBackgroundColors" in patch;
    if (!updatesClockSetting) {
      updateSettings(patch);
      return;
    }
    updateSettings((current) => {
      const currentClock = current.clockBackgroundSettings[activeBackgroundId] ?? { positions: { portrait: defaultSettings.clockDatePosition, landscape: defaultSettings.clockDatePosition }, color: current.clockColor, matchColors: current.matchClockBackgroundColors };
      const nextPosition = patch.clockDatePosition ?? currentClock.positions[orientation];
      const nextColor = patch.clockColor ?? currentClock.color;
      const nextMatchColors = patch.matchClockBackgroundColors ?? currentClock.matchColors;
      return {
        ...patch,
        ...(patch.clockDatePosition ? { clockDatePosition: nextPosition } : {}),
        ...(patch.clockColor ? { clockColor: nextColor } : {}),
        ...(patch.matchClockBackgroundColors !== undefined ? { matchClockBackgroundColors: nextMatchColors } : {}),
        clockBackgroundSettings: {
          ...current.clockBackgroundSettings,
          [activeBackgroundId]: { ...currentClock, positions: { ...currentClock.positions, [orientation]: nextPosition }, color: nextColor, matchColors: nextMatchColors }
        }
      };
    });
  }, [activeBackgroundId, orientation, updateSettings]);

  const restoreOverlayFocus = useCallback(() => {
    window.setTimeout(() => overlayReturnTargetRef.current?.focus(), 0);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    restoreOverlayFocus();
  }, [restoreOverlayFocus]);
  const closeCompletedSession = useCallback(() => setCompletedSession(null), []);
  const startTask = useCallback((taskId: string) => {
    setTaskMessage("");
    setTaskDrawerResumeContext(null);
    setBreakResumeTaskId(null);
    start(taskId);
    setTasksOpen(false);
  }, [setTaskMessage, start]);
  const hideSettingsButton = useCallback(() => {
    if (settingsButtonTimeoutRef.current !== null) window.clearTimeout(settingsButtonTimeoutRef.current);
    if (settingsButtonFadeTimeoutRef.current !== null) window.clearTimeout(settingsButtonFadeTimeoutRef.current);
    settingsButtonTimeoutRef.current = null;
    settingsButtonFadeTimeoutRef.current = null;
    setSettingsButtonFading(false);
    setSettingsButtonVisible(false);
  }, []);
  const openSettings = useCallback((returnTarget: HTMLElement | null = homeSettingsRef.current) => {
    overlayReturnTargetRef.current = returnTarget;
    hideSettingsButton();
    setTasksOpen(false);
    setSettingsOpen(true);
  }, [hideSettingsButton]);
  const openTasks = useCallback((returnTarget: HTMLElement | null = homeTasksRef.current) => {
    overlayReturnTargetRef.current = returnTarget;
    setSettingsOpen(false);
    setTasksOpen(true);
  }, []);
  const revealHomeControls = useCallback((force = false) => {
    if (settingsOpen || backgroundEditing || (!force && tasksOpen)) return;
    if (settingsButtonTimeoutRef.current !== null) window.clearTimeout(settingsButtonTimeoutRef.current);
    if (settingsButtonFadeTimeoutRef.current !== null) window.clearTimeout(settingsButtonFadeTimeoutRef.current);
    setSettingsButtonFading(false);
    setSettingsButtonVisible(true);
    settingsButtonFadeTimeoutRef.current = window.setTimeout(() => {
      settingsButtonFadeTimeoutRef.current = null;
      setSettingsButtonFading(true);
    }, settingsButtonDisplayMs);
    settingsButtonTimeoutRef.current = window.setTimeout(() => {
      settingsButtonTimeoutRef.current = null;
      setSettingsButtonFading(false);
      setSettingsButtonVisible(false);
    }, settingsButtonDisplayMs + settingsButtonFadeMs);
  }, [backgroundEditing, settingsOpen, tasksOpen]);
  const revealSettingsButton = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const interactiveTarget = event.target.closest("button, input, select, textarea, a, [role='dialog'], .clock-widget, .floating-timer, .timer-card");
    if (!interactiveTarget) revealHomeControls();
  }, [revealHomeControls]);
  const closeTasks = useCallback(() => {
    setTaskDrawerResumeContext(null);
    setTasksOpen(false);
    if (settings.taskLauncherVisibility === "background-tap") revealHomeControls(true);
    restoreOverlayFocus();
  }, [restoreOverlayFocus, revealHomeControls, settings.taskLauncherVisibility]);
  const startBackgroundEditing = useCallback(() => {
    hideSettingsButton();
    setSettingsOpen(false);
    setBackgroundEditing(true);
  }, [hideSettingsButton]);
  const showMessage = useCallback((message: string) => {
    setStorageMessage(message);
    setAnnouncement("");
    setBackgroundMessage("");
    setTaskMessage("");
    setReminderMessage("");
  }, [setAnnouncement, setStorageMessage, setBackgroundMessage, setTaskMessage, setReminderMessage]);
  const { isFullscreen, isSupported: fullscreenSupported, setFullscreen } = useFullscreen();
  const handleFullscreenToggle = useCallback(async (enabled: boolean) => {
    const changed = await setFullscreen(enabled);
    if (!changed) {
      if (enabled) showMessage("このブラウザでは全画面表示を利用できません。");
      return;
    }
    updateSettings({ fullscreen: enabled });
  }, [setFullscreen, showMessage, updateSettings]);

  useEffect(() => {
    if (settings.fullscreen !== isFullscreen) updateSettings({ fullscreen: isFullscreen });
  }, [isFullscreen, settings.fullscreen, updateSettings]);

  const startTimer = useCallback(() => {
    setTimerSetupVisible(false);
    updateSettings({ timerSetupCollapsed: true });
    start();
  }, [start, updateSettings]);
  const showTimerSetup = useCallback(() => {
    setTimerSetupVisible(true);
    updateSettings({ timerSetupCollapsed: false });
  }, [updateSettings]);
  const showFloatingTimer = useCallback(() => {
    setTimerSetupVisible(false);
    updateSettings({ timerSetupCollapsed: true });
  }, [updateSettings]);
  const resetTimer = useCallback(() => {
    reset();
    setTimerSetupVisible(false);
    updateSettings({ timerSetupCollapsed: false });
  }, [reset, updateSettings]);
  const endTimer = resetTimer;

  const slotContent = useMemo(() => {
    const slots = Object.fromEntries(positionPresets.map((position) => [position, [] as ReactNode[]])) as Record<PositionPreset, ReactNode[]>;
    const showSetup = settings.showTimer && (timer.status === "idle" ? !settings.timerSetupCollapsed : timerSetupVisible);
    if (showSetup) slots[settings.timerPositions[orientation]].push(
      <PomodoroTimer
        timer={timer}
        fontSize={settings.timerFontSize}
        onStart={startTimer}
        onReset={resetTimer}
        onSelectMode={selectMode}
        onSelectProgram={selectProgram}
        onSelectCategory={selectCategory}
        onSetDuration={setCustomDurationMinutes}
        onCollapse={() => { setTimerSetupVisible(false); updateSettings({ timerSetupCollapsed: true }); }}
        onShowFloating={showFloatingTimer}
        key="timer"
      />
    );
    return slots;
  }, [orientation, settings, timer, timerSetupVisible, startTimer, resetTimer, selectMode, selectProgram, selectCategory, setCustomDurationMinutes, showFloatingTimer, updateSettings]);

  const liveMessage = reminderMessage || taskMessage || backgroundMessage || announcement || storageMessage;
  const activeOverlay = completedSession !== null && completedTask !== null
    ? "session"
    : tasksOpen
      ? "tasks"
      : settingsOpen
        ? "settings"
        : null;
  tasksOpenRef.current = tasksOpen;
  settingsOpenRef.current = settingsOpen;
  sessionOverlayOpenRef.current = completedSession !== null && completedTask !== null;
  const clockColor = activeClockSetting.matchColors ? adaptivePalette.text : activeClockSetting.color;
  const timerColor = settings.matchTimerBackgroundColors ? adaptivePalette.accent : settings.timerColor;
  const appStyle = {
    color: clockColor,
    fontFamily: fontOptions[settings.fontFamily as keyof typeof fontOptions] ?? fontOptions.system,
    "--timer-accent": timerColor,
    "--timer-accent-strong": getStrongAccent(timerColor),
    "--adaptive-accent": timerColor,
    "--adaptive-accent-strong": getStrongAccent(timerColor),
    "--timer-background-opacity": settings.timerBackgroundOpacity
  } as CSSProperties;

  useEffect(() => {
    if (!liveMessage) return;
    const timeout = window.setTimeout(() => {
      setAnnouncement("");
      setStorageMessage("");
      setBackgroundMessage("");
      setTaskMessage("");
      setReminderMessage("");
    }, 7_000);
    return () => window.clearTimeout(timeout);
  }, [liveMessage, setAnnouncement, setStorageMessage, setBackgroundMessage, setTaskMessage, setReminderMessage]);

  useEffect(() => () => {
    if (settingsButtonTimeoutRef.current !== null) window.clearTimeout(settingsButtonTimeoutRef.current);
    if (settingsButtonFadeTimeoutRef.current !== null) window.clearTimeout(settingsButtonFadeTimeoutRef.current);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (sessionOverlayOpenRef.current) {
        overlayHistoryKindRef.current = null;
        closeCompletedSession();
        return;
      }
      if (tasksOpenRef.current) {
        overlayHistoryKindRef.current = null;
        closeTasks();
        return;
      }
      if (settingsOpenRef.current) {
        overlayHistoryKindRef.current = null;
        closeSettings();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [closeCompletedSession, closeSettings, closeTasks]);

  useEffect(() => {
    if (activeOverlay === null) {
      if (overlayHistoryKindRef.current !== null) {
        overlayHistoryKindRef.current = null;
        window.history.replaceState(withoutOverlayHistoryState(window.history.state), "", window.location.href);
      }
      return;
    }
    if (overlayHistoryKindRef.current === null) {
      overlayHistoryKindRef.current = activeOverlay;
      window.history.pushState({ ...toHistoryStateObject(window.history.state), focusboardOverlay: activeOverlay }, "", window.location.href);
      return;
    }
    if (overlayHistoryKindRef.current !== activeOverlay) {
      overlayHistoryKindRef.current = activeOverlay;
      window.history.replaceState({ ...toHistoryStateObject(window.history.state), focusboardOverlay: activeOverlay }, "", window.location.href);
    }
  }, [activeOverlay]);

  return (
    <main
      className={`app-shell${backgroundEditing ? " app-shell--background-editing" : ""}`}
      style={appStyle}
      onPointerUp={revealSettingsButton}
    >
      <BackgroundSlideshow
        intervalSec={settings.slideshowIntervalSec}
        overlayOpacity={settings.overlayOpacity}
        backgroundChoice={settings.backgroundChoice}
        customBackgrounds={backgrounds}
        hiddenBackgroundIds={settings.hiddenBackgroundIds}
        clockPosition={activeClockSetting.positions[orientation]}
        clockFontSize={settings.clockFontSize}
        dateFontSize={settings.dateFontSize}
        showClock={settings.showClock}
        showDate={settings.showDate}
        showSeconds={settings.showSeconds}
        dateFormat={settings.dateFormat}
        backgroundPosition={settings.backgroundPosition}
        backgroundScale={settings.backgroundScale}
        backgroundFrames={settings.backgroundFrames}
        editing={backgroundEditing}
        onEditModeChange={setBackgroundEditing}
        onFramePreview={() => undefined}
        onFrameChange={(backgroundId, backgroundPosition, backgroundScale) => updateSettings((current) => ({
          backgroundPosition,
          backgroundScale,
          backgroundFrames: {
            ...current.backgroundFrames,
            [backgroundId]: { position: backgroundPosition, scale: backgroundScale }
          }
        }))}
        onPaletteChange={setAdaptivePalette}
        onActiveBackgroundChange={setActiveBackgroundId}
      />
      <div className={`dashboard${settings.showTimer && (timer.status === "idle" ? !settings.timerSetupCollapsed : timerSetupVisible) ? " dashboard--timer-setup" : ""}`} aria-label="FocusBoard ダッシュボード">
        {positionPresets.map((position) => (
          <div className={`slot slot--${position}`} key={position}>{slotContent[position]}</div>
        ))}
      </div>
      {(settings.showClock || settings.showDate) && <ClockWidget now={now} settings={clockDisplaySettings} textColor={clockColor} onChange={updateClockSettings} onMessage={showMessage} orientation={orientation} />}

      {settings.showTimer && (timer.status !== "idle" || settings.timerSetupCollapsed) && !timerSetupVisible && (
        <FloatingTimer
          timer={timer}
          taskTitle={activeTask?.title ?? null}
          onStart={startTimer}
          onPause={pause}
          onEnd={endTimer}
          onShowSetup={showTimerSetup}
          onPositionChange={setFloatingPosition}
          orientation={orientation}
        />
      )}

      {liveMessage && <div className="toast" role="status" aria-live="polite">{liveMessage}</div>}
      <nav className="home-dock" aria-label="ホーム操作">
        <button className="home-dock__button home-dock__button--tasks" type="button" aria-label="タスク" aria-pressed={tasksOpen} onClick={() => openTasks(homeTasksRef.current)} ref={homeTasksRef}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10M9 12h10M9 18h10M4 6h.01M4 12h.01M4 18h.01" /></svg><span>タスク</span>
        </button>
        <button className="home-dock__button" type="button" aria-label="設定" aria-pressed={settingsOpen} onClick={() => openSettings(homeSettingsRef.current)} ref={homeSettingsRef}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg><span>設定</span>
        </button>
      </nav>
      {(settings.taskLauncherVisibility === "always" || settingsButtonVisible) && <TaskLauncher
        todayCount={todayOpenTaskCount}
        todaySummary={{
          completedCount: todayCompletedTaskCount,
          totalCount: todayTaskTotalCount,
          focusedLabel: todayFocusedMs > 0 ? formatFocusedTime(todayFocusedMs) : "0分",
          overdueCount: todayOverdueTaskCount
        }}
        activeTaskTitle={timer.status !== "idle" && timer.mode === "work" ? activeTask?.title ?? null : null}
        suggestedTask={launcherSuggestedTask}
        timerSummary={taskLauncherSummary}
        onClick={() => {
          overlayReturnTargetRef.current = taskLauncherRef.current;
          setSettingsOpen(false);
          if (timer.status !== "idle" && timer.mode !== "work" && launcherSuggestedTask) {
            setTaskDrawerResumeContext({
              label: "休憩のあと",
              title: `${launcherSuggestedTask.title}を休憩後の候補として開いています`,
              detail: `${launcherSuggestedTask.detail}。休憩タイマーを止めずに、次の集中を確認できます。`,
              taskId: launcherSuggestedTask.id,
              actionLabel: "休憩後の候補を開く"
            });
          } else if (activeTask && timer.status !== "idle") {
            const activeTaskProject = activeTask.projectId
              ? projects.find((project) => project.id === activeTask.projectId) ?? null
              : null;
            const activeTaskDetailParts = [
              activeTaskProject?.name ?? null,
              taskLauncherSummary?.detail ?? null,
              todayOpenTaskCount > 0 ? `今日の未完了はあと${todayOpenTaskCount}件です。` : "今日はこのタスクが最後です。"
            ].filter((item): item is string => item !== null);
            setTaskDrawerResumeContext({
              label: "いまの集中",
              title: `${activeTask.title}へ戻れます`,
              detail: `${activeTaskDetailParts.join(" ・ ")} 集中を止めずに、詳細と一覧を見直せます。`,
              taskId: activeTask.id,
              actionLabel: "進行中を開く"
            });
          } else if (launcherSuggestedTask) {
            setTaskDrawerResumeContext({
              label: "今日のおすすめ",
              title: `${launcherSuggestedTask.title}を開いています`,
              detail: `${launcherSuggestedTask.detail}。そのまま開始するか、一覧で順番を見直せます。`,
              taskId: launcherSuggestedTask.id,
              actionLabel: "おすすめを開く"
            });
          } else {
            setTaskDrawerResumeContext(null);
          }
          setTasksOpen(true);
        }}
        ref={taskLauncherRef}
        transient={settings.taskLauncherVisibility === "background-tap"}
        fading={settings.taskLauncherVisibility === "background-tap" && settingsButtonFading}
      />}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        orientation={orientation}
        saveState={saveState}
        onChange={updateSettings}
        onUndo={undoSettings}
        onClose={closeSettings}
        onOpenTasks={openTasks}
        onStartBackgroundEditing={startBackgroundEditing}
        adaptivePalette={adaptivePalette}
        fullscreenSupported={fullscreenSupported}
        onFullscreenToggle={handleFullscreenToggle}
        onResetSettings={() => { resetSettings(); showMessage("設定を初期値に戻しました。"); }}
        onClearTimer={clearTimer}
        onMessage={showMessage}
        customBackgrounds={backgrounds}
        onAddBackgrounds={addBackgrounds}
        onRemoveBackground={async (id) => {
          const removed = await removeBackground(id);
          if (removed) updateSettings((current) => ({
            ...(current.backgroundChoice === `custom:${id}` ? { backgroundChoice: "slideshow" } : {}),
            hiddenBackgroundIds: current.hiddenBackgroundIds.filter((hiddenId) => hiddenId !== id)
          }));
        }}
        onReorderBackgrounds={reorderBackgrounds}
      />
      <TaskDrawer
        open={tasksOpen}
        tasks={tasks}
        projects={projects}
        sessions={sessions}
        loading={tasksLoading}
        storageAvailable={taskStorageAvailable}
        canUndo={canUndoTask}
        onClose={closeTasks}
        onOpenSettings={openSettings}
        onAddTask={addTask}
        onUpdateTask={updateTask}
        onToggleTask={toggleTask}
        onArchiveTask={archiveTask}
        onMoveTask={moveTask}
        onAddProject={addProject}
        onArchiveProject={archiveProject}
        onUndo={undoTask}
        timerStatus={timer.status}
        activeTaskId={timer.activeTaskId}
        workMinutes={settings.workMinutes}
        onStartTask={startTask}
        notificationPermission={notificationPermission}
        onRequestNotification={requestNotificationPermission}
        onImportBackup={importProductivityBackup}
        resumeContext={taskDrawerResumeContext}
      />
      <SessionCompleteDialog
        open={completedSession !== null && completedTask !== null}
        taskTitle={completedTask?.title ?? "タスク"}
        focusedDurationLabel={completedSession ? formatDuration(completedSession.focusedDurationMs) : null}
        nextModeLabel={modeLabels[timer.mode]}
        remainingTodayCount={todayOpenTaskCount}
        nextTaskTitle={suggestedNextTask?.title ?? null}
        nextTaskDetail={suggestedNextTaskDetail}
        onStartBreak={() => {
          setBreakResumeTaskId(suggestedNextTask?.id ?? null);
          setCompletedSession(null);
          startTimer();
        }}
        onStartNextTask={() => {
          const taskId = suggestedNextTask?.id;
          setBreakResumeTaskId(null);
          setCompletedSession(null);
          if (!taskId) return;
          selectMode("work");
          start(taskId);
        }}
        onContinueTask={() => {
          const taskId = completedSession?.taskId;
          setBreakResumeTaskId(null);
          setCompletedSession(null);
          if (!taskId) return;
          selectMode("work");
          start(taskId);
        }}
        onCompleteTask={() => {
          const task = completedTask;
          setBreakResumeTaskId(null);
          setCompletedSession(null);
          if (task?.status === "open") void toggleTask(task.id);
        }}
        onOpenTaskList={() => {
          const resumeTask = suggestedNextTask;
          const resumeTitle = resumeTask
            ? `${resumeTask.title}を次の候補として開いています`
            : "一覧で次のタスクを選べます";
          const resumeDetail = resumeTask
            ? `${suggestedNextTaskDetail ?? "休憩前に次の候補を調整できます。"}${todayOpenTaskCount > 0 ? ` 今日の未完了はあと${todayOpenTaskCount}件です。` : ""}`
            : todayOpenTaskCount > 0
              ? `今日の未完了はあと${todayOpenTaskCount}件です。休憩前に一覧で優先順位を整えられます。`
              : "今日は優先タスクがひと区切りです。一覧で次の候補を見直せます。";
          setCompletedSession(null);
          setSettingsOpen(false);
          setTaskDrawerResumeContext({
            label: "セッション完了後のつづき",
            title: resumeTitle,
            detail: resumeDetail,
            taskId: resumeTask?.id ?? null,
            actionLabel: "候補を開く"
          });
          setTasksOpen(true);
        }}
        onClose={closeCompletedSession}
      />
    </main>
  );
}
