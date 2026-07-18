import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
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
import { colorPresets, fontOptions, positionPresets, type PositionPreset } from "./types/settings";
import { getAdaptivePalette, fallbackBackgroundRgb, getStrongAccent, type AdaptivePalette } from "./utils/adaptiveColor";

export default function App() {
  const { settings, updateSettings, undoSettings, resetSettings, storageMessage, setStorageMessage, saveState } = useLocalStorageSettings();
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
  } = usePomodoroTimer(settings);
  const { backgrounds, addBackgrounds, removeBackground, reorderBackgrounds, backgroundMessage, setBackgroundMessage } = useCustomBackgrounds();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLauncherVisible, setSettingsLauncherVisible] = useState(false);
  const [adaptivePalette, setAdaptivePalette] = useState<AdaptivePalette>(() => getAdaptivePalette(fallbackBackgroundRgb, settings.overlayOpacity));
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsLauncherTimeoutRef = useRef<number | null>(null);
  const now = useClock(settings.showSeconds);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const hideSettingsLauncher = useCallback(() => {
    if (settingsLauncherTimeoutRef.current !== null) window.clearTimeout(settingsLauncherTimeoutRef.current);
    settingsLauncherTimeoutRef.current = null;
    setSettingsLauncherVisible(false);
  }, []);
  const showSettingsLauncher = useCallback(() => {
    if (settingsLauncherTimeoutRef.current !== null) window.clearTimeout(settingsLauncherTimeoutRef.current);
    setSettingsLauncherVisible(true);
    settingsLauncherTimeoutRef.current = window.setTimeout(() => {
      settingsLauncherTimeoutRef.current = null;
      setSettingsLauncherVisible(false);
    }, 4_500);
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
    if (settings.showTimer && timer.status === "idle" && !settings.timerSetupCollapsed) slots[settings.timerPosition].push(
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
  }, [now, settings, timer, start, selectMode, selectProgram, selectCategory, setCustomDurationMinutes, updateSettings]);

  const liveMessage = backgroundMessage || announcement || storageMessage;
  const selectedPalette = settings.colorPreset === "custom"
    ? { text: settings.textColor, accent: settings.accentColor, accentStrong: getStrongAccent(settings.accentColor) }
    : colorPresets[settings.colorPreset];
  const displayColor = settings.matchBackgroundColors ? adaptivePalette.text : selectedPalette.text;
  const appStyle = {
    color: displayColor,
    fontFamily: fontOptions[settings.fontFamily as keyof typeof fontOptions] ?? fontOptions.system,
    "--adaptive-accent": settings.matchBackgroundColors ? adaptivePalette.accent : selectedPalette.accent,
    "--adaptive-accent-strong": settings.matchBackgroundColors ? adaptivePalette.accentStrong : selectedPalette.accentStrong,
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

  useEffect(() => () => {
    if (settingsLauncherTimeoutRef.current !== null) window.clearTimeout(settingsLauncherTimeoutRef.current);
  }, []);

  const handleShellPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (settingsOpen || !(event.target instanceof Element)) return;
    const interactiveTarget = event.target.closest("button, input, select, textarea, a, [role='dialog'], .clock-widget, .floating-timer, .timer-card");
    if (!interactiveTarget) showSettingsLauncher();
  };

  return (
    <main
      className="app-shell"
      style={appStyle}
      onPointerUp={handleShellPointerUp}
    >
      <BackgroundSlideshow
        intervalSec={settings.slideshowIntervalSec}
        overlayOpacity={settings.overlayOpacity}
        backgroundChoice={settings.backgroundChoice}
        customBackgrounds={backgrounds}
        clockPosition={settings.clockDatePosition}
        backgroundPosition={settings.backgroundPosition}
        backgroundScale={settings.backgroundScale}
        backgroundFrames={settings.backgroundFrames}
        onFrameChange={(backgroundId, backgroundPosition, backgroundScale) => updateSettings({
          backgroundPosition,
          backgroundScale,
          backgroundFrames: {
            ...settings.backgroundFrames,
            [backgroundId]: { position: backgroundPosition, scale: backgroundScale }
          }
        })}
        onPaletteChange={setAdaptivePalette}
      />
      <div className="dashboard" aria-label="FocusBoard ダッシュボード">
        {positionPresets.map((position) => (
          <div className={`slot slot--${position}`} key={position}>{slotContent[position]}</div>
        ))}
      </div>
      {(settings.showClock || settings.showDate) && <ClockWidget now={now} settings={settings} textColor={adaptivePalette.text} onChange={updateSettings} onMessage={showMessage} />}

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
        />
      )}

      {liveMessage && <div className="toast" role="status" aria-live="polite">{liveMessage}</div>}
      <button className="visually-hidden settings-reveal-shortcut" type="button" onClick={() => setSettingsOpen(true)}>設定を開く</button>
      {settingsLauncherVisible && (
        <button
          className="settings-button"
          type="button"
          onClick={() => {
            hideSettingsLauncher();
            setSettingsOpen(true);
          }}
          ref={settingsButtonRef}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
          <span>設定</span>
        </button>
      )}

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        saveState={saveState}
        onChange={updateSettings}
        onUndo={undoSettings}
        onClose={closeSettings}
        fullscreenSupported={fullscreenSupported}
        onFullscreenToggle={handleFullscreenToggle}
        onResetSettings={() => { resetSettings(); showMessage("設定を初期値に戻しました。"); }}
        onClearTimer={clearTimer}
        onMessage={showMessage}
        customBackgrounds={backgrounds}
        onAddBackgrounds={addBackgrounds}
        onRemoveBackground={async (id) => {
          const removed = await removeBackground(id);
          if (removed && settings.backgroundChoice === `custom:${id}`) updateSettings({ backgroundChoice: "slideshow" });
        }}
        onReorderBackgrounds={reorderBackgrounds}
      />
    </main>
  );
}
