/**
 * Parameter variants from plain JSON overrides, for the Physics Lab (A/B comparisons), the KPB
 * fitters and tests. Production never derives: it passes the frozen set for the match's version.
 * A variant keeps the base's version number, so it must never reach a live match.
 *
 * Tables are given as a constant or as breakpoints ({ x, y }). Unknown keys are errors, not
 * ignored, so a misspelt coefficient cannot silently leave the base value in place. The result
 * is validated.
 */

import { PhysicsError } from '../errors.ts';
import { makeTable, type Table } from './table.ts';
import {
  SURFACES,
  type ContactPair,
  type FlickParams,
  type PhysicsParams,
  type SurfaceId,
  type SurfaceParams,
} from './types.ts';
import { validateParams } from './validate.ts';

/** A coefficient table: a constant, or breakpoints against speed (m/s). */
export type TableSpec = number | { readonly x: readonly number[]; readonly y: readonly number[] };

export interface SurfaceOverrides {
  readonly muS?: number;
  readonly muR?: TableSpec;
  readonly muSp?: number;
  readonly e?: TableSpec;
}

export interface PairOverrides {
  readonly e?: TableSpec;
  readonly mu?: TableSpec;
}

export interface ParamOverrides {
  readonly dragCoefficient?: number;
  readonly dt?: number;
  readonly tMax?: number;
  readonly surfaces?: Partial<Readonly<Record<SurfaceId, SurfaceOverrides>>>;
  readonly glass?: PairOverrides;
  readonly wall?: PairOverrides;
  readonly edge?: PairOverrides;
  readonly flick?: Partial<FlickParams>;
}

const TOP = ['dragCoefficient', 'dt', 'tMax', 'surfaces', 'glass', 'wall', 'edge', 'flick'];
const SURFACE_KEYS = ['muS', 'muR', 'muSp', 'e'];
const PAIR_KEYS = ['e', 'mu'];
const FLICK_KEYS = [
  'fingerMass',
  'fingerRestitution',
  'fingerSpeedMin',
  'fingerSpeedMax',
  'miscueLimit',
  'miscueRetain',
];

function bad(message: string): never {
  throw new PhysicsError('invalid-params', message);
}

function onlyKeys(what: string, value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    bad(`${what} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) bad(`${what} has an unknown key "${key}"`);
  }
}

function num(what: string, value: unknown): number {
  if (typeof value !== 'number') bad(`${what} must be a number`);
  return value;
}

function table(what: string, spec: TableSpec): Table {
  if (typeof spec === 'number') return makeTable({ x: [0], y: [num(what, spec)] }, what);
  onlyKeys(what, spec, ['x', 'y']);
  if (!Array.isArray(spec.x) || !Array.isArray(spec.y)) bad(`${what} needs x and y arrays`);
  return makeTable(
    { x: spec.x.map((v) => num(what, v)), y: spec.y.map((v) => num(what, v)) },
    what,
  );
}

function surface(id: SurfaceId, base: SurfaceParams, o: SurfaceOverrides): SurfaceParams {
  onlyKeys(`surfaces.${id}`, o, SURFACE_KEYS);
  return {
    muS: o.muS === undefined ? base.muS : num(`${id}.muS`, o.muS),
    muR: o.muR === undefined ? base.muR : table(`${id}.muR`, o.muR),
    muSp: o.muSp === undefined ? base.muSp : num(`${id}.muSp`, o.muSp),
    e: o.e === undefined ? base.e : table(`${id}.e`, o.e),
  };
}

function pair(name: string, base: ContactPair, o: PairOverrides | undefined): ContactPair {
  if (o === undefined) return base;
  onlyKeys(name, o, PAIR_KEYS);
  return {
    e: o.e === undefined ? base.e : table(`${name}.e`, o.e),
    mu: o.mu === undefined ? base.mu : table(`${name}.mu`, o.mu),
  };
}

/** The base set with the overrides applied, validated. */
export function deriveParams(base: PhysicsParams, overrides: ParamOverrides): PhysicsParams {
  onlyKeys('overrides', overrides, TOP);
  const surfaces = { ...base.surfaces };
  if (overrides.surfaces !== undefined) {
    onlyKeys('surfaces', overrides.surfaces, SURFACES);
    for (const id of SURFACES) {
      const o = overrides.surfaces[id];
      if (o !== undefined) surfaces[id] = surface(id, base.surfaces[id], o);
    }
  }
  let flick = base.flick;
  if (overrides.flick !== undefined) {
    onlyKeys('flick', overrides.flick, FLICK_KEYS);
    flick = { ...base.flick };
    for (const [key, value] of Object.entries(overrides.flick)) {
      flick = { ...flick, [key]: num(`flick.${key}`, value) };
    }
  }
  const out: PhysicsParams = {
    ...base,
    dragCoefficient:
      overrides.dragCoefficient === undefined
        ? base.dragCoefficient
        : num('dragCoefficient', overrides.dragCoefficient),
    dt: overrides.dt === undefined ? base.dt : num('dt', overrides.dt),
    tMax: overrides.tMax === undefined ? base.tMax : num('tMax', overrides.tMax),
    surfaces,
    glass: pair('glass', base.glass, overrides.glass),
    wall: pair('wall', base.wall, overrides.wall),
    edge: pair('edge', base.edge, overrides.edge),
    flick,
  };
  validateParams(out);
  return out;
}
