import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export interface Budgets {
  readonly web: { readonly initialJsGzipBytes: number };
  readonly assets: { readonly artBytes: number; readonly audioBytes: number };
  readonly android: { readonly downloadBytes: number };
}

export interface Measurement {
  readonly name: string;
  readonly actual: number;
  readonly limit: number;
  readonly detail: string;
}

export const ART_EXTENSIONS = [
  '.png',
  '.webp',
  '.avif',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ktx2',
  '.basis',
];
export const AUDIO_EXTENSIONS = ['.ogg', '.opus', '.mp3', '.m4a', '.aac', '.wav', '.flac', '.webm'];

function positiveInteger(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`budgets.json: ${where} must be a positive integer number of bytes`);
  }
  return value;
}

function section(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new TypeError(`budgets.json: ${where} is missing`);
  return value as Record<string, unknown>;
}

/** Parse and validate budgets.json; a typo must fail loudly, not disable a budget. */
export function parseBudgets(json: unknown): Budgets {
  const root = section(json, 'the top level');
  const web = section(root['web'], 'web');
  const assets = section(root['assets'], 'assets');
  const android = section(root['android'], 'android');
  return {
    web: {
      initialJsGzipBytes: positiveInteger(web['initialJsGzipBytes'], 'web.initialJsGzipBytes'),
    },
    assets: {
      artBytes: positiveInteger(assets['artBytes'], 'assets.artBytes'),
      audioBytes: positiveInteger(assets['audioBytes'], 'assets.audioBytes'),
    },
    android: { downloadBytes: positiveInteger(android['downloadBytes'], 'android.downloadBytes') },
  };
}

/**
 * The JavaScript a first visit must download before the first frame: every module script and
 * modulepreload that index.html references. Lazy chunks are excluded on purpose.
 */
export function initialScripts(indexHtml: string): string[] {
  const found = new Set<string>();
  const tag = /<(script|link)\b[^>]*>/gi;
  for (const match of indexHtml.matchAll(tag)) {
    const html = match[0];
    const isModuleScript = /^<script/i.test(html) && /type=["']module["']/i.test(html);
    const isPreload = /^<link/i.test(html) && /rel=["']modulepreload["']/i.test(html);
    const src = /(?:src|href)=["']([^"']+)["']/i.exec(html)?.[1];
    if ((isModuleScript || isPreload) && src !== undefined && !/^(https?:)?\/\//.test(src))
      found.add(src);
  }
  return [...found];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
}

async function sumSizes(files: readonly string[]): Promise<number> {
  const sizes = await Promise.all(files.map(async (f) => (await stat(f)).size));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Measure a Vite dist/ folder against the web and asset budgets. */
export async function measureWeb(distDir: string, budgets: Budgets): Promise<Measurement[]> {
  const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
  const scripts = initialScripts(html);
  if (scripts.length === 0) throw new Error(`no module scripts found in ${distDir}/index.html`);
  let gz = 0;
  for (const src of scripts) {
    const file = path.join(distDir, src.replace(/^\.?\//, ''));
    gz += gzipSync(await readFile(file), { level: 9 }).length;
  }
  const files = await walk(distDir);
  const byExt = (exts: readonly string[]): string[] =>
    files.filter((f) => exts.includes(path.extname(f).toLowerCase()));
  return [
    {
      name: 'web.initialJsGzipBytes',
      actual: gz,
      limit: budgets.web.initialJsGzipBytes,
      detail: scripts.join(', '),
    },
    {
      name: 'assets.artBytes',
      actual: await sumSizes(byExt(ART_EXTENSIONS)),
      limit: budgets.assets.artBytes,
      detail: 'images in dist/',
    },
    {
      name: 'assets.audioBytes',
      actual: await sumSizes(byExt(AUDIO_EXTENSIONS)),
      limit: budgets.assets.audioBytes,
      detail: 'audio in dist/',
    },
  ];
}

/**
 * The Android download, measured conservatively as the APK's file size: Play's download is never
 * larger than the APK it serves. Phase 11 replaces this with bundletool's per-device size.
 */
export async function measureAndroid(apkPath: string, budgets: Budgets): Promise<Measurement> {
  return {
    name: 'android.downloadBytes',
    actual: (await stat(apkPath)).size,
    limit: budgets.android.downloadBytes,
    detail: apkPath,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export function report(measurements: readonly Measurement[]): { ok: boolean; text: string } {
  const lines = measurements.map((m) => {
    const pass = m.actual <= m.limit;
    const pct = ((100 * m.actual) / m.limit).toFixed(0);
    return `${pass ? 'PASS' : 'FAIL'}  ${m.name.padEnd(26)} ${formatBytes(m.actual).padStart(11)} of ${formatBytes(m.limit).padStart(11)} (${pct}%)  ${m.detail}`;
  });
  return { ok: measurements.every((m) => m.actual <= m.limit), text: lines.join('\n') };
}
