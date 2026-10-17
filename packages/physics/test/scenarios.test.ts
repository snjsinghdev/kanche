/**
 * Court features end to end: walls, steps and curbs, the hole, resting contacts, coefficient
 * tables, spin, leaving the court, and the solver's caps. Every shot must also close its energy
 * ledger and never add energy in an impact.
 */
import { describe, expect, it } from 'vitest';

import {
  makeTable,
  PARAMS_V1,
  type CourtSpec,
  type MarbleInit,
  type PhysicsParams,
  type ShotResult,
} from '../src/index.ts';
import { afterEvent, beforeImpact, flat, G, params, R8, rel, run, sloped } from './helpers.ts';

function sane(r: ShotResult): void {
  const scale = r.ledger.initialKinetic + Math.abs(r.ledger.initialPotential);
  expect(Math.abs(r.ledger.residual)).toBeLessThan(1e-9 * scale);
  for (const e of r.events) if (e.kind === 'impact') expect(e.loss).toBeGreaterThan(-1e-15);
}

const box = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('walls', () => {
  const court: CourtSpec = { ...flat(1), walls: [{ x1: 0.3, y1: -0.5, x2: 0.3, y2: 0.5 }] };

  it.each([1, 0.6])('a frictionless wall reflects the normal velocity by e = %f', (e) => {
    const p = params({ drag: false, muS: 0, wallE: e, wallMu: 0 });
    const r = run(court, [{ id: 1, size: 'r80', x: 0, y: 0, vx: 1.2, vy: 0.4 }], p);
    const pre = beforeImpact(r, 1);
    const post = afterEvent(r, 1, 'impact');
    expect(rel(post.vx, -e * pre.vx)).toBeLessThan(1e-9);
    expect(rel(post.vy, pre.vy)).toBeLessThan(1e-9);
    const impact = r.events.find((x) => x.kind === 'impact');
    expect(impact).toMatchObject({ feature: 'wall', nx: -1, x: 0.3 });
    sane(r);
  });

  it('a wall end is a vertical line: the normal points from it to the centre', () => {
    const p = params({ drag: false, muS: 0, wallE: 1, wallMu: 0 });
    const r = run(court, [{ id: 1, size: 'r80', x: 0, y: 0.5 + 0.004, vx: 1 }], p);
    const impact = r.events.find((x) => x.kind === 'impact');
    if (impact?.kind !== 'impact') throw new Error('no impact');
    expect(impact.ny).toBeGreaterThan(0.4);
    expect(Math.hypot(impact.nx, impact.ny)).toBeCloseTo(1, 12);
    sane(r);
  });

  it('a rolling marble banks off a real wall, loses energy and settles', () => {
    const wide: CourtSpec = { ...flat(4), walls: [{ x1: 0.3, y1: -0.5, x2: 0.3, y2: 0.5 }] };
    const r = run(wide, [
      { id: 1, size: 'r80', x: 0, y: 0, vx: 0.8, vy: 0.3, wx: -0.3 / R8, wy: 0.8 / R8 },
    ]);
    expect(r.events.some((e) => e.kind === 'impact' && e.feature === 'wall')).toBe(true);
    expect(r.final[0]?.motion).toBe('resting');
    expect(r.final[0]?.x).toBeLessThan(0.3 - R8 + 1e-9);
    sane(r);
  });
});

describe('steps and curbs', () => {
  const curb: CourtSpec = {
    ...flat(1),
    blocks: [{ points: box(0.3, -0.5, 0.3, 1), height: 0.004 }],
  };

  it('a slow marble bounces back off a curb', () => {
    const r = run(curb, [{ id: 1, size: 'r80', x: 0, y: 0, vx: 0.3, wy: 0.3 / R8 }]);
    expect(r.events.some((e) => e.kind === 'impact' && e.feature === 'edge')).toBe(true);
    expect(r.final[0]?.x).toBeLessThan(0.3);
    sane(r);
  });

  it('a fast marble climbs onto it', () => {
    const r = run(curb, [{ id: 1, size: 'r80', x: 0, y: 0, vx: 2.5, wy: 2.5 / R8 }]);
    expect(r.events.some((e) => e.kind === 'impact' && e.feature === 'top')).toBe(true);
    sane(r);
  });

  it('a marble rolling off a step pivots on the edge, leaves it and lands', () => {
    const r = run(curb, [{ id: 1, size: 'r80', x: 0.5, y: 0, vx: 0.8, wy: 0.8 / R8 }]);
    const kinds = r.events.map((e) =>
      e.kind === 'impact' ? `impact:${String(e.feature)}` : e.kind,
    );
    expect(kinds).toContain('support');
    expect(kinds).toContain('take-off');
    expect(kinds).toContain('impact:base');
    expect(r.final[0]?.x).toBeGreaterThan(0.6);
    sane(r);
  });

  it('a slow marble rolls down a step without leaving the edge too early', () => {
    const r = run(curb, [{ id: 1, size: 'r80', x: 0.55, y: 0, vx: 0.1, wy: 0.1 / R8 }]);
    expect(r.final[0]?.x).toBeGreaterThan(0.6);
    expect(r.final[0]?.z).toBeCloseTo(R8, 12);
    sane(r);
  });

  it('a marble crossing a corner diagonally goes onto the corner', () => {
    const r = run(curb, [
      { id: 1, size: 'r80', x: 0.55, y: 0.45, vx: 0.5, vy: 0.5, wx: -0.5 / R8, wy: 0.5 / R8 },
    ]);
    expect(r.events.filter((e) => e.kind === 'support').length).toBeGreaterThan(0);
    sane(r);
  });
});

