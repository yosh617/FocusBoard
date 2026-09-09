import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClockWidget } from "./ClockWidget";
import { defaultSettings } from "../types/settings";

const getRect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
}) as DOMRect;

function firePointer(target: Element, type: string, values: { pointerId: number; clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  fireEvent(target, event);
}

describe("ClockWidget", () => {
  it("shows center guides and snaps the display to the viewport center while dragging", () => {
    const onChange = vi.fn();
    render(<ClockWidget
      now={new Date("2026-09-09T12:34:00+09:00")}
      settings={{ ...defaultSettings, clockDatePosition: { x: .4, y: .4 }, clockDateAlignment: "center" }}
      textColor="#17345f"
      onChange={onChange}
      onMessage={vi.fn()}
      orientation="landscape"
    />);

    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    Object.defineProperty(display, "getBoundingClientRect", { configurable: true, value: () => getRect(309.6, 247.2, 200, 120) });
    onChange.mockClear();
    firePointer(display, "pointerdown", { pointerId: 1, clientX: 400, clientY: 300 });
    firePointer(display, "pointermove", { pointerId: 1, clientX: 502.4, clientY: 376.8 });

    expect(document.querySelector(".clock-position-guides__vertical")).not.toBeNull();
    expect(document.querySelector(".clock-position-guides__horizontal")).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ clockDatePosition: { x: .5, y: .5 } });

    firePointer(display, "pointerup", { pointerId: 1, clientX: 502.4, clientY: 376.8 });
    expect(document.querySelector(".clock-position-guides")).toBeNull();
  });

  it("snaps the visible clock center even when its alignment is left", () => {
    const onChange = vi.fn();
    render(<ClockWidget
      now={new Date("2026-09-09T12:34:00+09:00")}
      settings={{ ...defaultSettings, clockDatePosition: { x: .3, y: .4 }, clockDateAlignment: "left" }}
      textColor="#17345f"
      onChange={onChange}
      onMessage={vi.fn()}
      orientation="landscape"
    />);

    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    Object.defineProperty(display, "getBoundingClientRect", { configurable: true, value: () => getRect(307.2, 247, 200, 120) });
    onChange.mockClear();
    firePointer(display, "pointerdown", { pointerId: 1, clientX: 300, clientY: 300 });
    firePointer(display, "pointermove", { pointerId: 1, clientX: 400.8, clientY: 320 });

    expect(document.querySelector(".clock-position-guides__vertical")).not.toBeNull();
    expect(document.querySelector(".clock-position-guides__horizontal")).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ clockDatePosition: { x: expect.closeTo(.40234375, 5) } });
  });
});
