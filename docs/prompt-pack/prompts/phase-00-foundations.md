# Kanche — Phase 0: Foundations

You are the lead engineer for Kanche, a mobile-first, pixel-art street-marbles game played "for keeps". One TypeScript codebase ships to Android and iOS through Capacitor and to the web. A deterministic physics core is shared by the app, the AI and the server. This phase builds the foundation every later phase relies on; no gameplay yet.

## Before you start
- Work in plan mode. Write your plan to docs/phases/phase-00-plan.md, then implement.
- For every tool you add, check its current official docs, pin exact versions and record them in the ADRs.

## Build
1. Monorepo with pnpm workspaces and Turborepo:
   - apps/client: Vite + TypeScript + PixiJS (current major) + Capacitor (android, ios)
   - packages/physics, packages/rules, packages/ai, packages/marble-gen, packages/protocol, packages/content, packages/testkit
   - supabase/ (migrations, functions, tests), tools/ (CLIs), docs/
2. TypeScript strict everywhere (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes), ESM, project references. `any` is a lint error. Pin Node LTS and the pnpm version.
3. ESLint flat config + Prettier. Enforce import boundaries: physics, rules, ai, marble-gen genome code and protocol must not import DOM, PixiJS, Capacitor, Supabase or app code.
4. Determinism lint, as a local plugin in tools/eslint-plugin-kanche, applied to physics, rules, ai and marble-gen genome code:
   - Ban Math.random, Date, performance.now, timers, Intl and toLocale* methods, the ** operator, Math.pow/exp/expm1/log/log2/log10/log1p/sin/cos/tan/asin/acos/atan/atan2/sinh/cosh/tanh/cbrt/hypot, and sort() without a comparator.
   - Allow + - * /, Math.sqrt/abs/min/max/floor/ceil/trunc/round/sign/imul/fround/clz32.
   - Test the rule itself.
5. Testing: Vitest with fast-check for property tests, Playwright, and Deno tests for supabase/functions.
6. Cross-engine determinism harness: run a function from packages/physics in Chromium, WebKit and Firefox (via Playwright) and in Node and Deno, and assert every hash matches. Prove it now with a trivial function.
7. Coverage gate: at least 90% lines and branches for physics, rules and ai.
8. CI (GitHub Actions) on every PR: cached install, typecheck, lint, unit tests, web build, Playwright on three engines, the determinism harness and size budgets. Nightly: the full suite. Make PR checks required.
9. Budgets as code: budgets.json covering initial web JS (gzip), total art and audio, and an Android download target of 30 MB or less. CI fails when a budget is exceeded.
10. CodeRabbit: .coderabbit.yaml with path instructions (physics, rules, ai: determinism and SI units; supabase: RLS and ledger invariants; client: performance budgets and accessibility).
11. Claude Code instruction files: a root CLAUDE.md (project summary, the non-negotiables below, commands, workflow, definition of done) and directory CLAUDE.md files in packages/physics, packages/rules, packages/ai, supabase and apps/client with their local rules.
12. Docs: docs/ARCHITECTURE.md (context, containers, components), docs/qualities.md (below), an ADR template (MADR), and ADRs 0001–0005: monorepo and tooling; client stack (PixiJS + Vite + Capacitor); custom deterministic physics; determinism contract; backend (Supabase). Each covers context, decision, alternatives and consequences.
13. Client skeleton: a Vite app rendering a PixiJS canvas at a fixed portrait base resolution of 270×480, with integer-first scaling and safe-area handling. Generate the Capacitor android and ios projects, build debug versions, and document local setup and env handling (.env.example; no secrets in git).
14. Export physicsVersion = 1 and rulesVersion = 1. Add a PR template carrying the 12-quality checklist.

## The 12 qualities and their gates (copy into docs/qualities.md)
1. Readable in five seconds: 4 of 5 strangers explain a silent 10-second clip.
2. Familiar shape, one twist: the first session ends with a marble won from a kid.
3. Nothing in the way of play: first shot within 30 s of first launch; Android download ≤ 30 MB; offline practice.
4. Cheap, fair failure: hashes match across engines; rematch in ≤ 3 s.
5. Unpredictable rewards: rarity set on the server, rates within targets; nothing purchasable.
6. End high, leave a thread: win-it-back offered after every loss.
7. A sound you recognise: clack ≤ 50 ms after impact on reference devices.
8. It's mine: no two genomes alike; full history on every marble.
9. Stories worth telling: share in ≤ 2 taps.
10. Secrets that need others: no recipe data in the client bundle.
11. Depth, many kinds of fun: difficulty rises steadily across the kid ladder.
12. Generosity: a new marble series ships without an app update.

## Non-negotiables (copy into the root CLAUDE.md)
- Simulation code is deterministic (the lint rules above).
- The server owns marbles: clients never write ownership, and every change is an append-only ledger event.
- Marbles, glass rods and furnace fuel are never sold, traded for money or won through paid randomness.
- The core game reads without words; chat is preset emotes only.
- Budgets are tests.
- Child mode limits data, stakes and notifications.
- Every decision gets an ADR; every phase ends with a handoff note and a CodeRabbit-reviewed PR.

## Done when
- A fresh clone passes pnpm install && pnpm verify (typecheck, lint, test, build).
- The determinism lint fails on a fixture that calls Math.sin inside packages/physics.
- The harness reports identical hashes in Chromium, WebKit, Firefox, Node and Deno.
- The Android debug build installs on a low-end phone and shows the canvas.
- docs/handoff/phase-00.md lists what was built, pinned versions, open issues and notes for Phase 1.
- A PR titled "Phase 00 — Foundations" is open with CodeRabbit feedback resolved.
