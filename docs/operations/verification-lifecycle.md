# Verification cancellation, errors, and provider monitoring

## Cancellation (issue #955)

Two verification implementations currently coexist. Use the endpoint for the store that owns the job:

- MongoDB backend: POST /api/verifications/:jobId/cancel with the configured ADMIN_TOKEN bearer credential. No caller identity header grants cancellation rights. Missing/invalid credentials are rejected before accessing the job; unset ADMIN_TOKEN disables this mutation. Returns 200 with status cancelled (also on repeat calls), 404 for unknown jobs, or 409 after finalization or completion. Cancellation is available during maintenance.
- Creator upload worker: POST /api/jobs/:id/cancel with an authenticated access token or API_TOKENS credential. Only the upload creator (user role) or an admin can cancel. Other users and moderators receive 403. The response uses the existing version 1 API envelope, with the cancelled job in data. Completed jobs return 409. The creator jobs list uses the auth session transport and refreshes after successful cancellation.

The MongoDB endpoint changes the verification and active verification-queue jobs in one transaction. Deploy MongoDB as a replica set or a transaction-capable sharded cluster. Standalone MongoDB cannot perform cancellation; a transaction failure changes neither record. Workers lose ownership of cancelled jobs; heartbeat aborts their signal within JOB_HEARTBEAT_MS. Progress, checkpoints, completion, failures, and stall recovery cannot revive cancelled jobs. New jobs correlated with a cancelled verification are discarded at claim time. Cancelled jobs follow the successful-job retention period; verification records remain protected.

Every external verification handler MUST check/pass ctx.signal during processing and call await ctx.beginFinalization() immediately BEFORE an irreversible effect such as ledger submission. This transaction competes with cancellation on the verification document: exactly one can win. After finalization starts, cancellation returns 409. Use a stable idempotency key for the external effect so retries after crashes cannot submit twice. No external verification handler or provider submission protocol is currently registered in buildJobHandlers; its example documents the integration contract. The local upload worker verifies stored manifests and has no on-chain anchoring yet.

The local JSON store is a single-process implementation. Its worker, recovery, cancellation, and result publishing share a per-job lock and use fresh status checks. Active hashing observes an abort signal at asynchronous boundaries; late results become no-ops. Multiple processes must use the MongoDB path rather than share the JSON data directory. Cancelled jobs cannot use the manual retry endpoint; create a new request instead.

