import { describe, expect, it } from 'vitest';

import { DIRECTION_OCTANT, LIFT_TABLE } from '../src/params/v1/directions.generated.ts';
import { DIRECTION_COUNT, LIFT_COUNT, liftAngle, PhysicsError, unitVector } from '../src/index.ts';
import { fixedToDouble, liftTable, octantTable } from '../scripts/generate-tables.ts';

describe('committed direction tables', () => {
  it('match a fresh run of the generator exactly', () => {
    expect(octantTable()).toEqual(DIRECTION_OCTANT);
    expect(liftTable()).toEqual(LIFT_TABLE);
  });

  it('agree with Math.cos and Math.sin to within an ulp or two (an independent check)', () => {
    DIRECTION_OCTANT.forEach(([c, s], k) => {
      const a = (2 * Math.PI * k) / DIRECTION_COUNT;
      expect(Math.abs(c - Math.cos(a))).toBeLessThan(4e-16);
      expect(Math.abs(s - Math.sin(a))).toBeLessThan(4e-16);
    });
  });

  it('rounds fixed-point values to the nearest double, ties to even', () => {
    const one = 1n << 256n;
    expect(fixedToDouble(one)).toBe(1);
    expect(fixedToDouble(-one / 2n)).toBe(-0.5);
    expect(fixedToDouble(0n)).toBe(0);
    // 1 + 2^-53 is a tie between 1 and 1 + 2^-52: it rounds to the even mantissa, 1.
    expect(fixedToDouble(one + (one >> 53n))).toBe(1);
    // A hair above the tie rounds up.
    expect(fixedToDouble(one + (one >> 53n) + 1n)).toBe(1 + 2 ** -52);
  });
});

describe('unitVector', () => {
  it('covers the full turn by exact symmetry, every vector unit length', () => {
    for (let i = 0; i < DIRECTION_COUNT; i += 1) {
      const u = unitVector(i);
      // The reference angle 2πi/N is itself rounded (up to ~9e-16 near 2π), hence 2e-15.
      const a = (2 * Math.PI * i) / DIRECTION_COUNT;
      expect(Math.abs(u.x - Math.cos(a))).toBeLessThan(2e-15);
      expect(Math.abs(u.y - Math.sin(a))).toBeLessThan(2e-15);
      expect(Math.abs(u.x * u.x + u.y * u.y - 1)).toBeLessThan(5e-16);
    }
  });

  it('is exactly antisymmetric: index i + N/2 is the negation of index i', () => {
    for (let i = 0; i < DIRECTION_COUNT / 2; i += 1) {
      const a = unitVector(i);
      const b = unitVector(i + DIRECTION_COUNT / 2);
      expect(b.x).toBe(-a.x);
      expect(b.y).toBe(-a.y);
    }
  });

  it.each([-1, DIRECTION_COUNT, 1.5, NaN])('rejects index %f with a typed error', (i) => {
    expect(() => unitVector(i)).toThrow(PhysicsError);
  });
});

describe('liftAngle', () => {
  it('gives cos and sin of 3° steps', () => {
    for (let k = 0; k < LIFT_COUNT; k += 1) {
      const { cos, sin } = liftAngle(k);
      expect(Math.abs(cos - Math.cos((k * 3 * Math.PI) / 180))).toBeLessThan(4e-16);
      expect(Math.abs(sin - Math.sin((k * 3 * Math.PI) / 180))).toBeLessThan(4e-16);
    }
  });

  it('rejects an index outside the table', () => {
    expect(() => liftAngle(LIFT_COUNT)).toThrow(PhysicsError);
  });
});
