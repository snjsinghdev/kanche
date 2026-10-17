---
status: accepted
date: 2026-10-17
decision-makers: owner (prompt pack), agent
consulted: docs/prompt-pack/MECHANICS-REVIEW.md; Mathavan, Jackson and Parkin (2014); pooltool's frictional_mathavan model; Hogan and Antali (2025)
informed: Phase 1 (physics core), Phase 2 (rules), Phase 5 (AI), Phase 6 (server)
---

# A custom sphere-on-ground physics engine

## Context and problem statement

Kanche's feel comes from real marble behaviour:

- A hard flick skids, then grips and rolls on. Slip shrinks at (7/2)·μₛ·g, and rolling starts at (5v₀ + 2Rω₀)/7.
- Backspin makes the shooter stick, and topspin follows through.
- An 11 mm shooter meets an 8 mm marble 9.1° below horizontal.
- Lip-outs at the hole.

The same shot must give the same result on every phone, in every browser and on the server, because marbles change hands on the outcome.

## Decision drivers

- Physical fidelity: sliding and rolling with spin, ground-in-the-loop impacts, unequal sizes, slopes, and a three-region hole
- Bit-identical results across V8, JavaScriptCore and SpiderMonkey (ADR-0004)
- The server can re-run any shot in a Deno Edge Function
- Verifiable against textbook results, filmed reality and a reference simulator (KPB v1)

## Considered options

- **Custom deterministic sphere-on-ground simulation in TypeScript**
- A generic 2D engine (Matter.js, Planck.js) with damping tuned to look right
- Rapier (WASM) with its cross-platform determinism build
- Box2D v3 compiled to WASM

## Decision outcome

Chosen option: **a custom simulation in `packages/physics`**. Generic 2D engines model friction as damping on a disc. They can't produce slide-then-roll, spin transfer, stun, draw and follow shots, the 33.7° rolling half-ball deflection, or contact tilt between unequal spheres, so the feel would be tuned tricks, not laws. Generic 3D engines carry far more than one ball on one ground needs, and their determinism depends on a WASM build we don't control.

Phase 1 builds it to the rewritten spec in MECHANICS-REVIEW:

- one fixed-step RK4 integrator at 1/240 s
- events located exactly inside each step, with the step split there
- quadratic air drag
- a multi-contact impact solve with Stronge's energetic restitution
- a true 3D contact normal, plus a flight state
- the ground / rim / pit hole
- the finger-impact flick
- an energy ledger

It's held to KPB v1: analytic, reality, reference, integrity, determinism and performance suites.

Phase 0 sets up only the foundation: `physicsVersion = 1`, the seeded RNG, the state hash, and a probe that proves the arithmetic agrees across five engines.

### Consequences

- Good, because the feel comes from the laws, and every claim is testable against KPB v1.
- Good, because the server imports the identical source (`supabase/functions/deno.json`).
- Bad, because it's more code to write and maintain than a library. The mitigation is the benchmark, the 90% coverage gate, property tests, and golden values cross-checked against independent implementations.
- Bad, because no `sin`, `cos` or `exp` at runtime (ADR-0004) means lookup tables and series written with basic arithmetic.

### Confirmation

KPB v1 scores are recorded per physics version, and any regression blocks release (Phase 11). Phase 0 confirms the base: `pnpm harness` gives identical hashes in Node, Deno, Chromium, WebKit and Firefox.

## Pros and cons of the options

### Matter.js / Planck.js

- Good, because they're mature, small and familiar.
- Bad, because a disc with damping can't slide then roll or carry spin, and cross-engine determinism isn't guaranteed (they use `Math.sin` and `Math.cos`).

### Rapier (enhanced determinism)

- Good, because it's fast and has a documented cross-platform determinism mode.
- Bad, because its rolling-friction model is generic, it's a WASM dependency on the hot path of every platform including the server, and calibration to filmed marbles fights its internals.

### Box2D v3 (WASM)

- Bad, because it's 2D with the same disc limitations, plus a C toolchain in the build.

## More information

See `docs/prompt-pack/MECHANICS-REVIEW.md` (findings 1–11 and KPB v1) and `docs/prompt-pack/prompts/phase-01-physics-core.md`.
