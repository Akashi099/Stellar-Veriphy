import { logger } from "./logger";

export const CACHE_VERSION = "v2";
export const CACHE_VERSION_MESSAGE = "CACHE_VERSION";
export const CACHE_INVALIDATED_EVENT = "pwa:cache-invalidated";
export const UPDATE_AVAILABLE_EVENT = "pwa:update-available";

const AUTH_STORAGE_PREFIXES = ["sb-", "supabase.auth", "auth"];

export type PWACapability = "serviceWorker" | "caches" | "notifications" | "push" | "backgroundSync";

export interface PWACapabilityStatus {
  supported: boolean;
  message: string;
}

export function isServiceWorkerSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export function isCacheStorageSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

export function getCapabilityStatus(capability: PWACapability): PWACapabilityStatus {
  switch (capability) {
    case "serviceWorker":
      return isServiceWorkerSupported()
        ? { supported: true, message: "Offline support is available." }
        : {
            supported: false,
            message:
              "Your browser does not support service workers, so offline mode and background updates are unavailable. The app will still work while you are online.",
          };
    case "caches":
      return isCacheStorageSupported()
        ? { supported: true, message: "Offline caching is available." }
        : {
            supported: false,
            message:
              "Your browser does not support the Cache Storage API, so pages cannot be cached for offline use. The app will still work while you are online.",
          };
    case "notifications":
      return typeof window !== "undefined" && "Notification" in window
        ? { supported: true, message: "Notifications are available." }
        : {
            supported: false,
            message:
              "Your browser does not support notifications, so you will not receive alerts. All other features remain available.",
          };
    case "push":
      return typeof window !== "undefined" && "PushManager" in window
        ? { supported: true, message: "Push notifications are available." }
        : {
            supported: false,
            message:
              "Your browser does not support push notifications, so you will not receive background alerts. All other features remain available.",
          };
    case "backgroundSync":
      return isServiceWorkerSupported()
        ? { supported: true, message: "Background sync is available." }
        : {
            supported: false,
            message:
              "Your browser does not support background sync, so changes made offline may need to be re-submitted when you reconnect.",
          };
    default:
      return { supported: false, message: "This feature is not supported in your browser." };
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    logger.debug("Service Worker not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    logger.info("Service Worker registered:", { operation: registration.scope });
    setInterval(() => registration.update(), 60 * 60 * 1000);

    return registration;
  } catch (error) {
    logger.error("Service Worker registration failed:", { error });
    return null;
  }
}

export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();
    logger.info("Service Worker unregistered:", { operation: String(success) });
    return success;
  } catch (error) {
    logger.error("Service Worker unregistration failed:", { error });
    return false;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    logger.debug("Notifications not supported");
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission !== "denied") {
    return Notification.requestPermission();
  }

  return Notification.permission;
}

export async function subscribeToPushNotifications(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") {
      return null;
    }

    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
    });
  } catch (error) {
    logger.error("Push subscription failed:", { error });
    return null;
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? subscription.unsubscribe() : true;
  } catch (error) {
    logger.error("Push unsubscribe failed:", { error });
    return false;
  }
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function addOnlineListener(callback: () => void): () => void {
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
}

export function addOfflineListener(callback: () => void): () => void {
  window.addEventListener("offline", callback);
  return () => window.removeEventListener("offline", callback);
}

export async function clearAllCaches(): Promise<void> {
  if (!isCacheStorageSupported()) {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export async function getCacheVersion(): Promise<string | null> {
  if (!isCacheStorageSupported()) {
    return null;
  }

  try {
    const cache = await caches.open("app-cache");
    const response = await cache.match("/cache-version.json");
    if (!response) {
      return null;
    }
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch (error) {
    logger.error("Failed to read cache version:", { error });
    return null;
  }
}

export function isAuthStorageKey(key: string): boolean {
  return AUTH_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function preserveAuthStorage(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const preserved: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isAuthStorageKey(key)) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          preserved[key] = value;
        }
      }
    }
  } catch (error) {
    logger.error("Failed to preserve auth storage:", { error });
  }
  return preserved;
}

