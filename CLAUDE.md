# Kanche

Kanche is a mobile-first, pixel-art street-marbles game played "for keeps". Its marbles are unique, carry their history, and change hands only through play. One TypeScript codebase ships to Android and iOS through Capacitor and to the web, so a WhatsApp link can play in the browser. A deterministic physics core is shared by the app, the AI kids and the Supabase server, so a shot resolves the same way everywhere.

The game is built in 12 phases. Each phase's prompt is in `docs/prompt-pack/prompts/`, and the physics benchmark it must pass is in `docs/prompt-pack/MECHANICS-REVIEW.md`. Phase 0 (foundations) is done. Read the latest `docs/handoff/phase-NN.md` before starting a phase.

## Non-negotiables

- Simulation code is deterministic (the lint rules below).
- The server owns marbles: clients never write ownership, and every change is an append-only ledger event.
- Marbles, glass rods and furnace fuel are never sold, traded for money or won through paid randomness.
- The core game reads without words; chat is preset emotes only.
- Budgets are tests.
- Child mode limits data, stakes and notifications.
- Every decision gets an ADR; every phase ends with a handoff note and a CodeRabbit-reviewed PR.

**The determinism lint** (`tools/eslint-plugin-kanche`, ADR-0004) covers `packages/{physics,rules,ai}/src` and `packages/marble-gen/src/genome`.

- **Banned:** `Math.random`, `Date`, `performance`, timers, `Intl`, `toLocale*`, `localeCompare`, `crypto`, `**`, `Math.pow`, `exp`, `log`, `sin`, `cos`, `tan`, `atan2`, `hypot`, `cbrt` and every other `Math` function off the list below, and `sort()`/`toSorted()` without a comparator.
- **Allowed:** `+ - * /` and `Math.sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `trunc`, `round`, `sign`, `imul`, `fround`, `clz32`, plus the `Math` constants.
- Simulation inputs are integers. Randomness comes only from the seeded `createRng` in `@kanche/physics`.
- Any change that can alter an outcome bumps `physicsVersion`, `rulesVersion`, `aiVersion` or `genomeVersion`.

## Repository map

| Path                         | What                                                                                      | Rules                              |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/physics`           | Deterministic simulation core, seeded RNG, state hash                                     | `packages/physics/CLAUDE.md`       |
| `packages/rules`             | Ring, Hit and Hole; turns, the lag, stakes                                                | `packages/rules/CLAUDE.md`         |
| `packages/ai`                | The neighbourhood kids (physics-search AI)                                                | `packages/ai/CLAUDE.md`            |
| `packages/marble-gen`        | Marble genomes (`src/genome` is simulation code)                                          | determinism lint on `src/genome`   |
| `packages/protocol`          | Wire formats: shot inputs, challenges, claims                                             | platform-free                      |
| `packages/content`           | Courts, marble series and events as data                                                  | platform-free                      |
| `packages/testkit`           | Vitest preset and test helpers                                                            | imports no other `@kanche` package |
| `apps/client`                | Vite + PixiJS app, Capacitor `android/` and `ios/`                                        | `apps/client/CLAUDE.md`            |
| `supabase`                   | Migrations, Edge Functions (Deno), DB tests                                               | `supabase/CLAUDE.md`               |
| `tools/eslint-plugin-kanche` | The determinism lint and its tests                                                        |                                    |
| `tools/determinism`          | Cross-engine harness (Node, Deno, Chromium, WebKit, Firefox)                              |                                    |
| `tools/budgets`              | Budget checker for `budgets.json`                                                         |                                    |
| `docs`                       | `ARCHITECTURE.md`, `qualities.md`, `setup.md`, `adr/`, `phases/`, `handoff/`, `evidence/` |                                    |

The package dependency direction is `physics ← rules ← ai`, with `protocol` allowed to import `physics` and `rules`. No core package imports DOM, Node built-ins, PixiJS, Capacitor, Supabase or app code. Each core package's `tsconfig.lib.json` has no DOM or Node types, so a violation is a type error as well as a lint error.

