/**
 * Court geometry. Physics owns the type; packages/content supplies court data from Phase 2 on.
 *
 * - The ground is a heightfield h(x, y) on a square grid, interpolated bilinearly, with slopes
 *   under 3%. Gentle slopes act through aSlope = −g·∇h (small-slope model, docs/physics.md).
 * - Steep features are analytic geometry, never heightfield (Phase 1 prompt):
 *   - walls: vertical segments taller than any marble, contacted at centre height;
 *   - blocks: convex polygons raised by less than the smallest radius (steps and curbs). Their top
 *     edges and corners are contact features, so marbles can climb, hop or pivot over them;
 *   - the hole: radius Rh, depth D and a rounded rim of fillet radius rF.
 * - Leaving `bounds` is "out".
 *
 * Blocks and the hole must sit on flat ground, so the small-slope ground model and the analytic
 * features meet without a seam. Everything is validated; bad geometry throws `invalid-court`.
 */

import { defined, PhysicsError } from './errors.ts';
import { SURFACES, type SurfaceId } from './params/types.ts';

export interface Bounds {
  readonly xMin: number; // m
  readonly xMax: number; // m
  readonly yMin: number; // m
  readonly yMax: number; // m
}

export interface HeightfieldSpec {
  /** Grid origin, the (0, 0) vertex (m). */
  readonly x0: number;
  readonly y0: number;
  /** Square cell edge (m). */
  readonly cellSize: number;
  /** Vertices along x and y (at least 2 each). */
  readonly nx: number;
  readonly ny: number;
  /** Ground height at each vertex, row-major from (x0, y0): heights[j·nx + i] (m). */
  readonly heights: readonly number[];
}

export interface WallSpec {
  readonly x1: number; // m
  readonly y1: number; // m
  readonly x2: number; // m
  readonly y2: number; // m
}

export interface BlockSpec {
  /** Convex polygon, counter-clockwise seen from above (m). */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** Height above the ground it stands on, 0 < height < the smallest marble radius (m). */
  readonly height: number;
}

export interface HoleSpec {
  readonly x: number; // m, centre
  readonly y: number; // m
  readonly radius: number; // m, Rh: the radius of the vertical wall
  readonly depth: number; // m, D: from ground level to the floor
  readonly rimRadius: number; // m, rF: fillet radius of the rounded rim (0 is a sharp edge)
}

export interface CourtSpec {
  readonly surface: SurfaceId;
  readonly bounds: Bounds;
  readonly heightfield?: HeightfieldSpec;
  readonly walls?: readonly WallSpec[];
  readonly blocks?: readonly BlockSpec[];
  readonly hole?: HoleSpec;
}

/** Steepest ground the small-slope model accepts (–). */
export const MAX_SLOPE = 0.03;
/** Blocks must be lower than the smallest marble so only their top edges are ever touched (m). */
export const MAX_BLOCK_HEIGHT = 0.008;
/** The largest court the simulation accepts along either axis (m). */
export const MAX_COURT_SIZE = 50;
/** Analytic features keep this clearance of flat ground around them (m): the largest radius. */
const FLAT_MARGIN = 0.011;

// ---------------------------------------------------------------------------------------------
// The precomputed model the simulation queries.

export interface Heightfield {
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly nx: number;
  readonly ny: number;
  readonly heights: readonly number[];
}

/** h = c0 + cx·x + cy·y + cxy·x·y inside one cell (absolute coordinates, m). */
export interface CellPatch {
  readonly i: number;
  readonly j: number;
  readonly c0: number;
  readonly cx: number;
  readonly cy: number;
  readonly cxy: number;
}

export interface EdgeFeature {
  readonly kind: 'edge';
  readonly id: number;
  /** Start point and unit direction along the edge (m, –). */
  readonly ax: number;
  readonly ay: number;
  readonly dx: number;
  readonly dy: number;
  readonly length: number; // m
  /** Outward horizontal normal, pointing away from the block (–). */
  readonly ox: number;
  readonly oy: number;
  /** Height of the edge line (m). */
  readonly z: number;
  readonly block: number;
}

