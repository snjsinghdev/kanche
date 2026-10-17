/**
 * Fitting the v1 coefficients to a KPB dataset (docs/physics-calibration.md), in the order the
 * protocol films them, each fit using the ones before it:
 *
 * 1. muR (per surface) and Cd together, from long rolls launched rolling;
 * 2. muS (per surface), from stunned launches;
 * 3. e(v), glass on glass, from head-on hits, as a table over the hits' approach speeds, and
 * 4. muBB, glass on glass, from cut shots (their throw), fitted together;
 * 5. the rim model, from hole approaches: the restitution and friction of impacts on the rim,
 *    which is the edge material pair (so steps and curbs share it);
 * 6. the finger mass mF and restitution eF, from central flicks.
 *
 * Fits 1–5 use the simulation itself as the model: the recordings are replayed with candidate
 * coefficients and the simulated tracks compared with the filmed ones frame by frame, each
 * recording fitting its own launch speed (and direction, where it matters) as a nuisance
 * parameter. Fit 5 is closed form: a central flick launches at v0 = (1 + eF)·vF·mF/(mF + m).
 */
import {
  deriveParams,
  PARAMS_V1,
  type ParamOverrides,
  type PhysicsParams,
  type SurfaceId,
} from '@kanche/physics';

import { DatasetError, trackOf, type Dataset, type Recording } from './dataset.ts';
import { fitBlocks, type Block } from './lm.ts';
import { impactTime } from './metrics.ts';
import { simulateRecording, stateAt, times } from './track.ts';

export interface Estimate {
  readonly name: string;
  readonly value: number;
  /** Standard error (cluster-robust over recordings for the simulation fits). */
  readonly sigma: number;
  readonly unit: string;
  /** Recordings the estimate rests on: with few, read sigma with Student's t (n − 1 dof). */
  readonly n: number;
}

/**
 * Student's t at two-sided 99.73% (the coverage of ±3σ for a normal) for the given degrees of
 * freedom: a cluster-robust standard error from a handful of recordings is itself uncertain.
 */
export function t3(dof: number): number {
  const table: readonly [number, number][] = [
    [1, 235.8],
    [2, 19.21],
    [3, 9.22],
    [4, 6.62],
    [5, 5.51],
    [6, 4.9],
    [8, 4.28],
    [10, 3.96],
    [15, 3.59],
    [20, 3.42],
    [30, 3.27],
    [60, 3.13],
  ];
  if (dof >= 60) return 3 + (0.13 * 60) / dof;
  const k = table.findIndex(([d]) => d >= dof);
  const [d1, v1] = table[k] ?? [60, 3.13];
  const [d0, v0] = table[k - 1] ?? [d1, v1];
  return d1 === d0 ? v1 : v0 + ((v1 - v0) * (dof - d0)) / (d1 - d0);
}

export interface Calibration {
  readonly estimates: readonly Estimate[];
  /** The overrides of v1 the estimates amount to. */
  readonly overrides: ParamOverrides;
}

const RHO_GLASS = PARAMS_V1.glassDensity;

/** Residual windows for impact recordings, around the impact (s). */
const IMPACT_FIT_BEFORE = 0.1;
const IMPACT_FIT_AFTER = 0.3;
/**
 * Residual window for stunned launches, from the first frame (s): the slide and a little of the
 * roll after it, so that rolling resistance (fitted before) weighs little.
 */
const SLIDE_FIT = 0.25;

function of(d: Dataset, kind: Recording['kind']): Recording[] {
  return d.recordings.filter((r) => r.kind === kind);
}

const speedOf = (r: Recording): number => Math.hypot(r.vx, r.vy);
const angleOf = (r: Recording): number => Math.atan2(r.vy, r.vx);

/**
 * Residuals in the distance travelled from the measured start (m). The start is the launch fit's,
 * which the replay starts from too, not the first frame, whose tracking noise would be a fixed
 * offset in every residual.
 */
