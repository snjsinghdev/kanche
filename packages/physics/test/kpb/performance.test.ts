/**
 * KPB v1 test 16: a 16-marble break. Its pass marks (≤ 5 ms on CI, ≤ 20 ms on a low-end phone)
 * are not met yet and are recorded as open in docs/kpb.md, with the numbers reached. Wall time
 * is measured by scripts/bench.ts, without the coverage instrumentation this runner adds (which
 * slows the shot about twelvefold), and CI holds it to a regression ceiling there. This test holds
 * the break's integration work, which is deterministic, to a ceiling exactly.
 */
import { describe, expect, it } from 'vitest';

import { simulateShot } from '../../src/index.ts';
import { breakShot } from '../../src/testing/index.ts';

/** The break's substeps at the last recorded measurement (6,182), plus 2% (–). */
const SUBSTEP_CEILING = 6300;

describe('KPB 16: a 16-marble break', () => {
  const setup = breakShot();
  const result = simulateShot(setup, { timeline: false });

  it('breaks the rack: all but the shielded marbles are struck', () => {
    expect(result.final).toHaveLength(16);
    const moved = result.final.filter((m) => {
      const start = setup.marbles.find((s) => s.id === m.id);
      return Math.hypot(m.x - (start?.x ?? NaN), m.y - (start?.y ?? NaN)) > 0.001;
    });
    // Two marbles sit behind their neighbours in the rack and are never touched.
    expect(moved.length).toBeGreaterThanOrEqual(14);
    expect(result.metrics.impacts).toBeGreaterThan(30);
  });

  it(`integrates in at most ${String(SUBSTEP_CEILING)} substeps`, () => {
    expect(result.metrics.substeps).toBeLessThanOrEqual(SUBSTEP_CEILING);
  });
});
