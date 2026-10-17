import { describe, expect, it } from 'vitest';

import type { PhysicsError } from '../src/index.ts';
import {
  buildCourt,
  PARAMS_V1,
  physicsVersion,
  simulateShot,
  type MarbleInit,
  type ShotSetup,
} from '../src/index.ts';
import { flat, R8 } from './helpers.ts';

const court = flat(1);
const one: MarbleInit = { id: 1, size: 'r80', x: 0, y: 0 };

describe('simulateShot input validation', () => {
  const bad: [string, ShotSetup][] = [
    ['no marbles', { court, marbles: [] }],
    [
      'too many marbles',
      {
        court,
        marbles: Array.from({ length: 65 }, (_, i) => ({ ...one, id: i, x: -0.9 + i * 0.02 })),
      },
    ],
    ['a negative id', { court, marbles: [{ ...one, id: -1 }] }],
    ['a fractional id', { court, marbles: [{ ...one, id: 1.5 }] }],
    ['an unknown size', { court, marbles: [{ ...one, size: 'r70' as 'r80' }] }],
    ['a non-finite position', { court, marbles: [{ ...one, x: NaN }] }],
    ['a non-finite spin', { court, marbles: [{ ...one, wz: Infinity }] }],
    ['an unknown motion', { court, marbles: [{ ...one, motion: 'flying' as 'resting' }] }],
    ['a marble off the court', { court, marbles: [{ ...one, x: 5 }] }],
    ['a marble faster than 10 m/s', { court, marbles: [{ ...one, vx: 11 }] }],
    ['an airborne marble without z', { court, marbles: [{ ...one, motion: 'airborne' }] }],
    ['a grounded marble with z', { court, marbles: [{ ...one, z: 0.01 }] }],
    ['a grounded marble with vz', { court, marbles: [{ ...one, vz: 0.1 }] }],
    ['duplicate ids', { court, marbles: [one, { ...one, x: 0.5 }] }],
    ['overlapping marbles', { court, marbles: [one, { ...one, id: 2, x: 0.015 }] }],
    [
      'a shot at a missing marble',
      {
        court,
        marbles: [one],
        shot: { marbleId: 9, flick: { dirX: 1, dirY: 0, fingerSpeed: 1, spin: 0, side: 0 } },
      },
    ],
    [
      'a shot at a moving marble',
      {
        court,
        marbles: [{ ...one, vx: 1 }],
        shot: { marbleId: 1, flick: { dirX: 1, dirY: 0, fingerSpeed: 1, spin: 0, side: 0 } },
      },
    ],
    [
      'a marble on the rim',
      {
        court: { ...court, hole: { x: 0.3, y: 0, radius: 0.04, depth: 0.03, rimRadius: 0.003 } },
        marbles: [{ ...one, x: 0.3 + 0.039 }],
      },
    ],
  ];
  it.each(bad)('rejects %s', (_, setup) => {
    expect(() => simulateShot(setup)).toThrow(
      expect.objectContaining({ code: 'invalid-input' }) as PhysicsError,
    );
  });

  it('rejects invalid parameters and courts with their own codes', () => {
    expect(() =>
      simulateShot({ court, marbles: [one] }, { params: { ...PARAMS_V1, dt: -1 } }),
    ).toThrow(expect.objectContaining({ code: 'invalid-params' }) as PhysicsError);
    expect(() =>
      simulateShot({
        court: { ...court, bounds: { xMin: 0, xMax: 0, yMin: 0, yMax: 1 } },
        marbles: [one],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-court' }) as PhysicsError);
  });

  it('accepts touching marbles (a resting contact) within 1 nm', () => {
    expect(() =>
      simulateShot({ court, marbles: [one, { ...one, id: 2, x: 2 * R8 - 5e-10 }] }),
    ).not.toThrow();
  });
});

describe('simulateShot results', () => {
  it('reports the version, a rest-only shot, and no timeline when asked', () => {
    const r = simulateShot({ court, marbles: [one] }, { timeline: false });
    expect(r.physicsVersion).toBe(physicsVersion);
    expect(r.duration).toBe(0);
    expect(r.events).toEqual([]);
    expect(r.timeline).toBeNull();
    expect(r.final[0]).toMatchObject({ id: 1, motion: 'resting', x: 0, y: 0, z: R8 });
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('applies a flick to the shooter and reuses a built court', () => {
    const built = buildCourt(flat(2));
    const r = simulateShot({
      court: built,
      marbles: [one, { ...one, id: 2, x: 0.3 }],
      shot: { marbleId: 1, flick: { dirX: 100, dirY: 0, fingerSpeed: 400, spin: 0, side: 0 } },
    });
    expect(r.events.some((e) => e.kind === 'impact' && e.a === 1 && e.b === 2)).toBe(true);
    expect(r.ledger.initialKinetic).toBeGreaterThan(0);
    expect(Math.abs(r.ledger.residual)).toBeLessThan(1e-9 * r.ledger.initialKinetic);
  });

  it('keeps pocketed and out marbles out of the simulation', () => {
    const r = simulateShot({
      court,
      marbles: [
        { ...one, motion: 'pocketed', z: -0.02 },
        { ...one, id: 2, x: 2, motion: 'out' },
        { ...one, id: 3, x: 0.3, vx: 0.2 },
      ],
    });
    expect(r.final.map((m) => m.motion)).toEqual(['pocketed', 'out', 'resting']);
    expect(r.final[0]?.z).toBe(-0.02);
  });

  it('starts an airborne marble where it is given, and it lands', () => {
    const r = simulateShot({ court, marbles: [{ ...one, z: 0.05, motion: 'airborne' }] });
    const landing = r.events.find((e) => e.kind === 'impact');
    expect(landing).toMatchObject({ kind: 'impact', feature: 'base', b: null });
    // Free fall from 0.042 m above rolling height: t = sqrt(2h/g), barely changed by drag.
    expect(landing?.t).toBeCloseTo(Math.sqrt((2 * (0.05 - R8)) / PARAMS_V1.g), 4);
  });
});
