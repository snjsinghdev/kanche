/**
 * KPB v1 analytic suite (tests 1–8): closed-form results that the simulation must reproduce to
 * 1e-9 relative. Drag is off unless stated. The closed forms are textbook mechanics, derived in
 * docs/physics.md; none of these numbers come from the code under test.
 */
import { describe, expect, it } from 'vitest';

import { PARAMS_V1 } from '../../src/index.ts';
import {
  afterEvent,
  beforeImpact,
  flat,
  G,
  massOf,
  params,
  R8,
  rel,
  run,
  sloped,
} from '../helpers.ts';

const EXACT = 1e-9;

describe('KPB 1: settling from sliding to rolling', () => {
  const muS = PARAMS_V1.surfaces.cement.muS;
  const p = params({ drag: false });
  // (v0 m/s, R·ω0/v0 with topspin positive, aim angle in rad)
  const cases: [number, number, number][] = [
    [2, 0, 0],
    [1, -1.5, 0.7],
    [3, 0.3, 2.1],
    [0.5, -0.5, -1.2],
    [1.5, 1.6, 3.0],
    [2.5, -3, 0.2],
  ];
  it.each(cases)('v0=%f, Rω0/v0=%f, aim=%f settles at (5·v0 + 2·R·ω0)/7', (v0, spin, aim) => {
    const dx = Math.cos(aim);
    const dy = Math.sin(aim);
    const w0 = (spin * v0) / R8;
    // Topspin for motion along d is ω along z × d = (−dy, dx).
    const result = run(
      flat(),
      [{ id: 1, size: 'r80', x: 0, y: 0, vx: v0 * dx, vy: v0 * dy, wx: -w0 * dy, wy: w0 * dx }],
      p,
    );
    const k = afterEvent(result, 1, 'slide-roll');
    const expected = (5 * v0 + 2 * R8 * w0) / 7;
    const along = k.vx * dx + k.vy * dy;
    expect(rel(along, expected)).toBeLessThan(EXACT);
    expect(Math.abs(k.vx * dy - k.vy * dx)).toBeLessThan(EXACT * Math.abs(expected) + 1e-15);
    // The slip u0 = v0 − R·ω0 shrinks at (7/2)·muS·g: sliding ends at 2|u0|/(7·muS·g).
    const tStar = (2 * Math.abs(v0 - R8 * w0)) / (7 * muS * G);
    const ev = result.events.find((e) => e.kind === 'slide-roll');
    expect(rel(ev?.t ?? NaN, tStar)).toBeLessThan(EXACT);
    // Rolling: ω tied to v.
    expect(rel(k.wy * dx - k.wx * dy, along / R8)).toBeLessThan(EXACT);
  });

  it('a spinless slide settles at (5/7)·v0 at t* = 2·v0/(7·muS·g)', () => {
    const v0 = 1.7;
    const result = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, vx: v0 }], p);
    const k = afterEvent(result, 1, 'slide-roll');
    expect(rel(k.vx, (5 / 7) * v0)).toBeLessThan(EXACT);
    expect(rel(k.t, (2 * v0) / (7 * muS * G))).toBeLessThan(EXACT);
  });

  it('a marble launched rolling never slides', () => {
    const v0 = 1.2;
    const result = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, vx: v0, wy: v0 / R8 }], p);
    expect(result.events.some((e) => e.kind === 'slide-roll')).toBe(false);
    expect(result.events.some((e) => e.kind === 'roll-rest')).toBe(true);
  });
});

describe('KPB 2: rolling stop distance', () => {
  const muR = PARAMS_V1.surfaces.cement.muR.data.y[0] ?? NaN;

  it.each([0.3, 1, 2.2])('without drag, a roll from %f m/s stops at v²/(2·muR·g)', (v) => {
    const result = run(
      flat(25),
      [{ id: 1, size: 'r80', x: 0, y: -24, vx: 0, vy: v, wx: -v / R8 }],
      // A 2.2 m/s roll on cement lasts 28 s, past the shot's 20 s limit.
      params({ drag: false, tMax: 60 }),
    );
    const end = result.final[0];
    expect(end?.motion).toBe('resting');
    expect(rel((end?.y ?? NaN) + 24, (v * v) / (2 * muR * G))).toBeLessThan(EXACT);
    expect(Math.abs(end?.x ?? NaN)).toBe(0);
  });

  it.each([0.5, 1.5, 2.5])(
    'with drag, a roll from %f m/s stops at ln(1 + k·v²/(muR·g))/(2k)',
    (v) => {
      const result = run(
        flat(25),
        [{ id: 1, size: 'r80', x: -24, y: 0, vx: v, wy: v / R8 }],
        params({ tMax: 60 }),
      );
      const m = massOf(R8);
      const cD = 0.5 * PARAMS_V1.airDensity * PARAMS_V1.dragCoefficient * Math.PI * R8 * R8;
      const k = ((5 / 7) * cD) / m;
      const d = Math.log(1 + (k * v * v) / (muR * G)) / (2 * k);
      expect(result.final[0]?.motion).toBe('resting');
      expect(rel((result.final[0]?.x ?? NaN) + 24, d)).toBeLessThan(EXACT);
      // Drag shortens the roll, by roughly 0.7–0.8 % per metre (MECHANICS-REVIEW finding 10).
      const noDrag = (v * v) / (2 * muR * G);
      expect(d).toBeLessThan(noDrag);
    },
  );
});

