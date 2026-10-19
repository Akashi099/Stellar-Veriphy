"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/utils/cn";

type TooltipPosition = "top" | "bottom" | "left" | "right";
type TooltipTrigger = "hover" | "click" | "both";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  trigger?: TooltipTrigger;
  delay?: number;
  className?: string;
  maxWidth?: number;
}

const OPPOSITE: Record<TooltipPosition, TooltipPosition> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function computeStyle(rect: DOMRect, position: TooltipPosition, gap: number) {
  switch (position) {
    case "top":
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + gap,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: rect.right + gap,
        top: rect.top + rect.height / 2,
        transform: "translate(0, -50%)",
      };
  }
}

/** Flips to the opposite side when the preferred position would overflow the viewport. */
function resolvePosition(
  rect: DOMRect,
  preferred: TooltipPosition,
  maxWidth: number
): TooltipPosition {
  const gap = 8;
  const estimatedSize = 40; // rough tooltip height/width for edge detection
  const overflows: Record<TooltipPosition, boolean> = {
    top: rect.top - gap - estimatedSize < 0,
    bottom: rect.bottom + gap + estimatedSize > window.innerHeight,
    left: rect.left - gap - maxWidth < 0,
    right: rect.right + gap + maxWidth > window.innerWidth,
  };
  return overflows[preferred] ? OPPOSITE[preferred] : preferred;
}

export function Tooltip({
  content,
  children,
  position = "top",
  trigger = "hover",
  delay = 300,
  className,
  maxWidth = 280,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const resolved = resolvePosition(rect, position, maxWidth);
    setTooltipStyle(computeStyle(rect, resolved, 8));
  }, [position, maxWidth]);

  const show = useCallback(() => {
    updatePosition();
    setIsVisible(true);
  }, [updatePosition]);

  const scheduleShow = useCallback(() => {
    timerRef.current = setTimeout(show, delay);
  }, [delay, show]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  }, []);

  const toggle = useCallback(() => {
    if (isVisible) hide();
    else show();
  }, [isVisible, hide, show]);

  const showsOnHover = trigger === "hover" || trigger === "both";
  const showsOnClick = trigger === "click" || trigger === "both";

  useEffect(() => {
    if (!isVisible) return;
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isVisible, updatePosition]);

  useEffect(() => {
    if (!isVisible || !showsOnClick) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) hide();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [isVisible, showsOnClick, hide]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onMouseEnter={showsOnHover ? scheduleShow : undefined}
      onMouseLeave={showsOnHover ? hide : undefined}
      onFocus={showsOnHover ? scheduleShow : undefined}
      onBlur={showsOnHover && !showsOnClick ? hide : undefined}
      onClick={showsOnClick ? toggle : undefined}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{ ...tooltipStyle, maxWidth }}
            className={cn(
              "fixed z-[200] px-2.5 py-1.5 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-150",
              showsOnClick ? "pointer-events-auto" : "pointer-events-none"
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}