export function restoreAuthStorage(preserved: Record<string, string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const [key, value] of Object.entries(preserved)) {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    logger.error("Failed to restore auth storage:", { error });
  }
}

export async function safeUpdate(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    logger.debug("Safe update skipped: Service Worker not supported");
    return false;
  }

  const preserved = preserveAuthStorage();

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();

    if (isCacheStorageSupported()) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== "app-cache")
          .map((key) => caches.delete(key))
      );
    }

    restoreAuthStorage(preserved);
    logger.info("Safe cache update completed");
    return true;
  } catch (error) {
    restoreAuthStorage(preserved);
    logger.error("Safe update failed:", { error });
    return false;
  }
}

export function onCacheInvalidated(callback: (version: string | null) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ version?: string }>).detail;
    callback(detail?.version ?? null);
  };

  window.addEventListener(CACHE_INVALIDATED_EVENT, handler);
  return () => window.removeEventListener(CACHE_INVALIDATED_EVENT, handler);
}

export function onUpdateAvailable(callback: (version: string | null) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ version?: string }>).detail;
    callback(detail?.version ?? null);
  };

  window.addEventListener(UPDATE_AVAILABLE_EVENT, handler);
  return () => window.removeEventListener(UPDATE_AVAILABLE_EVENT, handler);
}

export function notifyCacheInvalidated(version: string | null = CACHE_VERSION): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(CACHE_INVALIDATED_EVENT, { detail: { version } })
  );
}

export function notifyUpdateAvailable(version: string | null = CACHE_VERSION): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: { version } }));
}

export async function getCacheSize(): Promise<number> {
  if (!isCacheStorageSupported()) {
    return 0;
  }

  const keys = await caches.keys();
  const sizes = await Promise.all(
    keys.map(async (key) => {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      const responses = await Promise.all(requests.map((request) => cache.match(request)));
      return responses.reduce((total, response) => {
        const size = Number(response?.headers.get("content-length") || 0);
        return total + size;
      }, 0);
    })
  );

  return sizes.reduce((total, size) => total + size, 0);
}

export function isPWAInstalled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function getPWADisplayMode(): string {
  if (typeof window === "undefined") {
    return "browser";
  }

  if (window.matchMedia("(display-mode: standalone)").matches) {
    return "standalone";
  }
  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return "fullscreen";
  }
  if (window.matchMedia("(display-mode: minimal-ui)").matches) {
    return "minimal-ui";
  }

  return "browser";
}

export async function registerBackgroundSync(
  registration: ServiceWorkerRegistration,
  tag: string
): Promise<void> {
  if (!isServiceWorkerSupported() || !("sync" in registration)) {
    logger.debug("Background Sync not supported");
    return;
  }

  try {
    await (
      registration as ServiceWorkerRegistration & { sync: { register(t: string): Promise<void> } }
    ).sync.register(tag);
    logger.info("Background sync registered:", { operation: tag });
  } catch (error) {
    logger.error("Background sync registration failed:", { error });
  }
}

export function setAppBadge(count: number): void {
  if (typeof window === "undefined" || !("setAppBadge" in navigator)) {
    return;
  }

  const nav = navigator as Navigator & {
    setAppBadge(c: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  };

  if (count > 0) {
    void nav.setAppBadge(count);
  } else {
    void nav.clearAppBadge();
  }
}

export function clearAppBadge(): void {
  if (typeof window === "undefined" || !("clearAppBadge" in navigator)) {
    return;
  }

  const nav = navigator as Navigator & { clearAppBadge(): Promise<void> };
  void nav.clearAppBadge();
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof window === "undefined" ? "" : window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray.buffer.slice(
    outputArray.byteOffset,
    outputArray.byteOffset + outputArray.byteLength
  );
}
