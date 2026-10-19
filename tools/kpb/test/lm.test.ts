import { describe, expect, it } from 'vitest';

import { createRng } from '@kanche/physics';

import { fitBlocks, type Block } from '../src/lm.ts';

describe('the block least-squares fit', () => {
  it('recovers a shared rate and per-block amplitudes, with honest error bars', () => {
    // y = A_b·(1 − k·t)² + noise, k shared, A per block.
    const rng = createRng(3);
    const noise = (): number => {
      let s = 0;
      for (let i = 0; i < 12; i += 1) s += rng.nextFloat();
      return 0.01 * (s - 6);
    };
    const k = 0.3;
    const amps = [1, 2, 0.5, 1.5];
    const ts = Array.from({ length: 50 }, (_, i) => i / 50);
    const blocks: Block[] = amps.map((a) => {
      const ys = ts.map((t) => a * (1 - k * t) ** 2 + noise());
      return {
        local: [1],
        residuals: (shared, local) =>
          ts.map((t, i) => (local[0] ?? NaN) * (1 - (shared[0] ?? NaN) * t) ** 2 - (ys[i] ?? NaN)),
      };
    });
    const fit = fitBlocks([0.1], blocks, { lower: [0], upper: [1] });
    expect(Math.abs((fit.shared[0] ?? NaN) - k)).toBeLessThan(4 * (fit.sharedSigma[0] ?? NaN));
    expect(fit.sharedSigma[0]).toBeLessThan(0.01);
    fit.local.forEach((l, i) => {
      expect(Math.abs((l[0] ?? NaN) - (amps[i] ?? NaN))).toBeLessThan(0.02);
    });
    expect(fit.sigma).toBeCloseTo(0.01, 2);
    expect(fit.residuals).toBe(200);
  });

  it('stops when nothing improves and reports what it has', () => {
    const blocks: Block[] = [{ local: [], residuals: () => [0, 0] }];
    const fit = fitBlocks([1], blocks);
    expect(fit.shared).toEqual([1]);
    expect(fit.sharedSigma[0]).toBeNaN();
  });
});
