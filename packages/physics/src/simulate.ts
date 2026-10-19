/**
 * The public entry point: simulate one whole shot (Phase 1 prompt, "Shot result").
 *
 *   const result = simulateShot({ court, marbles, shot: { marbleId, flick } });
 *
 * Inputs are validated and rejected with typed errors (PhysicsError), never clamped. The same
 * setup, parameters and version give the same result, bit for bit, in every engine.
 */

import { buildCourt, type Court, type CourtSpec } from './court.ts';
import { assertFinite, PhysicsError } from './errors.ts';
import type { ShotResult } from './events.ts';
import { flickLaunch, type FlickInput } from './flick.ts';
import { validateParams } from './params/validate.ts';
import { PARAMS_V1 } from './params/v1/index.ts';
import { SIZE_CLASSES, type PhysicsParams, type SurfaceParams } from './params/types.ts';
import { MOTION_STATES, type MarbleInit } from './state.ts';
import { locateCell, newMetrics, supportLevel, type World } from './sim/advance.ts';
import { BASE, FLOOR, makeBody, type Body } from './sim/body.ts';
import { featureGap, holeRadial, insideBlock, newGap, staticFeatures } from './sim/features.ts';
import { Sim } from './sim/world.ts';
import { physicsVersion } from './version.ts';

export interface ShotSetup {
  /** A court spec, or a court already built with `buildCourt` (reused across shots). */
  readonly court: CourtSpec | Court;
  readonly marbles: readonly MarbleInit[];
  /** The flick, applied to one marble at rest. Omit it to simulate given velocities. */
  readonly shot?: { readonly marbleId: number; readonly flick: FlickInput };
}

export interface ShotOptions {
  /** Defaults to the parameters of the current physics version. */
  readonly params?: PhysicsParams;
  /** Record per-marble keyframes for playback (default true; the AI switches it off). */
  readonly timeline?: boolean;
}

/** Marbles placed this close are treated as touching, not overlapping (m). */
const OVERLAP_TOLERANCE = 1e-9;

function isCourt(c: CourtSpec | Court): c is Court {
  return 'walls' in c && 'blocks' in c && 'spec' in c;
}

function invalid(message: string): never {
  throw new PhysicsError('invalid-input', message);
}

function initBody(m: MarbleInit, world: World): Body {
  const { court, params } = world;
  if (!Number.isInteger(m.id) || m.id < 0 || m.id > 0xffffffff) {
    invalid(`marble id must be a uint32, got ${String(m.id)}`);
  }
  if (!(SIZE_CLASSES as readonly string[]).includes(m.size)) {
    invalid(`marble ${String(m.id)} has unknown size "${m.size}"`);
  }
  const b = makeBody(m.id, m.size, params);
  const s = b.s;
  s.x = m.x;
  s.y = m.y;
  s.vx = m.vx ?? 0;
  s.vy = m.vy ?? 0;
  s.vz = m.vz ?? 0;
  s.wx = m.wx ?? 0;
  s.wy = m.wy ?? 0;
  s.wz = m.wz ?? 0;
  b.wear = m.wear ?? 0;
  try {
    assertFinite(`marble ${String(m.id)}`, s.x, s.y, s.vx, s.vy, s.vz, s.wx, s.wy, s.wz, b.wear);
  } catch {
    invalid(`marble ${String(m.id)} has a non-finite value`);
  }
  const motion = m.motion ?? 'resting';
  if (!(MOTION_STATES as readonly string[]).includes(motion)) {
    invalid(`marble ${String(m.id)} has unknown motion "${motion}"`);
  }
  const bd = court.bounds;
  if (!(s.x > bd.xMin && s.x < bd.xMax && s.y > bd.yMin && s.y < bd.yMax)) {
    if (motion !== 'out') invalid(`marble ${String(m.id)} is outside the court`);
  }
  const speed2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
  if (speed2 > 100) invalid(`marble ${String(m.id)} is faster than 10 m/s`);
  if (motion === 'pocketed' || motion === 'out') {
    s.z = m.z ?? 0;
    s.vx = 0;
    s.vy = 0;
    s.vz = 0;
    s.wx = 0;
    s.wy = 0;
    s.wz = 0;
    b.motion = motion;
    b.done = true;
    return b;
  }
  const hole = court.hole;
  if (motion === 'airborne') {
    if (m.z === undefined || !Number.isFinite(m.z))
      invalid(`airborne marble ${String(m.id)} needs z`);
    s.z = m.z;
    b.motion = 'airborne';
    return b;
  }
  if (m.z !== undefined) invalid(`grounded marble ${String(m.id)} must not set z`);
  if (s.vz !== 0) invalid(`grounded marble ${String(m.id)} must not set vz`);
  const block = court.blocks.find((k) => insideBlock(k, s.x, s.y));
  if (hole !== undefined && holeRadial(hole, s.x, s.y) < hole.rc) {
    // Inside the hole: on the floor, or not placeable (the rim is never a resting place).
    if (holeRadial(hole, s.x, s.y) > hole.rh - b.r) invalid(`marble ${String(m.id)} is on the rim`);
    b.support = FLOOR;
    s.z = hole.zFloor + b.r;
  } else if (block !== undefined) {
    b.support = { kind: 'top', block };
    s.z = block.z + b.r;
  } else {
    b.support = BASE;
    locateCell(world, b);
    s.z = supportLevel(world, b, s.x, s.y) + b.r;
  }
  // The settle pass in the simulation turns this into sliding, rolling or spinning as needed.
  b.motion = speed2 === 0 && s.wx === 0 && s.wy === 0 && s.wz === 0 ? 'resting' : 'sliding';
  return b;
}

