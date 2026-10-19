import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/verify", "/manifest", "/tools", "/builder"];

for (const route of routes) {
  test(`route ${route} has no critical or serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blockingViolations = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious"
    );

    if (blockingViolations.length > 0) {
      console.log(
        `[a11y:${route}]`,
        JSON.stringify(
          blockingViolations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            count: violation.nodes.length,
            help: violation.help,
          })),
          null,
          2
        )
      );
    }

    expect(blockingViolations).toEqual([]);
  });
}
