/**
 * Equations of motion (docs/physics.md, "Forces and motion"). One derivative function per mode;
 * each also returns the power of every dissipative term, so the energy ledger integrates with the
 * same RK4 stages as the motion.
 *
 * Frame: x right, y up the screen, z up out of the ground; g = 9.81 m/s² along −z. Slip at the
 * ground contact is u = (vx − R·wy, vy + R·wx).
 *
 * Planes use the prompt's small-slope model: the ground acts through aSlope = −g·∇h, the normal
 * force is m·g, and the vertical velocity of following gentle terrain is not modelled. The rim,
 * edges and corners are curved supports: the centre is held at a fixed distance from a curve, the
 * normal force comes from that constraint, and Coulomb friction acts at the true contact point.
 */

import type { CellPatch, HoleModel } from '../court.ts';
import type { Support } from './body.ts';
import type { Dyn } from './dyn.ts';

export type Mode = 'air' | 'slide' | 'roll' | 'spin';

/** Everything a derivative needs that stays fixed for one substep. */
export interface Ctx {
  mode: Mode;
  support: Support | null;
  g: number; // m/s²
  r: number; // m
  m: number; // kg
  inertia: number; // kg·m²
  dragK: number; // 1/m
  /** Base-ground cell patch with a heightfield, else null (flat). */
  patch: CellPatch | null;
  muS: number; // –
  muSp: number; // –
  /** Rolling resistance on the frozen table segment: muR = rollA + rollB·|v|. */
  rollA: number; // –
  rollB: number; // s/m
  /** Sign of the spin about the vertical, fixed for the substep (−1, 0 or 1). */
  sgnWz: number;
  /** When true, Coulomb friction acts along (fdx, fdy, fdz) instead of the stage's own slip. */
  fixed: boolean;
  fdx: number;
  fdy: number;
  fdz: number;
  /**
   * The slip (or speed) is starting from zero along the fixed direction: the first substep is
   * kept short, and later ones grow geometrically with the stop refinement.
   */
  restart: boolean;
  /**
   * Curved sliding with a slip too small for its direction to be followed explicitly: friction
   * acts at full strength in the direction rolling would need (the quasi-static slip model).
   */
  slaved: boolean;
  hole: HoleModel | undefined;
}

export function newCtx(): Ctx {
  return {
    mode: 'air',
    support: null,
    g: 0,
    r: 0,
    m: 0,
    inertia: 0,
    dragK: 0,
    patch: null,
    muS: 0,
    muSp: 0,
    rollA: 0,
    rollB: 0,
    sgnWz: 0,
    fixed: false,
    fdx: 0,
    fdy: 0,
    fdz: 0,
    restart: false,
    slaved: false,
    hole: undefined,
  };
}

/** Geometry of a curved support at one state. */
export interface CurvedGeo {
  /** Contact normal, from the support curve to the centre (–). */
  nx: number;
  ny: number;
  nz: number;
  /** Rate of change of the normal (1/s). */
  ndx: number;
  ndy: number;
  ndz: number;
  /** Distance from the curve to the centre (m). */
  dist: number;
}

export function newGeo(): CurvedGeo {
  return { nx: 0, ny: 0, nz: 1, ndx: 0, ndy: 0, ndz: 0, dist: 0 };
}

/** Normal and its rate for a curved support (rim circle, edge line or corner point). */
export function curvedGeometry(ctx: Ctx, s: Dyn, out: CurvedGeo): CurvedGeo {
  const sup = ctx.support;
  // q is the nearest point of the support curve; (qdx, qdy, qdz) its velocity.
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let qdx = 0;
  let qdy = 0;
  if (sup !== null && sup.kind === 'edge') {
    const e = sup.edge;
    const t = (s.x - e.ax) * e.dx + (s.y - e.ay) * e.dy;
    qx = e.ax + t * e.dx;
    qy = e.ay + t * e.dy;
    qz = e.z;
    const vt = s.vx * e.dx + s.vy * e.dy;
    qdx = vt * e.dx;
    qdy = vt * e.dy;
  } else if (sup !== null && sup.kind === 'corner') {
    qx = sup.corner.x;
    qy = sup.corner.y;
    qz = sup.corner.z;
  } else if (ctx.hole !== undefined) {
    // The rim: a horizontal circle of radius rc at height zc around the hole's axis.
    const h = ctx.hole;
    const rx = s.x - h.cx;
    const ry = s.y - h.cy;
    const rho = Math.sqrt(rx * rx + ry * ry);
    const ex = rx / rho;
    const ey = ry / rho;
    qx = h.cx + h.rc * ex;
    qy = h.cy + h.rc * ey;
    qz = h.zc;
    // The nearest point turns with the azimuthal velocity: q̇ = rc·(v·eφ)/ρ·eφ, eφ = (−ey, ex).
    const vphi = -s.vx * ey + s.vy * ex;
    const k = (h.rc * vphi) / rho;
    qdx = -k * ey;
    qdy = k * ex;
  }
  const dx = s.x - qx;
  const dy = s.y - qy;
  const dz = s.z - qz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  // ṅ = (ḋ − n·(n·ḋ))/|d| with ḋ = v − q̇.
  const ddx = s.vx - qdx;
  const ddy = s.vy - qdy;
  const ddz = s.vz;
  const along = nx * ddx + ny * ddy + nz * ddz;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.ndx = (ddx - nx * along) / dist;
  out.ndy = (ddy - ny * along) / dist;
  out.ndz = (ddz - nz * along) / dist;
  out.dist = dist;
  return out;
}

