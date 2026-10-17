/**
 * Public marble state and the motion states. The authoritative state is the centre position,
 * velocity and angular velocity, the motion state and the wear. Orientation is not part of it:
 * the renderer integrates it from the angular-velocity timeline (MECHANICS-REVIEW finding 5).
 */

import type { SizeClass } from './params/types.ts';

/** `erasableSyntaxOnly` forbids enums, so the motion states are a union with integer codes. */
export const MOTION_STATES = [
  'resting',
  'sliding',
  'rolling',
  'spinning',
  'airborne',
  'pocketed',
  'out',
] as const;
export type MotionState = (typeof MOTION_STATES)[number];

/** The code each motion state contributes to the state hash. Append only; never renumber. */
export const MOTION_CODE: Readonly<Record<MotionState, number>> = Object.freeze({
  resting: 0,
  sliding: 1,
  rolling: 2,
  spinning: 3,
  airborne: 4,
  pocketed: 5,
  out: 6,
});

export interface MarbleState {
  /** Stable integer id (uint32); hashes and tie-breaks use it. */
  readonly id: number;
  readonly size: SizeClass;
  /** Centre position (m). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Centre velocity (m/s). */
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Angular velocity (rad/s). */
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
  readonly motion: MotionState;
  /** Cumulative wear: the sum of impact impulses (N·s). Visual only, so not hashed. */
  readonly wear: number;
}

/** A marble placed for a shot. Grounded marbles get their height from the court. */
export interface MarbleInit {
  readonly id: number;
  readonly size: SizeClass;
  readonly x: number; // m
  readonly y: number; // m
  /** Only for marbles that start airborne (m). */
  readonly z?: number;
  readonly vx?: number; // m/s
  readonly vy?: number; // m/s
  readonly vz?: number; // m/s
  readonly wx?: number; // rad/s
  readonly wy?: number; // rad/s
  readonly wz?: number; // rad/s
  /** Defaults to resting, or sliding when a velocity or spin is given. */
  readonly motion?: MotionState;
  readonly wear?: number;
}
