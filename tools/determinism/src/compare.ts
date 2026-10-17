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

/** Every engine must run and every combined hash must equal the first engine's. */
export function compareRuns(runs: readonly EngineRun[]): Verdict {
  const failed = runs.filter((r) => r.result === undefined).map((r) => r.engine);
  const finished = runs.filter(
    (r): r is EngineRun & { result: HarnessResult } => r.result !== undefined,
  );
  const reference = finished[0]?.result.combined;
  const mismatched = finished.filter((r) => r.result.combined !== reference).map((r) => r.engine);
  const ok = runs.length > 0 && failed.length === 0 && mismatched.length === 0;
  return reference === undefined
    ? { ok, mismatched, failed }
    : { ok, reference, mismatched, failed };
}

export function formatTable(runs: readonly EngineRun[]): string {
  const rows = runs.map((r) => [
    r.engine,
    r.version,
    r.result?.combined ?? `ERROR: ${r.error ?? 'unknown'}`,
    `${String(Math.round(r.ms))} ms`,
  ]);
  const header = ['engine', 'version', 'combined hash', 'time'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}
