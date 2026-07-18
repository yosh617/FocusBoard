import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundSlideshow } from "./BackgroundSlideshow";

describe("BackgroundSlideshow", () => {
  it("removes a failed image URL while preserving the gradient container", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={60} overlayOpacity={0.4} backgroundChoice="slideshow" customBackgrounds={[]} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    const firstLayer = container.querySelector<HTMLElement>(".background__image");
    expect(firstLayer?.style.backgroundImage).toBe("");
    expect(container.querySelector(".background")).not.toBeNull();
  });

  it("keeps a manually selected background active", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} />);
    const layers = container.querySelectorAll(".background__image");
    expect(layers[1].classList.contains("background__image--active")).toBe(true);
    expect(layers[0].classList.contains("background__image--active")).toBe(false);
  });

  it("applies background zoom and position settings", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundPosition={{ x: .25, y: .75 }} backgroundScale={150} />);
    const activeLayer = container.querySelector<HTMLElement>(".background__image--active");
    expect(activeLayer?.style.backgroundPosition).toBe("25% 75%");
    expect(activeLayer?.style.transform).toBe("scale(1.5)");
  });

  it("uses the selected image's own frame settings", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} backgroundPosition={{ x: .25, y: .75 }} backgroundScale={150} backgroundFrames={{ bg2: { position: { x: .1, y: .9 }, scale: 180 } }} />);
    const activeLayer = container.querySelector<HTMLElement>(".background__image--active");
    expect(activeLayer?.style.backgroundPosition).toBe("10% 90%");
    expect(activeLayer?.style.transform).toBe("scale(1.8)");
  });

  it("updates the frame when the background is dragged", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    fireEvent(gesture!, new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 300 }));
    fireEvent(gesture!, new MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 250 }));
    fireEvent(gesture!, new MouseEvent("pointerup", { bubbles: true, clientX: 300, clientY: 250 }));
    const [backgroundId, position, scale] = onFrameChange.mock.calls.at(-1) as [string, { x: number; y: number }, number];
    expect(backgroundId).toBe("bg2");
    expect(position.x).toBeLessThan(.5);
    expect(position.y).toBeGreaterThan(.5);
    expect(scale).toBe(100);
  });

  it("handles a two-finger touch as background zoom", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    fireEvent.touchStart(gesture!, { touches: [{ identifier: 1, clientX: 100, clientY: 200 }, { identifier: 2, clientX: 200, clientY: 200 }] });
    const moveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(moveEvent, "touches", { value: [{ identifier: 1, clientX: 75, clientY: 200 }, { identifier: 2, clientX: 225, clientY: 200 }] });
    fireEvent(gesture!, moveEvent);
    expect(moveEvent.defaultPrevented).toBe(true);
    expect(onFrameChange.mock.calls.at(-1)?.[2]).toBe(150);
  });

  it("moves the background with one finger touch", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    fireEvent.touchStart(gesture!, { touches: [{ identifier: 1, clientX: 200, clientY: 300 }] });
    const moveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(moveEvent, "touches", { value: [{ identifier: 1, clientX: 300, clientY: 250 }] });
    fireEvent(gesture!, moveEvent);
    expect(moveEvent.defaultPrevented).toBe(true);
    const [, position, scale] = onFrameChange.mock.calls.at(-1) as [string, { x: number; y: number }, number];
    expect(position.x).toBeLessThan(.5);
    expect(position.y).toBeGreaterThan(.5);
    expect(scale).toBe(100);
  });

  it("does not capture gestures until background editing starts", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    fireEvent.pointerDown(gesture!, { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(gesture!, { pointerId: 1, clientX: 300, clientY: 250 });
    expect(onFrameChange).not.toHaveBeenCalled();
    expect(gesture?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a clear editing state and can finish it", () => {
    const onEditModeChange = vi.fn();
    const { getByRole, getByText } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing onEditModeChange={onEditModeChange} />);
    expect(getByText("背景を調整中")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "完了" }));
    expect(onEditModeChange).toHaveBeenCalledWith(false);
  });

  it("cancels browser pinch gestures while editing", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} editing />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();

    for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = new Event(eventName, { bubbles: true, cancelable: true });
      fireEvent(gesture!, event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});
