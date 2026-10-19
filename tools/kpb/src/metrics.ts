/**
 * The KPB reality metrics (test 15): roll-out distance, slide time, departure angles, speed
 * ratios, rest positions, capture and bank angles. One extractor reads both the filmed tracks and
 * the simulation sampled at the same frames, so any bias in a measurement (a fit window that
 * straddles the end of a slide, say) is the same on both sides and cancels in the comparison.
 */
import { DatasetError, trackOf, type Recording, type Track } from './dataset.ts';
import { distances, polyFit, restOf, solve, stateAt, times, window } from './track.ts';

export type MetricValue = number | { readonly x: number; readonly y: number };
export type Metrics = Readonly<Record<string, MetricValue>>;

/** Displacement that counts as a struck marble having started to move (m). */
const MOVED = 0.0015;
/** Fit window either side of an impact (s), and the frames skipped next to it. */
const IMPACT_WINDOW = 0.1;
const GUARD_FRAMES = 2;
/** Window searched for the end of a slide (s). */
const SLIDE_WINDOW = 0.4;

const DEG = 180 / Math.PI;

/** The time a struck marble starts to move: back-extrapolated from its first frames (s). */
export function impactTime(rec: Recording, target: Track): number {
  const d = distances(target);
  const ts = times(target, rec.fps);
  const k = d.findIndex((v) => v > MOVED);
  if (k < 0) throw new DatasetError(`${rec.id}: marble ${String(target.id)} never moves`);
  const n = Math.min(d.length, k + 12);
  const c = polyFit(ts.slice(k, n), d.slice(k, n), ts[k] ?? NaN, 2);
  // d(t) = c0 + c1·u + c2·u², u = t − ts[k]: the root before the first moving frame.
  const [c0, c1, c2] = c;
  const disc = c1 * c1 - 4 * c2 * c0;
  const u = c2 === 0 || disc < 0 ? -c0 / c1 : (-c1 + Math.sqrt(disc)) / (2 * c2);
  return (ts[k] ?? NaN) + (Number.isFinite(u) ? u : 0);
}

function velocityBefore(rec: Recording, t: Track, at: number) {
  const g = GUARD_FRAMES / rec.fps;
  return stateAt(t, rec.fps, at, at - IMPACT_WINDOW, at - g);
}

function velocityAfter(rec: Recording, t: Track, at: number) {
  const g = GUARD_FRAMES / rec.fps;
  return stateAt(t, rec.fps, at, at + g, at + IMPACT_WINDOW);
}

/** Signed angle from direction a to direction b (degrees). */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * DEG;
}

/** When a stunned marble starts rolling: the kink in its speed curve (s from the first frame). */
export function slideTime(rec: Recording, t: Track): number {
  const w = window(t, rec.fps, t.t0, t.t0 + SLIDE_WINDOW);
  // Speed from local quadratic fits, then a two-piece linear fit with the kink searched on a
  // grid of sample times and refined by a parabola through the best three.
  const v: number[] = [];
  const ts: number[] = [];
  for (let k = 3; k + 3 < w.ts.length; k += 1) {
    const tc = w.ts[k] ?? NaN;
    const s = stateAt(t, rec.fps, tc, w.ts[k - 3] ?? NaN, w.ts[k + 3] ?? NaN);
    v.push(Math.hypot(s.vx, s.vy));
    ts.push(tc);
  }
  const sse = (tau: number): number => {
    const a = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    ts.forEach((tk, k) => {
      const basis = [1, tk - tau, Math.max(0, tk - tau)];
      for (let i = 0; i < 3; i += 1) {
        const row = a[i] ?? [];
        for (let j = 0; j < 3; j += 1) row[j] = (row[j] ?? 0) + (basis[i] ?? 0) * (basis[j] ?? 0);
        row[3] = (row[3] ?? 0) + (basis[i] ?? 0) * (v[k] ?? NaN);
      }
    });
    let c: number[];
    try {
      c = solve(a);
    } catch {
      return Infinity;
    }
    let s = 0;
    ts.forEach((tk, k) => {
      const fit = (c[0] ?? 0) + (c[1] ?? 0) * (tk - tau) + (c[2] ?? 0) * Math.max(0, tk - tau);
      s += (fit - (v[k] ?? NaN)) ** 2;
    });
    return s;
  };
  let best = 1;
  let bestSse = Infinity;
  for (let k = 1; k + 1 < ts.length; k += 1) {
    const s = sse(ts[k] ?? NaN);
    if (s < bestSse) {
      bestSse = s;
      best = k;
    }
  }
  const [t0, t1, t2] = [ts[best - 1] ?? NaN, ts[best] ?? NaN, ts[best + 1] ?? NaN];
  const [s0, s1, s2] = [sse(t0), sse(t1), sse(t2)];
  const denom = s0 - 2 * s1 + s2;
  const shift = denom > 0 ? (0.5 * (s0 - s2)) / denom : 0;
  return t1 + Math.max(-1, Math.min(1, shift)) * (t2 - t1) - t.t0;
}

