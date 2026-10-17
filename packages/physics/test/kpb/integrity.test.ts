/**
 * KPB v1 integrity suite (tests 9–12). Random shots come from src/testing (1,000 by
 * default; KANCHE_KPB_SHOTS=10000 for the nightly run).
 */
import { describe, expect, it } from 'vitest';

import {
  buildCourt,
  PARAMS_V1,
  PhysicsError,
  simulateShot,
  type Court,
  type ShotResult,
  type ShotSetup,
} from '../../src/index.ts';
import { featureGap, newGap, staticFeatures } from '../../src/sim/features.ts';
import { afterEvent, beforeImpact, flat, massOf, params, R8, rel, sloped } from '../helpers.ts';
import { randomShot } from '../../src/testing/index.ts';
import { kpbShots } from '../helpers.ts';

const SHOTS = kpbShots();

function shots(): { setup: ShotSetup; court: Court; result: ShotResult }[] {
  const out: { setup: ShotSetup; court: Court; result: ShotResult }[] = [];
  for (let i = 0; i < SHOTS; i += 1) {
    const setup = randomShot(i * 7919 + 1);
    const court = buildCourt(setup.court as Parameters<typeof buildCourt>[0]);
    out.push({ setup, court, result: simulateShot({ ...setup, court }) });
  }
  return out;
}

const all = shots();

describe('KPB 9: the energy ledger', () => {
  it(`closes to 1e-9 on ${String(SHOTS)} random shots, and no impact adds energy`, () => {
    let worst = 0;
    for (const { result } of all) {
      const L = result.ledger;
      // The energy the shot actually converts: the flick's kinetic energy and any drop in height.
      const scale = L.initialKinetic + Math.abs(L.initialPotential - L.finalPotential);
      if (scale === 0) continue;
      worst = Math.max(worst, Math.abs(L.residual) / scale);
      for (const e of result.events) {
        if (e.kind === 'impact') expect(e.loss).toBeGreaterThan(-1e-15 * scale);
      }
      // Every term is a dissipation.
      for (const term of [L.slide, L.roll, L.spin, L.drag, L.removed, L.forced]) {
        expect(term).toBeGreaterThanOrEqual(-1e-15 * scale);
      }
    }
    expect(worst).toBeLessThan(1e-9);
  }, 600_000);
});

describe('KPB 9 and 11: the shots the 10,000-shot survey caught', () => {
  // Shot i is randomShot(i·7919 + 1), as in the suites above. Each was a real defect, fixed in
  // Phase 1 (ADR-0006): a marble resting against a step re-found its contact forever (5506); an
  // impact at a rounding-sized approach never ended (6588); a take-off from an edge was taken for
  // a contact with the ground below (3408); the separation from an edge was removed through a
  // vertical velocity a plane does not carry (5506); and the coarse stop refinement was used on
  // slopes (8503, 8851, 8986, 9976).
  it.each([3408, 5506, 6588, 8503, 8851, 8986, 9976])(
    'shot %i closes its ledger to 1e-9 without hitting a cap',
    (i) => {
      const r = simulateShot(randomShot(i * 7919 + 1), { timeline: false });
      const L = r.ledger;
      const scale = L.initialKinetic + Math.abs(L.initialPotential - L.finalPotential);
      expect(Math.abs(L.residual) / scale).toBeLessThan(1e-9);
      const m = r.metrics;
      expect([m.stepCapHits, m.substepCapHits, m.impactCapHits, Number(m.shotCapHit)]).toEqual([
        0, 0, 0, 0,
      ]);
    },
  );
});

describe('KPB 10: momentum in frictionless impacts with the ground removed', () => {
  it.each([
    ['frictionless', 0],
    ['with contact friction', 0.3],
  ])('is conserved, %s', (_, mu) => {
    // No gravity, so the marbles fly: nothing outside the impact can push them.
    const p = { ...params({ drag: false, glassE: 0.8, glassMu: mu }), g: 0 };
    const setup: ShotSetup = {
      court: flat(1),
      marbles: [
        {
          id: 1,
          size: 'r110',
          x: -0.1,
          y: 0.003,
          z: 0.02,
          vx: 1.3,
          vz: 0.05,
          wy: 30,
          wz: 12,
          motion: 'airborne',
        },
        {
          id: 2,
          size: 'r80',
          x: 0,
          y: 0,
          z: 0.021,
          vx: -0.2,
          vy: 0.1,
          wx: -40,
          motion: 'airborne',
        },
      ],
    };
    const r = simulateShot(setup, { params: p });
    const m1 = massOf(PARAMS_V1.radius.r110);
    const m2 = massOf(R8);
    const pre = [beforeImpact(r, 1), beforeImpact(r, 2)];
    const post = [afterEvent(r, 1, 'impact'), afterEvent(r, 2, 'impact')];
    for (const axis of ['vx', 'vy', 'vz'] as const) {
      const before = m1 * (pre[0]?.[axis] ?? NaN) + m2 * (pre[1]?.[axis] ?? NaN);
      const after = m1 * (post[0]?.[axis] ?? NaN) + m2 * (post[1]?.[axis] ?? NaN);
      expect(Math.abs(after - before)).toBeLessThan(1e-15 + 1e-12 * Math.abs(before));
    }
    expect(r.events.filter((e) => e.kind === 'impact' && e.b !== null)).toHaveLength(1);
  });
});

