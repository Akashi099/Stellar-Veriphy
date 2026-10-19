# Load Testing Suite

This repository includes a lightweight k6-based load testing setup for the frontend/API and the contract-facing workflows that are most likely to experience concurrency pressure.

## Included suites

- `load-tests/frontend-load.js` — exercises the public frontend API with a 100-user ramping load pattern.
- `load-tests/contract-load.js` — simulates repeated contract-adjacent verification flows under constant 100-user concurrency.
- `load-tests/upload-heavy-load.js` — upload-heavy scenario: resumable sessions, chunk progress, resume after a dropped connection, metadata registration. See [docs/testing/upload-load-baseline.md](docs/testing/upload-load-baseline.md) for the scenario, bottlenecks and recommended thresholds.
- `load-tests/report-generator.mjs` — converts k6 JSON summaries into a simple HTML report.

## Workflow coverage

The load tests cover the common request patterns that matter most for the project:

- health endpoint checks
- verification request submission
- validation failures and backoff behavior
- repeated API traffic under sustained concurrency
- response-time threshold tracking (p95 and p99)

## Running the suite

### Frontend load test

```bash
BASE_URL=http://localhost:3000 k6 run ./load-tests/frontend-load.js
```

### Contract-facing load test

```bash
BASE_URL=http://localhost:3000 k6 run ./load-tests/contract-load.js
```

### Upload-heavy load test

```bash
pnpm test:load:uploads:smoke                          # 2 VUs, 30s; CI on every PR
BASE_URL=http://localhost:3000 pnpm test:load:uploads  # baseline profile
pnpm test:load:uploads:report
```

### Generate HTML report

```bash
node ./load-tests/report-generator.mjs ./load-tests/results/frontend-summary.json ./load-tests/results/frontend-report.html
```

## Load profile

The configured scenarios target at least 100 concurrent virtual users and record the critical latency percentiles:

- p50
- p95
- p99
- request failure rate
- check pass rate

## Reporting

The generated report is intended to be shared with engineering review and can be uploaded as a CI artifact in a follow-up GitHub Actions workflow.

## Notes

This is a starter performance suite designed for local validation and extension. It intentionally focuses on the most common public workflows and on measurable response-time metrics without requiring a full production deployment in this issue branch.