describe('the hole', () => {
  const holeCourt: CourtSpec = {
    ...flat(1),
    hole: { x: 0.5, y: 0, radius: 0.04, depth: 0.04, rimRadius: 0.004 },
  };
  const shot = (x: number, y: number, v: number): MarbleInit => ({
    id: 1,
    size: 'r80',
    x,
    y,
    vx: v,
    wy: v / R8,
  });

  it.each([
    ['rolls over the rim and drops in', 0.38, 0, 0.15],
    ['flies off the lip and drops in', 0.3, 0.025, 0.5],
    ['drops in off centre', 0.38, 0.03, 0.15],
  ])('a marble that %s is pocketed', (_, x, y, v) => {
    const r = run(holeCourt, [shot(x, y, v)]);
    expect(r.final[0]?.motion).toBe('pocketed');
    expect(r.events.map((e) => e.kind)).toContain('hole-enter');
    expect(r.events.at(-1)?.kind).toBe('pocketed');
    sane(r);
  });

  it('a slow marble stops short of the hole', () => {
    const r = run(holeCourt, [shot(0, 0, 0.2)]);
    expect(r.final[0]?.motion).toBe('resting');
    expect(r.events.map((e) => e.kind)).toEqual(['roll-rest']);
  });

  it('a fast marble grazing the rim lips out and carries on past the hole', () => {
    const r = run(holeCourt, [shot(0, 0.041, 1.2)]);
    expect(r.events.map((e) => e.kind)).toContain('hole-enter');
    expect(r.final[0]?.motion).not.toBe('pocketed');
    expect(r.final[0]?.x).toBeGreaterThan(0.55);
    sane(r);
  });

  it('a hard shot across the hole bounces in the pit and is caught', () => {
    const r = run(holeCourt, [shot(0, 0.03, 1)]);
    expect(r.events.some((e) => e.kind === 'impact' && e.feature === 'pit-wall')).toBe(true);
    expect(r.final[0]?.motion).toBe('pocketed');
    sane(r);
  });
});

describe('resting contact', () => {
  it('a marble pushed into a wall by a slope is held there and comes to rest', () => {
    const court: CourtSpec = {
      ...sloped(-0.02, 0, 1, 0.25),
      walls: [{ x1: 0.2, y1: -0.5, x2: 0.2, y2: 0.5 }],
    };
    const r = run(court, [{ id: 1, size: 'r80', x: 0.1, y: 0 }], params({ muR: 0.004 }));
    const end = r.final[0];
    expect(end?.motion).toBe('resting');
    expect(end?.x).toBeCloseTo(0.2 - R8, 9);
    expect(r.metrics.forcedRest).toBe(false);
    sane(r);
  });

  it('a second marble rolling into the first is held against it', () => {
    const court: CourtSpec = {
      ...sloped(-0.02, 0, 1, 0.25),
      walls: [{ x1: 0.2, y1: -0.5, x2: 0.2, y2: 0.5 }],
    };
    const r = run(
      court,
      [
        { id: 1, size: 'r80', x: 0.2 - R8, y: 0 },
        { id: 2, size: 'r80', x: 0.05, y: 0 },
      ],
      params({ muR: 0.004 }),
    );
    expect(r.final.map((m) => m.motion)).toEqual(['resting', 'resting']);
    // Touching in 3D: on the slope the two centres differ in height too.
    const [m1, m2] = r.final;
    if (m1 === undefined || m2 === undefined) throw new Error('missing marbles');
    const gap = Math.hypot(m1.x - m2.x, m1.y - m2.y, m1.z - m2.z) - 2 * R8;
    // No interpenetration beyond 1 nm (KPB 11), and touching for every practical purpose.
    expect(gap).toBeGreaterThan(-1e-9);
    expect(gap).toBeLessThan(1e-6);
    expect(r.metrics.forcedRest).toBe(false);
    sane(r);
  });

  it('a held marble rolling along a wall is released when the wall ends', () => {
    const court: CourtSpec = {
      ...sloped(-0.015, -0.02, 1, 0.25),
      walls: [{ x1: 0.2, y1: -0.2, x2: 0.2, y2: 0.2 }],
    };
    // Downhill is −∇h = (+0.015, +0.02): into the wall and along it towards its end at y = 0.2.
    const r = run(
      court,
      [{ id: 1, size: 'r80', x: 0.2 - R8 - 0.0005, y: 0.1 }],
      params({ muR: 0.004 }),
    );
    expect(r.final[0]?.y).toBeGreaterThan(0.2);
    sane(r);
  });
});

