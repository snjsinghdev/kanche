/**
 * Times KPB test 16, the 16-marble break, outside the test runner (no coverage instrumentation):
 *
 *   pnpm --filter @kanche/physics bench [runs] [--json <file>] [--max <ms>]
 *
 * Prints the median, fastest and 90th-percentile wall time of `runs` warm runs (default 200),
 * after 50 warm-up runs. With --json it also writes the numbers, the machine and the shot's work
 * counts, for docs/evidence. With --max it fails when the median is slower: CI's regression
 * ceiling, which is not the KPB pass mark (docs/kpb.md).
 */
import { writeFileSync } from 'node:fs';
import os from 'node:os';

import { physicsVersion, simulateShot } from '../src/index.ts';
import { breakShot } from '../src/testing/index.ts';

const WARMUP = 50;

export function benchBreak(runs: number): {
  median: number;
  min: number;
  p90: number;
  runs: number;
} {
  const setup = breakShot();
  for (let i = 0; i < WARMUP; i += 1) simulateShot(setup, { timeline: false });
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    simulateShot(setup, { timeline: false });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const at = (q: number): number => times[Math.min(runs - 1, Math.floor(q * runs))] ?? NaN;
  return { median: at(0.5), min: at(0), p90: at(0.9), runs };
}

if (process.argv[1]?.endsWith('bench.ts') === true) {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const out = option('--json');
  const max = option('--max');
  const runs = Number(
    args.find((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') ?? false)) ?? 200,
  );
  const timing = benchBreak(runs);
  const shot = simulateShot(breakShot(), { timeline: false });
  const report = {
    test: 'KPB 16: a 16-marble break',
    physicsVersion,
    passMark: { ci: '≤ 5 ms', lowEndPhone: '≤ 20 ms' },
    ...timing,
    unit: 'ms',
    work: {
      duration: shot.duration,
      events: shot.events.length,
      steps: shot.metrics.steps,
      substeps: shot.metrics.substeps,
      impacts: shot.metrics.impacts,
    },
    hash: shot.hash,
    machine: {
      node: process.version,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      platform: `${os.platform()} ${os.arch()}`,
    },
  };
  console.log(
    `KPB 16 (16-marble break): median ${timing.median.toFixed(2)} ms, ` +
      `fastest ${timing.min.toFixed(2)} ms, p90 ${timing.p90.toFixed(2)} ms over ${String(runs)} runs`,
  );
  if (out !== undefined) {
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${out}`);
  }
  if (max !== undefined && !(timing.median <= Number(max))) {
    console.error(`FAIL: the median is over the regression ceiling of ${max} ms`);
    process.exitCode = 1;
  }
}
