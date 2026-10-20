"use client";

/**
 * PWAUpdatePrompt.tsx
 *
 * Notifies users when a new version of the PWA is available
 * and prompts them to update.
 */

import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [cacheVersion, setCacheVersion] = useState<string | null>(null);
  // Only reload once the user has explicitly requested the update and the
  // waiting worker has taken control. This avoids surprise reloads.
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleStateChange = (reg: ServiceWorkerRegistration, worker: ServiceWorker) => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        // New version available and waiting to activate.
        setRegistration(reg);
        setShowPrompt(true);
      }
    };

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => handleStateChange(reg, newWorker));
    };

    // Listen for service worker updates
    navigator.serviceWorker.ready.then((reg) => {
      // A worker may already be waiting (e.g. update found before mount).
      if (reg.waiting && navigator.serviceWorker.controller) {
        setRegistration(reg);
        setShowPrompt(true);
      }

      reg.addEventListener("updatefound", () => watchInstalling(reg));
    });

    // Capture the new cache version reported by the activating worker.
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; cacheVersion?: string } | undefined;
      if (data?.type === "CACHE_VERSION" && typeof data.cacheVersion === "string") {
        setCacheVersion(data.cacheVersion);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);

    // Listen for controller change (when new SW takes over). Only reload if the
    // user requested the update; session state (cookies/localStorage) is left
    // untouched so users stay logged in.
    const handleControllerChange = () => {
      if (reloadRequestedRef.current) {
        reloadRequestedRef.current = false;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (!registration || !registration.waiting) return;

    // Tell the waiting service worker to skip waiting and claim clients.
    // The worker will activate and broadcast its cache version; we reload
    // only after it takes control (see controllerchange handler above).
    reloadRequestedRef.current = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });

    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-down">
      <div className="bg-blue-600 dark:bg-blue-700 rounded-lg shadow-2xl p-4">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-blue-200 hover:text-white rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="text-base font-semibold text-white mb-1">Update Available</h3>

            {/* Description */}
            <p className="text-sm text-blue-100 mb-4">
              A new version of StellarVeriphy is available. Update now to get the latest features
              and improvements.
            </p>

            {cacheVersion && (
              <p className="text-xs text-blue-200 mb-4 font-mono">Cache version: {cacheVersion}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-blue-50 text-blue-600 text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Update Now
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 border border-white/30 text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
