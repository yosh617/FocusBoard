export type CleanupResult = { supported: boolean; cachesDeleted: number; registrationsDeleted: number };

export async function clearPwaCachesAndWorkers(): Promise<CleanupResult> {
  let supported = false;
  let cachesDeleted = 0;
  let registrationsDeleted = 0;

  if ("caches" in window) {
    supported = true;
    const keys = await caches.keys();
    const appKeys = keys.filter((key) => key.includes("focusboard"));
    const results = await Promise.all(appKeys.map((key) => caches.delete(key)));
    cachesDeleted = results.filter(Boolean).length;
  }

  if ("serviceWorker" in navigator) {
    supported = true;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href).href;
    const appRegistrations = registrations.filter(({ scope }) => baseUrl.startsWith(scope) || scope.startsWith(baseUrl));
    const results = await Promise.all(appRegistrations.map((registration) => registration.unregister()));
    registrationsDeleted = results.filter(Boolean).length;
  }

  return { supported, cachesDeleted, registrationsDeleted };
}
