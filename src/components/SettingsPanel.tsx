import { useEffect, useRef, type ReactNode } from "react";
import { positionPresets, type AppSettings, type PositionPreset } from "../types/settings";
import { ResetPanel } from "./ResetPanel";

type Props = {
  open: boolean;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onResetSettings: () => void;
  onClearTimer: () => void;
  onMessage: (message: string) => void;
};

const positionLabels: Record<PositionPreset, string> = {
  center: "中央",
  top: "上",
  bottom: "下",
  "top-left": "左上",
  "top-right": "右上",
  "bottom-left": "左下",
  "bottom-right": "右下"
};

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="toggle" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </div>
  );
}

function Range({ id, label, value, min, max, step = 1, suffix = "", onChange }: {
  id: string; label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void;
}) {
  return (
    <div className="setting-control">
      <label htmlFor={id}>{label}<output htmlFor={id}>{value}{suffix}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Select({ id, label, value, onChange, children }: {
  id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
  return (
    <div className="setting-control">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </div>
  );
}

export function SettingsPanel({ open, settings, onChange, onClose, onResetSettings, onClearTimer, onMessage }: Props) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const positionSelect = (id: string, label: string, value: PositionPreset, key: "clockPosition" | "datePosition" | "timerPosition") => (
    <Select id={id} label={label} value={value} onChange={(next) => onChange({ [key]: next as PositionPreset })}>
      {positionPresets.map((position) => <option value={position} key={position}>{positionLabels[position]}</option>)}
    </Select>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={drawerRef}>
        <header className="settings-header">
          <div><p className="eyebrow">STUDY CLOCK</p><h2 id="settings-title">表示設定</h2></div>
          <button className="icon-button" type="button" aria-label="設定を閉じる" onClick={onClose} ref={closeRef}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="settings-content">
          <section className="settings-section" aria-labelledby="visibility-heading">
            <h3 id="visibility-heading">表示</h3>
            <Toggle id="show-clock" label="時計" checked={settings.showClock} onChange={(showClock) => onChange({ showClock })} />
            <Toggle id="show-date" label="日付と曜日" checked={settings.showDate} onChange={(showDate) => onChange({ showDate })} />
            <Toggle id="show-timer" label="ポモドーロ" checked={settings.showTimer} onChange={(showTimer) => onChange({ showTimer })} />
            <Toggle id="show-seconds" label="秒を表示" checked={settings.showSeconds} onChange={(showSeconds) => onChange({ showSeconds })} />
            <Toggle id="use-12-hour" label="12時間表示" checked={settings.use12Hour} onChange={(use12Hour) => onChange({ use12Hour })} />
          </section>

          <section className="settings-section" aria-labelledby="appearance-heading">
            <h3 id="appearance-heading">文字と背景</h3>
            <Range id="clock-size" label="時計サイズ" value={settings.clockFontSize} min={56} max={220} suffix="px" onChange={(clockFontSize) => onChange({ clockFontSize })} />
            <Range id="date-size" label="日付サイズ" value={settings.dateFontSize} min={16} max={64} suffix="px" onChange={(dateFontSize) => onChange({ dateFontSize })} />
            <Range id="timer-size" label="タイマーサイズ" value={settings.timerFontSize} min={36} max={120} suffix="px" onChange={(timerFontSize) => onChange({ timerFontSize })} />
            <Select id="font-family" label="フォント" value={settings.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })}>
              <option value="system">システム</option><option value="rounded">丸ゴシック</option><option value="serif">明朝</option><option value="mono">等幅</option>
            </Select>
            <div className="setting-row">
              <label htmlFor="text-color">文字色</label>
              <input id="text-color" className="color-input" type="color" value={settings.textColor} onChange={(event) => onChange({ textColor: event.target.value })} />
            </div>
            <Range id="overlay" label="背景の暗さ" value={Math.round(settings.overlayOpacity * 100)} min={0} max={85} suffix="%" onChange={(value) => onChange({ overlayOpacity: value / 100 })} />
            <Range id="slideshow" label="背景切り替え" value={settings.slideshowIntervalSec} min={10} max={600} step={10} suffix="秒" onChange={(slideshowIntervalSec) => onChange({ slideshowIntervalSec })} />
          </section>

          <section className="settings-section" aria-labelledby="position-heading">
            <h3 id="position-heading">配置</h3>
            {positionSelect("clock-position", "時計", settings.clockPosition, "clockPosition")}
            {positionSelect("date-position", "日付", settings.datePosition, "datePosition")}
            {positionSelect("timer-position", "タイマー", settings.timerPosition, "timerPosition")}
            <p className="settings-help">同じ場所を選んだ要素は、重ならないよう縦に並びます。</p>
          </section>

          <section className="settings-section" aria-labelledby="pomodoro-heading">
            <h3 id="pomodoro-heading">ポモドーロ</h3>
            <Range id="work-minutes" label="作業時間" value={settings.workMinutes} min={1} max={180} suffix="分" onChange={(workMinutes) => onChange({ workMinutes })} />
            <Range id="short-minutes" label="短い休憩" value={settings.shortBreakMinutes} min={1} max={60} suffix="分" onChange={(shortBreakMinutes) => onChange({ shortBreakMinutes })} />
            <Range id="long-minutes" label="長い休憩" value={settings.longBreakMinutes} min={1} max={120} suffix="分" onChange={(longBreakMinutes) => onChange({ longBreakMinutes })} />
            <Toggle id="sound-enabled" label="終了音" checked={settings.soundEnabled} onChange={(soundEnabled) => onChange({ soundEnabled })} />
            <p className="settings-help">時間の変更は次回のResetまたはモード切り替えから反映されます。</p>
          </section>

          <ResetPanel onResetSettings={onResetSettings} onClearTimer={onClearTimer} onMessage={onMessage} />
        </div>
      </aside>
    </div>
  );
}