## Commands

Set up the machine with `docs/setup.md` first (Node 24.22.0, pnpm via corepack, Deno 2.9.7, the Playwright browsers, JDK 21 and the Android SDK).

| Command                          | Does                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm install`                   | Install (exact pins; no version younger than 7 days)                                                        |
| `pnpm verify`                    | typecheck → lint → test → build → budgets. **Must pass before every commit.**                               |
| `pnpm typecheck`                 | `tsc -b` over every project                                                                                 |
| `pnpm lint`                      | ESLint (typed, plus the determinism and boundary rules) and Prettier check                                  |
| `pnpm test`                      | Vitest in every package (coverage gate 90% on physics, rules, ai) and Deno tests for `supabase/functions`   |
| `pnpm build`                     | Web build (`apps/client/dist`) and the harness bundle                                                       |
| `pnpm budgets [--android <apk>]` | Checks the build against `budgets.json`                                                                     |
| `pnpm e2e`                       | Playwright on Chromium, WebKit and Firefox                                                                  |
| `pnpm harness`                   | Cross-engine determinism: identical hashes in 5 engines (`KANCHE_HARNESS_SEEDS=10000` for the nightly size) |
| `pnpm dev`                       | Vite dev server                                                                                             |
| `pnpm android:debug`             | Debug APK at `apps/client/android/app/build/outputs/apk/debug/app-debug.apk`                                |
| `pnpm format`                    | Prettier write                                                                                              |

## Workflow

1. **Start in plan mode.** Read this file, the relevant directory CLAUDE.md files, `docs/ARCHITECTURE.md`, the ADRs and the last handoff note. Write the plan to `docs/phases/phase-NN-plan.md`, then implement.
2. **Check current docs and pin exact versions** for every tool you add, and record them in an ADR. Use the newest release that is at least 7 days old (`minimumReleaseAge` in `pnpm-workspace.yaml`).
3. **Work on a branch** named `phase-NN-<slug>`. Commit in small steps; each commit passes `pnpm verify`.
4. **Write an ADR for every decision.** Use the MADR template in `docs/adr/template.md` and number ADRs in sequence.
5. **End the phase with a handoff note**, `docs/handoff/phase-NN.md`: what was built, pinned versions, open issues, notes for the next phase.
6. **Open a PR titled "Phase NN — Title"**, using the PR template's 12-quality checklist. CI must be green, and CodeRabbit feedback must be resolved before merge.

`origin` is the SSH URL (`git@github.com:snjsinghdev/kanche.git`), so a plain `git push` works. Never push over HTTPS with the `gh` token: it has no `workflow` scope, and GitHub rejects pushes that touch `.github/workflows/`.

## Definition of done

- `pnpm verify` passes in a fresh clone, and `pnpm e2e` and `pnpm harness` pass.
- New behaviour has tests that fail without it. Simulation code has property tests and golden values.
- Budgets hold. Raising a budget needs an ADR.
- The core action reads without words, and no new text appears in the game UI.
- ADRs, the handoff note and any affected CLAUDE.md are updated.
- The phase gate in its prompt is met and the evidence is recorded in `docs/evidence/phase-NN/`. A gate that can't be met is recorded as open, never claimed.

## Conventions

- TypeScript is strict everywhere: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `erasableSyntaxOnly`. `any`, `@ts-ignore` and non-null assertions are lint errors.
- Relative imports carry the `.ts` extension, so the same source runs in Vite, Vitest, Node and Deno without a build.
- Physical quantities are in SI units (m, s, kg, rad), and every constant states its unit in a comment.
- British English in docs and comments. The game itself has no words.
- Tool docs move faster than training data. Turborepo ships docs matching the installed version in `node_modules/turbo/docs/`, so read them before changing `turbo.json`. `agentGuidance: false` stops turbo from writing its own `AGENTS.md`; this file is the instruction file.