/** Slope acceleration −g·∇h at (x, y) on the frozen cell patch (m/s²). */
function slopeX(ctx: Ctx, y: number): number {
  const p = ctx.patch;
  return p === null ? 0 : -ctx.g * (p.cx + p.cxy * y);
}

function slopeY(ctx: Ctx, x: number): number {
  const p = ctx.patch;
  return p === null ? 0 : -ctx.g * (p.cy + p.cxy * x);
}

const geo = newGeo();
const geo2 = newGeo();
const slaveForce = { x: 0, y: 0, z: 0 };

/** Write ds/dt for state s into out. */
export function derivative(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  out.eSlide = 0;
  out.eRoll = 0;
  out.eSpin = 0;
  out.eDrag = 0;
  out.z = 0;
  out.vz = 0;
  switch (ctx.mode) {
    case 'air':
      return airborne(ctx, s, out);
    case 'spin':
      out.x = 0;
      out.y = 0;
      out.vx = 0;
      out.vy = 0;
      out.wx = 0;
      out.wy = 0;
      spinFriction(ctx, s, out);
      return out;
    case 'slide':
      return ctx.support !== null && isCurved(ctx.support)
        ? curvedSlide(ctx, s, out)
        : planeSlide(ctx, s, out);
    case 'roll':
      return ctx.support !== null && isCurved(ctx.support)
        ? curvedRoll(ctx, s, out)
        : planeRoll(ctx, s, out);
  }
}

export function isCurved(s: Support): boolean {
  return s.kind === 'rim' || s.kind === 'edge' || s.kind === 'corner';
}

function airborne(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  // Gravity and quadratic drag F = −cD·|v|·v; spin stays constant (no Magnus in v1).
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  const d = ctx.dragK * speed;
  out.x = s.vx;
  out.y = s.vy;
  out.z = s.vz;
  out.vx = -d * s.vx;
  out.vy = -d * s.vy;
  out.vz = -ctx.g - d * s.vz;
  out.wx = 0;
  out.wy = 0;
  out.wz = 0;
  out.eDrag = ctx.m * d * speed * speed;
  return out;
}

/** dwz/dt = −(5·muSp·g/(2R))·sign(wz), with the sign fixed for the substep. */
function spinFriction(ctx: Ctx, s: Dyn, out: Dyn): void {
  const rate = (5 * ctx.muSp * ctx.g) / (2 * ctx.r);
  out.wz = -rate * ctx.sgnWz;
  // Power: I·rate·|wz| = m·R·muSp·g·|wz|.
  out.eSpin = ctx.m * ctx.r * ctx.muSp * ctx.g * ctx.sgnWz * s.wz;
}

function planeSlide(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  const g = ctx.g;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const d = ctx.dragK * speed;
  const ux = s.vx - ctx.r * s.wy;
  const uy = s.vy + ctx.r * s.wx;
  let dx: number;
  let dy: number;
  if (ctx.fixed) {
    dx = ctx.fdx;
    dy = ctx.fdy;
  } else {
    const u = Math.sqrt(ux * ux + uy * uy);
    dx = ux / u;
    dy = uy / u;
  }
  const f = ctx.muS * g;
  const sx = slopeX(ctx, s.y);
  const sy = slopeY(ctx, s.x);
  out.x = s.vx;
  out.y = s.vy;
  // z itself is snapped to the ground after each substep; its rate feeds the Hermite curves.
  out.z = -(sx * s.vx + sy * s.vy) / g;
  out.vx = -f * dx + sx - d * s.vx;
  out.vy = -f * dy + sy - d * s.vy;
  const k = (5 * f) / (2 * ctx.r);
  out.wx = -k * dy;
  out.wy = k * dx;
  spinFriction(ctx, s, out);
  // Friction power F·u at the contact point, and drag power cD·|v|³.
  out.eSlide = ctx.m * f * (ux * dx + uy * dy);
  out.eDrag = ctx.m * d * speed * speed;
  return out;
}

