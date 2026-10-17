/**
 * Shared helpers for tests. Kept free of other @kanche packages so that every package,
 * including physics, can depend on it without a cycle (docs/ARCHITECTURE.md).
 */

/** Sample n evenly spread uint32 seeds, so property tests and golden runs share seed choice. */
export function spreadSeeds(n: number): number[] {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError(`n must be a non-negative integer, got ${String(n)}`);
  const seeds: number[] = [];
  // Weyl sequence on 2^32 with the golden-ratio increment: distinct for n <= 2^32.
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    seeds.push(s);
    s = (s + 0x9e3779b9) >>> 0;
  }
  return seeds;
}
