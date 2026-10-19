/**
 * KPB v1 test 14: equal-size, flat-ground collisions against pooltool 0.6.0's frictional_mathavan
 * model (Mathavan, Jackson and Parkin 2014), with Kanche's v1 marble parameters, within 0.5%.
 *
 * The reference values come from tools/kpb/reference/pooltool_mathavan.py (pooltool's function,
 * vendored verbatim, run at a converged 20,000 impulse steps) and are committed. Errors are
 * measured against the striker's speed v (velocities) and v/R (spins).
 *
 * The gate is open (docs/kpb.md). Two kinds of case miss 0.5%:
 *
 * - Draw shots, against pooltool as shipped: its ball–table slip has the opposite sign to its own
 *   rel_velocity (and to its ball–ball slip and torques), so it sees a rolling marble as
 *   slipping at 2v and a drawn one as rolling. With that one sign corrected they agree.
 * - Head-on shots into a marble rolling the other way: Kanche keeps the vertical velocity that
 *   contact friction gives the lifted marble, which feeds back into the contact slip, and sticks
 *   where the slip runs out; Mathavan's model discards the vertical velocity and its explicit
 *   steps chatter about zero slip, applying ground friction throughout.
 */
import { describe, expect, it } from 'vitest';

import ref from '@kanche/testkit/golden/pooltool-mathavan.json' with { type: 'json' };

import { PARAMS_V1 } from '../../src/index.ts';
import { makeBody } from '../../src/sim/body.ts';
import { newImpactOutput, resolveImpact } from '../../src/sim/impact.ts';
import { massOf } from '../helpers.ts';

const TOL = 0.005;

interface Side {
  readonly r: readonly number[];
  readonly v: readonly number[];
  readonly w: readonly number[];
}
interface Post {
  readonly vi: readonly number[];
  readonly wi: readonly number[];
  readonly vj: readonly number[];
  readonly wj: readonly number[];
}
interface Case {
  readonly name: string;
  readonly i: Side;
  readonly j: Side;
  readonly pooltool: Post;
  readonly corrected: Post;
}

const cases = ref.cases as readonly Case[];
const at = (xs: readonly number[], k: number): number => xs[k] ?? NaN;

/** Kanche's impact solve on a reference case: i strikes j, both on cement. */
function kanche(c: Case, steps: number = PARAMS_V1.solver.impactSteps): Post {
  const [a, b] = [makeBody(1, 'r80', PARAMS_V1), makeBody(2, 'r80', PARAMS_V1)];
  for (const [body, side] of [
    [a, c.i],
    [b, c.j],
  ] as const) {
    Object.assign(body.s, {
      x: at(side.r, 0),
      y: at(side.r, 1),
      z: at(side.r, 2),
      vx: at(side.v, 0),
      vy: at(side.v, 1),
      vz: at(side.v, 2),
      wx: at(side.w, 0),
      wy: at(side.w, 1),
      wz: at(side.w, 2),
    });
  }
  const [dx, dy, dz] = [a.s.x - b.s.x, a.s.y - b.s.y, a.s.z - b.s.z];
  const d = Math.hypot(dx, dy, dz);
  const ground = { nx: 0, ny: 0, nz: 1 };
  const muS = PARAMS_V1.surfaces.cement.muS;
  resolveImpact(
    {
      a: { body: a, s: a.s, support: ground, supportMu: muS },
      b: { body: b, s: b.s, support: ground, supportMu: muS },
      nx: dx / d,
      ny: dy / d,
      nz: dz / d,
      e: ref.params.e_b,
      mu: ref.params.u_b,
      steps,
      maxSteps: 16 * steps,
    },
    newImpactOutput(),
  );
  return {
    vi: [a.s.vx, a.s.vy, a.s.vz],
    wi: [a.s.wx, a.s.wy, a.s.wz],
    vj: [b.s.vx, b.s.vy, b.s.vz],
    wj: [b.s.wx, b.s.wy, b.s.wz],
  };
}

