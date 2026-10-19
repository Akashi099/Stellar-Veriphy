# Utility Function Testing Guide

Addresses issue #399 (planning/spec doc — see [scope note](#scope-note)). Describes how unit tests for `packages/shared/utils/` should be structured once written.

## Scope note

This document specifies the test plan and patterns; it does not itself add the Jest test suite. That implementation work (writing the actual `*.test.ts` files, wiring up Jest, and hitting 100% coverage) is tracked separately against issue #399's acceptance criteria below.

## Acceptance Criteria (from #399)

- Test all functions in `utils/`
- 100% code coverage for utilities
- Test edge cases
- Test error conditions
- Use Jest
- Document test patterns (this document)

## 1. Current Surface Area

As of this writing, `packages/shared/utils/` contains one file, [`hash.ts`](../packages/shared/utils/hash.ts), exporting two functions:

```ts
export function sha256(data: string): string;
export function buildManifestHash(manifest: object): string;
```

Any new file added under `utils/` must ship with a co-located `*.test.ts` before merge — see [Test Layout](#2-test-layout).

## 2. Test Layout

- One test file per source file, co-located: `hash.ts` → `hash.test.ts` in the same directory.
- Test files use the source module's public exports only — no reaching into internals.
- Suggested Jest config for `packages/shared` (add a `jest.config.js` and `ts-jest`/`babel-jest` dependency when implementing):

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverageFrom: ["utils/**/*.ts"],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
```

- Run with `pnpm --filter @stellarveriphy/shared test -- --coverage`.

## 3. Test Patterns

### 3.1 Arrange-Act-Assert, one behavior per `it`

```ts
describe("sha256", () => {
  it("returns the known SHA-256 hex digest for a fixed input", () => {
    const result = sha256("hello");
    expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});
```

Use a **known-answer test** (a precomputed digest for a fixed input) rather than asserting shape alone (`toMatch(/^[a-f0-9]{64}$/)`) — shape-only assertions pass even if the hashing algorithm is silently swapped.

### 3.2 Edge cases

For each function, enumerate inputs at the boundaries of its accepted domain:

- `sha256("")` — empty string input.
- `sha256` with very long input (e.g. a multi-MB string) — sanity-check it doesn't throw or truncate.
- `sha256` with non-ASCII/unicode input — confirms UTF-8 encoding is handled consistently.
- `buildManifestHash({})` — empty object.
- `buildManifestHash` with nested objects/arrays — confirms `JSON.stringify` traversal works as expected.
- `buildManifestHash` key-order sensitivity — two objects with the same keys in different insertion order currently hash differently, since `JSON.stringify` preserves insertion order. If that's unintended, it's a bug to fix, not a test to skip; if intended, assert it explicitly so a future refactor doesn't accidentally "fix" it:

```ts
it("produces different hashes for different key insertion order (documents current behavior)", () => {
  const a = buildManifestHash({ x: 1, y: 2 });
  const b = buildManifestHash({ y: 2, x: 1 });
  expect(a).not.toBe(b);
});
```

### 3.3 Error conditions

`sha256`/`buildManifestHash` as currently written don't throw for any JS-typed input (non-string coerces via `crypto`'s type checks, non-object args are a TypeScript-level concern). When error conditions do exist in a utility, test them with `toThrow`:

```ts
it("throws when passed a value crypto cannot hash", () => {
  // @ts-expect-error intentionally passing wrong type to exercise runtime guard
  expect(() => sha256(null)).toThrow(TypeError);
});
```

Prefer asserting a specific error type/message over a bare `toThrow()` so the test fails loudly if the wrong error starts being thrown.

### 3.4 Determinism

Hashing utilities must be pure — same input, same output, across calls and across processes. Add a regression test that calls the function twice and compares:

```ts
it("is deterministic for the same input", () => {
  expect(sha256("abc")).toBe(sha256("abc"));
});
```

## 4. Coverage

- Coverage is measured with Jest's built-in Istanbul integration (`--coverage`), gated at 100% via `coverageThreshold` (see [config above](#2-test-layout)) so CI fails on any regression.
- 100% line/branch coverage on two straight-line functions with no branches is achievable by construction; as `utils/` grows to include functions with conditionals, add one test per branch rather than relying on incidental coverage from happy-path tests.

## 5. CI Wiring

Add a `test:shared` script to [`packages/shared/package.json`](../packages/shared/package.json) and a corresponding root script (mirroring `build:frontend`'s pattern in [package.json](../package.json)):

```json
"test:shared": "pnpm --filter @stellarveriphy/shared test -- --coverage"
```

Wire this into CI (and optionally into the Husky pre-push hook alongside `lint-staged`) once the suite exists, so utility regressions are caught before merge.

## 6. Load Testing

Load tests live in `load-tests/` and run with k6. They are not part of `pnpm test`.

- Overview and commands: [LOAD_TESTING.md](../LOAD_TESTING.md)
- Upload-heavy scenario, bottlenecks and recommended thresholds: [testing/upload-load-baseline.md](testing/upload-load-baseline.md)

Run `pnpm test:load:uploads:smoke` before merging changes to `frontend/lib/server/` storage or the upload routes.
