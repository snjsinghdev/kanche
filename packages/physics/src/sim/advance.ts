/**
 * Advancing one marble through part of a step (ADR-0006).
 *
 * A marble integrates with the fixed-step RK4, in substeps that end at the step's grid line or
 * at the marble's first internal event: a Coulomb stop, a spin stop, a terrain-cell or
 * coefficient-table boundary, the hole region, a change of support, take-off, or leaving the
 * court. Inside a substep every frozen quantity (cell patch, table segment, spin sign, and the
 * Coulomb direction when it cannot turn) stays fixed, so forces are smooth inside each substep.
 *
 * Events are located on the substep's cubic Hermite interpolant, and the substep is then
 * re-integrated from its start to the event time, so every event state is an RK4 state.
 *
 * Coulomb stops: when the slip u (or the rolling speed v) runs to zero, its direction keeps
 * turning on a slope, as |u|^(c/k). That is not smooth enough for one RK4 step to span it, so near
 * a stop the substeps shrink geometrically (h ≤ stopRefine·|u|/|du/dt|) until |u| < uStop, and
 * the exact friction impulse removes the residual. When the direction cannot turn (flat ground,
 * no side forces), it is frozen instead, every substep is exact, and the stop time is found as a
 * root.
 */

import { cellPatch, patchOf, type Court } from '../court.ts';
import { assertFinite, defined, expectKind, PhysicsError } from '../errors.ts';
import type { PhysicsParams, SurfaceParams } from '../params/types.ts';
import { holeRadial, type StaticFeature } from './features.ts';
import { isPlane, type Body } from './body.ts';
import {
  curvedGeometry,
  derivative,
  isCurved,
  newCtx,
  newGeo,
  rollingFrictionNeeded,
  supportNormalForce,
  type Ctx,
} from './derivative.ts';
import { axpy, copyDyn, newDyn, rk4Combine, type Dyn } from './dyn.ts';
import { MAX_EXACT, solveLcp } from './lcp.ts';
import {
  holdGeometry,
  newHoldGeo,
  respond,
  responseAlong,
  trueAccel,
  trueState,
  type Hold,
} from './holds.ts';
import { positionAt, positionRateAt, speedBound, stateAt, type Piece } from './hermite.ts';

export interface Metrics {
  steps: number;
  substeps: number;
  impacts: number;
  impactSteps: number;
  impactCapHits: number;
  substepCapHits: number;
  stepCapHits: number;
  shotCapHit: boolean;
  forcedRest: boolean;
  cellCrossings: number;
  tableCrossings: number;
  /** Contacts found on the trial curves that the committed state showed apart. */
  staleContacts: number;
}

export function newMetrics(): Metrics {
  return {
    steps: 0,
    substeps: 0,
    impacts: 0,
    impactSteps: 0,
    impactCapHits: 0,
    substepCapHits: 0,
    stepCapHits: 0,
    shotCapHit: false,
    forcedRest: false,
    cellCrossings: 0,
    tableCrossings: 0,
    staleContacts: 0,
  };
}

export interface World {
  readonly court: Court;
  readonly params: PhysicsParams;
  readonly surface: SurfaceParams;
  readonly features: readonly StaticFeature[];
  readonly metrics: Metrics;
}

/** Internal event probes. Each is positive until its event, which happens when it reaches 0. */
export const PROBE = Object.freeze({
  slideStop: 0,
  rollStop: 1,
  spinStop: 2,
  segUp: 3,
  segDown: 4,
  cellXLo: 5,
  cellXHi: 6,
  cellYLo: 7,
  cellYHi: 8,
  outXMin: 9,
  outXMax: 10,
  outYMin: 11,
  outYMax: 12,
  holeEnter: 13,
  topLeave: 14,
  rimOut: 15,
  rimDown: 16,
  edgeA: 17,
  edgeB: 18,
  edgeTop: 19,
  edgeDown: 20,
  corner1: 21,
  corner2: 22,
  cornerDown: 23,
  takeOff: 24,
  rollSlip: 25,
  /** A Coulomb stop reached by refinement (|u| or |v| below its threshold). */
  stopReached: 26,
  /** The substep cap: the marble is forced to its stop (logged). */
  substepCap: 27,
  /** A held contact no longer pressed (its force would turn negative). */
  release: 28,
  /** A slaved curved slip (along ĉ) that has run out. */
  slaveStop: 29,
});

interface Probe {
  code: number;
  arg: number;
}

export interface InternalEvent {
  /** Time from the start of the advance (s). */
  t: number;
  code: number;
  arg: number;
  /** The hold being released (release events only). */
  hold: Hold | null;
  /** The marble the event belongs to. */
  body: Body | null;
}

/** Per-advance scratch: pieces are pooled and reused between advances. */
export interface Track {
  readonly pieces: Piece[];
  count: number;
  /** The state at the end of the advance. */
  readonly end: Dyn;
  event: InternalEvent | null;
  readonly eventStore: InternalEvent;
  /** False for a marble at rest: its single piece is constant. */
  moving: boolean;
}

export function newTrack(): Track {
  return {
    pieces: [],
    count: 0,
    end: newDyn(),
    event: null,
    eventStore: { t: 0, code: 0, arg: 0, hold: null, body: null },
    moving: false,
  };
}

function piece(track: Track): Piece {
  let p = track.pieces[track.count];
  if (p === undefined) {
    p = { t0: 0, t1: 0, s0: newDyn(), f0: newDyn(), s1: newDyn(), f1: newDyn() };
    track.pieces.push(p);
  }
  track.count += 1;
  return p;
}

function planeLevel(world: World, body: Body, x: number, y: number): number {
  const sup = body.support;
  if (sup === null) return 0;
  if (sup.kind === 'top') return sup.block.z;
  if (sup.kind === 'floor') return defined(world.court.hole, 'hole').zFloor;
  const hf = world.court.heightfield;
  if (hf === undefined) return 0;
  // On the base ground the frozen cell's patch is used, extended smoothly past its edges.
  const p = patchOf(hf, body.cellI, body.cellJ);
  return p.c0 + p.cx * x + p.cy * y + p.cxy * x * y;
}

/** The ground height under a marble on its plane support (m). */
export function supportLevel(world: World, body: Body, x: number, y: number): number {
  return planeLevel(world, body, x, y);
}

/** Set the heightfield cell of a marble from its position (on entering the base ground). */
export function locateCell(world: World, body: Body): void {
  const hf = world.court.heightfield;
  if (hf === undefined) return;
  const p = cellPatch(hf, body.s.x, body.s.y);
  body.cellI = p.i;
  body.cellJ = p.j;
}

