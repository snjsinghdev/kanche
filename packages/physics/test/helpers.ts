/**
 * Test helpers: parameter variants, courts and closed-form checks. Tests may use transcendental
 * functions (Math.log, atan2, sin); the simulation may not.
 */
import {
  makeTable,
  PARAMS_V1,
  simulateShot,
  type CourtSpec,
  type Keyframe,
  type MarbleInit,
  type PhysicsParams,
  type ShotResult,
  type SurfaceId,
} from '../src/index.ts';

export const G = PARAMS_V1.g;
export const R8 = PARAMS_V1.radius.r80;

/** Mass of a glass marble of radius r (kg). */
export function massOf(r: number, params: PhysicsParams = PARAMS_V1): number {
  return params.glassDensity * (4 / 3) * Math.PI * r * r * r;
}

export function constant(value: number): ReturnType<typeof makeTable> {
  return makeTable({ x: [0], y: [value] }, 'test');
}

export interface Variant {
  drag?: boolean;
  muS?: number;
  muR?: number;
  muSp?: number;
  glassE?: number;
  glassMu?: number;
  wallE?: number;
  wallMu?: number;
  edgeE?: number;
  edgeMu?: number;
  groundE?: number;
  dt?: number;
  tMax?: number;
  allowLoft?: boolean;
}

/** A parameter set derived from v1 for one surface (cement unless stated). */
export function params(v: Variant = {}, surface: SurfaceId = 'cement'): PhysicsParams {
  const base = PARAMS_V1.surfaces[surface];
  return {
    ...PARAMS_V1,
    dragCoefficient: v.drag === false ? 0 : PARAMS_V1.dragCoefficient,
    dt: v.dt ?? PARAMS_V1.dt,
    tMax: v.tMax ?? PARAMS_V1.tMax,
    allowLoft: v.allowLoft ?? PARAMS_V1.allowLoft,
    surfaces: {
      ...PARAMS_V1.surfaces,
      [surface]: {
        muS: v.muS ?? base.muS,
        muR: v.muR === undefined ? base.muR : constant(v.muR),
        muSp: v.muSp ?? base.muSp,
        e: v.groundE === undefined ? base.e : constant(v.groundE),
      },
    },
    glass: {
      e: v.glassE === undefined ? PARAMS_V1.glass.e : constant(v.glassE),
      mu: v.glassMu === undefined ? PARAMS_V1.glass.mu : constant(v.glassMu),
    },
    wall: {
      e: v.wallE === undefined ? PARAMS_V1.wall.e : constant(v.wallE),
      mu: v.wallMu === undefined ? PARAMS_V1.wall.mu : constant(v.wallMu),
    },
    edge: {
      e: v.edgeE === undefined ? PARAMS_V1.edge.e : constant(v.edgeE),
      mu: v.edgeMu === undefined ? PARAMS_V1.edge.mu : constant(v.edgeMu),
    },
  };
}

/** A flat court, `half` metres each way from the origin. */
export function flat(half = 20, surface: SurfaceId = 'cement'): CourtSpec {
  return { surface, bounds: { xMin: -half, xMax: half, yMin: -half, yMax: half } };
}

/** A court with a uniform slope h = sx·x + sy·y (heightfield covering the bounds). */
export function sloped(sx: number, sy: number, half = 4, cell = 0.5): CourtSpec {
  const n = Math.round((2 * half) / cell) + 1;
  const heights: number[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      heights.push(sx * (-half + i * cell) + sy * (-half + j * cell));
    }
  }
  return {
    surface: 'cement',
    bounds: { xMin: -half, xMax: half, yMin: -half, yMax: half },
    heightfield: { x0: -half, y0: -half, cellSize: cell, nx: n, ny: n, heights },
  };
}

export function run(
  court: CourtSpec,
  marbles: MarbleInit[],
  p: PhysicsParams = PARAMS_V1,
  timeline = true,
): ShotResult {
  return simulateShot({ court, marbles }, { params: p, timeline });
}

/** Relative error |a − b| / |b| (absolute when b is 0). */
export function rel(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b);
}

/** The keyframes of a marble. */
export function frames(result: ShotResult, id: number): readonly Keyframe[] {
  const tl = result.timeline?.find((m) => m.id === id);
  if (tl === undefined) throw new Error(`no timeline for ${String(id)}`);
  return tl.keyframes;
}

/** The keyframe just after the n-th event of `kind` involving marble id (0-based). */
export function afterEvent(result: ShotResult, id: number, kind: string, n = 0): Keyframe {
  const evs = result.events.filter(
    (e) =>
      e.kind === kind &&
      (e.kind === 'impact' ? e.a === id || e.b === id : 'id' in e && e.id === id),
  );
  const ev = evs[n];
  if (ev === undefined) throw new Error(`no ${kind} #${String(n)} for marble ${String(id)}`);
  const at = frames(result, id).filter((k) => k.t === ev.t);
  const last = at.at(-1);
  if (last === undefined) throw new Error(`no keyframe at ${kind} for ${String(id)}`);
  return last;
}

/** The keyframe just before the n-th impact involving marble id. */
export function beforeImpact(result: ShotResult, id: number, n = 0): Keyframe {
  const evs = result.events.filter((e) => e.kind === 'impact' && (e.a === id || e.b === id));
  const ev = evs[n];
  if (ev === undefined) throw new Error(`no impact #${String(n)} for marble ${String(id)}`);
  const at = frames(result, id).filter((k) => k.t === ev.t);
  const first = at[0];
  if (first === undefined) throw new Error('no keyframe');
  return first;
}

/** Shots for the 10,000-shot suites: 1,000 by default, KANCHE_KPB_SHOTS for the nightly run. */
export function kpbShots(): number {
  const raw = process.env['KANCHE_KPB_SHOTS'];
  if (raw === undefined || raw === '') return 1000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`bad KANCHE_KPB_SHOTS "${raw}"`);
  return n;
}
