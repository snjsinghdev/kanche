/**
 * Impacts as one multi-contact solve (Phase 1 prompt, "Impacts"; ADR-0007).
 *
 * The primary contact (marble–marble, or marble and a wall, edge, rim or ground) and the ground
 * contact of every involved marble that is supported are integrated together over the primary
 * normal impulse P, in steps of ΔP, as in Mathavan, Jackson and Parkin (2014):
 *
 * 1. the primary normal impulse along the true 3D contact normal;
 * 2. Coulomb friction at the primary contact along its slip; a contact sticks rather than
 *    reverse its slip;
 * 3. each support reacts unilaterally: it pushes only as hard as needed to stop the marble
 *    moving into it, and never pulls, so a marble can lift off;
 * 4. Coulomb friction at each support along its own slip.
 *
 * Restitution is Stronge's energetic coefficient: compression ends when the normal relative
 * velocity reaches zero, and restitution ends when the restitution work reaches e² times the
 * compression work, so an impact can never add energy. Within a step every impulse is
 * proportional to ΔP, so the normal velocity is linear in P and the final partial steps are
 * solved exactly. That makes the frictionless closed forms exact (KPB tests 3, 4, 7 and 8).
 */

import { PhysicsError } from '../errors.ts';
import type { Body } from './body.ts';
import type { Dyn } from './dyn.ts';

/** One side of the primary contact: a marble, its state and the normal of its support. */
export interface ImpactSide {
  readonly body: Body;
  readonly s: Dyn;
  /** Unit normal of the marble's support contact, or null while airborne. */
  readonly support: { nx: number; ny: number; nz: number } | null;
  /** Friction coefficient at that support (–). */
  readonly supportMu: number;
}

export interface ImpactInput {
  readonly a: ImpactSide;
  /** null when the primary contact is a static feature (infinite mass). */
  readonly b: ImpactSide | null;
  /** Unit contact normal, from b (or the feature) towards a's centre. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Restitution and friction of the primary contact (–). */
  readonly e: number;
  readonly mu: number;
  readonly steps: number;
  readonly maxSteps: number;
}

export interface ImpactOutput {
  /** Total primary normal impulse (N·s). */
  impulse: number;
  /** Normal approach speed before the impact (m/s). */
  approach: number;
  /** Kinetic energy lost, before minus after (J). */
  loss: number;
  /** Steps taken; equals maxSteps when the cap ended the impact. */
  stepsTaken: number;
  capped: boolean;
}