/** Slope acceleration −g·∇h on a marble's plane support (m/s²). */
export function slopeAt(world: World, body: Body, x: number, y: number): { x: number; y: number } {
  const sup = body.support;
  const hf = world.court.heightfield;
  if (sup === null || sup.kind !== 'base' || hf === undefined) return { x: 0, y: 0 };
  const p = patchOf(hf, body.cellI, body.cellJ);
  const g = world.params.g;
  return { x: -g * (p.cx + p.cxy * y), y: -g * (p.cy + p.cxy * x) };
}

/**
 * Fill the substep context from the marble and its current state. Returns false for a marble
 * that does not move (resting, pocketed, out).
 */
export function prepareCtx(world: World, body: Body, s: Dyn, ctx: Ctx): boolean {
  if (body.done) return false;
  const sup = body.support;
  const params = world.params;
  ctx.support = sup;
  ctx.g = params.g;
  ctx.r = body.r;
  ctx.m = body.m;
  ctx.inertia = body.inertia;
  ctx.dragK = body.dragK;
  ctx.hole = world.court.hole;
  ctx.muS = world.surface.muS;
  ctx.muSp = world.surface.muSp;
  const seg = defined(world.surface.muR.segments[body.rollSeg], 'rolling segment');
  ctx.rollA = seg.a;
  ctx.rollB = seg.b;
  ctx.fixed = false;
  ctx.restart = false;
  ctx.slaved = false;
  ctx.sgnWz = 0;
  ctx.patch = null;
  if (sup === null) {
    if (body.motion !== 'airborne') {
      throw new PhysicsError('internal', `unsupported marble ${String(body.id)} is ${body.motion}`);
    }
    ctx.mode = 'air';
    return true;
  }
  const hf = world.court.heightfield;
  if (sup.kind === 'base' && hf !== undefined) ctx.patch = patchOf(hf, body.cellI, body.cellJ);
  const curved = isCurved(sup);
  if (!curved) ctx.sgnWz = Math.sign(s.wz);
  switch (body.motion) {
    case 'sliding':
      ctx.mode = 'slide';
      // On a curved support the normal turns with the motion, so the direction is never frozen,
      // except to restart a slip from zero.
      if (curved) curvedSlipMode(world, ctx, s);
      else planeSlideDirection(world, ctx, s);
      return true;
    case 'rolling':
      ctx.mode = 'roll';
      rollDirection(world, ctx, s, curved);
      return true;
    case 'spinning':
      if (curved) return false;
      ctx.mode = 'spin';
      return ctx.sgnWz !== 0;
    default:
      return false;
  }
}

/** Plane sliding: freeze the slip direction when nothing can turn it (|c × û| ≤ tol·k). */
function planeSlideDirection(world: World, ctx: Ctx, s: Dyn): void {
  const ux = s.vx - ctx.r * s.wy;
  const uy = s.vy + ctx.r * s.wx;
  const u = Math.sqrt(ux * ux + uy * uy);
  const dx = ux / u;
  const dy = uy / u;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const p = ctx.patch;
  const g = ctx.g;
  const cx = (p === null ? 0 : -g * (p.cx + p.cxy * s.y)) - ctx.dragK * speed * s.vx;
  const cy = (p === null ? 0 : -g * (p.cy + p.cxy * s.x)) - ctx.dragK * speed * s.vy;
  const k = 3.5 * ctx.muS * g;
  if (Math.abs(cx * dy - cy * dx) <= world.params.thresholds.alignTol * k) {
    ctx.fixed = true;
    ctx.fdx = dx;
    ctx.fdy = dy;
    ctx.fdz = 0;
  }
}

const geoScratch = newGeo();
const force = { x: 0, y: 0, z: 0 };

/** Tangential slip on a curved support at state s, into (out.x, out.y, out.z); returns |u|. */
function curvedSlip(ctx: Ctx, s: Dyn, out: { x: number; y: number; z: number }): number {
  const gm = curvedGeometry(ctx, s, geoScratch);
  let ux = s.vx - ctx.r * (s.wy * gm.nz - s.wz * gm.ny);
  let uy = s.vy - ctx.r * (s.wz * gm.nx - s.wx * gm.nz);
  let uz = s.vz - ctx.r * (s.wx * gm.ny - s.wy * gm.nx);
  const un = ux * gm.nx + uy * gm.ny + uz * gm.nz;
  ux -= un * gm.nx;
  uy -= un * gm.ny;
  uz -= un * gm.nz;
  out.x = ux;
  out.y = uy;
  out.z = uz;
  return Math.sqrt(ux * ux + uy * uy + uz * uz);
}

const slipScratch = { x: 0, y: 0, z: 0 };

/**
 * Curved sliding with a small slip. With c the slip's rate without friction (c = −(7/2m)·F, F the
 * friction rolling would need) and k = (7/2)·muS·N/m the friction rate, the slip direction is
 * drawn towards ĉ at the stiff rate |c|/|u|, whether the slip then grows (|c| > k, rolling
 * cannot be held) or shrinks (|c| < k). While an explicit substep could not follow that
 * (stopRefine·|u| < (k + |c|)·h), the slip direction is slaved to ĉ, which is smooth in the
 * state (docs/physics.md, "Stick and slip on curves").
 */
function curvedSlipMode(world: World, ctx: Ctx, s: Dyn): void {
  const u = curvedSlip(ctx, s, slipScratch);
  const need = rollingFrictionNeeded(ctx, s, force);
  const n = Math.max(0, supportNormalForce(ctx, s));
  const k = (3.5 * ctx.muS * n) / ctx.m;
  const c = (3.5 * need) / ctx.m;
  if (need === 0) return;
  const gm = curvedGeometry(ctx, s, geoScratch);
  const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  const solver = world.params.solver;
  const h = Math.min(world.params.dt, v > 0 ? (solver.curveRefine * gm.dist) / v : Infinity);
  if (solver.stopRefine * u < (k + c) * h) ctx.slaved = true;
}

/** Rolling: freeze v̂ on flat cells; from rest, start along the slope (or tangential gravity). */
function rollDirection(world: World, ctx: Ctx, s: Dyn, curved: boolean): void {
  const vStop = world.params.thresholds.vStop;
  if (curved) {
    const t = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    if (t >= vStop) return;
    // From rest on a curved support: start along tangential gravity.
    const gm = curvedGeometry(ctx, s, geoScratch);
    const tx = gm.nz * gm.nx;
    const ty = gm.nz * gm.ny;
    const tz = gm.nz * gm.nz - 1;
    const l = Math.sqrt(tx * tx + ty * ty + tz * tz);
    ctx.fixed = true;
    ctx.restart = true;
    ctx.fdx = tx / l;
    ctx.fdy = ty / l;
    ctx.fdz = tz / l;
    return;
  }
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const p = ctx.patch;
  const g = ctx.g;
  const ax = p === null ? 0 : -g * (p.cx + p.cxy * s.y);
  const ay = p === null ? 0 : -g * (p.cy + p.cxy * s.x);
  if (speed < vStop) {
    const a = Math.sqrt(ax * ax + ay * ay);
    ctx.fixed = true;
    ctx.restart = true;
    ctx.fdx = ax / a;
    ctx.fdy = ay / a;
    ctx.fdz = 0;
    return;
  }
  const dx = s.vx / speed;
  const dy = s.vy / speed;
  const k = (ctx.rollA + ctx.rollB * speed) * g + Math.sqrt(ax * ax + ay * ay);
  if (Math.abs(ax * dy - ay * dx) <= world.params.thresholds.alignTol * k) {
    ctx.fixed = true;
    ctx.fdx = dx;
    ctx.fdy = dy;
    ctx.fdz = 0;
  }
}

