# Kanche — Phase 0 plan: Foundations

> Approved by the owner on 2026-10-17, in plan mode, before implementation. Kept as approved; deviations made during the build are listed in `docs/handoff/phase-00.md`.

## Context

`/mnt/data/kanche-prompt-pack` has the 12-phase prompt pack for Kanche, a street-marbles game played for keeps. You asked to build the game from Phase 0. This session covers **Phase 0 only**, up to its gate. The pack says to run each phase in a fresh session and to hold each gate before moving on.

Phase 0 adds no gameplay. It sets up the monorepo, strict TypeScript, lint (including the determinism lint), tests, the cross-engine determinism harness, coverage and size budgets, CI, the CLAUDE.md files, ADRs 0001–0005, a 270×480 PixiJS canvas, and Capacitor Android and iOS projects. Every later phase relies on these.

Your answers:

- The repo goes in **`/mnt/data/kanche`**. The pack is copied to `docs/prompt-pack/` and the original stays untouched.
- **Private `snjsinghdev/kanche`**, pushed over SSH as with Fuselings, with an open PR titled "Phase 00 — Foundations".
- **Android:** `fuselings_low_api30` (the low-end stand-in) is the gate. The phone `ec0612a3` gets a separate install as a real-device check. App ID: `com.jupiterlabtech.kanche.dev` (a placeholder).

What the probes found on this machine:

- Node 24.21 is installed. The current LTS is 24.22.0.
- pnpm is missing; corepack 0.36 is available.
- Deno 2.9.7 is now installed in `~/.deno/bin`.
- Playwright 1.64.1 browsers launch: Chromium 156, Firefox 157 and WebKit 27.2. WebKit only runs because I put `libavif16`, `libgav1` and `libyuv` from Ubuntu debs into its bundled `sys/lib`; there's no sudo here.
- The Android SDK is at `~/Android/Sdk`, KVM works, and the AVDs are there.
- GitHub is on the Free plan, so branch protection and required checks are refused on private repos (HTTP 403).
- CodeRabbit has never been used on your account.
- The Fuselings repo (`/mnt/data/Bread-Game/fuselings`) is a proven baseline for versions, ESLint config, CI and the Android setup.

## Versions (all pinned exactly, recorded in ADR-0001/0002/0005)

Supply-chain rule: `minimumReleaseAge: 10080` (7 days) in `pnpm-workspace.yaml`. Every pin is the newest release that is at least 7 days old when installed. That rules out yesterday's eslint 10.13.0 and turbo 2.11.9.

| Tool                                     | Pin                                                       | Note                                                                                               |
| ---------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Node                                     | 24.22.0 (`.nvmrc`, `engines`)                             | LTS "Krypton"; installed locally with nvm                                                          |
| pnpm                                     | newest 12.x ≥ 7 days old, via `packageManager` + corepack | I check that Turbo reads the pnpm 12 lockfile. If it can't, I fall back to 11.28.x and record why  |
| TypeScript                               | **6.0.3**                                                 | typescript-eslint 8.71 supports `<6.1.0`, so TS 7.0 (the native port) is out. Recorded in ADR-0001 |
| ESLint / typescript-eslint               | 10.12.x / 8.71.x                                          | flat config                                                                                        |
| Turborepo                                | 2.11.x (≥ 7 days)                                         |                                                                                                    |
| Vite / Vitest / coverage-v8 / fast-check | 8.3.4 / 5.0.x / 5.0.x / 4.10.2                            |                                                                                                    |
| Playwright                               | 1.64.1                                                    | CI uses the `mcr.microsoft.com/playwright:v1.64.1-noble` image                                     |
| PixiJS                                   | 8.22.0 (current major 8)                                  |                                                                                                    |
| Capacitor core/cli/android/ios           | 8.5.3                                                     |                                                                                                    |
| Deno                                     | 2.9.7                                                     | CI uses `denoland/setup-deno`                                                                      |
| esbuild                                  | 0.28.x                                                    | bundles the harness                                                                                |

GitHub Actions are pinned to commit SHAs, with the version in a comment.

## Repo layout

