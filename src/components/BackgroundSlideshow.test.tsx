import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