function distanceResiduals(rec: Recording, params: PhysicsParams, speed: number, until: number) {
  const real = trackOf(rec, rec.shooter);
  const start = rec.marbles.find((m) => m.id === rec.shooter);
  const x0 = start?.x ?? NaN;
  const y0 = start?.y ?? NaN;
  const sim = trackOf(
    { ...rec, tracks: simulateRecording(rec, params, { speed }).tracks },
    rec.shooter,
  );
  const out: number[] = [];
  times(real, rec.fps).forEach((t, k) => {
    if (t - real.t0 > until) return;
    const dr = Math.hypot((real.x[k] ?? NaN) - x0, (real.y[k] ?? NaN) - y0);
    const ds = Math.hypot((sim.x[k] ?? NaN) - x0, (sim.y[k] ?? NaN) - y0);
    out.push(ds - dr);
  });
  return out;
}

/** Residuals in both coordinates of every tracked marble, between two times (m). */
function positionResiduals(
  rec: Recording,
  params: PhysicsParams,
  speed: number,
  angle: number,
  from: number,
  to: number,
): number[] {
  const sim = simulateRecording(rec, params, { speed, angle });
  const out: number[] = [];
  for (const real of rec.tracks) {
    const s = trackOf({ ...rec, tracks: sim.tracks }, real.id);
    times(real, rec.fps).forEach((t, k) => {
      if (t < from || t > to) return;
      out.push((s.x[k] ?? NaN) - (real.x[k] ?? NaN), (s.y[k] ?? NaN) - (real.y[k] ?? NaN));
    });
  }
  return out;
}

/** The same, around an impact. */
function impactResiduals(
  rec: Recording,
  at: number,
  params: PhysicsParams,
  speed: number,
  angle: number,
): number[] {
  return positionResiduals(
    rec,
    params,
    speed,
    angle,
    at - IMPACT_FIT_BEFORE,
    at + IMPACT_FIT_AFTER,
  );
}

function surfacesOf(recs: readonly Recording[]): SurfaceId[] {
  return [...new Set(recs.map((r) => r.court.surface))].sort();
}

/** 1. muR per surface and Cd, from rolls. */
export function fitRolling(d: Dataset, base: PhysicsParams = PARAMS_V1): Calibration {
  const recs = of(d, 'roll');
  const surfaces = surfacesOf(recs);
  const paramsFor = (shared: readonly number[]): PhysicsParams =>
    deriveParams(base, {
      dragCoefficient: shared[0] ?? NaN,
      surfaces: Object.fromEntries(surfaces.map((s, i) => [s, { muR: shared[i + 1] ?? NaN }])),
    });
  const blocks: Block[] = recs.map((rec) => ({
    local: [speedOf(rec)],
    residuals: (shared, local) =>
      distanceResiduals(rec, paramsFor(shared), local[0] ?? NaN, Infinity),
  }));
  const start = [
    base.dragCoefficient,
    ...surfaces.map((s) => base.surfaces[s].muR.data.y[0] ?? 0.01),
  ];
  const fit = fitBlocks(start, blocks, { lower: start.map(() => 0) });
  const estimates: Estimate[] = [
    {
      name: 'Cd',
      value: fit.shared[0] ?? NaN,
      sigma: fit.sharedSigma[0] ?? NaN,
      unit: '–',
      n: recs.length,
    },
    ...surfaces.map((s, i) => ({
      name: `${s}.muR`,
      value: fit.shared[i + 1] ?? NaN,
      sigma: fit.sharedSigma[i + 1] ?? NaN,
      unit: '–',
      n: recs.filter((r) => r.court.surface === s).length,
    })),
  ];
  return {
    estimates,
    overrides: {
      dragCoefficient: fit.shared[0] ?? NaN,
      surfaces: Object.fromEntries(surfaces.map((s, i) => [s, { muR: fit.shared[i + 1] ?? NaN }])),
    },
  };
}