export interface CornerFeature {
  readonly kind: 'corner';
  readonly id: number;
  readonly x: number; // m
  readonly y: number; // m
  readonly z: number; // m
  /** Outward normals of the edge before and after this corner (–). */
  readonly o1x: number;
  readonly o1y: number;
  readonly o2x: number;
  readonly o2y: number;
  readonly block: number;
}

export interface WallFeature {
  readonly kind: 'wall';
  readonly id: number;
  readonly ax: number; // m
  readonly ay: number; // m
  readonly dx: number; // – unit direction
  readonly dy: number; // –
  readonly length: number; // m
}

export interface BlockModel {
  readonly index: number;
  /** Top face height (m). */
  readonly z: number;
  readonly edges: readonly EdgeFeature[];
  readonly corners: readonly CornerFeature[];
  /** Bounding box of the polygon (m). */
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

export interface HoleModel {
  readonly cx: number; // m
  readonly cy: number; // m
  readonly rh: number; // m, wall radius
  readonly rf: number; // m, rim fillet radius
  /** Radius of the rim torus's centre circle, Rh + rF (m). */
  readonly rc: number;
  /** Ground level around the hole (m). */
  readonly zTop: number;
  /** Floor height (m). */
  readonly zFloor: number;
  /** Height of the torus's centre circle, zTop − rF (m). */
  readonly zc: number;
}

export interface Court {
  readonly spec: CourtSpec;
  readonly surface: SurfaceId;
  readonly bounds: Bounds;
  readonly heightfield: Heightfield | undefined;
  readonly walls: readonly WallFeature[];
  readonly blocks: readonly BlockModel[];
  readonly hole: HoleModel | undefined;
}

function invalid(message: string): never {
  throw new PhysicsError('invalid-court', message);
}

function finite(what: string, ...values: readonly number[]): void {
  for (const v of values) if (!Number.isFinite(v)) invalid(`${what} must be finite`);
}

/** Ground height of the heightfield at (x, y), or 0 without one (m). */
export function groundHeight(court: Court, x: number, y: number): number {
  const hf = court.heightfield;
  if (hf === undefined) return 0;
  const p = cellPatch(hf, x, y);
  return p.c0 + p.cx * x + p.cy * y + p.cxy * x * y;
}

function vertex(hf: Heightfield, i: number, j: number): number {
  return defined(hf.heights[j * hf.nx + i], 'heightfield vertex');
}

/** The bilinear patch of the cell holding (x, y). Points outside the grid use the edge cell. */
export function cellPatch(hf: Heightfield, x: number, y: number): CellPatch {
  const i = Math.min(hf.nx - 2, Math.max(0, Math.floor((x - hf.x0) / hf.cell)));
  const j = Math.min(hf.ny - 2, Math.max(0, Math.floor((y - hf.y0) / hf.cell)));
  return patchOf(hf, i, j);
}

export function patchOf(hf: Heightfield, i: number, j: number): CellPatch {
  const h00 = vertex(hf, i, j);
  const h10 = vertex(hf, i + 1, j);
  const h01 = vertex(hf, i, j + 1);
  const h11 = vertex(hf, i + 1, j + 1);
  // In local coordinates s, t ∈ [0, 1]: h = h00 + (h10−h00)s + (h01−h00)t + (h00−h10−h01+h11)st.
  const xa = hf.x0 + i * hf.cell;
  const ya = hf.y0 + j * hf.cell;
  const inv = 1 / hf.cell;
  const a = h10 - h00;
  const b = h01 - h00;
  const c = h00 - h10 - h01 + h11;
  // Expand s = (x − xa)/cell, t = (y − ya)/cell into absolute x and y.
  const cxy = c * inv * inv;
  const cx = a * inv - cxy * ya;
  const cy = b * inv - cxy * xa;
  const c0 = h00 - a * inv * xa - b * inv * ya + cxy * xa * ya;
  return { i, j, c0, cx, cy, cxy };
}

function buildHeightfield(spec: HeightfieldSpec, bounds: Bounds): Heightfield {
  const { x0, y0, cellSize, nx, ny, heights } = spec;
  finite('heightfield origin and cell size', x0, y0, cellSize);
  if (!(cellSize > 0)) invalid('heightfield cellSize must be positive');
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2 || nx * ny > 1_000_000) {
    invalid('heightfield needs integer nx, ny >= 2 and at most 1,000,000 vertices');
  }
  if (heights.length !== nx * ny) invalid('heightfield heights must have nx·ny entries');
  finite('heightfield heights', ...heights);
  for (const h of heights) if (Math.abs(h) > 1) invalid('heightfield heights must be within ±1 m');
  if (
    x0 > bounds.xMin ||
    y0 > bounds.yMin ||
    x0 + (nx - 1) * cellSize < bounds.xMax ||
    y0 + (ny - 1) * cellSize < bounds.yMax
  ) {
    invalid('heightfield must cover the court bounds');
  }
  const hf: Heightfield = { x0, y0, cell: cellSize, nx, ny, heights };
  // |∇h|² is convex on a bilinear cell, so its maximum is at a corner.
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const p = patchOf(hf, i, j);
      for (const [x, y] of [
        [x0 + i * cellSize, y0 + j * cellSize],
        [x0 + (i + 1) * cellSize, y0 + j * cellSize],
        [x0 + i * cellSize, y0 + (j + 1) * cellSize],
        [x0 + (i + 1) * cellSize, y0 + (j + 1) * cellSize],
      ] as const) {
        const gx = p.cx + p.cxy * y;
        const gy = p.cy + p.cxy * x;
        if (gx * gx + gy * gy > MAX_SLOPE * MAX_SLOPE) {
          invalid(
            `heightfield slope over ${String(MAX_SLOPE)} in cell (${String(i)}, ${String(j)})`,
          );
        }
      }
    }
  }
  return hf;
}

