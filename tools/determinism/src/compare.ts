import type { HarnessResult } from './entry.ts';

export interface EngineRun {
  readonly engine: string;
  readonly version: string;
  readonly result?: HarnessResult;
  readonly error?: string;
  readonly ms: number;
}

export interface Verdict {
  readonly ok: boolean;
  readonly reference?: string;
  readonly mismatched: readonly string[];
  readonly failed: readonly string[];
}

/** The part of a result that every engine must reproduce exactly. */
function signature(r: HarnessResult): string {
  return `${r.combined}/${r.goldenCombined}/${r.shotsCombined}`;
}

/**
 * Every engine must run, every engine's probe, golden and shot hashes must equal the first
 * engine's, and no engine may differ from the committed golden hashes.
 */
export function compareRuns(runs: readonly EngineRun[]): Verdict {
  const failed = runs.filter((r) => r.result === undefined).map((r) => r.engine);
  const finished = runs.filter(
    (r): r is EngineRun & { result: HarnessResult } => r.result !== undefined,
  );
  const first = finished[0]?.result;
  const reference = first === undefined ? undefined : signature(first);
  const mismatched = finished
    .filter((r) => signature(r.result) !== reference || r.result.goldenMismatches.length > 0)
    .map((r) => r.engine);
  const ok = runs.length > 0 && failed.length === 0 && mismatched.length === 0;
  return reference === undefined
    ? { ok, mismatched, failed }
    : { ok, reference, mismatched, failed };
}

export function formatTable(runs: readonly EngineRun[]): string {
  const rows = runs.map((r) => [
    r.engine,
    r.version,
    r.result === undefined
      ? `ERROR: ${r.error ?? 'unknown'}`
      : `${r.result.combined} ${r.result.goldenCombined} ${r.result.shotsCombined}` +
        (r.result.goldenMismatches.length > 0
          ? ` (${String(r.result.goldenMismatches.length)} goldens differ)`
          : ''),
    `${String(Math.round(r.ms))} ms`,
  ]);
  const header = ['engine', 'version', 'probe / goldens / shots', 'time'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}
