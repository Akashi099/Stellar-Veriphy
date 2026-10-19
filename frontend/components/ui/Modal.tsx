"use client";

import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  ariaLabel,
  ariaDescribedBy,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Announce modal opening to screen readers
    if (title || ariaLabel) {
      const announcement = document.createElement("div");
      announcement.setAttribute("aria-live", "assertive");
      announcement.setAttribute("aria-atomic", "true");
      announcement.className = "sr-only";
      announcement.textContent = `${title || ariaLabel || "Modal"} opened`;
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 100);
    }

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    // Focus trap
    const focusableElements = dialogRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    const firstElement = focusableElements?.[0];
    const lastElement = focusableElements?.[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (!focusableElements || focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);

    // Focus first element or close button
    setTimeout(() => {
      if (firstElement) {
        firstElement.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      }
    }, 10);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTabKey);
      document.body.style.overflow = "";
      previousActiveElement.current?.focus();
    };
  }, [isOpen, onClose, title, ariaLabel]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
      aria-describedby={ariaDescribedBy}
    >
      <div
        ref={dialogRef}
        className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto",
          "animate-in fade-in zoom-in-95 duration-200 focus:outline-none",
          className
        )}
        tabIndex={-1}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white" id="modal-title">
              {title}
            </h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6" aria-labelledby={title ? "modal-title" : undefined}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
