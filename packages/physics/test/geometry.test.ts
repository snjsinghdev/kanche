/**
 * Contact-feature geometry and the Hermite pieces, at unit level: every gap is a true distance
 * where its feature is the nearest surface, and the curves are exact for polynomial motion.
 */
import { describe, expect, it } from 'vitest';

import { buildCourt } from '../src/index.ts';
import {
  canSupport,
  featureGap,
  featureKey,
  holeRadial,
  insideBlock,
  newGap,
  staticFeatures,
  type StaticFeature,
} from '../src/sim/features.ts';
import { newDyn } from '../src/sim/dyn.ts';
import {
  extendBox,
  hermite,
  hermiteRate,
  positionAt,
  positionRateAt,
  relativeSpeedBound,
  speedBound,
  stateAt,
  type Piece,
} from '../src/sim/hermite.ts';

const square = [
  { x: 0, y: 0 },
  { x: 0.1, y: 0 },
  { x: 0.1, y: 0.1 },
  { x: 0, y: 0.1 },
];
const court = buildCourt({
  surface: 'cement',
  bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
  walls: [{ x1: -0.5, y1: -0.5, x2: -0.5, y2: 0.5 }],
  blocks: [{ points: square, height: 0.004 }],
  hole: { x: 0.5, y: 0.5, radius: 0.04, depth: 0.03, rimRadius: 0.004 },
});
const R = 0.008;

function gap(f: StaticFeature, x: number, y: number, z: number) {
  return featureGap(court, f, R, x, y, z, newGap());
}

describe('static features', () => {
  const features = staticFeatures(court);
  const of = (kind: StaticFeature['kind']) => {
    const f = features.find((x) => x.kind === kind);
    if (f === undefined) throw new Error(kind);
    return f;
  };

  it('are listed in a fixed order with distinct keys', () => {
    expect(features.map((f) => f.kind)).toEqual([
      'base',
      'wall',
      'top',
      'edge',
      'edge',
      'edge',
      'edge',
      'corner',
      'corner',
      'corner',
      'corner',
      'rim',
      'pit-wall',
      'floor',
    ]);
    expect(new Set(features.map(featureKey)).size).toBe(features.length);
    expect(features.filter(canSupport).map((f) => f.kind)).not.toContain('wall');
  });

  it('measure a wall as horizontal distance, also past its ends', () => {
    const w = gap(of('wall'), -0.4, 0, 0.3);
    expect(w).toMatchObject({ valid: true, nx: 1, nz: 0 });
    expect(w.gap).toBeCloseTo(0.1 - R, 15);
    const end = gap(of('wall'), -0.5, 0.6, 0);
    expect(end.gap).toBeCloseTo(0.1 - R, 12);
    expect(end.ny).toBeCloseTo(1, 12);
    expect(gap(of('wall'), -0.5, 0, 0).valid).toBe(false);
  });

  it('measure a block edge within its wedge only', () => {
    const e = features.find((f) => f.kind === 'edge' && f.edge.oy === -1);
    if (e === undefined) throw new Error('edge');
    // Beside the bottom edge, at the edge's height plus 3 mm, 4 mm out.
    const g = gap(e, 0.05, -0.004, 0.007);
    expect(g.valid).toBe(true);
    expect(g.gap).toBeCloseTo(0.005 - R, 12);
    expect(g.nz).toBeCloseTo(0.6, 12);
    expect(gap(e, 0.05, 0.01, 0.01).valid).toBe(false); // over the block
    expect(gap(e, 0.05, -0.01, 0.001).valid).toBe(false); // below the top
    expect(gap(e, 0.2, -0.01, 0.01).valid).toBe(false); // past the end
    expect(gap(e, 0.05, 0, 0.004).valid).toBe(false); // on the line itself
  });

  it('measure a corner within the wedge between its edges', () => {
    const c = features.find((f) => f.kind === 'corner' && f.corner.x === 0 && f.corner.y === 0);
    if (c === undefined) throw new Error('corner');
    const g = gap(c, -0.003, -0.004, 0.004);
    expect(g.valid).toBe(true);
    expect(g.gap).toBeCloseTo(0.005 - R, 12);
    expect(gap(c, 0.01, -0.004, 0.004).valid).toBe(false);
    expect(gap(c, 0, 0, 0.004).valid).toBe(false);
  });

  it('measure the top face only over the block, and the base everywhere but the hole', () => {
    const t = gap(of('top'), 0.05, 0.05, 0.02);
    expect(t.valid).toBe(true);
    expect(t.gap).toBeCloseTo(0.02 - R - 0.004, 15);
    expect(gap(of('top'), 0.2, 0.05, 0.02).valid).toBe(false);
    expect(gap(of('base'), 0.2, 0.05, 0.02).gap).toBeCloseTo(0.02 - R, 15);
    expect(gap(of('base'), 0.5, 0.5, 0.02).valid).toBe(false);
    expect(insideBlock(court.blocks[0] ?? (null as never), 0.05, 0.05)).toBe(true);
  });

  it('measure the rim on its quarter torus, and the pit wall and floor below it', () => {
    const hole = court.hole;
    if (hole === undefined) throw new Error('hole');
    // A centre straight above the torus's circle, 1 mm clear of its tube.
    const top = gap(of('rim'), 0.5 + hole.rc - 1e-9, 0.5, hole.zc + hole.rf + R + 0.001);
    expect(top.valid).toBe(true);
    expect(top.gap).toBeCloseTo(0.001, 12);
    expect(top.nz).toBeCloseTo(1, 12);
    expect(gap(of('rim'), 0.5 + hole.rc + 0.001, 0.5, 0.01).valid).toBe(false);
    expect(gap(of('rim'), 0.5, 0.5 + hole.rh - R, hole.zc - 0.001).valid).toBe(false);
    expect(gap(of('rim'), 0.5, 0.5, 0).valid).toBe(false);
    const wall = gap(of('pit-wall'), 0.5 + 0.02, 0.5, hole.zc - 0.01);
    expect(wall.gap).toBeCloseTo(hole.rh - 0.02 - R, 12);
    expect(wall.nx).toBeCloseTo(-1, 12);
    expect(gap(of('pit-wall'), 0.52, 0.5, 0).valid).toBe(false);
    expect(gap(of('pit-wall'), 0.5, 0.5, -0.01).valid).toBe(false);
    // Below the rim's circle but outside the hole: not the pit wall (or a marble anywhere low on
    // the court would see it).
    expect(gap(of('pit-wall'), 0.5 + hole.rc + 0.01, 0.5, hole.zc - 0.01).valid).toBe(false);
    expect(gap(of('floor'), 0.5, 0.5, -0.02).gap).toBeCloseTo(0.01 - R, 12);
    expect(gap(of('floor'), 0.6, 0.5, -0.02).valid).toBe(false);
    expect(holeRadial(hole, 0.53, 0.54)).toBeCloseTo(0.05, 15);
  });

  it('report nothing for features a court does not have', () => {
    const bare = buildCourt({ surface: 'tile', bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 } });
    for (const kind of ['rim', 'pit-wall', 'floor'] as const) {
      expect(featureGap(bare, { kind }, R, 0, 0, 0, newGap()).valid).toBe(false);
    }
  });
});

