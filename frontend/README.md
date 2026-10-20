# Frontend

This is the Next.js frontend for StellarVeriphy, a decentralized platform for digital content verification and provenance on the Stellar blockchain.

## Prerequisites

- Node.js 18+
- pnpm (recommended package manager)

## Scripts

```bash
pnpm dev      # Start development server (localhost:3000)
pnpm build    # Build for production
pnpm start    # Start production server
pnpm lint     # Run ESLint
pnpm test     # Run Jest tests
pnpm test:watch  # Run tests in watch mode
pnpm test:e2e # Run Playwright end-to-end tests
```

## Environment Variables

All environment variables consumed by the frontend are prefixed `NEXT_PUBLIC_` because they are read in client-side code and inlined at build time by Next.js.

| Variable                             | Description                                                                                                                                                     | Required                                          | Example                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_NETWORK`                | Active Stellar network: `testnet`, `mainnet`, or `futurenet`                                                                                                    | Optional (defaults to `testnet`)                  | `testnet`                                                   |
| `NEXT_PUBLIC_TESTNET_RPC_URL`        | Soroban RPC URL used when connected to Testnet                                                                                                                  | Optional (falls back to the public Testnet RPC)   | `https://soroban-testnet.stellar.org`                       |
| `NEXT_PUBLIC_MAINNET_RPC_URL`        | Soroban RPC URL used when connected to Mainnet                                                                                                                  | Optional (falls back to a public Mainnet RPC)     | `https://mainnet.stellar.validationcloud.io/v1/soroban/rpc` |
| `NEXT_PUBLIC_FUTURENET_RPC_URL`      | Soroban RPC URL used when connected to Futurenet                                                                                                                | Optional (falls back to the public Futurenet RPC) | `https://rpc-futurenet.stellar.org`                         |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE`     | Overrides the network passphrase reported to wallet adapters (Albedo, xBull) that cannot query the connected network directly                                   | Optional (defaults to the Testnet passphrase)     | `Test SDF Network ; September 2015`                         |
| `NEXT_PUBLIC_ORACLE_CONTRACT_ID`     | Deployed Soroban contract ID for the Oracle contract                                                                                                            | Required for staging/production; optional locally | `CA...` (56-character Soroban contract ID)                  |
| `NEXT_PUBLIC_PROVENANCE_CONTRACT_ID` | Deployed Soroban contract ID for the Provenance contract                                                                                                        | Required for staging/production; optional locally | `CA...` (56-character Soroban contract ID)                  |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`   | Deployed Soroban contract ID for the Registry contract                                                                                                          | Required for staging/production; optional locally | `CA...` (56-character Soroban contract ID)                  |
| `NEXT_PUBLIC_MOCK_WALLET`            | Set to `"true"` to use the in-memory mock wallet service instead of a real wallet extension (Freighter/Albedo/xBull) — used for local development and e2e tests | Optional (defaults to disabled)                   | `true`                                                      |

Create a `.env.local` file based on `.env.local.example` or set these variables in your deployment environment.

| Variable                             | Description                                                |
| ------------------------------------ | ---------------------------------------------------------- |
| `NEXT_PUBLIC_MOCK_WALLET`            | Set to `"true"` to enable mock wallet mode for development |
| `NEXT_PUBLIC_ORACLE_CONTRACT_ID`     | Soroban contract ID for the Oracle contract                |
| `NEXT_PUBLIC_PROVENANCE_CONTRACT_ID` | Soroban contract ID for the Provenance contract            |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`   | Soroban contract ID for the Registry contract              |

Create a `.env.local` file based on `.env.example` (if available) or set these variables in your deployment environment.

## End-to-End Tests

Playwright is configured in `playwright.config.ts`. The test runner starts the
Next.js app automatically, using `pnpm dev` by default and
`NEXT_PUBLIC_MOCK_WALLET=true` so tests do not require a browser wallet
extension.

```bash
pnpm install
pnpm exec playwright install
pnpm test:e2e -- e2e/home.spec.ts --project=chromium
```

If a local server is already running, Playwright reuses it. To test a production
build locally:

```bash
pnpm build
$env:PLAYWRIGHT_WEB_SERVER_COMMAND="pnpm start"
pnpm test:e2e -- e2e/home.spec.ts --project=chromium
```

The GitHub Actions workflow at `.github/workflows/e2e.yml` builds the frontend,
starts the production server through Playwright, runs the home page E2E test in
Chromium, and uploads the Playwright HTML report.

## SEO

The app generates `/sitemap.xml` from `app/sitemap.ts` and `/robots.txt` from
`app/robots.ts` during Next.js builds. Set `NEXT_PUBLIC_APP_URL` to the canonical
production origin so generated sitemap and robots URLs are absolute.

After deploying production, submit `https://your-domain.example/sitemap.xml` in
Google Search Console and Bing Webmaster Tools. Preview, staging, and
development deployments can opt out of crawling by setting
`NEXT_PUBLIC_DEPLOY_ENV` or `VERCEL_ENV` to `preview`, `staging`, or
`development`.