describe('KPB 3: head-on impact of equal marbles, frictionless contact', () => {
  it.each([0.5, 0.93, 1])('e = %f: shooter keeps (1−e)/2·v, target leaves at (1+e)/2·v', (e) => {
    const p = params({ drag: false, glassE: e, glassMu: 0 });
    const result = run(
      flat(),
      [
        { id: 1, size: 'r80', x: 0, y: 0, vx: 1.3 },
        { id: 2, size: 'r80', x: 0.05, y: 0 },
      ],
      p,
    );
    const v = beforeImpact(result, 1).vx;
    expect(rel(afterEvent(result, 1, 'impact').vx, ((1 - e) / 2) * v)).toBeLessThan(EXACT);
    expect(rel(afterEvent(result, 2, 'impact').vx, ((1 + e) / 2) * v)).toBeLessThan(EXACT);
  });

  it.each([
    ['backspin draws back', -2.5, -1],
    ['topspin follows through', 1, 1],
  ] as const)('%s', (_, spin, sign) => {
    const e = 0.93;
    const p = params({ drag: false, glassE: e, glassMu: 0 });
    const v0 = 2;
    const result = run(
      flat(),
      [
        { id: 1, size: 'r80', x: 0, y: 0, vx: v0, wy: (spin * v0) / R8 },
        { id: 2, size: 'r80', x: 0.0162, y: 0 },
      ],
      p,
    );
    const pre = beforeImpact(result, 1);
    const post = afterEvent(result, 1, 'impact');
    expect(post.wy).toBe(pre.wy);
    const settled = afterEvent(result, 1, 'slide-roll');
    const expected = (5 * post.vx + 2 * R8 * post.wy) / 7;
    expect(Math.sign(settled.vx)).toBe(sign);
    expect(rel(settled.vx, expected)).toBeLessThan(EXACT);
  });
});

describe('KPB 4: stun cut, e = 1, frictionless', () => {
  it.each([0.2, 0.5, 0.8])('marbles leave 90° apart at offset %f·2R', (offset) => {
    const p = params({ drag: false, glassE: 1, glassMu: 0, muS: 0 });
    const b = offset * 2 * R8;
    const result = run(
      flat(),
      [
        { id: 1, size: 'r80', x: -0.05, y: 0, vx: 1 },
        { id: 2, size: 'r80', x: 0, y: b },
      ],
      p,
    );
    const a = afterEvent(result, 1, 'impact');
    const t = afterEvent(result, 2, 'impact');
    const cos = (a.vx * t.vx + a.vy * t.vy) / Math.hypot(a.vx, a.vy) / Math.hypot(t.vx, t.vy);
    expect(Math.abs(cos)).toBeLessThan(EXACT);
    const angle = (Math.abs(Math.atan2(a.vy, a.vx) - Math.atan2(t.vy, t.vx)) * 180) / Math.PI;
    expect(Math.abs(angle - 90)).toBeLessThan(1e-6);
  });
});

describe('KPB 5: rolling half-ball hit, e = 1, frictionless', () => {
  it('the shooter deflects 33.7° ± 0.5° once rolling again', () => {
    const p = params({ drag: false, glassE: 1, glassMu: 0 });
    const v0 = 1.5;
    const result = run(
      flat(),
      [
        { id: 1, size: 'r80', x: -0.03, y: 0, vx: v0, wy: v0 / R8 },
        // Half-ball: the target's centre is offset by R from the aim line, a 30° cut.
        { id: 2, size: 'r80', x: 0, y: R8 },
      ],
      p,
    );
    const k = afterEvent(result, 1, 'slide-roll');
    const deflection = (Math.abs(Math.atan2(k.vy, k.vx)) * 180) / Math.PI;
    expect(Math.abs(deflection - 33.7)).toBeLessThan(0.5);
    // Closed form: tan θ = sin φ·cos φ / (sin² φ + 2/5) with φ = 30°.
    const phi = Math.PI / 6;
    const tan = (Math.sin(phi) * Math.cos(phi)) / (Math.sin(phi) ** 2 + 0.4);
    expect(rel(Math.abs(k.vy / k.vx), tan)).toBeLessThan(EXACT);
  });
});