/** 2. muS per surface, from stunned launches. */
export function fitSliding(d: Dataset, base: PhysicsParams): Calibration {
  const recs = of(d, 'stun');
  const surfaces = surfacesOf(recs);
  const paramsFor = (shared: readonly number[]): PhysicsParams =>
    deriveParams(base, {
      surfaces: Object.fromEntries(surfaces.map((s, i) => [s, { muS: shared[i] ?? NaN }])),
    });
  const blocks: Block[] = recs.map((rec) => ({
    local: [speedOf(rec)],
    residuals: (shared, local) =>
      distanceResiduals(rec, paramsFor(shared), local[0] ?? NaN, SLIDE_FIT),
  }));
  const start = surfaces.map((s) => base.surfaces[s].muS);
  const fit = fitBlocks(start, blocks, { lower: start.map(() => 0.01) });
  return {
    estimates: surfaces.map((s, i) => ({
      name: `${s}.muS`,
      value: fit.shared[i] ?? NaN,
      sigma: fit.sharedSigma[i] ?? NaN,
      unit: '–',
      n: recs.filter((r) => r.court.surface === s).length,
    })),
    overrides: {
      surfaces: Object.fromEntries(surfaces.map((s, i) => [s, { muS: fit.shared[i] ?? NaN }])),
    },
  };
}

/** The shooter's speed as it reaches the target, from the frames before the impact (m/s). */
function approachSpeed(rec: Recording, at: number): number {
  const s = stateAt(
    trackOf(rec, rec.shooter),
    rec.fps,
    at,
    at - IMPACT_FIT_BEFORE,
    at - 2 / rec.fps,
  );
  return Math.hypot(s.vx, s.vy);
}

/** Each condition's mean approach speed, to 1 cm/s: the e(v) breakpoints (m/s). */
function speedsOf(recs: readonly Recording[], speeds: ReadonlyMap<Recording, number>): number[] {
  const by = new Map<string, number[]>();
  for (const r of recs) by.set(r.condition, [...(by.get(r.condition) ?? []), speeds.get(r) ?? NaN]);
  const out = [...by.values()].map(
    (v) => Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length) / 100,
  );
  return [...new Set(out)].sort((a, b) => a - b);
}

function targetOf(rec: Recording) {
  return rec.tracks.find((t) => t.id !== rec.shooter) ?? trackOf(rec, rec.shooter);
}

/**
 * 3 and 4 together: e(v) and muBB for glass on glass, from head-on hits and cut shots. They are
 * fitted jointly because each moves the other's evidence: contact friction changes how fast a
 * rolling shooter's hit sends the target away, and restitution sets the speeds a cut throws at.
 * The e(v) breakpoints are the head-on conditions' mean approach speeds.
 */
