/**
 * Writes the golden replays: 200 seeded shots, each with its full setup and the hash of its
 * final state, into packages/testkit/golden/physics-v1.json.
 *
 *   pnpm --filter @kanche/physics goldens
 *
 * These goldens are determinism witnesses, like Phase 0's probe hash: the code under test made
 * them. They prove that the result never changes silently and that every engine agrees on it
 * (the harness checks them in Node, Deno, Chromium, WebKit and Firefox). Correctness is proven
 * elsewhere, by the KPB analytic, integrity and reference suites (ADR-0006).
 *
 * Regenerate only together with a physicsVersion bump; test/kpb/determinism.test.ts fails on
 * any drift.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { physicsVersion, simulateShot } from '../src/index.ts';
import { randomShot } from '../src/testing/index.ts';

export const GOLDEN_COUNT = 200;

/** The seed of golden replay i: spread over uint32 like the harness's seeds. */
export function goldenSeed(i: number): number {
  return (Math.imul(i + 1, 0x9e3779b9) >>> 0) % 0xffffffff;
}

export function buildGoldens(): {
  physicsVersion: number;
  replays: { seed: number; setup: unknown; hash: string; events: number }[];
} {
  const replays = [];
  for (let i = 0; i < GOLDEN_COUNT; i += 1) {
    const seed = goldenSeed(i);
    const setup = randomShot(seed);
    const result = simulateShot(setup, { timeline: false });
    replays.push({ seed, setup, hash: result.hash, events: result.events.length });
  }
  return { physicsVersion, replays };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  here,
  '..',
  '..',
  'testkit',
  'golden',
  `physics-v${String(physicsVersion)}.json`,
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const g = buildGoldens();
  // One replay per line keeps diffs readable.
  const body = g.replays.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  writeFileSync(
    OUT,
    `{\n  "physicsVersion": ${String(g.physicsVersion)},\n  "generator": "packages/physics/scripts/update-goldens.ts",\n  "replays": [\n${body}\n  ]\n}\n`,
  );
  console.log(`wrote ${String(g.replays.length)} golden replays to ${OUT}`);
}
