/**
 * The determinism probe: a small seeded simulation that exercises the arithmetic the real
 * physics will use (+, -, *, /, sqrt, min, max) and returns a hash of its final state.
 * The cross-engine harness (tools/determinism) runs it in Node, Deno, Chromium, WebKit and
 * Firefox and requires identical hashes. Phase 1 adds real shots to the harness; this stays as a
 * cheap canary for the arithmetic itself.
 */

import { Fnv64 } from './det/hash.ts';
import { createRng } from './det/rng.ts';

const BODIES = 8;
const DT = 1 / 240; // s; the simulation's fixed step
const STIFFNESS = 40; // 1/s^2: spring pulling each body to the origin
const DAMPING = 0.6; // 1/s
const REPULSION = 0.002; // m^3/s^2: soft pairwise push
const SOFTENING = 0.01; // m: keeps the push finite when bodies meet
const MAX_SPEED = 10; // m/s
export const MAX_PROBE_STEPS = 1_000_000;

export interface ProbeResult {
  readonly hash: string;
  /** Kinetic energy per unit mass summed over the bodies at the end, J/kg; a readable cross-check. */
  readonly energy: number;
}

interface Body {
  x: number; // m
  y: number; // m
  vx: number; // m/s
  vy: number; // m/s
  ax: number; // m/s^2
  ay: number; // m/s^2
}

export function determinismProbe(seed: number, steps: number): ProbeResult {
  if (!Number.isInteger(steps) || steps < 0 || steps > MAX_PROBE_STEPS) {
    throw new RangeError(
      `steps must be an integer in [0, ${String(MAX_PROBE_STEPS)}], got ${String(steps)}`,
    );
  }
  const rng = createRng(seed);
  const bodies: Body[] = [];
  for (let i = 0; i < BODIES; i += 1) {
    bodies.push({
      x: rng.nextFloat() * 0.4 - 0.2,
      y: rng.nextFloat() * 0.4 - 0.2,
      vx: rng.nextFloat() * 2 - 1,
      vy: rng.nextFloat() * 2 - 1,
      ax: 0,
      ay: 0,
    });
  }
  const pairs: (readonly [Body, Body])[] = [];
  bodies.forEach((a, i) => {
    for (const b of bodies.slice(i + 1)) pairs.push([a, b]);
  });

  for (let step = 0; step < steps; step += 1) {
    for (const b of bodies) {
      b.ax = -STIFFNESS * b.x - DAMPING * b.vx;
      b.ay = -STIFFNESS * b.y - DAMPING * b.vy;
    }
    for (const [a, b] of pairs) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const r2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const f = REPULSION / (r2 * Math.sqrt(r2));
      a.ax += f * dx;
      a.ay += f * dy;
      b.ax -= f * dx;
      b.ay -= f * dy;
    }
    // Semi-implicit Euler, with a speed clamp so min and max are exercised too.
    for (const b of bodies) {
      b.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vx + b.ax * DT));
      b.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vy + b.ay * DT));
      b.x += b.vx * DT;
      b.y += b.vy * DT;
    }
  }

  const h = new Fnv64().addUint32(seed).addUint32(steps);
  let energy = 0;
  for (const b of bodies) {
    h.addFloat64(b.x).addFloat64(b.y).addFloat64(b.vx).addFloat64(b.vy);
    energy += 0.5 * (b.vx * b.vx + b.vy * b.vy);
  }
  return { hash: h.digest(), energy };
}
