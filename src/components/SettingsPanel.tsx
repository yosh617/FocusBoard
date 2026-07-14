import { useEffect, useRef, useState, type ReactNode } from "react";
import { colorPresets, fontOptions, positionPresets, type AppSettings, type BackgroundChoice, type ColorPreset, type FontOption, type PositionPreset } from "../types/settings";
import type { CustomBackground } from "../utils/backgroundStorage";
import { defaultBackgrounds } from "./BackgroundSlideshow";
import { ResetPanel } from "./ResetPanel";

type Props = {
  open: boolean;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onResetSettings: () => void;
  onClearTimer: () => void;
  onMessage: (message: string) => void;
  customBackgrounds: CustomBackground[];
  onAddBackgrounds: (files: File[]) => Promise<CustomBackground[]>;
  onRemoveBackground: (id: string) => Promise<void>;
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

type PickerBackgroundOption = { value: BackgroundChoice; label: string; path?: string; customId?: string };

const backgroundOptions: PickerBackgroundOption[] = [
  { value: "slideshow", label: "自動切替" },
  { value: "bg1", label: "モーニング", path: defaultBackgrounds[0] },
  { value: "bg2", label: "ラベンダー", path: defaultBackgrounds[1] },
  { value: "bg3", label: "スカイ", path: defaultBackgrounds[2] }
];

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

const fontChoices: { value: FontOption; label: string; sample: string }[] = [
  { value: "system", label: "システム", sample: "読みやすく自然" },
  { value: "rounded", label: "丸ゴシック", sample: "やわらかな印象" },
  { value: "serif", label: "明朝", sample: "落ち着いた印象" },
  { value: "mono", label: "等幅", sample: "数字を均等に" }
];

function FontSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = fontChoices.find((choice) => choice.value === value) ?? fontChoices[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="setting-control">
      <label id="font-family-label">フォント</label>
      <div className={`custom-select${open ? " custom-select--open" : ""}`} ref={rootRef}>
        <button
          className="custom-select__trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby="font-family-label font-family-value"
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          ref={triggerRef}
        >
          <span id="font-family-value" style={{ fontFamily: fontOptions[active.value] }}>{active.label}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
        </button>
        {open && (
          <div className="custom-select__menu" role="listbox" aria-labelledby="font-family-label">
            {fontChoices.map((choice) => (
              <button
                className={`custom-select__option${choice.value === value ? " custom-select__option--active" : ""}`}
                type="button"
                role="option"
                aria-selected={choice.value === value}
                onClick={() => {
                  onChange(choice.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                key={choice.value}
              >
                <span style={{ fontFamily: fontOptions[choice.value] }}><strong>{choice.label}</strong><small>{choice.sample}</small></span>
                {choice.value === value && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsPanel({
  open,
  settings,
  onChange,
  onClose,
  onResetSettings,
  onClearTimer,
  onMessage,
  customBackgrounds,
  onAddBackgrounds,
  onRemoveBackground
}: Props) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (drawerRef.current?.querySelector(".custom-select--open")) return;
        onClose();
      }
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

  const allBackgroundOptions: PickerBackgroundOption[] = [
    ...backgroundOptions,
    ...customBackgrounds.map((background) => ({
      value: `custom:${background.id}` as BackgroundChoice,
      label: background.name,
      path: background.url,
      customId: background.id
    }))
  ];

  const uploadBackgrounds = async (files: FileList | null) => {
    if (!files?.length) return;
    const created = await onAddBackgrounds([...files]);
    if (created[0]) onChange({ backgroundChoice: `custom:${created[0].id}` });
  };

  const positionSelect = (id: string, label: string, value: PositionPreset, key: "clockPosition" | "datePosition" | "timerPosition") => (
    <Select id={id} label={label} value={value} onChange={(next) => onChange({ [key]: next as PositionPreset })}>
      {positionPresets.map((position) => <option value={position} key={position}>{positionLabels[position]}</option>)}
    </Select>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={drawerRef}>
        <header className="settings-header">
          <div><p className="eyebrow">FOCUSBOARD</p><h2 id="settings-title">表示設定</h2></div>
          <button className="icon-button" type="button" aria-label="設定を閉じる" onClick={onClose} ref={closeRef}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="settings-content">
          <section className="settings-section" aria-labelledby="visibility-heading">
            <h3 id="visibility-heading">表示</h3>
            <Toggle id="show-timer" label="タイマー" checked={settings.showTimer} onChange={(showTimer) => onChange({ showTimer })} />
            <div className="settings-callout"><strong>時計とカレンダー</strong><span>画面上の表示をタップすると、そろえ方・表示・大きさをその場で変更できます。</span></div>
          </section>

          <section className="settings-section" aria-labelledby="appearance-heading">
            <h3 id="appearance-heading">文字と背景</h3>
            <div className="setting-control">
              <span className="setting-label" id="background-label">背景を選択</span>
              <div className="background-picker" role="radiogroup" aria-labelledby="background-label">
                {allBackgroundOptions.map((option) => (
                  <div className="background-option-wrap" key={option.value}>
                    <button
                      className={`background-option${settings.backgroundChoice === option.value ? " background-option--active" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={settings.backgroundChoice === option.value}
                      onClick={() => onChange({ backgroundChoice: option.value })}
                    >
                      <span
                        className={`background-option__preview${option.value === "slideshow" ? " background-option__preview--auto" : ""}`}
                        style={option.path ? { backgroundImage: option.path.startsWith("blob:") ? `url(${option.path})` : `url(${import.meta.env.BASE_URL}${option.path})` } : undefined}
                      >
                        {settings.backgroundChoice === option.value && (
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>
                        )}
                      </span>
                      <span className="background-option__label" title={option.label}>{option.label}</span>
                    </button>
                    {option.customId && (
                      <button
                        className="background-option__delete"
                        type="button"
                        aria-label={`${option.label}を削除`}
                        onClick={() => {
                          if (window.confirm(`${option.label}を背景一覧から削除しますか？`)) void onRemoveBackground(option.customId!);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 11v6M14 11v6M9 7l1-2h4l1 2m2 0-1 13H8L7 7" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <label className="background-upload" htmlFor="background-upload">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" /></svg>
                端末から画像を追加
              </label>
              <input
                className="visually-hidden"
                id="background-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  void uploadBackgrounds(event.target.files);
                  event.target.value = "";
                }}
              />
              <p className="settings-help">10MB以下の画像を最大8枚まで端末内に保存できます。追加画像がある場合、自動切替は追加画像を使用します。</p>
            </div>
            <Range id="timer-size" label="タイマーサイズ" value={settings.timerFontSize} min={36} max={120} suffix="px" onChange={(timerFontSize) => onChange({ timerFontSize })} />
            <Range id="timer-background-opacity" label="タイマー背景の不透明度" value={Math.round(settings.timerBackgroundOpacity * 100)} min={60} max={100} suffix="%" onChange={(value) => onChange({ timerBackgroundOpacity: value / 100 })} />
            <FontSelect value={settings.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} />
            <Toggle
              id="match-background-colors"
              label="色を背景に合わせる"
              checked={settings.matchBackgroundColors}
              onChange={(matchBackgroundColors) => onChange({ matchBackgroundColors })}
            />
            {settings.matchBackgroundColors ? (
              <div className="adaptive-color-note" role="status" aria-label="背景連動カラー">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /><circle cx="12" cy="12" r="4" /></svg>
                <span><strong>背景から自動調整中</strong><small>文字色とアクセント色を表示中の画像に合わせます</small></span>
              </div>
            ) : (
              <div className="setting-control color-theme-control">
                <span className="setting-label" id="color-theme-label">カラーテーマ</span>
                <div className="color-preset-grid" role="radiogroup" aria-labelledby="color-theme-label">
                  {(Object.entries(colorPresets) as [Exclude<ColorPreset, "custom">, (typeof colorPresets)[keyof typeof colorPresets]][]).map(([value, preset]) => (
                    <button
                      className={`color-preset${settings.colorPreset === value ? " color-preset--active" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={settings.colorPreset === value}
                      onClick={() => onChange({ colorPreset: value })}
                      key={value}
                    >
                      <span className="color-preset__swatches" aria-hidden="true">
                        <i style={{ background: preset.text }} /><i style={{ background: preset.accent }} /><i style={{ background: preset.accentStrong }} />
                      </span>
                      <span>{preset.label}</span>
                      {settings.colorPreset === value && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>}
                    </button>
                  ))}
                  <button
                    className={`color-preset${settings.colorPreset === "custom" ? " color-preset--active" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={settings.colorPreset === "custom"}
                    onClick={() => onChange({ colorPreset: "custom" })}
                  >
                    <span className="color-preset__swatches color-preset__swatches--custom" aria-hidden="true" />
                    <span>カスタム</span>
                    {settings.colorPreset === "custom" && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>}
                  </button>
                </div>
                {settings.colorPreset === "custom" && (
                  <div className="custom-color-fields">
                    <div className="setting-row">
                      <label htmlFor="text-color">文字色</label>
                      <input id="text-color" className="color-input" type="color" value={settings.textColor} onChange={(event) => onChange({ textColor: event.target.value })} />
                    </div>
                    <div className="setting-row">
                      <label htmlFor="accent-color">アクセント色</label>
                      <input id="accent-color" className="color-input" type="color" value={settings.accentColor} onChange={(event) => onChange({ accentColor: event.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <Range id="overlay" label="背景のやわらかさ" value={Math.round(settings.overlayOpacity * 100)} min={0} max={70} suffix="%" onChange={(value) => onChange({ overlayOpacity: value / 100 })} />
            {settings.backgroundChoice === "slideshow" && (
              <Range id="slideshow" label="背景切り替え" value={settings.slideshowIntervalSec} min={10} max={600} step={10} suffix="秒" onChange={(slideshowIntervalSec) => onChange({ slideshowIntervalSec })} />
            )}
          </section>

          <details className="settings-section settings-advanced">
            <summary>詳細設定</summary>
            <div className="settings-advanced__content">
            <Toggle id="use-12-hour" label="12時間表示" checked={settings.use12Hour} onChange={(use12Hour) => onChange({ use12Hour })} />
            <Range id="date-size" label="日付サイズ" value={settings.dateFontSize} min={16} max={64} suffix="px" onChange={(dateFontSize) => onChange({ dateFontSize })} />
            <h3 id="position-heading">開始前タイマーの配置</h3>
            {positionSelect("timer-position", "開始前タイマー", settings.timerPosition, "timerPosition")}
            <p className="settings-help">開始後の円形タイマーは直接ドラッグできます。</p>
            </div>
          </details>

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
