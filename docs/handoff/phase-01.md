# Phase 1 handoff: Physics core

**Date:** 2026-10-17 · **Branch:** `phase-01-physics-core` · **Plan:** `docs/phases/phase-01-plan.md` · **Evidence:** `docs/evidence/phase-01/` · **Benchmark:** `docs/kpb.md` · **Gates:** `docs/gates.md`

## Read this first: Gate 6 failed, and Phase 2 waits on the owner

The updated prompt pack, exported into the repository root during this phase, gives Phase 1 two exit gates. Under the gate rule, Phase 2 starts only when both pass.

**Gate 6 failed.** A 16-marble break must simulate in 20 ms or less on the reference budget phone.

| Device                                                              | Median      |
| ------------------------------------------------------------------- | ----------- |
| The owner's OnePlus CPH2467 (Snapdragon 695, a **mid-range** phone) | **29.6 ms** |
| An i7-5600U laptop                                                  | **25.0 ms** |

KPB 16's own mark is 5 ms on CI. No reference budget phone has been chosen yet (Gate 6 for Phase 0, which predates the gates), but a budget phone is slower than the OnePlus. There are three ways forward, for the owner to choose. **I recommend the first.** The second changes a pass mark after measuring against it, which Gate 9 exists to prevent, so it would need the owner's explicit decision.

1. **Optimise further** (estimated 2–4×). The per-marble-step cost (about 6.7 µs) is spread across RK4, probes, contact search and impacts, so the next gains need a leaner hot path:
   - typed arrays with a scoped lint exception;
   - probe values reused between substeps;
   - one derivative evaluation fewer per substep;
   - fewer allocations.

   This is the safest path to the gate. Results change, so it lands before v1 ships, or as `physicsVersion` 2.

2. **Change what the gate measures.** The 20 ms is a frame budget for the phone showing a break. If the break simulates once when the shot is taken and the renderer then plays the timeline back, the user waits for one simulation, not one per frame. The gate could become, say, "the shot's outcome within 100 ms of release". That needs the owner's decision and a Gate 9 note before anything is measured against it.
3. **Cut scope.** Fewer marbles in a break, or a coarser solver on the phone and the exact one on the server, is a design change (Gate 5). It is not recommended: the server and the phone must agree bit for bit (ADR-0004).

**Gate 5 can't be measured.** No phase has a planned duration (Phase 0's part of Gate 5 never ran). Phase 1's actual time and its fifteen design changes are logged in `docs/gates.md`. Set planned durations for Phase 2 onwards.

## The retrofit after the owner's review

The owner asked why PR #2 was opened with Gate 6 failed. It shouldn't have been: PR #2 is now a draft, the Phase 0 gates are retrofitted in PR #3, and these Phase 1 gaps and CodeRabbit's eleven comments are closed on this branch:

- **The broadphase is the prompt's sort-and-sweep again.** The code searched every pair with box checks instead, a deviation nothing recorded; outcomes are unchanged (ADR-0006).
- **KPB 8 runs at 4.9° as well as 9.1°.** The Phase 1 prompt names both normals; only 9.1° was tested.
- **The rim is fitted** (`fitRim`, ADR-0007). Its σ understates the error on data without natural variation (`docs/kpb.md`).
- **The lab overlays footage,** a video file under the court in step with the simulation.
- **CodeRabbit's fixes:**
  - a marble that starts inside a wall, a block, the hole or the ground is refused;
  - the pit-wall gap only counts inside the hole;
  - `PARAMS_V1` is frozen all the way down;
  - KPB 11 compares marbles at the same instant;
  - the `kpb` and `lab` CLIs validate every argument, and name a missing one;
  - `fitFlick` refuses degenerate data;
  - the lab's Play test checks that time advances;
  - the lab CLI's test reads only scenario files;
  - the synthetic dataset's reproducibility note is corrected: its launches use `Math.cos` and `Math.sin`.
- **Cracks and spin friction on curved supports are proposed cuts, not settled ones.** The prompt names cracks, so leaving them out is the owner's call (`docs/gates.md`, Gate 5, change 5).

None of this changes an outcome: the goldens, the harness hashes and the break's hash are the same.

## What was built

