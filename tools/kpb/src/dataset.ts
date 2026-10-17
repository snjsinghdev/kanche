/**
 * The KPB dataset (KPB v1 test 15; docs/kpb.md): filmed shots, tracked to positions in metres,
 * grouped into conditions of repeats. Each recording carries the shot's measured launch, so the
 * simulation can replay it, and the tracks of every marble in it.
 *
 * Hand-validated: the dataset is data, and a malformed one must fail loudly before any fit.
 */
import type { CourtSpec, MarbleInit, ParamOverrides, SizeClass } from '@kanche/physics';

export const DATASET_SCHEMA = 'kanche-kpb-dataset/1';

/** What a recording shows, which sets the metrics it is scored on and the fits it feeds. */
export const RECORDING_KINDS = ['roll', 'stun', 'head-on', 'cut', 'bank', 'hole', 'flick'] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

/** One tracked marble: positions (m) at times t0 + k/fps (s). */
export interface Track {
  readonly id: number;
  readonly t0: number;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

export interface Recording {
  readonly id: string;
  /** Repeats of one shot share a condition; their spread is the real-world scatter. */
  readonly condition: string;
  readonly kind: RecordingKind;
  /** Rate the tracks are sampled at (Hz); the footage itself may be faster. */
  readonly fps: number;
  readonly court: CourtSpec;
  /** Every marble at the first frame, at rest except the shooter. */
  readonly marbles: readonly MarbleInit[];
  /** The marble that is launched. */
  readonly shooter: number;
  /** How it was launched: rolling off a ramp, or stunned (sliding with no spin). */
  readonly launch: 'rolling' | 'stun';
  /** The shooter's launch velocity measured from the first frames (m/s). */
  readonly vx: number;
  readonly vy: number;
  /** Flicks: the fingertip's speed at contact, tracked separately (m/s). */
  readonly fingerSpeed?: number;
  readonly tracks: readonly Track[];
  readonly notes?: string;
}

export interface Dataset {
  readonly schema: typeof DATASET_SCHEMA;
  /** True for generated data: never evidence about real marbles. */
  readonly synthetic: boolean;
  readonly description: string;
  /** For a synthetic set, the parameters it was generated with (overrides of v1). */
  readonly truth?: ParamOverrides;
  readonly recordings: readonly Recording[];
}

export class DatasetError extends Error {
  override readonly name = 'DatasetError';
}

function fail(where: string, message: string): never {
  throw new DatasetError(`${where}: ${message}`);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function finite(where: string, x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(where, 'must be a finite number');
  return x;
}

const SIZES: readonly SizeClass[] = ['r80', 'r95', 'r110'];

function validateTrack(where: string, t: unknown, ids: ReadonlySet<number>): void {
  if (!isObject(t)) fail(where, 'must be an object');
  if (typeof t['id'] !== 'number' || !ids.has(t['id'])) fail(where, 'id is not a marble');
  finite(`${where}.t0`, t['t0']);
  const x = t['x'];
  const y = t['y'];
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) {
    fail(where, 'x and y must be arrays of equal length, at least 2');
  }
  x.forEach((v, i) => finite(`${where}.x[${String(i)}]`, v));
  y.forEach((v, i) => finite(`${where}.y[${String(i)}]`, v));
}

function validateRecording(where: string, r: unknown, seen: Set<string>): void {
  if (!isObject(r)) fail(where, 'must be an object');
  if (typeof r['id'] !== 'string' || r['id'] === '') fail(where, 'needs an id');
  if (seen.has(r['id'])) fail(where, `duplicate id ${r['id']}`);
  seen.add(r['id']);
  if (typeof r['condition'] !== 'string' || r['condition'] === '') fail(where, 'needs a condition');
  if (!RECORDING_KINDS.includes(r['kind'] as RecordingKind)) fail(where, 'unknown kind');
  if (finite(`${where}.fps`, r['fps']) <= 0) fail(where, 'fps must be positive');
  if (!isObject(r['court'])) fail(where, 'needs a court');
  const marbles = r['marbles'];
  if (!Array.isArray(marbles) || marbles.length === 0) fail(where, 'needs marbles');
  const ids = new Set<number>();
  marbles.forEach((m: unknown, i) => {
    const w = `${where}.marbles[${String(i)}]`;
    if (!isObject(m)) fail(w, 'must be an object');
    if (typeof m['id'] !== 'number' || ids.has(m['id'])) fail(w, 'needs a unique numeric id');
    if (!SIZES.includes(m['size'] as SizeClass)) fail(w, 'unknown size');
    finite(`${w}.x`, m['x']);
    finite(`${w}.y`, m['y']);
    ids.add(m['id']);
  });
  if (typeof r['shooter'] !== 'number' || !ids.has(r['shooter']))
    fail(where, 'shooter is not a marble');
  if (r['launch'] !== 'rolling' && r['launch'] !== 'stun') fail(where, 'launch is rolling or stun');
  finite(`${where}.vx`, r['vx']);
  finite(`${where}.vy`, r['vy']);
  if (r['kind'] === 'flick') finite(`${where}.fingerSpeed`, r['fingerSpeed']);
  const tracks = r['tracks'];
  if (!Array.isArray(tracks) || tracks.length === 0) fail(where, 'needs tracks');
  tracks.forEach((t: unknown, i) => {
    validateTrack(`${where}.tracks[${String(i)}]`, t, ids);
  });
  if (!tracks.some((t: unknown) => isObject(t) && t['id'] === r['shooter'])) {
    fail(where, "needs the shooter's track");
  }
}

/** Check a parsed dataset file; returns it typed. */
export function validateDataset(json: unknown): Dataset {
  if (!isObject(json)) fail('dataset', 'must be an object');
  if (json['schema'] !== DATASET_SCHEMA) fail('dataset', `schema must be ${DATASET_SCHEMA}`);
  if (typeof json['synthetic'] !== 'boolean') fail('dataset', 'synthetic must be true or false');
  if (typeof json['description'] !== 'string') fail('dataset', 'needs a description');
  const recordings = json['recordings'];
  if (!Array.isArray(recordings)) fail('dataset', 'needs recordings');
  const seen = new Set<string>();
  recordings.forEach((r: unknown, i) => {
    validateRecording(`recordings[${String(i)}]`, r, seen);
  });
  return json as unknown as Dataset;
}

/** The recordings grouped by condition, in first-seen order. */
export function conditions(d: Dataset): Map<string, Recording[]> {
  const out = new Map<string, Recording[]>();
  for (const r of d.recordings) {
    const list = out.get(r.condition);
    if (list === undefined) out.set(r.condition, [r]);
    else list.push(r);
  }
  return out;
}

export function trackOf(r: Recording, id: number): Track {
  const t = r.tracks.find((x) => x.id === id);
  if (t === undefined) throw new DatasetError(`${r.id}: no track for marble ${String(id)}`);
  return t;
}