/**
 * The largest substep that keeps a marble accurate (s):
 *
 * - near a Coulomb stop (or start), h ≤ stopRefine·|u|/|du/dt|, so each substep covers only a
 *   fraction of the remaining slip (or speed) while its direction turns;
 * - on a curved support (the rim, an edge, a corner), h ≤ curveRefine·d/|v|, where d is the
 *   radius the centre moves on, because the support's own time scale is shorter than dt.
 */
function stepLimit(world: World, ctx: Ctx, s: Dyn, f: Dyn): number {
  const solver = world.params.solver;
  const sup = ctx.support;
  let limit = Infinity;
  if (sup !== null && isCurved(sup) && ctx.mode !== 'air') {
    const gm = curvedGeometry(ctx, s, geoScratch);
    const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    if (v > 0) limit = (solver.curveRefine * gm.dist) / v;
    if (ctx.fixed) return limit;
    if (ctx.mode === 'slide') {
      if (ctx.slaved) return limit;
      // Each substep may turn the slip direction by at most stopRefine: h ≤ α·|u|/(k + |c|),
      // with k = (7/2)·muS·N/m the friction rate and c the slip's rate without friction.
      const u = curvedSlip(ctx, s, slipScratch);
      const n = Math.max(0, supportNormalForce(ctx, s));
      const k = (3.5 * ctx.muS * n) / ctx.m;
      const c = (3.5 * rollingFrictionNeeded(ctx, s)) / ctx.m;
      const rate = k + c;
      return rate > 0 ? Math.min(limit, (solver.stopRefine * u) / rate) : limit;
    }
  }
  if (ctx.fixed) return limit;
  if (ctx.mode === 'slide') {
    const ux = s.vx - ctx.r * s.wy;
    const uy = s.vy + ctx.r * s.wx;
    const dux = f.vx - ctx.r * f.wy;
    const duy = f.vy + ctx.r * f.wx;
    const rate = Math.sqrt(dux * dux + duy * duy);
    const u = Math.sqrt(ux * ux + uy * uy);
    // p: how hard the side force turns the slip, against the friction rate k = (7/2)·muS·g.
    const side = Math.abs(dux * (uy / u) - duy * (ux / u));
    const alpha = stopFraction(solver.stopRefine, side / (3.5 * ctx.muS * ctx.g));
    return Math.min(limit, (alpha * u) / rate);
  }
  if (ctx.mode === 'roll') {
    const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    const a = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz);
    if (!(a > 0)) return limit;
    const side = Math.abs(f.vx * s.vy - f.vy * s.vx) / v;
    const k = (ctx.rollA + ctx.rollB * v) * ctx.g;
    const alpha = stopFraction(solver.stopRefine, k > 0 ? side / k : 1);
    return Math.min(limit, (alpha * v) / a);
  }
  return limit;
}

/**
 * The fraction of the remaining slip (or speed) one substep may use near a Coulomb stop. A side
 * force of drag's size (p < DRAG_SIDE: a slip not parallel to the velocity) barely turns the
 * direction, and halving per substep is accurate; a real side force (a slope) needs the fine
 * refinement (ADR-0006).
 */
function stopFraction(stopRefine: number, p: number): number {
  return p < DRAG_SIDE ? 0.5 : stopRefine;
}

/** Side-force ratio below which a stop needs no fine refinement (–). */
const DRAG_SIDE = 1e-3;

// ---------------------------------------------------------------------------------------------
// Probes

function buildProbes(world: World, body: Body, ctx: Ctx, probes: Probe[]): number {
  let n = 0;
  const add = (code: number, arg: number): void => {
    const p = probes[n];
    if (p === undefined) probes.push({ code, arg });
    else {
      p.code = code;
      p.arg = arg;
    }
    n += 1;
  };
  const sup = ctx.support;
  const court = world.court;
  // A frozen direction on a plane ends at a root of the slip (or speed) along it. A restart from
  // zero is the opposite case: the slip grows, so there is no stop to find.
  const curved = sup !== null && isCurved(sup);
  if (ctx.mode === 'slide' && ctx.fixed && !curved && !ctx.restart) add(PROBE.slideStop, 0);
  if (ctx.mode === 'slide' && ctx.slaved) add(PROBE.slaveStop, 0);
  if (ctx.mode === 'roll' && ctx.fixed && !curved && !ctx.restart) add(PROBE.rollStop, 0);
  if (ctx.sgnWz !== 0) add(PROBE.spinStop, 0);
  if (ctx.mode === 'spin') return n;
  if (ctx.mode === 'roll') {
    // A breakpoint matters only where the law changes: neighbours with the same line are one.
    const segs = world.surface.muR.segments;
    const seg = defined(segs[body.rollSeg], 'rolling segment');
    const up = segs[body.rollSeg + 1];
    const down = segs[body.rollSeg - 1];
    if (up !== undefined && (up.a !== seg.a || up.b !== seg.b)) add(PROBE.segUp, 0);
    if (down !== undefined && (down.a !== seg.a || down.b !== seg.b)) add(PROBE.segDown, 0);
  }
  add(PROBE.outXMin, 0);
  add(PROBE.outXMax, 0);
  add(PROBE.outYMin, 0);
  add(PROBE.outYMax, 0);
  if (sup === null) return n;
  switch (sup.kind) {
    case 'base':
      if (court.heightfield !== undefined) {
        add(PROBE.cellXLo, 0);
        add(PROBE.cellXHi, 0);
        add(PROBE.cellYLo, 0);
        add(PROBE.cellYHi, 0);
      }
      if (court.hole !== undefined) add(PROBE.holeEnter, 0);
      break;
    case 'top':
      sup.block.edges.forEach((_, k) => {
        add(PROBE.topLeave, k);
      });
      break;
    case 'floor':
      break;
    case 'rim':
      add(PROBE.rimOut, 0);
      add(PROBE.rimDown, 0);
      add(PROBE.takeOff, 0);
      if (ctx.mode === 'roll') add(PROBE.rollSlip, 0);
      break;
    case 'edge':
      add(PROBE.edgeA, 0);
      add(PROBE.edgeB, 0);
      add(PROBE.edgeTop, 0);
      add(PROBE.edgeDown, 0);
      add(PROBE.takeOff, 0);
      if (ctx.mode === 'roll') add(PROBE.rollSlip, 0);
      break;
    case 'corner':
      add(PROBE.corner1, 0);
      add(PROBE.corner2, 0);
      add(PROBE.cornerDown, 0);
      add(PROBE.takeOff, 0);
      if (ctx.mode === 'roll') add(PROBE.rollSlip, 0);
      break;
  }
  return n;
}

