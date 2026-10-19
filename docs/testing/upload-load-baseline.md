# Upload-heavy load test baseline

This test measures how the upload path behaves when many creators upload at the same time. It finds where the system saturates and sets the thresholds that a regression must not cross.

- Script: `load-tests/upload-heavy-load.js` (k6)
- Endpoints under test: `POST /api/uploads/sessions`, `PATCH /api/uploads/sessions/:id`, `POST /api/uploads`, `GET /api/uploads?contentHash=`
- Related: [LOAD_TESTING.md](../../LOAD_TESTING.md), [upload sessions API](../api/upload-sessions.md), [performance testing](performance-testing.md)

## Scenario

Each k6 iteration is one creator uploading one file. It follows the same steps as the browser client (`frontend/lib/resumable-upload.ts`):

1. Start a resumable session with a 5 MB chunk size.
2. Report chunks as done in batches of 4. Before each batch, the script sleeps for `CHUNK_TRANSFER_MS` per chunk to simulate the transfer time.
3. In 10% of uploads (`DROP_RATE`), the connection drops halfway. The client resumes by sending the start request again and checks that `nextChunk` points where it stopped.
4. Register the upload metadata and manifest.
5. Complete the session, linked to the upload ID.
6. Look up the upload by content hash, as the duplicate check does.

File mix per upload:

| Share | Type              | Size      | Chunks |
| ----- | ----------------- | --------- | ------ |
| 50%   | `image/jpeg`      | 1–12 MB   | 1–3    |
| 20%   | `application/pdf` | 1–25 MB   | 1–5    |
| 20%   | `video/mp4`       | 40–250 MB | 8–50   |
| 10%   | `audio/mpeg`      | 3–20 MB   | 1–4    |

On average one upload makes about 6–7 HTTP requests. Most of them are progress `PATCH` calls, which come from the video uploads. Video uploads drive the write volume.

