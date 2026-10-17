import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  initialScripts,
  measureAndroid,
  measureFrames,
  measureWeb,
  parseBudgets,
  parseFrameReport,
  percentile,
  report,
  type Budgets,
} from '../src/budgets.ts';

const BUDGETS: Budgets = {
  web: { initialJsGzipBytes: 1000 },
  assets: { artBytes: 100, audioBytes: 100 },
  android: { downloadBytes: 50 },
  frames: {
    reference: { percentile: 95, frameMs: 16.7, maxShotFrameMs: 50 },
    midRange: { percentile: 99, frameMs: 16.7, maxShotFrameMs: 33 },
  },
};

async function fakeDist(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kanche-budgets-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><script type="module" crossorigin src="./assets/index.js"></script>
     <link rel="modulepreload" href="/assets/vendor.js"><link rel="stylesheet" href="/assets/a.css">
     <script src="https://cdn.example/x.js" type="module"></script>`,
  );
  await writeFile(path.join(dir, 'assets/index.js'), 'console.log(1);'.repeat(10));
  await writeFile(path.join(dir, 'assets/vendor.js'), 'export const v = 1;');
  await writeFile(path.join(dir, 'assets/lazy.js'), 'x'.repeat(100_000));
  await writeFile(path.join(dir, 'assets/ring.png'), Buffer.alloc(60));
  await writeFile(path.join(dir, 'assets/clack.ogg'), Buffer.alloc(150));
  return dir;
}

describe('parseBudgets', () => {
  it('reads a valid file', () => {
    expect(parseBudgets(BUDGETS)).toEqual(BUDGETS);
  });

  it('fails loudly on a missing or mistyped budget', () => {
    expect(() => parseBudgets(null)).toThrow(/top level/);
    expect(() => parseBudgets({ ...BUDGETS, web: {} })).toThrow(/web.initialJsGzipBytes/);
    expect(() => parseBudgets({ ...BUDGETS, android: { downloadBytes: '30MB' } })).toThrow(
      /android/,
    );
    expect(() => parseBudgets({ ...BUDGETS, assets: { artBytes: 1, audioBytes: 0 } })).toThrow(
      /audioBytes/,
    );
    expect(() => parseBudgets({ ...BUDGETS, frames: undefined })).toThrow(/frames/);
    expect(() =>
      parseBudgets({ ...BUDGETS, frames: { ...BUDGETS.frames, midRange: { percentile: 120 } } }),
    ).toThrow(/percentile/);
    expect(() =>
      parseBudgets({
        ...BUDGETS,
        frames: {
          ...BUDGETS.frames,
          reference: { percentile: 95, frameMs: 0, maxShotFrameMs: 50 },
        },
      }),
    ).toThrow(/frameMs/);
  });

  it('accepts the committed budgets.json, with the 30 MB Android target', async () => {
    const { readFile } = await import('node:fs/promises');
    const file = path.resolve(import.meta.dirname, '../../../budgets.json');
    const budgets = parseBudgets(JSON.parse(await readFile(file, 'utf8')));
    expect(budgets.android.downloadBytes).toBeLessThanOrEqual(30 * 1024 * 1024);
    // The Kanche Visual Benchmark's frame marks (ADR-0002).
    expect(budgets.frames).toEqual(BUDGETS.frames);
  });
});

describe('initialScripts', () => {
  it('finds module scripts and modulepreloads, not stylesheets or remote scripts', () => {
    const html =
      '<script type="module" src="/a.js"></script><link rel="modulepreload" href="/b.js"><link rel="stylesheet" href="/c.css"><script type="module" src="//x/y.js"></script>';
    expect(initialScripts(html)).toEqual(['/a.js', '/b.js']);
  });
});

describe('measureWeb', () => {
  it('gzips only the initial scripts and sums assets by kind', async () => {
    const dir = await fakeDist();
    const [js, art, audio] = await measureWeb(dir, BUDGETS);
    expect(js?.actual).toBeGreaterThan(0);
    expect(js?.actual).toBeLessThan(200); // the 100 KB lazy chunk is not counted
    expect(art?.actual).toBe(60);
    expect(audio?.actual).toBe(150);
    const { ok, text } = report([js, art, audio].filter((m) => m !== undefined));
    expect(ok).toBe(false); // audio is over its 100-byte budget
    expect(text).toMatch(/FAIL\s+assets.audioBytes/);
    expect(text).toMatch(/PASS\s+assets.artBytes/);
  });

  it('refuses a build with no entry script', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kanche-budgets-'));
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><p>no scripts</p>');
    await expect(measureWeb(dir, BUDGETS)).rejects.toThrow(/no module scripts/);
  });
});

describe('measureAndroid', () => {
  it('measures the APK file against the download budget', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kanche-apk-'));
    const apk = path.join(dir, 'app.apk');
    await writeFile(apk, Buffer.alloc(40));
    expect(await measureAndroid(apk, BUDGETS)).toMatchObject({ actual: 40, limit: 50 });
  });
});

describe('frame budgets', () => {
  const frames = (n: number, slow: number, slowMs: number): number[] =>
    Array.from({ length: n }, (_, i) => (i < slow ? slowMs : 10));

  it('take the nearest-rank percentile', () => {
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5);
    expect(percentile([5, 1, 3, 2, 4], 20)).toBe(1);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
  });

  it('pass when 95% of frames make 16.7 ms and no shot frame passes 50 ms on the reference phone', () => {
    const r = {
      device: 'phone',
      tier: 'reference' as const,
      frameMs: frames(100, 5, 40),
      shotFrameMs: [12, 49],
    };
    const [p95, worst] = measureFrames(r, BUDGETS);
    expect(p95).toMatchObject({
      name: 'frames.reference.p95',
      actual: 10,
      limit: 16.7,
      unit: 'ms',
    });
    expect(worst).toMatchObject({ name: 'frames.reference.maxShot', actual: 49, limit: 50 });
    expect(report([p95, worst].filter((m) => m !== undefined)).ok).toBe(true);
  });

  it('fail when too many frames are slow, or one shot frame hitches', () => {
    const slow = {
      device: 'phone',
      tier: 'reference' as const,
      frameMs: frames(100, 6, 20),
      shotFrameMs: [],
    };
    const [p95] = measureFrames(slow, BUDGETS);
    expect(p95?.actual).toBe(20);
    const hitch = {
      device: 'mid',
      tier: 'midRange' as const,
      frameMs: frames(100, 0, 0),
      shotFrameMs: [34],
    };
    const { ok, text } = report(measureFrames(hitch, BUDGETS));
    expect(ok).toBe(false);
    expect(text).toMatch(/FAIL\s+frames.midRange.maxShot\s+34.0 ms of\s+33.0 ms/);
  });

  it('read a device report and refuse a malformed one', () => {
    const json = { device: 'Moto G04', tier: 'reference', frameMs: [16, 17], shotFrameMs: [17] };
    expect(parseFrameReport(json)).toEqual(json);
    expect(() => parseFrameReport({ ...json, device: '' })).toThrow(/device/);
    expect(() => parseFrameReport({ ...json, tier: 'flagship' })).toThrow(/tier/);
    expect(() => parseFrameReport({ ...json, frameMs: [] })).toThrow(/no frames/);
    expect(() => parseFrameReport({ ...json, shotFrameMs: ['17'] })).toThrow(/shotFrameMs/);
  });
});

describe('formatBytes', () => {
  it('uses B, KiB and MiB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MiB');
  });
});
