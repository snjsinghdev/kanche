# Phase 0 handoff: Foundations

**Date:** 2026-10-17 · **Branch:** `phase-00-foundations` · **Plan:** `docs/phases/phase-00-plan.md` · **Evidence:** `docs/evidence/phase-00/`

## What was built

- **Monorepo:** pnpm 12 workspaces and Turborepo 2.11, with strict TypeScript 6.0.3 (project references, ESM, `.ts` imports, no build step for packages).
  - `apps/client`
  - `packages/{physics,rules,ai,marble-gen,protocol,content,testkit}`
  - `supabase/`
  - `tools/{eslint-plugin-kanche,determinism,budgets,scripts}`
  - `docs/`
- **Boundaries, three walls deep:**
  - Types: the core packages' `tsconfig.lib.json` has no DOM or Node types.
  - ESLint import and global restrictions per package.
  - The determinism lint (ADR-0004).
- **Determinism lint:** `tools/eslint-plugin-kanche`, with four rules and 120 RuleTester cases in both directions. A gate test runs the real ESLint CLI on the `Math.sin` fixture in `packages/physics`.
- **Physics foundation:**
  - `physicsVersion = 1`
  - `createRng` (xoshiro128**/splitmix32)
  - `Fnv64`/`hashFloat64s` (64-bit FNV-1a over float64 bytes, which fails fast on non-finite values)
  - `determinismProbe`

  The RNG and the hash are each verified against an independent BigInt implementation. `rulesVersion`, `aiVersion`, `protocolVersion`, `genomeVersion` and `contentSchemaVersion` are all 1.

- **Tests:**
  - Vitest 5 with fast-check, and a coverage gate of 90% (lines, branches, functions, statements) on physics, rules and ai via `@kanche/testkit/vitest`. Physics is at 99% statements and 96% branches.
  - Playwright e2e on three engines.
  - Deno tests for `supabase/functions`.
- **Cross-engine harness:** `pnpm harness`. Node, Deno, Chromium, WebKit and Firefox give identical hashes (1,000 seeds on PRs, 10,000 nightly).
- **Budgets as code:** `budgets.json` and `tools/budgets`.
  - Initial JS gzip: 170,000 B (measured 131.7 KiB).
  - Art: 6 MiB. Audio: 8 MiB.
  - Android download: 30 MiB (debug APK measured at 4.74 MiB).
- **CI:**
  - `ci.yml`, on PRs and main: `verify`, `e2e (chromium|webkit|firefox)`, `determinism`, `android-debug`.
  - `nightly.yml`: everything with 10k seeds on days `main` changed, plus a nightly `audit`.
  - `ios.yml`: `ios-simulator` (macos-26), on demand only (a PR labelled `ios`, or a manual run), because macOS minutes count 10×.

  Actions are pinned by SHA and the Playwright image by digest. actionlint passes.

- **Client skeleton:**
  - Vite 8 + PixiJS 8.22 canvas at 270×480, with integer-first scaling (sharp-bilinear fallback) inside the safe area, a wordless test scene, and render-on-demand.
  - Capacitor 8.5.3 Android and iOS projects; `MainActivity` enables edge-to-edge.
  - The debug APK runs on the low-end emulator.
