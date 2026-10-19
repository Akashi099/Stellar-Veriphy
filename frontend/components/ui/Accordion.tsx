"use client";

/**
 * Accordion.tsx
 *
 * Accessible, animated accordion / collapsible component.
 *
 * Features
 * ────────
 * • Single or multiple panels open simultaneously (via `type` prop)
 * • CSS-transition-based height animation (no external deps)
 * • Full keyboard navigation: Enter / Space toggle; Up / Down arrow navigation
 * • ARIA attributes: role="button", aria-expanded, aria-controls, aria-labelledby
 * • Customisable chevron / custom icon indicators
 * • Composable primitive: Accordion > AccordionItem > AccordionTrigger + AccordionContent
 *
 * Usage — single (only one panel open at a time):
 * ─────────────────────────────────────────────────────────────────────────────
 *   <Accordion type="single" defaultValue="item-1">
 *     <AccordionItem value="item-1">
 *       <AccordionTrigger>What is StellarVeriphy?</AccordionTrigger>
 *       <AccordionContent>StellarVeriphy is a decentralized…</AccordionContent>
 *     </AccordionItem>
 *   </Accordion>
 *
 * Usage — multiple (any number of panels can be open):
 * ─────────────────────────────────────────────────────────────────────────────
 *   <Accordion type="multiple" defaultValue={["item-1", "item-2"]}>
 *     …
 *   </Accordion>
 */

import React, {
  createContext,
  KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type AccordionType = "single" | "multiple";

interface AccordionContextValue {
  type: AccordionType;
  openItems: Set<string>;
  toggle: (value: string) => void;
  /** Ref-map used for keyboard arrow navigation. */
  registerTrigger: (value: string, el: HTMLButtonElement | null) => void;
  triggerValues: React.MutableRefObject<string[]>;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("Accordion sub-components must be used inside <Accordion>.");
  return ctx;
}

// ---------------------------------------------------------------------------
// ItemContext — shared between Trigger and Content within one AccordionItem
// ---------------------------------------------------------------------------

interface ItemContextValue {
  value: string;
  triggerId: string;
  contentId: string;
  isOpen: boolean;
}

const ItemContext = createContext<ItemContextValue | null>(null);

function useAccordionItem() {
  const ctx = useContext(ItemContext);
  if (!ctx)
    throw new Error("AccordionTrigger / AccordionContent must be used inside <AccordionItem>.");
  return ctx;
}

// ---------------------------------------------------------------------------
// Accordion (root)
// ---------------------------------------------------------------------------

type SingleProps = {
  type: "single";
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string | null) => void;
};

type MultipleProps = {
  type: "multiple";
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
};

export type AccordionProps = (SingleProps | MultipleProps) & {
  children: React.ReactNode;
  className?: string;
};

