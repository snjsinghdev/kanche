/**
 * The code every engine runs. Bundled by src/bundle.ts into one self-contained ESM file, so the
 * exact same bytes execute in Node, Deno and the three browsers.
 *
 * Three parts (KPB v1 test 13; ADR-0004):
 * - the Phase 0 probe, a cheap canary for the arithmetic itself;
 * - the 200 golden replays from @kanche/testkit, each checked against its committed hash;
 * - `seeds` seeded random shots from @kanche/physics/testing.
 */
import {
  determinismProbe,
  Fnv64,
  physicsVersion,
  simulateShot,
  type ShotSetup,
} from '@kanche/physics';
import { randomShot } from '@kanche/physics/testing';
import { spreadSeeds } from '@kanche/testkit';
import goldens from '@kanche/testkit/golden/physics-v1.json' with { type: 'json' };

export interface HarnessResult {
  readonly physicsVersion: number;
  readonly seeds: number;
  readonly steps: number;
  /** Hash over every probe hash, in seed order. */
  readonly combined: string;
  /** Hash over the golden replays' final-state hashes, in file order. */
  readonly goldenCombined: string;
  /** Golden replays whose hash differs from the committed one (indices). */
  readonly goldenMismatches: readonly number[];
  /** Hash over the seeded random shots' final-state hashes. */
  readonly shotsCombined: string;
  /** The first few probe hashes, for a readable diff when engines disagree. */
  readonly sample: readonly string[];
}

function fold(h: Fnv64, hash: string): void {
  for (let c = 0; c < hash.length; c += 1) h.addByte(hash.charCodeAt(c));
}

/**
 * Run the probe for the first `seeds` Weyl-spread uint32 seeds (`spreadSeeds` from
 * @kanche/testkit: 0, 0x9e3779b9, 0x3c6ef372, ...), the golden replays, and `seeds` random shots.
 */
export function runHarness(seeds: number, steps: number): HarnessResult {
  const probe = new Fnv64();
  const sample: string[] = [];
  const spread = spreadSeeds(seeds);
  spread.forEach((seed, i) => {
    const { hash } = determinismProbe(seed, steps);
    if (i < 4) sample.push(hash);
    fold(probe, hash);
  });
  const golden = new Fnv64();
  const goldenMismatches: number[] = [];
  goldens.replays.forEach((g, i) => {
    const { hash } = simulateShot(g.setup as unknown as ShotSetup, { timeline: false });
    if (hash !== g.hash) goldenMismatches.push(i);
    fold(golden, hash);
  });
  const shots = new Fnv64();
  for (const seed of spread) fold(shots, simulateShot(randomShot(seed), { timeline: false }).hash);
  return {
    physicsVersion,
    seeds,
    steps,
    combined: probe.digest(),
    goldenCombined: golden.digest(),
    goldenMismatches,
    shotsCombined: shots.digest(),
    sample,
  };
}