```
/mnt/data/kanche
├─ apps/client/            Vite + PixiJS + Capacitor (android/, ios/), e2e/ (Playwright)
├─ packages/physics/       physicsVersion=1, det/ (seeded PRNG, float64 hash), probe.ts
├─ packages/rules/         rulesVersion=1
├─ packages/ai/  packages/marble-gen/ (src/genome/)  packages/protocol/  packages/content/  packages/testkit/
├─ supabase/               config.toml, migrations/, functions/health (+ Deno test), tests/
├─ tools/eslint-plugin-kanche/   determinism rules + RuleTester tests
├─ tools/determinism/      cross-engine harness (Node, Deno, Chromium, WebKit, Firefox)
├─ tools/budgets/          budgets checker (+ tests)
├─ docs/ ARCHITECTURE.md, qualities.md, setup.md, adr/ (template + 0001–0005),
│        phases/phase-00-plan.md, handoff/phase-00.md, evidence/phase-00/, prompt-pack/
├─ .github/ workflows/ci.yml, workflows/nightly.yml, pull_request_template.md
├─ CLAUDE.md (+ packages/physics, packages/rules, packages/ai, supabase, apps/client)
└─ budgets.json, .coderabbit.yaml, turbo.json, eslint.config.js, tsconfig*.json, .env.example
```

Package dependency direction (enforced by lint): `physics ← rules ← ai`, `physics/rules ← protocol`. `marble-gen` and `content` import no other package, and `testkit` may import any core package. **No core package may import** `pixi.js`, `@capacitor/*`, `@supabase/*`, `apps/*`, or Node built-ins.

## Implementation steps (in dependency order)

1. **Root tooling.**
   - `git init` on branch `main`, then branch `phase-00-foundations`.
   - Root `package.json` with `packageManager`, `engines` and scripts; `pnpm-workspace.yaml`; `turbo.json`; `.nvmrc`; `.editorconfig`; `.gitattributes`; `.gitignore`; Prettier config.
   - Copy the pack into `docs/prompt-pack/` and write the plan to `docs/phases/phase-00-plan.md`.
   - Scripts: `typecheck` = `tsc -b`, `lint` = `eslint . --max-warnings 0 && prettier --check .`, `test` = `turbo run test`, `build` = `turbo run build`, `budgets`, `e2e`, `harness`.
   - **`verify` = typecheck → lint → test → build → budgets.**
2. **TypeScript, strict everywhere.** `tsconfig.base.json` sets strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, verbatimModuleSyntax, erasableSyntaxOnly, allowImportingTsExtensions, composite and emitDeclarationOnly. The root `tsconfig.json` references every project.
   - Core packages split their config into `tsconfig.lib.json` (src, `lib: ["ES2023"]`, `types: []`) and `tsconfig.test.json` (tests, Node and Vitest types). That makes `window`, `document` and `setTimeout` _type errors_ in simulation code. Lint alone would be the weak wall.
   - Packages export `./src/index.ts`, so no build step is needed. Relative imports carry `.ts`, so the same source runs in Node type-stripping, Deno and Vite.
3. **ESLint flat config and the determinism plugin.**
   - `tools/eslint-plugin-kanche` has four rules:
     - `no-banned-math` covers `Math.*` and the `**`/`**=` operators. It works from an allowlist (sqrt, abs, min, max, floor, ceil, trunc, round, sign, imul, fround, clz32, plus the constants) and catches computed access, aliasing, destructuring and `globalThis.Math`.
     - `no-nondeterministic-globals` covers `Math.random`, `Date`, `performance`, the timers (setTimeout and setInterval with their clears, setImmediate, rAF, requestIdleCallback, queueMicrotask), `Intl` and `crypto`. It uses scope analysis, so a local variable named `Date` is not flagged.
     - `no-locale-methods` covers `toLocale*` and `localeCompare`.
     - `require-sort-comparator` covers `sort()` and `toSorted()` called without a comparator.
   - The plugin is applied to `packages/{physics,rules,ai}/src/**` and `packages/marble-gen/src/genome/**`.
   - RuleTester tests check both directions: every allowed function passes and every banned form fails.
   - The fixture `packages/physics/test/determinism-fixtures/calls-math-sin.ts` calls `Math.sin`. The normal lint run ignores it. A test lints it through the **real repo config** (`ignore: false`) and asserts the error.
   - Import boundaries use `no-restricted-imports` patterns per package, plus DOM globals through `no-restricted-globals`.
   - `typescript-eslint` strictTypeChecked, `no-explicit-any: error`, eslint-config-prettier.