/** The value of a probe at state s (positive until the event). */
function probeValue(world: World, body: Body, ctx: Ctx, p: Probe, s: Dyn): number {
  const court = world.court;
  const b = court.bounds;
  switch (p.code) {
    case PROBE.slideStop:
      return (s.vx - ctx.r * s.wy) * ctx.fdx + (s.vy + ctx.r * s.wx) * ctx.fdy;
    case PROBE.rollStop:
      return s.vx * ctx.fdx + s.vy * ctx.fdy + s.vz * ctx.fdz;
    case PROBE.spinStop:
      return s.wz * ctx.sgnWz;
    case PROBE.segUp: {
      const seg = defined(world.surface.muR.segments[body.rollSeg], 'rolling segment');
      return seg.x1 - Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    }
    case PROBE.segDown: {
      const seg = defined(world.surface.muR.segments[body.rollSeg], 'rolling segment');
      return Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) - seg.x0;
    }
    case PROBE.cellXLo:
    case PROBE.cellXHi:
    case PROBE.cellYLo:
    case PROBE.cellYHi: {
      const hf = defined(court.heightfield, 'heightfield');
      if (p.code === PROBE.cellXLo) {
        return body.cellI === 0 ? Infinity : s.x - (hf.x0 + body.cellI * hf.cell);
      }
      if (p.code === PROBE.cellXHi) {
        return body.cellI === hf.nx - 2 ? Infinity : hf.x0 + (body.cellI + 1) * hf.cell - s.x;
      }
      if (p.code === PROBE.cellYLo) {
        return body.cellJ === 0 ? Infinity : s.y - (hf.y0 + body.cellJ * hf.cell);
      }
      return body.cellJ === hf.ny - 2 ? Infinity : hf.y0 + (body.cellJ + 1) * hf.cell - s.y;
    }
    case PROBE.outXMin:
      return s.x - b.xMin;
    case PROBE.outXMax:
      return b.xMax - s.x;
    case PROBE.outYMin:
      return s.y - b.yMin;
    case PROBE.outYMax:
      return b.yMax - s.y;
    case PROBE.holeEnter: {
      const hole = defined(court.hole, 'hole');
      return holeRadial(hole, s.x, s.y) - hole.rc;
    }
    case PROBE.topLeave: {
      const sup = expectKind(ctx.support, 'top', 'support');
      const e = defined(sup.block.edges[p.arg], 'block edge');
      return -((s.x - e.ax) * e.ox + (s.y - e.ay) * e.oy);
    }
    case PROBE.rimOut: {
      const hole = defined(court.hole, 'hole');
      return hole.rc - holeRadial(hole, s.x, s.y);
    }
    case PROBE.rimDown:
      return s.z - defined(court.hole, 'hole').zc;
    case PROBE.edgeA:
    case PROBE.edgeB:
    case PROBE.edgeTop:
    case PROBE.edgeDown: {
      const e = expectKind(ctx.support, 'edge', 'support').edge;
      const t = (s.x - e.ax) * e.dx + (s.y - e.ay) * e.dy;
      if (p.code === PROBE.edgeA) return t;
      if (p.code === PROBE.edgeB) return e.length - t;
      if (p.code === PROBE.edgeTop) return (s.x - e.ax) * e.ox + (s.y - e.ay) * e.oy;
      return s.z - e.z;
    }
    case PROBE.corner1:
    case PROBE.corner2:
    case PROBE.cornerDown: {
      const c = expectKind(ctx.support, 'corner', 'support').corner;
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      if (p.code === PROBE.corner1) return dx * -c.o1y + dy * c.o1x;
      if (p.code === PROBE.corner2) return -(dx * -c.o2y + dy * c.o2x);
      return s.z - c.z;
    }
    case PROBE.slaveStop: {
      const f = rollingFrictionNeeded(ctx, s, force);
      curvedSlip(ctx, s, slipScratch);
      // u·ĉ with ĉ = −F/|F|.
      return f === 0
        ? 0
        : -(slipScratch.x * force.x + slipScratch.y * force.y + slipScratch.z * force.z) / f;
    }
    case PROBE.takeOff:
      return supportNormalForce(ctx, s);
    case PROBE.rollSlip:
      return ctx.muS * supportNormalForce(ctx, s) - rollingFrictionNeeded(ctx, s);
    default:
      throw new PhysicsError('internal', `probe ${String(p.code)}`);
  }
}

const interp = newDyn();

/**
 * Root of a probe inside a piece, given g(t0) > 0 >= g(t1): regula falsi with the Illinois
 * modification, falling back to bisection when the secant stalls. Returns the end of the final
 * bracket on the event side (g <= 0), within a few ulps of the root.
 */
function probeRoot(
  world: World,
  body: Body,
  ctx: Ctx,
  p: Probe,
  pc: Piece,
  g0: number,
  g1: number,
): number {
  let a = pc.t0;
  let b = pc.t1;
  let ga = g0;
  let gb = g1;
  let side = 0;
  const iterations = world.params.solver.rootIterations;
  for (let i = 0; i < iterations; i += 1) {
    if (b - a <= 4 * Number.EPSILON * b) break;
    let t = b - (gb * (b - a)) / (gb - ga);
    if (!(t > a && t < b)) t = 0.5 * (a + b);
    if (!(t > a && t < b)) break;
    const gt = probeValue(world, body, ctx, p, stateAt(pc, t, interp));
    if (gt > 0) {
      a = t;
      ga = gt;
      if (side === -1) gb /= 2;
      side = -1;
    } else {
      b = t;
      gb = gt;
      if (side === 1) ga /= 2;
      side = 1;
      if (gt === 0) break;
    }
  }
  return b;
}

const posScratch = { x: 0, y: 0, z: 0 };
const rateScratch = { x: 0, y: 0, z: 0 };

