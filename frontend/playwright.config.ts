import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const useBrowserStack = !!process.env.BROWSERSTACK_USERNAME;

// BrowserStack capabilities — only active when BROWSERSTACK_USERNAME is set
const bsCapabilities = (browserName: string, os: string, osVersion: string) => ({
  "bstack:options": {
    os,
    osVersion,
    projectName: "StellarVeriphy",
    buildName: process.env.GITHUB_RUN_ID ?? "local",
    userName: process.env.BROWSERSTACK_USERNAME,
    accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
  },
  browserName,
});

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],

  use: {
    baseURL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },

  projects: [
    // ── Local desktop browsers ──────────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    // ── Local mobile emulation ───────────────────────────────────────────────
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
    // ── Responsive breakpoint snapshots ─────────────────────────────────────
    {
      name: "breakpoint-xs",
      use: { ...devices["Galaxy S8"] },
    },
    {
      name: "breakpoint-sm",
      use: { viewport: { width: 640, height: 900 } },
    },
    {
      name: "breakpoint-md",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "breakpoint-lg",
      use: { viewport: { width: 1024, height: 768 } },
    },
    // ── BrowserStack real devices (only when credentials are present) ────────
    ...(useBrowserStack
      ? [
          {
            name: "bs-ios-safari",
            use: {
              connectOptions: {
                wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
                  JSON.stringify({
                    ...bsCapabilities("safari", "iOS", "16"),
                    "bstack:options": {
                      ...bsCapabilities("safari", "iOS", "16")["bstack:options"],
                      deviceName: "iPhone 14",
                      realMobile: true,
                    },
                  })
                )}`,
              },
            },
          },
          {
            name: "bs-android-chrome",
            use: {
              connectOptions: {
                wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(
                  JSON.stringify({
                    ...bsCapabilities("chrome", "Android", "13.0"),
                    "bstack:options": {
                      ...bsCapabilities("chrome", "Android", "13.0")["bstack:options"],
                      deviceName: "Samsung Galaxy S23",
                      realMobile: true,
                    },
                  })
                )}`,
              },
            },
          },
        ]
      : []),
  ],

  snapshotDir: "./e2e/snapshots",
  expect: { timeout: 10_000 },

  ...(useBrowserStack
    ? {}
    : {
        webServer: {
          command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "pnpm dev",
          cwd: __dirname,
          env: {
            NEXT_PUBLIC_MOCK_WALLET: process.env.NEXT_PUBLIC_MOCK_WALLET ?? "true",
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: baseURL,
        },
      }),
});
