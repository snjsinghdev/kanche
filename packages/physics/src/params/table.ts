/**
 * Piecewise-linear lookup tables for speed-dependent coefficients (restitution, impact friction,
 * rolling resistance). Curves are committed data, so nothing evaluates exp or pow at runtime
 * (MECHANICS-REVIEW finding 9). Outside the breakpoints the end values extend flat; that is part
 * of the model, not a clamp of an input.
 */

import { PhysicsError } from '../errors.ts';

export interface TableData {
  /** Breakpoints, strictly increasing (the unit is the caller's: m/s for speeds). */
  readonly x: readonly number[];
  /** Values at the breakpoints. */
  readonly y: readonly number[];
}

/** One linear piece: y = a + b·x on [x0, x1). */
export interface TableSegment {
  readonly index: number;
  readonly x0: number;
  readonly x1: number;
  readonly a: number;
  readonly b: number;
}

export interface Table {
  readonly data: TableData;
  readonly segments: readonly TableSegment[];
}

/** Build a table, validating its breakpoints. A single point is a constant. */
export function makeTable(data: TableData, what: string): Table {
  const { x, y } = data;
  if (x.length === 0 || x.length !== y.length) {
    throw new PhysicsError('invalid-params', `${what}: x and y need the same non-zero length`);
  }
  const points: { x: number; y: number }[] = [];
  x.forEach((xi, i) => {
    const yi = y[i];
    if (yi === undefined || !Number.isFinite(xi) || !Number.isFinite(yi)) {
      throw new PhysicsError('invalid-params', `${what}: non-finite point ${String(i)}`);
    }
    const prev = points.at(-1);
    if (prev !== undefined && !(xi > prev.x)) {
      throw new PhysicsError('invalid-params', `${what}: x must increase strictly`);
    }
    points.push({ x: xi, y: yi });
  });
  const segments: TableSegment[] = [];
  let prev: { x: number; y: number } | undefined;
  for (const p of points) {
    if (prev === undefined) {
      // Flat extension below the first breakpoint.
      segments.push({ index: 0, x0: -Infinity, x1: p.x, a: p.y, b: 0 });
    } else {
      const b = (p.y - prev.y) / (p.x - prev.x);
      segments.push({ index: segments.length, x0: prev.x, x1: p.x, a: prev.y - b * prev.x, b });
    }
    prev = p;
  }
  const last = points.at(-1);
  if (last !== undefined) {
    segments.push({ index: segments.length, x0: last.x, x1: Infinity, a: last.y, b: 0 });
  }
  // Frozen all the way down, with copies of the caller's arrays: a parameter set built from
  // tables cannot be changed through them afterwards.
  return Object.freeze({
    data: Object.freeze({ x: Object.freeze([...x]), y: Object.freeze([...y]) }),
    segments: Object.freeze(segments.map((s) => Object.freeze(s))),
  });
}

/** The segment that holds x (x0 <= x < x1). */
export function segmentAt(table: Table, x: number): TableSegment {
  for (const s of table.segments) {
    if (x < s.x1) return s;
  }
  // The last segment ends at +Infinity, so only NaN reaches here.
  throw new PhysicsError('non-finite', `table lookup at ${String(x)}`);
}

/** Evaluate the table at x. */
export function tableValue(table: Table, x: number): number {
  const s = segmentAt(table, x);
  return s.a + s.b * x;
}
