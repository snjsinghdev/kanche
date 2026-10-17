/**
 * Tracks, real and simulated: replaying a recording through the simulation, sampling its
 * timeline at the recording's frame times, and the local polynomial fits the metrics use.
 */
import {
  PARAMS_V1,
  simulateShot,
  type MarbleInit,
  type MarbleTimeline,
  type PhysicsParams,
  type ShotResult,
  type ShotSetup,
} from '@kanche/physics';

import type { Recording, Track } from './dataset.ts';

export interface Launch {
  /** Shooter speed (m/s); the recording's measured speed when omitted. */
  readonly speed?: number;
  /** Shooter direction (rad, from +x); the measured direction when omitted. */
  readonly angle?: number;
}

/** The setup that replays a recording, optionally with the shooter's launch replaced. */
export function replaySetup(
  rec: Recording,
  launch: Launch = {},
  params: PhysicsParams = PARAMS_V1,
): ShotSetup {
  const speed = launch.speed ?? Math.hypot(rec.vx, rec.vy);
  const angle = launch.angle ?? Math.atan2(rec.vy, rec.vx);
  const marbles = rec.marbles.map((m): MarbleInit => {
    if (m.id !== rec.shooter) return { id: m.id, size: m.size, x: m.x, y: m.y };
    const vx = speed * Math.cos(angle);
    const vy = speed * Math.sin(angle);
    const r = params.radius[m.size];
    return rec.launch === 'rolling'
      ? { id: m.id, size: m.size, x: m.x, y: m.y, vx, vy, wx: -vy / r, wy: vx / r }
      : { id: m.id, size: m.size, x: m.x, y: m.y, vx, vy };
  });
  return { court: rec.court, marbles };
}

/** The frame times of a track (s). */
export function times(t: Track, fps: number): number[] {
  return t.x.map((_, k) => t.t0 + k / fps);
}

/** Position of one marble at time t from its keyframes, by cubic Hermite interpolation. */
function sampleTimeline(tl: MarbleTimeline, ts: readonly number[]): { x: number[]; y: number[] } {
  const k = tl.keyframes;
  const x: number[] = [];
  const y: number[] = [];
  let i = 0;
  for (const t of ts) {
    // The last keyframe at or before t (after an event, the post-event one).
    while (i + 1 < k.length && (k[i + 1]?.t ?? Infinity) <= t) i += 1;
    const a = k[i];
    const b = k[i + 1];
    if (a === undefined) throw new Error('empty timeline');
    if (b === undefined || t <= a.t) {
      x.push(a.x);
      y.push(a.y);
      continue;
    }
    const h = b.t - a.t;
    const s = (t - a.t) / h;
    const h00 = (1 + 2 * s) * (1 - s) * (1 - s);
    const h10 = s * (1 - s) * (1 - s);
    const h01 = s * s * (3 - 2 * s);
    const h11 = s * s * (s - 1);
    x.push(h00 * a.x + h10 * h * a.vx + h01 * b.x + h11 * h * b.vx);
    y.push(h00 * a.y + h10 * h * a.vy + h01 * b.y + h11 * h * b.vy);
  }
  return { x, y };
}

/** A simulated shot sampled like the recording: one track per tracked marble. */
export function sampleShot(result: ShotResult, rec: Recording): Track[] {
  return rec.tracks.map((t) => {
    const tl = result.timeline?.find((m) => m.id === t.id);
    if (tl === undefined) throw new Error(`no timeline for marble ${String(t.id)}`);
    return { id: t.id, t0: t.t0, ...sampleTimeline(tl, times(t, rec.fps)) };
  });
}

/** Replay a recording with a parameter set and sample it like the recording. */
export function simulateRecording(
  rec: Recording,
  params: PhysicsParams,
  launch: Launch = {},
): { result: ShotResult; tracks: Track[] } {
  const result = simulateShot(replaySetup(rec, launch, params), { params, timeline: true });
  return { result, tracks: sampleShot(result, rec) };
}

/** Least-squares polynomial (degree 1 or 2) in t − tc; returns [c0, c1, c2]. */
export function polyFit(
  ts: readonly number[],
  vs: readonly number[],
  tc: number,
  degree: 1 | 2,
): [number, number, number] {
  const n = degree + 1;
  const a = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  ts.forEach((t, k) => {
    const u = t - tc;
    const basis = [1, u, u * u].slice(0, n);
    const v = vs[k] ?? NaN;
    for (let i = 0; i < n; i += 1) {
      const row = a[i] ?? [];
      for (let j = 0; j < n; j += 1) row[j] = (row[j] ?? 0) + (basis[i] ?? 0) * (basis[j] ?? 0);
      row[n] = (row[n] ?? 0) + (basis[i] ?? 0) * v;
    }
  });
  const c = solve(a);
  return [c[0] ?? NaN, c[1] ?? NaN, degree === 2 ? (c[2] ?? NaN) : 0];
}

/** Gaussian elimination with partial pivoting on an augmented matrix. */
export function solve(aug: number[][]): number[] {
  const n = aug.length;
  for (let col = 0; col < n; col += 1) {
    let p = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(aug[r]?.[col] ?? 0) > Math.abs(aug[p]?.[col] ?? 0)) p = r;
    }
    const pr = aug[p] ?? [];
    aug[p] = aug[col] ?? [];
    aug[col] = pr;
    const pivot = pr[col] ?? 0;
    if (pivot === 0) throw new Error('singular system');
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const row = aug[r] ?? [];
      const f = (row[col] ?? 0) / pivot;
      for (let k = col; k <= n; k += 1) row[k] = (row[k] ?? 0) - f * (pr[k] ?? 0);
    }
  }
  return aug.map((row, i) => (row[n] ?? NaN) / (row[i] ?? NaN));
}

/** The samples of a track with time in [from, to]. */
export function window(t: Track, fps: number, from: number, to: number) {
  const ts: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  times(t, fps).forEach((s, k) => {
    if (s >= from && s <= to) {
      ts.push(s);
      xs.push(t.x[k] ?? NaN);
      ys.push(t.y[k] ?? NaN);
    }
  });
  return { ts, xs, ys };
}

/** Position and velocity at time tc from a quadratic fit over [from, to] (m, m/s). */
export function stateAt(
  t: Track,
  fps: number,
  tc: number,
  from: number,
  to: number,
): { x: number; y: number; vx: number; vy: number } {
  const w = window(t, fps, from, to);
  if (w.ts.length < 4) throw new Error(`too few samples in [${String(from)}, ${String(to)}]`);
  const fx = polyFit(w.ts, w.xs, tc, 2);
  const fy = polyFit(w.ts, w.ys, tc, 2);
  return { x: fx[0], y: fy[0], vx: fx[1], vy: fy[1] };
}

/** Distance from the first sample at every sample (m). */
export function distances(t: Track): number[] {
  const x0 = t.x[0] ?? NaN;
  const y0 = t.y[0] ?? NaN;
  return t.x.map((x, k) => Math.hypot(x - x0, (t.y[k] ?? NaN) - y0));
}

/** The last position, averaged over the final samples to beat tracking noise (m). */
export function restOf(t: Track, samples = 5): { x: number; y: number } {
  const n = Math.min(samples, t.x.length);
  let x = 0;
  let y = 0;
  for (let k = t.x.length - n; k < t.x.length; k += 1) {
    x += t.x[k] ?? NaN;
    y += t.y[k] ?? NaN;
  }
  return { x: x / n, y: y / n };
}
