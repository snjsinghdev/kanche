/**
 * The cross-engine determinism harness (Phase 0 prompt, item 6). Runs the bundled probe in Node,
 * Deno, Chromium, WebKit and Firefox and fails unless every engine reports the same hash.
 *
 *   pnpm harness                          # 1,000 seeds
 *   KANCHE_HARNESS_SEEDS=10000 pnpm harness
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { chromium, firefox, webkit, type BrowserType } from '@playwright/test';

import { compareRuns, formatTable, type EngineRun } from './compare.ts';
import { BUNDLE_PATH, DEFAULT_STEPS, HARNESS_ROOT, REPORT_PATH, seedsFromEnv } from './config.ts';
import type { HarnessResult } from './entry.ts';

const run = promisify(execFile);
const seeds = seedsFromEnv(process.env);
const steps = DEFAULT_STEPS;

type HarnessModule = { runHarness: (seeds: number, steps: number) => HarnessResult };

async function inNode(): Promise<EngineRun> {
  const start = performance.now();
  const mod = (await import(pathToFileURL(BUNDLE_PATH).href)) as HarnessModule;
  const result = mod.runHarness(seeds, steps);
  return { engine: 'node', version: process.version, result, ms: performance.now() - start };
}

async function inDeno(): Promise<EngineRun> {
  const start = performance.now();
  try {
    const runner = path.join(HARNESS_ROOT, 'src', 'deno-runner.js');
    const { stdout } = await run(
      'deno',
      ['run', `--allow-read=${BUNDLE_PATH}`, runner, BUNDLE_PATH, String(seeds), String(steps)],
      {
        maxBuffer: 1 << 20,
      },
    );
    const parsed = JSON.parse(stdout) as { version: string; result: HarnessResult; ms: number };
    return { engine: 'deno', version: parsed.version, result: parsed.result, ms: parsed.ms };
  } catch (error) {
    return { engine: 'deno', version: '?', error: String(error), ms: performance.now() - start };
  }
}

async function inBrowser(name: string, type: BrowserType, bundle: string): Promise<EngineRun> {
  const start = performance.now();
  let version = '?';
  try {
    const browser = await type.launch();
    version = browser.version();
    try {
      const page = await browser.newPage();
      await page.goto('about:blank');
      await page.addScriptTag({
        type: 'module',
        content: `${bundle}\nglobalThis.__kancheHarness = runHarness;\n`,
      });
      await page.waitForFunction(() => '__kancheHarness' in globalThis);
      const t0 = performance.now();
      const result = await page.evaluate(
        ([s, n]) =>
          (
            globalThis as unknown as { __kancheHarness: HarnessModule['runHarness'] }
          ).__kancheHarness(s, n),
        [seeds, steps] as const,
      );
      return { engine: name, version, result, ms: performance.now() - t0 };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return { engine: name, version, error: String(error), ms: performance.now() - start };
  }
}

const bundle = await readFile(BUNDLE_PATH, 'utf8');
const runs: EngineRun[] = [await inNode(), await inDeno()];
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
] as const) {
  runs.push(await inBrowser(name, type, bundle));
}

const verdict = compareRuns(runs);
console.log(`\nKanche determinism harness: ${String(seeds)} seeds x ${String(steps)} steps\n`);
console.log(formatTable(runs));
await writeFile(REPORT_PATH, `${JSON.stringify({ seeds, steps, verdict, runs }, null, 2)}\n`);
if (verdict.ok) {
  console.log(`\nPASS: all ${String(runs.length)} engines agree (${verdict.reference ?? ''}).`);
} else {
  console.log(
    `\nFAIL: mismatched [${verdict.mismatched.join(', ')}], failed [${verdict.failed.join(', ')}].`,
  );
  process.exitCode = 1;
}
