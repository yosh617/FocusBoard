import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BackgroundSlideshow } from "./components/BackgroundSlideshow";
import { ClockWidget } from "./components/ClockWidget";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { FloatingTimer } from "./components/FloatingTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { useClock } from "./hooks/useClock";
import { useLocalStorageSettings } from "./hooks/useLocalStorageSettings";
import { usePomodoroTimer } from "./hooks/usePomodoroTimer";
import { useCustomBackgrounds } from "./hooks/useCustomBackgrounds";
import { colorPresets, fontOptions, positionPresets, type PositionPreset } from "./types/settings";
import { getAdaptivePalette, fallbackBackgroundRgb, getStrongAccent, type AdaptivePalette } from "./utils/adaptiveColor";

export default function App() {
  const { settings, updateSettings, resetSettings, storageMessage, setStorageMessage } = useLocalStorageSettings();
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
  const { backgrounds, addBackgrounds, removeBackground, backgroundMessage, setBackgroundMessage } = useCustomBackgrounds();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adaptivePalette, setAdaptivePalette] = useState<AdaptivePalette>(() => getAdaptivePalette(fallbackBackgroundRgb, settings.overlayOpacity));
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const now = useClock(settings.showSeconds);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const showMessage = useCallback((message: string) => {
    setStorageMessage(message);
    setAnnouncement("");
    setBackgroundMessage("");
  }, [setAnnouncement, setStorageMessage, setBackgroundMessage]);

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

  return (
    <main
      className="app-shell"
      style={appStyle}
    >
      <BackgroundSlideshow
        intervalSec={settings.slideshowIntervalSec}
        overlayOpacity={settings.overlayOpacity}
        backgroundChoice={settings.backgroundChoice}
        customBackgrounds={backgrounds}
        onPaletteChange={setAdaptivePalette}
      />
      <div className="dashboard" aria-label="FocusBoard ダッシュボード">
        {positionPresets.map((position) => (
          <div className={`slot slot--${position}`} key={position}>{slotContent[position]}</div>
        ))}
      </div>
      {(settings.showClock || settings.showDate) && <ClockWidget now={now} settings={settings} onChange={updateSettings} onMessage={showMessage} />}

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
      <button
        className="settings-button"
        type="button"
        aria-label="設定を開く"
        onClick={() => setSettingsOpen(true)}
        ref={settingsButtonRef}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      </button>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={closeSettings}
        onResetSettings={() => { resetSettings(); showMessage("設定を初期値に戻しました。"); }}
        onClearTimer={clearTimer}
        onMessage={showMessage}
        customBackgrounds={backgrounds}
        onAddBackgrounds={addBackgrounds}
        onRemoveBackground={async (id) => {
          const removed = await removeBackground(id);
          if (removed && settings.backgroundChoice === `custom:${id}`) updateSettings({ backgroundChoice: "slideshow" });
        }}
      />
    </main>
  );
}