- **`packages/physics`** (ADR-0006, ADR-0007, `docs/physics.md`): `simulateShot`, a deterministic simulation of glass marbles on real ground.
  - **Integration:** fixed-step RK4 at 1/240 s, with internal events located on the substeps' Hermite curves and re-integrated, so every event state is an RK4 state. Coulomb stops and curved supports get refined substeps.
  - **Commits are local:** only the marbles an event involves are re-integrated.
  - **Impacts and contacts:** a multi-contact impact solve with energetic restitution; held resting contacts with an exact small LCP.
  - **The court:** the three-region hole; steps and curbs with edges and corners; a bilinear heightfield of slopes up to 3%.
  - **The flick, drag and the ledger:** the finger-impact flick with integer inputs, quadratic drag, and an energy ledger carried as RK4 states.
  - **Inputs and outputs:** typed `PhysicsError`s for bad inputs; events, keyframes, metrics, and the FNV-1a state hash.
  - **Parameters:** `PARAMS_V1` (every coefficient a PLACEHOLDER) and `deriveParams` for variants.
  - **For tests and tools:** `@kanche/physics/testing` exports `randomShot` and `breakShot`.
- **The KPB v1 suites** (`test/kpb/`): analytic 1–8, integrity 9–12, determinism 13, reference 14 and performance 16.
  - A fuzz suite and scenario tests cover walls, steps, the hole, resting contact, edges and caps.
  - 200 golden replays are in `@kanche/testkit/golden/physics-v1.json`.
  - The nightly runs the suites over 10,000 shots in a `kpb` job.