interface Vel {
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

function newVel(): Vel {
  return { vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
}

function loadVel(v: Vel, s: Dyn): void {
  v.vx = s.vx;
  v.vy = s.vy;
  v.vz = s.vz;
  v.wx = s.wx;
  v.wy = s.wy;
  v.wz = s.wz;
}

function storeVel(s: Dyn, v: Vel): void {
  s.vx = v.vx;
  s.vy = v.vy;
  s.vz = v.vz;
  s.wx = v.wx;
  s.wy = v.wy;
  s.wz = v.wz;
}

function copyVel(out: Vel, v: Vel): void {
  out.vx = v.vx;
  out.vy = v.vy;
  out.vz = v.vz;
  out.wx = v.wx;
  out.wy = v.wy;
  out.wz = v.wz;
}

function energy(b: Body, v: Vel): number {
  return (
    0.5 * b.m * (v.vx * v.vx + v.vy * v.vy + v.vz * v.vz) +
    0.5 * b.inertia * (v.wx * v.wx + v.wy * v.wy + v.wz * v.wz)
  );
}

/**
 * Apply an impulse (jx, jy, jz) at the point (rx, ry, rz) relative to the centre:
 * Δv = J/m and Δω = (r × J)/I.
 */
function push(
  b: Body,
  v: Vel,
  rx: number,
  ry: number,
  rz: number,
  jx: number,
  jy: number,
  jz: number,
): void {
  const im = 1 / b.m;
  const ii = 1 / b.inertia;
  v.vx += jx * im;
  v.vy += jy * im;
  v.vz += jz * im;
  v.wx += (ry * jz - rz * jy) * ii;
  v.wy += (rz * jx - rx * jz) * ii;
  v.wz += (rx * jy - ry * jx) * ii;
}

/** Velocity of the material point at offset r: v + ω × r. */
function pointVel(
  v: Vel,
  rx: number,
  ry: number,
  rz: number,
  out: { x: number; y: number; z: number },
): void {
  out.x = v.vx + (v.wy * rz - v.wz * ry);
  out.y = v.vy + (v.wz * rx - v.wx * rz);
  out.z = v.vz + (v.wx * ry - v.wy * rx);
}

/** The smallest change in normal speed one impulse step makes (m/s). */
const MIN_DV = 1e-12;

const va = newVel();
const vb = newVel();
const va0 = newVel();
const vb0 = newVel();
const pa = { x: 0, y: 0, z: 0 };
const pb = { x: 0, y: 0, z: 0 };

/**
 * Coulomb friction impulse at a contact with normal n and slip u: magnitude mu·dN against the
 * slip, but never more than stops the slip (k is the slip response per unit impulse, 1/kg).
 */
function friction(
  mu: number,
  dN: number,
  ux: number,
  uy: number,
  uz: number,
  k: number,
  out: { x: number; y: number; z: number },
): void {
  const u = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (u === 0 || mu === 0 || dN === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return;
  }
  const f = Math.min(mu * dN, u / k);
  out.x = (-f * ux) / u;
  out.y = (-f * uy) / u;
  out.z = (-f * uz) / u;
}

const fr = { x: 0, y: 0, z: 0 };

/** Support reaction and friction for one side, after the primary impulses of a step. */
function supportStep(side: ImpactSide, v: Vel): void {
  const sup = side.support;
  if (sup === null) return;
  const b = side.body;
  const vn = v.vx * sup.nx + v.vy * sup.ny + v.vz * sup.nz;
  if (!(vn < 0)) return;
  // Just enough to stop the marble moving into its support: dN = −m·(v·n). Through the centre.
  const dN = -b.m * vn;
  v.vx += sup.nx * (dN / b.m);
  v.vy += sup.ny * (dN / b.m);
  v.vz += sup.nz * (dN / b.m);
  const rx = -b.r * sup.nx;
  const ry = -b.r * sup.ny;
  const rz = -b.r * sup.nz;
  pointVel(v, rx, ry, rz, pa);
  const un = pa.x * sup.nx + pa.y * sup.ny + pa.z * sup.nz;
  friction(
    side.supportMu,
    dN,
    pa.x - un * sup.nx,
    pa.y - un * sup.ny,
    pa.z - un * sup.nz,
    3.5 / b.m,
    fr,
  );
  push(b, v, rx, ry, rz, fr.x, fr.y, fr.z);
}

/** Normal relative velocity at the primary contact, positive when separating (m/s). */
function separation(inp: ImpactInput): number {
  const a = inp.a.body;
  pointVel(va, -a.r * inp.nx, -a.r * inp.ny, -a.r * inp.nz, pa);
  let x = pa.x;
  let y = pa.y;
  let z = pa.z;
  if (inp.b !== null) {
    const b = inp.b.body;
    pointVel(vb, b.r * inp.nx, b.r * inp.ny, b.r * inp.nz, pb);
    x -= pb.x;
    y -= pb.y;
    z -= pb.z;
  }
  return x * inp.nx + y * inp.ny + z * inp.nz;
}

/** One step of normal impulse dP: primary normal, primary friction, then the supports. */
function step(inp: ImpactInput, dP: number): void {
  const { nx, ny, nz } = inp;
  const a = inp.a.body;
  const ar = a.r;
  // Slip at the primary contact, from the step's starting velocities.
  pointVel(va, -ar * nx, -ar * ny, -ar * nz, pa);
  let ux = pa.x;
  let uy = pa.y;
  let uz = pa.z;
  let k = 3.5 / a.m;
  if (inp.b !== null) {
    const b = inp.b.body;
    pointVel(vb, b.r * nx, b.r * ny, b.r * nz, pb);
    ux -= pb.x;
    uy -= pb.y;
    uz -= pb.z;
    k += 3.5 / b.m;
  }
  const un = ux * nx + uy * ny + uz * nz;
  friction(inp.mu, dP, ux - un * nx, uy - un * ny, uz - un * nz, k, fr);
  // Normal impulse plus friction on a at −R·n; the opposite on b at +R·n.
  push(a, va, -ar * nx, -ar * ny, -ar * nz, dP * nx + fr.x, dP * ny + fr.y, dP * nz + fr.z);
  if (inp.b !== null) {
    const b = inp.b.body;
    const br = b.r;
    push(b, vb, br * nx, br * ny, br * nz, -dP * nx - fr.x, -dP * ny - fr.y, -dP * nz - fr.z);
    supportStep(inp.b, vb);
  }
  supportStep(inp.a, va);
}

function restore(inp: ImpactInput): void {
  copyVel(va, va0);
  if (inp.b !== null) copyVel(vb, vb0);
}

function save(inp: ImpactInput): void {
  copyVel(va0, va);
  if (inp.b !== null) copyVel(vb0, vb);
}

/**
 * The step size δ in [0, dP] at which the work reaches `target`, when the separation runs
 * linearly from s0 to s1 over a full step: s0·δ + ½·(s1 − s0)/dP·δ² = target.
 */
function partialForWork(s0: number, s1: number, dP: number, target: number): number {
  const slope = (s1 - s0) / dP;
  if (slope === 0) return s0 > 0 ? Math.min(dP, target / s0) : dP;
  const disc = s0 * s0 + 2 * slope * target;
  const delta = (-s0 + Math.sqrt(Math.max(0, disc))) / slope;
  return Math.min(dP, Math.max(0, delta));
}

export function resolveImpact(inp: ImpactInput, out: ImpactOutput): ImpactOutput {
  const a = inp.a.body;
  loadVel(va, inp.a.s);
  if (inp.b !== null) loadVel(vb, inp.b.s);
  const before = energy(a, va) + (inp.b === null ? 0 : energy(inp.b.body, vb));
  let sn = separation(inp);
  out.approach = Math.max(0, -sn);
  out.impulse = 0;
  out.loss = 0;
  out.stepsTaken = 0;
  out.capped = false;
  if (!(sn < 0)) return out;

  const invMass = 1 / a.m + (inp.b === null ? 0 : 1 / inp.b.body.m);
  // A rounding-sized approach would make each step's change smaller than the rounding in the
  // separation itself, and the impact would never end: no step changes it by less than MIN_DV.
  const dP = Math.max(((1 + inp.e) * -sn) / invMass / inp.steps, MIN_DV / invMass);
  const e2 = inp.e * inp.e;
  let compression = true;
  let wc = 0; // compression work, ∫ −s dP (J)
  let wr = 0; // restitution work, ∫ s dP (J)
  let total = 0;
  for (let n = 0; ; n += 1) {
    if (n >= inp.maxSteps) {
      out.capped = true;
      break;
    }
    out.stepsTaken = n + 1;
    save(inp);
    const s0 = sn;
    step(inp, dP);
    let s1 = separation(inp);
    if (!Number.isFinite(s1)) throw new PhysicsError('non-finite', 'impact separation');
    if (compression) {
      if (s1 < 0) {
        wc += (dP * -(s0 + s1)) / 2;
        total += dP;
        sn = s1;
        continue;
      }
      // Compression ends inside this step, where the (linear) separation crosses zero.
      const delta = (dP * -s0) / (s1 - s0);
      restore(inp);
      step(inp, delta);
      s1 = separation(inp);
      wc += (delta * -(s0 + s1)) / 2;
      total += delta;
      sn = s1;
      compression = false;
      if (e2 === 0) break;
      continue;
    }
    const w = (dP * (s0 + s1)) / 2;
    if (wr + w < e2 * wc) {
      wr += w;
      total += dP;
      sn = s1;
      continue;
    }
    // Restitution ends inside this step, where the work reaches e²·Wc.
    const delta = partialForWork(s0, s1, dP, e2 * wc - wr);
    restore(inp);
    step(inp, delta);
    total += delta;
    break;
  }
  storeVel(inp.a.s, va);
  if (inp.b !== null) storeVel(inp.b.s, vb);
  const after = energy(a, va) + (inp.b === null ? 0 : energy(inp.b.body, vb));
  out.impulse = total;
  out.loss = before - after;
  return out;
}

export function newImpactOutput(): ImpactOutput {
  return { impulse: 0, approach: 0, loss: 0, stepsTaken: 0, capped: false };
}
