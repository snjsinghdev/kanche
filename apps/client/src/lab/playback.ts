/**
 * Playback of a simulated shot for the lab: each marble's state at any time from its keyframes
 * (linear between them; keyframes are at most one 1/240 s step apart), with the derived values
 * the lab draws. Pure, so it is unit-tested without a browser.
 */
import type { Keyframe, MarbleTimeline, MotionState } from '@kanche/physics';

export interface Sample {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
  readonly motion: MotionState;
  /** |v| (m/s). */
  readonly speed: number;
  /** Slip of the lowest point, v + ω × (−r·ẑ), horizontal (m/s). */
  readonly ux: number;
  readonly uy: number;
  /** |ω| (rad/s). */
  readonly spin: number;
}

/** The state of one marble at time t (s); before the first keyframe, the first. */
export function sampleAt(tl: MarbleTimeline, r: number, t: number): Sample {
  const k = tl.keyframes;
  let i = 0;
  while (i + 1 < k.length && (k[i + 1]?.t ?? Infinity) <= t) i += 1;
  const a = k[i] as Keyframe;
  const b = k[i + 1];
  const s = b === undefined || b.t <= a.t || t <= a.t ? 0 : Math.min(1, (t - a.t) / (b.t - a.t));
  const mix = (p: number, q: number | undefined): number => p + s * ((q ?? p) - p);
  const vx = mix(a.vx, b?.vx);
  const vy = mix(a.vy, b?.vy);
  const vz = mix(a.vz, b?.vz);
  const wx = mix(a.wx, b?.wx);
  const wy = mix(a.wy, b?.wy);
  const wz = mix(a.wz, b?.wz);
  return {
    x: mix(a.x, b?.x),
    y: mix(a.y, b?.y),
    vx,
    vy,
    wx,
    wy,
    wz,
    motion: a.motion,
    speed: Math.sqrt(vx * vx + vy * vy + vz * vz),
    ux: vx - r * wy,
    uy: vy + r * wx,
    spin: Math.sqrt(wx * wx + wy * wy + wz * wz),
  };
}

/** The positions a marble has passed through up to time t, for its trail (m). */
export function trail(tl: MarbleTimeline, t: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const k of tl.keyframes) {
    if (k.t > t) break;
    out.push({ x: k.x, y: k.y });
  }
  return out;
}

export interface Bounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

/** The box around everything that moved, with a margin, so the view frames the action (m). */
export function frame(timelines: readonly MarbleTimeline[], margin = 0.05): Bounds {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const tl of timelines) {
    for (const k of tl.keyframes) {
      xMin = Math.min(xMin, k.x);
      xMax = Math.max(xMax, k.x);
      yMin = Math.min(yMin, k.y);
      yMax = Math.max(yMax, k.y);
    }
  }
  if (!Number.isFinite(xMin)) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  const pad = Math.max(margin, 0.1 * Math.max(xMax - xMin, yMax - yMin));
  return { xMin: xMin - pad, xMax: xMax + pad, yMin: yMin - pad, yMax: yMax + pad };
}