/** Largest disagreement in horizontal velocity (per v) and spin (per v/R). */
function error(c: Case, ours: Post, theirs: Post): number {
  const v = Math.hypot(at(c.i.v, 0), at(c.i.v, 1), at(c.i.v, 2));
  let worst = 0;
  for (const k of ['vi', 'vj'] as const) {
    for (let x = 0; x < 2; x += 1) {
      worst = Math.max(worst, Math.abs(at(ours[k], x) - at(theirs[k], x)) / v);
    }
  }
  for (const k of ['wi', 'wj'] as const) {
    for (let x = 0; x < 3; x += 1) {
      worst = Math.max(worst, (Math.abs(at(ours[k], x) - at(theirs[k], x)) * ref.params.R) / v);
    }
  }
  return worst;
}

const draw = (c: Case): boolean => c.name.endsWith(' draw');
const intoRolling = (c: Case): boolean => c.name.includes('into rolling');

describe('KPB 14: against pooltool frictional_mathavan', () => {
  it("is generated with Kanche's v1 marble parameters", () => {
    expect(ref.reference).toMatchObject({ package: 'pooltool-billiards', version: '0.6.0' });
    expect(ref.params.R).toBe(PARAMS_V1.radius.r80);
    expect(ref.params.M).toBeCloseTo(massOf(PARAMS_V1.radius.r80), 15);
    expect(ref.params.u_s).toBe(PARAMS_V1.surfaces.cement.muS);
    expect(ref.params.u_b).toBe(PARAMS_V1.glass.mu.segments[0]?.a);
    expect(ref.params.e_b).toBe(PARAMS_V1.glass.e.segments[0]?.a);
    expect(cases).toHaveLength(81);
  });

  it('agrees within 0.5% with pooltool as shipped, on every shot but draws and head-on returns', () => {
    const shots = cases.filter((c) => !draw(c) && !intoRolling(c));
    expect(shots).toHaveLength(60);
    const worst = Math.max(...shots.map((c) => error(c, kanche(c), c.pooltool)));
    console.log(`KPB 14: worst ${(100 * worst).toFixed(3)}% over ${String(shots.length)} shots`);
    expect(worst).toBeLessThan(TOL);
  });

  it("agrees within 0.5% on every cut shot, draws included, with pooltool's slip sign corrected", () => {
    const shots = cases.filter((c) => !intoRolling(c));
    expect(shots).toHaveLength(75);
    const worst = Math.max(...shots.map((c) => error(c, kanche(c), c.corrected)));
    console.log(`KPB 14: worst ${(100 * worst).toFixed(3)}% over ${String(shots.length)} shots`);
    expect(worst).toBeLessThan(TOL);
  });

  it('misses 0.5% only on the open cases recorded in docs/kpb.md', () => {
    const missed = cases.filter((c) => error(c, kanche(c), c.pooltool) >= TOL);
    expect(missed.every((c) => draw(c) || intoRolling(c))).toBe(true);
    const worst = (xs: readonly Case[], post: (c: Case) => Post): number =>
      Math.max(...xs.map((c) => error(c, kanche(c), post(c))));
    console.log(
      `KPB 14 open: ${String(missed.length)} of ${String(cases.length)} miss; draws up to ` +
        `${(100 * worst(cases.filter(draw), (c) => c.pooltool)).toFixed(2)}% (shipped), ` +
        `head-on returns up to ${(100 * worst(cases.filter(intoRolling), (c) => c.corrected)).toFixed(2)}% (corrected)`,
    );
  });

  it(`${String(PARAMS_V1.solver.impactSteps)} impulse steps are converged to a tenth of the tolerance`, () => {
    // Against 65,536 steps: cut shots differ by under 0.004%, head-on returns (which stick) by
    // under 0.03%.
    for (const c of cases) {
      expect(error(c, kanche(c), kanche(c, 65_536))).toBeLessThan(TOL / 10);
    }
  }, 120_000);
});
