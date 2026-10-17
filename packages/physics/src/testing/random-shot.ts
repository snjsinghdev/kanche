/**
 * Seeded random shots for the KPB integrity and determinism suites and the cross-engine harness:
 * random courts (flat, sloped, with walls, a curb or a hole), up to 16 marbles placed at least
 * 1 mm apart, and a random flick. Built only from createRng and allowed arithmetic, so every
 * engine generates the same shots. Exported as @kanche/physics/testing, not from the main entry.
 */
import type { CourtSpec } from '../court.ts';
import { createRng, type Rng } from '../det/rng.ts';
import type { FlickInput } from '../flick.ts';
import { PARAMS_V1 } from '../params/v1/index.ts';
import type { SizeClass, SurfaceId } from '../params/types.ts';
import type { ShotSetup } from '../simulate.ts';
import type { MarbleInit } from '../state.ts';

const SURFACES: readonly SurfaceId[] = ['cement', 'dirt', 'tile', 'sand', 'wet-cement'];
const SIZES: readonly SizeClass[] = ['r80', 'r95', 'r110'];

function pick<T>(rng: Rng, xs: readonly T[]): T {
  const x = xs[rng.nextInt(xs.length)];
  if (x === undefined) throw new Error('empty pick');
  return x;
}

function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng.nextFloat();
}

export interface RandomShotOptions {
  /** Allow sloped heightfields (default true). */
  readonly slopes?: boolean;
  /** Allow walls, a curb and a hole (default true). */
  readonly features?: boolean;
  readonly maxMarbles?: number;
}

/** A gently sloped, slightly bumpy heightfield over [−1, 1]² (slopes up to about 0.9%). */
function heightfield(rng: Rng) {
  const n = 9;
  const cell = 0.25;
  const sx = uniform(rng, -0.005, 0.005);
  const sy = uniform(rng, -0.005, 0.005);
  const heights: number[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      heights.push(sx * (-1 + i * cell) + sy * (-1 + j * cell) + uniform(rng, -0.0002, 0.0002));
    }
  }
  return { x0: -1, y0: -1, cellSize: cell, nx: n, ny: n, heights };
}

export function randomCourt(rng: Rng, options: RandomShotOptions = {}): CourtSpec {
  const features = options.features ?? true;
  const surface = pick(rng, SURFACES);
  const court: {
    surface: SurfaceId;
    bounds: CourtSpec['bounds'];
    walls?: NonNullable<CourtSpec['walls']>;
    blocks?: NonNullable<CourtSpec['blocks']>;
    hole?: NonNullable<CourtSpec['hole']>;
    heightfield?: NonNullable<CourtSpec['heightfield']>;
  } = { surface, bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 } };
  // Blocks and the hole need level ground around them, so a court gets either a sloped
  // heightfield or those features (walls go with either).
  const sloped = (options.slopes ?? true) && rng.nextFloat() < 0.4;
  if (features && rng.nextFloat() < 0.5) {
    court.walls = [
      { x1: -0.95, y1: -0.95, x2: 0.95, y2: -0.95 },
      { x1: 0.95, y1: -0.95, x2: 0.95, y2: 0.95 },
    ];
  }
  if (features && !sloped && rng.nextFloat() < 0.4) {
    const x = uniform(rng, 0.3, 0.6);
    court.blocks = [
      {
        points: [
          { x, y: -0.6 },
          { x: x + 0.15, y: -0.6 },
          { x: x + 0.15, y: -0.2 },
          { x, y: -0.2 },
        ],
        height: uniform(rng, 0.001, 0.006),
      },
    ];
  }
  if (features && !sloped && rng.nextFloat() < 0.5) {
    const radius = uniform(rng, 0.03, 0.06);
    const hole = {
      x: uniform(rng, -0.6, -0.3),
      y: uniform(rng, 0.3, 0.6),
      radius,
      depth: uniform(rng, 0.02, 0.05),
      rimRadius: uniform(rng, 0, 0.006),
    };
    court.hole = hole;
  }
  if (sloped) court.heightfield = heightfield(rng);
  return court;
}

function fits(
  court: CourtSpec,
  placed: readonly MarbleInit[],
  x: number,
  y: number,
  r: number,
): boolean {
  for (const m of placed) {
    const d = Math.sqrt((m.x - x) * (m.x - x) + (m.y - y) * (m.y - y));
    if (d < r + PARAMS_V1.radius[m.size] + 0.001) return false;
  }
  const hole = court.hole;
  const hx = x - (hole?.x ?? 0);
  const hy = y - (hole?.y ?? 0);
  if (
    hole !== undefined &&
    Math.sqrt(hx * hx + hy * hy) < hole.radius + hole.rimRadius + r + 0.002
  ) {
    return false;
  }
  for (const b of court.blocks ?? []) {
    const xs = b.points.map((p) => p.x);
    const ys = b.points.map((p) => p.y);
    if (
      x > Math.min(...xs) - r - 0.002 &&
      x < Math.max(...xs) + r + 0.002 &&
      y > Math.min(...ys) - r - 0.002 &&
      y < Math.max(...ys) + r + 0.002
    ) {
      return false;
    }
  }
  return Math.abs(x) < 0.9 - r && Math.abs(y) < 0.9 - r;
}

export function randomFlick(rng: Rng): FlickInput {
  let dirX = 0;
  let dirY = 0;
  while (dirX === 0 && dirY === 0) {
    dirX = rng.nextInt(65536) - 32768;
    dirY = rng.nextInt(65536) - 32768;
  }
  return {
    dirX,
    dirY,
    fingerSpeed: rng.nextInt(1001),
    spin: rng.nextInt(1201) - 600,
    side: rng.nextInt(601) - 300,
  };
}

/** A random shot: court, marbles at rest, and a flick at marble 0 (the shooter). */
export function randomShot(seed: number, options: RandomShotOptions = {}): ShotSetup {
  const rng = createRng(seed);
  const court = randomCourt(rng, options);
  const n = 1 + rng.nextInt(options.maxMarbles ?? 16);
  const marbles: MarbleInit[] = [];
  for (let id = 0; id < n; id += 1) {
    const size = id === 0 ? pick(rng, SIZES) : 'r80';
    const r = PARAMS_V1.radius[size];
    // A cluster near the middle makes collisions likely.
    for (let tries = 0; tries < 50; tries += 1) {
      const spread = id === 0 ? 0.6 : 0.25;
      const x = uniform(rng, -spread, spread);
      const y = uniform(rng, -spread, spread);
      if (fits(court, marbles, x, y, r)) {
        marbles.push({ id, size, x, y });
        break;
      }
    }
    // The shooter always gets a place: the bottom middle is kept clear of every feature.
    if (id === 0 && marbles.length === 0) marbles.push({ id, size, x: 0, y: -0.85 + r });
  }
  return { court, marbles, shot: { marbleId: 0, flick: randomFlick(rng) } };
}
