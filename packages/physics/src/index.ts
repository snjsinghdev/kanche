export { physicsVersion } from './version.ts';
export { createRng, type Rng } from './det/rng.ts';
export { Fnv64, hashFloat64s } from './det/hash.ts';
export { determinismProbe, MAX_PROBE_STEPS, type ProbeResult } from './probe.ts';
export { PhysicsError, type PhysicsErrorCode } from './errors.ts';
export { PARAMS_V1 } from './params/v1/index.ts';
export { makeTable, tableValue, type Table, type TableData } from './params/table.ts';
export {
  SIZE_CLASSES,
  SURFACES,
  type PhysicsParams,
  type SizeClass,
  type SurfaceId,
} from './params/types.ts';
export { validateParams } from './params/validate.ts';
export {
  buildCourt,
  MAX_BLOCK_HEIGHT,
  MAX_SLOPE,
  type Court,
  type CourtSpec,
  type HoleSpec,
  type BlockSpec,
  type WallSpec,
  type HeightfieldSpec,
} from './court.ts';
export { DIRECTION_COUNT, LIFT_COUNT, liftAngle, unitVector, type Unit2 } from './directions.ts';
export { FLICK_LIMITS, flickLaunch, validateFlick, type FlickInput, type Launch } from './flick.ts';
export {
  MOTION_CODE,
  MOTION_STATES,
  type MarbleInit,
  type MarbleState,
  type MotionState,
} from './state.ts';
export type {
  EnergyLedger,
  ImpactEvent,
  Keyframe,
  MarbleTimeline,
  PhysicsEvent,
  ShotMetrics,
  ShotResult,
  TransitionEvent,
  TransitionKind,
} from './events.ts';
export { simulateShot, type ShotOptions, type ShotSetup } from './simulate.ts';
