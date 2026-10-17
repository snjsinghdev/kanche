/**
 * Resting contact (Phase 1 prompt, "Events and exact timing"; MECHANICS-REVIEW finding 8).
 *
 * Two marbles, or a marble and a wall, edge or the hole's wall, that meet slower than vRest are
 * resolved as perfectly inelastic and then held in contact: instead of re-colliding forever, a
 * frictionless normal force λ keeps the gap from closing. λ is solved inside every derivative
 * evaluation from g̈ = 0, where g is the gap:
 *
 *   g̈ = n·(a_a − a_b) + c,   c = vᵀ·H·v (the gap's curvature along the motion),
 *
 * and the hold is released, as an event, when the λ it needs turns negative (the surfaces would
 * have to pull). Several holds on one marble are solved by projected Gauss–Seidel sweeps.
 *
 * A marble's response to a force through its centre depends on its mode: 1/m when sliding or
 * airborne, 5/7 of that when rolling (the ground's friction takes the rest), and none at rest
 * (a resting marble is treated as fixed). The part of the force pushing into a support is taken
 * by the support.
 */

import { defined } from '../errors.ts';
import type { Body } from './body.ts';
import { curvedGeometry, isCurved, newGeo, type Ctx } from './derivative.ts';
import { copyDyn, type Dyn } from './dyn.ts';
import { holeRadial, type StaticFeature } from './features.ts';
import type { World } from './advance.ts';

export interface Hold {
  readonly a: Body;
  /** The other marble, or null for a static feature. */
  readonly b: Body | null;
  readonly feature: StaticFeature | null;
}

/** Features a marble can be held against (supports are handled by the support model). */
export function canHold(f: StaticFeature): boolean {
  return f.kind === 'wall' || f.kind === 'pit-wall' || f.kind === 'edge' || f.kind === 'corner';
}

export interface HoldGeo {
  valid: boolean;
  nx: number;
  ny: number;
  nz: number;
  /** vᵀ·H·v: the gap's second derivative at zero acceleration (m/s²). */
  c: number;
  /** The gap itself (m). */
  gap: number;
  /** Radius the relative motion turns on, for the substep limit (m); Infinity for a plane. */
  radius: number;
}

export function newHoldGeo(): HoldGeo {
  return { valid: false, nx: 0, ny: 0, nz: 1, c: 0, gap: 0, radius: Infinity };
}

