import { describe, expect, it } from 'vitest';

import {
  deriveParams,
  makeTable,
  PARAMS_V1,
  PhysicsError,
  tableValue,
  validateParams,
} from '../src/index.ts';
import type { PhysicsParams } from '../src/index.ts';
import { segmentAt } from '../src/params/table.ts';
import { assertFinite, assertIntInRange, defined } from '../src/errors.ts';

describe('lookup tables', () => {
  const t = makeTable({ x: [0.1, 1, 3], y: [0.95, 0.93, 0.9] }, 'e');

  it('interpolate linearly between breakpoints and extend flat outside them', () => {
    expect(tableValue(t, 0)).toBe(0.95);
    expect(tableValue(t, 0.1)).toBe(0.95);
    expect(tableValue(t, 0.55)).toBeCloseTo(0.94, 15);
    expect(tableValue(t, 2)).toBeCloseTo(0.915, 15);
    expect(tableValue(t, 3)).toBe(0.9);
    expect(tableValue(t, 50)).toBe(0.9);
  });

  it('name the segment that holds a value', () => {
    expect(segmentAt(t, -1).index).toBe(0);
    expect(segmentAt(t, 0.5).index).toBe(1);
    expect(segmentAt(t, 2.5).index).toBe(2);
    expect(segmentAt(t, 10).index).toBe(3);
    expect(() => segmentAt(t, NaN)).toThrow(PhysicsError);
  });

  it.each([
    [[], []],
    [[0, 1], [1]],
    [
      [0, 0],
      [1, 2],
    ],
    [
      [1, 0],
      [1, 2],
    ],
    [
      [0, NaN],
      [1, 2],
    ],
    [
      [0, 1],
      [1, Infinity],
    ],
  ])('reject bad data x=%j y=%j', (x, y) => {
    expect(() => makeTable({ x, y }, 'bad')).toThrow(PhysicsError);
  });
});

describe('PARAMS_V1', () => {
  it('validates and is frozen', () => {
    expect(() => {
      validateParams(PARAMS_V1);
    }).not.toThrow();
    expect(Object.isFrozen(PARAMS_V1)).toBe(true);
    expect(Object.isFrozen(PARAMS_V1.solver)).toBe(true);
  });

  it('holds the prompt values for the fixed parts of the model', () => {
    expect(PARAMS_V1.g).toBe(9.81);
    expect(PARAMS_V1.glassDensity).toBe(2500);
    expect(PARAMS_V1.dt).toBe(1 / 240);
    expect(PARAMS_V1.radius).toEqual({ r80: 0.008, r95: 0.0095, r110: 0.011 });
    expect(PARAMS_V1.thresholds.vRest).toBe(0.001);
    expect(PARAMS_V1.tMax).toBe(20);
  });
});

describe('validateParams', () => {
  const base = PARAMS_V1;
  const bad: [string, PhysicsParams][] = [
    ['version', { ...base, version: 0 }],
    ['g', { ...base, g: -1 }],
    ['density', { ...base, glassDensity: 1 }],
    ['air', { ...base, airDensity: NaN }],
    ['drag', { ...base, dragCoefficient: 11 }],
    ['radius', { ...base, radius: { ...base.radius, r95: 0 } }],
    ['dt', { ...base, dt: 0.1 }],
    ['tMax', { ...base, tMax: 0 }],
    [
      'surface muS',
      { ...base, surfaces: { ...base.surfaces, dirt: { ...base.surfaces.dirt, muS: 3 } } },
    ],
    [
      'surface muSp',
      { ...base, surfaces: { ...base.surfaces, sand: { ...base.surfaces.sand, muSp: -1 } } },
    ],
    [
      'surface table',
      {
        ...base,
        surfaces: {
          ...base.surfaces,
          tile: { ...base.surfaces.tile, e: makeTable({ x: [0], y: [1.5] }, 'e') },
        },
      },
    ],
    [
      'unbuilt table',
      {
        ...base,
        glass: { ...base.glass, mu: { data: { x: [0], y: [0] }, segments: [] } },
      },
    ],
    [
      'table breakpoint',
      { ...base, wall: { ...base.wall, e: makeTable({ x: [-1], y: [0.5] }, 'e') } },
    ],
    ['finger mass', { ...base, flick: { ...base.flick, fingerMass: 0 } }],
    ['finger speeds', { ...base, flick: { ...base.flick, fingerSpeedMax: 0.1 } }],
    ['miscue', { ...base, flick: { ...base.flick, miscueLimit: 2 } }],
    ['vRest', { ...base, thresholds: { ...base.thresholds, vRest: -1 } }],
    ['uStop', { ...base, thresholds: { ...base.thresholds, uStop: 0 } }],
    ['gapTol', { ...base, thresholds: { ...base.thresholds, gapTol: 1 } }],
    ['impactSteps', { ...base, solver: { ...base.solver, impactSteps: 1.5 } }],
    ['impactMaxSteps', { ...base, solver: { ...base.solver, impactMaxSteps: 10 } }],
    ['stopRefine', { ...base, solver: { ...base.solver, stopRefine: 1 } }],
    ['curveRefine', { ...base, solver: { ...base.solver, curveRefine: 0 } }],
    ['allowLoft', { ...base, allowLoft: 1 as unknown as boolean }],
  ];
  it.each(bad)('rejects a bad %s', (_, p) => {
    expect(() => {
      validateParams(p);
    }).toThrow(PhysicsError);
  });

  it('accepts a derived set once and remembers it', () => {
    const p = { ...base, dragCoefficient: 0 };
    validateParams(p);
    expect(() => {
      validateParams(p);
    }).not.toThrow();
  });
});

