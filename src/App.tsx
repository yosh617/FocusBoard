import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackgroundSlideshow } from "./components/BackgroundSlideshow";
import { ClockDisplay } from "./components/ClockDisplay";
import { DateDisplay } from "./components/DateDisplay";
import { PomodoroTimer } from "./components/PomodoroTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { useClock } from "./hooks/useClock";
import { useLocalStorageSettings } from "./hooks/useLocalStorageSettings";
import { usePomodoroTimer } from "./hooks/usePomodoroTimer";
import { fontOptions, positionPresets, type PositionPreset } from "./types/settings";

export default function App() {
  const { settings, updateSettings, resetSettings, storageMessage, setStorageMessage } = useLocalStorageSettings();
  const { timer, announcement, setAnnouncement, start, pause, reset, selectMode, clearTimer } = usePomodoroTimer(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const now = useClock(settings.showSeconds);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const showMessage = useCallback((message: string) => {
    setStorageMessage(message);
    setAnnouncement("");
  }, [setAnnouncement, setStorageMessage]);

  const slotContent = useMemo(() => {
    const slots = Object.fromEntries(positionPresets.map((position) => [position, [] as ReactNode[]])) as Record<PositionPreset, ReactNode[]>;
    if (settings.showClock) slots[settings.clockPosition].push(<ClockDisplay now={now} settings={settings} key="clock" />);
    if (settings.showDate) slots[settings.datePosition].push(<DateDisplay now={now} fontSize={settings.dateFontSize} key="date" />);
    if (settings.showTimer) slots[settings.timerPosition].push(
      <PomodoroTimer
        timer={timer}
        fontSize={settings.timerFontSize}
        onStart={start}
        onPause={pause}
        onReset={reset}
        onSelectMode={selectMode}
        key="timer"
      />
    );
    return slots;
  }, [now, settings, timer, start, pause, reset, selectMode]);

  const liveMessage = announcement || storageMessage;

  useEffect(() => {
    if (!liveMessage) return;
    const timeout = window.setTimeout(() => {
      setAnnouncement("");
      setStorageMessage("");
    }, 7_000);
    return () => window.clearTimeout(timeout);
  }, [liveMessage, setAnnouncement, setStorageMessage]);

  return (
    <main
      className="app-shell"
      style={{ color: settings.textColor, fontFamily: fontOptions[settings.fontFamily as keyof typeof fontOptions] ?? fontOptions.system }}
    >
      <BackgroundSlideshow intervalSec={settings.slideshowIntervalSec} overlayOpacity={settings.overlayOpacity} />
      <div className="dashboard" aria-label="Study Clock ダッシュボード">
        {positionPresets.map((position) => (
          <div className={`slot slot--${position}`} key={position}>{slotContent[position]}</div>
        ))}
      </div>

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
      />
    </main>
  );
}
