/**
 * usePWA.ts
 * React hook for PWA functionality
 */

import { useEffect, useState } from "react";

import {
  getCacheVersion,
  isOnline,
  isPWAInstalled,
  isServiceWorkerSupported,
  registerServiceWorker,
} from "@/lib/pwa";

export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnlineStatus, setIsOnlineStatus] = useState(true);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [cacheVersion, setCacheVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serviceWorkerSupported, setServiceWorkerSupported] = useState(false);

  useEffect(() => {
    // Check if installed
    setIsInstalled(isPWAInstalled());
    setIsOnlineStatus(isOnline());

    // Detect service worker capability before attempting registration
    const supported = isServiceWorkerSupported();
    setServiceWorkerSupported(supported);

    if (!supported) {
      return;
    }

    // Read the current cache version (best effort)
    try {
      setCacheVersion(getCacheVersion());
    } catch {
      setCacheVersion(null);
    }

    // Register service worker
    registerServiceWorker().then((reg) => {
      setRegistration(reg);

      if (!reg) {
        return;
      }

      // Surface update availability so the UI can prompt the user
      const handleUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) {
          return;
        }
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      };

      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      reg.addEventListener("updatefound", handleUpdateFound);

      // Refresh cache version once the active worker changes
      const handleControllerChange = () => {
        try {
          setCacheVersion(getCacheVersion());
        } catch {
          setCacheVersion(null);
        }
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      return () => {
        reg.removeEventListener("updatefound", handleUpdateFound);
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    });

    // Listen for online/offline
    const handleOnline = () => setIsOnlineStatus(true);
    const handleOffline = () => setIsOnlineStatus(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    isInstalled,
    isOnline: isOnlineStatus,
    registration,
    cacheVersion,
    updateAvailable,
    serviceWorkerSupported,
  };
}