/** Conservative advancement on the hole circle inside a piece (a position probe, Lipschitz 1). */
function holeRoot(world: World, pc: Piece): number {
  const hole = defined(world.court.hole, 'hole');
  const bound = speedBound(pc);
  if (bound === 0) return Infinity;
  let t = pc.t0;
  const iterations = world.params.solver.advanceIterations;
  const tol = world.params.thresholds.gapTol;
  for (let i = 0; i < iterations; i += 1) {
    positionAt(pc, t, posScratch);
    const g = holeRadial(hole, posScratch.x, posScratch.y) - hole.rc;
    if (g <= tol) {
      // Newton polish towards the crossing from the outside.
      positionRateAt(pc, t, rateScratch);
      const rx = (posScratch.x - hole.cx) / (g + hole.rc);
      const ry = (posScratch.y - hole.cy) / (g + hole.rc);
      const rate = rx * rateScratch.x + ry * rateScratch.y;
      if (rate < 0) return Math.min(pc.t1, t - g / rate);
      return Infinity;
    }
    t += g / bound;
    if (t > pc.t1) return Infinity;
  }
  // The advancement stalled (a near-tangent pass): bisect between the last point outside and the
  // end of the piece, if the end is inside.
  positionAt(pc, pc.t1, posScratch);
  if (holeRadial(hole, posScratch.x, posScratch.y) - hole.rc > 0) return Infinity;
  let lo = t;
  let hi = pc.t1;
  for (let i = 0; i < iterations; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (!(mid > lo && mid < hi)) break;
    positionAt(pc, mid, posScratch);
    if (holeRadial(hole, posScratch.x, posScratch.y) - hole.rc > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Earliest probe event of one member inside its piece, written into `out`; true if found. */
function firstProbe(
  world: World,
  body: Body,
  ctx: Ctx,
  probes: readonly Probe[],
  count: number,
  pc: Piece,
  out: InternalEvent,
): boolean {
  let found = false;
  for (let i = 0; i < count; i += 1) {
    const p = defined(probes[i], 'probe');
    let t: number;
    if (p.code === PROBE.holeEnter) {
      t = holeRoot(world, pc);
    } else {
      const g0 = probeValue(world, body, ctx, p, pc.s0);
      const g1 = probeValue(world, body, ctx, p, pc.s1);
      if (!(g0 > 0)) {
        // Starting on or past the boundary: an event now if still heading out, else none. A
        // support that cannot push (N <= 0) or grip lets go at once, whatever the trend.
        if (!(g1 < g0) && p.code !== PROBE.takeOff && p.code !== PROBE.rollSlip) continue;
        t = pc.t0;
      } else {
        if (g1 > 0) continue;
        t = probeRoot(world, body, ctx, p, pc, g0, g1);
      }
    }
    if (t <= pc.t1 && (!found || t < out.t)) {
      out.t = t;
      out.code = p.code;
      out.arg = p.arg;
      out.hold = null;
      found = true;
    }
  }
  return found;
}

/** A marble taking part in a group advance, with its RK4 scratch. */
interface Member {
  body: Body;
  track: Track;
  readonly ctx: Ctx;
  moving: boolean;
  readonly s: Dyn;
  readonly f: Dyn;
  readonly k2: Dyn;
  readonly k3: Dyn;
  readonly k4: Dyn;
  readonly tmp: Dyn;
  readonly probes: Probe[];
  probeCount: number;
}

const memberPool: Member[] = [];

function member(i: number, body: Body, track: Track): Member {
  let m = memberPool[i];
  if (m === undefined) {
    m = {
      body,
      track,
      ctx: newCtx(),
      moving: false,
      s: newDyn(),
      f: newDyn(),
      k2: newDyn(),
      k3: newDyn(),
      k4: newDyn(),
      tmp: newDyn(),
      probes: [],
      probeCount: 0,
    };
    memberPool.push(m);
  }
  m.body = body;
  m.track = track;
  return m;
}

const holdGeo = newHoldGeo();
const gIn: Dyn[] = [];
const gOut: Dyn[] = [];

/**
 * The group's derivative: each member's own derivative, then the hold forces that keep held
 * gaps from closing (projected Gauss–Seidel when there are several).
 */
function groupDerivative(
  world: World,
  members: readonly Member[],
  count: number,
  holds: readonly Hold[],
): void {
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    const sIn = defined(gIn[i], 'stage state');
    const fOut = defined(gOut[i], 'stage rate');
    if (m.moving) derivative(m.ctx, sIn, fOut);
    else zeroRates(fOut);
  }
  if (holds.length === 0) return;
  if (holds.length > 1 && holds.length <= MAX_EXACT && exactHolds(world, members, count, holds))
    return;
  const sweeps = holds.length > 1 ? world.params.solver.heldSweeps : 1;
  const lambda = holdLambda;
  lambda.length = holds.length;
  lambda.fill(0);
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    holds.forEach((h, hi) => {
      const k = holdRow(world, members, count, h);
      if (k === 0) return;
      const old = defined(lambda[hi], 'lambda');
      const next = Math.max(0, old - (rowAn + rowGeo.c) / k);
      const d = next - old;
      lambda[hi] = next;
      if (d !== 0) pushHold(members, count, h, d);
    });
  }
}

const rowGeo = newHoldGeo();
let rowAn = 0;

/**
 * For one hold at the group's current stage (states gIn, rates gOut): its normal and curvature
 * (rowGeo), the gap's current acceleration along the normal (rowAn), and the response of that
 * acceleration to a unit hold force (returned; 0 when nothing can move).
 */
function holdRow(world: World, members: readonly Member[], count: number, h: Hold): number {
  const ia = indexOf(members, count, h.a);
  const ib = h.b === null ? -1 : indexOf(members, count, h.b);
  const ma = defined(members[ia], 'held member');
  const mb = ib < 0 ? null : defined(members[ib], 'held member');
  const sa = defined(gIn[ia], 'stage state');
  const sb = ib < 0 ? null : defined(gIn[ib], 'stage state');
  const fa = defined(gOut[ia], 'stage rate');
  const fb = ib < 0 ? null : defined(gOut[ib], 'stage rate');
  const ta = trueState(ma.ctx, ma.moving, sa, trueA);
  const tb = mb === null || sb === null ? null : trueState(mb.ctx, mb.moving, sb, trueB);
  const geo = holdGeometry(world, h, ta, tb, rowGeo);
  if (!geo.valid) return 0;
  const { nx, ny, nz } = geo;
  trueAccel(ma.ctx, ma.moving, sa, fa, accA);
  rowAn = accA.x * nx + accA.y * ny + accA.z * nz;
  if (mb !== null && sb !== null && fb !== null) {
    trueAccel(mb.ctx, mb.moving, sb, fb, accB);
    rowAn -= accB.x * nx + accB.y * ny + accB.z * nz;
  }
  return (
    responseAlong(ma.ctx, ma.moving, sa, nx, ny, nz) +
    (mb === null || sb === null ? 0 : responseAlong(mb.ctx, mb.moving, sb, nx, ny, nz))
  );
}

/** Apply a hold force d along the hold's normal (rowGeo must be current for h). */
function pushHold(members: readonly Member[], count: number, h: Hold, d: number): void {
  const ia = indexOf(members, count, h.a);
  const ib = h.b === null ? -1 : indexOf(members, count, h.b);
  const ma = defined(members[ia], 'held member');
  const { nx, ny, nz } = rowGeo;
  respond(
    ma.ctx,
    ma.moving,
    defined(gIn[ia], 'stage state'),
    defined(gOut[ia], 'stage rate'),
    d * nx,
    d * ny,
    d * nz,
  );
  if (ib >= 0) {
    const mb = defined(members[ib], 'held member');
    respond(
      mb.ctx,
      mb.moving,
      defined(gIn[ib], 'stage state'),
      defined(gOut[ib], 'stage rate'),
      -d * nx,
      -d * ny,
      -d * nz,
    );
  }
}

const rateCopy: Dyn[] = [];

/**
 * Several holds at once, solved exactly as an LCP on the gaps' accelerations:
 * w = (a_n + c) + A·λ ≥ 0, λ ≥ 0, λ·w = 0, with A measured by applying unit hold forces.
 * Returns false when no active set fits (the caller falls back to Gauss–Seidel).
 */
function exactHolds(
  world: World,
  members: readonly Member[],
  count: number,
  holds: readonly Hold[],
): boolean {
  const n = holds.length;
  for (let i = 0; i < count; i += 1) {
    let c = rateCopy[i];
    if (c === undefined) {
      c = newDyn();
      rateCopy.push(c);
    }
    copyDyn(c, defined(gOut[i], 'stage rate'));
  }
  const restoreRates = (): void => {
    for (let i = 0; i < count; i += 1)
      copyDyn(defined(gOut[i], 'stage rate'), defined(rateCopy[i], 'copy'));
  };
  const q: number[] = [];
  for (const h of holds) {
    holdRow(world, members, count, h);
    q.push(rowAn + rowGeo.c);
  }
  const a = holds.map(() => new Array<number>(n).fill(0));
  holds.forEach((hj, j) => {
    holdRow(world, members, count, hj);
    pushHold(members, count, hj, 1);
    holds.forEach((hi, i) => {
      holdRow(world, members, count, hi);
      defined(a[i], 'row')[j] = rowAn + rowGeo.c - defined(q[i], 'q');
    });
    restoreRates();
  });
  const lambda = solveLcp(a, q, 1e-12);
  if (lambda === null) return false;
  holds.forEach((h, i) => {
    const l = defined(lambda[i], 'lambda');
    if (l <= 0) return;
    holdRow(world, members, count, h);
    pushHold(members, count, h, l);
  });
  return true;
}

const trueA = newDyn();
const trueB = newDyn();

/**
 * Held contacts that turn (a pair rolling round each other, a marble circling the hole's wall)
 * limit the substep like a curved support: h ≤ curveRefine/ω with ω = √(|c|/d).
 */
function holdLimit(
  world: World,
  members: readonly Member[],
  count: number,
  holds: readonly Hold[],
): number {
  let limit = Infinity;
  for (const h of holds) {
    const ia = indexOf(members, count, h.a);
    const ib = h.b === null ? -1 : indexOf(members, count, h.b);
    const ma = defined(members[ia], 'held member');
    const mb = ib < 0 ? null : defined(members[ib], 'held member');
    const ta = trueState(ma.ctx, ma.moving, ma.s, trueA);
    const tb = mb === null ? null : trueState(mb.ctx, mb.moving, mb.s, trueB);
    const geo = holdGeometry(world, h, ta, tb, holdGeo);
    if (!geo.valid || geo.c === 0 || !Number.isFinite(geo.radius)) continue;
    limit = Math.min(
      limit,
      world.params.solver.curveRefine * Math.sqrt(geo.radius / Math.abs(geo.c)),
    );
  }
  return limit;
}
const accA = { x: 0, y: 0, z: 0 };
const accB = { x: 0, y: 0, z: 0 };

const holdLambda: number[] = [];

/** A held contact whose gap opens past this has let go (m). */
const HOLD_GAP = 1e-9;

function indexOf(members: readonly Member[], count: number, b: Body): number {
  for (let i = 0; i < count; i += 1) if (defined(members[i], 'member').body === b) return i;
  throw new PhysicsError('internal', 'held marble outside its group');
}

/** The force a hold needs at the members' states sIn (rates from their own derivatives), N. */
function holdNeed(world: World, members: readonly Member[], count: number, h: Hold): number {
  const ia = indexOf(members, count, h.a);
  const ib = h.b === null ? -1 : indexOf(members, count, h.b);
  const ma = defined(members[ia], 'held member');
  const mb = ib < 0 ? null : defined(members[ib], 'held member');
  const fa = defined(gOut[ia], 'stage rate');
  const fb = ib < 0 ? null : defined(gOut[ib], 'stage rate');
  if (ma.moving) derivative(ma.ctx, defined(gIn[ia], 'stage state'), fa);
  else zeroRates(fa);
  if (mb !== null && fb !== null) {
    if (mb.moving) derivative(mb.ctx, defined(gIn[ib], 'stage state'), fb);
    else zeroRates(fb);
  }
  return holdNeedWithRates(world, members, count, h);
}

/** The force a hold needs given the members' current rates in gOut (N); > 0 is pressing. */
function holdNeedWithRates(
  world: World,
  members: readonly Member[],
  count: number,
  h: Hold,
): number {
  const ia = indexOf(members, count, h.a);
  const ib = h.b === null ? -1 : indexOf(members, count, h.b);
  const ma = defined(members[ia], 'held member');
  const mb = ib < 0 ? null : defined(members[ib], 'held member');
  const sa = defined(gIn[ia], 'stage state');
  const sb = ib < 0 ? null : defined(gIn[ib], 'stage state');
  const fa = defined(gOut[ia], 'stage rate');
  const fb = ib < 0 ? null : defined(gOut[ib], 'stage rate');
  const ta = trueState(ma.ctx, ma.moving, sa, trueA);
  const tb = mb === null || sb === null ? null : trueState(mb.ctx, mb.moving, sb, trueB);
  const geo = holdGeometry(world, h, ta, tb, holdGeo);
  if (!geo.valid) return 0;
  // A hold whose surfaces have parted is over, whatever force it would need.
  if (geo.gap > HOLD_GAP) return -1;
  const { nx, ny, nz } = geo;
  trueAccel(ma.ctx, ma.moving, sa, fa, accA);
  let an = accA.x * nx + accA.y * ny + accA.z * nz;
  if (mb !== null && sb !== null && fb !== null) {
    trueAccel(mb.ctx, mb.moving, sb, fb, accB);
    an -= accB.x * nx + accB.y * ny + accB.z * nz;
  }
  const k =
    responseAlong(ma.ctx, ma.moving, sa, nx, ny, nz) +
    (mb === null || sb === null ? 0 : responseAlong(mb.ctx, mb.moving, sb, nx, ny, nz));
  return k === 0 ? 0 : -(an + geo.c) / k;
}

const interpGroup: Dyn[] = [];

/** The hold's need at time t inside the group's current pieces. */
function holdNeedAt(
  world: World,
  members: readonly Member[],
  count: number,
  h: Hold,
  t: number,
): number {
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    let st = interpGroup[i];
    if (st === undefined) {
      st = newDyn();
      interpGroup.push(st);
    }
    const pc = defined(m.track.pieces[m.track.count - 1], 'piece');
    stateAt(pc, t, st);
    gIn[i] = st;
    gOut[i] = m.tmp;
  }
  return holdNeed(world, members, count, h);
}

