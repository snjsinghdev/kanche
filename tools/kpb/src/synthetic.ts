/**
 * The synthetic starter dataset: shots simulated with known coefficients (SYNTHETIC_TRUTH, which
 * differ from v1), with realistic repeat scatter in the launches and in the coefficients
 * themselves, and tracking noise on every frame, and then imported through the same path as
 * filmed footage (recordingFromTracks). It
 * proves the fitters and the scorer, never the physics: the dataset is flagged synthetic, and
 * KPB's reality gate stays open until real footage replaces it (docs/kpb.md).
 *
 * Reproducible: randomness is the seeded createRng, and the noise is Irwin–Hall (a sum of twelve
 * uniforms), so the file does not depend on any engine's Math.log or Math.cos.
 */
import {
  createRng,
  deriveParams,
  PARAMS_V1,
  simulateShot,
  type CourtSpec,
  type FlickInput,
  type MarbleInit,
  type ParamOverrides,
  type PhysicsParams,
  type Rng,
  type ShotResult,
  type SizeClass,
} from '@kanche/physics';

import { DATASET_SCHEMA, type Dataset, type Recording, type RecordingKind } from './dataset.ts';
import { recordingFromTracks, type TrackedMarble, type TrackerTrack } from './tracker.ts';
import { sampleShot } from './track.ts';

export const SYNTHETIC_TRUTH: ParamOverrides = {
  dragCoefficient: 0.45,
  surfaces: {
    cement: { muS: 0.32, muR: 0.0095 },
    tile: { muS: 0.27, muR: 0.0068 },
    dirt: { muS: 0.42, muR: 0.028 },
  },
  glass: { e: { x: [0.3, 2.5], y: [0.95, 0.89] }, mu: 0.065 },
  flick: { fingerMass: 0.0055, fingerRestitution: 0.55 },
};

/** Repeat scatter of a launch off the ramp: speed (relative), direction (rad), position (m). */
const SPEED_SCATTER = 0.03;
const ANGLE_SCATTER = 0.2 * (Math.PI / 180);
const POSITION_SCATTER = 0.001;
/**
 * Tracking noise per coordinate per frame (m): a close-up framing (about 1 m of ground in frame)
 * for slides, impacts, banks, the hole and flicks, and a wide one (about 6 m) for long rolls.
 * Positions are kept to 0.1 mm.
 */
const NOISE = { close: 0.00015, wide: 0.0005 } as const;
const PRECISION = 1e-4;
/**
 * Natural variation from repeat to repeat (relative standard deviations): the ground under one
 * roll is not quite the ground under the next, and no two impacts are alike. It is what makes
 * real scatter larger than tracking noise, and the fits must find the coefficients' means.
 */
const VARIATION = { muR: 0.04, muS: 0.03, e: 0.01, mu: 0.05, fingerMass: 0.05 } as const;
/** Measurement noise on a fingertip's tracked speed (relative). */
const FINGER_NOISE = 0.01;
/** Tracking continues this long after the last marble stops (s). */
const TAIL = 0.3;

const REPEATS = 5;

/** A standard normal deviate, approximately: twelve uniforms minus six. */
function gauss(rng: Rng): number {
  let s = 0;
  for (let i = 0; i < 12; i += 1) s += rng.nextFloat();
  return s - 6;
}

interface Shot {
  readonly condition: string;
  readonly kind: RecordingKind;
  readonly court: CourtSpec;
  readonly shooter: {
    readonly id: number;
    readonly size: SizeClass;
    readonly x: number;
    readonly y: number;
  };
  readonly others?: readonly {
    readonly id: number;
    readonly size: SizeClass;
    readonly x: number;
    readonly y: number;
  }[];
  readonly launch: 'rolling' | 'stun';
  readonly speed: number;
  readonly angle: number;
  readonly fps: number;
  /** The longest the shot is tracked for (s). */
  readonly maxTime: number;
  /** A central flick at this finger setting (0–1000) instead of a set launch. */
  readonly flick?: number;
}

const open = (surface: CourtSpec['surface'], size = 15): CourtSpec => ({
  surface,
  bounds: { xMin: -1, xMax: size, yMin: -2, yMax: 2 },
});
const R80 = PARAMS_V1.radius.r80;

