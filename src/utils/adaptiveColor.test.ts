import { describe, expect, it, vi } from "vitest";
import { getAdaptivePalette, getAdaptivePaletteFromSamples, getReadableTextColor, getReadableTextColorFromSamples, getStrongAccent, sampleImageRgb } from "./adaptiveColor";

describe("adaptive background palette", () => {
  it("chooses dark text for a light background", () => {
    expect(getAdaptivePalette({ r: 225, g: 238, b: 250 }, .1).text).toBe("#122a4c");
  });

  it("chooses light text for a dark background", () => {
    expect(getAdaptivePalette({ r: 12, g: 20, b: 35 }, 0).text).toBe("#f7fbff");
  });

  it("evaluates the whole display region when the background has mixed brightness", () => {
    const samples = [
      ...Array.from({ length: 7 }, () => ({ r: 12, g: 20, b: 35 })),
      ...Array.from({ length: 3 }, () => ({ r: 242, g: 245, b: 250 }))
    ];
    expect(getReadableTextColorFromSamples(samples)).toBe("#f7fbff");
    expect(getAdaptivePaletteFromSamples(samples, 0).text).toBe("#f7fbff");
  });

  it("falls back to a stronger neutral when neither theme text color is readable enough", () => {
    expect(getReadableTextColor({ r: 117, g: 117, b: 117 })).toBe("#ffffff");
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

  it("accepts a focused image sample region", () => {
    const image = new Image();
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 100 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 100 });
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([20, 30, 40, 255]) })) };
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      if (tagName === "canvas") return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
      return createElement(tagName, options);
    });
    sampleImageRgb(image, { x: 40, y: 30, width: 20, height: 25 });
    expect(context.drawImage).toHaveBeenCalledWith(image, 40, 30, 20, 25, 0, 0, 24, 24);
    vi.restoreAllMocks();
  });
});