/** Earliest hold release among the group's holds inside [t0, t1]; true if found. */
function firstRelease(
  world: World,
  members: readonly Member[],
  count: number,
  holds: readonly Hold[],
  t0: number,
  t1: number,
  out: InternalEvent,
): boolean {
  let found = false;
  for (const h of holds) {
    const g0 = holdNeedAt(world, members, count, h, t0);
    const g1 = holdNeedAt(world, members, count, h, t1);
    let t: number;
    if (!(g0 > 0)) {
      if (!(g1 <= g0)) continue;
      t = t0;
    } else {
      if (g1 > 0) continue;
      let a = t0;
      let b = t1;
      for (let i = 0; i < world.params.solver.rootIterations; i += 1) {
        const mid = 0.5 * (a + b);
        if (!(mid > a && mid < b)) break;
        if (holdNeedAt(world, members, count, h, mid) > 0) a = mid;
        else b = mid;
      }
      t = b;
    }
    if (!found || t < out.t) {
      out.t = t;
      out.code = PROBE.release;
      out.arg = 0;
      out.hold = h;
      out.body = h.a;
      found = true;
    }
  }
  return found;
}

/** RK4 over the whole group from the members' s (with rates f) over h, into the pieces' s1. */
function groupRk4(
  world: World,
  members: readonly Member[],
  count: number,
  holds: readonly Hold[],
  h: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    axpy(m.tmp, m.s, h / 2, m.f);
    gIn[i] = m.tmp;
    gOut[i] = m.k2;
  }
  groupDerivative(world, members, count, holds);
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    axpy(m.tmp, m.s, h / 2, m.k2);
    gOut[i] = m.k3;
  }
  groupDerivative(world, members, count, holds);
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    axpy(m.tmp, m.s, h, m.k3);
    gOut[i] = m.k4;
  }
  groupDerivative(world, members, count, holds);
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    const pc = defined(m.track.pieces[m.track.count - 1], 'piece');
    if (m.moving) {
      rk4Combine(pc.s1, m.s, h, m.f, m.k2, m.k3, m.k4);
      finishState(world, m.body, m.ctx, pc.s1);
    } else {
      copyDyn(pc.s1, m.s);
    }
    gIn[i] = pc.s1;
    gOut[i] = pc.f1;
  }
  groupDerivative(world, members, count, holds);
}

