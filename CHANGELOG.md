# Changelog

All notable changes to StellarVeriphy are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. Versions are listed in reverse chronological order (newest first). StellarVeriphy uses [Semantic Versioning](https://semver.org/). Contract changes that alter on-chain behavior or error discriminants are treated as breaking changes.

> **Labeling note:** Entries in this changelog are categorized using the canonical label taxonomy defined in the [Issue Labeling Guide](CONTRIBUTING.md#issue-labeling) in `CONTRIBUTING.md`. When adding entries, use the standardized labels (`documentation`, `frontend`, `security`, `performance`, `testing`, etc.) rather than ad-hoc tags. The label list in `CONTRIBUTING.md` is the single source of truth; update it there first if the taxonomy changes.

---

## [Unreleased]

### In Progress
- Manifest template library: template selector dropdown in `frontend/app/manifest/page.tsx`
- Certificate search and filtering: `CertificateSearch`, `CertificateFilters`, `CertificateResultsList`, `CertificateDetailCard` components, and `frontend/app/certificates/page.tsx` page
- Navigation link update for the new certificates search page

---

## [1.0.0] — 2025-08 (Current)

Initial production release of StellarVeriphy — a decentralized content verification and provenance platform built on the Stellar blockchain with Soroban smart contracts.

---

### Smart Contracts

#### Added
- **Oracle contract** (`contracts/oracle`) — verification request orchestration with full lifecycle management
  - `init(registry, provenance, admin)` entrypoint with initialization guard
  - `submit_request` / `submit_batch_request` (up to 10 items) with `Priority::Low/Normal/High/Urgent` levels and corresponding TTLs
  - `cancel_request` — requester-auth'd cancellation of pending requests
  - `verify_attestation` — ed25519 signature verification with cross-contract calls to Registry
  - `verify_tee_hash` — standalone TEE code hash approval check
  - Paginated `get_requests_by_state` with offset/limit
  - Round-robin load balancing with `get_next_available_provider`; skips providers in failure cooldown (`FAILURE_COOLDOWN_LEDGERS = 500`) or with ≥ 5 recent failures
  - SLA tracking: `set_provider_sla`, `record_verification`, `get_sla_compliance`; auto-suspends providers below 70% compliance with `SLAViolationEvent` and `ProviderAutoSuspendedEvent`
  - Cost estimation: `estimate_cost` returning `CostEstimate` with base, size, priority, and complexity fee breakdown
  - Dispute system: `file_dispute`, `resolve_dispute`, `dismiss_dispute`, `get_disputes_by_provider`
  - Staking: `deposit_stake`, `initiate_withdrawal`, `complete_withdrawal`, `slash_stake` (minimum stake 10 XLM / 1,000,000,000 stroops; withdrawal cooldown ~1 hour / 7200 ledgers)
  - Provider metrics: `record_verification_success`, `record_verification_failure`
  - Request archival: `archive_old_requests` (runs every 1000 ledgers, moves expired requests to persistent storage)
  - Circuit breaker: `pause` / `unpause` (admin-gated)
  - Configurable TTL: `update_ttl_config`, `update_warning_threshold`, `check_expiration_warning`
  - Request resubmission and attestation data storage (#164, #165)
  - Request aggregation for similar content (#167)
  - Request fee mechanism (#166)
  - Provider performance metrics tracking (#162)
  - Full Rustdoc documentation on all public functions and error variants (#369)

- **Provenance contract** (`contracts/provenance`) — immutable certificate store
  - `initialize(oracle)` — oracle-only mint authority setup
  - `mint(storage_ref, manifest_hash, attestation_hash, to)` — oracle-auth'd; prevents duplicate manifests; auto-assigns `VerificationLevel` (Standard when all fields populated, else Basic); indexes by creator; emits `CertificateMinted`
  - `get_certificate(id)` — returns `Result<ProvenanceCert, ProvenanceError>` instead of panicking
  - `revoke_certificate(id, reason)` — oracle-auth'd; `RevocationReason` enum (FraudulentContent, LegalRequirement, CreatorRequest, ContractualViolation); emits `CertificateRevoked` (#171)
  - `transfer_certificate(id, new_owner)` — owner-auth'd; blocked when certificate is locked; emits `CertificateTransferred` (#172)
  - `update_metadata` / `get_metadata` — owner-auth'd mutable display name and description with version tracking (#173)
  - `get_certificates_by_time_range(start, end, offset, limit)` — paginated time-range queries (#174)
  - `mint_batch(storage_refs, manifest_hashes, attestation_hashes, to)` — oracle-auth'd batch of up to 50 certificates (#175)
  - `set_verification_level` — oracle-auth'd upgrade to Basic/Standard/Premium/Enterprise (#176)
  - `set_expiration` / `is_certificate_expired` / `renew_certificate` / `check_expiration_warning` — optional expiry timestamps (#177)
  - `link_certificates(id, relation)` — Parent/Child/Sibling bidirectional linking with cycle detection (max 20-hop walk); emits `CertificatesLinked` (#178)
  - `get_certificate_stats`, `get_creator_certificate_count`, `get_minting_time_series` — daily minting analytics (#179)
  - Certificate search by creator with amendment history and verification codes (#181, #182)
  - `lock_certificate(id)` — owner-auth'd irreversible immutability lock; emits `CertificateLockedEvent` (#184)
  - `create_collection`, `add_certificate_to_collection`, `get_certificates_in_collection` — portfolio/collection support (#185)
  - `set_media_properties` / `get_certificates_by_content_type` — rich media metadata (Image/Video/Audio/Document) with MIME type, resolution, duration, codec (#183)
  - `get_certificate_history(id, offset, limit)` — paginated amendment log (#181)
  - `generate_verification_code` / `verify_by_code` — 8-char alphanumeric codes for non-technical verification (#182)

- **Registry contract** (`contracts/registry`) — trust anchor for TEE code hashes and oracle providers
  - `init(admin, provenance)` — bootstraps multisig admin list and next proposal counter
  - `add_tee_hash` / `is_tee_hash_approved` / `is_tee_hash_near_expiry` — 180-day validity window with 14-day warning period
  - `rotate_tee_hash(old, new)` — marks old hash rotated, stores migration pointer, registers new hash; emits `tee_rot`
  - `get_tee_hash_migration` — looks up replacement hash for a rotated entry
  - TEE hash versioning: `add_tee_hash_version`, `deprecate_tee_hash`, `get_tee_hashes_by_version`, `get_tee_hash_version_history` (#187)
  - `add_provider` / `is_provider` / `remove_provider` — provider registration with 32-byte public key; seeds reputation at 500/1000
  - Service tiers: `set_provider_tier`; `ServiceTier::Basic/Standard/Premium` (#188)
  - Provider onboarding: `submit_provider_application` / `review_application`; approval auto-registers provider (#189)
  - Provider lifecycle: `deactivate_provider` (30-day grace period), `finalize_removal`, `can_accept_new_requests` (#190)
  - Reputation system: `record_verification_result`, `apply_reputation_decay` (−50 per 30-day inactive period), `get_providers_by_min_reputation` (#186)
  - Geographic regions: `set_provider_regions`, `add_provider_region`, `get_providers_by_region` (#192)
  - Capacity management: `set_provider_capacity`, `increment_active_requests`, `decrement_active_requests`, `has_capacity` (#193)
  - Specializations: `ImageVerification`, `VideoVerification`, `DocumentVerification`, `AiDetection`, `AudioVerification`; `get_providers_by_specialization` (#194)
  - Blacklist: `blacklist_provider(reason_code)`, `whitelist_provider`, `is_blacklisted`, `is_provider_authorized` (#195)
  - Multisig governance: `propose_operation`, `approve_proposal`, `execute_proposal`; configurable threshold (#163)
  - `verify_and_mint(content, expected_hash, owner)` — on-chain SHA-256 comparison + cross-contract `ProvenanceClient::mint` (#24)
  - Attestation certificate references: `attach_cert_ref`, `get_cert_ref`, `validate_cert_expiration` — X.509-style metadata on TEE hashes

#### Fixed
- Provenance: restored certificate revocation logic lost in a prior merge
- Provenance: bumped `soroban-sdk` to 23.0.0 to enable `#[contractevent]` macro
- Registry: shortened `get_providers_by_min_reputation` function name to stay within Soroban symbol limits
- Oracle: replaced `PaginatedRequests` tuple type with a proper named struct

---

### Frontend (`frontend`)

#### Added
- **Next.js 15 application** (`frontend/`) with TypeScript strict mode enabled (#367)
- Home page, creator upload flow (`/creator/upload-content`), and certificate viewer
- Wallet integration via `@stellar/freighter-api 6.0.1` with `WalletContext` provider; mock wallet shim for local dev and e2e (`NEXT_PUBLIC_MOCK_WALLET=true`)
- Transaction History Explorer page with status/type/description/hash columns
- Certificate verification panel with `CertificateCardSkeleton` loading state
- Batch verification, timeline view, notifications panel, and comparison tool
- Manifest editor, hash calculator, embed widget, and API key management components
- Form auto-save, infinite scroll, keyboard shortcuts, and contextual help system
- Input validation and sanitization (`frontend/lib/security/inputValidation.ts`) with Stellar address format, SHA-256 hex, MIME type allowlist, and 100MB file size cap
- **Dark mode theme system** (#221): HSL CSS variable tokens, `ThemeProvider` with `localStorage` persistence, system `prefers-color-scheme` detection, `ThemeToggle` in desktop and mobile nav, FOUC prevention via inline script, smooth 300ms transitions, `prefers-reduced-motion` support
- **Skeleton loading states** (#222): `CertificateCardSkeleton`, `TransactionListSkeleton`, `DashboardWidgetSkeleton`, `StatsCardsSkeleton`, `TableSkeleton`, `CardGridSkeleton`, `FormSkeleton`; `LiveRegion` component and `useLoadingAnnouncement` hook; full ARIA attributes on all skeleton elements
- **Progressive Web App** (#223): service worker (`public/sw.js`) with network-first/cache-first strategies, offline fallback page (`/offline`), web app manifest with all icon sizes (72px–512px), custom install prompt with 7-day dismissal cooldown, push notification support (VAPID), `usePWA` hook, `pwa.ts` utility library
- **Accessibility improvements** (#224): ARIA roles and labels throughout, skip-to-content link, focus trapping in modals, `useFocusManager` hook, `SkipToContentLink` component, screen reader live region announcements, WCAG AA color contrast
- **Responsive mobile design** (#225): mobile-first Tailwind breakpoints (xs 375px through 2xl 1536px), minimum 44px touch targets, safe area insets, swipe gestures in mobile nav, `useBreakpoint` / `useIsMobile` hooks, `ResponsiveContainer` component
- **Loading progress indicators** (#226): `ProgressBar` with percentage and ARIA, `PageTransitionLoader`, step indicators, time-estimate calculations, `useOperationLoader` hook, file upload progress
- **Toast notification system** (#227): `ToastProvider` with success/error/warning/info types, configurable duration and position (6 positions), action buttons with callbacks, auto-dismiss progress bar, screen reader announcements
- Reusable loading spinner component (#364)
- Custom 404 not-found page with navigation links (#368)
- Favicon, app icons, and layout metadata (#370)
- Footer component with links, copyright notice, and social media icons (#371)
- Breadcrumb navigation, button variants, social meta tags, and OpenGraph configuration
- Clipboard hook (`useClipboard`), logger utility, and environment variable documentation
- E2E test setup, `sitemap.xml`, and `robots.txt` configuration
- Form input enhancements and developer documentation
- Video tutorials page and contract error code documentation

#### Fixed
- Removed `framer-motion` import from Ecosystem component that caused build failure
- Added missing `framer-motion` dependency
- Added null checks for focusable elements in `Header` component
- Added wallet type parameter to `connect()` calls
- `ToastProvider` action-button type coloring and optional-prop TypeScript typing
- Pre-existing lint and type errors blocking frontend production build
- Resolved rebase conflicts against upstream API and adapted component interfaces

---

### Shared Package (`packages/shared`)

#### Added
- `ContentManifest`, `ProvenanceCert`, and `VerificationStatus` TypeScript types
- SHA-256 hashing utilities in `utils/hash.ts`
- Vitest 2.1.8 test suite with `@vitest/coverage-v8`
- Stryker mutation testing (`@stryker-mutator/core 8.7.1`) with `test:mutation` script

---

### Testing (`testing`)

#### Added
- **Contract unit tests** (#239): 26 new Oracle tests (provider management, pause, staking, load balancing, reputation, dispute); 43 new Registry tests (TEE hash near-expiry, versioning, deprecation, reputation decay, regions, capacity, specializations, blacklist, multisig timelock, `verify_and_mint` hash mismatch); snapshot files in `test_snapshots/`
- **Contract integration tests** (#238): 15 `integration_*` tests in `contracts/oracle/src/test.rs` covering the full Oracle → Registry → Provenance call chain, dispute lifecycle, SLA auto-suspend/reinstate, batch requests, pause blocking, cost estimation, TTL ordering, and pagination
- **Frontend unit tests** (#237): Jest 29 + jsdom dual-project config (node + jsdom); `__mocks__/` stubs; tests for `manifestUseCases`, `certificateVerificationService`, `verificationStatusService`, `wallet`, `cn`, `crypto`, `hashing`, `manifestConverter`, `manifestTemplates`, `transaction`; 80% coverage threshold enforced
- **E2E tests** (#236): Playwright config with Chromium/Firefox/WebKit matrix; `wallet-connection.spec.ts` (11 tests), `file-upload-verification.spec.ts` (13 tests), `certificate-viewing.spec.ts` (16 tests), `search-and-filtering.spec.ts` (22 tests); `e2e/helpers/` and `e2e/fixtures/` support files
- CI workflow (`ci.yml`): `frontend-unit-tests` job (lint + build + Jest 80% threshold), `build-contracts` job (fmt + clippy + wasm build + unit + integration), `contract-coverage` job (cargo-llvm-cov lcov per contract), `e2e-tests` job (Playwright matrix), `ci-complete` gate requiring all jobs to pass

---

### CI/CD and Infrastructure

#### Added
- GitHub Actions E2E workflow (`.github/workflows/e2e.yml`): triggers on `pull_request` and push to `main`; runs Playwright `home.spec.ts` against Chromium; uploads HTML report artifact
- GitHub Actions contract-docs workflow (`.github/workflows/contract-docs.yml`): generates rustdoc and deploys to GitHub Pages on contract source changes
- Multi-stage `Dockerfile`: Stage 1 (Rust/WASM contract build), Stage 2 (Next.js production build), Stage 3 (non-root runtime with health check)
- `Dockerfile.dev` for hot-reload development container
- `docker-compose.yml` with `app` (production, port 3000) and `dev` (port 3001, `--profile dev`) services
- `Makefile` with `build`, `build-dev`, `up`, `down`, `test`, `test-contracts`, `build-contracts`, `ci-build`, `ci-test` targets
- `scripts/deploy/blue-green-deploy.sh`: blue-green frontend deployment with nginx upstream switching, health polling (90s timeout), and `rollback` command
- `deploy.sh`: contract WASM build, upload, and initialization script for testnet/mainnet
- Husky git hooks: `pre-commit` (lint-staged: Prettier + ESLint on TS/TSX, Prettier on JS/JSON/YAML, rustfmt on Rust), `pre-push` (full frontend production build)

#### Fixed
- Removed `dependabot.yml` and conflicting workflow directory entries from prior merge
- Fixed pre-existing build blockers exposed by security header changes

---

### Security (`security`)

#### Added
- HTTP security headers in `frontend/next.config.ts`: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (1 year + subdomains), `Referrer-Policy`, `Permissions-Policy`
- CSP violation reporting endpoint at `/api/csp-report`
- Per-address rate limiting with exponential backoff on the verification API route; configurable via environment variables
- Hash-chained tamper-evident audit log (`frontend/lib/security/auditLogger.ts`) with 90-day retention, viewable at `/tools/audit-logs`
- API key management: SHA-256 hash-only storage; raw key shown once at creation, never persisted
- `frontend/lib/security/inputValidation.ts` — centralized request validation

---

### Documentation (`documentation`)

#### Added
- `README.md` — comprehensive project overview with architecture diagram, tech stack, monorepo structure, and quick-start guide with CI and version badges (#365)
- `CONTRIBUTING.md` — full contribution guidelines: code of conduct, bug/feature reporting, dev setup, coding standards, commit message format, branch naming, PR process, and the canonical Issue Labeling Guide (#366)
- `STYLE-GUIDE.md` — TypeScript/React and Rust/Soroban coding style reference
- `contracts/IMPLEMENTATION.md` — storage conventions, TTL strategy, cross-contract call patterns, error enum rules, event patterns
- `DEPLOYMENT.md` — contract deployment guide, initialization order, admin key handling, rollback procedures
- `DOCKER.md` — Docker build and compose reference
- `docs/onboarding.md` — developer onboarding guide
- `docs/deployment.md` — full deployment process including network configuration and verification steps
- `docs/user-guide.md` — end-user guide
- `docs/INTEGRATION_GUIDE.md` — third-party integration guide
- `docs/adr/` — Architecture Decision Records (including ADR-0004: TEE oracle trust model)
- `docs/api/` — API contract documentation
- `docs/security/key-management.md` — key inventory, HSM requirements, rotation procedures (`security`)
- `docs/security/smart-contract-audit-runbook.md` — audit firm selection, finding remediation, report publication (`security`)
- `docs/security/verification-service-security.md` — rate limiting, input validation, CSP, audit logging (`security`)
- `docs/security/security-headers.md` — HTTP header rationale and verification instructions (`security`)
- `docs/deployment/ci-cd-pipeline.md` — CI/CD pipeline documentation
- `docs/testing/` — testing strategy docs for accessibility, fuzzing, security, and performance testing (`testing`)
- `docs/wizard_form_validation.md`, `docs/print_layout_certificates.md`, `docs/empty_state_designs.md`, `docs/micro_interactions.md` — UI feature design specs (#232–#235) (`frontend`)
- `contracts/provenance/DEPLOYMENT.md` — provenance-specific deployment reference
- `frontend/README.md` — frontend-specific documentation (`frontend`)

---

## Versioning and Upgrade Notes

### Contract immutability
Soroban contracts on Stellar have no upgrade mechanism. Any bug fix or breaking change to contract behavior requires deploying a new contract instance and migrating consumers (frontend, third-party integrators) to the new contract address. Error discriminant numbers must not be renumbered between deployed versions — renumbering breaks off-chain error parsing against live instances.

### Initialization order
Deploy and initialize contracts in this order: **Registry → Oracle → Provenance**. The Oracle `init` function requires both the Registry and Provenance addresses. The Provenance `initialize` function requires the Oracle address. Reversing or skipping this order produces `NotInitialized` errors on cross-contract calls.

### soroban-sdk version divergence
The three contracts currently use different `soroban-sdk` versions: Registry 21.0.0, Oracle 21.7.7, Provenance 23.0.0. This is a tracked maintenance concern. Future contract updates should align all three to the same version to reduce ABI risk on cross-contract calls.

---

[Unreleased]: https://github.com/Stellar-Veriphy/Stellar-Veriphy/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Stellar-Veriphy/Stellar-Veriphy/releases/tag/v1.0.0
