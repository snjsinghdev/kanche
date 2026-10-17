/**
 * What a shot reports besides its final state: events for audio, effects and rules, the energy
 * ledger, the timeline the renderer plays back, and solver metrics.
 */

import type { FeatureKind } from './sim/features.ts';
import type { MarbleState, MotionState } from './state.ts';

export interface ImpactEvent {
  readonly kind: 'impact';
  /** Time from the start of the shot (s). */
  readonly t: number;
  /** The marble on the moving side of the normal. */
  readonly a: number;
  /** The other marble, or null for a static feature. */
  readonly b: number | null;
  readonly feature: FeatureKind | null;
  /** Total normal impulse (N·s); audio gain and haptics scale with it. */
  readonly impulse: number;
  /** Normal approach speed (m/s); Hertz contact time scales with it to the power −1/5. */
  readonly speed: number;
  /** Contact point (m) and normal from b (or the feature) towards a (–). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Kinetic energy lost in the impact (J). */
  readonly loss: number;
}

export type TransitionKind =
  | 'slide-roll'
  | 'roll-slide'
  | 'roll-rest'
  | 'spin-rest'
  | 'roll-start'
  | 'take-off'
  | 'hole-enter'
  | 'hole-leave'
  | 'support'
  | 'pocketed'
  | 'out';

export interface TransitionEvent {
  readonly kind: TransitionKind;
  readonly t: number; // s
  readonly id: number;
  readonly x: number; // m
  readonly y: number; // m
  readonly z: number; // m
}

export type PhysicsEvent = ImpactEvent | TransitionEvent;

/**
 * The energy ledger (J). Everything is measured against the energy at the start of the shot,
 * after the flick: initial = final + slide + roll + spin + drag + impact + removed + forced, and
 * `residual` is the difference, which is zero up to rounding when the ledger closes.
 */
export interface EnergyLedger {
  readonly initialKinetic: number;
  readonly initialPotential: number;
  readonly finalKinetic: number;
  readonly finalPotential: number;
  /** Work done by sliding friction. */
  readonly slide: number;
  /** Work done by rolling resistance. */
  readonly roll: number;
  /** Work done by spin friction. */
  readonly spin: number;
  /** Work done by air drag. */
  readonly drag: number;
  /** Kinetic energy lost in impacts. */
  readonly impact: number;
  /** Kinetic energy of marbles that were pocketed or left the court. */
  readonly removed: number;
  /** Kinetic energy removed by forcing rest (tMax or the event caps). */
  readonly forced: number;
  readonly residual: number;
}

export interface Keyframe {
  readonly t: number; // s
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
  readonly motion: MotionState;
}

/** Per-marble keyframes at every step it moved and at every event it took part in. */
export interface MarbleTimeline {
  readonly id: number;
  readonly keyframes: readonly Keyframe[];
}

export interface ShotMetrics {
  readonly steps: number;
  readonly substeps: number;
  readonly events: number;
  readonly impacts: number;
  /** Largest number of impulse steps in one impact. */
  readonly impactSteps: number;
  readonly impactCapHits: number;
  readonly substepCapHits: number;
  readonly stepCapHits: number;
  readonly shotCapHit: boolean;
  /** True when the shot reached tMax and its marbles were forced to rest. */
  readonly forcedRest: boolean;
  readonly cellCrossings: number;
  readonly tableCrossings: number;
}

export interface ShotResult {
  readonly physicsVersion: number;
  /** Simulated duration (s). */
  readonly duration: number;
  /** Final state of every marble, in id order. */
  readonly final: readonly MarbleState[];
  readonly events: readonly PhysicsEvent[];
  readonly ledger: EnergyLedger;
  readonly timeline: readonly MarbleTimeline[] | null;
  readonly metrics: ShotMetrics;
  /** 64-bit FNV-1a of the final state (hex). */
  readonly hash: string;
}
