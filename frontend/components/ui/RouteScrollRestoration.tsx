"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "stellar-veriphy:scroll-positions";

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function savePosition(pathname: string) {
  try {
    const positions = readPositions();
    positions[pathname] = window.scrollY;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Storage may be unavailable in privacy-restricted browsing contexts.
  }
}

export function RouteScrollRestoration() {
  const pathname = usePathname() ?? "/";
  const returningRef = useRef(false);

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const markBackNavigation = () => {
      returningRef.current = true;
    };
    const saveCurrentPosition = () => savePosition(pathname);

    window.addEventListener("popstate", markBackNavigation);
    window.addEventListener("beforeunload", saveCurrentPosition);

    const frame = window.requestAnimationFrame(() => {
      const savedPosition = returningRef.current ? readPositions()[pathname] : undefined;
      window.scrollTo({
        top: typeof savedPosition === "number" ? savedPosition : 0,
        left: 0,
        behavior: "auto",
      });
      returningRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(frame);
      saveCurrentPosition();
      window.removeEventListener("popstate", markBackNavigation);
      window.removeEventListener("beforeunload", saveCurrentPosition);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [pathname]);

  return null;
}

export default RouteScrollRestoration;
