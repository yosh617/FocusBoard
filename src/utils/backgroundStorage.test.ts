import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_BACKGROUNDS, validateBackgroundFiles } from "./backgroundStorage";

describe("custom background validation", () => {
  it("accepts image files within the count and size limits", () => {
    const image = new File([new Uint8Array(32)], "focus.jpg", { type: "image/jpeg" });
    expect(() => validateBackgroundFiles([image], 0)).not.toThrow();
  });

  it("rejects non-image and oversized files", () => {
    const text = new File(["text"], "notes.txt", { type: "text/plain" });
    expect(() => validateBackgroundFiles([text], 0)).toThrow("画像ファイルではありません");
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    expect(() => validateBackgroundFiles([oversized], 0)).toThrow("10MB以下");
  });

  it("limits the saved gallery to eight images", () => {
    const image = new File(["image"], "extra.png", { type: "image/png" });
    expect(() => validateBackgroundFiles([image], MAX_CUSTOM_BACKGROUNDS)).toThrow("最大8枚");
  });
});