export function Accordion({ children, className, ...props }: AccordionProps) {
  // ── Controlled vs uncontrolled ─────────────────────────────────────────────
  const isControlled = "value" in props && props.value !== undefined;

  const getInitialOpen = (): Set<string> => {
    if (props.type === "single") {
      const init = (isControlled ? props.value : props.defaultValue) ?? null;
      return init ? new Set([init]) : new Set();
    }
    const init = (isControlled ? (props.value as string[]) : props.defaultValue) ?? [];
    return new Set(init);
  };

  const [openItems, setOpenItems] = useState<Set<string>>(getInitialOpen);

  // Sync when controlled value changes from outside
  useEffect(() => {
    if (!isControlled) return;
    if (props.type === "single") {
      const v = props.value as string | null | undefined;
      setOpenItems(v ? new Set([v]) : new Set());
    } else {
      setOpenItems(new Set((props.value as string[] | undefined) ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, props.type, JSON.stringify((props as MultipleProps).value)]);

  const toggle = useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        let next: Set<string>;
        if (props.type === "single") {
          next = prev.has(value) ? new Set() : new Set([value]);
          if (!isControlled) {
            (props as SingleProps).onValueChange?.(next.size ? value : null);
          }
        } else {
          next = new Set(prev);
          if (next.has(value)) {
            next.delete(value);
          } else {
            next.add(value);
          }
          if (!isControlled) {
            (props as MultipleProps).onValueChange?.([...next]);
          }
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isControlled, props.type]
  );

  // ── Keyboard: register triggers for Up/Down arrow nav ─────────────────────
  const triggerEls = useRef<Map<string, HTMLButtonElement>>(new Map());
  const triggerValues = useRef<string[]>([]);

  const registerTrigger = useCallback((value: string, el: HTMLButtonElement | null) => {
    if (el) {
      triggerEls.current.set(value, el);
    } else {
      triggerEls.current.delete(value);
    }
  }, []);

  return (
    <AccordionContext.Provider
      value={{ type: props.type, openItems, toggle, registerTrigger, triggerValues }}
    >
      <div
        className={cn("w-full divide-y divide-border rounded-md border border-border", className)}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// AccordionItem
// ---------------------------------------------------------------------------

export interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  /** Disable this item (trigger becomes non-interactive). */
  disabled?: boolean;
}

export function AccordionItem({ value, children, className, disabled }: AccordionItemProps) {
  const { openItems } = useAccordion();
  const uid = useId();
  const triggerId = `accordion-trigger-${uid}`;
  const contentId = `accordion-content-${uid}`;
  const isOpen = openItems.has(value);

  return (
    <ItemContext.Provider value={{ value, triggerId, contentId, isOpen }}>
      <div
        className={cn("group", disabled && "pointer-events-none opacity-50", className)}
        data-state={isOpen ? "open" : "closed"}
        data-disabled={disabled ? "" : undefined}
      >
        {children}
      </div>
    </ItemContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// AccordionTrigger
// ---------------------------------------------------------------------------

export interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
  /** Replace the default chevron with a custom icon node. */
  icon?: React.ReactNode;
  /** Hide the icon indicator entirely. */
  hideIcon?: boolean;
}

export function AccordionTrigger({
  children,
  className,
  icon,
  hideIcon = false,
}: AccordionTriggerProps) {
  const { toggle, registerTrigger, triggerValues } = useAccordion();
  const { value, triggerId, contentId, isOpen } = useAccordionItem();
  const ref = useRef<HTMLButtonElement>(null);

  // Register this trigger for keyboard navigation
  useEffect(() => {
    registerTrigger(value, ref.current);
    if (!triggerValues.current.includes(value)) {
      triggerValues.current.push(value);
    }
    return () => {
      registerTrigger(value, null);
      triggerValues.current = triggerValues.current.filter((v) => v !== value);
    };
  }, [value, registerTrigger, triggerValues]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(value);
      return;
    }
    // Arrow navigation
    const idx = triggerValues.current.indexOf(value);
    if (e.key === "ArrowDown" && idx < triggerValues.current.length - 1) {
      e.preventDefault();
      const nextValue = triggerValues.current[idx + 1]!;
      document.getElementById(`accordion-trigger-${nextValue.replace(/[^a-z0-9]/gi, "")}`)?.focus();
    }
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      const prevValue = triggerValues.current[idx - 1]!;
      document.getElementById(`accordion-trigger-${prevValue.replace(/[^a-z0-9]/gi, "")}`)?.focus();
    }
    if (e.key === "Home") {
      e.preventDefault();
      const firstValue = triggerValues.current[0];
      if (firstValue)
        document
          .getElementById(`accordion-trigger-${firstValue.replace(/[^a-z0-9]/gi, "")}`)
          ?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      const lastValue = triggerValues.current[triggerValues.current.length - 1];
      if (lastValue)
        document
          .getElementById(`accordion-trigger-${lastValue.replace(/[^a-z0-9]/gi, "")}`)
          ?.focus();
    }
  };

  return (
    <button
      ref={ref}
      id={triggerId}
      type="button"
      role="button"
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={() => toggle(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex w-full items-center justify-between px-4 py-4 text-sm font-medium text-foreground",
        "transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "group-data-[disabled]:cursor-not-allowed",
        className
      )}
    >
      <span className="text-left">{children}</span>
      {!hideIcon && (
        <span
          aria-hidden="true"
          className={cn("ml-2 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
        >
          {icon ?? (
            // Default chevron-down SVG (no external icon library required)
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// AccordionContent
// ---------------------------------------------------------------------------

export interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const { triggerId, contentId, isOpen } = useAccordionItem();

  // We animate using a CSS max-height trick combined with a ref for the real
  // content height, avoiding any layout-thrashing animation libraries.
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(isOpen ? "none" : "0px");
  const [overflow, setOverflow] = useState<"hidden" | "visible">(isOpen ? "visible" : "hidden");

  useEffect(() => {
    if (!innerRef.current) return;
    const contentHeight = innerRef.current.scrollHeight;

    if (isOpen) {
      setOverflow("hidden");
      setMaxHeight(`${contentHeight}px`);
      // After transition ends, set to "none" so content can grow dynamically
      const timer = setTimeout(() => {
        setMaxHeight("none");
        setOverflow("visible");
      }, 220);
      return () => clearTimeout(timer);
    } else {
      // Snapshot current height before collapsing (for smooth close)
      setMaxHeight(`${contentHeight}px`);
      setOverflow("hidden");
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMaxHeight("0px");
        });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  return (
    <div
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      hidden={!isOpen && maxHeight === "0px"}
      style={{
        maxHeight,
        overflow,
        transition: "max-height 200ms ease-in-out",
      }}
    >
      <div ref={innerRef} className={cn("px-4 pb-4 pt-0 text-sm text-muted-foreground", className)}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience re-export
// ---------------------------------------------------------------------------

export default Accordion;