describe('error helpers', () => {
  it('assertFinite throws non-finite', () => {
    expect(() => {
      assertFinite('x', 1, NaN);
    }).toThrow(expect.objectContaining({ code: 'non-finite' }) as Error);
  });

  it('assertIntInRange throws invalid-input', () => {
    expect(() => {
      assertIntInRange('n', 2.5, 0, 5);
    }).toThrow(expect.objectContaining({ code: 'invalid-input' }) as Error);
  });

  it('defined throws internal on a missing value', () => {
    expect(defined(0, 'zero')).toBe(0);
    expect(() => {
      defined(undefined, 'gone');
    }).toThrow(expect.objectContaining({ code: 'internal' }) as Error);
    expect(() => defined(null, 'gone')).toThrow(PhysicsError);
  });
});

describe('deriveParams', () => {
  it('applies overrides to a copy and leaves the base alone', () => {
    const p = deriveParams(PARAMS_V1, {
      dragCoefficient: 0,
      dt: PARAMS_V1.dt / 2,
      surfaces: { dirt: { muS: 0.5, muR: { x: [0, 1], y: [0.03, 0.04] }, e: 0.2 } },
      glass: { mu: 0.05 },
      flick: { fingerMass: 0.008 },
    });
    expect(p.dragCoefficient).toBe(0);
    expect(p.dt).toBe(PARAMS_V1.dt / 2);
    expect(p.surfaces.dirt.muS).toBe(0.5);
    expect(tableValue(p.surfaces.dirt.muR, 0.5)).toBeCloseTo(0.035, 15);
    expect(tableValue(p.surfaces.dirt.e, 3)).toBe(0.2);
    expect(p.surfaces.cement).toBe(PARAMS_V1.surfaces.cement);
    expect(tableValue(p.glass.mu, 1)).toBe(0.05);
    expect(p.glass.e).toBe(PARAMS_V1.glass.e);
    expect(p.flick.fingerMass).toBe(0.008);
    expect(p.flick.fingerRestitution).toBe(PARAMS_V1.flick.fingerRestitution);
    expect(PARAMS_V1.dragCoefficient).toBe(0.5);
    expect(deriveParams(PARAMS_V1, {})).toEqual(PARAMS_V1);
  });

  it.each([
    ['an unknown key', { muS: 0.3 }],
    ['an unknown surface', { surfaces: { ice: { muS: 0.1 } } }],
    ['an unknown surface key', { surfaces: { tile: { mus: 0.1 } } }],
    ['an unknown pair key', { wall: { restitution: 0.5 } }],
    ['an unknown flick key', { flick: { mass: 0.1 } }],
    ['a string for a number', { dt: '0.004' }],
    ['a table without breakpoints', { edge: { e: { x: [0] } } }],
    ['a value out of range', { surfaces: { sand: { muS: 3 } } }],
    ['a table value out of range', { glass: { e: 1.5 } }],
    ['a non-object', { surfaces: 3 }],
  ])('rejects %s with a typed error', (_, overrides) => {
    expect(() => deriveParams(PARAMS_V1, overrides as never)).toThrow(PhysicsError);
  });
});