describe('motion details', () => {
  it('a marble spinning in place stops at |wz|/(5·muSp·g/(2R))', () => {
    const muSp = PARAMS_V1.surfaces.cement.muSp;
    const r = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, wz: 40 }]);
    const ev = r.events.find((e) => e.kind === 'spin-rest');
    expect(rel(ev?.t ?? NaN, 40 / ((5 * muSp * G) / (2 * R8)))).toBeLessThan(1e-12);
    expect(r.final[0]?.motion).toBe('resting');
    sane(r);
  });

  it('rolling resistance from a piecewise-linear table stops a roll where the integral says', () => {
    const muR = makeTable({ x: [0.2, 0.8], y: [0.01, 0.006] }, 'muR');
    const base = params({ drag: false });
    const p: PhysicsParams = {
      ...base,
      surfaces: { ...base.surfaces, cement: { ...base.surfaces.cement, muR } },
    };
    const v0 = 1.2;
    const r = run(flat(), [{ id: 1, size: 'r80', x: -15, y: 0, vx: v0, wy: v0 / R8 }], p);
    // d = ∫ v dv / (g·muR(v)), muR flat at 0.006 above 0.8 m/s, linear down to 0.2, flat at 0.01.
    const lin = (a: number, b: number, v1: number, v2: number) =>
      (v2 - v1) / b - (a / (b * b)) * Math.log((a + b * v2) / (a + b * v1));
    const b = (0.006 - 0.01) / 0.6;
    const a = 0.01 - b * 0.2;
    const d = ((v0 * v0 - 0.64) / 2 / 0.006 + lin(a, b, 0.2, 0.8) + 0.04 / 2 / 0.01) / G;
    expect(rel((r.final[0]?.x ?? NaN) + 15, d)).toBeLessThan(1e-9);
    expect(r.metrics.tableCrossings).toBe(2);
    sane(r);
  });

  it('a tilted spin axis curves a sliding marble; with drag the slip turns and is refined', () => {
    // Slip u = (vx − R·wy, vy + R·wx) is not parallel to v, so drag along v turns it.
    const r = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, vx: 2, wx: 60, wy: -50, wz: 80 }]);
    // Slip +y (R·wx > 0), so friction pushes the marble towards −y.
    expect(r.final[0]?.y).toBeLessThan(-0.05);
    expect(r.metrics.substeps).toBeGreaterThan(r.metrics.steps);
    sane(r);
  });

  it('on a cross slope a stop is refined, and the shot still balances its energy', () => {
    const r = run(
      sloped(0.004, 0.003, 4, 0.5),
      [{ id: 1, size: 'r80', x: -2, y: 0, vx: 1, vy: 0.2 }],
      params({ muR: 0.008 }),
    );
    expect(r.metrics.substeps).toBeGreaterThan(r.metrics.steps);
    sane(r);
  });

  it('a marble leaving the court is out', () => {
    const r = run(flat(0.5), [{ id: 1, size: 'r80', x: 0, y: 0, vx: -3 }]);
    expect(r.final[0]?.motion).toBe('out');
    expect(r.events.at(-1)?.kind).toBe('out');
    sane(r);
  });
});

