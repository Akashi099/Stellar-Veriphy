import { test, expect, Page } from '@playwright/test';

/**
 * Web Vitals regression tests.
 *
 * Captures Core Web Vitals (LCP, CLS, INP) for representative routes and
 * asserts them against documented thresholds. Thresholds are environment-aware:
 * CI runners are typically slower/noisier, so we relax them there.
 *
 * Thresholds (see frontend/scripts/web-vitals-thresholds.md for documentation):
 *   - LCP (Largest Contentful Paint): "good" <= 2500ms, CI relaxed <= 4000ms
 *   - CLS (Cumulative Layout Shift):  "good" <= 0.1,    CI relaxed <= 0.25
 *   - INP (Interaction to Next Paint): "good" <= 200ms,  CI relaxed <= 500ms
 */

interface WebVitals {
  lcp: number;
  cls: number;
  inp: number;
}

interface Thresholds {
  lcp: number;
  cls: number;
  inp: number;
}

const IS_CI = !!process.env.CI;

const THRESHOLDS: Thresholds = IS_CI
  ? { lcp: 4000, cls: 0.25, inp: 500 }
  : { lcp: 2500, cls: 0.1, inp: 200 };

const ROUTES: string[] = ['/', '/certificates', '/verify'];

/**
 * Collects Core Web Vitals from the page using PerformanceObserver.
 *
 * - LCP: observed via 'largest-contentful-paint' entries (last entry wins).
 * - CLS: accumulated from 'layout-shift' entries without recent input.
 * - INP: approximated from 'event' entries (worst interaction duration).
 *
 * The helper waits for a short settle period so observers have a chance to
 * fire before we read the values.
 */
async function collectWebVitals(page: Page): Promise<WebVitals> {
  // Ensure the observers are installed before any navigation-triggered paint.
  await page.evaluate(() => {
    const w = window as unknown as {
      __webVitals?: { lcp: number; cls: number; inp: number };
    };
    w.__webVitals = { lcp: 0, cls: 0, inp: 0 };

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & {
          startTime: number;
        };
        if (last) {
          w.__webVitals!.lcp = last.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      /* LCP not supported */
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { value: number; hadRecentInput: boolean }
        >) {
          if (!entry.hadRecentInput) {
            w.__webVitals!.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* CLS not supported */
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { duration: number }
        >) {
          if (entry.duration > w.__webVitals!.inp) {
            w.__webVitals!.inp = entry.duration;
          }
        }
      }).observe({ type: 'event', buffered: true });
    } catch {
      /* INP not supported */
    }
  });

  // Give observers time to flush buffered entries.
  await page.waitForTimeout(500);

  return page.evaluate(() => {
    const w = window as unknown as {
      __webVitals?: { lcp: number; cls: number; inp: number };
    };
    return w.__webVitals ?? { lcp: 0, cls: 0, inp: 0 };
  });
}

test.describe('Web Vitals regression', () => {
  for (const route of ROUTES) {
    test(`Core Web Vitals within thresholds for route "${route}"`, async ({
      page,
    }) => {
      await page.goto(route, { waitUntil: 'networkidle' });

      // Trigger a lightweight interaction so INP has a chance to be measured.
      await page.mouse.move(10, 10);
      await page.mouse.click(10, 10);

      const vitals = await collectWebVitals(page);

      expect(
        vitals.lcp,
        `LCP for route "${route}" exceeded threshold (${vitals.lcp}ms > ${THRESHOLDS.lcp}ms)`,
      ).toBeLessThanOrEqual(THRESHOLDS.lcp);

      expect(
        vitals.cls,
        `CLS for route "${route}" exceeded threshold (${vitals.cls} > ${THRESHOLDS.cls})`,
      ).toBeLessThanOrEqual(THRESHOLDS.cls);

      expect(
        vitals.inp,
        `INP for route "${route}" exceeded threshold (${vitals.inp}ms > ${THRESHOLDS.inp}ms)`,
      ).toBeLessThanOrEqual(THRESHOLDS.inp);
    });
  }
});