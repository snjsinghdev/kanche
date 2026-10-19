/**
 * The 16-marble break of KPB test 16: a triangle rack of 15 small marbles, 1 mm apart, struck
 * almost full on by a shooter flicked from 0.3 m away on open cement. Shared by the performance
 * test, the bench script and the lab, so they all time the same shot.
 */
import type { CourtSpec } from '../court.ts';
import { PARAMS_V1 } from '../params/v1/index.ts';
import type { ShotSetup } from '../simulate.ts';
import type { MarbleInit } from '../state.ts';

/** Clearance between neighbouring marbles in the rack (m). */
const RACK_GAP = 0.001;
/** Distance from the shooter to the rack's apex (m). */
const SHOOTER_DISTANCE = 0.3;
/** Sideways offset of the shooter, so the break is not perfectly symmetric (m). */
const SHOOTER_OFFSET = 0.0003;

export function breakShot(): ShotSetup {
  const r = PARAMS_V1.radius.r80;
  const pitch = 2 * r + RACK_GAP;
  const court: CourtSpec = {
    surface: 'cement',
    bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
  };
  const marbles: MarbleInit[] = [{ id: 0, size: 'r80', x: -SHOOTER_DISTANCE, y: SHOOTER_OFFSET }];
  let id = 1;
  for (let row = 0; row < 5; row += 1) {
    for (let k = 0; k <= row; k += 1) {
      marbles.push({
        id,
        size: 'r80',
        x: (row * pitch * Math.sqrt(3)) / 2,
        y: (k - row / 2) * pitch,
      });
      id += 1;
    }
  }
  return {
    court,
    marbles,
    shot: { marbleId: 0, flick: { dirX: 1000, dirY: 0, fingerSpeed: 800, spin: 100, side: 0 } },
  };
}
