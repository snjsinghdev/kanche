/**
 * The flick: a finger of effective mass mF strikes the marble at an offset from its centre
 * (Phase 1 prompt, "The flick"; docs/physics.md). Shooter size trade-offs come out of the impact
 * itself: a heavier shooter leaves slower but carries more momentum.
 *
 * Inputs are integers, quantised on the client and validated here; nothing is clamped silently:
 *
 * | input       | range         | meaning                                                         |
 * | ----------- | ------------- | --------------------------------------------------------------- |
 * | dirX, dirY  | int16         | aim, normalised in the simulation with sqrt; not both zero      |
 * | fingerSpeed | 0–1000        | vF from fingerSpeedMin to fingerSpeedMax                        |
 * | spin        | −600…600      | vertical strike offset b = (spin/1000)·R; positive is topspin   |
 * | side        | −300…300      | sideways offset c = (side/1000)·R; positive is left of the aim  |
 * | lift        | 0–15          | lofted shot, 3° per step; only when params.allowLoft            |
 *
 * With r = (b, c) the offset across the aim: 1/mEff = 1/m + |r|²/I,
 * J = (1 + eF)·vF/(1/mF + 1/mEff), v0 = J/m along the aim, and ω0 = (r × J)/I.
 * Offsets beyond the miscue limit slip and keep only miscueRetain of the impulse.
 */

import { liftAngle } from './directions.ts';
import { assertIntInRange, PhysicsError } from './errors.ts';
import type { PhysicsParams, SizeClass } from './params/types.ts';

export interface FlickInput {
  readonly dirX: number;
  readonly dirY: number;
  readonly fingerSpeed: number;
  readonly spin: number;
  readonly side: number;
  readonly lift?: number;
}

export interface Launch {
  readonly vx: number; // m/s
  readonly vy: number; // m/s
  readonly vz: number; // m/s
  readonly wx: number; // rad/s
  readonly wy: number; // rad/s
  readonly wz: number; // rad/s
  /** Impulse delivered by the finger (N·s). */
  readonly impulse: number;
  readonly miscue: boolean;
}

export const FLICK_LIMITS = Object.freeze({
  dir: 32767,
  fingerSpeed: 1000,
  spin: 600,
  side: 300,
});

export function validateFlick(flick: FlickInput, params: PhysicsParams): void {
  assertIntInRange('flick.dirX', flick.dirX, -FLICK_LIMITS.dir - 1, FLICK_LIMITS.dir);
  assertIntInRange('flick.dirY', flick.dirY, -FLICK_LIMITS.dir - 1, FLICK_LIMITS.dir);
  if (flick.dirX === 0 && flick.dirY === 0) {
    throw new PhysicsError('invalid-input', 'flick direction must not be (0, 0)');
  }
  assertIntInRange('flick.fingerSpeed', flick.fingerSpeed, 0, FLICK_LIMITS.fingerSpeed);
  assertIntInRange('flick.spin', flick.spin, -FLICK_LIMITS.spin, FLICK_LIMITS.spin);
  assertIntInRange('flick.side', flick.side, -FLICK_LIMITS.side, FLICK_LIMITS.side);
  const lift = flick.lift ?? 0;
  assertIntInRange('flick.lift', lift, 0, 15);
  if (lift > 0 && !params.allowLoft) {
    throw new PhysicsError('invalid-input', 'lofted shots are off in this rule set');
  }
}

/** Launch velocity and spin of a marble of the given size struck by this flick. */
export function flickLaunch(flick: FlickInput, size: SizeClass, params: PhysicsParams): Launch {
  validateFlick(flick, params);
  const fp = params.flick;
  const r = params.radius[size];
  const m = params.glassDensity * (4 / 3) * Math.PI * r * r * r;
  const inertia = 0.4 * m * r * r;
  const norm = Math.sqrt(flick.dirX * flick.dirX + flick.dirY * flick.dirY);
  const dx = flick.dirX / norm;
  const dy = flick.dirY / norm;
  const { cos, sin } = liftAngle(flick.lift ?? 0);
  // Impulse direction d' = cosβ·d + sinβ·z; ŝ = z × d points left of the aim;
  // z' = −sinβ·d + cosβ·z is "up" across the impulse.
  const jx = cos * dx;
  const jy = cos * dy;
  const jz = sin;
  const sx = -dy;
  const sy = dx;
  const zx = -sin * dx;
  const zy = -sin * dy;
  const zz = cos;
  const vF =
    fp.fingerSpeedMin + ((fp.fingerSpeedMax - fp.fingerSpeedMin) * flick.fingerSpeed) / 1000;
  const b = (flick.spin / 1000) * r;
  const c = (flick.side / 1000) * r;
  const offset2 = b * b + c * c;
  const invEff = 1 / m + offset2 / inertia;
  let j = ((1 + fp.fingerRestitution) * vF) / (1 / fp.fingerMass + invEff);
  const miscue = offset2 > fp.miscueLimit * fp.miscueLimit * r * r;
  if (miscue) j *= fp.miscueRetain;
  // ω0 = (J/I)·(b·ŝ − c·z').
  const k = j / inertia;
  return {
    vx: (j * jx) / m,
    vy: (j * jy) / m,
    vz: (j * jz) / m,
    wx: k * (b * sx - c * zx),
    wy: k * (b * sy - c * zy),
    wz: k * (-c * zz),
    impulse: j,
    miscue,
  };
}