/** Normal (from b or the feature towards a) and curvature term of a hold at states sa, sb. */
export function holdGeometry(
  world: World,
  h: Hold,
  sa: Dyn,
  sb: Dyn | null,
  out: HoldGeo,
): HoldGeo {
  out.valid = true;
  if (h.b !== null) {
    const t = defined(sb, 'held partner state');
    const dx = sa.x - t.x;
    const dy = sa.y - t.y;
    const dz = sa.z - t.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const vx = sa.vx - t.vx;
    const vy = sa.vy - t.vy;
    const vz = sa.vz - t.vz;
    out.gap = d - h.a.r - h.b.r;
    return pointLike(out, dx, dy, dz, d, vx, vy, vz);
  }
  const f = defined(h.feature, 'held feature');
  switch (f.kind) {
    case 'wall': {
      const w = f.wall;
      const along = (sa.x - w.ax) * w.dx + (sa.y - w.ay) * w.dy;
      const s = Math.min(w.length, Math.max(0, along));
      const dx = sa.x - (w.ax + s * w.dx);
      const dy = sa.y - (w.ay + s * w.dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      out.gap = d - h.a.r;
      if (along > 0 && along < w.length) {
        out.nx = dx / d;
        out.ny = dy / d;
        out.nz = 0;
        out.c = 0;
        out.radius = Infinity;
        return out;
      }
      // Past an end: the wall's end is a vertical line, so only horizontal motion curves the gap.
      return pointLike(out, dx, dy, 0, d, sa.vx, sa.vy, 0);
    }
    case 'pit-wall': {
      const hole = defined(world.court.hole, 'hole');
      const rho = holeRadial(hole, sa.x, sa.y);
      const ex = (sa.x - hole.cx) / rho;
      const ey = (sa.y - hole.cy) / rho;
      const vphi = -sa.vx * ey + sa.vy * ex;
      out.gap = hole.rh - rho - h.a.r;
      out.nx = -ex;
      out.ny = -ey;
      out.nz = 0;
      out.c = -(vphi * vphi) / rho;
      out.radius = rho;
      return out;
    }
    case 'edge': {
      const e = f.edge;
      const t = (sa.x - e.ax) * e.dx + (sa.y - e.ay) * e.dy;
      const dx = sa.x - (e.ax + t * e.dx);
      const dy = sa.y - (e.ay + t * e.dy);
      const dz = sa.z - e.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      out.gap = d - h.a.r;
      const vt = sa.vx * e.dx + sa.vy * e.dy;
      return pointLike(out, dx, dy, dz, d, sa.vx - vt * e.dx, sa.vy - vt * e.dy, sa.vz);
    }
    case 'corner': {
      const c = f.corner;
      const dx = sa.x - c.x;
      const dy = sa.y - c.y;
      const dz = sa.z - c.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      out.gap = d - h.a.r;
      return pointLike(out, dx, dy, dz, d, sa.vx, sa.vy, sa.vz);
    }
    default:
      out.valid = false;
      return out;
  }
}

/** Distance to a point (or across a line): n = d/|d| and c = (|v|² − (n·v)²)/|d|. */
function pointLike(
  out: HoldGeo,
  dx: number,
  dy: number,
  dz: number,
  d: number,
  vx: number,
  vy: number,
  vz: number,
): HoldGeo {
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;
  const vn = vx * nx + vy * ny + vz * nz;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.c = (vx * vx + vy * vy + vz * vz - vn * vn) / d;
  out.radius = d;
  return out;
}

const supportGeo = newGeo();

/**
 * On a plane the state's vz is 0 by the small-slope convention, but the centre follows the
 * ground: its true vertical velocity is ∇h·v and its vertical acceleration ∇h·a + 2·cxy·vx·vy on a
 * bilinear patch. Holds measure gaps in 3D, so they use these true kinematics.
 */
export function onPlane(ctx: Ctx, moving: boolean): boolean {
  const sup = ctx.support;
  return moving && sup !== null && ctx.mode !== 'air' && !isCurved(sup);
}

/** A copy of s with its true vertical velocity, for hold geometry. */
export function trueState(ctx: Ctx, moving: boolean, s: Dyn, out: Dyn): Dyn {
  copyDyn(out, s);
  const p = ctx.patch;
  if (onPlane(ctx, moving) && p !== null) {
    out.vz = (p.cx + p.cxy * s.y) * s.vx + (p.cy + p.cxy * s.x) * s.vy;
  }
  return out;
}

/** True acceleration of a marble with rates f at state s, into out. */
export function trueAccel(
  ctx: Ctx,
  moving: boolean,
  s: Dyn,
  f: Dyn,
  out: { x: number; y: number; z: number },
): void {
  out.x = f.vx;
  out.y = f.vy;
  out.z = f.vz;
  const p = ctx.patch;
  if (onPlane(ctx, moving) && p !== null) {
    out.z = (p.cx + p.cxy * s.y) * f.vx + (p.cy + p.cxy * s.x) * f.vy + 2 * p.cxy * s.vx * s.vy;
  }
}

/**
 * Add the effect of a force (fx, fy, fz) through a marble's centre to its derivative, and return
 * the acceleration it produces along (nx, ny, nz) per unit force (the response).
 */
export function respond(
  ctx: Ctx,
  moving: boolean,
  s: Dyn,
  out: Dyn,
  fx: number,
  fy: number,
  fz: number,
): void {
  // A marble that only spins about the vertical is at rest as far as translation goes.
  if (!moving || ctx.mode === 'spin') return;
  const sup = ctx.support;
  if (sup !== null && ctx.mode !== 'air' && !isCurved(sup)) {
    // On a plane the centre moves on z = h(x, y), so a force acts through its generalised force
    // Q = F_h + F_z·∇h (virtual work F·δp with δz = ∇h·δx). Its power is then F·v, exactly.
    const p = ctx.patch;
    const gx = p === null ? 0 : p.cx + p.cxy * s.y;
    const gy = p === null ? 0 : p.cy + p.cxy * s.x;
    const k = ctx.mode === 'roll' ? 5 / 7 : 1;
    const ax = (k * (fx + fz * gx)) / ctx.m;
    const ay = (k * (fy + fz * gy)) / ctx.m;
    out.vx += ax;
    out.vy += ay;
    if (ctx.mode === 'roll') {
      out.wx -= ay / ctx.r;
      out.wy += ax / ctx.r;
    }
    return;
  }
  let ax = fx / ctx.m;
  let ay = fy / ctx.m;
  let az = fz / ctx.m;
  let k = 1;
  let snx = 0;
  let sny = 0;
  let snz = 1;
  if (sup !== null && ctx.mode !== 'air') {
    if (isCurved(sup)) {
      const gm = curvedGeometry(ctx, s, supportGeo);
      snx = gm.nx;
      sny = gm.ny;
      snz = gm.nz;
    }
    // The support takes the normal part of the force.
    const an = ax * snx + ay * sny + az * snz;
    ax -= an * snx;
    ay -= an * sny;
    az -= an * snz;
    if (ctx.mode === 'roll') k = 5 / 7;
  }
  ax *= k;
  ay *= k;
  az *= k;
  out.vx += ax;
  out.vy += ay;
  out.vz += az;
  if (ctx.mode === 'roll') {
    // Rolling: ω follows v, ω̇ += (n × Δa)/R about the support normal.
    out.wx += (sny * az - snz * ay) / ctx.r;
    out.wy += (snz * ax - snx * az) / ctx.r;
    out.wz += (snx * ay - sny * ax) / ctx.r;
  }
}

/** Response of a marble's centre acceleration along n to a unit force along n (1/kg). */
export function responseAlong(
  ctx: Ctx,
  moving: boolean,
  s: Dyn,
  nx: number,
  ny: number,
  nz: number,
): number {
  if (!moving || ctx.mode === 'spin') return 0;
  const sup = ctx.support;
  if (sup === null || ctx.mode === 'air') return 1 / ctx.m;
  const k = ctx.mode === 'roll' ? 5 / 7 : 1;
  if (!isCurved(sup)) {
    // Through the generalised force Q = n_h + n_z·∇h, and the centre then moves along
    // (Δa_h, ∇h·Δa_h): the response along n is k·|n_h + n_z·∇h|²/m.
    const p = ctx.patch;
    const qx = nx + nz * (p === null ? 0 : p.cx + p.cxy * s.y);
    const qy = ny + nz * (p === null ? 0 : p.cy + p.cxy * s.x);
    return (k * (qx * qx + qy * qy)) / ctx.m;
  }
  let snx = 0;
  let sny = 0;
  let snz = 1;
  if (isCurved(sup)) {
    const gm = curvedGeometry(ctx, s, supportGeo);
    snx = gm.nx;
    sny = gm.ny;
    snz = gm.nz;
  }
  const along = nx * snx + ny * sny + nz * snz;
  return (k * (1 - along * along)) / ctx.m;
}
