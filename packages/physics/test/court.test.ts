import { describe, expect, it } from 'vitest';

import type { PhysicsError } from '../src/index.ts';
import { buildCourt, type CourtSpec } from '../src/index.ts';
import { cellPatch, groundHeight } from '../src/court.ts';
import { sloped } from './helpers.ts';

const bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('buildCourt', () => {
  it('builds a court with every feature', () => {
    const court = buildCourt({
      surface: 'dirt',
      bounds,
      walls: [{ x1: -0.9, y1: -0.9, x2: 0.9, y2: -0.9 }],
      blocks: [{ points: square(0.3, 0.3, 0.2), height: 0.004 }],
      hole: { x: -0.4, y: 0.2, radius: 0.04, depth: 0.03, rimRadius: 0.003 },
    });
    expect(court.walls[0]?.length).toBeCloseTo(1.8, 12);
    const block = court.blocks[0];
    expect(block?.edges).toHaveLength(4);
    expect(block?.corners).toHaveLength(4);
    // Outward normals of a counter-clockwise square point away from it.
    // (+ 0 folds −0 into 0.)
    expect(block?.edges.map((e) => [e.ox + 0, e.oy + 0])).toEqual([
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]);
    expect(court.hole?.rc).toBeCloseTo(0.043, 15);
    expect(court.hole?.zFloor).toBe(-0.03);
    expect(court.hole?.zc).toBe(-0.003);
  });

  it('interpolates the heightfield bilinearly', () => {
    const court = buildCourt(sloped(0.02, -0.01, 2, 0.5));
    for (const [x, y] of [
      [0, 0],
      [0.13, -0.77],
      [1.99, 1.2],
    ] as const) {
      expect(groundHeight(court, x, y)).toBeCloseTo(0.02 * x - 0.01 * y, 15);
    }
    const hf = court.heightfield;
    if (hf === undefined) throw new Error('no heightfield');
    // Points past the grid use the edge cell, extended.
    expect(cellPatch(hf, -10, 10)).toMatchObject({ i: 0, j: hf.ny - 2 });
    expect(groundHeight(buildCourt({ surface: 'tile', bounds }), 0.3, 0.3)).toBe(0);
  });

  const flatHf = {
    x0: -1,
    y0: -1,
    cellSize: 0.5,
    nx: 5,
    ny: 5,
    heights: Array<number>(25).fill(0),
  };
  const bad: [string, CourtSpec][] = [
    ['surface', { surface: 'ice' as 'tile', bounds }],
    ['bounds', { surface: 'tile', bounds: { xMin: 1, xMax: -1, yMin: -1, yMax: 1 } }],
    ['huge bounds', { surface: 'tile', bounds: { xMin: -30, xMax: 30, yMin: -1, yMax: 1 } }],
    ['nan bounds', { surface: 'tile', bounds: { ...bounds, xMin: NaN } }],
    ['cell size', { surface: 'tile', bounds, heightfield: { ...flatHf, cellSize: 0 } }],
    ['grid size', { surface: 'tile', bounds, heightfield: { ...flatHf, nx: 1 } }],
    ['height count', { surface: 'tile', bounds, heightfield: { ...flatHf, heights: [0] } }],
    [
      'nan height',
      {
        surface: 'tile',
        bounds,
        heightfield: { ...flatHf, heights: [NaN, ...Array<number>(24).fill(0)] },
      },
    ],
    [
      'tall height',
      {
        surface: 'tile',
        bounds,
        heightfield: { ...flatHf, heights: [2, ...Array<number>(24).fill(2)] },
      },
    ],
    ['coverage', { surface: 'tile', bounds, heightfield: { ...flatHf, x0: -0.5 } }],
    [
      'slope',
      {
        surface: 'tile',
        bounds,
        heightfield: { ...flatHf, heights: flatHf.heights.map((_, i) => (i % 5) * 0.02) },
      },
    ],
    ['short wall', { surface: 'tile', bounds, walls: [{ x1: 0, y1: 0, x2: 0.0001, y2: 0 }] }],
    ['nan wall', { surface: 'tile', bounds, walls: [{ x1: 0, y1: 0, x2: NaN, y2: 0 }] }],
    [
      'few points',
      {
        surface: 'tile',
        bounds,
        blocks: [{ points: square(0, 0, 0.1).slice(0, 2), height: 0.003 }],
      },
    ],
    [
      'tall block',
      { surface: 'tile', bounds, blocks: [{ points: square(0, 0, 0.1), height: 0.009 }] },
    ],
    [
      'clockwise block',
      { surface: 'tile', bounds, blocks: [{ points: square(0, 0, 0.1).reverse(), height: 0.003 }] },
    ],
    [
      'tiny edge',
      {
        surface: 'tile',
        bounds,
        blocks: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 0.0001, y: 0 },
              { x: 0, y: 0.1 },
            ],
            height: 0.003,
          },
        ],
      },
    ],
    [
      'nan point',
      {
        surface: 'tile',
        bounds,
        blocks: [
          {
            points: [
              { x: 0, y: 0 },
              { x: NaN, y: 0 },
              { x: 0, y: 0.1 },
            ],
            height: 0.003,
          },
        ],
      },
    ],
    [
      'hole radius',
      { surface: 'tile', bounds, hole: { x: 0, y: 0, radius: 0.005, depth: 0.03, rimRadius: 0 } },
    ],
    [
      'hole depth',
      { surface: 'tile', bounds, hole: { x: 0, y: 0, radius: 0.04, depth: 0, rimRadius: 0 } },
    ],
    [
      'hole rim',
      { surface: 'tile', bounds, hole: { x: 0, y: 0, radius: 0.04, depth: 0.02, rimRadius: 0.03 } },
    ],
    [
      'hole on a slope',
      {
        ...sloped(0.02, 0, 1, 0.25),
        hole: { x: 0, y: 0, radius: 0.04, depth: 0.03, rimRadius: 0.003 },
      },
    ],
    [
      'block on a slope',
      { ...sloped(0.02, 0, 1, 0.25), blocks: [{ points: square(0, 0, 0.1), height: 0.003 }] },
    ],
    [
      'overlap',
      {
        surface: 'tile',
        bounds,
        blocks: [{ points: square(0, 0, 0.1), height: 0.003 }],
        hole: { x: 0.12, y: 0.05, radius: 0.02, depth: 0.03, rimRadius: 0 },
      },
    ],
    [
      'outside',
      { surface: 'tile', bounds, blocks: [{ points: square(0.95, 0, 0.1), height: 0.003 }] },
    ],
  ];
  it.each(bad)('rejects bad geometry: %s', (_, spec) => {
    expect(() => buildCourt(spec)).toThrow(
      expect.objectContaining({ code: 'invalid-court' }) as PhysicsError,
    );
  });
});
