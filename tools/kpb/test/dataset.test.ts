import { describe, expect, it } from 'vitest';

import { conditions, DatasetError, trackOf, validateDataset } from '../src/dataset.ts';
import { starter } from './helpers.ts';

const good = () => JSON.parse(JSON.stringify(starter().recordings[0])) as Record<string, unknown>;
const dataset = (recordings: unknown[], extra: object = {}) => ({
  schema: 'kanche-kpb-dataset/1',
  synthetic: false,
  description: 'test',
  recordings,
  ...extra,
});

describe('the dataset format', () => {
  it('accepts the starter dataset, flagged synthetic', () => {
    const d = starter();
    expect(d.synthetic).toBe(true);
    expect(d.recordings.length).toBeGreaterThan(100);
    const groups = conditions(d);
    for (const recs of groups.values()) expect(recs).toHaveLength(5);
  });

  it.each([
    ['a non-object', 3],
    ['the wrong schema', { ...dataset([]), schema: 'v0' }],
    ['no synthetic flag', { ...dataset([]), synthetic: 'no' }],
    ['no description', { ...dataset([]), description: 1 }],
    ['no recordings', { ...dataset([]), recordings: {} }],
    ['a duplicate id', dataset([good(), good()])],
    ['an unknown kind', dataset([{ ...good(), kind: 'jump' }])],
    ['no id', dataset([{ ...good(), id: '' }])],
    ['no condition', dataset([{ ...good(), condition: 3 }])],
    ['a bad frame rate', dataset([{ ...good(), fps: 0 }])],
    ['no court', dataset([{ ...good(), court: null }])],
    ['no marbles', dataset([{ ...good(), marbles: [] }])],
    ['a bad marble size', dataset([{ ...good(), marbles: [{ id: 1, size: 'r50', x: 0, y: 0 }] }])],
    ['a shooter that is not a marble', dataset([{ ...good(), shooter: 9 }])],
    ['a bad launch', dataset([{ ...good(), launch: 'thrown' }])],
    ['a non-finite launch', dataset([{ ...good(), vx: 'fast' }])],
    ['a flick without a finger speed', dataset([{ ...good(), kind: 'flick' }])],
    ['no tracks', dataset([{ ...good(), tracks: [] }])],
    [
      'a track of no marble',
      dataset([{ ...good(), tracks: [{ id: 7, t0: 0, x: [0, 1], y: [0, 1] }] }]),
    ],
    [
      'mismatched coordinates',
      dataset([{ ...good(), tracks: [{ id: 1, t0: 0, x: [0, 1], y: [0] }] }]),
    ],
    [
      'a non-finite sample',
      dataset([{ ...good(), tracks: [{ id: 1, t0: 0, x: [0, null], y: [0, 1] }] }]),
    ],
  ])('rejects %s', (_, json) => {
    expect(() => validateDataset(json)).toThrow(DatasetError);
  });

  it('checks the court as the simulation builds it, from an import or an old file', () => {
    const r = good();
    const court = r['court'] as Record<string, unknown>;
    const withCourt = (c: unknown) => () => validateDataset(dataset([{ ...r, court: c }]));
    expect(withCourt({ ...court, surface: 'grass' })).toThrow(/court: unknown surface "grass"/);
    const inverted = { xMin: 1, xMax: -1, yMin: -1, yMax: 1 };
    expect(withCourt({ ...court, bounds: inverted })).toThrow(/court: bounds must be/);
    expect(withCourt({ surface: 'tile' })).toThrow(DatasetError);
  });

  it("insists on the shooter's track", () => {
    const r = good();
    const json = dataset([
      {
        ...r,
        marbles: [...(r['marbles'] as object[]), { id: 5, size: 'r80', x: 1, y: 1 }],
        shooter: 5,
      },
    ]);
    expect(() => validateDataset(json)).toThrow(/shooter's track/);
    expect(() => trackOf(starter().recordings[0] ?? ({} as never), 99)).toThrow(DatasetError);
  });
});