/** Throw unless the heightfield is exactly level over the box; return that level (m). */
function flatLevel(
  hf: Heightfield | undefined,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  what: string,
): number {
  if (hf === undefined) return 0;
  const i0 = Math.max(0, Math.floor((xMin - hf.x0) / hf.cell));
  const i1 = Math.min(hf.nx - 1, Math.ceil((xMax - hf.x0) / hf.cell));
  const j0 = Math.max(0, Math.floor((yMin - hf.y0) / hf.cell));
  const j1 = Math.min(hf.ny - 1, Math.ceil((yMax - hf.y0) / hf.cell));
  const level = vertex(hf, i0, j0);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      if (vertex(hf, i, j) !== level) invalid(`${what} must stand on level ground`);
    }
  }
  return level;
}

function buildWall(w: WallSpec, id: number): WallFeature {
  finite('wall', w.x1, w.y1, w.x2, w.y2);
  const ex = w.x2 - w.x1;
  const ey = w.y2 - w.y1;
  const length = Math.sqrt(ex * ex + ey * ey);
  if (!(length >= 0.001)) invalid('a wall must be at least 1 mm long');
  return { kind: 'wall', id, ax: w.x1, ay: w.y1, dx: ex / length, dy: ey / length, length };
}

function buildBlock(
  b: BlockSpec,
  index: number,
  hf: Heightfield | undefined,
  ids: { next: number },
): BlockModel {
  const pts = b.points;
  if (pts.length < 3 || pts.length > 64) invalid('a block needs 3 to 64 points');
  finite('block height', b.height);
  if (!(b.height > 0 && b.height < MAX_BLOCK_HEIGHT)) {
    invalid(`block height must be in (0, ${String(MAX_BLOCK_HEIGHT)}) m`);
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of pts) {
    finite('block point', p.x, p.y);
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  }
  const base = flatLevel(
    hf,
    xMin - FLAT_MARGIN,
    xMax + FLAT_MARGIN,
    yMin - FLAT_MARGIN,
    yMax + FLAT_MARGIN,
    'a block',
  );
  const z = base + b.height;
  const edges: EdgeFeature[] = [];
  const n = pts.length;
  pts.forEach((a, k) => {
    const c = defined(pts[(k + 1) % n], 'block point');
    const d = defined(pts[(k + 2) % n], 'block point');
    const ex = c.x - a.x;
    const ey = c.y - a.y;
    const length = Math.sqrt(ex * ex + ey * ey);
    if (!(length >= 0.001)) invalid('block edges must be at least 1 mm long');
    // Counter-clockwise and strictly convex: every turn is to the left.
    const cross = ex * (d.y - c.y) - ey * (d.x - c.x);
    if (!(cross > 0)) invalid('a block must be a strictly convex, counter-clockwise polygon');
    const dx = ex / length;
    const dy = ey / length;
    // Outward is to the right of a counter-clockwise edge.
    edges.push({
      kind: 'edge',
      id: ids.next++,
      ax: a.x,
      ay: a.y,
      dx,
      dy,
      length,
      ox: dy,
      oy: -dx,
      z,
      block: index,
    });
  });
  const corners: CornerFeature[] = edges.map((e2, k) => {
    const e1 = defined(edges[(k + n - 1) % n], 'block edge');
    return {
      kind: 'corner',
      id: ids.next++,
      x: e2.ax,
      y: e2.ay,
      z,
      o1x: e1.ox,
      o1y: e1.oy,
      o2x: e2.ox,
      o2y: e2.oy,
      block: index,
    };
  });
  return { index, z, edges, corners, xMin, xMax, yMin, yMax };
}

