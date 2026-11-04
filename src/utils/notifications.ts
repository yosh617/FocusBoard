export async function showSystemNotification(body: string, tag: string) {
  if (!("Notification" in globalThis) || Notification.permission !== "granted") return;
  const options = { body, tag };
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification("FocusBoard", options);
        return;
      }
    } catch {
      // Fall back to a page notification when the service worker is unavailable.
    }
  }
  try { new Notification("FocusBoard", options); } catch { /* The in-app message remains available. */ }
}
