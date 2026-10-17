/**
 * Static contact features and their geometry. Every gap is a distance (Lipschitz constant 1 in
 * the centre position, slightly more on a sloped heightfield), so conservative advancement can
 * bound how fast it closes (ADR-0006). Normals point from the feature to the marble's centre.
 *
 * A feature's gap only counts where the feature is the nearest part of the surface: the edge of
 * a block within its wedge, the rim's torus within its quarter, and so on. Together the features
 * form a continuous distance to the whole court surface (docs/physics.md, "Contact features").
 */

import {
  cellPatch,
  type BlockModel,
  type CornerFeature,
  type Court,
  type EdgeFeature,
  type HoleModel,
  type WallFeature,
} from '../court.ts';

export type StaticFeature =
  | { readonly kind: 'wall'; readonly wall: WallFeature }
  | { readonly kind: 'edge'; readonly edge: EdgeFeature }
  | { readonly kind: 'corner'; readonly corner: CornerFeature }
  | { readonly kind: 'top'; readonly block: BlockModel }
  | { readonly kind: 'base' }
  | { readonly kind: 'rim' }
  | { readonly kind: 'pit-wall' }
  | { readonly kind: 'floor' };

export type FeatureKind = StaticFeature['kind'];

/** A gap and its contact normal. `valid` is false where the feature isn't the nearest surface. */
export interface FeatureGap {
  valid: boolean;
  gap: number; // m
  nx: number; // –
  ny: number; // –
  nz: number; // –
  /** Gradient of the gap in the centre position: the normal, except on a sloped heightfield. */
  gx: number;
  gy: number;
  gz: number;
  /** Lipschitz constant of the gap in the centre position (–). */
  lip: number;
}

export function newGap(): FeatureGap {
  return { valid: false, gap: Infinity, nx: 0, ny: 0, nz: 1, gx: 0, gy: 0, gz: 1, lip: 1 };
}

/** Slopes stay under 3% (court.ts), so a heightfield gap changes at most this fast (–). */
export const HEIGHTFIELD_LIP = 1.001;

/** Every static feature of a court, in a fixed order (features are tie-broken by this order). */
export function staticFeatures(court: Court): StaticFeature[] {
  const out: StaticFeature[] = [{ kind: 'base' }];
  for (const wall of court.walls) out.push({ kind: 'wall', wall });
  for (const block of court.blocks) {
    out.push({ kind: 'top', block });
    for (const edge of block.edges) out.push({ kind: 'edge', edge });
    for (const corner of block.corners) out.push({ kind: 'corner', corner });
  }
  if (court.hole !== undefined) {
    out.push({ kind: 'rim' }, { kind: 'pit-wall' }, { kind: 'floor' });
  }
  return out;
}

/** True when (x, y) lies inside the convex block (on the inner side of every edge). */
export function insideBlock(block: BlockModel, x: number, y: number): boolean {
  for (const e of block.edges) {
    if ((x - e.ax) * e.ox + (y - e.ay) * e.oy > 0) return false;
  }
  return true;
}

function setGap(
  out: FeatureGap,
  gap: number,
  nx: number,
  ny: number,
  nz: number,
  lip: number,
): FeatureGap {
  out.valid = true;
  out.gap = gap;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.gx = nx;
  out.gy = ny;
  out.gz = nz;
  out.lip = lip;
  return out;
}

function noGap(out: FeatureGap): FeatureGap {
  out.valid = false;
  out.gap = Infinity;
  return out;
}

