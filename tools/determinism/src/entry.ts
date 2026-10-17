/**
 * The code every engine runs. Bundled by src/bundle.ts into one self-contained ESM file, so the
 * exact same bytes execute in Node, Deno and the three browsers.
 */
import { determinismProbe, Fnv64, physicsVersion } from '@kanche/physics';
import { spreadSeeds } from '@kanche/testkit';

export interface HarnessResult {
  readonly physicsVersion: number;
  readonly seeds: number;
  readonly steps: number;
  /** Hash over every probe hash, in seed order. */
  readonly combined: string;
  /** The first few probe hashes, for a readable diff when engines disagree. */
  readonly sample: readonly string[];
}

/**
 * Run the probe for the first `seeds` Weyl-spread uint32 seeds (`spreadSeeds` from
 * @kanche/testkit: 0, 0x9e3779b9, 0x3c6ef372, ...) and fold the hashes in that order.
 */
export function runHarness(seeds: number, steps: number): HarnessResult {
  const fold = new Fnv64();
  const sample: string[] = [];
  spreadSeeds(seeds).forEach((seed, i) => {
    const { hash } = determinismProbe(seed, steps);
    if (i < 4) sample.push(hash);
    for (let c = 0; c < hash.length; c += 1) fold.addByte(hash.charCodeAt(c));
  });
  return { physicsVersion, seeds, steps, combined: fold.digest(), sample };
}
