/**
 * Seeded pseudo-random numbers for simulation code: xoshiro128** seeded through splitmix32.
 * Integer arithmetic only (Math.imul and bitwise operators), so every engine produces the same
 * sequence. Changing this algorithm changes outcomes and needs a physicsVersion bump.
 */

const UINT32_MAX = 0xffffffff;
const TWO_POW_32 = 4294967296;

export interface Rng {
  /** The next value as an unsigned 32-bit integer. */
  nextUint32(): number;
  /** The next value in [0, 1), with 32 bits of resolution (exactly representable). */
  nextFloat(): number;
  /** An unbiased integer in [0, maxExclusive), for 1 <= maxExclusive <= 2^32. */
  nextInt(maxExclusive: number): number;
  /** The four state words, for snapshots and replays. */
  state(): readonly [number, number, number, number];
}

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(`seed must be an integer in [0, 2^32 - 1], got ${String(seed)}`);
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32: spreads a 32-bit seed into well-mixed state words. */
function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

export function createRng(seed: number): Rng {
  assertSeed(seed);
  const mix = { s: seed | 0 };
  let s0 = splitmix32(mix);
  let s1 = splitmix32(mix);
  let s2 = splitmix32(mix);
  let s3 = splitmix32(mix);
  // xoshiro must never hold the all-zero state; splitmix32 makes this practically impossible,
  // but the guard keeps the contract total.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  function nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  }

  return {
    nextUint32,
    nextFloat(): number {
      return nextUint32() / TWO_POW_32;
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_POW_32) {
        throw new RangeError(
          `maxExclusive must be an integer in [1, 2^32], got ${String(maxExclusive)}`,
        );
      }
      // Rejection sampling: discard the top partial bucket so every result is equally likely.
      const limit = TWO_POW_32 - (TWO_POW_32 % maxExclusive);
      for (;;) {
        const x = nextUint32();
        if (x < limit) return x % maxExclusive;
      }
    },
    state(): readonly [number, number, number, number] {
      return [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0];
    },
  };
}
