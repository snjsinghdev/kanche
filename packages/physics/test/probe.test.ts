import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { determinismProbe, MAX_PROBE_STEPS, physicsVersion } from '../src/index.ts';

describe('determinismProbe', () => {
  it('reproduces the frozen hashes (the harness compares engines against the same values)', () => {
    expect(determinismProbe(0, 240).hash).toBe(GOLDEN_PROBE_0_240);
    expect(determinismProbe(12345, 2400).hash).toBe(GOLDEN_PROBE_12345_2400);
  });

  it('is a pure function of seed and steps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 50 }),
        (s, n) => {
          expect(determinismProbe(s, n)).toEqual(determinismProbe(s, n));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('separates seeds and step counts', () => {
    expect(determinismProbe(1, 10).hash).not.toBe(determinismProbe(2, 10).hash);
    expect(determinismProbe(1, 10).hash).not.toBe(determinismProbe(1, 11).hash);
  });

  it('loses energy to damping', () => {
    const start = determinismProbe(99, 0).energy;
    const later = determinismProbe(99, 2400).energy;
    expect(later).toBeLessThan(start);
    expect(later).toBeGreaterThan(0);
  });

  it('rejects step counts that are not small non-negative integers', () => {
    for (const bad of [-1, 1.5, MAX_PROBE_STEPS + 1, Number.NaN]) {
      expect(() => determinismProbe(0, bad)).toThrow(RangeError);
    }
  });
});

describe('physicsVersion', () => {
  it('is 1 in Phase 0', () => {
    expect(physicsVersion).toBe(1);
  });
});

const GOLDEN_PROBE_0_240 = '5dc166db27469e9b';
const GOLDEN_PROBE_12345_2400 = '9f8757eff701c383';
