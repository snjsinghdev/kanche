/**
 * The shape of a physics parameter set. One frozen set exists per physicsVersion (params/v1);
 * tests, the Physics Lab and the KPB fitters derive variants (drag off, a halved step, a fitted
 * coefficient) with `deriveParams`, but production code always passes the frozen set for the
 * match's version.
 */

import type { Table } from './table.ts';

/** The ground surfaces the calibration protocol films (docs/physics-calibration.md). */
export const SURFACES = ['cement', 'dirt', 'tile', 'sand', 'wet-cement'] as const;
export type SurfaceId = (typeof SURFACES)[number];

/** Marble size classes by radius: the standard 8.0 mm and the 9.5 and 11.0 mm shooters. */
export const SIZE_CLASSES = ['r80', 'r95', 'r110'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export interface SurfaceParams {
  /** Sliding friction between glass and this ground (–). */
  readonly muS: number;
  /** Rolling resistance against rolling speed |v| (m/s → –); a rolling marble decelerates at muR·g. */
  readonly muR: Table;
  /** Spin friction about the contact normal (–). */
  readonly muSp: number;
  /** Restitution of a marble landing on this ground, against approach speed (m/s → –). */
  readonly e: Table;
}

/** A material pair for impacts: restitution and contact friction against approach speed (m/s). */
export interface ContactPair {
  readonly e: Table;
  readonly mu: Table;
}

export interface FlickParams {
  /** Effective finger mass (kg). */
  readonly fingerMass: number;
  /** Finger–marble restitution (–). */
  readonly fingerRestitution: number;
  /** Finger speed at fingerSpeed = 0 and 1000 (m/s). */
  readonly fingerSpeedMin: number;
  readonly fingerSpeedMax: number;
  /** Offsets beyond this fraction of R miscue (–). */
  readonly miscueLimit: number;
  /** Fraction of the impulse a miscue keeps (–). */
  readonly miscueRetain: number;
}

export interface Thresholds {
  /** Below this approach speed a contact is perfectly inelastic and held (m/s). */
  readonly vRest: number;
  /** A post-impact separation slower than this is zeroed instead of hopping (m/s). */
  readonly vHop: number;
  /** Slip below this ends sliding; the residual is removed by the exact friction impulse (m/s). */
  readonly uStop: number;
  /** Rolling speed below this ends rolling (m/s). */
  readonly vStop: number;
  /** A Coulomb force counts as aligned with its slip when |c × û| ≤ alignTol·k (–). */
  readonly alignTol: number;
  /** Conservative advancement stops when the gap is below this (m). */
  readonly gapTol: number;
}

export interface SolverParams {
  /** Normal-impulse steps an impact is integrated over (–). */
  readonly impactSteps: number;
  /** Hard cap on impact steps; reaching it ends the impact and is logged (–). */
  readonly impactMaxSteps: number;
  /** Conservative-advancement iterations before the minimum search takes over (–). */
  readonly advanceIterations: number;
  /** Bisection/Newton iterations when refining a root (–). */
  readonly rootIterations: number;
  /** Near a Coulomb stop a substep uses at most this fraction of the remaining slip (–). */
  readonly stopRefine: number;
  /** On a curved support a substep turns the contact normal by at most this angle (rad). */
  readonly curveRefine: number;
  /** Substeps one marble may take inside one step (–). */
  readonly maxSubsteps: number;
  /** Events resolved inside one step before the inelastic fallback (–). */
  readonly eventsPerStep: number;
  /** Events in one shot before everything is forced to rest (–). */
  readonly eventsPerShot: number;
  /** Gauss–Seidel sweeps for held-contact forces (–). */
  readonly heldSweeps: number;
}

export interface PhysicsParams {
  readonly version: number;
  /** Gravity (m/s²). */
  readonly g: number;
  /** Soda-lime glass density (kg/m³). */
  readonly glassDensity: number;
  /** Air density (kg/m³). */
  readonly airDensity: number;
  /** Drag coefficient of a smooth sphere (–); 0 switches drag off. */
  readonly dragCoefficient: number;
  /** Radius of each size class (m). */
  readonly radius: Readonly<Record<SizeClass, number>>;
  /** The fixed integration step (s). */
  readonly dt: number;
  /** A shot that is still moving at tMax is forced to rest and flagged (s). */
  readonly tMax: number;
  readonly surfaces: Readonly<Record<SurfaceId, SurfaceParams>>;
  /** Glass on glass. */
  readonly glass: ContactPair;
  /** Glass on a wall. */
  readonly wall: ContactPair;
  /** Glass on an edge: steps, curbs and the hole rim. */
  readonly edge: ContactPair;
  readonly flick: FlickParams;
  readonly thresholds: Thresholds;
  readonly solver: SolverParams;
  /** The lofted shot is a rule variant, off until players confirm it (Phase 1 prompt). */
  readonly allowLoft: boolean;
}
