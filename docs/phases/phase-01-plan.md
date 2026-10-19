# Kanche — Phase 1 plan: Physics core (KPB v1)

> Approved by the owner on 2026-10-17, in plan mode, before implementation. Kept as approved; deviations made during the build are listed in `docs/handoff/phase-01.md`.

## Context

You asked for Phase 2, but Phase 2 (rules) runs every shot through the Phase 1 simulator, and Phase 1 hadn't started: `packages/physics/src` holds only the Phase 0 RNG, hash and probe. You chose to build Phase 1 first. This session covers **Phase 1 only**, up to its PR. Phase 2 starts from the merged physics.

Phase 1 builds `packages/physics`: a deterministic simulation of glass marbles on real ground. It's held to the Kanche Physics Benchmark (KPB v1, `docs/prompt-pack/MECHANICS-REVIEW.md`), and the same code runs in the app, the AI worker and Deno on the server.

Your answers:

- **The client debug route** is built now, minimal, in dev and debug builds only. It never enters the production bundle or its budget.
- **No footage this phase.** The reality suite's tooling is built and proven on a dataset labelled synthetic. The reality gate and the KPB reality scores stay **open**, and every fitted parameter stays PLACEHOLDER.

What the probes found:

- Deno 2.9.7 is in `~/.deno/bin` but not on this shell's PATH. Every `pnpm verify` and `pnpm harness` runs with `PATH="$HOME/.deno/bin:$PATH"`.
- pooltool 0.6.0 (Apache-2.0, released 2026-03-16) downloads from PyPI. Its `frictional_mathavan._collide_balls` is pure numpy.

## Decisions to lock first (ADR-0006 and ADR-0007)

- **Data idiom.** Each marble is a mutable object with numeric fields, iterated with `for…of`, as the probe does, with scratch objects reused in hot loops. That avoids `noUncheckedIndexedAccess` branches and non-null assertions. I switch to typed arrays, with a scoped lint exception, only if the 5 ms performance test fails.
- **No `enum`** (`erasableSyntaxOnly`). Motion states are an `as const` union with an integer code table for the hash.
- **Parameters are injectable per shot.** `PhysicsParams` has `v1` defaults, and `dt`, drag, coefficient tables and iteration caps are all parameters, so tests can switch drag off or halve `dt`. Production always uses the frozen `v1`. When `physicsVersion` 2 arrives, the v1 code and params are frozen in place and stay runnable for live matches.
- **Two kinds of golden.**
  - Analytic goldens are textbook closed forms.
  - Golden replay hashes are self-generated determinism witnesses, like Phase 0's probe hash.

  ADR-0006 and the golden files say which is which, because `physics/CLAUDE.md` forbids goldens pasted from the code under test.

- **Generated tables live outside `src/`.** The generator scripts use `Math.cos` and `exp`, so they live in `packages/physics/scripts/`, where the determinism lint doesn't apply. `src/params/v1/*.generated.ts` holds the committed literals, and a test regenerates them and compares.
  - The unit-vector table is generated with BigInt fixed-point series, so regeneration doesn't depend on any engine's `Math.cos`.
  - Only the first octant is stored, and symmetry gives the rest exactly, keeping the bundle small.

## Package layout (`packages/physics/src`)

