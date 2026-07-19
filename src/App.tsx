import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BackgroundSlideshow } from "./components/BackgroundSlideshow";
import { ClockWidget } from "./components/ClockWidget";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { FloatingTimer } from "./components/FloatingTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { useClock } from "./hooks/useClock";
import { useLocalStorageSettings } from "./hooks/useLocalStorageSettings";
import { usePomodoroTimer } from "./hooks/usePomodoroTimer";
import { useCustomBackgrounds } from "./hooks/useCustomBackgrounds";
import { useFullscreen } from "./hooks/useFullscreen";
import { useOrientation } from "./hooks/useOrientation";
import { defaultSettings, fontOptions, positionPresets, type OrientationPositions, type PositionPreset } from "./types/settings";
import { getAdaptivePalette, fallbackBackgroundRgb, getStrongAccent, type AdaptivePalette } from "./utils/adaptiveColor";

export default function App() {
  const { settings, updateSettings, undoSettings, resetSettings, storageMessage, setStorageMessage, saveState } = useLocalStorageSettings();
  const orientation = useOrientation();
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
  } = usePomodoroTimer(settings, orientation);
  const { backgrounds, addBackgrounds, removeBackground, reorderBackgrounds, backgroundMessage, setBackgroundMessage } = useCustomBackgrounds();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsButtonVisible, setSettingsButtonVisible] = useState(false);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [activeBackgroundId, setActiveBackgroundId] = useState<string>(() => settings.backgroundChoice === "slideshow" ? "bg1" : settings.backgroundChoice);
  const [adaptivePalette, setAdaptivePalette] = useState<AdaptivePalette>(() => getAdaptivePalette(fallbackBackgroundRgb, settings.overlayOpacity));
  const now = useClock(settings.showSeconds);

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

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const revealSettingsButton = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) setSettingsButtonVisible(true);
  }, []);
  const startBackgroundEditing = useCallback(() => {
    setSettingsOpen(false);
    setBackgroundEditing(true);
  }, []);
  const showMessage = useCallback((message: string) => {
    setStorageMessage(message);
    setAnnouncement("");
    setBackgroundMessage("");
  }, [setAnnouncement, setStorageMessage, setBackgroundMessage]);
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

  const slotContent = useMemo(() => {
    const slots = Object.fromEntries(positionPresets.map((position) => [position, [] as ReactNode[]])) as Record<PositionPreset, ReactNode[]>;
    if (settings.showTimer && timer.status === "idle" && !settings.timerSetupCollapsed) slots[settings.timerPositions[orientation]].push(
      <PomodoroTimer
        timer={timer}
        fontSize={settings.timerFontSize}
        onStart={start}
        onSelectMode={selectMode}
        onSelectProgram={selectProgram}
        onSelectCategory={selectCategory}
        onSetDuration={setCustomDurationMinutes}
        onCollapse={() => updateSettings({ timerSetupCollapsed: true })}
        key="timer"
      />
    );
    return slots;
  }, [orientation, settings, timer, start, selectMode, selectProgram, selectCategory, setCustomDurationMinutes, updateSettings]);

  const liveMessage = backgroundMessage || announcement || storageMessage;
  const clockColor = activeClockSetting.matchColors ? adaptivePalette.text : activeClockSetting.color;
  const timerColor = settings.matchTimerBackgroundColors ? adaptivePalette.accent : settings.timerColor;
  const appStyle = {
    color: clockColor,
    fontFamily: fontOptions[settings.fontFamily as keyof typeof fontOptions] ?? fontOptions.system,
    "--timer-accent": timerColor,
    "--timer-accent-strong": getStrongAccent(timerColor),
    "--timer-background-opacity": settings.timerBackgroundOpacity
  } as CSSProperties;

  useEffect(() => {
    if (!liveMessage) return;
    const timeout = window.setTimeout(() => {
      setAnnouncement("");
      setStorageMessage("");
      setBackgroundMessage("");
    }, 7_000);
    return () => window.clearTimeout(timeout);
  }, [liveMessage, setAnnouncement, setStorageMessage, setBackgroundMessage]);

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
      <div className="dashboard" aria-label="FocusBoard ダッシュボード" onPointerUp={revealSettingsButton}>
        {positionPresets.map((position) => (
          <div className={`slot slot--${position}`} key={position}>{slotContent[position]}</div>
        ))}
      </div>
      {(settings.showClock || settings.showDate) && <ClockWidget now={now} settings={clockDisplaySettings} textColor={clockColor} onChange={updateClockSettings} onMessage={showMessage} orientation={orientation} />}

      {settings.showTimer && (timer.status !== "idle" || settings.timerSetupCollapsed) && (
        <FloatingTimer
          timer={timer}
          onStart={start}
          onPause={pause}
          onReset={() => {
            reset();
            updateSettings({ timerSetupCollapsed: false });
          }}
          onPositionChange={setFloatingPosition}
          orientation={orientation}
        />
      )}

      {liveMessage && <div className="toast" role="status" aria-live="polite">{liveMessage}</div>}
      {settingsButtonVisible && <button className="settings-button" type="button" aria-label="設定" title="設定を開く" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
          <span>設定</span>
      </button>}

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        orientation={orientation}
        saveState={saveState}
        onChange={updateSettings}
        onUndo={undoSettings}
        onClose={closeSettings}
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
    </main>
  );
}
