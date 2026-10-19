/**
 * A small linear complementarity problem: find λ with
 *
 *   w = q + A·λ ≥ 0,   λ ≥ 0,   λᵢ·wᵢ = 0,
 *
 * for the handful of contacts that press on one marble at once (a marble squeezed between a
 * wall and another marble). Gauss–Seidel converges slowly when two contacts push from nearly
 * opposite sides, so up to MAX_EXACT contacts every active set is tried, smallest first and then
 * in lexicographic order (deterministic), and solved exactly by Gaussian elimination.
 */

import { defined } from '../errors.ts';

/** Contact sets up to this size are solved exactly (2^n active sets) (–). */
export const MAX_EXACT = 6;

const setCache: number[][][] = [];

/** Every non-empty subset of 0..n−1, smallest first, then lexicographic. */
function activeSets(n: number): readonly number[][] {
  const cached = setCache[n];
  if (cached !== undefined) return cached;
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const set: number[] = [];
    for (let i = 0; i < n; i += 1) if ((mask & (1 << i)) !== 0) set.push(i);
    out.push(set);
  }
  out.sort((x, y) => {
    if (x.length !== y.length) return x.length - y.length;
    for (let k = 0; k < x.length; k += 1) {
      const d = defined(x[k], 'set') - defined(y[k], 'set');
      if (d !== 0) return d;
    }
    return 0;
  });
  setCache[n] = out;
  return out;
}

/** Solve A_SS·x = b_S by Gaussian elimination with partial pivoting; null when singular. */
function solveSubset(
  a: readonly (readonly number[])[],
  b: readonly number[],
  set: readonly number[],
): number[] | null {
  const m = set.length;
  const rows = set.map((i) => [
    ...set.map((j) => defined(defined(a[i], 'row')[j], 'a')),
    defined(b[i], 'b'),
  ]);
  for (let col = 0; col < m; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < m; r += 1) {
      const cand = Math.abs(defined(defined(rows[r], 'row')[col], 'a'));
      if (cand > Math.abs(defined(defined(rows[pivot], 'row')[col], 'a'))) pivot = r;
    }
    const pr = defined(rows[pivot], 'row');
    const p = defined(pr[col], 'a');
    if (Math.abs(p) < 1e-300) return null;
    rows[pivot] = defined(rows[col], 'row');
    rows[col] = pr;
    for (let r = 0; r < m; r += 1) {
      if (r === col) continue;
      const row = defined(rows[r], 'row');
      const f = defined(row[col], 'a') / p;
      if (f === 0) continue;
      for (let k = col; k <= m; k += 1) row[k] = defined(row[k], 'a') - f * defined(pr[k], 'a');
    }
  }
  return rows.map((row, i) => defined(row[m], 'b') / defined(row[i], 'a'));
}

/**
 * Solve the LCP exactly for n ≤ MAX_EXACT; null when n is larger or no active set fits (the
 * caller then falls back to Gauss–Seidel). `tol` absorbs rounding in the w ≥ 0 test.
 */
export function solveLcp(
  a: readonly (readonly number[])[],
  q: readonly number[],
  tol: number,
): number[] | null {
  const n = q.length;
  if (q.every((x) => x >= -tol)) return q.map(() => 0);
  if (n > MAX_EXACT) return null;
  const minusQ = q.map((x) => -x);
  for (const set of activeSets(n)) {
    const sol = solveSubset(a, minusQ, set);
    if (sol === null || sol.some((l) => l < 0)) continue;
    const lambda = q.map(() => 0);
    set.forEach((i, k) => {
      lambda[i] = defined(sol[k], 'solution');
    });
    let ok = true;
    for (let i = 0; i < n && ok; i += 1) {
      if (set.includes(i)) continue;
      let w = defined(q[i], 'q');
      const row = defined(a[i], 'row');
      for (const j of set) w += defined(row[j], 'a') * defined(lambda[j], 'lambda');
      if (w < -tol) ok = false;
    }
    if (ok) return lambda;
  }
  return null;
}
