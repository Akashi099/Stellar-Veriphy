import { logger } from "./logger";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
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
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
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
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
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
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export async function getCacheSize(): Promise<number> {
  if (typeof window === "undefined" || !("caches" in window)) {
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
  if (!("sync" in registration)) {
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
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray.buffer.slice(
    outputArray.byteOffset,
    outputArray.byteOffset + outputArray.byteLength
  );
}
