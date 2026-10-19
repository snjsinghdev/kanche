/**
 * The finger-impact flick (Phase 1 prompt): J = (1 + eF)·vF/(1/mF + 1/mEff),
 * 1/mEff = 1/m + |r|²/I, v0 = J/m along the aim and ω0 = (r × J)/I.
 */
import { describe, expect, it } from 'vitest';

import { flickLaunch, PARAMS_V1, PhysicsError, type FlickInput } from '../src/index.ts';
import { massOf, params, rel } from './helpers.ts';

const f = PARAMS_V1.flick;
const flick = (o: Partial<FlickInput> = {}): FlickInput => ({
  dirX: 1000,
  dirY: 0,
  fingerSpeed: 500,
  spin: 0,
  side: 0,
  ...o,
});

function closedForm(size: 'r80' | 'r95' | 'r110', vF: number, b: number, c: number) {
  const r = PARAMS_V1.radius[size];
  const m = massOf(r);
  const i = 0.4 * m * r * r;
  const invEff = 1 / m + (b * b + c * c) / i;
  const j = ((1 + f.fingerRestitution) * vF) / (1 / f.fingerMass + invEff);
  return { m, i, j, r };
}

describe('flickLaunch', () => {
  it.each(['r80', 'r95', 'r110'] as const)(
    'matches the finger-impact closed form for %s',
    (size) => {
      const input = flick({ dirX: 3, dirY: 4, fingerSpeed: 700, spin: 400, side: -200 });
      const out = flickLaunch(input, size, PARAMS_V1);
      const vF = f.fingerSpeedMin + (f.fingerSpeedMax - f.fingerSpeedMin) * 0.7;
      const { m, i, j, r } = closedForm(
        size,
        vF,
        0.4 * PARAMS_V1.radius[size],
        -0.2 * PARAMS_V1.radius[size],
      );
      expect(rel(out.impulse, j)).toBeLessThan(1e-12);
      expect(rel(out.vx, (j * 0.6) / m)).toBeLessThan(1e-12);
      expect(rel(out.vy, (j * 0.8) / m)).toBeLessThan(1e-12);
      expect(out.vz).toBe(0);
      // ω0 = (J/I)·(b·ŝ − c·z), ŝ = z × d = (−0.8, 0.6).
      const b = 0.4 * r;
      const c = -0.2 * r;
      expect(rel(out.wx, (j / i) * b * -0.8)).toBeLessThan(1e-12);
      expect(rel(out.wy, (j / i) * b * 0.6)).toBeLessThan(1e-12);
      expect(rel(out.wz, (j / i) * -c)).toBeLessThan(1e-12);
      expect(out.miscue).toBe(false);
    },
  );

  it('a heavier shooter leaves slower but carries more momentum (MECHANICS-REVIEW finding 7)', () => {
    const small = flickLaunch(flick(), 'r80', PARAMS_V1);
    const big = flickLaunch(flick(), 'r110', PARAMS_V1);
    expect(big.vx).toBeLessThan(small.vx);
    expect(big.vx * massOf(PARAMS_V1.radius.r110)).toBeGreaterThan(
      small.vx * massOf(PARAMS_V1.radius.r80),
    );
  });

  it('a strike 0.4·R above centre starts a marble rolling (topspin positive)', () => {
    const out = flickLaunch(flick({ spin: 400 }), 'r80', PARAMS_V1);
    expect(rel(out.wy * PARAMS_V1.radius.r80, out.vx)).toBeLessThan(1e-12);
  });

  it('offsets beyond the miscue limit keep only miscueRetain of the impulse', () => {
    const clean = flickLaunch(flick({ spin: 500, side: 300 }), 'r80', PARAMS_V1);
    const near = flickLaunch(flick({ spin: 500, side: 330 - 30 }), 'r80', PARAMS_V1);
    const miscue = flickLaunch(flick({ spin: 600, side: 300 }), 'r80', PARAMS_V1);
    expect(clean.miscue).toBe(false);
    expect(near.miscue).toBe(false);
    expect(miscue.miscue).toBe(true);
    const { j } = closedForm(
      'r80',
      f.fingerSpeedMin + (f.fingerSpeedMax - f.fingerSpeedMin) / 2,
      0.6 * 0.008,
      0.3 * 0.008,
    );
    expect(rel(miscue.impulse, f.miscueRetain * j)).toBeLessThan(1e-12);
  });

  it('a lofted shot launches upward along the lift angle, behind its rule flag', () => {
    expect(() => flickLaunch(flick({ lift: 5 }), 'r80', PARAMS_V1)).toThrow(PhysicsError);
    const out = flickLaunch(flick({ lift: 5 }), 'r80', params({ allowLoft: true }));
    const angle = (Math.atan2(out.vz, out.vx) * 180) / Math.PI;
    expect(angle).toBeCloseTo(15, 10);
    const flat = flickLaunch(flick({ lift: 0 }), 'r80', params({ allowLoft: true }));
    expect(rel(Math.hypot(out.vx, out.vz), flat.vx)).toBeLessThan(1e-12);
  });

  it.each([
    ['dirX', { dirX: 40000 }],
    ['dirY', { dirY: -40000 }],
    ['zero direction', { dirX: 0, dirY: 0 }],
    ['fingerSpeed', { fingerSpeed: 1001 }],
    ['fractional fingerSpeed', { fingerSpeed: 1.5 }],
    ['spin', { spin: -601 }],
    ['side', { side: 301 }],
    ['lift', { lift: 16 }],
  ])('rejects an out-of-range %s without clamping', (_, bad) => {
    expect(() => flickLaunch(flick(bad), 'r80', PARAMS_V1)).toThrow(
      expect.objectContaining({ code: 'invalid-input' }) as PhysicsError,
    );
  });
});
