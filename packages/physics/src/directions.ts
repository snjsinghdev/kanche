/**
 * Committed unit-vector tables. The simulation may not evaluate sin or cos (ADR-0004), so angles
 * that come from players or rules (the opening shot's start point on the ring line, the lofted
 * shot's lift) are integer indices into tables generated offline (scripts/generate-tables.ts).
 *
 * Only the first octant is stored. The other seven come from it by swapping and negating
 * components, which is exact, so every direction is the correctly rounded value up to sign.
 */

import { assertIntInRange, defined } from './errors.ts';
import { DIRECTION_COUNT, DIRECTION_OCTANT, LIFT_TABLE } from './params/v1/directions.generated.ts';

export { DIRECTION_COUNT };
export const LIFT_COUNT = LIFT_TABLE.length;

export interface Unit2 {
  readonly x: number;
  readonly y: number;
}

const STEPS = DIRECTION_COUNT / 8;

function octantEntry(k: number): readonly [number, number] {
  return defined(DIRECTION_OCTANT[k], 'direction octant row');
}

/** The unit vector at angle 2π·index/DIRECTION_COUNT, measured from +x towards +y. */
export function unitVector(index: number): Unit2 {
  assertIntInRange('direction index', index, 0, DIRECTION_COUNT - 1);
  const octant = Math.floor(index / STEPS);
  const k = index - octant * STEPS;
  const [c, s] = octantEntry(k);
  const [cr, sr] = octantEntry(STEPS - k);
  switch (octant) {
    case 0:
      return { x: c, y: s };
    case 1:
      return { x: sr, y: cr };
    case 2:
      return { x: -s, y: c };
    case 3:
      return { x: -cr, y: sr };
    case 4:
      return { x: -c, y: -s };
    case 5:
      return { x: -sr, y: -cr };
    case 6:
      return { x: s, y: -c };
    default:
      return { x: cr, y: -sr };
  }
}

/** [cos, sin] of the lofted-shot lift angle at `index` (3° steps). */
export function liftAngle(index: number): { readonly cos: number; readonly sin: number } {
  assertIntInRange('lift index', index, 0, LIFT_COUNT - 1);
  const row = defined(LIFT_TABLE[index], 'lift row');
  return { cos: row[0], sin: row[1] };
}
