import { defineConfig, type ViteUserConfig } from 'vitest/config';

/** The coverage floor for simulation packages (physics, rules, ai). Phase 0 prompt, item 7. */
export const COVERAGE_GATE_PERCENT = 90;

export interface PackageTestOptions {
  /** Enforce the coverage gate on this package's src/ (lines, branches, functions, statements). */
  readonly coverageGate: boolean;
}

/** The thresholds a package gets; exported so the gate itself is tested. */
export function coverageThresholds(options: PackageTestOptions): Record<string, number> {
  if (!options.coverageGate) return {};
  return {
    lines: COVERAGE_GATE_PERCENT,
    branches: COVERAGE_GATE_PERCENT,
    functions: COVERAGE_GATE_PERCENT,
    statements: COVERAGE_GATE_PERCENT,
  };
}

/** One Vitest config shape for every package: tests in test/, coverage over src/. */
export function packageTestConfig(options: PackageTestOptions): ViteUserConfig {
  return defineConfig({
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        reporter: ['text-summary', 'json-summary', 'html'],
        thresholds: coverageThresholds(options),
      },
    },
  });
}
