/** The lab's built-in scenarios: the KPB 16 break and a few single-feature shots. */
import type { ShotSetup } from '@kanche/physics';
import { breakShot } from '@kanche/physics/testing';

export const SCENARIOS: Readonly<Record<string, ShotSetup>> = {
  break: breakShot(),
  'roll-out': {
    court: { surface: 'cement', bounds: { xMin: -1, xMax: 12, yMin: -2, yMax: 2 } },
    marbles: [{ id: 1, size: 'r80', x: 0, y: 0 }],
    shot: { marbleId: 1, flick: { dirX: 1000, dirY: 0, fingerSpeed: 300, spin: 0, side: 0 } },
  },
  bank: {
    court: {
      surface: 'tile',
      bounds: { xMin: -1, xMax: 2, yMin: -1, yMax: 1 },
      walls: [{ x1: -1, y1: 0.5, x2: 2, y2: 0.5 }],
    },
    marbles: [
      { id: 1, size: 'r95', x: 0, y: 0 },
      { id: 2, size: 'r80', x: 0.9, y: 0.335 },
    ],
    shot: { marbleId: 1, flick: { dirX: 700, dirY: 700, fingerSpeed: 600, spin: 150, side: -80 } },
  },
  hole: {
    court: {
      surface: 'dirt',
      bounds: { xMin: -1, xMax: 1.5, yMin: -1, yMax: 1 },
      hole: { x: 0.6, y: 0, radius: 0.03, depth: 0.02, rimRadius: 0.004 },
    },
    marbles: [{ id: 1, size: 'r80', x: 0, y: 0.012, vx: 1.1, wy: 137.5 }],
  },
};
