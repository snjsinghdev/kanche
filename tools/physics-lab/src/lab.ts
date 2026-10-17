/**
 * The Physics Lab (Phase 1 prompt, "Physics Lab"): run one scenario and lay out what happened, for
 * people tuning the physics and for the calibration tools. Platform-free; src/cli.ts does the
 * files.
 */
import {
  deriveParams,
  PARAMS_V1,
  PhysicsError,
  simulateShot,
  type EnergyLedger,
  type ParamOverrides,
  type PhysicsParams,
  type ShotResult,
  type ShotSetup,
} from '@kanche/physics';

/** A scenario file: a shot setup, optionally with parameter overrides. */
export interface Scenario extends ShotSetup {
  readonly description?: string;
  readonly params?: ParamOverrides;
}

export interface LabOutput {
  readonly result: ShotResult;
  /** physicsVersion, hash, duration, metrics and the event log. */
  readonly events: object;
  /** The energy ledger, with the residual relative to the energy the shot converts. */
  readonly ledger: EnergyLedger & { readonly relativeResidual: number };
  /** One row per marble per keyframe. */
  readonly csv: string;
}

const SCENARIO_KEYS = ['description', 'court', 'marbles', 'shot', 'params'];

/** Check a parsed scenario file's shape; the simulation validates the rest. */
export function parseScenario(json: unknown): Scenario {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new PhysicsError('invalid-input', 'a scenario must be a JSON object');
  }
  for (const key of Object.keys(json)) {
    if (!SCENARIO_KEYS.includes(key)) {
      throw new PhysicsError('invalid-input', `a scenario has no key "${key}"`);
    }
  }
  const s = json as Partial<Scenario>;
  if (s.court === undefined || !Array.isArray(s.marbles)) {
    throw new PhysicsError('invalid-input', 'a scenario needs a court and a marbles array');
  }
  return s as Scenario;
}

/** The parameters a scenario runs with: v1, then the scenario's overrides, then extra ones. */
export function scenarioParams(scenario: Scenario, extra?: ParamOverrides): PhysicsParams {
  let p = PARAMS_V1;
  if (scenario.params !== undefined) p = deriveParams(p, scenario.params);
  if (extra !== undefined) p = deriveParams(p, extra);
  return p;
}

export const CSV_HEADER = [
  't',
  'id',
  'motion',
  'x',
  'y',
  'z',
  'vx',
  'vy',
  'vz',
  'speed',
  'slip',
  'wx',
  'wy',
  'wz',
  'spin',
].join(',');

const ON_GROUND = new Set(['sliding', 'rolling', 'spinning', 'resting']);

/**
 * The timeline as CSV (SI units). `speed` is |v| and `spin` is |ω|; `slip` is |u|, the speed of
 * the marble's lowest point over the ground, v + ω × (−r·ẑ): exact on flat ground and block tops,
 * the small-slope value on slopes, and only indicative on the rim and edges, where the contact
 * is not at the lowest point. It is empty while the marble is not on the ground.
 */
export function timelineCsv(result: ShotResult, setup: ShotSetup, params: PhysicsParams): string {
  const radius = new Map(setup.marbles.map((m) => [m.id, params.radius[m.size]]));
  const rows = [CSV_HEADER];
  for (const tl of result.timeline ?? []) {
    const r = radius.get(tl.id) ?? NaN;
    for (const k of tl.keyframes) {
      const ux = k.vx - r * k.wy;
      const uy = k.vy + r * k.wx;
      const slip = ON_GROUND.has(k.motion) ? String(Math.sqrt(ux * ux + uy * uy)) : '';
      rows.push(
        [
          k.t,
          tl.id,
          k.motion,
          k.x,
          k.y,
          k.z,
          k.vx,
          k.vy,
          k.vz,
          Math.sqrt(k.vx * k.vx + k.vy * k.vy + k.vz * k.vz),
          slip,
          k.wx,
          k.wy,
          k.wz,
          Math.sqrt(k.wx * k.wx + k.wy * k.wy + k.wz * k.wz),
        ].join(','),
      );
    }
  }
  return `${rows.join('\n')}\n`;
}

/** Run a scenario with its parameters (and any extra overrides). */
export function runLab(scenario: Scenario, extra?: ParamOverrides): LabOutput {
  const params = scenarioParams(scenario, extra);
  const setup: ShotSetup =
    scenario.shot === undefined
      ? { court: scenario.court, marbles: scenario.marbles }
      : { court: scenario.court, marbles: scenario.marbles, shot: scenario.shot };
  const result = simulateShot(setup, { params, timeline: true });
  const L = result.ledger;
  const scale = L.initialKinetic + Math.abs(L.initialPotential - L.finalPotential);
  return {
    result,
    events: {
      physicsVersion: result.physicsVersion,
      hash: result.hash,
      duration: result.duration,
      metrics: result.metrics,
      final: result.final,
      events: result.events,
    },
    ledger: { ...L, relativeResidual: scale === 0 ? 0 : L.residual / scale },
    csv: timelineCsv(result, setup, params),
  };
}
