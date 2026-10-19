/**
 * E2E — Visual regression snapshots for core pages.
 *
 * Captures a curated set of pages and compares them with baselines stored in
 * `e2e/snapshots`. Kept lightweight for CI: Chromium desktop only, animations
 * disabled, dynamic regions masked.
 *
 * Update baselines:  pnpm --filter frontend test:e2e:visual --update-snapshots
 * Review diffs:      pnpm --filter frontend test:e2e:report (expected/actual/diff side by side)
 */

import { expect, test } from "@playwright/test";

const CORE_PAGES = [
  { name: "home", path: "/" },
  { name: "verify", path: "/verify" },
  { name: "explore", path: "/explore" },
  { name: "certificates", path: "/certificates" },
  { name: "not-found", path: "/__visual-regression-missing__" },
];

test.describe("visual regression", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Snapshots are captured on Chromium only");

  for (const { name, path } of CORE_PAGES) {
    test(`${name} page matches snapshot`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
        mask: [page.locator("time, [data-testid='timestamp'], [data-dynamic]")],
      });
    });
  }
});
