import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());

  const revealSettings = () => fireEvent.pointerUp(screen.getByRole("main"));

  it("starts in setup mode, collapses to a floating timer, and opens settings", () => {
    render(<App />);
    expect(screen.getByLabelText("タイマー設定")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start timer/i }));
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
    expect(screen.queryByLabelText("タイマー設定")).toBeNull();
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
  });

  it("collapses the idle timer into the same circular timer UI and returns on reset", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "タイマー設定をしまう" }));
    expect(screen.queryByLabelText("タイマー設定")).toBeNull();
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
    expect(screen.getByRole("button", { name: "開始" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "リセットして設定へ戻る" }));
    expect(screen.getByLabelText("タイマー設定")).toBeTruthy();
  });

  it("applies a shared opacity to timer backgrounds", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    fireEvent.change(screen.getByRole("slider", { name: /タイマー背景の不透明度/ }), { target: { value: "60" } });
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--timer-background-opacity")).toBe("0.6");
  });

  it("requests fullscreen from the display settings", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    try {
      render(<App />);
      revealSettings();
      fireEvent.click(screen.getByRole("button", { name: "設定" }));
      const fullscreen = screen.getByLabelText("全画面表示") as HTMLInputElement;
      expect(fullscreen.disabled).toBe(false);
      fireEvent.click(fullscreen);
      await act(async () => {});
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      expect(fullscreen.checked).toBe(true);
    } finally {
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
  });

  it("shows readable size labels without pixel units", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("tab", { name: "時計と日付" }));
    expect(screen.getAllByText("標準").length).toBe(2);
    expect(screen.queryByText(/px/)).toBeNull();
  });

  it("changes the date display format from clock settings", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("tab", { name: "時計と日付" }));
    fireEvent.change(screen.getByLabelText("日付の形式"), { target: { value: "mm/dd weekday" } });
    expect(document.querySelector(".date")?.textContent).toMatch(/^\d{2}\/\d{2} /);
  });

  it("selects a background image for direct editing on the home screen", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    fireEvent.change(screen.getByLabelText("配置を調整する背景"), { target: { value: "bg2" } });
    expect(screen.getByRole("button", { name: "設定を閉じて画面上で調整" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "設定を閉じて画面上で調整" }));
    expect(screen.queryByRole("dialog", { name: "設定" })).toBeNull();
    expect(document.querySelectorAll(".background__image")[1].classList.contains("background__image--active")).toBe(true);
  });

  it("can minimize the floating timer without losing its main controls", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Start timer/i }));
    const timer = screen.getByRole("button", { name: /クリックでミニ表示にする/ });
    fireEvent.click(timer);
    expect(document.querySelector(".floating-timer--compact")).not.toBeNull();
    expect(document.querySelector(".floating-timer--compact .progress-ring")).not.toBeNull();
    expect(document.querySelector(".floating-timer--compact strong")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    fireEvent.click(screen.getByRole("button", { name: /クリックで通常表示に戻す/ }));
    expect(document.querySelector(".floating-timer--compact")).toBeNull();
    expect(screen.getByRole("button", { name: "リセットして設定へ戻る" })).toBeTruthy();
  });

  it("reclamps the floating timer when expanding from a compact edge position", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 568 });
    try {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: /Start timer/i }));
      const timer = screen.getByRole("button", { name: /クリックでミニ表示にする/ });
      Object.defineProperty(timer, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ width: timer.closest(".floating-timer")?.classList.contains("floating-timer--compact") ? 80 : 224, height: timer.closest(".floating-timer")?.classList.contains("floating-timer--compact") ? 80 : 224 })
      });
      fireEvent.click(timer);
      for (let index = 0; index < 12; index += 1) fireEvent.keyDown(timer, { key: "ArrowLeft" });
      fireEvent.click(screen.getByRole("button", { name: /クリックで通常表示に戻す/ }));
      act(() => {});
      expect(Number.parseFloat(document.querySelector<HTMLElement>(".floating-timer")?.style.left ?? "0")).toBeGreaterThanOrEqual(37.5);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("keeps the right-aligned clock display inside the viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      Object.defineProperty(display, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 60, right: 340, top: 520, bottom: 670, width: 280, height: 150 })
      });
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 100, clientY: 600 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 100, clientY: 600 });
      fireEvent.click(screen.getByRole("radio", { name: "右" }));
      expect(Number.parseFloat(document.querySelector<HTMLElement>(".clock-widget")?.style.left ?? "0")).toBeGreaterThanOrEqual(29.2);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("shows the app version and exports settings from data management", () => {
    const createObjectURL = vi.fn(() => "blob:focusboard-settings");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    try {
      render(<App />);
      revealSettings();
      fireEvent.click(screen.getByRole("button", { name: "設定" }));
      fireEvent.click(screen.getByRole("tab", { name: "データ管理" }));
      expect(screen.getByText(/^v(?:\d+\.\d+\.\d+|開発版)$/)).toBeTruthy();
      expect(screen.getByRole("heading", { name: "設定をバックアップ" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "設定をエクスポート" }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:focusboard-settings");
    } finally {
      click.mockRestore();
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("uses the rounded font picker and enables adaptive colors", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("radio", { name: "丸ゴシック" }));
    expect(screen.getByRole("radio", { name: "丸ゴシック" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();

    const colorThemes = within(screen.getByRole("radiogroup", { name: "カラーテーマ" }));
    fireEvent.click(colorThemes.getByRole("radio", { name: "ラベンダー" }));
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--adaptive-accent")).toBe("#baa9e3");

    fireEvent.click(colorThemes.getByRole("radio", { name: "カスタム" }));
    const textColor = screen.getByLabelText("文字色") as HTMLInputElement;
    const accentColor = screen.getByLabelText("アクセント色") as HTMLInputElement;
    fireEvent.change(textColor, { target: { value: "#112233" } });
    fireEvent.change(accentColor, { target: { value: "#aabbcc" } });
    expect(textColor.value).toBe("#112233");
    expect(accentColor.value).toBe("#aabbcc");

    const adaptiveToggle = screen.getByLabelText("時計の位置に合わせて色を調整") as HTMLInputElement;
    fireEvent.click(adaptiveToggle);
    expect(adaptiveToggle.checked).toBe(true);
    expect(screen.queryByLabelText("文字色")).toBeNull();
    expect(adaptiveToggle.checked).toBe(true);
  });

  it("keeps the clock and date readable independently of the selected theme", () => {
    render(<App />);
    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    const colorThemes = within(screen.getByRole("radiogroup", { name: "カラーテーマ" }));
    fireEvent.click(colorThemes.getByRole("radio", { name: "ローズ" }));
    expect(display.style.color).toBe("rgb(18, 42, 76)");
  });

  it("edits the clock and calendar together from the display itself", () => {
    render(<App />);
    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    fireEvent.pointerDown(display, { pointerId: 1, clientX: 400, clientY: 500 });
    fireEvent.pointerUp(display, { pointerId: 1, clientX: 400, clientY: 500 });
    expect(screen.getByRole("region", { name: "時計とカレンダーの表示設定" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "中央" }));
    expect(screen.getByRole("radio", { name: "中央" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: "時計の大きさ" }), { target: { value: "128" } });
    expect(document.querySelector<HTMLElement>(".clock")?.style.fontSize).toBe("128px");
  });

  it("shows the clock gesture hint briefly after tapping the clock", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(false);
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 400, clientY: 500 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 400, clientY: 500 });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(true);
      act(() => { vi.advanceTimersByTime(2_500); });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the clock editor within the viewport near the right edge", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      Object.defineProperty(display, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 760, top: 120, width: 80, height: 180, right: 840, bottom: 300 })
      });
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 800, clientY: 210 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 800, clientY: 210 });
      const editor = screen.getByRole("region", { name: "時計とカレンダーの表示設定" }) as HTMLElement;
      expect(Number.parseInt(editor.style.left, 10)).toBeLessThanOrEqual(424);
      expect(Number.parseInt(editor.style.left, 10)).toBeGreaterThanOrEqual(16);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("keeps settings hidden until an empty area is tapped", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "設定" })).toBeNull();
    revealSettings();
    expect(screen.getByRole("button", { name: "設定" })).toBeTruthy();
  });
});
