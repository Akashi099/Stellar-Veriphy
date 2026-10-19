# Provenance Bulk Export

Route: `/provenance/export` · Component: `frontend/components/provenance/BulkExportPanel.tsx`
Shared logic: `packages/shared/utils/provenanceExport.ts`

## Eligibility

| Role    | How it's resolved                                              | Scope                         |
|---------|----------------------------------------------------------------|-------------------------------|
| admin   | Connected key listed in `NEXT_PUBLIC_ADMIN_ADDRESSES` (comma separated) | All records (`scope=all`)     |
| creator | Any other connected wallet                                     | Records the wallet currently owns (`scope=own`) |
| guest   | No wallet connected                                            | Export unavailable            |

## Filters

Status (`active` / `revoked` / `expired`) and minted date range (inclusive, local time).

## Formats

| Format   | MIME                   | Layout |
|----------|------------------------|--------|
| `csv`    | `text/csv`             | Header row + one row per record, RFC 4180 quoting |
| `json`   | `application/json`     | `{ "meta": {...}, "records": [...] }` |
| `ndjson` | `application/x-ndjson` | Line 1 `{"meta": {...}}`, then one record per line — best for very large sets / streaming tools |

### Columns (fixed order)

`id, status, creator, contentHash, manifestHash, attestationHash, storageRef, fileName, fileType, timestamp, eventCount, lastEventAt`

Timestamps are exported as ISO 8601 UTC strings. `creator` is the current owner.

### Meta block (JSON / NDJSON)

`schemaVersion` (currently `1.0.0`), `exportedAt`, `exportedBy`, `scope`, `recordCount`, `part`, `totalParts`.

## File naming

```
stellarveriphy-provenance_<scope>_<YYYYMMDDTHHMMSSZ>[_part<N>of<M>].<ext>
```

e.g. `stellarveriphy-provenance_all_20260925T101500Z_part2of3.csv`

## Large exports

Exports are split into files of at most `PROVENANCE_EXPORT_CHUNK_SIZE` (5,000) records.
All parts share the same timestamp so they sort together.

## Validation

Before download, `validateRecords` rejects the export if any record has a missing/duplicate `id`,
an invalid Stellar `creator` key, a non-SHA-256 `contentHash`, or a non-numeric `timestamp`.

## Data source

`frontend/lib/provenance/data.ts` (`loadProvenanceDataset`) is the single source for the dashboard
(`/dashboard`), activity timeline, history view (`/provenance/[id]`) and export. It currently returns a
deterministic dataset; replace it with the Provenance contract `get_certificate_history` indexer.