- **`tools/determinism`:** the probe, the golden replays and the seeded shots in Node, Deno, Chromium, WebKit and Firefox. `compareRuns` also fails on drift from the committed goldens.
- **The KPB 14 reference** (`tools/kpb/reference/`): pooltool 0.6.0's `_collide_balls`, vendored verbatim (Apache-2.0) and checked against the wheel. Its values are committed.
- **`tools/kpb`, the reality-suite tools:**
  - the dataset format and Tracker import;
  - one metric extractor for filmed and replayed tracks;
  - fits that use the simulation itself as the model (μR with Cd, μS, e(v) with μBB, the rim's e and μ, and mF/eF);
  - the scorer;
  - a **synthetic** starter dataset.
- **`tools/physics-lab`** (`pnpm lab`): a scenario in; events, the ledger and a timeline CSV out.
- **The client lab route** (`apps/client/lab.html`, dev, debug and e2e builds only):
  - vectors, trails, live values, A/B parameter sets, a Tracker overlay and a footage overlay;
  - a bench hook, to time the break in a phone's browser.

  The production bundle is byte-identical without it.

- **CI:**
  - the KPB 16 bench in `verify`, with a 60 ms regression ceiling and the `kpb16` artifact;
  - the nightly `kpb` job.
- **Docs:**
  - `docs/physics.md`, `docs/physics-calibration.md`, `docs/kpb.md` and `docs/gates.md` (new: the ten gates, plus the Phase 0 and 1 logs);
  - ADR-0006 and ADR-0007;
  - updates to the root and physics `CLAUDE.md` and to `ARCHITECTURE.md`.

## Pinned versions

**No new npm dependency.** Everything runs on Phase 0's pins (ADR-0001).

**For the reference script only** (never in CI):

- pooltool-billiards **0.6.0**: wheel SHA-256 `c47a46aeeeac6eea645e5c1610211ce0f0ae350e4b77909b8dd55b66e77b3bd5`, released 2026-03-16, vendored as source.
- numpy 2.5.3: the system copy on the generating machine. It is recorded in the reference JSON.

## Gate status

| Done-when item                                                                                                                                                            | Status                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytic, integrity, determinism and reference suites pass; coverage gate holds (a fresh clone passes `pnpm verify`, `pnpm e2e` and `pnpm harness`: `evidence/phase-01/`) | **Partly.** Analytic, integrity and determinism pass (over 10,000 shots too). Coverage is 96.3 / 91.8 / 99.1 / 97.1% (statements, branches, functions, lines). **Reference (KPB 14) is open:** 60 of 81 collisions agree with pooltool as shipped. Draws differ through a sign error in pooltool, and head-on returns through a model difference (`docs/kpb.md`) |
| The KPB scorer runs on the starter dataset; scores in `docs/kpb.md`                                                                                                       | ✅ On the **synthetic** dataset: the true and fitted parameters pass 48 of 48 metrics, and v1 passes 35. The reality gate (KPB 15) stays **open** with no footage                                                                                                                                                                                                |
| `docs/physics.md` holds derivations, sign conventions and diagrams                                                                                                        | ✅                                                                                                                                                                                                                                                                                                                                                               |
| ADR-0006 and ADR-0007                                                                                                                                                     | ✅                                                                                                                                                                                                                                                                                                                                                               |
| Golden replays committed                                                                                                                                                  | ✅ 200, identical in five engines                                                                                                                                                                                                                                                                                                                                |
| This handoff records performance numbers, KPB scores and open questions                                                                                                   | ✅                                                                                                                                                                                                                                                                                                                                                               |
| PR "Phase 01 — Physics core" reviewed                                                                                                                                     | [PR #2](https://github.com/snjsinghdev/kanche/pull/2) is a **draft** while Gate 6 fails. CodeRabbit's eleven comments are fixed in the retrofit                                                                                                                                                                                                                  |
| **Exit gate 6** (break ≤ 20 ms on the reference phone, stack unchanged)                                                                                                   | ❌ **Failed**: 29.6 ms on a mid-range phone. Stack unchanged                                                                                                                                                                                                                                                                                                     |
| **Exit gate 5** (planned vs actual, design changes)                                                                                                                       | Logged in `docs/gates.md`; **can't be measured**, because there is no plan duration                                                                                                                                                                                                                                                                              |

## KPB v1 scores (physicsVersion 1)

| Suite          | Result                                                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–8 analytic   | Pass to 1e-9. Each law's test fails when the law is broken (`evidence/phase-01/mutants.txt`)                                                                                                                                                                          |
| 9–12 integrity | Pass over 1,000 shots per PR and 10,000 nightly: worst ledger 6.5e-10, worst overlap 5.5e-13 m (marbles) and 1.2e-10 m (features), no caps. Halving dt moves final positions by 2e-11 m                                                                               |
| 13 determinism | 200 goldens and 1,000 shots (10,000 nightly) identical in five engines (`0e4d48c50528e812/727cc953980357c6/67369b3e26944067` at 1,000 seeds, `d3e8ebfbdc986614/727cc953980357c6/c610c405c294d266` at 10,000). The break's hash is identical in Chrome on an ARM phone |
| 14 reference   | **Open:** 60 of 81 within 0.5% (worst 0.24%); 75 of 81 with pooltool's slip sign corrected; head-on returns up to 5.5%                                                                                                                                                |
| 15 reality     | **Open:** no footage. The tools are proven on synthetic data                                                                                                                                                                                                          |
| 16 performance | **Open:** 25.0 ms (laptop), 29.6 ms (phone), against 5 ms and 20 ms                                                                                                                                                                                                   |

## What the nightly-size run found

The first 10,000-shot run failed KPB 9 and 11 on seven shots the 1,000-shot PR run never reaches. Each one was a real defect, and each is now a regression test that fails on the previous code:

- **A marble resting against a step re-found its contact at the same instant until the step cap.** The contact search took a rounding-rate closing for a contact.
- **An impact at a rounding-sized approach never ended.** The impulse steps were smaller than the separation's own rounding.
- **A take-off from an edge was taken for a contact with the ground below it.** The static search took the minimum gap over all features, which jumps between surfaces. It now searches each surface on its own.
- **After an edge impact, a plane-supported marble kept a vertical velocity** that the next substep dropped unbooked, leaving the ledger 1.7e-8 out.
- **Soft flicks on slopes used the coarse stop refinement,** leaving the ledger 2e-9 out.

**Lesson for later phases:** run the nightly-size suites locally before the PR, not only the per-PR size.

## Deviations from the approved plan

These are also logged under Gate 5 in `docs/gates.md`:

- **Commits are local,** not global (ADR-0006).
- **Held contacts use an exact LCP.**
- **Substeps are refined** near stops and on curved supports.
- **KPB 6 checks tan θ,** under the small-slope model.
- **Two proposed cuts, awaiting the owner:** cracks and spin friction on curved supports are not modelled.
- **pooltool is vendored,** not installed.
- **e(v) and μBB are fitted jointly.**
- **KPB 16's wall time is measured in an uninstrumented bench,** with a CI ceiling. The suite holds the substep count.
- **The lab is Canvas2D.**
- **The goldens were regenerated before the merge:** v1 is frozen at the merge.
- **`tools/kpb`'s tests run without coverage,** because instrumentation slows the simulation tenfold and that package has no gate.
- **The rim is fitted,** which the plan left for later.
- **The lab overlays the footage itself,** which the plan left out with filming.
- **The broadphase is sort-and-sweep,** as the plan said. The code had deviated without a record until the retrofit.

## Open issues

1. **Gate 6 and KPB 16** (above): the owner's decision, before Phase 2.
2. **KPB 14:**
   - Report pooltool's ball–table slip sign error upstream (github.com/ekiefl/pooltool). That is an outward action for the owner.
   - Decide whether head-on returns should follow Mathavan (no vertical velocity) or Kanche's model. Kanche's is the more physical, so the reference would need a documented exception.
3. **KPB 15 needs footage:** the protocol is in `docs/physics-calibration.md`.
   - Choose 5 or 10 repeats per condition first. With 5, a metric the launch doesn't drive fails a perfect simulation about 5% of the time by chance (`docs/kpb.md`).
   - Write that decision into `docs/gates.md` before scoring (Gate 9).
4. **Every coefficient is a PLACEHOLDER** until it is fitted. Fitted values ship as `physicsVersion` 2.
5. **Proposed cuts, for the owner to confirm or reject:**
   - **cracks** (lowered blocks), which the prompt names. Building them needs a lowered-floor support region with entry and exit probes, strikes between the floor and the edges, and tests for a marble lodged across a narrow crack (`docs/gates.md`, Gate 5, change 5);
   - spin friction on curved supports.
6. **v1 simplifications:**
   - the small-slope model for supports and impacts on slopes;
   - blocks must be lower than the smallest marble (8 mm).
7. **The Phase 0 gates never ran.** PR #3 retrofits them and waits on the owner:
   - legal questions (Gate 3);
   - the reference budget phone (Gate 6);
   - phase durations (Gate 5).
8. **The prompt-pack export sits in the repository root.** `GATES.md`, `MECHANICS-REVIEW.md`, `VISUAL-BENCHMARK.md`, `prompts/` and a replaced `README.md` arrived during this phase, and are left uncommitted and untouched.
   - They fail Prettier there, and the replaced `README.md` overwrites the project's own.
   - This phase treated the updated Phase 1 prompt (its exit gates) as authoritative. Its other changes (Phase 0's visual non-negotiable, KVB v1 from Phase 3) don't touch Phase 1.
   - Moving the export into `docs/prompt-pack/` is the owner's call.
9. **The KPB 16 bench on CI hardware** is new. Its first numbers are in the `kpb16` artifact of the PR's CI run, and the 60 ms ceiling should be revisited once they are known.

## Notes for Phase 2 (rules and modes)

- **Run a shot with `simulateShot(setup, { params: PARAMS_V1 })`.**
  - The result's `events` drive the rules: impacts carry the marbles or feature, the time, the impulse and the normal; transitions include `pocketed` and `out`.
  - `final` holds every marble's resting state, and `hash` is the state hash.
- **Inputs are integers.** A flick is `{ dirX, dirY, fingerSpeed, spin, side }`, validated by `validateFlick`. For angle inputs such as the lag's start points, use `unitVector(index)`, a committed table of 1,024 directions.
- **Courts are `CourtSpec` data.** Phase 2's ring, line and hole layouts are courts with walls, blocks (steps and curbs) and a hole, built by `buildCourt` once and reused across shots.
- **Pass the frozen `PARAMS_V1`** in anything that decides a match. `deriveParams` is for tests and tools only.
- **Cost.** A shot is about 3 ms on average on the laptop (1,000 random shots), and a full break about 25 ms. The rules' search for a lag winner, and the AI later, should budget for that.
- **Determinism.** The rules package inherits the determinism lint. Never sort without a comparator, never use floats from outside the simulation as inputs, and bump `rulesVersion` with any outcome change (ADR-0004).
