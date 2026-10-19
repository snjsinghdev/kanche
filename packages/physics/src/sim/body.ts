/**
 * The simulation's internal marble: constants derived once from its size, the RK4 state with its
 * ledger terms, its motion state and what supports it.
 */

import type { BlockModel, CornerFeature, EdgeFeature } from '../court.ts';
import type { PhysicsParams, SizeClass } from '../params/types.ts';
import type { MotionState } from '../state.ts';
import { newDyn, type Dyn } from './dyn.ts';

/**
 * What a grounded marble rests on. Planes use the small-slope ground model; the rim, edges and
 * corners are curved supports with an exact contact constraint (docs/physics.md).
 */
export type Support =
  | { readonly kind: 'base' }
  | { readonly kind: 'top'; readonly block: BlockModel }
  | { readonly kind: 'floor' }
  | { readonly kind: 'rim' }
  | { readonly kind: 'edge'; readonly edge: EdgeFeature }
  | { readonly kind: 'corner'; readonly corner: CornerFeature };

export const BASE: Support = Object.freeze({ kind: 'base' });
export const FLOOR: Support = Object.freeze({ kind: 'floor' });
export const RIM: Support = Object.freeze({ kind: 'rim' });

export function isPlane(s: Support): boolean {
  return s.kind === 'base' || s.kind === 'top' || s.kind === 'floor';
}

export interface Body {
  readonly id: number;
  readonly size: SizeClass;
  /** Radius (m). */
  readonly r: number;
  /** Mass, ρ·(4/3)·π·r³ (kg). */
  readonly m: number;
  /** Moment of inertia of a solid sphere, (2/5)·m·r² (kg·m²). */
  readonly inertia: number;
  /** Drag constant over mass, cD/m with cD = ½·ρAir·Cd·π·r² (1/m). */
  readonly dragK: number;
  /** The authoritative state plus the ledger terms. */
  readonly s: Dyn;
  motion: MotionState;
  /** null while airborne, pocketed or out. */
  support: Support | null;
  /** Sum of impact impulses (N·s), visual only. */
  wear: number;
  /** The heightfield cell in use on the base ground, updated only by crossing events. */
  cellI: number;
  cellJ: number;
  /** The rolling-resistance table segment in use, updated only by crossing events. */
  rollSeg: number;
  /** Pocketed or out: no longer simulated. */
  done: boolean;
}

export function makeBody(id: number, size: SizeClass, params: PhysicsParams): Body {
  const r = params.radius[size];
  const m = params.glassDensity * (4 / 3) * Math.PI * r * r * r;
  const cD = 0.5 * params.airDensity * params.dragCoefficient * Math.PI * r * r;
  return {
    id,
    size,
    r,
    m,
    inertia: 0.4 * m * r * r,
    dragK: cD / m,
    s: newDyn(),
    motion: 'resting',
    support: null,
    wear: 0,
    cellI: 0,
    cellJ: 0,
    rollSeg: 0,
    done: false,
  };
}

/** Translational plus rotational kinetic energy (J). */
export function kineticEnergy(b: Body, s: Dyn = b.s): number {
  return (
    0.5 * b.m * (s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) +
    0.5 * b.inertia * (s.wx * s.wx + s.wy * s.wy + s.wz * s.wz)
  );
}

/** Gravitational potential energy relative to z = 0 (J). */
export function potentialEnergy(b: Body, g: number, s: Dyn = b.s): number {
  return b.m * g * s.z;
}