function shots(): Shot[] {
  const out: Shot[] = [];
  const shooter = { id: 1, size: 'r80' as const, x: 0, y: 0 };
  const rolls = [
    ['cement', 0.6],
    ['cement', 1.0],
    ['tile', 0.6],
    ['tile', 1.0],
    ['dirt', 0.8],
  ] as const;
  for (const [surface, speed] of rolls) {
    {
      out.push({
        condition: `roll ${surface} ${speed.toFixed(1)} m/s`,
        kind: 'roll',
        court: open(surface),
        shooter,
        launch: 'rolling',
        speed,
        angle: 0,
        fps: 30,
        maxTime: 15,
      });
    }
  }
  for (const [surface, speed] of [
    ['cement', 1.2],
    ['tile', 1.2],
    ['dirt', 1.0],
  ] as const) {
    out.push({
      condition: `stun ${surface} ${speed.toFixed(1)} m/s`,
      kind: 'stun',
      court: open(surface),
      shooter,
      launch: 'stun',
      speed,
      angle: 0,
      fps: 120,
      maxTime: surface === 'dirt' ? 4 : 1.5,
    });
  }
  for (const speed of [0.5, 1.0, 2.0]) {
    out.push({
      condition: `head-on cement ${speed.toFixed(1)} m/s`,
      kind: 'head-on',
      court: open('cement'),
      shooter,
      others: [{ id: 2, size: 'r80', x: 0.25, y: 0 }],
      launch: 'rolling',
      speed,
      angle: 0,
      fps: 240,
      maxTime: 0.25 / speed + 0.6,
    });
  }
  for (const cut of [30, 45]) {
    const b = 2 * R80 * Math.sin((cut * Math.PI) / 180);
    out.push({
      condition: `cut cement ${String(cut)}°`,
      kind: 'cut',
      court: open('cement'),
      shooter,
      // A cut needs a long filmed approach: the aim is measured from it, and a cut magnifies
      // any error in the aim about tenfold (docs/physics-calibration.md).
      others: [{ id: 2, size: 'r80', x: 0.3, y: b }],
      launch: 'rolling',
      speed: 0.7,
      angle: 0,
      fps: 240,
      maxTime: 1.2,
    });
  }
  out.push({
    condition: 'bank tile 45°',
    kind: 'bank',
    court: { ...open('tile', 3), walls: [{ x1: -1, y1: 0.25, x2: 3, y2: 0.25 }] },
    shooter,
    launch: 'rolling',
    speed: 1.0,
    angle: Math.PI / 4,
    fps: 120,
    maxTime: 1.2,
  });
  const hole = { x: 0.3, y: 0, radius: 0.03, depth: 0.02, rimRadius: 0.004 };
  // In, on the capture boundary (so repeats split), and out.
  for (const offset of [0, 0.8, 1.0]) {
    out.push({
      condition: `hole dirt offset ${offset.toFixed(1)} 1.0 m/s`,
      kind: 'hole',
      court: { ...open('dirt', 2), hole },
      shooter: { ...shooter, y: offset * hole.radius },
      launch: 'rolling',
      speed: 1.0,
      angle: 0,
      fps: 120,
      maxTime: 2,
    });
  }
  for (const size of ['r80', 'r95', 'r110'] as const) {
    for (const setting of [300, 700]) {
      out.push({
        condition: `flick ${size} ${String(setting)}`,
        kind: 'flick',
        court: open('cement'),
        shooter: { ...shooter, size },
        launch: 'stun',
        speed: 0,
        angle: 0,
        fps: 240,
        maxTime: 0.15,
        flick: setting,
      });
    }
  }
  return out;
}

/** The time the last marble stops (or the shot's last event) (s). */
function settled(r: ShotResult): number {
  return r.duration;
}

function noisyTrack(
  rng: Rng,
  fps: number,
  noise: number,
  x: readonly number[],
  y: readonly number[],
): TrackerTrack {
  const round = (v: number): number => Math.round(v / PRECISION) * PRECISION;
  return {
    name: null,
    fps,
    t0: 0,
    x: x.map((v) => round(v + noise * gauss(rng))),
    y: y.map((v) => round(v + noise * gauss(rng))),
  };
}

/** The coefficients one repeat really had: the truth, varied as VARIATION says (if at all). */
function varied(rng: Rng, surface: CourtSpec['surface'], variation: boolean): PhysicsParams {
  const t = SYNTHETIC_TRUTH;
  if (!variation) return deriveParams(PARAMS_V1, t);
  const sv = t.surfaces?.[surface];
  const e = t.glass?.e;
  const scale = (v: number, rel: number): number => v * (1 + rel * gauss(rng));
  const ef = 1 + VARIATION.e * gauss(rng);
  return deriveParams(PARAMS_V1, {
    ...t,
    surfaces: {
      ...t.surfaces,
      [surface]: {
        ...sv,
        muS: scale(sv?.muS ?? PARAMS_V1.surfaces[surface].muS, VARIATION.muS),
        muR: scale(Number(sv?.muR ?? 0), VARIATION.muR),
      },
    },
    glass: {
      e:
        typeof e === 'object' ? { x: e.x, y: e.y.map((v) => Math.min(1, v * ef)) } : Number(e) * ef,
      mu: scale(Number(t.glass?.mu ?? 0), VARIATION.mu),
    },
    flick: {
      ...t.flick,
      fingerMass: scale(t.flick?.fingerMass ?? 0, VARIATION.fingerMass),
    },
  });
}