describe('Hermite pieces', () => {
  function piece(t0: number, t1: number): Piece {
    // x(t) = 1 + 2t − 3t², y(t) = t³ (cubic), z constant.
    const s0 = newDyn();
    const s1 = newDyn();
    const f0 = newDyn();
    const f1 = newDyn();
    const x = (t: number) => 1 + 2 * t - 3 * t * t;
    const vx = (t: number) => 2 - 6 * t;
    s0.x = x(t0);
    s1.x = x(t1);
    f0.x = vx(t0);
    f1.x = vx(t1);
    s0.y = t0 ** 3;
    s1.y = t1 ** 3;
    f0.y = 3 * t0 * t0;
    f1.y = 3 * t1 * t1;
    s0.vx = vx(t0);
    s1.vx = vx(t1);
    f0.vx = -6;
    f1.vx = -6;
    return { t0, t1, s0, f0, s1, f1 };
  }

  it('reproduce cubic motion exactly, with its rate', () => {
    const p = piece(0.1, 0.4);
    const out = { x: 0, y: 0, z: 0 };
    for (const t of [0.1, 0.17, 0.25, 0.4]) {
      positionAt(p, t, out);
      expect(out.x).toBeCloseTo(1 + 2 * t - 3 * t * t, 14);
      expect(out.y).toBeCloseTo(t ** 3, 14);
      positionRateAt(p, t, out);
      expect(out.x).toBeCloseTo(2 - 6 * t, 13);
      const st = stateAt(p, t, newDyn());
      expect(st.vx).toBeCloseTo(2 - 6 * t, 13);
    }
    expect(hermite(1, 0, 3, 0, 2, 1)).toBe(2);
    expect(hermiteRate(0, 1, 1, 1, 1, 0.5)).toBe(1);
  });

  it('bound the speed and the extent of the curve', () => {
    const p = piece(0, 0.5);
    const bound = speedBound(p);
    for (let t = 0; t <= 0.5; t += 0.01) {
      expect(Math.hypot(2 - 6 * t, 3 * t * t)).toBeLessThanOrEqual(bound + 1e-12);
    }
    const q = piece(0, 0.5);
    expect(relativeSpeedBound(p, q)).toBeCloseTo(0, 12);
    expect(relativeSpeedBound(p, piece(0, 0.25))).toBeCloseTo(
      speedBound(p) + speedBound(piece(0, 0.25)),
      12,
    );
    const box = {
      xMin: Infinity,
      xMax: -Infinity,
      yMin: Infinity,
      yMax: -Infinity,
      zMin: Infinity,
      zMax: -Infinity,
    };
    extendBox(p, box);
    expect(box.xMax).toBeGreaterThanOrEqual(1 + 1 / 3);
    expect(box.xMin).toBeLessThanOrEqual(1 + 1 - 0.75);
  });

  it('treat a zero-length piece as a point', () => {
    const p = piece(0.2, 0.2);
    const out = { x: 0, y: 0, z: 0 };
    positionAt(p, 0.2, out);
    expect(out.x).toBe(p.s0.x);
    positionRateAt(p, 0.2, out);
    expect(out.x).toBe(0);
    expect(stateAt(p, 0.2, newDyn()).vx).toBe(p.s0.vx);
    expect(speedBound(p)).toBe(Math.hypot(p.f0.x, p.f0.y));
    expect(relativeSpeedBound(p, p)).toBe(2 * speedBound(p));
  });
});