describe('KPB 6: rolling on a uniform slope', () => {
  // The prompt's ground model is the small-slope one, aSlope = −g·∇h, so a roll accelerates at
  // (5/7)·g·tan θ along the horizontal; tan θ differs from sin θ by under 4.5e-4 at the 3% limit
  // (docs/physics.md, "Small-slope model"). The test checks the model's own closed form exactly.
  it.each([
    [0.02, 0],
    [0, -0.025],
    [0.012, 0.016],
  ])('a marble released on slope (%f, %f) accelerates at (5/7)·g·|∇h| − muR·g', (sx, sy) => {
    const muR = 0.004;
    const p = params({ drag: false, muR });
    const result = run(sloped(sx, sy), [{ id: 1, size: 'r80', x: 0, y: 0 }], p);
    const grad = Math.hypot(sx, sy);
    const a = (5 / 7) * G * grad - muR * G;
    const ks = result.timeline?.[0]?.keyframes ?? [];
    const later = ks.filter((k) => k.t > 0.5 && k.t < 1.5);
    expect(later.length).toBeGreaterThan(10);
    for (const k of later) {
      expect(rel(Math.hypot(k.vx, k.vy), a * k.t)).toBeLessThan(EXACT);
      // Downhill is −∇h.
      expect(rel(-(k.vx * sx + k.vy * sy) / grad, a * k.t)).toBeLessThan(EXACT);
    }
    expect(result.events.some((e) => e.kind === 'roll-start')).toBe(true);
  });

  it('a slope too gentle to beat rolling resistance holds a marble at rest', () => {
    const result = run(
      sloped(0.005, 0),
      [{ id: 1, size: 'r80', x: 0, y: 0 }],
      params({ muR: 0.008 }),
    );
    expect(result.final[0]?.motion).toBe('resting');
    expect(result.metrics.steps).toBe(0);
  });
});

describe('KPB 7: Newton’s cradle', () => {
  it('a shooter fired into a line of marbles 1 mm apart passes its motion down the line', () => {
    const p = params({ drag: false, glassE: 1, glassMu: 0, muS: 0 });
    const n = 5;
    const marbles = [{ id: 0, size: 'r80' as const, x: -0.05, y: 0, vx: 1.1 }];
    for (let i = 1; i <= n; i += 1) {
      marbles.push({ id: i, size: 'r80', x: (i - 1) * (2 * R8 + 0.001), y: 0, vx: 0 });
    }
    const result = run(flat(1), marbles, p);
    const impacts = result.events.filter((e) => e.kind === 'impact');
    expect(impacts.map((e) => [e.a, e.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    expect(rel(afterEvent(result, n, 'impact').vx, 1.1)).toBeLessThan(EXACT);
    for (let i = 0; i < n; i += 1) {
      const k = afterEvent(result, i, 'impact', i === 0 ? 0 : 1);
      expect(Math.abs(k.vx)).toBeLessThan(1e-12);
    }
  });
});

describe('KPB 8: unequal sizes', () => {
  // The prompt's two tilts: 9.5 mm on 8 mm meets 4.9° below horizontal, 11 mm on 8 mm 9.1°.
  it.each([
    ['r95', 4.9],
    ['r110', 9.1],
  ] as const)(
    'a %s shooter meets an 8 mm marble %f° below horizontal and lifts as the closed form says',
    (size, degrees) => {
      const e = 0.93;
      const p = params({ drag: false, glassE: e, glassMu: 0, muS: 0 });
      const r1 = PARAMS_V1.radius[size];
      const v = 1.2;
      const result = run(
        flat(),
        [
          { id: 1, size, x: -0.05, y: 0, vx: v },
          { id: 2, size: 'r80', x: 0, y: 0 },
        ],
        p,
      );
      const impact = result.events.find((ev) => ev.kind === 'impact');
      if (impact?.kind !== 'impact') throw new Error('no impact');
      const sinT = (r1 - R8) / (r1 + R8);
      expect(rel(impact.nz, sinT)).toBeLessThan(EXACT);
      expect(Math.abs((Math.asin(impact.nz) * 180) / Math.PI - degrees)).toBeLessThan(0.05);
      const cosT = Math.sqrt(1 - sinT * sinT);
      const m1 = massOf(r1);
      const m2 = massOf(R8);
      const pre = beforeImpact(result, 1).vx;
      // The target is pressed into the ground, which takes the vertical part of the impulse.
      const mEff = 1 / (1 / m1 + (cosT * cosT) / m2);
      const P = (1 + e) * mEff * pre * cosT;
      const shooter = afterEvent(result, 1, 'impact');
      const target = afterEvent(result, 2, 'impact');
      expect(rel(impact.impulse, P)).toBeLessThan(EXACT);
      expect(rel(shooter.vz, (P * sinT) / m1)).toBeLessThan(EXACT);
      expect(rel(shooter.vx, pre - (P * cosT) / m1)).toBeLessThan(EXACT);
      expect(rel(target.vx, (P * cosT) / m2)).toBeLessThan(EXACT);
      expect(target.vz).toBe(0);
      expect(shooter.motion).toBe('airborne');
    },
  );
});
