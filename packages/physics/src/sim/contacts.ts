/**
 * Locating contacts inside a step (Phase 1 prompt, "Events and exact timing"; ADR-0006).
 *
 * The gap between two marbles, or between a marble and the court's static features, is followed
 * along the substeps' Hermite curves by conservative advancement: advance by the gap divided by
 * a bound on how fast it can close (the Bernstein bound on the curves' velocities), so a contact
 * is never skipped, however fast the marbles move. A contact is the first time the gap reaches
 * zero while closing; a Newton step then places it exactly.
 *
 * Advancement crawls when two surfaces pass very close without touching (a graze) or start out
 * touching and separating. After a fixed number of iterations it hands over to an escape step
 * that brackets the gap's minimum by the sign of its rate (bisection), and either finds the
 * contact there or resumes advancement past it.
 */

import { defined, PhysicsError } from '../errors.ts';
import type { Body } from './body.ts';
import { featureGap, featureKey, newGap, type StaticFeature } from './features.ts';
import {
  positionAt,
  positionRateAt,
  relativeSpeedBound,
  speedBound,
  type Piece,
} from './hermite.ts';
import type { Track, World } from './advance.ts';

/** A gap followed along time: its value and rate, and a bound on its rate to a breakpoint. */
interface Gap {
  g: number; // m
  rate: number; // m/s
  bound: number; // m/s
  until: number; // s
  eval(t: number): void;
  boundFrom(t: number): void;
}

/** The piece of a track that holds time t (the last piece holds its end). */
export function pieceAt(track: Track, t: number): Piece {
  let found = defined(track.pieces[0], 'track piece');
  for (let i = 0; i < track.count; i += 1) {
    const p = defined(track.pieces[i], 'track piece');
    found = p;
    if (t < p.t1) break;
  }
  return found;
}

/** Approach rates slower than this at a touching contact are rounding (m/s). */
const RATE_TOL = 1e-12;

const pa = { x: 0, y: 0, z: 0 };
const pb = { x: 0, y: 0, z: 0 };
const ra = { x: 0, y: 0, z: 0 };
const rb = { x: 0, y: 0, z: 0 };

class PairGap implements Gap {
  g = 0;
  rate = 0;
  bound = 0;
  until = 0;
  a: Track | null = null;
  b: Track | null = null;
  radii = 0;

  eval(t: number): void {
    const pA = pieceAt(defined(this.a, 'track'), t);
    const pB = pieceAt(defined(this.b, 'track'), t);
    positionAt(pA, t, pa);
    positionAt(pB, t, pb);
    positionRateAt(pA, t, ra);
    positionRateAt(pB, t, rb);
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    const dz = pa.z - pb.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.g = d - this.radii;
    this.rate = d === 0 ? 0 : (dx * (ra.x - rb.x) + dy * (ra.y - rb.y) + dz * (ra.z - rb.z)) / d;
  }

  boundFrom(t: number): void {
    const pA = pieceAt(defined(this.a, 'track'), t);
    const pB = pieceAt(defined(this.b, 'track'), t);
    this.bound = relativeSpeedBound(pA, pB);
    this.until = Math.min(pA.t1, pB.t1);
  }
}

class StaticGap implements Gap {
  g = 0;
  rate = 0;
  bound = 0;
  until = 0;
  world: World | null = null;
  track: Track | null = null;
  body: Body | null = null;
  features: readonly StaticFeature[] = [];
  /** The nearest feature at the last evaluation. */
  nearest: StaticFeature | null = null;
  lip = 1;
  private readonly fg = newGap();

  eval(t: number): void {
    const world = defined(this.world, 'world');
    const body = defined(this.body, 'body');
    const p = pieceAt(defined(this.track, 'track'), t);
    positionAt(p, t, pa);
    positionRateAt(p, t, ra);
    let best = Infinity;
    let rate = 0;
    let nearest: StaticFeature | null = null;
    let lip = 1;
    for (const f of this.features) {
      const fg = featureGap(world.court, f, body.r, pa.x, pa.y, pa.z, this.fg);
      if (!fg.valid) continue;
      lip = Math.max(lip, fg.lip);
      if (
        fg.gap < best ||
        (fg.gap === best && nearest !== null && featureKey(f) < featureKey(nearest))
      ) {
        best = fg.gap;
        nearest = f;
        rate = rateAlong(this.fg);
      }
    }
    this.g = best;
    this.rate = rate;
    this.nearest = nearest;
    this.lip = lip;
  }

  boundFrom(t: number): void {
    const p = pieceAt(defined(this.track, 'track'), t);
    this.bound = speedBound(p) * Math.max(this.lip, 1.001);
    this.until = p.t1;
  }
}

/** Rate of a feature's gap along the curve's velocity (ra): the gap's gradient · velocity. */
function rateAlong(fg: { gx: number; gy: number; gz: number }): number {
  return fg.gx * ra.x + fg.gy * ra.y + fg.gz * ra.z;
}

