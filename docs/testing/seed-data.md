# Seed data for local and staging databases

`pnpm --filter backend db:seed` fills the database with realistic, synthetic records: representative users, verification records in every state, sessions, and jobs. Use it so local and staging environments behave more like production (#810).

## What gets seeded

| Collection              | Count | Coverage                                                                                                                                                                               |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifications`         | 12    | Every status: `certified`, `pending`, `processing`, `failed`. Certified records have a certificate ID and transaction hash.                                                            |
| `verification_sessions` | 6     | Every state: `open`, `submitted`, `completed`, `abandoned`, `expired`. The `submitted` session links to an in-flight verification, so the cleanup safety check has a case to exercise. |
| `jobs`                  | 4     | One per status: `queued`, `running`, `succeeded`, `dead`.                                                                                                                              |

There are four representative creators. Each is a valid `G...` Stellar address derived from a fixed label. The backend has no users collection; a creator is just the account that submitted a verification.

## Safety

- **No production data.** Every value is generated in `backend/src/fixtures/seed-data.ts`. Hashes are digests of fixed labels, and no manifest or file content is included.
- **No secret keys.** Only public keys are generated (`backend/src/fixtures/strkey.ts`). The fixtures cannot sign or spend anything.
- **Only fixtures are replaced.** Every seeded document has `isFixture: true`. Re-seeding deletes only those documents, so any real record in the same database is left alone.
- **Refuses production.** The script exits when `NODE_ENV=production`.
- **Refuses on index conflicts.** It applies the declared indexes first (the same `ensureIndexes` used by `pnpm db:indexes`) and stops if any conflict, so seeded data is queried through the same indexes as real data.
- **Prefixed ids.** Jobs, sessions, and certificate IDs start with `fixture-`, so they cannot collide with real ids.

## Setup

1. Run MongoDB locally, or use a staging database you own. The default URI is `mongodb://localhost:27017`.
2. Set the connection if it differs from the default:

   ```bash
   export MONGODB_URI="mongodb://localhost:27017"
   export MONGODB_DB="stellarveriphy"   # optional; this is the default
   ```

3. Seed:

   ```bash
   pnpm --filter backend db:seed
   ```

   The command prints the number of documents in each state. Re-run it at any time to reset the fixtures to a known state.

To check the fixture helpers without a database:

```bash
pnpm --filter backend test:seed
```

## Using the fixtures in tests

Import the builder directly. Pass a fixed `now` so timestamps are predictable:

```ts
import { buildSeedFixtures } from "../src/fixtures/seed-data.js";

const fixtures = buildSeedFixtures(new Date("2026-10-19T12:00:00Z"));
const certified = fixtures.verifications.filter((v) => v.status === "certified");
```

Keep test data in the builder rather than copying it into test files. Changing a fixture then updates every suite that uses it. Add coverage to `backend/test/seed-fixtures.test.ts` when you add a new state or collection.

## Adding a collection

1. Add the collection's fixtures to `buildSeedFixtures`, with `fixture()` around each document so it gets the `isFixture` flag.
2. Add it to the `targets` list in `backend/src/scripts/seed-fixtures.ts`.
3. Add coverage to `backend/test/seed-fixtures.test.ts`.

If a collection's documents do not get the flag, re-seeding can duplicate them.