- **Supabase skeleton:** `config.toml` and a `health` function that imports the shared core through `functions/deno.json`. The Deno test reproduces the Node golden hash.
- **Docs and instruction files:**
  - Root `CLAUDE.md`, plus CLAUDE.md files in physics, rules, ai, supabase and apps/client
  - `ARCHITECTURE.md`, `qualities.md`, `setup.md`
  - MADR template and ADRs 0001–0005
  - `.coderabbit.yaml` (validated against CodeRabbit's schema)
  - PR template with the 12-quality checklist
  - `.env.example` files

## Pinned versions

Node 24.22.0 · pnpm 12.11.2 · TypeScript 6.0.3 · Turborepo 2.11.7 · ESLint 10.12.0 · typescript-eslint 8.71.1 · Prettier 3.9.9 · Vitest 5.0.3 · fast-check 4.10.2 · Playwright 1.64.0 · esbuild 0.28.2 · Vite 8.3.4 · PixiJS 8.22.0 · Capacitor 8.5.3 · Deno 2.9.7 · @std/assert 1.0.19 · Supabase CLI 2.120.0 (config only) · Gradle 8.14.3 (wrapper) · Android minSdk 24 / target 36. ADR-0001 has the full table and the GitHub Actions SHAs.

## Gate status

| Done-when item                                                                   | Status                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A fresh clone passes `pnpm install && pnpm verify`                               | ✅ A fresh `git clone` in the scratchpad: install 27.5 s, `pnpm verify` exit 0 in 1 min 47 s (2026-10-17)                                                                                  |
| The determinism lint fails on a `Math.sin` fixture in packages/physics           | ✅ `kanche/no-banned-math`, exit 1; tested in `pnpm test`                                                                                                                                  |
| The harness reports identical hashes in Chromium, WebKit, Firefox, Node and Deno | ✅ `0e4d48c50528e812` in all five, locally and in CI (run 39018350863)                                                                                                                     |
| The Android debug build installs on a low-end phone and shows the canvas         | ✅ On the low-end **emulator** stand-in (API 30, 720×1280, 2 GB) and on the owner's OnePlus (Android 15), with screenshots of both. No physical low-end phone (open issue 4)               |
| `docs/handoff/phase-00.md`                                                       | ✅ This file                                                                                                                                                                               |
| A PR titled "Phase 00 — Foundations" is open with CodeRabbit feedback resolved   | ⏳ [PR #1](https://github.com/snjsinghdev/kanche/pull/1) is open with CI green. CodeRabbit can't review until the owner installs the CodeRabbit app on `snjsinghdev/kanche` (open issue 1) |

## CI on PR #1

- **First run (39018132864):** `verify`, `e2e ×3` and `android-debug` passed. `determinism` failed before running the harness: setup-deno needs `unzip`, which the Playwright container lacks and its non-root user can't install. Fixed by running that job on the host with `playwright install --with-deps` (commit `e68297e`).
- **Second run (39018350863):** all six jobs green.
  - `verify` 40 s
  - `e2e` chromium, webkit and firefox about 1 min each
  - `determinism` 1 min 40 s: Node v24.22.0, Deno 2.9.7, Chromium 156, WebKit 27.2 and Firefox 157 all gave `0e4d48c50528e812`, the same as on this machine
  - `android-debug` 1 min 21 s: APK 4.74 MiB of 30 MiB
- **iOS (`ios.yml`, run 39018138826):** `** BUILD SUCCEEDED **` on `macos-26` with Xcode 26.6 (iPhoneSimulator 26.5 SDK), unsigned, in 53 s. The `ios` label was then removed so pushes don't re-run it.
- **The nightly** can't be dispatched until `nightly.yml` is on `main` (GitHub resolves dispatch from the default branch). It runs for the first time after merge.

## Found on a real device

The owner's phone showed a native action bar titled "Kanche" over the game: `EdgeToEdge.enable` ran before `BridgeActivity` set `AppTheme.NoActionBar`. Moving the call after `super.onCreate()` fixed it, but on Android 11 the insets then arrived after the first layout and nothing re-laid out. A `ResizeObserver` on the safe-area probe now handles any inset change, with an e2e test that fails without it. **Lessons for later phases:** check every native change on both an old (API 30) and a new (Android 15) device, and never assume the insets are final at load.

## Deviations from the approved plan

- **`testkit` imports no other `@kanche` package.** The plan let it import the core packages. Every core package's tests depend on testkit, so that would be a package cycle, which Turborepo refuses.
- **The fixture gate test runs the ESLint CLI in a child process**, not the in-process API. Loading the plugin twice in one process corrupted its coverage numbers, and the CLI is what `pnpm lint` runs anyway.
- **Turborepo 2.11 writes an `AGENTS.md`** when it detects an AI agent. It's switched off (`agentGuidance: false`) because `CLAUDE.md` is the instruction file. Its advice (read `node_modules/turbo/docs/`) moved into `CLAUDE.md`.
- **Versions follow the 7-day rule strictly**, so Playwright is 1.64.0 (not 1.64.1), Vitest 5.0.3, Prettier 3.9.9 and the Supabase CLI 2.120.0.
- **`supabase/` is a workspace package** (`@kanche/supabase`), so `turbo run test` runs its Deno tests.
- **Every core package has a version constant**, not only physics and rules (`aiVersion`, `protocolVersion`, `genomeVersion`, `contentSchemaVersion`). The server re-runs AI turns and genome derivation, so they need the same discipline.
- **The iOS build runs on demand, not nightly, and the nightly suite skips days `main` didn't change.** The plan had both every night. On the Free plan's 2,000 minutes a month, with macOS counting 10×, a nightly iOS build would stop all CI mid-month (ADR-0001).
- **e2e runs against `vite build --mode e2e`** in `dist-e2e/`: production code plus the test hook. The production `dist/` never contains the hook.

## Open issues

1. **CodeRabbit isn't installed** on the account. The owner adds the repository in the CodeRabbit GitHub app. Its first review then runs on the open PR, and its feedback must be resolved before merge.
2. **Required checks can't be enforced.** GitHub's Free plan refuses branch protection on private repositories (HTTP 403). Run `tools/scripts/require-checks.sh` once the repository is public or on Pro. Until then: never merge with a red check.
3. **iOS** is generated and synced on Linux but can only be built on macOS. The on-demand `ios-simulator` job (`ios.yml`) builds it unsigned. Device runs need signing (Phase 11).
4. **Physical low-end phone:** no low-end device is available here. The API 30 emulator stands in, and its numbers are provisional. The owner's OnePlus CPH2467 (Android 15, mid-range) runs the build: crisp integer 4× inside the safe area. On that phone the build found two bugs, both fixed and recorded in `docs/evidence/phase-00/README.md`: an action bar caused by the order of the edge-to-edge call, and no relayout when the insets change.
5. **Supabase local stack:** there's no Docker on this machine, so `supabase start` and `supabase test db` don't run here. Phase 6 needs Docker or a hosted dev project, and must also check that `functions deploy` bundles the core imported from `../../packages` (ADR-0005).
6. **WebKit on this machine** runs only because of the no-sudo library copy in `docs/setup.md`. A new Playwright WebKit revision needs it again.
7. **Old WebViews:** below 111, the app shows a blank page (ADR-0002). The feature-detecting "update WebView" page and a CSP (PixiJS needs `pixi.js/unsafe-eval` under a strict `script-src`) are Phase 11 items.
8. **Android download size** is measured as the debug APK size, an upper bound. Phase 11 switches to bundletool's per-device download size for the release AAB.
9. **pnpm "agent skills" for `pixi.js`** are left unapproved on purpose.

## Notes for Phase 1 (physics core)

- Put the simulation in `packages/physics/src`. The determinism lint and the type wall are already on.
  - Use `createRng` for any randomness.
  - Hash the authoritative state with `Fnv64` (position, velocity, spin; not orientation).
  - Bump `physicsVersion` with any outcome change, and update the golden values in the same commit.
- **Extend the harness** (`tools/determinism/src/entry.ts`): add the 10,000 seeded shots and 200 golden replays that KPB v1's determinism suite requires. The runner already covers all five engines.
- **No `sin`, `cos` or `exp` at runtime.** Write lookup tables as committed data files with a generator script and a test that regenerates and compares them.
- **Coverage gate:** 90% on all four measures. Physics is at 99/96/100/100 now, and new code must keep it.
- **`noUncheckedIndexedAccess` with typed arrays** makes every indexed read `number | undefined`. `?? 0` adds uncovered branches, and non-null assertions are lint errors. The probe avoids indexing by iterating objects and pre-built pairs. For hot loops over `Float64Array`, decide the idiom in an ADR, e.g. a checked accessor, or a scoped lint exception for `@typescript-eslint/no-non-null-assertion` in `packages/physics/src/sim/**`.
- **The KPB reality suite** needs 240 fps footage of real marbles on five surfaces. That's a physical task for the owner, and it's on the critical path for calibration.
- The reference suite compares against pooltool (Python). Run it as a dev tool, not a dependency, and commit its outputs as golden data with the script that produced them.