describe('KPB 11: no interpenetration, no tunnelling, bounded events', () => {
  it(`keeps every gap above −1e-9 m in ${String(SHOTS)} random shots`, () => {
    let worst = 0;
    for (const { setup, court, result } of all) {
      const radius = new Map(setup.marbles.map((m) => [m.id, PARAMS_V1.radius[m.size]]));
      const features = staticFeatures(court);
      const tl = result.timeline ?? [];
      for (const a of tl) {
        const ra = radius.get(a.id) ?? NaN;
        for (const k of a.keyframes) {
          if (k.motion === 'pocketed' || k.motion === 'out') continue;
          for (const f of features) {
            const g = featureGap(court, f, ra, k.x, k.y, k.z, newGap());
            if (g.valid) worst = Math.min(worst, g.gap);
          }
          for (const b of tl) {
            if (b.id <= a.id) continue;
            const kb = b.keyframes.filter((q) => q.t === k.t).at(-1);
            if (kb === undefined || kb.motion === 'pocketed' || kb.motion === 'out') continue;
            const d =
              Math.hypot(k.x - kb.x, k.y - kb.y, k.z - kb.z) - ra - (radius.get(b.id) ?? NaN);
            worst = Math.min(worst, d);
          }
        }
      }
      const m = result.metrics;
      expect(result.events.length).toBeLessThanOrEqual(PARAMS_V1.solver.eventsPerShot);
      expect([m.stepCapHits, m.substepCapHits, m.impactCapHits, Number(m.shotCapHit)]).toEqual([
        0, 0, 0, 0,
      ]);
    }
    expect(worst).toBeGreaterThan(-1e-9);
  }, 600_000);

  it.each([
    ['head on', 0, 0],
    ['grazing', 0.0159, 0],
    ['at a thin wall end', 0.006, 1],
  ])('a marble at the 10 m/s limit cannot tunnel (%s)', (_, offset, wall) => {
    const court =
      wall === 1 ? { ...flat(1), walls: [{ x1: 0.2, y1: 0, x2: 0.2, y2: -0.5 }] } : flat(1);
    const marbles =
      wall === 1
        ? [{ id: 1, size: 'r80' as const, x: -0.5, y: offset, vx: 9.99 }]
        : [
            { id: 1, size: 'r80' as const, x: -0.5, y: offset, vx: 9.99 },
            { id: 2, size: 'r80' as const, x: 0.2, y: 0 },
          ];
    const r = simulateShot({ court, marbles });
    expect(r.events.some((e) => e.kind === 'impact' && e.feature !== 'base')).toBe(true);
  });

  it('rejects a marble faster than the 10 m/s limit with a typed error', () => {
    expect(() =>
      simulateShot({ court: flat(1), marbles: [{ id: 1, size: 'r80', x: 0, y: 0, vx: 10.01 }] }),
    ).toThrow(PhysicsError);
  });
});

describe('KPB 12: convergence', () => {
  const cases: [string, ShotSetup][] = [
    [
      'flat, drag on',
      {
        court: flat(4),
        marbles: [
          { id: 1, size: 'r80', x: 0, y: 0, vx: 1.5 },
          { id: 2, size: 'r80', x: 0.3, y: 0.004 },
        ],
      },
    ],
    [
      'down a slope, drag on',
      {
        court: sloped(0.006, 0, 4, 0.5),
        marbles: [
          { id: 1, size: 'r80', x: 0, y: 0, vx: 1.2, wy: 1.2 / R8 },
          { id: 2, size: 'r80', x: 0.3, y: 0.005 },
        ],
      },
    ],
    [
      'across a slope, tile, unequal sizes',
      {
        court: { ...sloped(0.004, 0.005, 4, 0.5), surface: 'tile' },
        marbles: [
          { id: 1, size: 'r95', x: 0, y: 0, vx: 1, wy: 0.4 / R8 },
          { id: 2, size: 'r80', x: 0.3, y: -0.008 },
        ],
      },
    ],
  ];
  it.each(cases)('halving the step moves final positions by under 1e-9 m (%s)', (_, setup) => {
    const a = simulateShot(setup, { timeline: false });
    const b = simulateShot(setup, {
      params: { ...PARAMS_V1, dt: PARAMS_V1.dt / 2 },
      timeline: false,
    });
    expect(a.events.some((e) => e.kind === 'impact' && e.b !== null)).toBe(true);
    a.final.forEach((m, i) => {
      const n = b.final[i];
      expect(
        Math.hypot(m.x - (n?.x ?? NaN), m.y - (n?.y ?? NaN), m.z - (n?.z ?? NaN)),
      ).toBeLessThan(1e-9);
    });
    expect(rel(a.duration, b.duration)).toBeLessThan(1e-6);
  });
});
