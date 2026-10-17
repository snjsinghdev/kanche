import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** A device tier's frame budget: `percentile`% of frames within `frameMs`, none over the cap in shots. */
export interface FrameBudget {
  /** Share of all frames that must come in within frameMs (%). */
  readonly percentile: number;
  /** The frame time those frames must meet (ms). */
  readonly frameMs: number;
  /** No frame during a shot may take longer than this (ms). */
  readonly maxShotFrameMs: number;
}

/** The tiers frame budgets are set for (ADR-0002): the reference budget phone and mid-range. */
export const DEVICE_TIERS = ['reference', 'midRange'] as const;
export type DeviceTier = (typeof DEVICE_TIERS)[number];

export interface Budgets {
  readonly web: { readonly initialJsGzipBytes: number };
  readonly assets: { readonly artBytes: number; readonly audioBytes: number };
  readonly android: { readonly downloadBytes: number };
  readonly frames: Readonly<Record<DeviceTier, FrameBudget>>;
}

export interface Measurement {
  readonly name: string;
  readonly actual: number;
  readonly limit: number;
  readonly detail: string;
  /** How actual and limit are shown (bytes unless stated). */
  readonly unit?: 'bytes' | 'ms';
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

function positiveMs(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`budgets.json: ${where} must be a positive number of milliseconds`);
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
  const frames = section(root['frames'], 'frames');
  const tier = (name: DeviceTier): FrameBudget => {
    const t = section(frames[name], `frames.${name}`);
    const percentile = t['percentile'];
    if (typeof percentile !== 'number' || !(percentile > 0 && percentile <= 100)) {
      throw new TypeError(`budgets.json: frames.${name}.percentile must be in (0, 100]`);
    }
    return {
      percentile,
      frameMs: positiveMs(t['frameMs'], `frames.${name}.frameMs`),
      maxShotFrameMs: positiveMs(t['maxShotFrameMs'], `frames.${name}.maxShotFrameMs`),
    };
  };
  return {
    web: {
      initialJsGzipBytes: positiveInteger(web['initialJsGzipBytes'], 'web.initialJsGzipBytes'),
    },
    assets: {
      artBytes: positiveInteger(assets['artBytes'], 'assets.artBytes'),
      audioBytes: positiveInteger(assets['audioBytes'], 'assets.audioBytes'),
    },
    android: { downloadBytes: positiveInteger(android['downloadBytes'], 'android.downloadBytes') },
    frames: { reference: tier('reference'), midRange: tier('midRange') },
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

/**
 * A frame-time report from a device run (Phase 3 writes them): every frame's time, and the frames
 * that fell during shots (a subset), in milliseconds.
 */
export interface FrameReport {
  readonly device: string;
  readonly tier: DeviceTier;
  readonly frameMs: readonly number[];
  readonly shotFrameMs: readonly number[];
}

export function parseFrameReport(json: unknown): FrameReport {
  const r = section(json, 'the frame report');
  const tier = r['tier'];
  if (typeof r['device'] !== 'string' || r['device'] === '') {
    throw new TypeError('frame report: device must name the phone');
  }
  if (!DEVICE_TIERS.includes(tier as DeviceTier)) {
    throw new TypeError(`frame report: tier must be one of ${DEVICE_TIERS.join(', ')}`);
  }
  const times = (key: string): number[] => {
    const v = r[key];
    if (
      !Array.isArray(v) ||
      !v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
    ) {
      throw new TypeError(`frame report: ${key} must be an array of frame times in ms`);
    }
    return v as number[];
  };
  const frameMs = times('frameMs');
  if (frameMs.length === 0) throw new TypeError('frame report: no frames');
  return {
    device: r['device'],
    tier: tier as DeviceTier,
    frameMs,
    shotFrameMs: times('shotFrameMs'),
  };
}

/** The nearest-rank percentile of a list (ms). */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? NaN;
}

/** Measure a device's frame report against its tier's frame budget. */
export function measureFrames(r: FrameReport, budgets: Budgets): Measurement[] {
  const b = budgets.frames[r.tier];
  return [
    {
      name: `frames.${r.tier}.p${String(b.percentile)}`,
      actual: percentile(r.frameMs, b.percentile),
      limit: b.frameMs,
      detail: `${r.device}, ${String(r.frameMs.length)} frames`,
      unit: 'ms',
    },
    {
      name: `frames.${r.tier}.maxShot`,
      actual: r.shotFrameMs.length === 0 ? 0 : Math.max(...r.shotFrameMs),
      limit: b.maxShotFrameMs,
      detail: `${r.device}, ${String(r.shotFrameMs.length)} frames in shots`,
      unit: 'ms',
    },
  ];
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
    const show = (n: number): string => (m.unit === 'ms' ? `${n.toFixed(1)} ms` : formatBytes(n));
    return `${pass ? 'PASS' : 'FAIL'}  ${m.name.padEnd(26)} ${show(m.actual).padStart(11)} of ${show(m.limit).padStart(11)} (${pct}%)  ${m.detail}`;
  });
  return { ok: measurements.every((m) => m.actual <= m.limit), text: lines.join('\n') };
}