/** After an RK4 step: planes pin z to the ground; every value must be finite. */
function finishState(world: World, body: Body, ctx: Ctx, out: Dyn): void {
  if (ctx.mode !== 'air' && ctx.support !== null && isPlane(ctx.support)) {
    out.z = planeLevel(world, body, out.x, out.y) + body.r;
    out.vz = 0;
  }
  assertFinite(
    `marble ${String(body.id)} state`,
    out.x,
    out.y,
    out.z,
    out.vx,
    out.vy,
    out.vz,
    out.wx,
    out.wy,
    out.wz,
  );
}

const evScratch: InternalEvent = { t: 0, code: 0, arg: 0, hold: null, body: null };
const evBest: InternalEvent = { t: 0, code: 0, arg: 0, hold: null, body: null };
const groupMembers: Member[] = [];

/**
 * Advance a group of marbles (one marble, or marbles joined by holds) by up to `span` seconds,
 * stopping at the first internal event of any member or hold. Fills each member's track with its
 * substep pieces and end state, and returns the event (or null). The marbles are not changed.
 */
export function advanceGroup(
  world: World,
  bodies: readonly Body[],
  tracks: readonly Track[],
  holds: readonly Hold[],
  span: number,
): InternalEvent | null {
  const count = bodies.length;
  groupMembers.length = count;
  let anyMoving = false;
  for (let i = 0; i < count; i += 1) {
    const b = defined(bodies[i], 'group body');
    const tr = defined(tracks[i], 'group track');
    const m = member(i, b, tr);
    groupMembers[i] = m;
    tr.count = 0;
    tr.event = null;
    copyDyn(m.s, b.s);
    // A marble at rest (the common case late in a shot) needs no context at all.
    m.moving = span > 0 && !b.done && b.motion !== 'resting' && prepareCtx(world, b, m.s, m.ctx);
    tr.moving = m.moving;
    if (m.moving) anyMoving = true;
  }
  const members = groupMembers;
  if (!anyMoving) {
    for (const m of members) {
      const p = piece(m.track);
      p.t0 = 0;
      p.t1 = span;
      copyDyn(p.s0, m.s);
      copyDyn(p.s1, m.s);
      zeroRates(p.f0);
      zeroRates(p.f1);
      copyDyn(m.track.end, m.s);
    }
    return null;
  }
  const solver = world.params.solver;
  const th = world.params.thresholds;
  let t = 0;
  let n = 0;
  let event: InternalEvent | null = null;
  for (let i = 0; i < count; i += 1) {
    const m = defined(members[i], 'member');
    gIn[i] = m.s;
    gOut[i] = m.f;
  }
  groupDerivative(world, members, count, holds);
  for (;;) {
    n += 1;
    world.metrics.substeps += 1;
    if (n > solver.maxSubsteps) {
      world.metrics.substepCapHits += 1;
      evBest.t = t;
      evBest.code = PROBE.substepCap;
      evBest.arg = 0;
      evBest.hold = null;
      let owner: Member | undefined;
      for (const m of members) if (owner === undefined && m.moving) owner = m;
      evBest.body = defined(owner, 'moving member').body;
      event = evBest;
      break;
    }
    let h =
      holds.length === 0 ? span - t : Math.min(span - t, holdLimit(world, members, count, holds));
    for (const m of members) {
      if (!m.moving) continue;
      m.probeCount = buildProbes(world, m.body, m.ctx, m.probes);
      h = Math.min(h, stepLimit(world, m.ctx, m.s, m.f));
      // A restart from zero slip or speed takes a short first substep (ADR-0006).
      if (m.ctx.restart) h = Math.min(h, solver.stopRefine * world.params.dt);
    }
    for (const m of members) {
      const pc = piece(m.track);
      pc.t0 = t;
      pc.t1 = t + h;
      copyDyn(pc.s0, m.s);
      copyDyn(pc.f0, m.f);
    }
    groupRk4(world, members, count, holds, h);
    let found = false;
    for (const m of members) {
      if (!m.moving) continue;
      const pc = defined(m.track.pieces[m.track.count - 1], 'piece');
      if (firstProbe(world, m.body, m.ctx, m.probes, m.probeCount, pc, evScratch)) {
        if (!found || evScratch.t < evBest.t) {
          evBest.t = evScratch.t;
          evBest.code = evScratch.code;
          evBest.arg = evScratch.arg;
          evBest.hold = null;
          evBest.body = m.body;
          found = true;
        }
      }
    }
    if (holds.length > 0 && firstRelease(world, members, count, holds, t, t + h, evScratch)) {
      if (!found || evScratch.t < evBest.t) {
        evBest.t = evScratch.t;
        evBest.code = evScratch.code;
        evBest.arg = 0;
        evBest.hold = evScratch.hold;
        evBest.body = evScratch.body;
        found = true;
      }
    }
    if (found) {
      if (evBest.t < t + h) {
        // Re-integrate from the substep's start to the event, so the event state is RK4's.
        for (const m of members) {
          const pc = defined(m.track.pieces[m.track.count - 1], 'piece');
          pc.t1 = evBest.t;
        }
        groupRk4(world, members, count, holds, evBest.t - t);
      }
      event = evBest;
      for (const m of members) copyDyn(m.s, defined(m.track.pieces[m.track.count - 1], 'piece').s1);
      break;
    }
    t += h;
    let stopped: Member | undefined;
    for (const m of members) {
      const pc = defined(m.track.pieces[m.track.count - 1], 'piece');
      copyDyn(m.s, pc.s1);
      copyDyn(m.f, pc.f1);
      if (
        m.moving &&
        stopped === undefined &&
        stopReached(m.ctx, pc.s0, pc.s1, th.uStop, th.vStop)
      ) {
        stopped = m;
      }
    }
    if (stopped !== undefined) {
      evBest.t = t;
      evBest.code = PROBE.stopReached;
      evBest.arg = 0;
      evBest.hold = null;
      evBest.body = stopped.body;
      event = evBest;
      break;
    }
    if (t >= span) break;
    // Rebuild the contexts: frozen directions and spin signs may change between substeps.
    let still = false;
    for (let i = 0; i < count; i += 1) {
      const m = defined(members[i], 'member');
      if (m.moving) m.moving = prepareCtx(world, m.body, m.s, m.ctx);
      if (m.moving) still = true;
      gIn[i] = m.s;
      gOut[i] = m.f;
    }
    if (!still) break;
    groupDerivative(world, members, count, holds);
  }
  for (const m of members) copyDyn(m.track.end, m.s);
  if (event !== null) {
    const owner = members.find((m) => m.body === event.body);
    if (owner !== undefined) {
      const e = owner.track.eventStore;
      e.t = event.t;
      e.code = event.code;
      e.arg = event.arg;
      e.hold = event.hold;
      e.body = event.body;
      owner.track.event = e;
      return e;
    }
  }
  return null;
}

