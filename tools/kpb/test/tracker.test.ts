import { describe, expect, it } from 'vitest';

import { DatasetError } from '../src/dataset.ts';
import { MAX_GAP, parseTrackerCsv, recordingFromTracks } from '../src/tracker.ts';

/** A Tracker-style export of x = 0.01 + 0.5·t − 0.1·t², y = 0.2·t at 240 fps. */
function export_(
  opts: {
    delimiter?: string;
    header?: string;
    name?: string;
    scale?: number;
    comma?: boolean;
    frames?: number;
    skip?: number[];
  } = {},
): string {
  const d = opts.delimiter ?? '\t';
  const lines = opts.name === undefined ? [] : [opts.name];
  lines.push(opts.header ?? ['t', 'x', 'y'].join(d));
  for (let k = 0; k < (opts.frames ?? 30); k += 1) {
    const t = k / 240;
    const x = (0.01 + 0.5 * t - 0.1 * t * t) * (opts.scale ?? 1);
    const y = 0.2 * t * (opts.scale ?? 1);
    const cells = [t, x, y].map((v) =>
      opts.comma === true ? v.toExponential(9).replace('.', ',') : v.toExponential(12),
    );
    if (opts.skip?.includes(k) === true) cells[1] = cells[2] = '';
    lines.push(cells.join(d));
  }
  return lines.join('\n');
}

describe('the Tracker import', () => {
  it('reads a tab-separated export with a track name', () => {
    const t = parseTrackerCsv(export_({ name: 'mass A' }));
    expect(t.name).toBe('mass A');
    expect(t.fps).toBeCloseTo(240, 6);
    expect(t.x[10]).toBeCloseTo(0.01 + 0.5 * (10 / 240) - 0.1 * (10 / 240) ** 2, 12);
    expect(t.y[29]).toBeCloseTo(0.2 * (29 / 240), 12);
  });

  it('reads commas, units in the header and centimetres', () => {
    const t = parseTrackerCsv(
      export_({ delimiter: ',', header: 't (s),x (cm),y [cm]', scale: 100 }),
      'cm',
    );
    expect(t.name).toBeNull();
    expect(t.x[0]).toBeCloseTo(0.01, 12);
  });

  it('reads semicolons with a decimal comma', () => {
    const t = parseTrackerCsv(export_({ delimiter: ';', comma: true }));
    expect(t.y[12]).toBeCloseTo(0.01, 9);
  });

  it('fills short runs of unmarked frames and refuses long ones', () => {
    const t = parseTrackerCsv(export_({ skip: [5, 6] }));
    expect(t.x[5]).toBeCloseTo(0.01 + 0.5 * (5 / 240), 4);
    const gap = Array.from({ length: MAX_GAP + 1 }, (_, i) => 5 + i);
    expect(() => parseTrackerCsv(export_({ skip: gap }))).toThrow(DatasetError);
    expect(() => parseTrackerCsv(export_({ skip: [0] }))).toThrow(DatasetError);
  });

  it.each([
    ['no header', 'a\tb\n1\t2'],
    ['too few frames', 't\tx\ty\n0\t0\t0\n0.1\t1\t1'],
    ['uneven frames', 't\tx\ty\n0\t0\t0\n0.1\t1\t1\n0.3\t2\t2\n0.4\t3\t3'],
  ])('refuses %s', (_, text) => {
    expect(() => parseTrackerCsv(text)).toThrow(DatasetError);
  });

  it('builds a recording: the launch from the first frames, a still marble from its average', () => {
    const shooter = parseTrackerCsv(export_({ frames: 120 }));
    const still = {
      name: null,
      fps: shooter.fps,
      t0: 0,
      x: new Array<number>(120).fill(0.3),
      y: new Array<number>(120).fill(0.02),
    };
    // The still marble is struck at frame 60: the launch window must end before it.
    for (let k = 60; k < 120; k += 1) still.x[k] = 0.3 + 0.01 * (k - 59);
    const rec = recordingFromTracks({
      id: 'r',
      condition: 'c',
      kind: 'head-on',
      court: { surface: 'cement', bounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 } },
      launch: 'rolling',
      shooter: { id: 1, size: 'r80', track: shooter },
      others: [{ id: 2, size: 'r95', track: still }],
      notes: 'n',
    });
    expect(rec.vx).toBeCloseTo(0.5, 9);
    expect(rec.vy).toBeCloseTo(0.2, 9);
    expect(rec.marbles[0]).toMatchObject({
      x: expect.closeTo(0.01, 12) as number,
      y: expect.closeTo(0, 12) as number,
    });
    expect(rec.marbles[1]).toMatchObject({ id: 2, size: 'r95' });
    expect(rec.marbles[1]?.x).toBeCloseTo(0.3, 12);
    expect(rec.marbles[1]?.y).toBeCloseTo(0.02, 12);
    expect(() =>
      recordingFromTracks({
        id: 'r',
        condition: 'c',
        kind: 'roll',
        court: rec.court,
        launch: 'rolling',
        shooter: { id: 1, size: 'r80', track: shooter },
        others: [{ id: 2, size: 'r80', track: { ...still, fps: 120 } }],
      }),
    ).toThrow(DatasetError);
  });
});
