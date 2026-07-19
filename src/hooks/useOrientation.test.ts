import { describe, expect, it } from "vitest";
import { getOrientation } from "./useOrientation";

describe("getOrientation", () => {
  it("identifies portrait and landscape viewports", () => {
    expect(getOrientation(834, 1194)).toBe("portrait");
    expect(getOrientation(1194, 834)).toBe("landscape");
  });

  it("treats a square viewport as landscape consistently", () => {
    expect(getOrientation(800, 800)).toBe("landscape");
  });
});
