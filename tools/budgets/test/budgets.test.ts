import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  initialScripts,
  measureAndroid,
  measureWeb,
  parseBudgets,
  report,
  type Budgets,
} from '../src/budgets.ts';

const BUDGETS: Budgets = {
  web: { initialJsGzipBytes: 1000 },
  assets: { artBytes: 100, audioBytes: 100 },
  android: { downloadBytes: 50 },
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
  });

  it('accepts the committed budgets.json, with the 30 MB Android target', async () => {
    const { readFile } = await import('node:fs/promises');
    const file = path.resolve(import.meta.dirname, '../../../budgets.json');
    const budgets = parseBudgets(JSON.parse(await readFile(file, 'utf8')));
    expect(budgets.android.downloadBytes).toBeLessThanOrEqual(30 * 1024 * 1024);
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

describe('formatBytes', () => {
  it('uses B, KiB and MiB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MiB');
  });
});
