import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";

import { WizardProvider } from "@/app/context/WizardContext";
// #848 — detect unsupported browser capabilities and surface guidance
import { BrowserCapabilityBanner } from "@/components/BrowserCapabilityBanner";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// #917 — observe layout shifts caused by custom font loading/swaps
import { FontLoadingMetrics } from "@/components/FontLoadingMetrics";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { NotificationProvider } from "@/components/notifications";
import { OfflineStatusIndicator } from "@/components/OfflineStatusIndicator";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { WelcomeBanner } from "@/components/onboarding/WelcomeBanner";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import SiteHeader from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { HelpSearchOverlay } from "@/components/ui/HelpSearchOverlay";
import { RouteScrollRestoration } from "@/components/ui/RouteScrollRestoration";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { TutorialOverlay } from "@/components/ui/TutorialOverlay";
// #442 — import centralised constants instead of duplicating them here
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/app";
import { AuthSessionProvider } from "@/context/AuthSessionContext";
import { CacheInvalidationProvider } from "@/context/CacheInvalidationContext";
import { HelpProvider } from "@/context/HelpContext";
import { WalletProvider } from "@/context/WalletContext";
// #440 — wrap application with React Query provider
import { ReactQueryProvider } from "@/lib/queryClient";
import { SkipToContentLink } from "@/utils/accessibility";

// #917 — custom fonts with metric-matched fallbacks to minimise layout shift
// during font swap. `size-adjust`/`ascent-override`/`descent-override` align the
// fallback's metrics with the custom face so text occupies the same space.
const GeistSans = localFont({
  src: [
    { path: "../public/fonts/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/Geist-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "ascent-override", value: "90.2%" },
    { prop: "descent-override", value: "22.4%" },
    { prop: "line-gap-override", value: "0%" },
    { prop: "size-adjust", value: "100%" },
  ],
});

const GeistMono = localFont({
  src: [
    { path: "../public/fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "ascent-override", value: "90.2%" },
    { prop: "descent-override", value: "22.4%" },
    { prop: "line-gap-override", value: "0%" },
    { prop: "size-adjust", value: "100%" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  viewport: "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover",
  robots: "index, follow",
  themeColor: "#3b82f6",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  other: {
    "darkreader-lock": "true",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="ios-full-height">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans safe-inset`}>
        {/* #917 — capture layout-shift entries during font swap (dev + monitoring) */}
        <FontLoadingMetrics />
        <SkipToContentLink />
        <ReactQueryProvider>
          {/* #847 — AuthSessionProvider sits above dependent providers so persisted
              session state hydrates before they render */}
          <AuthSessionProvider>
            <CacheInvalidationProvider>
              <ThemeProvider>
                <WalletProvider>
                  <NotificationProvider>
                    <WizardProvider>
                      <HelpProvider>
                        <KeyboardShortcutsProvider>
                          <ToastProvider>
                            {/* #787 — site-wide notice while maintenance mode is on */}
                            <MaintenanceBanner />
                            {/* #894 — dismissible first-run banner pointing creators at their next action */}
                            <WelcomeBanner />
                            {/* #848 — dismissible banner naming missing browser capabilities */}
                            <BrowserCapabilityBanner />
                            <SiteHeader />
                            {/* #438 — top-level boundary: catches errors in any provider or page */}
                            <ErrorBoundary section="Application">
                              {/* #438 — boundary around the page content */}
                              <ErrorBoundary section="Page">{children}</ErrorBoundary>
                            </ErrorBoundary>
                            <ScrollToTop />
                            <RouteScrollRestoration />
                            <HelpSearchOverlay />
                            <TutorialOverlay />
                            <PWAInstallPrompt />
                            <PWAUpdatePrompt />
                            <ConsentBanner />
                            <OnboardingFlow />
                          </ToastProvider>
                        </KeyboardShortcutsProvider>
                      </HelpProvider>
                    </WizardProvider>
                  </NotificationProvider>
                </WalletProvider>
              </ThemeProvider>
            </CacheInvalidationProvider>
          </AuthSessionProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