| Module                      | Contents                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors.ts`                 | `PhysicsError` with codes (`invalid-input`, `non-finite`, …). Bad inputs throw; nothing is clamped silently.                                                                                                                                                                                                                                                   |
| `params/v1/`                | Every constant, with its unit, a source note and a PLACEHOLDER mark: ρ, R classes, g, ρAir, Cd, per-surface μS, μR, μSp and eGround (cement, dirt, tile, sand, wet cement), μBB, e, eW, μW, mF, eF, vF range, miscue limit, dt = 1/240, vRest, caps. Piecewise-linear tables for e(v), μR(v) and the impact frictions.                                         |
| `court.ts`                  | The court type (physics owns the type; `content` supplies data from Phase 2 on): bounds, surface, a heightfield (bilinear, slope < 3%), walls (vertical segments), blocks (convex polygons of signed height, \|h\| < R, for steps, curbs and cracks) and the hole (Rh, D, rF; flat surround). Validated with typed errors.                                     |
| `state.ts`, `hash-state.ts` | Marble state (id, position, velocity, ω, motion state, wear). The hash is FNV-1a over Float64 position, velocity and ω in id order, plus the motion codes and the event count. Orientation is not in it.                                                                                                                                                       |
| `dynamics/`                 | Derivatives with ledger powers. Ground uses the spec's small-slope equations (sliding, rolling, ωz spin friction, drag, aSlope = −g·∇h). Curved supports (rim torus, edge lines, corner points) use the general constrained model, with N from the constraint, Coulomb sliding or rolling friction, and take-off when N reaches 0. Airborne: gravity and drag. |
| `integrate.ts`              | One fixed-step RK4 at dt, with the ledger terms carried as extra RK4 states.                                                                                                                                                                                                                                                                                   |
| `events/`                   | Cubic Hermite interpolants, conservative advancement (gap ÷ a Bernstein bound on closing speed), then bisection and Newton, with versioned iteration caps. Sort-and-sweep broadphase with id tie-breaks. Ordering by (time, kind, lower id, higher id).                                                                                                        |
| `impact.ts`                 | The multi-contact impulse solve.                                                                                                                                                                                                                                                                                                                               |
| `flick.ts`                  | The finger-impact model, int16 direction, the start-point unit-vector table, the miscue limit, and a lofted shot behind `allowLoft` (off).                                                                                                                                                                                                                     |
| `hole.ts`                   | The three regions and the pocketed test.                                                                                                                                                                                                                                                                                                                       |
| `simulate.ts`, `ledger.ts`  | `simulateShot(setup, options) → ShotResult`: final state, events (impacts with impulse, position and normal; transitions; pockets; outs), the energy ledger, per-marble timeline keyframes (optional, so the AI can switch them off), metrics and the hash.                                                                                                    |

### Numerical decisions worth your attention

1. **Events split steps.** The steps stay on the dt grid; an event splits a step, and the step then continues to the grid line.
   - Events are found on Hermite interpolants and the state is re-integrated from the step start, so every event state is an RK4 state.
   - The event kinds are the spec's list, plus coefficient-table breakpoints, support changes and held-contact release. Those extras keep forces smooth inside each step.
2. **Coulomb stops need care.** When the slip (or the rolling speed) goes to zero on a slope, its direction keeps turning, as |u|^(c/k). Plain RK4 loses about 1e-4 m/s in that last step, which would fail the 1e-9 m convergence test.
   - Near a stop, substeps shrink geometrically: h ≤ α·|u|/|du/dt|, with α versioned at about 1/8.
   - The stop is declared at |u| < uStop and finished with the exact impulse that removes the residual slip.
   - On flat, drag-free ground every substep is exact, so the analytic times and speeds stay exact.
3. **Impacts are one multi-contact solve** in ADR-0007.
   - It covers the primary contact plus each involved marble's support contact, which is reactive and unilateral, so a marble can lift off. The contact normal is the true 3D one.
   - It integrates over the primary normal impulse in about N = 256 steps (versioned), with Coulomb friction along the slip at each step. A contact sticks when its slip would reverse.
   - Restitution is Stronge's: Wr = e²·Wc. The final partial steps are solved exactly, so the frictionless closed forms (tests 3, 4, 7, 8) hold to 1e-9.
   - N is confirmed against pooltool.
4. **Resting contact.** Below vRest the collision is perfectly inelastic, and the pair (or marble and wall or edge) is held. A frictionless constraint force is solved inside the derivative, and the pair releases when that force turns tensile.
5. **The hole.** Regions are entered and left at ρ = Rh + rF. On the torus the rim is a curved support, and the wall and floor take impacts.
   - **Pocketed:** the centre is below ground level and the total energy is less than m·g·R. Energy never rises, so the marble can't climb out.
   - Lip-outs and rim rolls emerge from the dynamics.
6. **Edges and caps.**
   - Edges and corners are radius-0 tube features, so marbles hit, pivot over and hop them.
   - **A v1 simplification:** a marble resting across a crack is supported by one edge and held by the other, without friction.
   - **Caps:** past the per-step cap, the remaining contacts in that step resolve inelastically. Past the per-shot cap, or at tMax = 20 s, every marble is forced to rest. Both are flagged in the metrics.

## Tests (KPB v1 → `packages/physics/test/kpb/`)

| Suite               | How it's checked                                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytic 1–8        | Drag off unless stated, closed forms to 1e-9 relative. Tests may use `Math.log`, `atan2` and `sin`; the sim may not.                                                                                                                                                                                                          |
| Integrity 9–12      | Ledger closure to 1e-9, with no impact adding energy, over 1,000 random shots by default and 10,000 with `KANCHE_KPB_SHOTS=10000` (nightly, plus one recorded local run). Frictionless momentum. Interpenetration ≤ 1e-9 m, no tunnelling at maximum speed, bounded events. Step-halving convergence with drag and slopes on. |
| Determinism 13      | The same seeded shots repeated bit for bit. 200 golden replays in `packages/testkit/golden/physics-v1/` (data only; testkit still imports no `@kanche` package). A changed hash without a `physicsVersion` bump fails.                                                                                                        |
| Reference 14        | `tools/kpb/reference/pooltool_mathavan.py` runs pooltool 0.6.0 from a git-ignored venv, or the vendored Apache-2.0 `_collide_balls` with `@jit` stubbed if the install fails. Its outputs are committed as JSON goldens with the script. The test requires agreement within 0.5%.                                             |
| Reality 15          | Built and run on the synthetic set only. **Gate open.**                                                                                                                                                                                                                                                                       |
| Performance 16      | A 16-marble break, measured and recorded. Over 5 ms on CI becomes an open issue, not a skip.                                                                                                                                                                                                                                  |
| Fuzz and properties | fast-check: random inputs never throw an untyped error, non-finite values abort with `PhysicsError`, and invalid inputs are rejected.                                                                                                                                                                                         |

Coverage stays at 90% or more on all four measures, and every commit passes `pnpm verify`, so each slice lands with its own tests.

## Tools, client, CI

- **`tools/determinism`:** keeps the probe canary, and adds the 200 golden replays plus seeded shots (1,000 on PRs, 10,000 nightly). `compareRuns` also checks every engine against the committed goldens.
- **`tools/physics-lab`** is a CLI: scenario JSON (plus optional params) in; `events.json`, `ledger.json` and a CSV of |v|, |u| and ω over time out.
- **`tools/kpb`:**
  - the dataset schema (hand-validated, no new dependency) and the Tracker (Open Source Physics) CSV import
  - metric extraction: roll-out, slide time, departure angles, speed ratios, rest positions, capture boundary, bank angles
  - fitters with uncertainty: μR + Cd, μS, e(v), μBB, mF/eF
  - the scorer (pass when the error is ≤ 1.5 × the repeat scatter)
  - the pooltool script

  The tests generate synthetic shots with known parameters, and require the fitters to recover them and the scorer to fail when the parameters are perturbed. The starter dataset at `packages/testkit/kpb/` is the schema, a README and the synthetic set, flagged `synthetic: true`.

- **`apps/client/lab.html`** is built only in dev, debug and e2e modes. It draws velocity, slip and spin vectors, trails and live values, runs an A/B comparison of two parameter sets, and overlays a tracked CSV. It gets one e2e smoke test, and `pnpm budgets` stays untouched.
- **CI:** `nightly.yml` gains `KANCHE_KPB_SHOTS=10000`. pooltool never runs in CI.

## Docs

- `docs/physics.md`: frame and sign conventions with diagrams; the slide, roll, drag, slope, flick, impact, hole and edge derivations.
- `docs/physics-calibration.md` (the filming and fitting protocol, so you can film later) and `docs/kpb.md` (the suites, pass marks and recorded scores, with reality marked open).
- ADR-0006 (one RK4 integrator with exact event location, the stop refinement, the idiom and version freezing) and ADR-0007 (impact, hole, flick, drag and edge models; pooltool pin; held contacts).
- Updates to `packages/physics/CLAUDE.md`, the root `CLAUDE.md` repo map, `ARCHITECTURE.md` and `docs/evidence/phase-01/`.
- `docs/handoff/phase-01.md`: performance numbers, KPB scores, open questions, and notes for Phase 2 (the unit-vector table, `simulateShot` for the lag, layout gaps).

## Build order (branch `phase-01-physics-core`, small commits, each passing `pnpm verify`)

1. Copy this plan to `docs/phases/phase-01-plan.md`, and write ADR-0006.
2. Foundations: errors, vectors, params/v1, the table generator and generated tables, the court type and validation, state and its hash.
3. Flat-ground slide, roll and spin with RK4, internal events, the ledger and a one-marble `simulateShot`. KPB 1 and 2 (no drag).
4. Drag, heightfield slopes, cell and breakpoint events, the stop refinement. KPB 2 (drag), 6, and 12 on one marble.
5. The flick and its input validation.
6. Marble–marble impacts, the broadphase, contact location, airborne and landing, held contacts. KPB 3, 4, 5, 7, 8, 10, 11.
7. Walls, blocks and edges, curved supports.
8. The hole.
9. Fuzz, the ledger over N shots, repeatability, golden replays, the harness extension, KPB 12 on impacts.
10. Pooltool reference goldens and KPB 14.
11. The performance test, with optimisation if needed.
12. The physics-lab CLI.
13. tools/kpb and the synthetic starter set.
14. The client lab route.
15. Docs, ADR-0007, the CLAUDE.md updates, evidence and the handoff.

## Verification

- `pnpm verify` in a **fresh clone** in the scratchpad (with Deno on PATH), plus `pnpm e2e` and `pnpm harness`. The harness must give identical hashes, matching the goldens, in Node, Deno, Chromium, WebKit and Firefox.
- One local run with `KANCHE_KPB_SHOTS=10000` and `KANCHE_HARNESS_SEEDS=10000`, recorded in the evidence folder.
- Each analytic test is checked to fail when its law is broken, for example by swapping 5/7 for 2/3 or putting the drag sign the wrong way, so the tests aren't vacuous.
- The physics-lab CLI runs on a sample scenario, and the lab route renders in Chromium.
- PR "Phase 01 — Physics core" with the 12-quality checklist, CI green, and CodeRabbit feedback resolved.

## Stays open (stated, not claimed)

- KPB reality suite 15 and scores: no footage. Every parameter stays PLACEHOLDER.
- Performance on a physical low-end phone (KPB's ≤ 20 ms): no device here.
- Anything measured short of its pass mark (convergence, the pooltool 0.5%, the 5 ms) is recorded with the number reached, never by loosening the threshold.