describe('caps and limits', () => {
  it('a shot still moving at tMax is forced to rest and flagged', () => {
    const r = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, vx: 1 }], params({ tMax: 0.1 }));
    expect(r.metrics.forcedRest).toBe(true);
    expect(r.final[0]?.vx).toBe(0);
    expect(r.ledger.forced).toBeGreaterThan(0);
    sane(r);
  });

  it('the per-step event cap stops the step and is counted', () => {
    const p = { ...params({ drag: false, glassE: 1, glassMu: 0, muS: 0 }) };
    const capped: PhysicsParams = { ...p, solver: { ...p.solver, eventsPerStep: 2 } };
    const marbles: MarbleInit[] = [{ id: 0, size: 'r80', x: -0.02, y: 0, vx: 1 }];
    for (let i = 1; i <= 4; i += 1) marbles.push({ id: i, size: 'r80', x: (i - 1) * 0.0165, y: 0 });
    const r = run(flat(1), marbles, capped);
    expect(r.metrics.stepCapHits).toBeGreaterThan(0);
    sane(r);
  });

  it('the per-shot event cap forces rest', () => {
    const capped: PhysicsParams = {
      ...PARAMS_V1,
      solver: { ...PARAMS_V1.solver, eventsPerShot: 1 },
    };
    const r = run(flat(), [{ id: 1, size: 'r80', x: 0, y: 0, vx: 1, wz: 5 }], capped);
    expect(r.metrics.shotCapHit).toBe(true);
    sane(r);
  });

  it('the substep cap ends a marble at its stop', () => {
    const capped: PhysicsParams = { ...PARAMS_V1, solver: { ...PARAMS_V1.solver, maxSubsteps: 3 } };
    const r = run(
      sloped(0.004, 0.003, 4, 0.5),
      [{ id: 1, size: 'r80', x: -2, y: 0, vx: 1, vy: 0.2 }],
      capped,
    );
    expect(r.metrics.substepCapHits).toBeGreaterThan(0);
    sane(r);
  });

  it('the impact step cap ends an impact early and is counted', () => {
    const capped: PhysicsParams = {
      ...PARAMS_V1,
      solver: { ...PARAMS_V1.solver, impactSteps: 4, impactMaxSteps: 4 },
    };
    const r = run(
      flat(),
      [
        { id: 1, size: 'r80', x: 0, y: 0, vx: 1 },
        { id: 2, size: 'r80', x: 0.05, y: 0 },
      ],
      capped,
    );
    expect(r.metrics.impactCapHits).toBeGreaterThan(0);
    sane(r);
  });
});

describe('edges and corners', () => {
  const curb: CourtSpec = {
    ...flat(1),
    blocks: [{ points: box(0.3, -0.5, 0.3, 1), height: 0.002 }],
  };

  it('an inelastic edge lets a rolling marble pivot up onto the curb', () => {
    const p = params({ edgeE: 0, edgeMu: 0 });
    // Slow enough to stay on the edge (v²/R < g·nz), fast enough to rise the 2 mm.
    const r = run(curb, [{ id: 1, size: 'r80', x: 0.25, y: 0, vx: 0.3, wy: 0.3 / R8 }], p);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toEqual(['impact', 'support', 'slide-roll', 'support', 'roll-rest']);
    expect(r.final[0]?.x).toBeGreaterThan(0.3);
    expect(r.final[0]?.z).toBeCloseTo(0.002 + R8, 9);
    sane(r);
  });

  it('a marble creeping into a curb slower than vRest meets its edge inelastically and stops', () => {
    const r = run(curb, [
      { id: 1, size: 'r80', x: 0.3 - 0.0045, y: 0, vx: 0.0005, wy: 0.0005 / R8 },
    ]);
    const impact = r.events.find((e) => e.kind === 'impact');
    expect(impact).toMatchObject({ feature: 'edge' });
    expect(r.final[0]?.motion).toBe('resting');
    expect(r.final[0]?.x).toBeLessThan(0.3);
    sane(r);
  });

  it('a marble running diagonally into a block corner bounces off it', () => {
    const r = run(curb, [
      { id: 1, size: 'r80', x: 0.2, y: -0.6, vx: 0.5, vy: 0.5, wx: -0.5 / R8, wy: 0.5 / R8 },
    ]);
    expect(
      r.events.some((e) => e.kind === 'impact' && (e.feature === 'corner' || e.feature === 'edge')),
    ).toBe(true);
    sane(r);
  });
});

describe('locality', () => {
  it("a marble's motion does not depend on events it takes no part in", () => {
    // Marble 1 slides into a roll across open ground. Far away, 2 strikes 3, and both bounce off
    // a wall: their events must not split marble 1's integration.
    const court: CourtSpec = { ...flat(2), walls: [{ x1: 1.5, y1: 0.5, x2: 1.5, y2: 1.9 }] };
    const lone: MarbleInit = { id: 1, size: 'r95', x: -1.5, y: -1.5, vx: 0.9, vy: 0.4, wz: 30 };
    const others: MarbleInit[] = [
      { id: 2, size: 'r80', x: 0.6, y: 1.2, vx: 1.6, vy: 0.05 },
      { id: 3, size: 'r110', x: 1, y: 1.2 },
    ];
    const alone = run(court, [lone]);
    const crowd = run(court, [lone, ...others]);
    expect(crowd.events.filter((e) => e.kind === 'impact' && e.a !== 1).length).toBeGreaterThan(2);
    expect(crowd.final[0]).toEqual(alone.final[0]);
    const own = (r: ShotResult) => r.events.filter((e) => e.kind !== 'impact' && e.id === 1);
    expect(own(crowd)).toEqual(own(alone));
    sane(crowd);
  });
});