function planeRoll(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  const g = ctx.g;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const d = ctx.dragK * speed;
  let dx: number;
  let dy: number;
  if (ctx.fixed) {
    dx = ctx.fdx;
    dy = ctx.fdy;
  } else {
    dx = s.vx / speed;
    dy = s.vy / speed;
  }
  const muR = ctx.rollA + ctx.rollB * speed;
  const sx = slopeX(ctx, s.y);
  const sy = slopeY(ctx, s.x);
  // dv/dt = −muR·g·v̂ + (5/7)·(aSlope − (cD/m)·|v|·v), and ω stays tied to v.
  const ax = -muR * g * dx + (5 / 7) * (sx - d * s.vx);
  const ay = -muR * g * dy + (5 / 7) * (sy - d * s.vy);
  out.x = s.vx;
  out.y = s.vy;
  out.z = -(sx * s.vx + sy * s.vy) / g;
  out.vx = ax;
  out.vy = ay;
  out.wx = -ay / ctx.r;
  out.wy = ax / ctx.r;
  spinFriction(ctx, s, out);
  // A rolling marble's kinetic energy is (7/10)·m·|v|², so the resistance dissipates (7/5)·m·a·|v|.
  out.eRoll = 1.4 * ctx.m * muR * g * (s.vx * dx + s.vy * dy);
  out.eDrag = ctx.m * d * speed * speed;
  return out;
}

/** Normal force on a curved support from the constraint |p − q| = const (N). */
function curvedNormal(ctx: Ctx, s: Dyn, gm: CurvedGeo, d: number): number {
  const vnd = s.vx * gm.ndx + s.vy * gm.ndy + s.vz * gm.ndz;
  const vn = s.vx * gm.nx + s.vy * gm.ny + s.vz * gm.nz;
  // m·a·n = −m·g·nz + N − m·d·(v·n), and a·n = −v·ṅ on the constraint.
  return ctx.m * (ctx.g * gm.nz - vnd + d * vn);
}

/** N on the current curved support for state s, for the take-off event (N). */
export function supportNormalForce(ctx: Ctx, s: Dyn): number {
  const gm = curvedGeometry(ctx, s, geo);
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  return curvedNormal(ctx, s, gm, ctx.dragK * speed);
}

function curvedSlide(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  const gm = curvedGeometry(ctx, s, geo);
  const { nx, ny, nz } = gm;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  const d = ctx.dragK * speed;
  const n = curvedNormal(ctx, s, gm, d);
  const r = ctx.r;
  // Contact-point velocity u = v + ω × (−R·n), tangential part.
  let ux = s.vx - r * (s.wy * nz - s.wz * ny);
  let uy = s.vy - r * (s.wz * nx - s.wx * nz);
  let uz = s.vz - r * (s.wx * ny - s.wy * nx);
  const un = ux * nx + uy * ny + uz * nz;
  ux -= un * nx;
  uy -= un * ny;
  uz -= un * nz;
  let dx: number;
  let dy: number;
  let dz: number;
  if (ctx.slaved) {
    // The slip grows against the friction that rolling would need, so it points along −F.
    const need = rollingFrictionNeeded(ctx, s, slaveForce);
    dx = -slaveForce.x / need;
    dy = -slaveForce.y / need;
    dz = -slaveForce.z / need;
  } else if (ctx.fixed) {
    dx = ctx.fdx;
    dy = ctx.fdy;
    dz = ctx.fdz;
  } else {
    const u = Math.sqrt(ux * ux + uy * uy + uz * uz);
    dx = ux / u;
    dy = uy / u;
    dz = uz / u;
  }
  const f = ctx.muS * n; // friction magnitude (N)
  const fx = -f * dx;
  const fy = -f * dy;
  const fz = -f * dz;
  const im = 1 / ctx.m;
  out.x = s.vx;
  out.y = s.vy;
  out.z = s.vz;
  out.vx = (n * nx + fx) * im - d * s.vx;
  out.vy = (n * ny + fy) * im - d * s.vy;
  out.vz = (n * nz + fz) * im - d * s.vz - ctx.g;
  // Torque (−R·n) × F.
  const k = -r / ctx.inertia;
  out.wx = k * (ny * fz - nz * fy);
  out.wy = k * (nz * fx - nx * fz);
  out.wz = k * (nx * fy - ny * fx);
  out.eSlide = f * (ux * dx + uy * dy + uz * dz);
  out.eDrag = ctx.m * d * speed * speed;
  return out;
}