APIs and badges use the canonical spelling cancelled. It is terminal. Backend public reads cache only terminal status documents; active content lookups bypass caching so cancellation is visible across instances. Negative lookups retain the existing short TTL. The status tracker polls authoritative backend state through the Next.js proxy, never a simulated success sequence. Set VERIFICATION_BACKEND_URL in the frontend server environment (default http://localhost:4000). The proxy forwards caller authentication and never injects an admin secret. For the reusable backend tracker, provide cancelRequest only for an authorized caller; it must resolve with status cancelled after the server confirms cancellation. Stopping polling alone does not cancel work.

## Error taxonomy version 1 (issue #957)

Public failures contain failure = { version: 1, code, category, retryable, message, action } on backend verification reads. Local upload job reads include the version, code and retryable fields and a safe compatibility error string. The frontend maps code to local human-readable actions; it does not render provider messages. Legacy or unrecognized errors map to INTERNAL_ERROR. Job progress exposes safe mapped codes rather than arbitrary internal codes. Internal operator job views retain diagnostic history and require administrator authorization.

| Code | Category | Retryable | Action |
| --- | --- | --- | --- |
| INVALID_INPUT | input | no | Correct the file or manifest and submit again. |
| ACCESS_DENIED | permission | no | Request administrator access. |
| PROVIDER_TIMEOUT | provider | yes | Try again later. |
| PROVIDER_UNAVAILABLE | provider | yes | Try later or contact support. |
| PROVIDER_INVALID_RESPONSE | provider | no | Contact support with the verification ID. |
| CONFIGURATION_ERROR | configuration | no | Contact an administrator. |
| VERIFICATION_REJECTED | verification | no | Review the content and evidence. |
| CANCELLED | cancellation | no | Submit a new request if needed. |
| INTERNAL_ERROR | internal | no | Contact support with the verification ID. |

retryable means a new attempt may help; it never automatically restarts cancelled work. Codes are stable within version 1. New codes are additive; changing a code's meaning or envelope semantics requires a new taxonomy version. Unknown codes or versions use a safe generic frontend action. Never infer categories from free-form messages. Provider adapters should throw stable machine codes; MongoDB dead-job handling persists the mapped code without exposing the original error.

## Provider dashboards (issue #956)

Grafana automatically provisions verification-providers.json from the existing dashboard directory and uses datasource uid prometheus. The dashboard offers environment (test/production), provider, and traffic (verification/probe/notification) filters. Set PROVIDER_TRAFFIC_ENVIRONMENT explicitly per backend deployment when necessary; the default follows STELLAR_NETWORK (mainnet is production, other supported networks are test). This trusted process setting cannot be changed by request headers.

sv_provider_calls_total and sv_provider_latency_seconds observe one logical ExternalApiClient call, including retries, complete body reads, and JSON parsing. The existing sv_external_api_* metrics remain per-attempt diagnostics. Provider labels are bounded to horizon, soroban_rpc, ipfs, kms, tee_oracle, webhook and other. URLs, users, job IDs, secrets, and arbitrary provider names are excluded. Health probes use traffic=probe and webhook delivery uses notification, keeping probes out of verification latency.

The panels show p95 latency, availability, request volume, failures by reason, age of the last success, and the latest health-probe state. The health panel also surfaces unhealthy HTTP 200 responses and is independent of the traffic-kind filter. Histograms aggregate buckets across instances before computing percentiles. Availability divides successful logical calls by non-cancelled calls; caller aborts do not count as provider failures. No traffic yields no data, not assumed 100% availability. JSON parse failures are failures, counted once. Use probe traffic and last-success age to inspect an unavailable provider without user traffic. Start investigating sustained p95 above 2 seconds or availability below 99%; choose alert windows for your traffic volume before paging. These metrics cover calls using ExternalApiClient; direct fetch adapters must be moved to that client to be represented.

## Startup configuration (issue #954)

Configuration validation runs when the backend configuration module loads, before MongoDB connections, health timers, workers or the HTTP listener. validateProviderConfiguration is a pure function that accepts a candidate configuration for tests. Diagnostics contain setting names and MISSING/INVALID/INCOMPATIBLE, never setting values, URLs or credentials. A non-empty optional integration enables its URL validation; a critical integration must have its URL configured. Unknown critical dependency names fail startup.

Supported networks are mainnet, testnet, futurenet with their matching passphrases. Endpoints must be HTTP(S) with no embedded credentials or fragments; production requires HTTPS. Obvious Stellar test-network endpoint mismatches fail startup; health probes also compare the provider's advertised network. Budgets and intervals must be positive, total timeout cannot be shorter than an attempt timeout, retries cannot exceed five, and maximum backoff cannot be below base backoff. Per-service timeout/retry overrides are validated too. A mainnet deployment must explicitly replace the testnet default endpoints.

Reload policy: provider configuration and per-service policies are read, validated and frozen once per process. Environment edits do not hot-reload any client. Apply changes via a rolling restart: validate the candidate settings, allow in-flight work to drain, start replacement instances, and confirm readiness before routing traffic. Do not mutate exported config objects. Runtime maintenance flags have their own existing reload mechanism and do not change provider settings.

## Validation

Regression files cover authorization, transaction races, late writes, code sanitization, configuration validation, logical-call metrics, local-worker cancellation, and frontend polling. MongoDB transaction tests require an explicitly supplied TEST_MONGODB_URI for an isolated replica set; they create and remove their own test database. No package manager, build, or test commands were run while implementing these changes.
