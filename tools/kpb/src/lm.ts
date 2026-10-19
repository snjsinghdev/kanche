/**
 * Levenberg–Marquardt least squares for the KPB fits, with numeric Jacobians and the parameter
 * covariance. The problem is in blocks: shared parameters (the coefficients being fitted) act on
 * every block, and each block (one recording) has local nuisance parameters of its own (its
 * launch), so a local column of the Jacobian costs one block's evaluation, not all of them.
 */
import { solve } from './track.ts';

export interface Block {
  /** Residuals of this block for the shared and local parameters. */
  residuals(shared: readonly number[], local: readonly number[]): number[];
  readonly local: readonly number[];
}

export interface FitOptions {
  /** Relative finite-difference step per shared parameter (default 1e-4). */
  readonly sharedStep?: readonly number[];
  readonly localStep?: number;
  readonly lower?: readonly number[];
  readonly upper?: readonly number[];
  readonly maxIterations?: number;
}

export interface FitResult {
  readonly shared: number[];
  readonly local: number[][];
  /**
   * Standard errors of the shared parameters: cluster-robust (the sandwich estimator with each
   * block as a cluster), so a coefficient that really varies from recording to recording, as it
   * does on real ground, widens them; never below the plain σ²·(JᵀJ)⁻¹ ones.
   */
  readonly sharedSigma: number[];
  /** Residual standard deviation σ (same unit as the residuals). */
  readonly sigma: number;
  readonly residuals: number;
  readonly iterations: number;
}

function step(value: number, rel: number): number {
  return rel * Math.max(Math.abs(value), 1e-3);
}

/** Invert a symmetric positive-definite matrix (small) by Gaussian elimination. */
function invert(a: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  const out: number[][] = [];
  for (let c = 0; c < n; c += 1) {
    const aug = a.map((row, i) => [...row, i === c ? 1 : 0]);
    const col = solve(aug);
    col.forEach((v, i) => {
      (out[i] ??= [])[c] = v;
    });
  }
  return out;
}

export function fitBlocks(
  shared0: readonly number[],
  blocks: readonly Block[],
  options: FitOptions = {},
): FitResult {
  const ns = shared0.length;
  const offsets: number[] = [];
  let np = ns;
  for (const b of blocks) {
    offsets.push(np);
    np += b.local.length;
  }
  const lower = options.lower ?? [];
  const upper = options.upper ?? [];
  const clamp = (p: number[]): number[] =>
    p.map((v, i) => Math.min(upper[i] ?? Infinity, Math.max(lower[i] ?? -Infinity, v)));
  const split = (p: readonly number[]) => ({
    shared: p.slice(0, ns),
    local: blocks.map((b, i) => p.slice(offsets[i], (offsets[i] ?? 0) + b.local.length)),
  });
  const evalAll = (p: readonly number[]): number[][] => {
    const s = split(p);
    return blocks.map((b, i) => b.residuals(s.shared, s.local[i] ?? []));
  };
  const ssr = (rs: readonly (readonly number[])[]): number =>
    rs.reduce((a, r) => a + r.reduce((x, v) => x + v * v, 0), 0);

  let p = clamp([...shared0, ...blocks.flatMap((b) => b.local)]);
  let r = evalAll(p);
  let cost = ssr(r);
  let lambda = 1e-3;
  let jtj: number[][] = [];
  let jac: number[][][] = [];
  let iterations = 0;
  const maxIterations = options.maxIterations ?? 40;
  for (; iterations < maxIterations; iterations += 1) {
    // Jacobian, column by column: shared columns re-evaluate every block, local ones one block.
    const cols: number[][][] = [];
    const s = split(p);
    for (let j = 0; j < np; j += 1) {
      const h =
        j < ns
          ? step(p[j] ?? 0, options.sharedStep?.[j] ?? 1e-4)
          : step(p[j] ?? 0, options.localStep ?? 1e-5);
      const q = [...p];
      q[j] = (q[j] ?? 0) + h;
      const qs = split(q);
      cols.push(
        blocks.map((b, i) => {
          const base = r[i] ?? [];
          const inBlock =
            j >= ns && j >= (offsets[i] ?? 0) && j < (offsets[i] ?? 0) + b.local.length;
          if (j >= ns && !inBlock) return base.map(() => 0);
          const rr = b.residuals(j < ns ? qs.shared : s.shared, qs.local[i] ?? []);
          return rr.map((v, k) => (v - (base[k] ?? 0)) / h);
        }),
      );
    }
    jac = cols;
    const flat = (m: number[][]): number[] => m.flat();
    const J = cols.map(flat);
    const res = flat(r);
    jtj = J.map((cj) => J.map((ck) => cj.reduce((a, v, k) => a + v * (ck[k] ?? 0), 0)));
    const jtr = J.map((cj) => cj.reduce((a, v, k) => a + v * (res[k] ?? 0), 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries += 1) {
      const aug = jtj.map((row, i) => [
        ...row.map((v, k) => (k === i ? v * (1 + lambda) + 1e-300 : v)),
        -(jtr[i] ?? 0),
      ]);
      let delta: number[];
      try {
        delta = solve(aug);
      } catch {
        lambda *= 10;
        continue;
      }
      const q = clamp(p.map((v, i) => v + (delta[i] ?? 0)));
      const rq = evalAll(q);
      const cq = ssr(rq);
      if (cq < cost) {
        const rel = (cost - cq) / Math.max(cost, 1e-300);
        p = q;
        r = rq;
        cost = cq;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (rel < 1e-10) iterations = maxIterations;
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  const n = r.reduce((a, x) => a + x.length, 0);
  const sigma2 = cost / Math.max(1, n - np);
  let cov: number[][];
  try {
    cov = invert(jtj);
  } catch {
    cov = jtj.map((row) => row.map(() => NaN));
  }
  // The sandwich: (JᵀJ)⁻¹ · Σ_b (J_bᵀ r_b)(J_bᵀ r_b)ᵀ · (JᵀJ)⁻¹, scaled by G/(G − 1).
  const g = blocks.length;
  const meat = cov.map(() => new Array<number>(np).fill(0));
  blocks.forEach((_, b) => {
    const rb = r[b] ?? [];
    const score = jac.map((col) => (col[b] ?? []).reduce((a, v, k) => a + v * (rb[k] ?? 0), 0));
    score.forEach((u, i) => {
      score.forEach((w, j) => {
        const row = meat[i] ?? [];
        row[j] = (row[j] ?? 0) + u * w;
      });
    });
  });
  const robust = (i: number): number => {
    const ci = cov[i] ?? [];
    let v = 0;
    for (let a = 0; a < np; a += 1) {
      for (let c = 0; c < np; c += 1) v += (ci[a] ?? 0) * (meat[a]?.[c] ?? 0) * (cov[c]?.[i] ?? 0);
    }
    return g > 1 ? (v * g) / (g - 1) : NaN;
  };
  const s = split(p);
  return {
    shared: s.shared,
    local: s.local,
    sharedSigma: s.shared.map((_, i) =>
      Math.sqrt(Math.max(sigma2 * (cov[i]?.[i] ?? NaN), robust(i))),
    ),
    sigma: Math.sqrt(sigma2),
    residuals: n,
    iterations,
  };
}