/** A marble must not start inside a wall, a block, the hole's rim or wall, or the ground. */
function checkFeatures(bodies: readonly Body[], world: World): void {
  const fg = newGap();
  for (const b of bodies) {
    if (b.done) continue;
    for (const f of world.features) {
      const g = featureGap(world.court, f, b.r, b.s.x, b.s.y, b.s.z, fg);
      if (g.valid && g.gap < -OVERLAP_TOLERANCE) {
        invalid(`marble ${String(b.id)} starts inside the court's ${f.kind}`);
      }
    }
  }
}

function checkOverlaps(bodies: readonly Body[]): void {
  bodies.forEach((a, i) => {
    if (a.done) return;
    for (const b of bodies.slice(i + 1)) {
      if (b.done) continue;
      const dx = a.s.x - b.s.x;
      const dy = a.s.y - b.s.y;
      const dz = a.s.z - b.s.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < a.r + b.r - OVERLAP_TOLERANCE) {
        invalid(`marbles ${String(a.id)} and ${String(b.id)} overlap`);
      }
    }
  });
}

export function simulateShot(setup: ShotSetup, options: ShotOptions = {}): ShotResult {
  const params = options.params ?? PARAMS_V1;
  validateParams(params);
  const court = isCourt(setup.court) ? setup.court : buildCourt(setup.court);
  if (setup.marbles.length === 0 || setup.marbles.length > 64) {
    invalid('a shot needs 1 to 64 marbles');
  }
  const surface: SurfaceParams = params.surfaces[court.surface];
  const world: World = {
    court,
    params,
    surface,
    features: staticFeatures(court),
    metrics: newMetrics(),
  };
  const bodies = setup.marbles.map((m) => initBody(m, world));
  bodies.sort((a, b) => a.id - b.id);
  bodies.forEach((b, i) => {
    const next = bodies[i + 1];
    if (next !== undefined && next.id === b.id) invalid(`duplicate marble id ${String(b.id)}`);
  });
  checkOverlaps(bodies);
  checkFeatures(bodies, world);
  if (setup.shot !== undefined) {
    const { marbleId, flick } = setup.shot;
    const shooter = bodies.find((b) => b.id === marbleId);
    if (shooter === undefined) invalid(`shot marble ${String(marbleId)} is not on the court`);
    if (shooter.motion !== 'resting' || shooter.support === null) {
      invalid(`shot marble ${String(marbleId)} must be at rest on the ground`);
    }
    const launch = flickLaunch(flick, shooter.size, params);
    const s = shooter.s;
    s.vx = launch.vx;
    s.vy = launch.vy;
    s.vz = launch.vz;
    s.wx = launch.wx;
    s.wy = launch.wy;
    s.wz = launch.wz;
    if (launch.vz > 0) {
      shooter.support = null;
      shooter.motion = 'airborne';
    } else {
      shooter.motion = 'sliding';
    }
  }
  const sim = new Sim(world, bodies, options.timeline ?? true);
  sim.run();
  return {
    physicsVersion,
    duration: sim.duration(),
    final: sim.finalStates(),
    events: sim.events,
    ledger: sim.ledger(),
    timeline: sim.timeline(),
    metrics: sim.metricsOut(),
    hash: sim.hash(),
  };
}
