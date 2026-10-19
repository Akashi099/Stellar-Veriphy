# Provenance Replay & Recovery

> Issue #669 · Labels: operations, recovery, data

Tooling to replay or reconstruct provenance data after partial failure, data
loss, or incomplete chain synchronisation, and to prove the restored data is
consistent before it goes back into service.

## Components

| Layer | Location |
|---|---|
| Replay engine | `packages/shared/utils/provenanceReplay.ts` |
| Operator CLI | `scripts/provenance-recovery.mjs` (`pnpm provenance:recover …`) |

The CLI loads the same TypeScript engine the app uses (via Node's built-in
type stripping), so there is exactly one implementation of the replay rules.
**Requires Node ≥ 22.18.**

## How replay works

1. **Merge** — events from any number of sources (provenance exports, backup
   dumps, re-scanned chain events) are merged. Events are keyed by `id`:
   identical copies are reported as `duplicate_event` (info); copies whose
   content differs are reported as `conflicting_event` (error) and the first
   source listed wins. Malformed events are skipped and reported.
2. **Order** — stable total order by `timestamp`, then `txHash`, then `id`.
3. **Replay** — events are folded per certificate through a state machine:

   | From | Allowed events |
   |---|---|
   | *(none)* | verification_submitted, certificate_minted |
   | pending | verification_submitted/completed/failed, certificate_minted |
   | failed | verification_submitted |
   | active | metadata_updated, ownership_transferred, certificate_renewed, certificate_linked, certificate_revoked, verification_submitted/completed |
   | revoked | *(terminal)* |

   Disallowed events are rejected as `invalid_transition` errors (or applied
   with a warning when `--lenient` is set).
4. **Hash chain** — each certificate keeps
   `chainHash = sha256(previousChainHash ‖ sha256(canonical(event)))`,
   starting from 64 zeros. Two independent rebuilds from the same events
   always produce the same chain heads.
5. **Checkpoint** — the result is a checkpoint containing all reconstructed
   certificates, the replay cursor, and
   `checkpointHash = sha256(sorted "id:chainHash:eventCount" lines)`.
   Checkpoints are verified before being resumed from, diffed or imported.

## Runbook

### 1. Freeze and collect

- Pause writers to the provenance index (or put the app in maintenance mode).
- Collect every available event source into a working directory, e.g.
  `recovery/2026-09-27/`:
  - latest provenance export(s) (`/api/provenance` export — see
    `docs/provenance_export.md`), JSON array or NDJSON of `ProvenanceEvent`;
  - backup dumps of the events table;
  - events re-derived from chain history for the affected ledger range.
- List the most trusted source **first** — it wins on conflicts.

### 2. Replay

```bash
pnpm provenance:recover replay \
  --input recovery/chain-events.ndjson \
  --input recovery/backup-events.json \
  --out recovery/out
```

Outputs:

- `checkpoint.json` — tamper-evident reconstructed state (resume point)
- `index-rows.ndjson` — one row per certificate, ready for re-import
- `report.json` — stats and every issue

Exit code `1` means errors were found. Resolve every `conflicting_event` and
`invalid_transition` before importing; re-run with the corrected sources.

**Point-in-time recovery** (e.g. restore state as of just before a bad
deploy): add `--until <unix-seconds>`.

**Incremental catch-up** (e.g. chain sync fell behind): resume from the last
good checkpoint and feed only newer events:

```bash
pnpm provenance:recover replay --checkpoint recovery/last-good/checkpoint.json \
  --input recovery/new-events.ndjson --out recovery/out-incremental
```

Resuming refuses to start if the checkpoint fails its integrity check.

### 3. Verify integrity and consistency

```bash
# Against the live index dump or the latest provenance export
pnpm provenance:recover verify \
  --checkpoint recovery/out/checkpoint.json \
  --reference recovery/current-index.json
```

Reports `missing_certificate`, `unexpected_certificate` and `field_mismatch`
(status, creator, eventCount, lastEventAt). Exit code `0` = consistent.

For migrations or two independent rebuilds, compare checkpoints directly:

```bash
pnpm provenance:recover diff --a recovery/before/checkpoint.json --b recovery/after/checkpoint.json
```

### 4. Restore

- Import `index-rows.ndjson` into the provenance index (upsert by `id`).
- Store `checkpoint.json` and `report.json` with the incident record — the
  checkpoint hash is the evidence that the restored state matches the replay.
- Re-run `verify` against a fresh dump of the restored index; it must exit `0`.
- Resume writers.

### 5. Afterwards

- Keep the latest `checkpoint.json` as the next incremental resume point.
- Log the recovery in the audit log with `entityType: "provenance_recovery"`
  and the checkpoint hash.

## Using the engine in code

```ts
import { mergeEventSources, replayProvenance, verifyAgainstRecords } from "@stellarveriphy/shared";

const merged = await mergeEventSources([{ name: "export", events }]);
const result = await replayProvenance(merged.events);
const report = verifyAgainstRecords(result.certificates, indexRecords);
```

## Safety properties

- Read-only on inputs; writes only inside `--out`.
- Deterministic: same inputs → same checkpoint hash.
- Conflicts are never silently resolved — they are reported as errors.
- Checkpoints are self-verifying and are rejected if edited.
