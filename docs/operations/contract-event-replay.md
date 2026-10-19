# Contract Event Replay

> Issue #803 · Labels: contracts, devtools, debugging

A local tool for replaying raw contract events against a dataset. Use it to reproduce
indexing bugs and state mismatches without a live network, and to see exactly which
events are duplicated, conflicting, malformed, missing or rolled back.

## Components

| Layer             | Location                                                   |
| ----------------- | ---------------------------------------------------------- |
| Replay engine     | `packages/shared/indexing/eventReplay.ts`                  |
| CLI               | `scripts/contract-event-replay.mjs` (`pnpm replay:events`) |
| Scenario fixtures | `scripts/fixtures/event-replay/*.json`                     |
| Tests             | `packages/shared/tests/eventReplay.test.ts`                |

The engine is independent of `SorobanEventIndexer`. That keeps it usable as a reference:
replay the same events, then compare its result with the live index.

**Requires Node ≥ 22.18** (built-in TypeScript type stripping).

## Quick start

```bash
# Replay every shipped scenario. Exits 0 when all are consistent.
pnpm replay:events

# Replay one dataset, printing machine-readable output
node scripts/contract-event-replay.mjs path/to/dataset.json --json
```

## Scenario format

A scenario is a JSON object. A file may also hold an array of scenarios.

```json
{
  "name": "missing-ledger-after-restore",
  "description": "Optional. What this scenario reproduces.",
  "contractId": "C_PROVENANCE",
  "events": [
    {
      "id": "0000000100-0000000001",
      "ledger": 100,
      "ledgerClosedAt": "2026-10-01T10:00:00Z",
      "contractId": "C_PROVENANCE",
      "type": "contract",
      "topic": ["minted"],
      "value": 1,
      "txHash": "tx-a",
      "inSuccessfulContractCall": true
    }
  ],
  "expected": {
    "eventCount": 1,
    "highWaterLedger": 100,
    "gapCount": 0,
    "eventNameCounts": { "minted": 1 },
    "eventIds": ["0000000100-0000000001"]
  }
}
```

| Field          | Required | Meaning                                                     |
| -------------- | -------- | ----------------------------------------------------------- |
| `name`         | no       | Label in the output. Defaults to the file name.             |
| `contractId`   | no       | When set, events from any other contract are skipped.       |
| `events`       | yes      | Raw events, as returned by RPC or an export.                |
| `expected`     | no       | Checks run after the replay. Every field is optional.       |
| `expectErrors` | no       | Error codes the scenario is designed to produce. See below. |

Each event needs `id`, `ledger` (positive integer), `ledgerClosedAt` (ISO 8601),
`contractId`, `type` (`contract`, `system` or `diagnostic`), `topic` (string array),
`txHash` and `inSuccessfulContractCall` (boolean).

## How a replay runs

1. **Parse.** Each event is validated. A malformed event is reported as an error and skipped.
2. **Deduplicate.** Events are keyed by `id`. An identical copy is a warning and is applied once.
   A copy with different content is an error (`conflicting_event`). The first copy is kept, and
   the replay never picks silently.
3. **Scope.** When `contractId` is set, events from other contracts are skipped with a warning.
4. **Order.** Events are sorted by ledger, then by id.
5. **Apply.** Diagnostic events are skipped, since they are not state. Events from failed contract
   calls are skipped with a warning, because the chain rolled them back. Missing ledgers between
   events are reported as `ledger_gap` warnings.
6. **Compare.** Each `expected` field is checked. Every difference is an `expectation_mismatch` error.

## Issue codes

| Code                     | Severity | Meaning                                                               |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `malformed_event`        | error    | The event does not match the raw event shape.                         |
| `conflicting_event`      | error    | Two copies share an id but differ in content.                         |
| `expectation_mismatch`   | error    | An `expected` value does not match the replay.                        |
| `duplicate_event`        | warning  | An identical copy was received and ignored.                           |
| `foreign_contract_event` | warning  | The event is from a contract other than `contractId`.                 |
| `failed_call_event`      | warning  | The event came from a failed call and is not state.                   |
| `ledger_gap`             | warning  | Ledgers are missing from the dataset, so the index may be incomplete. |

## Pass and fail

A scenario **passes** when the error codes found match `expectErrors` exactly. Without
`expectErrors`, a scenario passes only when it has no errors. Warnings never fail a scenario on
their own. Use `expected.gapCount` to pin a known gap.

The CLI exits `0` when every scenario passes, `1` when any scenario fails, and `2` on usage errors.

## Fixtures

The shipped fixtures cover the main failure modes. Each one is also a template for a new case.

| File                            | Scenario                                              |
| ------------------------------- | ----------------------------------------------------- |
| `01-happy-path.json`            | In-order events across several ledgers.               |
| `02-duplicate-identical.json`   | Overlapping sources deliver the same event twice.     |
| `03-conflicting-duplicate.json` | Two sources disagree about one event id.              |
| `04-ledger-gap.json`            | Ledgers are missing between events.                   |
| `05-failed-call.json`           | An event from a rolled-back call must not be indexed. |
| `06-foreign-contract.json`      | A dataset mixes events from two contracts.            |
| `07-malformed-event.json`       | An event is missing a required field.                 |
| `08-expectation-mismatch.json`  | Expectations deliberately differ from the replay.     |

The vitest suite replays every fixture and fails if any of them stops matching its own
declaration, so the fixtures stay trustworthy.

## Debugging a mismatch

1. Export the events for the affected ledger range to a JSON file.
2. Run `node scripts/contract-event-replay.mjs <file>`. The warnings and errors name the event ids.
3. Compare `summary.eventNameCounts` and `appliedEventIds` in `--json` output with the live index.
4. Add the minimal set of events that reproduces the problem as a new fixture, with `expected`
   set to the correct result, so the fix stays covered.
