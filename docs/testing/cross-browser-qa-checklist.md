# Cross-Browser QA Checklist (Release Candidates)

Copy this checklist into the release-candidate PR or QA ticket and tick each box.
Automated coverage lives in `frontend/e2e` (projects in `frontend/playwright.config.ts`);
this list covers what must still be confirmed by a human before shipping.

**RC version:** `vX.Y.Z-rc.N` · **Tester:** @handle · **Date:** YYYY-MM-DD · **Network:** testnet / mainnet

## 1. Required browsers

| Browser | Version | Platform | Playwright project | Pass |
| --- | --- | --- | --- | --- |
| Chrome | latest, latest-1 | Windows / macOS | `chromium` | [ ] |
| Firefox | latest, ESR | Windows / macOS | `firefox` | [ ] |
| Safari | latest | macOS | `webkit` | [ ] |
| Edge | latest | Windows | `chromium` | [ ] |
| Safari (iOS) | iOS 16+ | iPhone | `mobile-safari`, `bs-ios-safari` | [ ] |
| Chrome (Android) | latest | Android 13+ | `mobile-chrome`, `bs-android-chrome` | [ ] |

## 2. Required viewport sizes

| Breakpoint | Size | Playwright project | Pass |
| --- | --- | --- | --- |
| xs (small phone) | 360 × 740 | `breakpoint-xs` | [ ] |
| sm (large phone) | 640 × 900 | `breakpoint-sm` | [ ] |
| md (tablet) | 768 × 1024 | `breakpoint-md` | [ ] |
| lg (laptop) | 1024 × 768 | `breakpoint-lg` | [ ] |
| xl (desktop) | 1440 × 900 | `chromium` | [ ] |

At each size: no horizontal scroll, navigation reachable, dialogs fit on screen, tap targets ≥ 44px.

## 3. Key flows to validate

- [ ] **Home** — `/` loads, hero and navigation render, no console errors.
- [ ] **Wallet connection** — connect/disconnect Freighter (or mock wallet), address shown, rejection handled.
- [ ] **Upload & register** — upload media, attach manifest, review, submit; transaction status updates.
- [ ] **Verify a file** — `/verify`: hash computed locally, registry lookup, match and mismatch verdicts shown.
- [ ] **Verification wizard** — all five steps navigate forward/back; invalid manifest shows an error.
- [ ] **Certificate view** — `/certificate/[id]` renders, print/share actions work.
- [ ] **Explore / search** — search, filters and pagination return expected results.
- [ ] **Dashboard** — creator records listed, empty state shown for new wallets.
- [ ] **Error states** — 404 page, offline page (`/offline`), API failure messages are readable.
- [ ] **Theme** — light and dark mode render correctly on every flow above.
- [ ] **Accessibility** — keyboard-only pass of the verify flow; `pnpm --filter frontend test:a11y` green.

## 4. Automated gates (must be green)

- [ ] `pnpm --filter frontend test:e2e` (all local projects)
- [ ] `pnpm --filter frontend test:e2e:visual` (visual regression snapshots)
- [ ] `pnpm --filter @stellarveriphy/shared test` (includes API contract checks)

## 5. Sign-off

- [ ] All blockers filed as issues and linked here
- [ ] QA lead approval · [ ] Release owner approval