/** First time in [0, tEnd] the gap closes to zero while closing, or Infinity. */
function firstRoot(world: World, gap: Gap, tEnd: number): number {
  const tol = world.params.thresholds.gapTol;
  const iterations = world.params.solver.advanceIterations;
  let t = 0;
  // Every round ends at a later time (a breakpoint or past a minimum), so this terminates; the
  // cap is a guard against a broken invariant, not a tuning knob.
  for (let round = 0; round < 100_000; round += 1) {
    for (let i = 0; i < iterations; i += 1) {
      gap.eval(t);
      if (gap.g <= tol) {
        // Closing slower than RATE_TOL is rounding, not an approach (it would chatter forever).
        if (gap.rate < -RATE_TOL) return gap.g <= 0 ? t : Math.min(tEnd, t - gap.g / gap.rate);
        break;
      }
      gap.boundFrom(t);
      const next = gap.bound > 0 ? t + gap.g / gap.bound : Infinity;
      if (next >= gap.until) {
        if (gap.until >= tEnd) return Infinity;
        t = gap.until;
      } else {
        t = next;
      }
    }
    const resumed = escape(world, gap, t, tEnd);
    if (resumed.root) return resumed.t;
    if (resumed.t >= tEnd) return Infinity;
    t = resumed.t;
  }
  throw new PhysicsError('internal', 'contact search made no progress');
}

/**
 * Advancement could not make progress at t (a graze, or surfaces touching and separating).
 * Bisect the gap's rate over the rest of the piece to find its minimum: a root before it is the
 * contact; otherwise resume past the minimum, or past the piece if the gap only grows.
 */
function escape(world: World, gap: Gap, t: number, tEnd: number): { root: boolean; t: number } {
  const iterations = world.params.solver.rootIterations;
  gap.boundFrom(t);
  const end = Math.min(gap.until, tEnd);
  gap.eval(end);
  const gEnd = gap.g;
  const rEnd = gap.rate;
  gap.eval(t);
  const g0 = gap.g;
  const r0 = gap.rate;
  const tol = world.params.thresholds.gapTol;
  // Touching (or a hair inside), closing however slowly, and still closing and inside at the end
  // of the piece: the contact is now.
  if (g0 <= tol && r0 < 0 && rEnd < 0 && gEnd <= 0) return { root: true, t };
  if (r0 < 0 && rEnd < 0 && gEnd > 0) return { root: false, t: end };
  // Locate the turning point of the gap (rate from − to +, or + to − then the following dip).
  let lo = t;
  let hi = end;
  if (r0 < 0 && rEnd >= 0) {
    for (let i = 0; i < iterations; i += 1) {
      const mid = 0.5 * (lo + hi);
      if (!(mid > lo && mid < hi)) break;
      gap.eval(mid);
      if (gap.rate < 0) lo = mid;
      else hi = mid;
    }
    gap.eval(hi);
    if (gap.g <= 0 && g0 > 0) return { root: true, t: bisectRoot(world, gap, t, hi) };
    return { root: false, t: hi > t ? hi : end };
  }
  if (gEnd <= 0 && g0 > 0) return { root: true, t: bisectRoot(world, gap, t, end) };
  if (r0 >= 0 && rEnd < 0 && gEnd <= 0) {
    // Touching (or a hair inside) and separating at t, closing again by the end: the gap rises
    // to a maximum and falls back. Find the maximum, then the contact after it.
    let lo = t;
    let hi = end;
    for (let i = 0; i < iterations; i += 1) {
      const mid = 0.5 * (lo + hi);
      if (!(mid > lo && mid < hi)) break;
      gap.eval(mid);
      if (gap.rate >= 0) lo = mid;
      else hi = mid;
    }
    gap.eval(lo);
    if (gap.g > 0) return { root: true, t: bisectRoot(world, gap, lo, end) };
    return { root: true, t: lo };
  }
  return { root: false, t: end };
}

/** Bisection for the first zero of the gap between a (gap > 0) and b (gap <= 0). */
function bisectRoot(world: World, gap: Gap, a: number, b: number): number {
  let lo = a;
  let hi = b;
  for (let i = 0; i < world.params.solver.rootIterations; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (!(mid > lo && mid < hi)) break;
    gap.eval(mid);
    if (gap.g > 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

const pairGap = new PairGap();
const staticGap = new StaticGap();

/** First contact time of two marbles within [0, tEnd], or Infinity. */
export function pairContact(
  world: World,
  a: Body,
  ta: Track,
  b: Body,
  tb: Track,
  tEnd: number,
): number {
  pairGap.a = ta;
  pairGap.b = tb;
  pairGap.radii = a.r + b.r;
  return firstRoot(world, pairGap, tEnd);
}

export interface StaticHit {
  t: number;
  feature: StaticFeature | null;
}

/** First contact of a marble with any of the features within [0, tEnd]. */
export function staticContact(
  world: World,
  body: Body,
  track: Track,
  features: readonly StaticFeature[],
  tEnd: number,
  out: StaticHit,
): StaticHit {
  out.t = Infinity;
  out.feature = null;
  if (features.length === 0) return out;
  staticGap.world = world;
  staticGap.body = body;
  staticGap.track = track;
  staticGap.features = features;
  const t = firstRoot(world, staticGap, tEnd);
  if (t === Infinity) return out;
  staticGap.eval(t);
  out.t = t;
  out.feature = staticGap.nearest;
  return out;
}
