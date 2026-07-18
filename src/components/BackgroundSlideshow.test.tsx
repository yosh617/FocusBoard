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

  it("updates the frame when the background is dragged", () => {
    const onFrameChange = vi.fn();
    const { container } = render(<BackgroundSlideshow intervalSec={10} overlayOpacity={0.2} backgroundChoice="bg2" customBackgrounds={[]} onFrameChange={onFrameChange} />);
    const gesture = container.querySelector<HTMLElement>(".background__gesture");
    expect(gesture).not.toBeNull();
    fireEvent(gesture!, new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 300 }));
    fireEvent(gesture!, new MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 250 }));
    fireEvent(gesture!, new MouseEvent("pointerup", { bubbles: true, clientX: 300, clientY: 250 }));
    const [position, scale] = onFrameChange.mock.calls.at(-1) as [{ x: number; y: number }, number];
    expect(position.x).toBeLessThan(.5);
    expect(position.y).toBeGreaterThan(.5);
    expect(scale).toBe(100);
  });
});
