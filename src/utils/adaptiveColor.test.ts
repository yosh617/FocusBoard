import { describe, expect, it } from "vitest";
import { getAdaptivePalette, getStrongAccent } from "./adaptiveColor";

describe("adaptive background palette", () => {
  it("chooses dark text for a light background", () => {
    expect(getAdaptivePalette({ r: 225, g: 238, b: 250 }, .1).text).toBe("#122a4c");
  });

  it("chooses light text for a dark background", () => {
    expect(getAdaptivePalette({ r: 12, g: 20, b: 35 }, 0).text).toBe("#f7fbff");
  });

  it("derives the accent hue from the background", () => {
    const blue = getAdaptivePalette({ r: 80, g: 150, b: 230 }, 0);
    const green = getAdaptivePalette({ r: 65, g: 190, b: 125 }, 0);
    expect(blue.accent).not.toBe(green.accent);
    expect(blue.accentStrong).not.toBe(green.accentStrong);
  });

  it("darkens a custom pastel accent enough for white button text", () => {
    expect(getStrongAccent("#d7c8ff")).not.toBe("#d7c8ff");
    expect(getStrongAccent("invalid")).toBe("#315f98");
  });
});
