---
status: accepted
date: 2026-10-17
decision-makers: owner (approved the Phase 0 plan), agent
consulted: npm registry release dates; typescript-eslint peer ranges; GitHub branch-protection API; the Fuselings repo's proven toolchain
informed: every later phase
---

# A pnpm + Turborepo monorepo with strict TypeScript, pinned exactly

## Context and problem statement

Kanche has one language from physics to server: TypeScript. The phone, the browser, the AI worker and the Deno Edge Functions share packages. One solo builder needs fast, cached checks, hard package boundaries, and reproducible installs that a fresh clone can verify with `pnpm install && pnpm verify`.

## Decision drivers

- Shared core packages with enforced boundaries
- Reproducible installs and supply-chain safety
- Fast local and CI feedback
- Tools that later phases (and Claude Code sessions) can drive by command

## Considered options

- **pnpm workspaces + Turborepo** with TypeScript project references
- npm workspaces, no task runner (the Fuselings set-up)
- Nx
- A single package with folders

## Decision outcome

Chosen option: **pnpm workspaces + Turborepo**. pnpm's strict `node_modules` stops undeclared imports, its workspace protocol links the core packages, and Turborepo caches `test` and `build` per package with little configuration.

What else is decided:

- **TypeScript is strict everywhere**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` and `verbatimModuleSyntax`. It uses ESM and project references, and `tsc -b` checks every project.
- **Core packages split their config.** `tsconfig.lib.json` has `lib: ["ES2023"]` and `types: []`; `tsconfig.test.json` adds Node and Vitest. That keeps DOM and Node globals out of simulation code at the type level.
- **Packages export TypeScript source** (`./src/index.ts`) with `.ts` relative imports, so Vite, Vitest, Node's type stripping and Deno all run the same files without a build.
- **ESLint 10** uses a flat config, typescript-eslint `strictTypeChecked`, Prettier, per-package import boundaries, and the local determinism plugin (ADR-0004).
- **Vitest 5 + fast-check** for unit and property tests. Coverage uses v8, with a 90% gate on lines, branches, functions and statements for physics, rules and ai (`@kanche/testkit/vitest`). **Playwright** runs e2e in three engines, and **Deno test** covers `supabase/functions`.
- **`pnpm verify`** runs typecheck → lint → test → build → budgets.
- **Supply chain:**
  - Exact versions only (`savePrefix: ''`).
  - No version younger than 7 days (`minimumReleaseAge: 10080`).
  - Install scripts only for `allowBuilds` (esbuild).
  - GitHub Actions pinned to commit SHAs, and the Playwright CI image pinned by digest.
  - `engineStrict` holds Node and pnpm to their pins.
- **CI on GitHub Actions** has four required-check jobs (`verify`, `e2e (×3)`, `determinism`, `android-debug`).
  - A nightly workflow runs the full suite with 10,000 harness seeds, but only on days `main` changed. Its dependency audit runs every night.
  - The iOS simulator build (`ios.yml`, macOS) runs on demand only: a PR labelled `ios`, a manual run, or a hand-dispatched nightly.

### Pinned versions (Phase 0)

| Tool                                                                                                   | Version                                                      | Note                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Node                                                                                                   | 24.22.0                                                      | Active LTS ("Krypton"); Node 26 is not LTS until late October 2026                                             |
| pnpm                                                                                                   | 12.11.2                                                      | via corepack and `packageManager`                                                                              |
| TypeScript                                                                                             | 6.0.3                                                        | **Not 7.0.** typescript-eslint 8.71 supports `>=4.8.4 <6.1.0`, and TS 7 (the native port) breaks typed linting |
| Turborepo                                                                                              | 2.11.7                                                       | reads the pnpm 12 lockfile (checked)                                                                           |
| ESLint / @eslint/js                                                                                    | 10.12.0 / 10.0.1                                             | 10.13.0 was 1 day old                                                                                          |
| typescript-eslint (+ parser)                                                                           | 8.71.1                                                       |                                                                                                                |
| Prettier / eslint-config-prettier                                                                      | 3.9.9 / 10.1.8                                               |                                                                                                                |
| Vitest / @vitest/coverage-v8                                                                           | 5.0.3                                                        |                                                                                                                |
| fast-check                                                                                             | 4.10.2                                                       |                                                                                                                |
| @playwright/test                                                                                       | 1.64.0                                                       | CI image `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e…`                                         |
| esbuild                                                                                                | 0.28.2                                                       | bundles the harness                                                                                            |
| Deno                                                                                                   | 2.9.7                                                        | `@std/assert` 1.0.19 from JSR                                                                                  |
| @types/node                                                                                            | 24.19.2                                                      | matches the Node major                                                                                         |
| globals                                                                                                | 17.13.0                                                      |                                                                                                                |
| actions: checkout / setup-node / pnpm/action-setup / setup-deno / setup-java / upload-artifact / cache | v7.0.1 / v7.1.0 / v6.1.0 / v2.0.5 / v6.0.1 / v7.0.2 / v6.1.0 | SHAs in the workflows                                                                                          |

### Consequences

- Good, because a fresh clone reproduces exactly what CI ran, and a malicious release has a 7-day window to be caught before it can reach us.
- Good, because simulation code can't touch DOM or Node globals (they're type errors), and boundary breaks are lint errors with a reason.
- Bad, because security patches also wait 7 days. To take one sooner, raise it with an ADR and a one-off `pnpm install --config.minimumReleaseAge=0` for that package.
- Bad, because the Free plan includes 2,000 Actions minutes a month for private repositories, and macOS minutes count 10×. A nightly iOS build alone (15–20 min) would use 4,500–6,000 minutes a month and stop all CI mid-month. Hence iOS is on demand and the nightly skips quiet days. One PR push costs about 20 runner-minutes across the parallel jobs. Revisit if the repository goes public (then minutes are free) or the plan changes.
- Bad, because GitHub's Free plan refuses branch protection on private repositories (HTTP 403, checked 2026-10-17). **"Make PR checks required" is deferred.** `tools/scripts/require-checks.sh` applies it in one command once the repository is public or on Pro. Until then, the rule is followed by convention: never merge a PR with a red check.

### Confirmation

- `pnpm verify` in a fresh clone; CI on every PR.
- `tools/eslint-plugin-kanche/test/repo-config.test.ts` checks that the config applies the determinism rules where they belong.
- Adding `window` to `packages/physics/src` fails `tsc -b` (checked by hand on 2026-10-17).

## Pros and cons of the options

### npm workspaces, no task runner

- Good, because it's simple and proven in Fuselings.
- Bad, because there's no per-package caching, and npm's hoisting lets packages import undeclared dependencies.

### Nx

- Good, because it has powerful graph tooling and generators.
- Bad, because it's heavier to learn and configure for one builder, with more plugin surface to keep current.

### A single package

- Bad, because boundaries become conventions instead of compile errors, and the server can't import "just the core".

## More information

Revisit when typescript-eslint supports TypeScript 7 (move to it then), when Node 26 becomes LTS (move in Phase 11 at the latest), or when the repository becomes public or the account moves to Pro (run `require-checks.sh`).
