# packages/physics

The deterministic simulation core. The phone, the browser, the AI worker and the Supabase Edge Functions all import it, and a shot must resolve **bit-for-bit identically** in V8, JavaScriptCore and SpiderMonkey (ADR-0003, ADR-0004). How it integrates is in ADR-0006, what it models in ADR-0007, and the laws and sign conventions in `docs/physics.md`.

## Local rules

- **Determinism lint applies to `src/`.**
  - Only `+ - * /`, the allowlisted `Math` functions (`sqrt abs min max floor ceil trunc round sign imul fround clz32`) and the constants may be used. Never `**`, `Math.pow`, `exp`, `log`, `sin`, `cos`, `atan2` or `hypot`.
  - Where a curve is needed, use a committed lookup table (MECHANICS-REVIEW finding 9).
  - Generators that need transcendental functions live in `scripts/`, outside the lint, and a test regenerates their output and compares.
- **No platform.** `tsconfig.lib.json` has `lib: ["ES2023"]` and `types: []`, so `window`, `document`, `setTimeout` and `process` are type errors. Import no other `@kanche` package.
- **Integer inputs, seeded randomness.** Shot inputs are integers. Randomness comes only from `createRng(seed)` (xoshiro128** seeded by splitmix32), which is frozen by golden tests and cross-checked against a BigInt reference.
- **Fail fast on non-finite values.** `Fnv64.addFloat64` throws on NaN and ±Infinity, simulation state must never hold them, and bad inputs throw a typed `PhysicsError` rather than being clamped.
- **Orientation is not authoritative state.** The renderer integrates it (MECHANICS-REVIEW finding 5), so the state hash covers position, velocity, spin and motion only.
- **SI units** (m, s, kg, rad, N), with the unit in a comment on every constant. The fixed step is 1/240 s.
- **Version discipline.**
  - `physicsVersion` 1 is frozen at the merge of Phase 1. After that, any change that can alter an outcome bumps `physicsVersion` in `src/version.ts`, v1's code and `PARAMS_V1` stay runnable, and the golden replays are regenerated in the same commit (`pnpm --filter @kanche/physics goldens`).
  - Variants from `deriveParams` are for tests, the Physics Lab and the KPB fitters. A variant never reaches a live match.
- **Locality.** Only the marbles an event involves are committed and re-integrated (ADR-0006). Code that reads another marble's state during an event must read it at the event's time (see `touchingNormals` in `src/sim/world.ts`).

## Tests

- Coverage gate: 90% lines, branches, functions and statements (`vitest.config.ts`). It is now at 97 / 92 / 99 / 96.
- **The KPB v1 suites** are in `test/kpb/`: analytic 1–8, integrity 9–12, determinism 13, reference 14 and performance 16. `docs/kpb.md` has the pass marks and scores.
  - `KANCHE_KPB_SHOTS=10000` runs integrity and determinism at the nightly size.
  - Heavy tests carry their own timeouts.
- **Golden values must be justified** (a textbook result or an independent implementation), never just pasted from the code under test.
  - The two exceptions say so: the golden replays in `@kanche/testkit/golden/physics-v1.json` are determinism witnesses (ADR-0006), and the pooltool values in `pooltool-mathavan.json` come from an independent implementation (ADR-0007).
- Property tests use fast-check (`test/fuzz.test.ts`).
- `test/determinism-fixtures/` holds deliberate violations for the lint's own test. It's ignored by `pnpm lint`; don't add real code there.
- Cross-engine: `pnpm harness` runs the probe, the 200 golden replays and the seeded random shots in Node, Deno, Chromium, WebKit and Firefox.
- Performance: `pnpm --filter @kanche/physics bench` times the KPB 16 break without coverage instrumentation. CI fails at a 60 ms median as a regression ceiling, which is not the 5 ms pass mark.

## What's here (Phase 1)

- `simulateShot(setup, options)` returns the final states, events, energy ledger, timeline, metrics and state hash.
- `buildCourt`, `flickLaunch`, `unitVector`, and `PARAMS_V1` with `deriveParams`.
- The Phase 0 primitives: `createRng`, `Fnv64` and `determinismProbe`.
- `@kanche/physics/testing` exports `randomShot` and `breakShot` for the suites, the harness, the Physics Lab and the bench. It is not for game code.
- `src/sim/` holds the integrator and its parts: `advance.ts`, `world.ts`, `contacts.ts`, `impact.ts`, `holds.ts`, `lcp.ts`, `derivative.ts` and `features.ts`.
- `scripts/` holds the table generator, the golden-replay writer and the bench.
