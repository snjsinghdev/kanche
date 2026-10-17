/**
 * Importing tracks exported from Tracker (Open Source Physics, physlets.org/tracker): File →
 * Export → Data, one point mass per file, columns t, x and y after calibrating the scale with the
 * ruler in frame (docs/physics-calibration.md). Accepted:
 *
 * - tab, comma or semicolon delimiters, and a decimal comma with tab or semicolon delimiters;
 * - a track-name line before the header, and units in the header ("t (s)", "x [cm]");
 * - frames left unmarked (empty cells), filled by linear interpolation if no gap is longer than
 *   MAX_GAP frames.
 *
 * Positions are converted to metres; frames must be evenly spaced.
 */
import type { CourtSpec, SizeClass } from '@kanche/physics';

import { DatasetError, type Recording, type RecordingKind, type Track } from './dataset.ts';
import { stateAt } from './track.ts';

export const MAX_GAP = 3;

const UNITS = { m: 1, cm: 0.01, mm: 0.001 } as const;
export type LengthUnit = keyof typeof UNITS;

export interface TrackerTrack {
  readonly name: string | null;
  readonly fps: number;
  readonly t0: number;
  readonly x: number[];
  readonly y: number[];
}

function cellName(c: string): string {
  return c
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\s*[([].*[)\]]\s*$/, '')
    .trim()
    .toLowerCase();
}

export function parseTrackerCsv(text: string, unit: LengthUnit = 'm'): TrackerTrack {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const delimiterOf = (l: string): string =>
    ['\t', ';', ','].reduce(
      (best, d) => (l.split(d).length > l.split(best).length ? d : best),
      '\t',
    );
  let header = -1;
  let delimiter = '\t';
  for (let i = 0; i < lines.length && header < 0; i += 1) {
    const l = lines[i] ?? '';
    const d = delimiterOf(l);
    const names = l.split(d).map(cellName);
    if (names.includes('t') && names.includes('x') && names.includes('y')) {
      header = i;
      delimiter = d;
    }
  }
  if (header < 0) throw new DatasetError('tracker: no header with t, x and y columns');
  const names = (lines[header] ?? '').split(delimiter).map(cellName);
  const [it, ix, iy] = ['t', 'x', 'y'].map((n) => names.indexOf(n));
  const decimalComma = delimiter !== ',';
  const num = (c: string | undefined): number => {
    const s = (c ?? '').trim().replace(/^"|"$/g, '');
    if (s === '') return NaN;
    return Number(decimalComma ? s.replace(',', '.') : s);
  };
  const rows: { t: number; x: number; y: number }[] = [];
  for (const l of lines.slice(header + 1)) {
    const cells = l.split(delimiter);
    const t = num(cells[it ?? -1]);
    if (!Number.isFinite(t)) continue;
    rows.push({ t, x: num(cells[ix ?? -1]), y: num(cells[iy ?? -1]) });
  }
  if (rows.length < 3) throw new DatasetError('tracker: fewer than three frames');
  const dts = rows
    .slice(1)
    .map((r, k) => r.t - (rows[k]?.t ?? NaN))
    .sort((a, b) => a - b);
  const dt = dts[Math.floor(dts.length / 2)] ?? NaN;
  for (const d of dts) {
    if (Math.abs(d - dt) > 1e-3 * dt)
      throw new DatasetError('tracker: frames are not evenly spaced');
  }
  // Fill unmarked frames by linear interpolation over short gaps.
  const scale = UNITS[unit];
  const x = rows.map((r) => r.x * scale);
  const y = rows.map((r) => r.y * scale);
  for (let k = 0; k < rows.length; k += 1) {
    if (Number.isFinite(x[k]) && Number.isFinite(y[k])) continue;
    const a = k - 1;
    let b = k + 1;
    while (b < rows.length && !(Number.isFinite(x[b]) && Number.isFinite(y[b]))) b += 1;
    if (a < 0 || b >= rows.length || b - a - 1 > MAX_GAP) {
      throw new DatasetError(`tracker: frame ${String(k)} is unmarked and cannot be filled`);
    }
    for (let j = k; j < b; j += 1) {
      const s = (j - a) / (b - a);
      x[j] = (x[a] ?? NaN) + s * ((x[b] ?? NaN) - (x[a] ?? NaN));
      y[j] = (y[a] ?? NaN) + s * ((y[b] ?? NaN) - (y[a] ?? NaN));
    }
    k = b;
  }
  const name = header > 0 ? (lines[header - 1] ?? '').trim() : null;
  return { name, fps: 1 / dt, t0: rows[0]?.t ?? 0, x, y };
}