The API only receives metadata today: files are hashed in the browser, and chunk bytes do not reach the server (see [upload-sessions.md](../api/upload-sessions.md#client-behavior)). The test therefore loads the session bookkeeping at the real chunk-reporting rate and simulates the byte transfer as time. When a chunk transport to storage is added, replace the `sleep` in `reportChunks` with a real `PUT` of the chunk.

## Profiles

| Profile    | Load                                        | Duration | Use                                                                             |
| ---------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `smoke`    | 2 VUs                                       | 30 s     | Every PR / CI: the flow works end to end                                        |
| `baseline` | ramp 0 → 25 → 50 concurrent uploaders       | 5 min    | Staging, after changes to upload or storage code. These are the tracked numbers |
| `stress`   | arrival rate 5 → 10 → 20 → 40 new uploads/s | 8 min    | Finding the capacity ceiling. Expect thresholds to fail                         |

## Running

```bash
# Local (start the app first: pnpm dev:frontend, or docker compose up -d app)
pnpm test:load:uploads:smoke
pnpm test:load:uploads                       # baseline profile, writes load-tests/results/upload-summary.json
pnpm test:load:uploads:report                # HTML report from that summary

# Staging
BASE_URL=https://staging.stellarveriphy.io k6 run -e PROFILE=baseline \
  --summary-export load-tests/results/upload-summary.json load-tests/upload-heavy-load.js

# Find the ceiling
k6 run -e PROFILE=stress -e BASE_URL=http://localhost:3000 load-tests/upload-heavy-load.js
```

Run against a fresh `VERIPHY_DATA_DIR` each time, or record how many sessions and uploads already exist. Latency depends on that count (see bottlenecks below). The test creates real records tagged `load-test`. Never point it at production.

### In CI

Run the `smoke` profile on every PR and the `baseline` profile on a schedule against staging. k6's exit code is non-zero when a threshold fails, so the job fails without extra scripting:

```yaml
upload-load-smoke:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: grafana/setup-k6-action@v1
    - run: docker compose up -d app && scripts/check-container-health.sh stellarveriphy-app 300
    - run: mkdir -p load-tests/results && k6 run -e PROFILE=smoke --summary-export load-tests/results/upload-summary.json load-tests/upload-heavy-load.js
    - run: node load-tests/report-generator.mjs load-tests/results/upload-summary.json load-tests/results/upload-report.html
      if: always()
    - uses: actions/upload-artifact@v4
      if: always()
      with: { name: upload-load-report, path: load-tests/results/ }
```

## Metrics

| Metric                                                                       | Meaning                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `http_req_duration{name:<step>}`                                             | Latency per step: `session_start`, `session_progress`, `session_resume`, `upload_register`, `session_complete`, `upload_lookup` |
| `upload_flow_success`                                                        | Share of uploads that completed every step                                                                                      |
| `upload_flow_duration`                                                       | Wall time of a full upload, including simulated transfer                                                                        |
| `uploads_completed`, `uploads_resumed`, `chunks_reported`, `bytes_simulated` | Throughput counters                                                                                                             |

## Bottlenecks

These come from the current storage layer (`frontend/lib/server/json-collection.ts`). They are what the stress profile pushes against, and they show up in the per-step latencies:

| #   | Bottleneck                                                                                                                | Where                              | Effect under upload load                                                                                                                                 | Symptom in results                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | **Whole-collection rewrite on every write.** `put()` runs `JSON.stringify` on the entire collection and rewrites the file | `JsonCollection.put`               | Every progress batch rewrites _all_ sessions. Bytes written per request grow linearly with total sessions, so write cost grows as O(sessions × requests) | `session_progress` p95 rises steadily during a run even at flat VU count                  |
| 2   | **Single serialized writer.** Writes are chained one after another through `writeChain`                                   | `JsonCollection.put`               | Write throughput per collection is capped by one disk write at a time. Requests queue behind each other                                                  | p99 ≫ p95 on `session_progress` and `upload_register`; throughput plateaus while VUs grow |
| 3   | **Linear scans on hot paths.** `startOrResumeSession`, `saveUpload` and `findUploadsByHash` call `all()` and filter       | `upload-sessions.ts`, `uploads.ts` | Start, register and lookup cost grows with stored records                                                                                                | `session_start` and `upload_lookup` get slower over long runs                             |
| 4   | **Event-loop blocking serialization.** Pretty-printed `JSON.stringify` of a large array runs on the main thread           | `JsonCollection.put`               | Delays _every_ request, including `/api/health`                                                                                                          | Health probe latency rises during the test; possible `unhealthy` container under stress   |
| 5   | **Single-process state.** The collection is cached in memory per process                                                  | `json-collection.ts`               | Cannot scale out to more than one replica without lost writes, so one container is the ceiling                                                           | Adding replicas does not help and corrupts state                                          |

Bottleneck 1 dominates for upload-heavy traffic. A 250 MB video makes about 13 progress writes, and each one rewrites every stored session.

## Recommended thresholds

These are encoded in `options.thresholds` of the script. They are the pass/fail line for the `baseline` profile:

| Step                                                  | p95      | p99      | Why                                                                                                     |
| ----------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `session_progress`                                    | < 300 ms | < 800 ms | Highest-volume call. The client sends it every 4 chunks, so it must stay well below chunk transfer time |
| `session_start`, `session_resume`, `session_complete` | < 500 ms | n/a      | Once per upload; users wait on it before transfer starts or after it ends                               |
| `upload_register`                                     | < 800 ms | n/a      | Includes manifest hashing and a full scan for duplicates                                                |
| `upload_lookup`                                       | < 400 ms | n/a      | Read-only, but scans every upload                                                                       |
| `http_req_failed`                                     | < 1%     | n/a      | Retries in the client hide brief errors; more than 1% means users see failures                          |
| `upload_flow_success`                                 | > 98%    | n/a      | End-to-end health of the flow                                                                           |

Operating guidance until the storage layer moves to a database (MongoDB in `backend/`, see [ADR 0005](../adr/0005-pluggable-storage-layer.md)):

- Keep **one replica** of the frontend container (bottleneck 5).
- Archive or prune completed and expired sessions so `upload-sessions.json` stays small. Latency follows its size.
- Treat a `session_progress` p95 above **300 ms**, or a rising trend within one baseline run, as the signal to start the migration.
- Watch `/api/health/ready` latency during load. A rise there means the event loop is blocked (bottleneck 4).

## Recording results

Add a row for each baseline run on staging, so trends are visible across releases. Use the numbers from `upload-summary.json` / the HTML report. Record the record count at start, because latency depends on it.

| Date                | Commit | Env     | Profile  | Records at start (sessions / uploads) | Uploads completed | progress p95 / p99 | register p95 | lookup p95 | failed % | Ceiling (stress: uploads/s at first threshold breach) | Notes |
| ------------------- | ------ | ------- | -------- | ------------------------------------- | ----------------- | ------------------ | ------------ | ---------- | -------- | ----------------------------------------------------- | ----- |
| _first run pending_ |        | staging | baseline |                                       |                   |                    |              |            |          |                                                       |       |
