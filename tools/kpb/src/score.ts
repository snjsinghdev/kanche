/**
 * The KPB reality scorer (test 15). Every recording is replayed from its measured launch, and
 * the simulated shot is measured exactly as the filmed one is. For each condition and metric:
 *
 * - the error is the root mean square, over the repeats, of simulated minus filmed (the distance
 *   between them, for a position);
 * - the scatter is the filmed repeats' own sample standard deviation (about their centroid, for
 *   a position);
 * - the metric passes when error ≤ 1.5 × scatter. Real marbles set the pass mark: a simulation
 *   cannot be held to more repeatability than they have.
 */
import type { PhysicsParams } from '@kanche/physics';

import { conditions, type Dataset } from './dataset.ts';
import { measure, type Metrics, type MetricValue } from './metrics.ts';
import { simulateRecording } from './track.ts';

export const SCATTER_FACTOR = 1.5;

export interface MetricScore {
  readonly condition: string;
  readonly metric: string;
  readonly repeats: number;
  readonly error: number;
  readonly scatter: number;
  readonly pass: boolean;
}

export interface Score {
  readonly synthetic: boolean;
  readonly rows: readonly MetricScore[];
  readonly passed: number;
}

const isPoint = (v: MetricValue): v is { x: number; y: number } => typeof v !== 'number';

/** Angles differ modulo a turn: wrap into (−180°, 180°]. */
function difference(metric: string, a: number, b: number): number {
  const d = a - b;
  if (!metric.startsWith('departure') && metric !== 'bank-angle') return d;
  return d - 360 * Math.round(d / 360);
}

function scoreMetric(metric: string, real: readonly MetricValue[], sim: readonly MetricValue[]) {
  const n = real.length;
  let err2 = 0;
  let spread2 = 0;
  if (real.every(isPoint) && sim.every(isPoint)) {
    const cx = real.reduce((a, p) => a + p.x, 0) / n;
    const cy = real.reduce((a, p) => a + p.y, 0) / n;
    real.forEach((p, k) => {
      const s = sim[k] as { x: number; y: number };
      err2 += (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
      spread2 += (p.x - cx) ** 2 + (p.y - cy) ** 2;
    });
  } else {
    const r = real as number[];
    const s = sim as number[];
    const mean = r.reduce((a, b) => a + b, 0) / n;
    r.forEach((v, k) => {
      err2 += difference(metric, s[k] ?? NaN, v) ** 2;
      spread2 += difference(metric, v, mean) ** 2;
    });
  }
  const error = Math.sqrt(err2 / n);
  const scatter = Math.sqrt(spread2 / (n - 1));
  // NaN (a replay that missed what the filmed shot hit) fails: every comparison with it is false.
  return { error, scatter, pass: scatter === 0 ? error === 0 : error <= SCATTER_FACTOR * scatter };
}

/** Score a dataset against a parameter set. Conditions need at least two repeats. */
export function scoreDataset(d: Dataset, params: PhysicsParams): Score {
  const rows: MetricScore[] = [];
  for (const [condition, recs] of conditions(d)) {
    if (recs.length < 2) continue;
    const real: Metrics[] = [];
    const sim: Metrics[] = [];
    for (const rec of recs) {
      real.push(measure(rec, rec.tracks));
      sim.push(measure(rec, simulateRecording(rec, params).tracks));
    }
    const names = Object.keys(real[0] ?? {}).filter((m) => real.every((r) => m in r));
    for (const metric of names) {
      const r = real.map((x) => x[metric] as MetricValue);
      const s = sim.map((x) => x[metric] as MetricValue);
      rows.push({ condition, metric, repeats: recs.length, ...scoreMetric(metric, r, s) });
    }
  }
  return { synthetic: d.synthetic, rows, passed: rows.filter((r) => r.pass).length };
}