export interface TrackedMarble {
  readonly id: number;
  readonly size: SizeClass;
  readonly track: TrackerTrack;
}

/**
 * How long the launch is estimated over (s): a rolling marble barely slows, so a long window
 * beats the tracking noise; a stunned one must be caught while it still slides.
 */
const LAUNCH_WINDOW = { rolling: 0.3, stun: 0.06 } as const;
/** Frames kept clear of the first moment another marble moves (–). */
const LAUNCH_GUARD = 3;
/** Displacement that counts as a marble having started to move (m). */
const MOVED = 0.0015;
/** Frames averaged for the position of a marble at rest (–). */
const REST_FRAMES = 10;

/**
 * A recording from tracked marbles: the shooter's position and launch velocity come from a
 * quadratic fit to its first frames, up to LAUNCH_WINDOW and never past the moment another
 * marble starts to move; every other marble's position from its first frames.
 */
export function recordingFromTracks(input: {
  readonly id: string;
  readonly condition: string;
  readonly kind: RecordingKind;
  readonly court: CourtSpec;
  readonly launch: 'rolling' | 'stun';
  readonly shooter: TrackedMarble;
  readonly others?: readonly TrackedMarble[];
  readonly fingerSpeed?: number;
  readonly notes?: string;
}): Recording {
  const all = [input.shooter, ...(input.others ?? [])];
  const fps = input.shooter.track.fps;
  for (const m of all) {
    if (Math.abs(m.track.fps - fps) > 1e-6 * fps)
      throw new DatasetError('tracks differ in frame rate');
  }
  const t0 = input.shooter.track.t0;
  const tracks: Track[] = all.map((m) => ({
    id: m.id,
    t0: m.track.t0 - t0,
    x: m.track.x,
    y: m.track.y,
  }));
  const shooterTrack = tracks[0] as Track;
  let span: number = LAUNCH_WINDOW[input.launch];
  for (const t of tracks.slice(1)) {
    const x0 = t.x[0] ?? NaN;
    const y0 = t.y[0] ?? NaN;
    const k = t.x.findIndex((x, i) => Math.hypot(x - x0, (t.y[i] ?? NaN) - y0) > MOVED);
    if (k >= 0) span = Math.min(span, (k - LAUNCH_GUARD) / fps + t.t0 - shooterTrack.t0);
  }
  const launch = stateAt(
    shooterTrack,
    fps,
    shooterTrack.t0,
    shooterTrack.t0,
    shooterTrack.t0 + span,
  );
  const marbles = all.map((m, i) => {
    if (i === 0) return { id: m.id, size: m.size, x: launch.x, y: launch.y };
    const n = Math.min(REST_FRAMES, m.track.x.length);
    const mean = (v: readonly number[]): number => v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    return { id: m.id, size: m.size, x: mean(m.track.x), y: mean(m.track.y) };
  });
  return {
    id: input.id,
    condition: input.condition,
    kind: input.kind,
    fps,
    court: input.court,
    marbles,
    shooter: input.shooter.id,
    launch: input.launch,
    vx: launch.vx,
    vy: launch.vy,
    ...(input.fingerSpeed === undefined ? {} : { fingerSpeed: input.fingerSpeed }),
    tracks,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}
