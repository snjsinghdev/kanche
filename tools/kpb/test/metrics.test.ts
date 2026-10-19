import { describe, expect, it } from 'vitest';

import { deriveParams, PARAMS_V1 } from '@kanche/physics';

import { DatasetError, type Recording } from '../src/dataset.ts';
import { bankAngle, impactTime, measure, slideTime } from '../src/metrics.ts';
import { SYNTHETIC_TRUTH } from '../src/synthetic.ts';
import { simulateRecording } from '../src/track.ts';
import { starter } from './helpers.ts';

const truth = deriveParams(PARAMS_V1, SYNTHETIC_TRUTH);
const first = (kind: Recording['kind']): Recording => {
  const r = starter().recordings.find((x) => x.kind === kind);
  if (r === undefined) throw new Error(kind);
  return r;
};
/** A recording replayed without noise, its tracks replaced by the simulation's. */
const clean = (rec: Recording) => {
  const sim = simulateRecording(rec, truth);
  return { rec: { ...rec, tracks: sim.tracks }, result: sim.result };
};

describe('the reality metrics', () => {
  it('times the end of a slide to within a frame of the simulation', () => {
    const { rec, result } = clean(first('stun'));
    const ev = result.events.find((e) => e.kind === 'slide-roll');
    expect(Math.abs(slideTime(rec, rec.tracks[0] ?? ({} as never)) - (ev?.t ?? NaN))).toBeLessThan(
      1 / rec.fps,
    );
  });

  it('times an impact to within a millisecond of the simulation', () => {
    const { rec, result } = clean(first('head-on'));
    const ev = result.events.find((e) => e.kind === 'impact' && e.b !== null);
    const target = rec.tracks.find((t) => t.id !== rec.shooter) ?? ({} as never);
    expect(Math.abs(impactTime(rec, target) - (ev?.t ?? NaN))).toBeLessThan(1e-3);
  });

  it('reads the same values from filmed and replayed tracks of one shot, up to tracking noise', () => {
    for (const kind of ['roll', 'stun', 'head-on', 'cut', 'bank'] as const) {
      const rec = first(kind);
      const real = measure(rec, rec.tracks);
      const sim = measure(rec, clean(rec).rec.tracks);
      expect(Object.keys(sim).sort()).toEqual(Object.keys(real).sort());
    }
    const bank = first('bank');
    const filmed = bankAngle(bank, bank.tracks[0] ?? ({} as never));
    const replayed = bankAngle(bank, clean(bank).rec.tracks[0] ?? ({} as never));
    expect(Math.abs(filmed - replayed)).toBeLessThan(2);
  });

  it('scores a hole approach as captured or not, and a flick not at all', () => {
    const holes = starter().recordings.filter((r) => r.kind === 'hole');
    const captures = new Set(holes.map((r) => measure(r, r.tracks)['capture']));
    expect(captures).toEqual(new Set([0, 1]));
    expect(measure(first('flick'), first('flick').tracks)).toEqual({});
  });

  it('gives NaN for an impact the replay misses, and refuses shots missing what they need', () => {
    const cut = first('cut');
    const miss = {
      ...cut,
      marbles: cut.marbles.map((m) => (m.id === cut.shooter ? m : { ...m, y: 0.2 })),
    };
    const values = measure(miss, simulateRecording(miss, truth).tracks);
    expect(values['departure:target']).toBeNaN();
    expect(values['speed-ratio:shooter']).toBeNaN();
    const hole = first('hole');
    const flat = { surface: hole.court.surface, bounds: hole.court.bounds };
    expect(() => measure({ ...hole, court: flat }, hole.tracks)).toThrow(DatasetError);
    const bank = first('bank');
    expect(() => measure({ ...bank, court: { ...bank.court, walls: [] } }, bank.tracks)).toThrow(
      DatasetError,
    );
    const head = first('head-on');
    expect(() =>
      measure(
        head,
        head.tracks.filter((t) => t.id === head.shooter),
      ),
    ).toThrow(DatasetError);
  });
});
