/**
 * E2E — Record verification flow (/verify, hash comparison view).
 *
 * Covers the main journey: pick a file, look up matching provenance records,
 * compare against a record, and see the verdict. The registry API is mocked so
 * the test is deterministic. Selectors use labels and roles only.
 */

import { createHash } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

const FILE = { name: "photo.txt", mimeType: "text/plain", buffer: Buffer.from("stellar veriphy e2e fixture") };
const FILE_HASH = createHash("sha256").update(FILE.buffer).digest("hex");
const OTHER_HASH = "f".repeat(64);

const record = {
  id: "rec-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  manifestHash: "a".repeat(64),
  fileName: FILE.name,
  mimeType: FILE.mimeType,
  fileSize: FILE.buffer.length,
  contentHash: FILE_HASH,
  creator: "GCREATORADDRESSEXAMPLE",
  title: "E2E fixture",
  tags: [],
  manifest: { contentHash: FILE_HASH, creator: "GCREATORADDRESSEXAMPLE", timestamp: "2026-01-01T00:00:00.000Z" },
};

async function mockUploads(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/uploads?*", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

async function openAndSelectFile(page: Page): Promise<void> {
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "Verify a file" })).toBeVisible();
  await page.getByLabel("File to check").setInputFiles(FILE);
  await expect(page.getByText(FILE_HASH)).toBeVisible();
}

const searchButton = (page: Page) => page.getByRole("button", { name: /Search StellarVeriphy records/i });

test.describe("record verification flow", () => {
  test("finds a record and confirms a match", async ({ page }) => {
    await mockUploads(page, { data: [record] });
    await openAndSelectFile(page);

    await searchButton(page).click();
    await expect(page.getByText(/Found 1 record for this exact file/i)).toBeVisible();

    await page.getByRole("button", { name: "Compare against this record" }).click();
    await expect(page.getByLabel(/Hash from the provenance record/i)).toHaveValue(FILE_HASH);
    await expect(page.getByText(/✓ Match\./)).toBeVisible();
  });

  test("shows a mismatch when the recorded hash differs", async ({ page }) => {
    await openAndSelectFile(page);
    await page.getByLabel(/Hash from the provenance record/i).fill(OTHER_HASH);
    await expect(page.getByText(/✗ No match\./)).toBeVisible();
  });

  test("rejects a malformed recorded hash", async ({ page }) => {
    await openAndSelectFile(page);
    await page.getByLabel(/Hash from the provenance record/i).fill("not-a-hash");
    await expect(page.getByText(/can't be compared/i)).toBeVisible();
  });

  test("warns when no record exists for the file", async ({ page }) => {
    await mockUploads(page, { data: [] });
    await openAndSelectFile(page);
    await searchButton(page).click();
    await expect(page.getByText(/No provenance record exists for this exact file/i)).toBeVisible();
  });

  test("surfaces registry lookup errors", async ({ page }) => {
    await mockUploads(page, { error: { message: "Registry unavailable" } }, 500);
    await openAndSelectFile(page);
    await searchButton(page).click();
    await expect(page.locator(".error-text")).toBeVisible();
    await expect(searchButton(page)).toBeEnabled();
  });
});