4. **Core packages.**
   - `physics` gets a seeded PRNG built on `Math.imul`, `hashFloat64s` (a 64-bit FNV-1a over little-endian float64 bits through DataView, which throws on non-finite values), and `determinismProbe(seed, steps)`. The probe is a seeded damped-spring integration that only uses + − × ÷ and sqrt, then returns the hash.
   - `rules` exports `rulesVersion = 1`. The other packages get index stubs with a version or placeholder and a test each.
5. **Vitest and the coverage gate.** Each package has a `vitest.config.ts` built from a shared factory. Physics, rules and ai enforce **lines, branches, functions and statements ≥ 90%**. fast-check property tests cover the hash (same input gives the same hash, a changed bit changes it, non-finite input is rejected) and the PRNG (range and seed independence).
6. **Determinism harness** (`tools/determinism`).
   - esbuild bundles an entry that calls `determinismProbe` over N seeds into **one ESM file**, so the same bytes run in every engine.
   - The Node runner imports it, the Deno runner runs it through `deno run`, and Playwright `addScriptTag` runs it in Chromium, WebKit and Firefox.
   - It prints a table and writes `report.json`. Any mismatch exits 1.
   - PRs run 1,000 seeds; nightly runs 10,000.
7. **Client skeleton** (`apps/client`).
   - The PixiJS canvas is a **270×480 portrait base**. `nearest` scaling and `roundPixels` keep pixels crisp.
   - It draws a wordless test scene (dirt ground, chalk ring, a few marbles and one glowing shooter) with no text.
   - **Viewport policy:** the pure function `computeViewport()` is unit- and property-tested.
     - The usable area is the window minus the safe-area insets (`env(safe-area-inset-*)` with Capacitor's CSS-variable fallback).
     - Integer scale k = ⌊fit⌋ applies when k ≥ 1 and k/fit ≥ 0.9.
     - Otherwise the scene is drawn at ⌈fit⌉ and the browser scales it down smoothly. This "sharp-bilinear" fallback avoids 75% letterboxes on 720×1600 phones.
     - It re-runs on resize and orientation change.
   - A test hook (`window.__kanche`, dev and test builds only) exposes the viewport, the versions and a pixel sample for e2e tests.
   - Playwright e2e runs in all three engines: the canvas renders, the sampled pixel isn't blank, and the scale is right for set viewports.
8. **Capacitor.**
   - `cap add android` and `cap add ios`, with appId `com.jupiterlabtech.kanche.dev` and appName Kanche. The Vite build target is pinned (`chrome111`/`safari16.4`), following the Fuselings WebView finding.
   - Build the debug APK with `gradlew assembleDebug`.
   - Install it on the emulator and the phone with the method that works here (`adb -s … install -r`, `monkey` launch, `screencap`), and save the screenshots to `docs/evidence/phase-00/`.
   - iOS can't be built on Linux. The project is generated here, and a **nightly macOS CI job** builds it for the simulator with signing off (`CODE_SIGNING_ALLOWED=NO`). I'll trigger that job once by hand to prove it works.
9. **Budgets as code.**
   - `budgets.json` sets: initial web JS gzip (measured, then set with about 25% headroom), total art 6 MB, total audio 8 MB, and an **Android download of 30 MB or less**.
   - `tools/budgets` gzips the entry chunks and modulepreloads listed in `dist/index.html` and adds up assets by extension.
   - In CI, the debug APK size stands in as an upper bound for the download size. A bundletool-based measurement is noted for Phase 11.
   - The checker has tests, and any budget over its limit exits 1.
10. **CI.**
    - `ci.yml` runs on pull requests and on pushes to main, with the pnpm store cached. It has four named jobs:
      - **verify**: typecheck, lint, unit and Deno tests with coverage, build, budgets.
      - **e2e**: a matrix of Chromium, WebKit and Firefox in the Playwright container.
      - **determinism**: the harness in all five engines, with the report uploaded.
      - **android-debug**: the APK, its size budget, and the APK as an artifact.
    - `nightly.yml` (cron plus manual dispatch) runs everything, the harness at 10,000 seeds, the iOS simulator build and `pnpm audit`.
    - **Required checks:** GitHub refuses them on a private repo on the Free plan. I'll add `tools/scripts/require-checks.sh`, which applies them with one `gh api` call once the repo is public or on Pro. ADR-0001 and the handoff note record that this item is deferred.
11. **CodeRabbit.** I'll check the current `.coderabbit.yaml` schema first. `path_instructions` cover:
    - physics, rules, ai: determinism and SI units
    - supabase: RLS and ledger invariants
    - client: performance budgets and accessibility

    The language is set to `en-GB`.

12. **Supabase skeleton.**
    - Generate `config.toml` once with the pinned `supabase` CLI. It isn't a dependency yet; Phase 6 adds it.
    - `functions/health` returns `physicsVersion` and `rulesVersion`, importing `@kanche/physics` through `functions/deno.json`. That proves the shared core runs under Deno.
    - `deno test`, `deno check` and `deno lint` run in `pnpm test`.
    - There's no Docker, so the local stack doesn't run. That's noted for Phase 6.
13. **Docs and instruction files.**
    - Root `CLAUDE.md` covers the summary, the non-negotiables word for word, commands, the workflow (plan mode, phase prompts, ADRs, handoff, PR) and the definition of done.
    - The five directory `CLAUDE.md` files carry their local rules.
    - `docs/ARCHITECTURE.md` covers context, containers and components.
    - `docs/qualities.md` is copied from the prompt.
    - The MADR template and ADRs 0001–0005 each cover context, decision, alternatives and consequences.
    - `docs/setup.md` covers prerequisites, the no-sudo WebKit library fix, Android steps and env handling.
    - `.env.example` holds public `VITE_*` keys only, blank, and `supabase/functions/.env.example` holds function secrets. All `.env*` files except the examples are git-ignored.
    - The PR template carries the 12-quality checklist.
14. **Gate run and delivery.**
    - Clone into the scratchpad and run `pnpm install && pnpm verify` there. A fresh clone is a different test from the working tree.
    - Run the harness and e2e in all engines.
    - Install on both Android devices and take screenshots.
    - Write `docs/handoff/phase-00.md`: what was built, pinned versions, open issues, notes for Phase 1.
    - Commit with the Co-Authored-By line.
    - `gh repo create snjsinghdev/kanche --private`, push with `git -c url."git@github.com:".insteadOf=… push`, then `gh pr create` titled "Phase 00 — Foundations".
    - Watch CI until it's green.
    - Save a kanche memory that points to the Android and GitHub machine notes.

## Things that stay open (stated honestly, not claimed)

- **CodeRabbit feedback resolved:** you need to add `snjsinghdev/kanche` to the CodeRabbit GitHub app. Once it reviews, I can resolve its comments.
- **Required checks:** can't be enforced on a private repo on the Free plan (see step 10).
- **iOS device run:** needs a Mac and signing. The simulator build is proven in CI only.
- **Low-end phone:** the emulator stands in. Your OnePlus is a mid-range phone.

## Verification

- `pnpm install && pnpm verify` passes in a **fresh clone** in the scratchpad.
- The lint test shows `calls-math-sin.ts` failing with `kanche/no-banned-math`. Running `pnpm exec eslint --no-ignore packages/physics/test/determinism-fixtures` by hand exits 1.
- `pnpm harness` prints identical hashes for Node, Deno, Chromium, WebKit and Firefox.
- `pnpm e2e` passes on all three browser engines.
- The coverage report shows physics, rules and ai at 90% or more. Deliberately dropping one test makes the gate fail, and that is checked once.
- Raising a budget's limit below the measured size makes `pnpm budgets` fail, checked once.
- The debug APK runs on `fuselings_low_api30` and on `ec0612a3`, with screenshots in `docs/evidence/phase-00/`.
- CI on the PR is green on all four jobs. The nightly is dispatched once and the iOS job passes.