function buildHole(h: HoleSpec, hf: Heightfield | undefined): HoleModel {
  finite('hole', h.x, h.y, h.radius, h.depth, h.rimRadius);
  if (!(h.radius >= 0.012 && h.radius <= 0.5)) invalid('hole radius must be in [0.012, 0.5] m');
  if (!(h.depth > 0 && h.depth <= 0.5)) invalid('hole depth must be in (0, 0.5] m');
  if (!(h.rimRadius >= 0 && h.rimRadius <= h.depth && h.rimRadius <= 0.05)) {
    invalid('hole rimRadius must be in [0, min(depth, 0.05)] m');
  }
  const rc = h.radius + h.rimRadius;
  const r = rc + FLAT_MARGIN;
  const zTop = flatLevel(hf, h.x - r, h.x + r, h.y - r, h.y + r, 'the hole');
  return {
    cx: h.x,
    cy: h.y,
    rh: h.radius,
    rf: h.rimRadius,
    rc,
    zTop,
    zFloor: zTop - h.depth,
    zc: zTop - h.rimRadius,
  };
}

/** Validate a court and precompute its geometry. */
export function buildCourt(spec: CourtSpec): Court {
  if (!(SURFACES as readonly string[]).includes(spec.surface)) {
    invalid(`unknown surface "${spec.surface}"`);
  }
  const { bounds } = spec;
  finite('bounds', bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax);
  if (
    !(bounds.xMax > bounds.xMin && bounds.yMax > bounds.yMin) ||
    bounds.xMax - bounds.xMin > MAX_COURT_SIZE ||
    bounds.yMax - bounds.yMin > MAX_COURT_SIZE
  ) {
    invalid(`bounds must be a non-empty box at most ${String(MAX_COURT_SIZE)} m across`);
  }
  const heightfield =
    spec.heightfield === undefined ? undefined : buildHeightfield(spec.heightfield, bounds);
  const walls = (spec.walls ?? []).map((w, i) => buildWall(w, i));
  const ids = { next: 0 };
  const blocks = (spec.blocks ?? []).map((b, i) => buildBlock(b, i, heightfield, ids));
  const hole = spec.hole === undefined ? undefined : buildHole(spec.hole, heightfield);
  // Features may not overlap: compare padded bounding boxes (conservative).
  const boxes = blocks.map((b) => [b.xMin, b.xMax, b.yMin, b.yMax] as const);
  if (hole !== undefined) {
    const r = hole.rc;
    boxes.push([hole.cx - r, hole.cx + r, hole.cy - r, hole.cy + r]);
  }
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a[1] + 2 * FLAT_MARGIN <= b[0] ||
        b[1] + 2 * FLAT_MARGIN <= a[0] ||
        a[3] + 2 * FLAT_MARGIN <= b[2] ||
        b[3] + 2 * FLAT_MARGIN <= a[2];
      if (!apart) invalid('blocks and the hole must be at least 22 mm apart');
    }
    if (a[0] < bounds.xMin || a[1] > bounds.xMax || a[2] < bounds.yMin || a[3] > bounds.yMax) {
      invalid('blocks and the hole must lie inside the bounds');
    }
  });
  return {
    spec,
    surface: spec.surface,
    bounds,
    heightfield,
    walls,
    blocks,
    hole,
  };
}
