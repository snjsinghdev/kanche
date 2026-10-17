/**
 * Cubic Hermite interpolants of one substep. Every quantity is interpolated from its values and
 * time derivatives at the two ends: position from (p, v), velocity from (v, a) and spin from
 * (ω, ω̇). On drag-free flat ground the motion is polynomial and these curves are exact, which
 * is what lets the analytic suite demand exact event times (Phase 1 prompt).
 *
 * The renderer (Phase 3) interpolates the timeline with the same position curves.
 */

import type { Dyn } from './dyn.ts';

export interface Piece {
  /** Start and end, relative to the start of the current step (s). */
  t0: number;
  t1: number;
  /** State and derivative at each end. */
  readonly s0: Dyn;
  readonly f0: Dyn;
  readonly s1: Dyn;
  readonly f1: Dyn;
}

/** Value of the cubic Hermite through (a, da) at 0 and (b, db) at h, at local time t. */
export function hermite(
  a: number,
  da: number,
  b: number,
  db: number,
  h: number,
  t: number,
): number {
  const u = t / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return h00 * a + h10 * h * da + h01 * b + h11 * h * db;
}

/** Time derivative of the same curve at local time t. */
export function hermiteRate(
  a: number,
  da: number,
  b: number,
  db: number,
  h: number,
  t: number,
): number {
  const u = t / h;
  const u2 = u * u;
  const d00 = (6 * u2 - 6 * u) / h;
  const d10 = 3 * u2 - 4 * u + 1;
  const d01 = (-6 * u2 + 6 * u) / h;
  const d11 = 3 * u2 - 2 * u;
  return d00 * a + d10 * da + d01 * b + d11 * db;
}

/** Interpolated position, velocity and spin at time t inside the piece (the ledger is not). */
export function stateAt(p: Piece, t: number, out: Dyn): Dyn {
  const h = p.t1 - p.t0;
  const { s0, s1, f0, f1 } = p;
  if (h <= 0) {
    out.x = s0.x;
    out.y = s0.y;
    out.z = s0.z;
    out.vx = s0.vx;
    out.vy = s0.vy;
    out.vz = s0.vz;
    out.wx = s0.wx;
    out.wy = s0.wy;
    out.wz = s0.wz;
    return out;
  }
  const l = t - p.t0;
  out.x = hermite(s0.x, f0.x, s1.x, f1.x, h, l);
  out.y = hermite(s0.y, f0.y, s1.y, f1.y, h, l);
  out.z = hermite(s0.z, f0.z, s1.z, f1.z, h, l);
  out.vx = hermite(s0.vx, f0.vx, s1.vx, f1.vx, h, l);
  out.vy = hermite(s0.vy, f0.vy, s1.vy, f1.vy, h, l);
  out.vz = hermite(s0.vz, f0.vz, s1.vz, f1.vz, h, l);
  out.wx = hermite(s0.wx, f0.wx, s1.wx, f1.wx, h, l);
  out.wy = hermite(s0.wy, f0.wy, s1.wy, f1.wy, h, l);
  out.wz = hermite(s0.wz, f0.wz, s1.wz, f1.wz, h, l);
  return out;
}

/** Interpolated position only, into (out.x, out.y, out.z). */
export function positionAt(p: Piece, t: number, out: { x: number; y: number; z: number }): void {
  const h = p.t1 - p.t0;
  if (h <= 0) {
    out.x = p.s0.x;
    out.y = p.s0.y;
    out.z = p.s0.z;
    return;
  }
  const l = t - p.t0;
  out.x = hermite(p.s0.x, p.f0.x, p.s1.x, p.f1.x, h, l);
  out.y = hermite(p.s0.y, p.f0.y, p.s1.y, p.f1.y, h, l);
  out.z = hermite(p.s0.z, p.f0.z, p.s1.z, p.f1.z, h, l);
}

