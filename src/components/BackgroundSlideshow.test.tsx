import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackgroundSlideshow } from "./BackgroundSlideshow";

describe("BackgroundSlideshow", () => {
  it("removes a failed image URL while preserving the gradient container", () => {
    const { container } = render(<BackgroundSlideshow intervalSec={60} overlayOpacity={0.4} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    const firstLayer = container.querySelector<HTMLElement>(".background__image");
    expect(firstLayer?.style.backgroundImage).toBe("");
    expect(container.querySelector(".background")).not.toBeNull();
  });
});
