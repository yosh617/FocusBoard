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
    expect(screen.getByRole("dialog", { name: "表示設定" })).toBeTruthy();
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
    fireEvent.change(screen.getByRole("slider", { name: /タイマー背景の不透明度/ }), { target: { value: "60" } });
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--timer-background-opacity")).toBe("0.6");
  });

  it("uses the rounded font picker and enables adaptive colors", () => {
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    const fontPicker = screen.getByRole("button", { name: /フォント.*システム/ });
    fireEvent.click(fontPicker);
    fireEvent.click(screen.getByRole("option", { name: /丸ゴシック/ }));
    expect(screen.getByRole("button", { name: /フォント.*丸ゴシック/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /フォント.*丸ゴシック/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "フォント" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "表示設定" })).toBeTruthy();

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

    const adaptiveToggle = screen.getByLabelText("色を背景に合わせる") as HTMLInputElement;
    fireEvent.click(adaptiveToggle);
    expect(adaptiveToggle.checked).toBe(true);
    expect(screen.queryByLabelText("文字色")).toBeNull();
    expect(screen.getByRole("status", { name: "背景連動カラー" }).textContent).toContain("背景から自動調整中");
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

  it("keeps settings hidden until an empty area is tapped", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "設定" })).toBeNull();
    revealSettings();
    expect(screen.getByRole("button", { name: "設定" })).toBeTruthy();
  });
});
