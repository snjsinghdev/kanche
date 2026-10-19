/**
 * The impact solve at its edges (ADR-0007). The closed forms are in test/kpb/analytic.test.ts and
 * the comparison with pooltool in test/kpb/reference.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { PARAMS_V1 } from '../src/index.ts';
import { makeBody } from '../src/sim/body.ts';
import { newImpactOutput, resolveImpact } from '../src/sim/impact.ts';

function headOn(approach: number) {
  const [a, b] = [makeBody(1, 'r80', PARAMS_V1), makeBody(2, 'r80', PARAMS_V1)];
  a.s.vx = approach;
  a.s.wy = 3 * approach;
  const ground = { nx: 0, ny: 0, nz: 1 };
  const out = resolveImpact(
    {
      a: { body: a, s: a.s, support: ground, supportMu: 0.35 },
      b: { body: b, s: b.s, support: ground, supportMu: 0.35 },
      nx: -1,
      ny: 0,
      nz: 0,
      e: 0,
      mu: 0.08,
      steps: PARAMS_V1.solver.impactSteps,
      maxSteps: PARAMS_V1.solver.impactMaxSteps,
    },
    newImpactOutput(),
  );
  return { a, b, out };
}

describe('the impact solve', () => {
  it.each([1e-13, 1e-16, 1e-20])(
    'ends a rounding-sized approach (%f m/s) in a few steps, inelastically',
    (approach) => {
      const { a, b, out } = headOn(approach);
      expect(out.capped).toBe(false);
      expect(out.stepsTaken).toBeLessThanOrEqual(2);
      // Perfectly inelastic: the normal relative speed is gone, up to the final step's linear
      // interpolation (exact only without friction and supports, as in KPB 3).
      expect(Math.abs(a.s.vx - b.s.vx)).toBeLessThan(0.01 * approach);
      expect(out.loss).toBeGreaterThanOrEqual(0);
    },
  );

  it('integrates an ordinary inelastic impact over the full step count', () => {
    const { out } = headOn(0.0005);
    expect(out.capped).toBe(false);
    expect(out.stepsTaken).toBeGreaterThan(PARAMS_V1.solver.impactSteps / 4);
  });
});
