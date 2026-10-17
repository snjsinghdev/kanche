import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRng } from '../src/index.ts';

const seed = fc.integer({ min: 0, max: 0xffffffff });

describe('createRng', () => {
  it('produces the frozen reference sequence (changing it needs a physicsVersion bump)', () => {
    const rng = createRng(0);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual(
      GOLDEN_SEED_0,
    );
    const rng42 = createRng(42);
    expect(rng42.state()).toEqual(GOLDEN_STATE_42);
  });

  it('matches an independent BigInt implementation of xoshiro128**', () => {
    const M = 0xffffffffn;
    const rotl = (x: bigint, k: number): bigint => ((x << BigInt(k)) | (x >> BigInt(32 - k))) & M;
    const rng = createRng(42);
    const s = rng.state().map(BigInt) as [bigint, bigint, bigint, bigint];
    for (let i = 0; i < 10_000; i += 1) {
      const expected = (rotl((s[1] * 5n) & M, 7) * 9n) & M;
      const t = (s[1] << 9n) & M;
      s[2] ^= s[0];
      s[3] ^= s[1];
      s[1] ^= s[2];
      s[0] ^= s[3];
      s[2] ^= t;
      s[3] = rotl(s[3], 11);
      expect(BigInt(rng.nextUint32())).toBe(expected);
    }
  });

  it('gives the same sequence for the same seed', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const a = createRng(s);
        const b = createRng(s);
        for (let i = 0; i < 16; i += 1) expect(a.nextUint32()).toBe(b.nextUint32());
      }),
    );
  });

  it('gives different sequences for neighbouring seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xfffffffe }), (s) => {
        const a = createRng(s);
        const b = createRng(s + 1);
        const sa = [a.nextUint32(), a.nextUint32()];
        const sb = [b.nextUint32(), b.nextUint32()];
        expect(sa).not.toEqual(sb);
      }),
    );
  });

  it('keeps nextUint32 in [0, 2^32) and nextFloat in [0, 1)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const rng = createRng(s);
        for (let i = 0; i < 64; i += 1) {
          const u = rng.nextUint32();
          expect(Number.isInteger(u) && u >= 0 && u <= 0xffffffff).toBe(true);
          const f = rng.nextFloat();
          expect(f >= 0 && f < 1).toBe(true);
        }
      }),
    );
  });

  it('keeps nextInt in [0, max) for any max up to 2^32', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 1, max: 4294967296 }), (s, max) => {
        const rng = createRng(s);
        for (let i = 0; i < 16; i += 1) {
          const n = rng.nextInt(max);
          expect(Number.isInteger(n) && n >= 0 && n < max).toBe(true);
        }
      }),
    );
  });

  it('covers every value of a small range roughly evenly', () => {
    const rng = createRng(7);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i += 1) {
      const k = rng.nextInt(3);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(400);
  });

  it('rejects seeds that are not uint32 integers (integer inputs only)', () => {
    for (const bad of [-1, 0.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createRng(bad)).toThrow(RangeError);
    }
  });

  it('rejects a bad range for nextInt', () => {
    const rng = createRng(1);
    for (const bad of [0, -3, 1.5, 2 ** 32 + 1, Number.NaN]) {
      expect(() => rng.nextInt(bad)).toThrow(RangeError);
    }
  });
});

const GOLDEN_SEED_0 = [1789933344, 44971166, 2521387044, 3848737593];
const GOLDEN_STATE_42 = [551831576, 144025891, 322543647, 3034809370];