export function fitImpacts(d: Dataset, base: PhysicsParams): Calibration {
  const heads = of(d, 'head-on');
  const cuts = of(d, 'cut');
  const recs = [...heads, ...cuts];
  const impacts = new Map(recs.map((r) => [r, impactTime(r, targetOf(r))]));
  const approach = new Map(heads.map((r) => [r, approachSpeed(r, impacts.get(r) ?? NaN)]));
  const speeds = speedsOf(heads, approach);
  const ne = speeds.length;
  const paramsFor = (shared: readonly number[]): PhysicsParams =>
    deriveParams(base, {
      glass: {
        e: { x: speeds, y: shared.slice(0, ne).map((e) => Math.min(1, e)) },
        mu: shared[ne] ?? NaN,
      },
    });
  const blocks: Block[] = recs.map((rec) => {
    const at = impacts.get(rec) ?? NaN;
    return {
      local: [speedOf(rec), angleOf(rec)],
      residuals: (shared, local) =>
        impactResiduals(rec, at, paramsFor(shared), local[0] ?? NaN, local[1] ?? NaN),
    };
  });
  const start = [
    ...speeds.map(() => base.glass.e.data.y[0] ?? 0.9),
    base.glass.mu.data.y[0] ?? 0.05,
  ];
  const fit = fitBlocks(start, blocks, {
    lower: start.map(() => 0),
    upper: [...speeds.map(() => 1), Infinity],
  });
  return {
    estimates: [
      ...speeds.map((v, i) => ({
        name: `glass.e at ${v.toFixed(2)} m/s`,
        value: fit.shared[i] ?? NaN,
        sigma: fit.sharedSigma[i] ?? NaN,
        unit: '–',
        n: heads.filter((r) => Math.abs((approach.get(r) ?? NaN) - v) < 0.1 * v).length,
      })),
      {
        name: 'glass.mu',
        value: fit.shared[ne] ?? NaN,
        sigma: fit.sharedSigma[ne] ?? NaN,
        unit: '–',
        n: recs.length,
      },
    ],
    overrides: {
      glass: { e: { x: speeds, y: fit.shared.slice(0, ne) }, mu: fit.shared[ne] ?? NaN },
    },
  };
}

/** How long after reaching the hole a rim fit follows a marble (s): past the first rim contacts,
 * a lip-out's later bounces turn chaotic and would make the fit's landscape rugged. */
const RIM_WINDOW = 0.15;

/** When a filmed marble first comes within reach of the hole's rim (s), or Infinity. */
function reachesHole(rec: Recording): number {
  const hole = rec.court.hole;
  const t = trackOf(rec, rec.shooter);
  const size = rec.marbles.find((m) => m.id === rec.shooter)?.size ?? 'r80';
  if (hole === undefined) return Infinity;
  const reach = hole.radius + hole.rimRadius + PARAMS_V1.radius[size];
  const k = t.x.findIndex((x, i) => Math.hypot(x - hole.x, (t.y[i] ?? NaN) - hole.y) < reach);
  return k < 0 ? Infinity : t.t0 + k / rec.fps;
}

/**
 * 5. The rim model, from hole approaches: the edge pair's restitution and friction, which govern
 * a marble striking the rim. Residuals are the marble's positions from its launch until
 * RIM_WINDOW after it reaches the hole; each recording fits its launch. Recordings that never
 * reach the hole carry no information about the rim and are left out.
 */
export function fitRim(d: Dataset, base: PhysicsParams): Calibration {
  const recs = of(d, 'hole').filter((r) => Number.isFinite(reachesHole(r)));
  const paramsFor = (shared: readonly number[]): PhysicsParams =>
    deriveParams(base, { edge: { e: Math.min(1, shared[0] ?? NaN), mu: shared[1] ?? NaN } });
  const blocks: Block[] = recs.map((rec) => {
    const until = reachesHole(rec) + RIM_WINDOW;
    return {
      local: [speedOf(rec), angleOf(rec)],
      residuals: (shared, local) =>
        positionResiduals(
          rec,
          paramsFor(shared),
          local[0] ?? NaN,
          local[1] ?? NaN,
          -Infinity,
          until,
        ),
    };
  });
  // Lip-outs make the landscape rugged, so the fit starts from the base and from 20% either side
  // and keeps the best. Its error bars are not reliable (docs/kpb.md).
  const e0 = base.edge.e.data.y[0] ?? 0.5;
  const mu0 = base.edge.mu.data.y[0] ?? 0.3;
  const bounds = { lower: [0, 0], upper: [1, Infinity] };
  let fit = fitBlocks([e0, mu0], blocks, bounds);
  for (const k of [0.8, 1.2]) {
    const next = fitBlocks([Math.min(1, e0 * k), mu0 * k], blocks, bounds);
    if (next.sigma < fit.sigma) fit = next;
  }
  return {
    estimates: [
      {
        name: 'edge.e',
        value: fit.shared[0] ?? NaN,
        sigma: fit.sharedSigma[0] ?? NaN,
        unit: '–',
        n: recs.length,
      },
      {
        name: 'edge.mu',
        value: fit.shared[1] ?? NaN,
        sigma: fit.sharedSigma[1] ?? NaN,
        unit: '–',
        n: recs.length,
      },
    ],
    overrides: { edge: { e: fit.shared[0] ?? NaN, mu: fit.shared[1] ?? NaN } },
  };
}

