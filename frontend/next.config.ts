/**
 * next.config.ts
 *
 * Next.js build and runtime configuration.
 *
 * Security headers are applied to every route via the `headers()` hook.
 * Image optimisation is configured via `images.remotePatterns` so that
 * next/image can serve IPFS and Arweave assets.
 *
 * Constants are sourced from `config/app.ts` to avoid magic strings.
 *
 * Bundle analysis can be enabled with: ANALYZE=true pnpm build
 */

import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

import { ALLOWED_IMAGE_URL_PATTERNS } from "./config/app";

// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------

const cspValue = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
  "connect-src 'self' https://horizon.stellar.org https://horizon-testnet.stellar.org https://soroban-rpc.mainnet.stellar.org https://soroban-rpc.testnet.stellar.org https://gateway.ipfs.io https://dweb.link https://*.ipfs.io wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-to csp-endpoint",
  "report-uri /api/csp-report",
].join("; ");

// ---------------------------------------------------------------------------
// Next.js config
// ---------------------------------------------------------------------------

const nextConfig: NextConfig = {
  transpilePackages: ["@stellarveriphy/shared"],

  // -------------------------------------------------------------------------
  // Image optimisation
  // -------------------------------------------------------------------------
  images: {
    remotePatterns: ALLOWED_IMAGE_URL_PATTERNS,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 600,
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },

  // -------------------------------------------------------------------------
  // Security headers
  // -------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspValue },
          {
            key: "Report-To",
            value:
              '{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"/api/csp-report"}]}',
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },

  // #437 — code splitting: keep heavy vendor chunks separate so unchanged
  // pages don't bust the cache for unrelated vendor code.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion", "react-icons"],
  },
};

// #437 — wrap with bundle analyser; run `ANALYZE=true pnpm build` to open report
const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: process.env.ANALYZE === "true" && process.env.CI !== "true",
  analyzerMode: "static",
  reportFilename: ".bundle-reports/bundle-analysis.html",
  generateStatsFile: true,
  statsFilename: ".bundle-reports/bundle-stats.json",
});

export default analyzer(nextConfig);
