"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NotificationBell } from "@/components/notifications";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useWallet } from "@/context/WalletContext";
import { renderTextWithLink } from "@/utils/renderTextWithLink";

interface NavLink {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface MobileNavProps {
  links: NavLink[];
  quickActions?: NavLink[];
}

export function MobileNav({ links, quickActions = [] }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { connected, publicKey, connect, disconnect, error, clearError } = useWallet();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleWalletClick = async () => {
    if (connected) {
      disconnect();
    } else {
      await connect("freighter");
    }
  };

  const drawerVariants = {
    closed: {
      x: "-100%",
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 300,
        damping: 30,
        duration: prefersReducedMotion ? 0.01 : undefined,
      },
    },
    open: {
      x: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 300,
        damping: 30,
        duration: prefersReducedMotion ? 0.01 : undefined,
      },
    },
  };

  const overlayVariants = {
    closed: { opacity: 0 },
    open: { opacity: 1 },
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 rounded touch-target transition-colors duration-150"
        aria-label="Open mobile menu"
        aria-expanded={isOpen}
        aria-controls="mobile-drawer"
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
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Overlay & Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={overlayVariants}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              aria-hidden="true"
            />

            {/* Drawer */}
            <motion.div
              ref={drawerRef}
              id="mobile-drawer"
              initial="closed"
              animate="open"
              exit="closed"
              variants={drawerVariants}
              className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl z-50 md:hidden overflow-y-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <Link
                    href="/"
                    className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                      ⭐ StellarVeriphy
                    </span>
                  </Link>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded touch-target transition-colors duration-150"
                    aria-label="Close mobile menu"
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

                {/* Quick Actions */}
                {quickActions.length > 0 && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-4 px-1">
                      Quick Access
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {quickActions.map((action) => (
                        <Link
                          key={action.href}
                          href={action.href}
                          onClick={() => setIsOpen(false)}
                          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 touch-target"
                        >
                          {action.icon && (
                            <span className="text-3xl mb-2" aria-hidden="true">
                              {action.icon}
                            </span>
                          )}
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-center line-clamp-2">
                            {action.label}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Navigation Links */}
                <nav className="flex-1 p-4 space-y-2" aria-label="Mobile navigation links">
                  {links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 touch-target ${
                          isActive
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-l-4 border-blue-600"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {link.icon && <span className="text-lg" aria-hidden="true">{link.icon}</span>}
                        <span className="text-base">{link.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Theme</span>
                    <ThemeToggle />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Notifications</span>
                    <NotificationBell />
                  </div>

                  <button
                    onClick={handleWalletClick}
                    className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 active:from-blue-700 active:to-purple-800 text-white font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 touch-target text-base"
                    aria-label={connected ? "Disconnect wallet" : "Connect wallet"}
                  >
                    {connected
                      ? `${publicKey?.slice(0, 8)}...${publicKey?.slice(-4)}`
                      : "Connect Wallet"}
                  </button>
                  {error && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-red-700 bg-red-900/90 px-3 py-2.5 text-xs text-red-200"
                    >
                      <p className="flex-1">
                        {renderTextWithLink(error, "underline hover:text-red-100")}
                      </p>
                      <button
                        onClick={clearError}
                        aria-label="Dismiss error"
                        className="shrink-0 text-red-400 hover:text-red-100 transition-colors leading-none"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
