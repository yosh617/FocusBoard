import { afterEach, describe, expect, it, vi } from "vitest";
import { showSystemNotification } from "./notifications";

describe("system notifications", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the service worker when one is registered", async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ showNotification }) } });
    await showSystemNotification("集中が終了しました", "timer-1");
    expect(showNotification).toHaveBeenCalledWith("FocusBoard", { body: "集中が終了しました", tag: "timer-1" });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("falls back to a page notification when service worker delivery fails", async () => {
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: vi.fn().mockRejectedValue(new Error("unavailable")) } });
    await showSystemNotification("休憩が終了しました", "timer-2");
    expect(NotificationMock).toHaveBeenCalledWith("FocusBoard", { body: "休憩が終了しました", tag: "timer-2" });
  });
});