/** The force a new or existing hold needs at the marbles' current states (N); > 0 is pressing. */
export function holdNeedNow(
  world: World,
  h: Hold,
  bodies: readonly Body[],
  holds: readonly Hold[],
): number {
  // The whole group the new hold would join, with its existing holds acting: a marble squeezed
  // between a wall and a held partner needs the wall only because of the partner's push.
  const count = bodies.length;
  for (let i = 0; i < count; i += 1) {
    const b = defined(bodies[i], 'group body');
    let tr = needTracks[i];
    if (tr === undefined) {
      tr = newTrack();
      needTracks.push(tr);
    }
    const m = member(i, b, tr);
    copyDyn(m.s, b.s);
    m.moving = !b.done && b.motion !== 'resting' && prepareCtx(world, b, m.s, m.ctx);
    gIn[i] = m.s;
    gOut[i] = m.f;
  }
  groupDerivative(world, memberPool, count, holds);
  return holdNeedWithRates(world, memberPool, count, h);
}

const needTracks: Track[] = [];

/** The constant track of a marble that does not move during the span. */
export function restTrack(body: Body, track: Track, span: number): void {
  track.count = 0;
  track.event = null;
  track.moving = false;
  const p = piece(track);
  p.t0 = 0;
  p.t1 = span;
  copyDyn(p.s0, body.s);
  copyDyn(p.s1, body.s);
  zeroRates(p.f0);
  zeroRates(p.f1);
  copyDyn(track.end, body.s);
}

/** Advance one marble on its own (a group of one, no holds). */
export function advance(world: World, body: Body, span: number, track: Track): Track {
  advanceGroup(world, [body], [track], [], span);
  return track;
}

function zeroRates(f: Dyn): void {
  f.x = 0;
  f.y = 0;
  f.z = 0;
  f.vx = 0;
  f.vy = 0;
  f.vz = 0;
  f.wx = 0;
  f.wy = 0;
  f.wz = 0;
  f.eSlide = 0;
  f.eRoll = 0;
  f.eSpin = 0;
  f.eDrag = 0;
}

/** Squared tangential slip of a sliding marble at state s, on a plane or curved support. */
function slip2(ctx: Ctx, s: Dyn): number {
  const sup = ctx.support;
  if (sup !== null && isCurved(sup)) {
    const gm = curvedGeometry(ctx, s, geoScratch);
    let ux = s.vx - ctx.r * (s.wy * gm.nz - s.wz * gm.ny);
    let uy = s.vy - ctx.r * (s.wz * gm.nx - s.wx * gm.nz);
    let uz = s.vz - ctx.r * (s.wx * gm.ny - s.wy * gm.nx);
    const un = ux * gm.nx + uy * gm.ny + uz * gm.nz;
    ux -= un * gm.nx;
    uy -= un * gm.ny;
    uz -= un * gm.nz;
    return ux * ux + uy * uy + uz * uz;
  }
  const ux = s.vx - ctx.r * s.wy;
  const uy = s.vy + ctx.r * s.wx;
  return ux * ux + uy * uy;
}

/**
 * A refined Coulomb stop is reached when the slip (sliding) or speed (rolling) has shrunk below
 * its threshold during the substep. A slip or speed growing from zero is not a stop.
 */
function stopReached(ctx: Ctx, s0: Dyn, s1: Dyn, uStop: number, vStop: number): boolean {
  if (ctx.slaved || (ctx.fixed && !ctx.restart)) return false;
  if (ctx.mode === 'slide') {
    const u1 = slip2(ctx, s1);
    return u1 < uStop * uStop && u1 < slip2(ctx, s0);
  }
  if (ctx.mode === 'roll') {
    // Shrinking below vStop, or held there (a restart that something stops at once).
    const v1 = s1.vx * s1.vx + s1.vy * s1.vy + s1.vz * s1.vz;
    return v1 < vStop * vStop && v1 <= s0.vx * s0.vx + s0.vy * s0.vy + s0.vz * s0.vz;
  }
  return false;
}
