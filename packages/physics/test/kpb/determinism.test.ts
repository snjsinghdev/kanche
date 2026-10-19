/**
 * KPB v1 determinism suite (test 13), in Node. The cross-engine half (the same goldens in Deno,
 * Chromium, WebKit and Firefox) runs in tools/determinism (`pnpm harness`).
 */
import { describe, expect, it } from 'vitest';

import goldens from '@kanche/testkit/golden/physics-v1.json' with { type: 'json' };

import { physicsVersion, simulateShot, type ShotSetup } from '../../src/index.ts';
import { randomShot } from '../../src/testing/index.ts';
import { buildGoldens, GOLDEN_COUNT } from '../../scripts/update-goldens.ts';
import { kpbShots } from '../helpers.ts';

describe('KPB 13: determinism', () => {
  it(`${String(GOLDEN_COUNT)} golden replays still give their committed hashes`, () => {
    // A mismatch means the outcome of a shot changed: bump physicsVersion and regenerate the
    // goldens (pnpm --filter @kanche/physics goldens) in the same commit (ADR-0004).
    expect(goldens.physicsVersion).toBe(physicsVersion);
    expect(goldens.replays).toHaveLength(GOLDEN_COUNT);
    const drift: number[] = [];
    goldens.replays.forEach((g, i) => {
      const r = simulateShot(g.setup as unknown as ShotSetup, { timeline: false });
      if (r.hash !== g.hash || r.events.length !== g.events) drift.push(i);
    });
    expect(drift).toEqual([]);
  }, 120_000);

  it('the golden file is what the generator writes today', () => {
    const fresh = buildGoldens();
    expect(fresh.replays.map((r) => r.seed)).toEqual(goldens.replays.map((r) => r.seed));
    expect(JSON.parse(JSON.stringify(fresh.replays.map((r) => r.setup)))).toEqual(
      goldens.replays.map((r) => r.setup),
    );
  }, 120_000);

  it(`${String(kpbShots())} seeded shots repeat bit for bit, with or without a timeline`, () => {
    for (let i = 0; i < kpbShots(); i += 1) {
      const setup = randomShot(i * 104729 + 7);
      const a = simulateShot(setup, { timeline: false });
      const b = simulateShot(setup, { timeline: true });
      expect(b.hash).toBe(a.hash);
      expect(b.final).toEqual(a.final);
      expect(b.ledger).toEqual(a.ledger);
    }
  }, 600_000);
});
