"use client";

import { useEffect, useId, useRef, useState } from "react";

interface TooltipProps {
  /** Accessible name for the trigger button, e.g. "What is the confidence score?" */
  label: string;
  children: React.ReactNode;
}

/**
 * Info-icon tooltip. Opens on hover, keyboard focus, or click/tap; closes on
 * Escape, blur, or clicking elsewhere. The content is linked to the trigger
 * with aria-describedby so screen readers announce it on focus.
 */
export default function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-xs font-semibold text-slate-600 hover:border-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <span aria-hidden="true">?</span>
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute left-1/2 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-lg"
      >
        {children}
      </span>
    </span>
  );
}
