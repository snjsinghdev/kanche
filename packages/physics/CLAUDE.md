# packages/physics

The deterministic simulation core. The phone, the browser, the AI worker and the Supabase Edge Functions all import it, and a shot must resolve **bit-for-bit identically** in V8, JavaScriptCore and SpiderMonkey (ADR-0003, ADR-0004).

## Local rules

- **Determinism lint applies to `src/`.** Only `+ - * /` and the allowlisted `Math` functions (`sqrt abs min max floor ceil trunc round sign imul fround clz32`) and constants may be used. Never `**`, `Math.pow`, `exp`, `log`, `sin`, `cos`, `atan2` or `hypot`. Where a curve is needed, use a committed lookup table (MECHANICS-REVIEW finding 9).
- **No platform.** `tsconfig.lib.json` has `lib: ["ES2023"]` and `types: []`, so `window`, `document`, `setTimeout` and `process` are type errors. Import no other `@kanche` package.
- **Integer inputs, seeded randomness.** Shot inputs are integers. Randomness comes only from `createRng(seed)` (xoshiro128** seeded by splitmix32), which is frozen by golden tests and cross-checked against a BigInt reference.
- **Fail fast on non-finite values.** `Fnv64.addFloat64` throws on NaN and ±Infinity, and simulation state must never hold them.
- **Orientation is not authoritative state.** The renderer integrates it (MECHANICS-REVIEW finding 5), so the state hash covers position, velocity and spin only.
- **SI units** (m, s, kg, rad, N), with the unit in a comment on every constant. The fixed step is 1/240 s.
- **Version discipline.** Any change that can alter an outcome bumps `physicsVersion` in `src/version.ts`, and the golden values change in the same commit.

## Tests

- Coverage gate: 90% lines, branches, functions and statements (`vitest.config.ts`).
- Property tests use fast-check. Golden values must be justified (a textbook result or an independent implementation), never just pasted from the code under test.
- `test/determinism-fixtures/` holds deliberate violations for the lint's own test. It's ignored by `pnpm lint`; don't add real code there.
- Cross-engine: `pnpm harness` runs `determinismProbe` in Node, Deno, Chromium, WebKit and Firefox. Phase 1 adds real shots and the KPB v1 suites (`docs/prompt-pack/MECHANICS-REVIEW.md`).

## What's here (Phase 0)

`physicsVersion = 1`, `createRng`, `Fnv64`, `hashFloat64s` and `determinismProbe` (the harness's arithmetic canary). Phase 1 builds the real simulation.
