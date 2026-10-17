/**
 * Fuzzing: whatever the input, the engine either simulates the shot or throws a PhysicsError
 * with a code. It never throws anything else (Phase 1 prompt; Phase 2 relies on it).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PhysicsError,
  simulateShot,
  type CourtSpec,
  type MarbleInit,
  type ShotSetup,
} from '../src/index.ts';

const num = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: -2, max: 2, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, 1e300, -0) },
);
const speed = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: -12, max: 12, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity) },
);
// Optional keys come out as absent or defined, which is what MarbleInit allows.
const marble: fc.Arbitrary<MarbleInit> = fc
  .record(
    {
      id: fc.oneof(fc.integer({ min: 0, max: 6 }), fc.constantFrom(-1, 1.5, 2 ** 33)),
      size: fc.constantFrom('r80', 'r95', 'r110', 'r70') as fc.Arbitrary<MarbleInit['size']>,
      x: num,
      y: num,
      z: num,
      vx: speed,
      vy: speed,
      vz: speed,
      wx: fc.double({ min: -300, max: 300, noNaN: true }),
      wy: fc.double({ min: -300, max: 300, noNaN: true }),
      wz: fc.double({ min: -300, max: 300, noNaN: true }),
      motion: fc.constantFrom(
        'resting',
        'sliding',
        'rolling',
        'spinning',
        'airborne',
        'pocketed',
        'out',
        'bogus',
      ) as fc.Arbitrary<MarbleInit['motion']>,
    },
    { requiredKeys: ['id', 'size', 'x', 'y'] },
  )
  .map((m) => m as unknown as MarbleInit);
const court: fc.Arbitrary<CourtSpec> = fc.record(
  {
    surface: fc.constantFrom('cement', 'dirt', 'tile', 'sand', 'wet-cement', 'ice') as fc.Arbitrary<
      CourtSpec['surface']
    >,
    bounds: fc.record({
      xMin: fc.double({ min: -3, max: 0, noNaN: true }),
      xMax: fc.double({ min: 0, max: 3, noNaN: true }),
      yMin: fc.double({ min: -3, max: 0, noNaN: true }),
      yMax: fc.double({ min: 0, max: 3, noNaN: true }),
    }),
    walls: fc.array(fc.record({ x1: num, y1: num, x2: num, y2: num }), { maxLength: 3 }),
    hole: fc.record({
      x: num,
      y: num,
      radius: fc.double({ min: 0, max: 0.2, noNaN: true }),
      depth: fc.double({ min: 0, max: 0.1, noNaN: true }),
      rimRadius: fc.double({ min: 0, max: 0.02, noNaN: true }),
    }),
  },
  { requiredKeys: ['surface', 'bounds'] },
);
const flick = fc.record({
  dirX: fc.integer({ min: -40000, max: 40000 }),
  dirY: fc.integer({ min: -40000, max: 40000 }),
  fingerSpeed: fc.integer({ min: -10, max: 1010 }),
  spin: fc.integer({ min: -700, max: 700 }),
  side: fc.integer({ min: -400, max: 400 }),
});

describe('fuzz', () => {
  it('never throws an untyped error', () => {
    fc.assert(
      fc.property(
        court,
        fc.array(marble, { minLength: 0, maxLength: 5 }),
        fc.option(flick),
        (c, ms, f) => {
          const setup: ShotSetup =
            f === null
              ? { court: c, marbles: ms }
              : { court: c, marbles: ms, shot: { marbleId: 0, flick: f } };
          try {
            const r = simulateShot(setup, { timeline: false });
            expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
          } catch (e) {
            if (!(e instanceof PhysicsError)) throw e;
            expect(['invalid-input', 'invalid-court', 'invalid-params', 'non-finite']).toContain(
              e.code,
            );
          }
        },
      ),
      { numRuns: 400, seed: 20261017 },
    );
  }, 120_000);
});