function curvedRoll(ctx: Ctx, s: Dyn, out: Dyn): Dyn {
  const gm = curvedGeometry(ctx, s, geo);
  const { nx, ny, nz, ndx, ndy, ndz } = gm;
  const r = ctx.r;
  const g = ctx.g;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  const d = ctx.dragK * speed;
  const n = curvedNormal(ctx, s, gm, d);
  // Tangential parts of gravity and drag per unit mass.
  const gtx = g * nz * nx;
  const gty = g * nz * ny;
  const gtz = g * nz * nz - g;
  const vn = s.vx * nx + s.vy * ny + s.vz * nz;
  const dtx = -d * (s.vx - vn * nx);
  const dty = -d * (s.vy - vn * ny);
  const dtz = -d * (s.vz - vn * nz);
  // (ω × ṅ), tangential part.
  let cx = s.wy * ndz - s.wz * ndy;
  let cy = s.wz * ndx - s.wx * ndz;
  let cz = s.wx * ndy - s.wy * ndx;
  const cn = cx * nx + cy * ny + cz * nz;
  cx -= cn * nx;
  cy -= cn * ny;
  cz -= cn * nz;
  // Rolling friction from the no-slip constraint: F = (2m/7)·[R·(ω×ṅ)t − gt − (Fd)t/m].
  const k = (2 / 7) * ctx.m;
  const fx = k * (r * cx - gtx - dtx);
  const fy = k * (r * cy - gty - dty);
  const fz = k * (r * cz - gtz - dtz);
  // Rolling resistance decelerates the centre along the tangential velocity.
  let dx: number;
  let dy: number;
  let dz: number;
  if (ctx.fixed) {
    dx = ctx.fdx;
    dy = ctx.fdy;
    dz = ctx.fdz;
  } else {
    const tx = s.vx - vn * nx;
    const ty = s.vy - vn * ny;
    const tz = s.vz - vn * nz;
    const t = Math.sqrt(tx * tx + ty * ty + tz * tz);
    dx = tx / t;
    dy = ty / t;
    dz = tz / t;
  }
  const muR = ctx.rollA + ctx.rollB * speed;
  const arr = (muR * n) / ctx.m;
  const im = 1 / ctx.m;
  const ax = (n * nx + fx) * im - d * s.vx - arr * dx;
  const ay = (n * ny + fy) * im - d * s.vy - arr * dy;
  const az = (n * nz + fz) * im - d * s.vz - g - arr * dz;
  out.x = s.vx;
  out.y = s.vy;
  out.z = s.vz;
  out.vx = ax;
  out.vy = ay;
  out.vz = az;
  // ω = (n × v)/R + ωn·n, so ω̇ = (ṅ × v + n × a)/R + ω̇n·n + ωn·ṅ with ω̇n = ω·ṅ.
  const wn = s.wx * nx + s.wy * ny + s.wz * nz;
  const wnd = s.wx * ndx + s.wy * ndy + s.wz * ndz;
  out.wx = (ndy * s.vz - ndz * s.vy + ny * az - nz * ay) / r + wnd * nx + wn * ndx;
  out.wy = (ndz * s.vx - ndx * s.vz + nz * ax - nx * az) / r + wnd * ny + wn * ndy;
  out.wz = (ndx * s.vy - ndy * s.vx + nx * ay - ny * ax) / r + wnd * nz + wn * ndz;
  out.eRoll = 1.4 * muR * n * (s.vx * dx + s.vy * dy + s.vz * dz);
  out.eDrag = ctx.m * d * speed * speed;
  return out;
}

/**
 * Friction a curved support must supply to keep a marble rolling (N), for the roll→slide event.
 * The force itself goes into `out` when given: without it the slip would grow along −out.
 */
export function rollingFrictionNeeded(
  ctx: Ctx,
  s: Dyn,
  out?: { x: number; y: number; z: number },
): number {
  const gm = curvedGeometry(ctx, s, geo2);
  const { nx, ny, nz, ndx, ndy, ndz } = gm;
  const g = ctx.g;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  const d = ctx.dragK * speed;
  const vn = s.vx * nx + s.vy * ny + s.vz * nz;
  let cx = s.wy * ndz - s.wz * ndy;
  let cy = s.wz * ndx - s.wx * ndz;
  let cz = s.wx * ndy - s.wy * ndx;
  const cn = cx * nx + cy * ny + cz * nz;
  cx -= cn * nx;
  cy -= cn * ny;
  cz -= cn * nz;
  const k = (2 / 7) * ctx.m;
  const fx = k * (ctx.r * cx - g * nz * nx + d * (s.vx - vn * nx));
  const fy = k * (ctx.r * cy - g * nz * ny + d * (s.vy - vn * ny));
  const fz = k * (ctx.r * cz - g * nz * nz + g + d * (s.vz - vn * nz));
  if (out !== undefined) {
    out.x = fx;
    out.y = fy;
    out.z = fz;
  }
  return Math.sqrt(fx * fx + fy * fy + fz * fz);
}
