import { describe, expect, it } from 'vitest';

import { PARAMS_V1, simulateShot, type MarbleTimeline } from '@kanche/physics';

import { frame, sampleAt, trail } from '../src/lab/playback.ts';
import { SCENARIOS } from '../src/lab/scenarios.ts';

const R = PARAMS_V1.radius.r80;

describe('the lab playback', () => {
  const shot = SCENARIOS['roll-out'];
  if (shot === undefined) throw new Error('no roll-out scenario');
  const result = simulateShot(shot, { timeline: true });
  const tl = result.timeline?.[0] as MarbleTimeline;

  it('samples the keyframes, interpolating between them', () => {
    const k = tl.keyframes;
    const [k1, k2] = [k[1], k[2]];
    if (k1 === undefined || k2 === undefined) throw new Error('too few keyframes');
    const mid = sampleAt(tl, R, (k1.t + k2.t) / 2);
    expect(mid.x).toBeCloseTo((k1.x + k2.x) / 2, 12);
    expect(sampleAt(tl, R, -1).x).toBe(k[0]?.x);
    expect(sampleAt(tl, R, 1e9).motion).toBe('resting');
  });

  it('derives |v|, the slip and |ω|: a stunned flick slides, then rolls without slip', () => {
    const start = sampleAt(tl, R, 0);
    expect(start.motion).toBe('sliding');
    expect(Math.hypot(start.ux, start.uy)).toBeCloseTo(start.speed, 12);
    const roll = tl.keyframes.find((k) => k.motion === 'rolling');
    if (roll === undefined) throw new Error('never rolls');
    const s = sampleAt(tl, R, roll.t);
    expect(Math.hypot(s.ux, s.uy)).toBeLessThan(1e-9);
    expect(s.spin).toBeCloseTo(s.speed / R, 6);
  });

  it('trails and frames what moved', () => {
    expect(trail(tl, 0)).toHaveLength(1);
    expect(trail(tl, 1e9)).toHaveLength(tl.keyframes.length);
    const box = frame([tl]);
    expect(box.xMin).toBeLessThan(0);
    expect(box.xMax).toBeGreaterThan(result.final[0]?.x ?? NaN);
    expect(frame([])).toEqual({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 });
  });

  it('carries every scenario through the simulation', () => {
    for (const setup of Object.values(SCENARIOS)) {
      expect(simulateShot(setup, { timeline: false }).events.length).toBeGreaterThan(0);
    }
  });
});
