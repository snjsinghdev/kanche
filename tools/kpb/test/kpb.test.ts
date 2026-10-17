/**
 * The reality suite's tools, end to end on synthetic data (docs/kpb.md): the fits recover the
 * coefficients the data was made with, and the scorer passes the right parameters and fails
 * wrong ones. None of it is evidence about real marbles.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { deriveParams, PARAMS_V1, tableValue, type PhysicsParams } from '@kanche/physics';

import { formatDataset } from '../src/cli.ts';
import { calibrate, t3, type Estimate } from '../src/fit.ts';
import { scoreDataset } from '../src/score.ts';
import { makeSynthetic, SYNTHETIC_TRUTH } from '../src/synthetic.ts';
import { STARTER, starter } from './helpers.ts';

const truth = deriveParams(PARAMS_V1, SYNTHETIC_TRUTH);

function truthOf(p: PhysicsParams, name: string): number {
  if (name === 'Cd') return p.dragCoefficient;
  const at = /^glass\.e at ([\d.]+)/.exec(name);
  if (at !== null) return tableValue(p.glass.e, Number(at[1]));
  if (name === 'glass.mu') return tableValue(p.glass.mu, 1);
  if (name === 'flick.fingerMass') return p.flick.fingerMass;
  if (name === 'flick.fingerRestitution') return p.flick.fingerRestitution;
  const [surface, key] = name.split('.') as [keyof PhysicsParams['surfaces'], string];
  const s = p.surfaces[surface];
  return key === 'muR' ? tableValue(s.muR, 0) : s.muS;
}

const deviation = (e: Estimate): number => Math.abs(e.value - truthOf(truth, e.name)) / e.sigma;

describe('the synthetic starter dataset', () => {
  it('is what the generator writes', () => {
    expect(readFileSync(STARTER, 'utf8')).toBe(formatDataset(makeSynthetic()));
  }, 60_000);
});

describe('the fits', () => {
  it('recover the truth from tracking noise alone: within 3σ, or 0.5%', () => {
    const c = calibrate(makeSynthetic({ variation: false, repeats: 2 }));
    expect(c.estimates).toHaveLength(13);
    for (const e of c.estimates) {
      const t = truthOf(truth, e.name);
      const ok = deviation(e) <= 3 || Math.abs(e.value - t) <= 0.005 * t;
      expect(ok, `${e.name}: ${String(e.value)} ± ${String(e.sigma)}, truth ${String(t)}`).toBe(
        true,
      );
    }
  }, 120_000);

  it('recover the truth from the starter set, real-world variation and all', () => {
    // Within the ±3σ-equivalent interval, read with Student's t for the recordings behind each.
    const c = calibrate(starter());
    for (const e of c.estimates) {
      expect(
        deviation(e),
        `${e.name}: ${String(e.value)} ± ${String(e.sigma)}`,
      ).toBeLessThanOrEqual(t3(e.n - 1));
    }
    const fitted = deriveParams(PARAMS_V1, c.overrides);
    const s = scoreDataset(starter(), fitted);
    expect(s.passed).toBe(s.rows.length);
  }, 120_000);
});

describe("Student's t", () => {
  it('widens ±3σ for few recordings and tends to 3', () => {
    expect(t3(4)).toBeCloseTo(6.62, 2);
    expect(t3(7)).toBeCloseTo(4.59, 2);
    expect(t3(1000)).toBeCloseTo(3.008, 3);
    expect(t3(1)).toBeCloseTo(235.8, 1);
  });
});

describe('the scorer', () => {
  it('passes the parameters the starter set was made with', () => {
    const s = scoreDataset(starter(), truth);
    expect(s.synthetic).toBe(true);
    expect(s.rows.length).toBe(48);
    expect(s.passed).toBe(s.rows.length);
  }, 60_000);

  it('fails v1, whose placeholders are not the truth, and a rolling resistance 30% off', () => {
    const v1 = scoreDataset(starter(), PARAMS_V1);
    expect(v1.rows.length - v1.passed).toBeGreaterThanOrEqual(5);
    const off = deriveParams(truth, { surfaces: { cement: { muR: 0.0095 * 1.3 } } });
    const failed = scoreDataset(starter(), off).rows.filter((r) => !r.pass);
    expect(
      failed.some((r) => r.condition.startsWith('roll cement') && r.metric === 'roll-out'),
    ).toBe(true);
    expect(failed.every((r) => r.condition.includes('cement'))).toBe(true);
  }, 60_000);

  it('skips conditions without repeats', () => {
    const d = starter();
    const one = { ...d, recordings: d.recordings.slice(0, 1) };
    expect(scoreDataset(one, truth).rows).toEqual([]);
  });
});
