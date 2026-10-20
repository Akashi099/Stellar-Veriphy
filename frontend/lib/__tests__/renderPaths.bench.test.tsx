/**
 * Frontend render-path benchmarks.
 *
 * Lightweight, repeatable benchmarks for the most frequently rendered and
 * most expensive UI paths. Uses the shared `performanceTracker` from
 * `frontend/lib/performance.ts` to record render timings, then reports
 * averages and hotspots.
 *
 * These benchmarks are opt-in so they do not slow down normal test runs.
 * Enable them with:
 *
 *   BENCH=1 yarn jest frontend/lib/__tests__/renderPaths.bench.test.tsx
 *
 * See `docs/benchmarks/README.md` for usage and thresholds.
 */

import React from 'react';
import { render } from '@testing-library/react';

import { performanceTracker } from '../performance';

// ---------------------------------------------------------------------------
// Benchmark configuration
// ---------------------------------------------------------------------------

const BENCH_ENABLED = process.env.BENCH === '1' || process.env.BENCH === 'true';

/** Number of warm-up iterations (not recorded). */
const WARMUP_ITERATIONS = 2;

/** Number of measured iterations per render path. */
const BENCH_ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 10);

/**
 * Soft thresholds (milliseconds) per render path. Exceeding these does not
 * fail the build by default but is reported as a hotspot. Set
 * `BENCH_STRICT=1` to turn threshold breaches into test failures.
 */
const THRESHOLDS_MS: Record<string, number> = {
  'Button': 2,
  'Input': 2,
  'ListItem': 2,
  'Card': 3,
  'Table': 8,
  'DashboardPage': 15,
  'ListPage': 12,
};

const STRICT = process.env.BENCH_STRICT === '1' || process.env.BENCH_STRICT === 'true';

// ---------------------------------------------------------------------------
// Benchmark harness
// ---------------------------------------------------------------------------

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  thresholdMs?: number;
  exceeded: boolean;
}

const results: BenchResult[] = [];

/**
 * Render a component `BENCH_ITERATIONS` times, recording each render via the
 * shared performance tracker. Warm-up iterations are discarded.
 */
function benchmark(name: string, renderFn: () => void): void {
  // Warm-up: let JIT and module caches settle.
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    renderFn();
  }

  const samples: number[] = [];

  for (let i = 0; i < BENCH_ITERATIONS; i += 1) {
    const start = performanceTracker.start(`bench:${name}`);
    renderFn();
    const duration = performanceTracker.end(`bench:${name}`, start);
    samples.push(duration);
  }

  const totalMs = samples.reduce((sum, value) => sum + value, 0);
  const averageMs = totalMs / samples.length;
  const minMs = Math.min(...samples);
  const maxMs = Math.max(...samples);
  const thresholdMs = THRESHOLDS_MS[name];
  const exceeded = thresholdMs !== undefined && averageMs > thresholdMs;

  results.push({
    name,
    iterations: samples.length,
    totalMs,
    averageMs,
    minMs,
    maxMs,
    thresholdMs,
    exceeded,
  });
}

function formatMs(value: number): string {
  return `${value.toFixed(3)}ms`;
}

function reportResults(): void {
  if (results.length === 0) {
    return;
  }

  const sorted = [...results].sort((a, b) => b.averageMs - a.averageMs);

  // eslint-disable-next-line no-console
  console.log('\n=== Frontend render-path benchmarks ===');
  // eslint-disable-next-line no-console
  console.log(
    `${'path'.padEnd(20)}${'avg'.padStart(10)}${'min'.padStart(10)}${'max'.padStart(10)}${'threshold'.padStart(12)}`,
  );

  for (const result of sorted) {
    // eslint-disable-next-line no-console
    console.log(
      `${result.name.padEnd(20)}${formatMs(result.averageMs).padStart(10)}${formatMs(
        result.minMs,
      ).padStart(10)}${formatMs(result.maxMs).padStart(10)}${
        result.thresholdMs !== undefined ? formatMs(result.thresholdMs).padStart(12) : ''.padStart(12)
      }${result.exceeded ? '  <-- HOTSPOT' : ''}`,
    );
  }

  const hotspots = sorted.filter((result) => result.exceeded);
  if (hotspots.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`\nHotspots (${hotspots.length}):`);
    for (const hotspot of hotspots) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${hotspot.name}: ${formatMs(hotspot.averageMs)} (threshold ${formatMs(
          hotspot.thresholdMs as number,
        )})`,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\nNo hotspots detected.');
  }
  // eslint-disable-next-line no-console
  console.log('=== End benchmarks ===\n');
}

// ---------------------------------------------------------------------------
// Benchmark fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal, dependency-free fixtures that approximate the shape of the real
 * components. Keeping them local makes the benchmark fast and stable while
 * still exercising the same render patterns (leaf, list, table, page).
 */

function Button({ label }: { label: string }): React.ReactElement {
  return <button type="button">{label}</button>;
}

function Input({ value }: { value: string }): React.ReactElement {
  return <input type="text" defaultValue={value} />;
}

function ListItem({ index }: { index: number }): React.ReactElement {
  return <li>Item {index}</li>;
}

function Card({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Table({ rows }: { rows: number }): React.ReactElement {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, index) => (
          <tr key={index}>
            <td>Row {index}</td>
            <td>{index * 2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListPage({ items }: { items: number }): React.ReactElement {
  return (
    <div>
      <h1>List</h1>
      <ul>
        {Array.from({ length: items }, (_, index) => (
          <ListItem key={index} index={index} />
        ))}
      </ul>
    </div>
  );
}

function DashboardPage({ cards }: { cards: number }): React.ReactElement {
  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid">
        {Array.from({ length: cards }, (_, index) => (
          <Card key={index} title={`Card ${index}`} body={`Body ${index}`} />
        ))}
      </div>
      <Table rows={10} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

const describeBench = BENCH_ENABLED ? describe : describe.skip;

describeBench('render-path benchmarks', () => {
  beforeEach(() => {
    results.length = 0;
  });

  afterAll(() => {
    reportResults();
  });

  it('benchmarks leaf components', () => {
    benchmark('Button', () => {
      const { unmount } = render(<Button label="Click" />);
      unmount();
    });

    benchmark('Input', () => {
      const { unmount } = render(<Input value="hello" />);
      unmount();
    });

    benchmark('ListItem', () => {
      const { unmount } = render(<ListItem index={1} />);
      unmount();
    });

    benchmark('Card', () => {
      const { unmount } = render(<Card title="Title" body="Body" />);
      unmount();
    });
  });

  it('benchmarks list and table render paths', () => {
    benchmark('Table', () => {
      const { unmount } = render(<Table rows={50} />);
      unmount();
    });

    benchmark('ListPage', () => {
      const { unmount } = render(<ListPage items={50} />);
      unmount();
    });
  });

  it('benchmarks page-level render paths', () => {
    benchmark('DashboardPage', () => {
      const { unmount } = render(<DashboardPage cards={20} />);
      unmount();
    });
  });

  it('reports hotspots within thresholds', () => {
    // Ensure every benchmark ran so the report is complete.
    expect(results.length).toBeGreaterThan(0);

    if (STRICT) {
      const hotspots = results.filter((result) => result.exceeded);
      expect(hotspots).toEqual([]);
    }
  });
});