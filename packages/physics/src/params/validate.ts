/**
 * Parameter-set validation. Production passes the frozen set for the match's version, but tests
 * and the Physics Lab derive variants, and a bad variant must fail loudly, not simulate nonsense.
 */

import { PhysicsError } from '../errors.ts';
import { SIZE_CLASSES, SURFACES, type PhysicsParams } from './types.ts';
import type { Table } from './table.ts';

const checked = new WeakSet<PhysicsParams>();

function bad(message: string): never {
  throw new PhysicsError('invalid-params', message);
}

function inRange(what: string, v: number, lo: number, hi: number): void {
  if (!(Number.isFinite(v) && v >= lo && v <= hi)) {
    bad(`${what} must be in [${String(lo)}, ${String(hi)}], got ${String(v)}`);
  }
}

function tableIn(what: string, t: Table, lo: number, hi: number): void {
  if (t.segments.length < 2) bad(`${what} is not a built table`);
  for (const y of t.data.y) inRange(`${what} value`, y, lo, hi);
  for (const x of t.data.x) inRange(`${what} breakpoint`, x, 0, 100);
}

export function validateParams(p: PhysicsParams): void {
  if (checked.has(p)) return;
  if (!Number.isInteger(p.version) || p.version < 1) bad('version must be a positive integer');
  inRange('g', p.g, 0, 100);
  inRange('glassDensity', p.glassDensity, 100, 100000);
  inRange('airDensity', p.airDensity, 0, 100);
  inRange('dragCoefficient', p.dragCoefficient, 0, 10);
  for (const size of SIZE_CLASSES) inRange(`radius.${size}`, p.radius[size], 0.001, 0.05);
  inRange('dt', p.dt, 1e-5, 0.01);
  inRange('tMax', p.tMax, p.dt, 600);
  for (const id of SURFACES) {
    const s = p.surfaces[id];
    inRange(`${id}.muS`, s.muS, 0, 2);
    inRange(`${id}.muSp`, s.muSp, 0, 2);
    tableIn(`${id}.muR`, s.muR, 0, 2);
    tableIn(`${id}.e`, s.e, 0, 1);
  }
  for (const [name, pair] of [
    ['glass', p.glass],
    ['wall', p.wall],
    ['edge', p.edge],
  ] as const) {
    tableIn(`${name}.e`, pair.e, 0, 1);
    tableIn(`${name}.mu`, pair.mu, 0, 2);
  }
  const f = p.flick;
  inRange('flick.fingerMass', f.fingerMass, 1e-5, 1);
  inRange('flick.fingerRestitution', f.fingerRestitution, 0, 1);
  inRange('flick.fingerSpeedMin', f.fingerSpeedMin, 0, 20);
  inRange('flick.fingerSpeedMax', f.fingerSpeedMax, f.fingerSpeedMin, 20);
  inRange('flick.miscueLimit', f.miscueLimit, 0, 1);
  inRange('flick.miscueRetain', f.miscueRetain, 0, 1);
  const t = p.thresholds;
  inRange('vRest', t.vRest, 0, 1);
  inRange('vHop', t.vHop, 0, 1);
  inRange('uStop', t.uStop, 1e-15, 1e-3);
  inRange('vStop', t.vStop, 1e-15, 1e-3);
  inRange('alignTol', t.alignTol, 0, 1e-3);
  inRange('gapTol', t.gapTol, 1e-15, 1e-6);
  const s = p.solver;
  for (const [name, v, hi] of [
    ['impactSteps', s.impactSteps, 1e6],
    ['impactMaxSteps', s.impactMaxSteps, 1e7],
    ['advanceIterations', s.advanceIterations, 1e4],
    ['rootIterations', s.rootIterations, 1e4],
    ['maxSubsteps', s.maxSubsteps, 1e6],
    ['eventsPerStep', s.eventsPerStep, 1e6],
    ['eventsPerShot', s.eventsPerShot, 1e7],
    ['heldSweeps', s.heldSweeps, 1e3],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > hi)
      bad(`solver.${name} must be an integer in [1, ${String(hi)}]`);
  }
  if (s.impactMaxSteps < s.impactSteps) bad('solver.impactMaxSteps must be at least impactSteps');
  inRange('solver.stopRefine', s.stopRefine, 1e-3, 0.5);
  inRange('solver.curveRefine', s.curveRefine, 1e-5, 0.5);
  if (typeof p.allowLoft !== 'boolean') bad('allowLoft must be a boolean');
  checked.add(p);
}
