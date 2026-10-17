/**
 * Physics parameters, version 1. Frozen: any change here alters outcomes and needs a
 * physicsVersion bump plus a new params module (ADR-0006).
 *
 * Every value carries its unit and its source. PLACEHOLDER means it is not yet measured. The
 * KPB calibration (docs/physics-calibration.md) replaces placeholders with fitted values in a
 * later physics version.
 */

import { makeTable, type Table } from '../table.ts';
import type { PhysicsParams, SurfaceParams } from '../types.ts';

function constant(value: number, what: string): Table {
  return makeTable({ x: [0], y: [value] }, what);
}

function surface(muS: number, muR: number, e: number, name: string): SurfaceParams {
  return {
    muS, // – PLACEHOLDER (prompt range 0.25–0.5)
    muR: constant(muR, `${name}.muR`), // – PLACEHOLDER (prompt values)
    muSp: 0.01, // – PLACEHOLDER (prompt value)
    e: constant(e, `${name}.e`), // – PLACEHOLDER (no source yet; a low bounce on hard ground)
  };
}

export const PARAMS_V1: PhysicsParams = Object.freeze({
  version: 1,
  g: 9.81, // m/s², the prompt's value
  glassDensity: 2500, // kg/m³, soda-lime glass (prompt)
  airDensity: 1.2, // kg/m³, dry air near 20 °C (prompt)
  dragCoefficient: 0.5, // – PLACEHOLDER; a smooth sphere at Re ≈ 2000 is 0.4–0.55
  radius: Object.freeze({
    r80: 0.008, // m, standard marble (prompt)
    r95: 0.0095, // m, shooter class (prompt)
    r110: 0.011, // m, shooter class (prompt)
  }),
  dt: 1 / 240, // s, the fixed step (prompt)
  tMax: 20, // s, a shot still moving is forced to rest and flagged (prompt)
  surfaces: Object.freeze({
    cement: surface(0.35, 0.008, 0.5, 'cement'),
    dirt: surface(0.45, 0.03, 0.3, 'dirt'),
    tile: surface(0.25, 0.006, 0.6, 'tile'),
    sand: surface(0.5, 0.12, 0.1, 'sand'),
    'wet-cement': surface(0.3, 0.01, 0.45, 'wet-cement'),
  }),
  glass: Object.freeze({
    e: constant(0.93, 'glass.e'), // – PLACEHOLDER (prompt)
    mu: constant(0.08, 'glass.mu'), // – PLACEHOLDER, borrowed from billiard balls (prompt)
  }),
  wall: Object.freeze({
    e: constant(0.6, 'wall.e'), // – PLACEHOLDER (prompt eW)
    mu: constant(0.2, 'wall.mu'), // – PLACEHOLDER (prompt muW)
  }),
  edge: Object.freeze({
    e: constant(0.5, 'edge.e'), // – PLACEHOLDER (steps, curbs and the rim; no source yet)
    mu: constant(0.3, 'edge.mu'), // – PLACEHOLDER
  }),
  flick: Object.freeze({
    fingerMass: 0.006, // kg PLACEHOLDER: to be fitted from filmed flicks of all three sizes
    fingerRestitution: 0.5, // – PLACEHOLDER: a soft fingertip
    fingerSpeedMin: 0.2, // m/s PLACEHOLDER
    fingerSpeedMax: 3.0, // m/s PLACEHOLDER
    miscueLimit: 0.6, // – fraction of R (prompt)
    miscueRetain: 0.2, // – PLACEHOLDER: a miscue keeps a fifth of the impulse
  }),
  thresholds: Object.freeze({
    vRest: 0.001, // m/s, resting-contact threshold (prompt)
    vHop: 0.001, // m/s, smaller separations are zeroed (a hop under 0.05 µm)
    uStop: 1e-10, // m/s, slip finished by the exact friction impulse
    vStop: 1e-10, // m/s, rolling speed taken as rest
    alignTol: 1e-12, // –, relative test for a fixed Coulomb direction
    gapTol: 1e-12, // m, conservative advancement converged
  }),
  solver: Object.freeze({
    impactSteps: 256, // – (prompt example; confirmed against pooltool)
    impactMaxSteps: 4096, // –
    advanceIterations: 64, // –
    rootIterations: 64, // –
    stopRefine: 0.125, // – (ADR-0006)
    curveRefine: 0.004, // rad per substep on the rim, edges and corners (ADR-0006)
    maxSubsteps: 4096, // –
    eventsPerStep: 64, // –
    eventsPerShot: 20000, // –
    heldSweeps: 8, // –
  }),
  allowLoft: false,
});
