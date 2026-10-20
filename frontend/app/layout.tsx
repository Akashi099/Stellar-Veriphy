import "./globals.css";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";

import { WizardProvider } from "@/app/context/WizardContext";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { NotificationProvider } from "@/components/notifications";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { HelpSearchOverlay } from "@/components/ui/HelpSearchOverlay";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { RouteScrollRestoration } from "@/components/ui/RouteScrollRestoration";
import { TutorialOverlay } from "@/components/ui/TutorialOverlay";
// #442 — import centralised constants instead of duplicating them here
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/app";
import { AuthSessionProvider } from "@/context/AuthSessionContext";
import { HelpProvider } from "@/context/HelpContext";
import { WalletProvider } from "@/context/WalletContext";
import { CacheInvalidationProvider } from "@/context/CacheInvalidationContext";
// #848 — detect unsupported browser capabilities and surface guidance
import { BrowserCapabilityBanner } from "@/components/BrowserCapabilityBanner";
// #440 — wrap application with React Query provider
import { ReactQueryProvider } from "@/lib/queryClient";
import { SkipToContentLink } from "@/utils/accessibility";

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