/** Horizontal distance from the hole axis (m). */
export function holeRadial(hole: HoleModel, x: number, y: number): number {
  const dx = x - hole.cx;
  const dy = y - hole.cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Gap between a sphere of radius r centred at (x, y, z) and one feature. */
export function featureGap(
  court: Court,
  f: StaticFeature,
  r: number,
  x: number,
  y: number,
  z: number,
  out: FeatureGap,
): FeatureGap {
  switch (f.kind) {
    case 'wall': {
      const w = f.wall;
      const s = Math.min(w.length, Math.max(0, (x - w.ax) * w.dx + (y - w.ay) * w.dy));
      const dx = x - (w.ax + s * w.dx);
      const dy = y - (w.ay + s * w.dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) return noGap(out);
      return setGap(out, d - r, dx / d, dy / d, 0, 1);
    }
    case 'edge': {
      const e = f.edge;
      const s = (x - e.ax) * e.dx + (y - e.ay) * e.dy;
      if (s < 0 || s > e.length) return noGap(out);
      const dx = x - (e.ax + s * e.dx);
      const dy = y - (e.ay + s * e.dy);
      const dz = z - e.z;
      // Inside the edge's wedge: above the top face's plane and outside the block.
      if (dz < 0 || dx * e.ox + dy * e.oy < 0) return noGap(out);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d === 0) return noGap(out);
      return setGap(out, d - r, dx / d, dy / d, dz / d, 1);
    }
    case 'corner': {
      const c = f.corner;
      const dx = x - c.x;
      const dy = y - c.y;
      const dz = z - c.z;
      // The corner owns the wedge beyond the end of the incoming edge and before the start of the
      // outgoing one. An edge with outward normal (ox, oy) runs along (−oy, ox).
      const along1 = dx * -c.o1y + dy * c.o1x;
      const along2 = dx * -c.o2y + dy * c.o2x;
      if (dz < 0 || along1 < 0 || along2 > 0) return noGap(out);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d === 0) return noGap(out);
      return setGap(out, d - r, dx / d, dy / d, dz / d, 1);
    }
    case 'top': {
      if (!insideBlock(f.block, x, y)) return noGap(out);
      return setGap(out, z - r - f.block.z, 0, 0, 1, 1);
    }
    case 'base': {
      const hole = court.hole;
      if (hole !== undefined && holeRadial(hole, x, y) < hole.rc) return noGap(out);
      const hf = court.heightfield;
      if (hf === undefined) return setGap(out, z - r, 0, 0, 1, 1);
      const p = cellPatch(hf, x, y);
      const h = p.c0 + p.cx * x + p.cy * y + p.cxy * x * y;
      // Impacts use the small-slope normal +z; the gap's gradient keeps the true slope.
      setGap(out, z - r - h, 0, 0, 1, HEIGHTFIELD_LIP);
      out.gx = -(p.cx + p.cxy * y);
      out.gy = -(p.cy + p.cxy * x);
      return out;
    }
    case 'rim': {
      const hole = court.hole;
      if (hole === undefined) return noGap(out);
      const rho = holeRadial(hole, x, y);
      if (rho > hole.rc || z < hole.zc || rho === 0) return noGap(out);
      const ex = (x - hole.cx) / rho;
      const ey = (y - hole.cy) / rho;
      const dr = rho - hole.rc; // ≤ 0
      const dz = z - hole.zc; // ≥ 0
      const d = Math.sqrt(dr * dr + dz * dz);
      if (d === 0) return noGap(out);
      return setGap(out, d - r - hole.rf, (dr / d) * ex, (dr / d) * ey, dz / d, 1);
    }
    case 'pit-wall': {
      const hole = court.hole;
      if (hole === undefined) return noGap(out);
      const rho = holeRadial(hole, x, y);
      if (z > hole.zc || rho === 0) return noGap(out);
      const ex = (x - hole.cx) / rho;
      const ey = (y - hole.cy) / rho;
      return setGap(out, hole.rh - rho - r, -ex, -ey, 0, 1);
    }
    case 'floor': {
      const hole = court.hole;
      if (hole === undefined || holeRadial(hole, x, y) > hole.rh) return noGap(out);
      return setGap(out, z - r - hole.zFloor, 0, 0, 1, 1);
    }
  }
}

/** Whether a marble can rest on (be supported by) this feature, or only bounce off it. */
export function canSupport(f: StaticFeature): boolean {
  return f.kind !== 'wall' && f.kind !== 'pit-wall';
}

/** A stable sort key for a feature: kind order, then its own index. */
export function featureKey(f: StaticFeature): number {
  switch (f.kind) {
    case 'base':
      return 0;
    case 'wall':
      return 1_000 + f.wall.id;
    case 'top':
      return 100_000 + f.block.index;
    case 'edge':
      return 200_000 + f.edge.id;
    case 'corner':
      return 200_000 + f.corner.id;
    case 'rim':
      return 900_001;
    case 'pit-wall':
      return 900_002;
    case 'floor':
      return 900_003;
  }
}
