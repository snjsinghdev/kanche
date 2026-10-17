import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { determinismRules } from '../src/index.ts';

// These tests run the real ESLint CLI against the real repository config, in a child process:
// the same thing `pnpm lint` does, and it keeps the plugin from loading twice in this process.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslintBin = path.join(
  path.dirname(createRequire(import.meta.url).resolve('eslint/package.json')),
  'bin/eslint.js',
);
const FIXTURE = 'packages/physics/test/determinism-fixtures/calls-math-sin.ts';

interface LintMessage {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly message: string;
}

async function eslint(args: readonly string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [eslintBin, ...args], {
      cwd: repoRoot,
      maxBuffer: 16 << 20,
    });
    return { code: 0, stdout };
  } catch (error) {
    const e = error as { code?: number; stdout?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? '' };
  }
}

async function lintJson(
  args: readonly string[],
): Promise<{ code: number; messages: LintMessage[] }> {
  const { code, stdout } = await eslint(['--format', 'json', ...args]);
  const results = JSON.parse(stdout) as { messages: LintMessage[] }[];
  return { code, messages: results.flatMap((r) => r.messages) };
}

describe('the repository ESLint config', () => {
  it('fails the Math.sin fixture inside packages/physics (Phase 0 gate)', async () => {
    const { code, messages } = await lintJson(['--no-ignore', FIXTURE]);
    expect(code).toBe(1);
    const sin = messages.find((m) => m.ruleId === 'kanche/no-banned-math');
    expect(sin?.severity).toBe(2);
    expect(sin?.message).toMatch(/Math\.sin/);
  }, 60_000);

  it('ignores the fixture folder in the normal lint run, so pnpm lint stays green', async () => {
    const { code, messages } = await lintJson([FIXTURE]);
    expect(code).toBe(0);
    expect(messages.map((m) => m.message).join()).toMatch(/ignored/i);
  }, 60_000);

  it('applies every determinism rule to simulation code and none to the client', async () => {
    const sim = [
      'packages/physics/src/index.ts',
      'packages/rules/src/index.ts',
      'packages/ai/src/index.ts',
      'packages/marble-gen/src/genome/index.ts',
    ];
    for (const file of [...sim, 'apps/client/src/main.ts']) {
      const { stdout } = await eslint(['--print-config', file]);
      const rules = (JSON.parse(stdout) as { rules: Record<string, unknown> }).rules;
      for (const rule of Object.keys(determinismRules)) {
        if (sim.includes(file)) expect(rules[rule], `${rule} on ${file}`).toEqual([2]);
        else expect(rules[rule], `${rule} on ${file}`).toBeUndefined();
      }
    }
  }, 120_000);
});