## Pages and Routes

| Route                                   | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `/`                                     | Home page with landing sections (hero, about, how it works, ecosystem) |
| `/verify`                               | Content verification wizard with multiple steps                        |
| `/manifest`                             | Interactive manifest generator with live preview                       |
| `/builder`                              | Certificate builder page                                               |
| `/stepper-demo`                         | Demo page for stepper component                                        |
| `/skeleton-demo`                        | Demo page for skeleton loading component                               |
| `/creator/upload-content`               | Content upload flow (creator mode)                                     |
| `/creator/upload-content/media-input`   | Media input step                                                       |
| `/creator/upload-content/manifest-step` | Manifest step in creator flow                                          |
| `/creator/upload-content/review`        | Review step before submission                                          |
| `/report-issue`                         | Issue reporting page                                                   |
| `/api/health`                           | Health check API endpoint                                              |

## Component Structure

### `components/`

- **ui/** - Reusable UI primitives (Modal, ScrollToTop, Skeleton, Stepper)
- **wallet/** - Wallet connection components (AccountDropdown, NetworkBadge, TransactionTracker, WrongNetworkWarning)
- **landing/** - Landing page sections (Header, HeroSection, AboutSection, HowItWorksSection, EcosystemSection, CallToActionSection)
- **manifest/** - Manifest-related components (ManifestPreview, ManifestModal, ManifestModalTrigger, KeyValueBuilder, FormatToggle)

### `features/verification/`

- **components/** - Verification wizard components
  - **steps/** - Individual wizard steps (ModeSelection, MediaInput, ManifestStep, AdvancedInput, SPVOptions, SPVResults)
  - WizardNavigation.tsx - Navigation controls
  - WizardPageShell.tsx - Page layout wrapper
  - WizardStepper.tsx - Progress stepper UI
- **store/** - Zustand store (wizard.store.ts)
- **hooks/** - Custom hooks (useWizardGuard.ts)
- **types/** - TypeScript types (wizard.types.ts)

### `context/`

- WizardContext.tsx - React context for wizard state
- WalletContext.tsx - Wallet connection context
- ThemeContext.tsx - Theme management
- ToastContext.tsx - Toast notification context

### `app/`

- Next.js App Router pages and layouts
- `/api/` - API route handlers

## Frontend State Architecture

State is organized into four layers. Pick the layer that matches the scope of the data you are adding:

| Layer | Location | Responsibility |
| --- | --- | --- |
| React Context | `context/` | App-wide, low-frequency state shared across routes: wallet connection (`WalletContext`), theme (`ThemeContext`), toasts (`ToastContext`), and the legacy wizard context (`WizardContext`). |
| Zustand stores | `features/*/store/` | Feature-scoped client state with actions and selectors, e.g. the verification wizard (`features/verification/store/wizard.store.ts`). Prefer this over new contexts for feature state. |
| Custom hooks | `features/*/hooks/`, `hooks/` | Encapsulate reusable logic and derived state, and act as the boundary between components and stores/contexts (e.g. `useWizardGuard`). |
| Data fetching | React Query providers + `lib/` clients | Server/chain data (Soroban RPC, contract reads) is fetched and cached through React Query; components should not call RPC clients directly. |

Where new features belong:

- New global concern (auth, network, theme) → add a provider in `context/` and register it in the app layout.
- New feature state → create `features/<feature>/store/` with a Zustand store plus typed selectors.
- New server data → add a React Query hook in `features/<feature>/hooks/` backed by a client in `lib/`.
- Reusable UI only → `components/ui/`; keep it free of store and context imports.

For a deeper walkthrough of the boundaries, data flow, and conventions, see [`docs/frontend-state-architecture.md`](../docs/frontend-state-architecture.md).