/** The angle a banked marble leaves the wall at, against the wall (degrees, 0–90). */
export function bankAngle(rec: Recording, t: Track): number {
  const wall = rec.court.walls?.[0];
  if (wall === undefined) throw new DatasetError(`${rec.id}: a bank shot needs a wall`);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  const dist = t.x.map(
    (x, k) => Math.abs((x - wall.x1) * dy - ((t.y[k] ?? NaN) - wall.y1) * dx) / len,
  );
  let k = 0;
  dist.forEach((d, i) => {
    if (d < (dist[k] ?? Infinity)) k = i;
  });
  const tw = t.t0 + k / rec.fps;
  const g = GUARD_FRAMES / rec.fps;
  const out = stateAt(t, rec.fps, tw, tw + g, tw + 2 * IMPACT_WINDOW);
  const a = Math.abs(angleBetween(dx, dy, out.vx, out.vy));
  return a > 90 ? 180 - a : a;
}

/** The metrics of one recording, read from its tracks (filmed, or simulated and sampled). */
export function measure(rec: Recording, tracks: readonly Track[]): Metrics {
  const byId = { ...rec, tracks };
  const shooter = trackOf(byId, rec.shooter);
  const out: Record<string, MetricValue> = {};
  if (rec.kind === 'flick') return out;
  if (rec.kind === 'hole') {
    const hole = rec.court.hole;
    if (hole === undefined) throw new DatasetError(`${rec.id}: a hole shot needs a hole`);
    const rest = restOf(shooter);
    out['capture'] = Math.hypot(rest.x - hole.x, rest.y - hole.y) < hole.radius ? 1 : 0;
    return out;
  }
  for (const t of tracks) out[`rest:${String(t.id)}`] = restOf(t);
  if (rec.kind === 'roll' || rec.kind === 'stun') {
    const rest = restOf(shooter);
    out['roll-out'] = Math.hypot(rest.x - (shooter.x[0] ?? NaN), rest.y - (shooter.y[0] ?? NaN));
    if (rec.kind === 'stun') out['slide-time'] = slideTime(rec, shooter);
    return out;
  }
  if (rec.kind === 'bank') {
    out['bank-angle'] = bankAngle(rec, shooter);
    return out;
  }
  // head-on and cut: the first other marble is the target. A replay that misses it has no
  // impact to measure: its values are NaN, and the scorer fails them.
  const target = tracks.find((t) => t.id !== rec.shooter);
  if (target === undefined) throw new DatasetError(`${rec.id}: no target track`);
  let at: number;
  try {
    at = impactTime(rec, target);
  } catch (e) {
    if (!(e instanceof DatasetError)) throw e;
    out['speed-ratio:target'] = NaN;
    out['speed-ratio:shooter'] = NaN;
    if (rec.kind === 'cut') {
      out['departure:target'] = NaN;
      out['departure:shooter'] = NaN;
    }
    return out;
  }
  const before = velocityBefore(rec, shooter, at);
  const sAfter = velocityAfter(rec, shooter, at);
  const tAfter = velocityAfter(rec, target, at);
  const vIn = Math.hypot(before.vx, before.vy);
  out['speed-ratio:target'] = Math.hypot(tAfter.vx, tAfter.vy) / vIn;
  out['speed-ratio:shooter'] = Math.hypot(sAfter.vx, sAfter.vy) / vIn;
  if (rec.kind === 'cut') {
    out['departure:target'] = angleBetween(before.vx, before.vy, tAfter.vx, tAfter.vy);
    out['departure:shooter'] = angleBetween(before.vx, before.vy, sAfter.vx, sAfter.vy);
  }
  return out;
}