function repeat(shot: Shot, k: number, rng: Rng, variation: boolean): Recording {
  const truth = varied(rng, shot.court.surface, variation);
  const s = shot.shooter;
  const x0 = s.x + POSITION_SCATTER * gauss(rng);
  const y0 = s.y + POSITION_SCATTER * gauss(rng);
  const r = truth.radius[s.size];
  let result: ShotResult;
  let fingerSpeed: number | undefined;
  const others: MarbleInit[] = (shot.others ?? []).map((m) => ({
    id: m.id,
    size: m.size,
    x: m.x,
    y: m.y,
  }));
  if (shot.flick !== undefined) {
    const setting = Math.round(shot.flick * (1 + SPEED_SCATTER * gauss(rng)));
    const flick: FlickInput = { dirX: 1000, dirY: 0, fingerSpeed: setting, spin: 0, side: 0 };
    const f = truth.flick;
    const vF = f.fingerSpeedMin + ((f.fingerSpeedMax - f.fingerSpeedMin) * setting) / 1000;
    fingerSpeed = vF * (1 + FINGER_NOISE * gauss(rng));
    result = simulateShot(
      {
        court: shot.court,
        marbles: [{ id: s.id, size: s.size, x: x0, y: y0 }],
        shot: { marbleId: s.id, flick },
      },
      { params: truth, timeline: true },
    );
  } else {
    const speed = shot.speed * (1 + SPEED_SCATTER * gauss(rng));
    const angle = shot.angle + ANGLE_SCATTER * gauss(rng);
    const vx = speed * Math.cos(angle);
    const vy = speed * Math.sin(angle);
    const spin = shot.launch === 'rolling' ? { wx: -vy / r, wy: vx / r } : {};
    result = simulateShot(
      {
        court: shot.court,
        marbles: [{ id: s.id, size: s.size, x: x0, y: y0, vx, vy, ...spin }, ...others],
      },
      { params: truth, timeline: true },
    );
  }
  const frames = Math.floor(Math.min(shot.maxTime, settled(result) + TAIL) * shot.fps) + 1;
  const ids = [s.id, ...others.map((m) => m.id)];
  const sizes = new Map([
    [s.id, s.size],
    ...(shot.others ?? []).map((m) => [m.id, m.size] as const),
  ]);
  const template: Recording = {
    id: '',
    condition: shot.condition,
    kind: shot.kind,
    fps: shot.fps,
    court: shot.court,
    marbles: [],
    shooter: s.id,
    launch: shot.launch,
    vx: 0,
    vy: 0,
    tracks: ids.map((id) => ({ id, t0: 0, x: new Array<number>(frames).fill(0), y: [] })),
  };
  const sampled = sampleShot(result, template);
  const tracked: TrackedMarble[] = sampled.map((t) => ({
    id: t.id,
    size: sizes.get(t.id) ?? 'r80',
    track: noisyTrack(rng, shot.fps, NOISE[shot.kind === 'roll' ? 'wide' : 'close'], t.x, t.y),
  }));
  const [first, ...rest] = tracked;
  if (first === undefined) throw new Error('no shooter track');
  return recordingFromTracks({
    id: `${shot.condition} #${String(k + 1)}`,
    condition: shot.condition,
    kind: shot.kind,
    court: shot.court,
    launch: shot.launch,
    shooter: first,
    others: rest,
    ...(fingerSpeed === undefined ? {} : { fingerSpeed: Math.round(fingerSpeed * 1e4) / 1e4 }),
  });
}

export interface SyntheticOptions {
  readonly seed?: number;
  /** Vary the coefficients from repeat to repeat (default true); false leaves tracking noise only. */
  readonly variation?: boolean;
  /** Repeats of each condition (default 5, as the protocol films them). */
  readonly repeats?: number;
}

export function makeSynthetic(options: SyntheticOptions = {}): Dataset {
  const rng = createRng(options.seed ?? 20261017);
  const variation = options.variation ?? true;
  const recordings: Recording[] = [];
  for (const shot of shots()) {
    for (let k = 0; k < (options.repeats ?? REPEATS); k += 1) {
      recordings.push(repeat(shot, k, rng, variation));
    }
  }
  return {
    schema: DATASET_SCHEMA,
    synthetic: true,
    description:
      'SYNTHETIC. Generated by tools/kpb from the simulation with SYNTHETIC_TRUTH, not filmed. ' +
      'It exercises the fitters and the scorer only; it is no evidence about real marbles.',
    truth: SYNTHETIC_TRUTH,
    recordings,
  };
}
