/**
 * An independent reference for createRng, written in BigInt arithmetic from the published
 * algorithms rather than from src/det/rng.ts:
 * - splitmix32 (Weyl step 0x9e3779b9; xorshift-multiply mix 16/0x21f0aaad, 15/0x735a2d97, 15)
 * - xoshiro128** 1.1 (Blackman and Vigna, https://prng.di.unimi.it/xoshiro128starstar.c)
 * Every operation is exact modulo 2^32, so it shares no Math.imul or sign tricks with the code
 * under test.
 */

const M32 = 0xffffffffn;

const rotl = (x: bigint, k: bigint): bigint => ((x << k) | (x >> (32n - k))) & M32;

export function referenceSplitmix32(seed: number): () => bigint {
  let state = BigInt(seed) & M32;
  return () => {
    state = (state + 0x9e3779b9n) & M32;
    let z = state;
    z = ((z ^ (z >> 16n)) * 0x21f0aaadn) & M32;
    z = ((z ^ (z >> 15n)) * 0x735a2d97n) & M32;
    return z ^ (z >> 15n);
  };
}

export interface ReferenceRng {
  readonly state: () => [bigint, bigint, bigint, bigint];
  readonly next: () => bigint;
}

export function referenceRng(seed: number): ReferenceRng {
  const mix = referenceSplitmix32(seed);
  const s: [bigint, bigint, bigint, bigint] = [mix(), mix(), mix(), mix()];
  if ((s[0] | s[1] | s[2] | s[3]) === 0n) s[0] = 1n;
  return {
    state: () => [s[0], s[1], s[2], s[3]],
    next: () => {
      const result = (rotl((s[1] * 5n) & M32, 7n) * 9n) & M32;
      const t = (s[1] << 9n) & M32;
      s[2] ^= s[0];
      s[3] ^= s[1];
      s[1] ^= s[2];
      s[0] ^= s[3];
      s[2] ^= t;
      s[3] = rotl(s[3], 11n);
      return result;
    },
  };
}
