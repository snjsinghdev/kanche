---
status: accepted
date: 2026-10-17
decision-makers: owner (approved the Phase 1 plan), agent
consulted: Phase 1 prompt and MECHANICS-REVIEW (KPB v1); measurements in docs/evidence/phase-01/; ADR-0003, ADR-0004
informed: rules (Phase 2), ai (Phase 5), the server's re-simulation (Phase 6)
---

# One fixed-step RK4 integrator with exact events, local commits and frozen versions

## Context and problem statement

`packages/physics` must resolve a shot bit for bit the same in five engines (ADR-0004). It must also meet the KPB v1 pass marks:

- the analytic closed forms (tests 1–8) to 1e-9 relative;
- an energy ledger that closes to 1e-9;
- final positions that move under 1e-9 m when the step is halved (test 12);
- no interpenetration beyond 1e-9 m (test 11).

Marbles slide, roll, spin, fly, hit each other and the court, rest against each other, and fall into the hole. Each of these changes the forces abruptly, at a moment that has to be found inside a step. The determinism contract allows only `+ − × ÷` and `sqrt`, so there is no `exp`, `log` or trigonometry to lean on.

## Decision drivers

- Exactness where the physics is smooth, and exact event times where it is not
- Determinism: every decision is a pure function of the state, with fixed iteration caps and total ordering
- Results that do not depend on unrelated events (a marble's path should not change because another marble hit a wall)
- Speed: a 16-marble break in 5 ms on CI and 20 ms on a low-end phone (KPB 16, Gate 6)

## Considered options

- **Fixed-step RK4 at dt = 1/240 s. Events split steps, are located on the substeps' Hermite curves, and are re-integrated from the substep's start.**
- Semi-implicit (symplectic) Euler with a small step
- Closed-form, event-driven segments (exact for slides and rolls on flat ground)
- Adaptive RK45 with error control

## Decision outcome

Chosen option: **fixed-step RK4 with exact events**. It is fourth-order accurate on smooth motion, its event times come from root finding rather than step size, and it is deterministic because every substep is a pure function of its start state. The rules:

1. **Steps and events.** Time runs on the 1/240 s grid.
   - Inside a step, each marble's trial is a run of RK4 substeps, each stored as a cubic Hermite piece.
   - Internal events are found as roots of probe functions on those pieces, by Illinois regula falsi with a bisection fallback. The internal events are: Coulomb stops, spin stops, table breakpoints, terrain cells, the hole's regions, support hand-overs, take-off, rolling slip, leaving the court, and the release of a held contact.
   - Contacts are found on the same pieces by conservative advancement (gap ÷ a Bernstein bound on the closing speed), with an escape step for grazes and a Newton polish of at most 1 ns.
   - The static search runs per surface: a block (its top, edges and corners), a wall, or the ground. The nearest-feature gap is continuous within a surface but jumps between surfaces.
   - A touching contact closing at a rounding rate (under 10⁻¹² m/s) that stays within `gapTol` over the piece is rounding, not a contact.
   - The substep holding an event is re-integrated from its start to the event time, so **every event state is an RK4 state**.
   - Events resolve one at a time in the order (time, kind, lower id, higher id).
2. **Substeps are not always the full step.** This deviates from a pure fixed step: the step is fixed, but substeps inside it are not.
   - **Near a Coulomb stop,** h ≤ α·|u|/|du/dt|. Here α is `stopRefine` (1/32), or ½ when the side force is only drag-sized (p < 3×10⁻⁴, set against the 10,000-shot survey).
   - **On curved supports** (the rim, edges and corners), h ≤ `curveRefine`·d/|v|, with curveRefine = 0.004.
   - **A restart from zero** gets one short first substep.
   - **When nothing can turn a slip or rolling direction,** it is frozen, so flat-ground motion is exact, and the stop is found as a root. A stop reached by refinement is finished with the exact friction impulse P = −(2/7)·m·u, and that energy is booked.
   - **On a curved support near the stick–slip threshold,** the slip direction is slaved to the quasi-static ĉ = −F̂ (docs/physics.md).
3. **Commits are local.** Each group of marbles (one marble, or marbles joined by held contacts) keeps its own trial through the step until an event involves it.
   - Only the groups an event involves are committed to the event's time and make a new trial from there.
   - A commit replays only the substep that holds the time. This is bit-identical to re-integrating from the group's split point: all 1,778 such commits in a 1,000-shot survey matched.
   - At the grid line every group commits to the end of its trial.
   - So a marble's integration never depends on events it takes no part in. A test fails without this property (`test/scenarios.test.ts`, "locality").
   - It halved the break's substeps, from 12,488 to 6,004. That is 6,182 since the stop threshold was tightened.
4. **Resting contact** (MECHANICS-REVIEW finding 8) is held: a frictionless constraint force inside the derivative.
   - With several holds in a group, the force comes from an exact small LCP (active-set enumeration up to six contacts, then Gauss–Seidel).
   - A hold releases when its force would turn tensile.
   - After an impact, the closing contacts are stopped by the same LCP.
5. **The energy ledger** is carried as extra RK4 states (slide, roll, spin, drag). Impacts, forced stops and removals book their losses directly, so the ledger closes to rounding.
6. **The data idiom** is mutable objects with numeric fields, iterated with `for…of`, with pooled scratch objects in hot loops. There are no typed arrays, so no non-null assertions and no lint exceptions.
7. **Parameters** are a `PhysicsParams` value per shot. Production passes the frozen `PARAMS_V1`. Tests, the Physics Lab and the KPB fitters derive variants with `deriveParams`, and a variant must never reach a live match.
8. **Versions.** `physicsVersion` 1 is frozen at the merge of Phase 1.
   - Commits before that merge regenerate the golden replays in the same commit. Nothing has shipped, so no match can be on an older v1.
   - After the merge, any outcome change bumps `physicsVersion`, and v1's code and parameters stay runnable for live matches.
9. **Two kinds of golden** (packages/physics/CLAUDE.md).
   - **Analytic goldens** are textbook closed forms, checked to 1e-9.
   - **The 200 golden replays** in `packages/testkit/golden/physics-v1.json` are determinism witnesses written by the code under test (`scripts/update-goldens.ts`). They prove that results never change silently and that every engine agrees. They prove nothing about correctness.

### Consequences

- Good, because the analytic suite holds to 1e-9 and halving the step moves final positions by about 2e-11 m.
  - Mutations are caught: 2/3 for 5/7, the wrong inertia, drag pushing forward, e for e², and a wrong contact distance (docs/evidence/phase-01/).
- Good, because results are local and deterministic in five engines and on an ARM phone. Every engine gives the same goldens and the same break hash.
- Bad, because the refinement makes substeps irregular. Their count depends on the state, and `maxSubsteps` (4,096) and the event caps exist as logged fallbacks. None is hit in 10,000 random shots.
  - Getting there took the nightly-size survey: it found five defects that 1,000 shots never reach, each now a regression test (`integrity.test.ts`).
- Bad, because it is not fast enough.
  - The break takes about 25 ms median on an i7-5600U and 30 ms on a Snapdragon 695 phone, against 5 ms and 20 ms. KPB 16 and Gate 6 stay open.
  - About 6.7 µs per marble-step is spread thinly across RK4, probes, contact search and impacts. The next gains need a leaner hot path: typed arrays with a scoped lint exception, probe values reused between substeps, and fewer allocations. That is a decision for the owner (docs/handoff/phase-01.md).

### Confirmation

- **KPB 1–8** (`test/kpb/analytic.test.ts`), **9–12** (`integrity.test.ts`, 1,000 shots, or 10,000 with `KANCHE_KPB_SHOTS`), **13** (`determinism.test.ts` and `pnpm harness`), and **16** (`performance.test.ts`, plus `scripts/bench.ts` in CI with a 60 ms regression ceiling).
- The locality test and the fuzz suite (`fuzz.test.ts`).
- The coverage gate: 96% statements, 92% branches.

## Pros and cons of the options

### Semi-implicit Euler

- Good, because it is simple and fast per step.
- Bad, because it is first order: the 1e-9 marks would need steps around 10⁻⁷ s, and event times would still need location.

### Closed-form segments

- Good, because flat-ground slides and rolls are exact.
- Bad, because drag needs log and tan, and slopes, curved supports and held contacts have no closed form, so most of the simulation would still need an integrator.

### Adaptive RK45

- Good, because it controls error automatically.
- Bad, because the step sizes depend on an error estimate that is fragile at discontinuities, and drift between versions moves every step boundary. A fixed grid with explicit, versioned refinement rules is easier to reason about and to freeze.

## More information

- `docs/physics.md` has the models and sign conventions, and ADR-0007 the impact, hole, edge, flick and drag models.
- Revisit when KPB 16 is reworked, if the reality suite shows the refinement constants matter, or if a held-contact group ever exceeds six contacts in practice.