/** Rate of the interpolated position (the curve's own velocity) at time t. */
export function positionRateAt(
  p: Piece,
  t: number,
  out: { x: number; y: number; z: number },
): void {
  const h = p.t1 - p.t0;
  if (h <= 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return;
  }
  const l = t - p.t0;
  out.x = hermiteRate(p.s0.x, p.f0.x, p.s1.x, p.f1.x, h, l);
  out.y = hermiteRate(p.s0.y, p.f0.y, p.s1.y, p.f1.y, h, l);
  out.z = hermiteRate(p.s0.z, p.f0.z, p.s1.z, p.f1.z, h, l);
}

/**
 * The velocity control points of the position curve (Bernstein form). By the convex-hull
 * property the curve's speed never exceeds the largest of their lengths, which gives
 * conservative advancement a rigorous bound.
 */
export function speedBound(p: Piece): number {
  const h = p.t1 - p.t0;
  const a = Math.sqrt(p.f0.x * p.f0.x + p.f0.y * p.f0.y + p.f0.z * p.f0.z);
  const b = Math.sqrt(p.f1.x * p.f1.x + p.f1.y * p.f1.y + p.f1.z * p.f1.z);
  if (h <= 0) return Math.max(a, b);
  const mx = (3 * (p.s1.x - p.s0.x)) / h - p.f0.x - p.f1.x;
  const my = (3 * (p.s1.y - p.s0.y)) / h - p.f0.y - p.f1.y;
  const mz = (3 * (p.s1.z - p.s0.z)) / h - p.f0.z - p.f1.z;
  return Math.max(a, b, Math.sqrt(mx * mx + my * my + mz * mz));
}

/** Relative-velocity bound for two pieces covering the same interval. */
export function relativeSpeedBound(a: Piece, b: Piece): number {
  const h = a.t1 - a.t0;
  if (h <= 0 || b.t0 !== a.t0 || b.t1 !== a.t1) return speedBound(a) + speedBound(b);
  const c0x = a.f0.x - b.f0.x;
  const c0y = a.f0.y - b.f0.y;
  const c0z = a.f0.z - b.f0.z;
  const c2x = a.f1.x - b.f1.x;
  const c2y = a.f1.y - b.f1.y;
  const c2z = a.f1.z - b.f1.z;
  const c1x = (3 * (a.s1.x - a.s0.x - b.s1.x + b.s0.x)) / h - c0x - c2x;
  const c1y = (3 * (a.s1.y - a.s0.y - b.s1.y + b.s0.y)) / h - c0y - c2y;
  const c1z = (3 * (a.s1.z - a.s0.z - b.s1.z + b.s0.z)) / h - c0z - c2z;
  return Math.max(
    Math.sqrt(c0x * c0x + c0y * c0y + c0z * c0z),
    Math.sqrt(c1x * c1x + c1y * c1y + c1z * c1z),
    Math.sqrt(c2x * c2x + c2y * c2y + c2z * c2z),
  );
}

/** Axis-aligned box around the position curve, from its Bernstein control points (m). */
export function extendBox(
  p: Piece,
  box: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number },
): void {
  const h = (p.t1 - p.t0) / 3;
  const xs = [p.s0.x, p.s0.x + h * p.f0.x, p.s1.x - h * p.f1.x, p.s1.x];
  const ys = [p.s0.y, p.s0.y + h * p.f0.y, p.s1.y - h * p.f1.y, p.s1.y];
  const zs = [p.s0.z, p.s0.z + h * p.f0.z, p.s1.z - h * p.f1.z, p.s1.z];
  for (const x of xs) {
    box.xMin = Math.min(box.xMin, x);
    box.xMax = Math.max(box.xMax, x);
  }
  for (const y of ys) {
    box.yMin = Math.min(box.yMin, y);
    box.yMax = Math.max(box.yMax, y);
  }
  for (const z of zs) {
    box.zMin = Math.min(box.zMin, z);
    box.zMax = Math.max(box.zMax, z);
  }
}
