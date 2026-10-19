"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface WizardTransitionProps {
  children: React.ReactNode;
  currentStep: number;
  direction?: "forward" | "backward";
  className?: string;
}

export function WizardTransition({
  children,
  currentStep,
  direction = "forward",
  className = "",
}: WizardTransitionProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const slideDistance = prefersReducedMotion ? 0 : direction === "forward" ? 50 : -50;
  const duration = prefersReducedMotion ? 0.01 : 0.4;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial={{
            x: slideDistance,
            opacity: 0,
          }}
          animate={{
            x: 0,
            opacity: 1,
          }}
          exit={{
            x: -slideDistance,
            opacity: 0,
          }}
          transition={{
            duration,
            ease: "easeInOut",
          }}
          style={{ willChange: prefersReducedMotion ? "auto" : "opacity, transform" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
