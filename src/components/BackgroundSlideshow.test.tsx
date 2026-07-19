import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getBackgroundImageLayout } from "../utils/backgroundFrame";
import { BackgroundSlideshow } from "./BackgroundSlideshow";

function firePointer(target: Element, type: string, values: { pointerId: number; clientX: number; clientY: number; pointerType?: string }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  fireEvent(target, event);
  return event;
}

describe("BackgroundSlideshow", () => {
  it("removes a failed image URL while preserving the gradient container", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={60} overlayOpacity={0.4} backgroundChoice="slideshow" customBackgrounds={[]} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    const firstLayer = container.querySelector<HTMLElement>(".background__image");
    expect(firstLayer?.querySelector("img")).toBeNull();
    expect(container.querySelector(".background")).not.toBeNull();
  });

  it("keeps a manually selected background active", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} />);
    const layers = container.querySelectorAll(".background__image");
    expect(layers[1].classList.contains("background__image--active")).toBe(true);
    expect(layers[0].classList.contains("background__image--active")).toBe(false);
  });

  it("creates horizontal and vertical pan space after zooming", () => {
    const layout = getBackgroundImageLayout(1_000, 500, 1_000, 500, { position: { x: .75, y: .25 }, scale: 150 });
    expect(layout).toEqual({ width: 1_500, height: 750, left: -375, top: -62.5 });
  });

  it("uses the selected image's own frame settings", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundPosition={{ x: .25, y: .75 }} backgroundScale={150} backgroundFrames={{ bg2: { position: { x: .1, y: .9 }, scale: 180 } }} />);
    const image = container.querySelector<HTMLImageElement>(".background__image--active img");
    expect(image).not.toBeNull();
    Object.defineProperties(image!, {
      naturalWidth: { value: 1_600 },
      naturalHeight: { value: 1_000 }
    });
    fireEvent.load(image!);
    const expected = getBackgroundImageLayout(1_600, 1_000, window.innerWidth, window.innerHeight, { position: { x: .1, y: .9 }, scale: 180 });
    expect(image?.style.width).toBe(`${expected?.width}px`);
    expect(image?.style.left).toBe(`${expected?.left}px`);
    expect(image?.style.top).toBe(`${expected?.top}px`);
  });

  it("keeps drag updates local and commits once when the pointer is released", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundScale={150} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    firePointer(gesture!, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 300 });
    firePointer(gesture!, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 250, clientY: 275 });
    firePointer(gesture!, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 250 });
    expect(onFrameChange).not.toHaveBeenCalled();
    firePointer(gesture!, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 250 });
    expect(onFrameChange).toHaveBeenCalledTimes(1);
    const [backgroundId, position, scale] = onFrameChange.mock.calls.at(-1) as [string, { x: number; y: number }, number];
    expect(backgroundId).toBe("bg2");
    expect(position.x).toBeLessThan(.5);
    expect(position.y).toBeGreaterThan(.5);
    expect(scale).toBe(150);
  });

  it("handles a two-finger touch as background zoom", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    firePointer(gesture!, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 200 });
    firePointer(gesture!, "pointerdown", { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 200 });
    firePointer(gesture!, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 75, clientY: 200 });
    firePointer(gesture!, "pointermove", { pointerId: 2, pointerType: "touch", clientX: 225, clientY: 200 });
    expect(onFrameChange).not.toHaveBeenCalled();
    firePointer(gesture!, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 75, clientY: 200 });
    firePointer(gesture!, "pointermove", { pointerId: 2, pointerType: "touch", clientX: 250, clientY: 200 });
    firePointer(gesture!, "pointerup", { pointerId: 2, pointerType: "touch", clientX: 225, clientY: 200 });
    expect(onFrameChange.mock.calls.at(-1)?.[2]).toBe(150);
    expect(onFrameChange.mock.calls.at(-1)?.[1].x).toBeLessThan(.5);
  });

  it("does not capture gestures until background editing starts", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    firePointer(gesture!, "pointerdown", { pointerId: 1, clientX: 200, clientY: 300 });
    firePointer(gesture!, "pointermove", { pointerId: 1, clientX: 300, clientY: 250 });
    expect(onFrameChange).not.toHaveBeenCalled();
    expect(gesture?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a clear editing state and can finish it", () => {
    const onEditModeChange = vi.fn();
    const { container, getByRole, getByText, queryByText } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onEditModeChange={onEditModeChange} />);
    expect(queryByText("背景を調整中")).toBeNull();
    fireEvent.pointerDown(container.querySelector<HTMLElement>(".background__gesture")!, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(getByText("背景を調整中")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "完了" }));
    expect(onEditModeChange).toHaveBeenCalledWith(false);
  });

  it("returns to the saved frame when changes are cancelled", () => {
    const onFrameChange = vi.fn();
    const onEditModeChange = vi.fn();
    const { container, getByRole } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundPosition={{ x: .2, y: .8 }} backgroundScale={150} editing onFrameChange={onFrameChange} onEditModeChange={onEditModeChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    firePointer(gesture!, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 300 });
    firePointer(gesture!, "pointermove", { pointerId: 1, pointerType: "touch", clientX: 260, clientY: 260 });
    firePointer(gesture!, "pointerup", { pointerId: 1, pointerType: "touch", clientX: 260, clientY: 260 });
    fireEvent.click(getByRole("button", { name: "変更を取り消す" }));
    expect(onFrameChange.mock.calls.at(-1)).toEqual(["bg2", { x: .2, y: .8 }, 150]);
    expect(onEditModeChange).toHaveBeenCalledWith(false);
  });

  it("resets the current background to the centered default", () => {
    const onFrameChange = vi.fn();
    const { container, getByRole } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundPosition={{ x: .2, y: .8 }} backgroundScale={150} editing onFrameChange={onFrameChange} />);
    fireEvent.pointerDown(container.querySelector<HTMLElement>(".background__gesture")!, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.click(getByRole("button", { name: "中央に戻す" }));
    expect(onFrameChange.mock.calls.at(-1)).toEqual(["bg2", { x: .5, y: .5 }, 100]);
  });

  it("moves the background with keyboard arrows while editing", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    fireEvent.keyDown(gesture!, { key: "ArrowRight" });
    expect(onFrameChange.mock.calls.at(-1)?.[1].x).toBeCloseTo(.47);
  });

  it("hides editor controls after a period of inactivity", () => {
    vi.useFakeTimers();
    try {
      const { container, getByText, queryByText } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing />);
      const gesture = container.querySelector<HTMLElement>(".background__gesture");
      expect(queryByText("背景を調整中")).toBeNull();
      fireEvent.pointerDown(gesture!, { pointerId: 1, clientX: 200, clientY: 200 });
      expect(getByText("背景を調整中")).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4_000); });
      expect(queryByText("背景を調整中")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels browser pinch gestures while editing", () => {
    const { container, unmount } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    expect(document.documentElement.classList.contains("focusboard-background-editing")).toBe(true);
    expect(document.body.classList.contains("focusboard-background-editing")).toBe(true);

    const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
    fireEvent(gesture!, touchMove);
    expect(touchMove.defaultPrevented).toBe(true);

    for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = new Event(eventName, { bubbles: true, cancelable: true });
      fireEvent(gesture!, event);
      expect(event.defaultPrevented).toBe(true);
    }

    unmount();
    expect(document.documentElement.classList.contains("focusboard-background-editing")).toBe(false);
    expect(document.body.classList.contains("focusboard-background-editing")).toBe(false);
  });
});
