import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { main } from '../src/cli.ts';
import { validateDataset } from '../src/dataset.ts';
import { starter } from './helpers.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'kanche-kpb-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A recording's track as a Tracker export (tab-separated, metres). */
function csv(t: { t0: number; x: readonly number[]; y: readonly number[] }, fps: number): string {
  const rows = t.x.map((x, k) => [t.t0 + k / fps, x, t.y[k]].join('\t'));
  return ['mass A', 't\tx\ty', ...rows].join('\n');
}

describe('the KPB CLI', () => {
  it('imports Tracker exports into a dataset, then fits and scores it', () => {
    const file = path.join(dir, 'filmed.json');
    const rolls = starter().recordings.filter((r) => r.condition === 'roll tile 0.6 m/s');
    rolls.slice(0, 3).forEach((r, i) => {
      const track = r.tracks[0];
      if (track === undefined) throw new Error('no track');
      const export_ = path.join(dir, `roll${String(i)}.csv`);
      writeFileSync(export_, csv(track, r.fps));
      const code = main([
        'import',
        '--dataset',
        file,
        '--id',
        `roll ${String(i)}`,
        '--condition',
        'roll tile',
        '--kind',
        'roll',
        '--surface',
        'tile',
        '--launch',
        'rolling',
        '--shooter',
        `1:r80:${export_}`,
      ]);
      expect(code).toBe(0);
    });
    const d = validateDataset(JSON.parse(readFileSync(file, 'utf8')));
    expect(d.synthetic).toBe(false);
    expect(d.recordings).toHaveLength(3);
    const overrides = path.join(dir, 'fit.json');
    expect(main(['fit', file, '--out', overrides])).toBe(0);
    const fitted = JSON.parse(readFileSync(overrides, 'utf8')) as {
      surfaces: { tile: { muR: number } };
    };
    expect(fitted.surfaces.tile.muR).toBeGreaterThan(0.006);
    expect(main(['score', file, '--params', overrides, '--strict'])).toBe(0);
    expect(main(['score', file, '--strict'])).toBe(1);
    // A switch never swallows the argument after it, and a missing dataset is named as such.
    expect(main(['score', '--strict', file])).toBe(1);
    expect(() => main(['score', '--strict'])).toThrow(/score needs a dataset file/);
    expect(() => main(['fit'])).toThrow(/fit needs a dataset file/);
  }, 120_000);

  it('refuses bad import arguments before reading anything', () => {
    const base = ['import', '--dataset', path.join(dir, 'x.json'), '--id', 'a', '--condition', 'c'];
    const rest = ['--shooter', '1:r80:none.csv'];
    const run = (extra: string[]) => () => main([...base, ...extra, ...rest]);
    expect(run(['--kind', 'roll', '--surface', 'ice', '--launch', 'rolling'])).toThrow(/--surface/);
    expect(run(['--kind', 'jump', '--surface', 'tile', '--launch', 'rolling'])).toThrow(/--kind/);
    expect(run(['--kind', 'roll', '--surface', 'tile', '--launch', 'thrown'])).toThrow(/--launch/);
    expect(
      run(['--kind', 'roll', '--surface', 'tile', '--launch', 'rolling', '--unit', 'ft']),
    ).toThrow(/--unit/);
    expect(() => main(['import', '--dataset'])).toThrow(/needs a value/);
    expect(() =>
      main([
        ...base,
        '--kind',
        'roll',
        '--surface',
        'tile',
        '--launch',
        'rolling',
        '--shooter',
        'x:r80:a.csv',
      ]),
    ).toThrow(/a marble is/);
    expect(() =>
      main([
        ...base,
        '--kind',
        'roll',
        '--surface',
        'tile',
        '--launch',
        'rolling',
        '--shooter',
        '1:r70:a.csv',
      ]),
    ).toThrow(/marble size/);
  });

  it('writes the synthetic dataset and prints usage for anything else', () => {
    const out = path.join(dir, 'synthetic.json');
    expect(main(['synthetic', '--out', out])).toBe(0);
    expect(validateDataset(JSON.parse(readFileSync(out, 'utf8'))).synthetic).toBe(true);
    expect(main(['help'])).toBe(2);
  }, 60_000);
});
