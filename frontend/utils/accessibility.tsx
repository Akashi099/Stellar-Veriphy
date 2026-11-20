"use client";

/**
 * Accessibility utilities for the Stellar-Veriphy application
 */

import { useEffect, useRef } from "react";

/**
 * Hook to manage focus for accessibility
 */
export function useFocusManager() {
  const focusableElements = useRef<(HTMLElement | null)[]>([]);

  /**
   * Trap focus within a container element (for modals/dialogs)
   */
  const trapFocus = (element: HTMLElement | null) => {
    if (!element) return;

    const focusable = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    focusableElements.current = Array.from(focusable);

    if (focusable.length > 0) {
      focusable[0]?.focus();
    }
  };

  /**
   * Move focus to the next focusable element
   */
  const focusNext = () => {
    const currentIndex = focusableElements.current.findIndex((el) => el === document.activeElement);
    const nextIndex = (currentIndex + 1) % focusableElements.current.length;
    focusableElements.current[nextIndex]?.focus();
  };

  /**
   * Move focus to the previous focusable element
   */
  const focusPrevious = () => {
    const currentIndex = focusableElements.current.findIndex((el) => el === document.activeElement);
    const prevIndex = currentIndex <= 0 ? focusableElements.current.length - 1 : currentIndex - 1;
    focusableElements.current[prevIndex]?.focus();
  };

  /**
   * Announce a message to screen readers
   */
  const announceToScreenReader = (message: string, priority: "polite" | "assertive" = "polite") => {
    const announcementId = "screen-reader-announcement";
    let announcementElement = document.getElementById(announcementId);

    if (!announcementElement) {
      announcementElement = document.createElement("div");
      announcementElement.id = announcementId;
      announcementElement.setAttribute("aria-live", priority);
      announcementElement.setAttribute("aria-atomic", "true");
      announcementElement.className = "sr-only";
      document.body.appendChild(announcementElement);
    }

    // Update content to trigger announcement
    announcementElement.textContent = message;

    // Clear after announcement
    setTimeout(() => {
      if (announcementElement) {
        announcementElement.textContent = "";
      }
    }, 1000);
  };

  /**
   * Create a unique ID for ARIA attributes
   */
  const generateId = (prefix: string) => {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  };

  return {
    trapFocus,
    focusNext,
    focusPrevious,
    announceToScreenReader,
    generateId,
  };
}

/**
 * Hook to manage keyboard navigation
 */
export function useKeyboardNavigation() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip to main content (Ctrl+Alt+M)
      if (event.ctrlKey && event.altKey && event.key === "m") {
        event.preventDefault();
        const mainContent = document.querySelector('main, [role="main"]');
        if (mainContent instanceof HTMLElement) {
          mainContent.focus();
        }
      }

      // Escape key to close modals/menus
      if (event.key === "Escape") {
        const openModals = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        const openMenus = document.querySelectorAll('[role="menu"][aria-expanded="true"]');

        if (openModals.length > 0) {
          const lastModal = openModals[openModals.length - 1] as HTMLElement;
          lastModal.focus();
        } else if (openMenus.length > 0) {
          const lastMenu = openMenus[openMenus.length - 1] as HTMLElement;
          const menuButton = lastMenu.previousElementSibling as HTMLElement;
          menuButton?.focus();
          menuButton?.setAttribute("aria-expanded", "false");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Component to render skip-to-content link
 */
export function SkipToContentLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      onClick={(e) => {
        e.preventDefault();
        const mainContent = document.getElementById("main-content");
        if (mainContent) {
          mainContent.setAttribute("tabindex", "-1");
          mainContent.focus();
          setTimeout(() => mainContent.removeAttribute("tabindex"), 100);
        }
      }}
    >
      Skip to main content
    </a>
  );
}

export function SkipLinks({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <nav aria-label="Skip links" className="skip-links">
      {links.map((link) => (
        <a key={link.href} href={link.href} className="skip-link">
          {link.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * Component to render visually hidden content for screen readers
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only" aria-hidden="false">
      {children}
    </span>
  );
}

/**
 * ARIA live region component for announcements
 */
export function AriaLiveRegion({
  priority = "polite",
  role = "status",
  className = "",
}: {
  priority?: "polite" | "assertive";
  role?: "status" | "alert" | "log" | "marquee" | "timer";
  className?: string;
}) {
  return (
    <div role={role} aria-live={priority} aria-atomic="true" className={`sr-only ${className}`} />
  );
}

/**
 * Generate ARIA label for form fields with error messages
 */
export function getAriaDescribedBy(
  fieldId: string,
  errorId?: string,
  helpId?: string
): string | undefined {
  const ids = [];
  if (helpId) ids.push(helpId);
  if (errorId) ids.push(errorId);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/**
 * Check if color contrast meets WCAG AA standards
 */
export function checkColorContrast(foreground: string, background: string): boolean {
  // Simple contrast checker (simplified implementation)
  // In production, use a proper contrast checking library
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    const r = result[1];
    const g = result[2];
    const b = result[3];
    if (!r || !g || !b) return null;
    return {
      r: parseInt(r, 16),
      g: parseInt(g, 16),
      b: parseInt(b, 16),
    };
  };

  const fgRgb = hexToRgb(foreground);
  const bgRgb = hexToRgb(background);

  if (!fgRgb || !bgRgb) return true; // Default to true for non-hex colors

  const luminance = (r: number, g: number, b: number) => {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    const a0 = a[0] ?? 0;
    const a1 = a[1] ?? 0;
    const a2 = a[2] ?? 0;
    return a0 * 0.2126 + a1 * 0.7152 + a2 * 0.0722;
  };

  const lum1 = luminance(fgRgb.r, fgRgb.g, fgRgb.b);
  const lum2 = luminance(bgRgb.r, bgRgb.g, bgRgb.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  const contrast = (brightest + 0.05) / (darkest + 0.05);
  return contrast >= 4.5; // WCAG AA minimum for normal text
}