/** 6. mF and eF from central flicks: vF/v0 = 1/(1 + eF) + m/((1 + eF)·mF), linear in m. */
export function fitFlick(d: Dataset, base: PhysicsParams): Calibration {
  const recs = of(d, 'flick');
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of recs) {
    const size = r.marbles.find((m) => m.id === r.shooter)?.size ?? 'r80';
    const radius = base.radius[size];
    xs.push(RHO_GLASS * (4 / 3) * Math.PI * radius * radius * radius);
    ys.push((r.fingerSpeed ?? NaN) / speedOf(r));
  }
  const n = xs.length;
  // The regression needs flicks of at least two marble sizes (the mass is the regressor) and a
  // spare point for the error: anything less cannot separate mF from eF.
  if (n < 3 || new Set(xs).size < 2) {
    throw new DatasetError('fitFlick needs at least three flicks of at least two marble sizes');
  }
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * ((ys[i] ?? NaN) - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssr = xs.reduce((a, x, i) => a + ((ys[i] ?? NaN) - intercept - slope * x) ** 2, 0);
  const s2 = ssr / Math.max(1, n - 2);
  const varSlope = s2 / sxx;
  const varIntercept = s2 * (1 / n + (mx * mx) / sxx);
  const covAB = (-mx * s2) / sxx;
  // eF = 1/a − 1 and mF = a/b, with first-order error propagation.
  const eF = 1 / intercept - 1;
  const mF = intercept / slope;
  const sigmaE = Math.sqrt(varIntercept) / (intercept * intercept);
  const dA = 1 / slope;
  const dB = -intercept / (slope * slope);
  const sigmaM = Math.sqrt(dA * dA * varIntercept + dB * dB * varSlope + 2 * dA * dB * covAB);
  return {
    estimates: [
      { name: 'flick.fingerMass', value: mF, sigma: sigmaM, unit: 'kg', n },
      { name: 'flick.fingerRestitution', value: eF, sigma: sigmaE, unit: '–', n },
    ],
    overrides: { flick: { fingerMass: mF, fingerRestitution: eF } },
  };
}

function merge(a: ParamOverrides, b: ParamOverrides): ParamOverrides {
  const surfaces: Record<string, object> = { ...a.surfaces };
  for (const [s, o] of Object.entries(b.surfaces ?? {})) surfaces[s] = { ...surfaces[s], ...o };
  return {
    ...a,
    ...b,
    surfaces,
    glass: { ...a.glass, ...b.glass },
    edge: { ...a.edge, ...b.edge },
    flick: { ...a.flick, ...b.flick },
  };
}

/** Every fit in order, each building on the last; the result is a full set of overrides. */
export function calibrate(d: Dataset, base: PhysicsParams = PARAMS_V1): Calibration {
  const estimates: Estimate[] = [];
  let overrides: ParamOverrides = {};
  const steps = [
    [['roll'], fitRolling],
    [['stun'], fitSliding],
    [['head-on', 'cut'], fitImpacts],
    [['hole'], fitRim],
    [['flick'], fitFlick],
  ] as const;
  for (const [kinds, fit] of steps) {
    if (!kinds.every((k) => d.recordings.some((r) => r.kind === k))) continue;
    const c = fit(d, deriveParams(base, overrides));
    estimates.push(...c.estimates);
    overrides = merge(overrides, c.overrides);
  }
  return { estimates, overrides };
}
