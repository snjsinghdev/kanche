---
status: accepted
date: 2026-10-17
decision-makers: owner (approved the Phase 1 plan), agent
consulted: Phase 1 prompt; MECHANICS-REVIEW; Mathavan, Jackson and Parkin (2014); Stronge (1991); pooltool 0.6.0 source; measurements in docs/evidence/phase-01/
informed: rules (Phase 2), renderer and audio (Phase 3), the AI (Phase 5), calibration (the owner, when filming)
---

# Physics models: impacts, held contacts, the hole, edges, the flick, drag, and the KPB tools

## Context and problem statement

Phase 1 specifies what the simulation must model:

- a multi-contact impact with energetic restitution;
- the three-region hole;
- steps, curbs and cracks;
- a finger-impact flick;
- quadratic air drag;
- resting contact.

It also specifies how the result is judged: KPB v1, with a reference simulator (test 14) and filmed reality (test 15). Each model leaves choices open, and each choice moves results, so they are recorded here. ADR-0006 covers the integrator they all run in.

## Decision drivers

- Exact closed forms where the review defines them (KPB 1–8), and no energy gain anywhere
- Every model works with only `+ − × ÷` and `sqrt` (ADR-0004)
- Every coefficient is a placeholder until it is fitted to footage, so fitting must be possible and honest

## Considered options

- **The models below, each with its own tests, and the KPB tools built to fit and score them**
- Impulse-free penalty contacts (springs and dampers)
- Billiard-ball shortcuts: instantaneous impacts with fixed throw and no support reactions

## Decision outcome

Chosen option: **the models below**.

### Impacts (`src/sim/impact.ts`)

- **What the solve integrates.** One solve covers the primary contact (marble–marble, or marble and a wall, edge, rim or ground) together with the ground contact of each involved marble that is supported. It integrates over the primary normal impulse in `impactSteps` = 256 steps, as Mathavan, Jackson and Parkin (2014) do.
- **Friction.** Coulomb friction acts at every contact along its slip. A contact sticks rather than let its slip reverse. Supports are unilateral: they push only as hard as needed and never pull, so a marble can lift off.
- **Restitution** is Stronge's energetic coefficient, so restitution work = e²·compression work. Within a step every impulse is proportional to ΔP, so the final partial steps are solved exactly and the frictionless closed forms hold to 1e-9.
- **Slow contacts.** Below `vRest` = 1 mm/s the contact is perfectly inelastic and is then held (ADR-0006). No impulse step changes the normal speed by less than 10⁻¹² m/s, so an impact at a rounding-sized approach still ends.
- **A separation slower than vHop is removed.** A supported marble separating slowly from a feature stays against it. On a plane, the separation is the plane's part of the normal speed, v_h·(n_h + n_z·∇h), and it is removed along that direction. The plane doesn't carry a vertical velocity, so removing it along the 3D normal would leave one the next substep drops unbooked.
- **The lifted marble keeps its vertical velocity.** Contact friction gives it that velocity, and it feeds back into the slip. This is where Kanche departs from Mathavan's model, which discards it (see the reference, below).

### The ground and slopes

- The base ground is a bilinear heightfield, with slopes up to 3%.
- On it, Phase 1 uses the review's **small-slope model**: the acceleration is −g·∇h, and z follows the ground. So KPB 6 checks (5/7)·g·tan θ, not the review's sin θ; at the 3% limit they differ by under 4.5e-4.
- Block tops and the hole's floor are flat planes.

### Curved supports

The hole's rim torus, block edges (radius-0 tubes) and block corners (points) are exact constraints. The normal force comes from the constraint, take-off happens when it reaches zero, and Coulomb sliding or rolling friction acts on them. Marbles hit, pivot over and hop edges.

**Cut from v1** (`docs/gates.md`, Gate 5, change 5, which records the owner's decision of 2026-10-18):

- **Blocks are raised only** (0 < height < 8 mm). Cracks, which are lowered blocks, are not implemented, although the Phase 1 prompt names them.
  - A crack is the first feature that isn't convex. It needs a lowered-floor support region with entry and exit probes across its edges, strikes between its floor and its edges, and rest across a narrow crack, held by the far edge.
  - They can come in a later `physicsVersion` if Phase 2's courts call for them; v1 stays runnable.
- **Spin friction about the contact normal** acts on planes only, not on curved supports.

### The hole

There are three regions, entered and left at ρ = Rh + rF: the flat surround, the rim torus, and the pit wall with its floor. A marble is **pocketed** when its centre is below ground level and its total energy is below m·g·(zTop + r). Energy never rises, so it can never climb out. Lip-outs and rim rolls emerge from the dynamics, with no special cases.

### The flick (`src/flick.ts`)

- **The finger strike:** J = (1 + eF)·vF / (1/mF + 1/mEff), with 1/mEff = 1/m + |offset|²/I.
- **Spin:** ω0 = (J/I)·(b·ŝ − c·z′).
- **Inputs are integers:** an int16 direction resolved through a committed unit-vector table, with only the first octant stored and symmetry giving the rest exactly. Finger speed is 0–1000, spin ±600 and side ±300.
- **Miscues:** offsets beyond `miscueLimit`·R keep `miscueRetain` of the impulse.
- **The lofted shot** is behind `allowLoft`, which is off.

### Drag

Drag is quadratic, F = −½·ρ·Cd·A·|v|·v, with Cd = 0.5 as a PLACEHOLDER. While rolling, it decelerates the marble at (5/7)·(cD/m)·|v|², because the rolling constraint shares it with the spin. Magnus forces stay out until the reality suite shows they matter (MECHANICS-REVIEW finding 10).

### The reference: pooltool, for KPB 14

**Running it.** pooltool-billiards **0.6.0** (Apache-2.0, wheel SHA-256 `c47a46ae…7b3bd5`) can't be installed here: it needs a development build of panda3d on Linux.

- Its `_collide_balls` is therefore **vendored verbatim**, without the numba decorator, in `tools/kpb/reference/`, with the licence. `--wheel` checks it against the wheel byte for byte.
- It runs at a converged 20,000 impulse steps, on numpy (2.5.3 here), from `tools/kpb/reference/pooltool_mathavan.py`.
- Its output is committed as `packages/testkit/golden/pooltool-mathavan.json`.
- Nothing Python runs in CI.

**What it found:** Kanche agrees within 0.5% (worst 0.24%) on the 60 of the 81 collisions that are neither draws nor head-on returns. **The gate stays open**:

- **pooltool's ball–table slip has the opposite sign to its own `rel_velocity`, and to its ball–ball slip and torque updates.** So it sees a rolling marble as slipping at 2v, and a drawn one as rolling, and draw shots differ by up to 13%. With that one sign corrected, all 75 cut shots agree (worst 0.25%). The corrected variant is generated by text substitution of those two lines, so the change is visible.
- **Head-on returns into a marble rolling the other way differ by up to 5.5%.** Kanche keeps the lifted marble's vertical velocity, and sticks where the slip runs out. Mathavan's model discards the vertical velocity, and its explicit steps chatter about zero slip, applying ground friction all the while. Holding the lifted marble down in a scratch copy of Kanche cut the difference to 0.87%.
- Kanche's 256 impulse steps are converged: within 0.004% of 65,536 steps on cut shots, and 0.03% on head-on returns.

### The KPB reality tools (`tools/kpb`), for test 15

- **Dataset.** `kanche-kpb-dataset/1` is hand-validated, with no new dependency. Tracks come from Tracker (Open Source Physics) exports. A recording's launch is measured from its first frames over the longest window the shot allows.
- **Metrics.** One extractor reads both filmed tracks and the simulation sampled at the same frames. Any bias in a measurement is then common to both sides and cancels.
- **Fits use the simulation itself as the model.** A block Levenberg–Marquardt fit replays each recording with candidate coefficients. Each recording fits its own launch as a nuisance parameter. Errors are cluster-robust over recordings, and should be read with Student's t for (recordings − 1) degrees of freedom. In order:
  1. μR per surface together with Cd, from rolls;
  2. μS per surface, from stunned launches;
  3. e(v) and μBB together, from head-on hits and cuts, because each moves the other's evidence;
  4. the rim's restitution and friction (`edge.e` and `edge.mu`), from the hole shots:
     - only the track up to 0.15 s after the marble reaches the rim is used, because the rim leaves its mark there and the long roll after it would swamp it;
     - the fit starts from v1, and from v1 × 0.8 and × 1.2, and keeps the best, because the residuals are rugged in these two coefficients;
     - its σ is a local curvature, so it understates the error when the repeats don't vary. From tracking noise alone it recovers the truth to within 5%, not 3σ;
  5. mF and eF in closed form, from central flicks.
- **Scoring.** A metric passes when the RMS per-repeat error is ≤ 1.5 × the filmed repeat scatter. With five repeats, a metric the launch does not drive fails a perfect simulation about 5% of the time by chance, against 0.5% with ten repeats (Monte Carlo, docs/kpb.md).
- **The synthetic starter dataset** (`packages/testkit/kpb/synthetic-v1.json`) is generated from the simulation with known coefficients, is flagged `synthetic: true`, and proves the tools only.

### The Physics Lab

- `tools/physics-lab` is a CLI that writes events, the ledger and a timeline CSV.
- `apps/client/lab.html` is a page built only in dev, debug and e2e modes. It reuses the Tracker parser from `@kanche/kpb/tracker`, and the production bundle is byte-identical without it.
- The page plays a filmed clip under the court, in step with the simulation. Its corners are given in court metres and its start as an offset in seconds, so a filmed shot and its replay can be compared by eye.

### Consequences

- Good, because every model above has a test that fails when its law is broken, and impacts never add energy (KPB 9 over 1,000 shots per PR and 10,000 nightly).
- Good, because the reference comparison found a real defect in the reference itself rather than hiding it, and the tools can fit and score real footage as soon as it exists.
- Bad, because impacts and supports on steep slopes (the small-slope model) are a v1 simplification, and cracks and spin friction on curved supports are cut from v1 (`docs/gates.md`, Gate 5). All three are listed in the handoff.
- Bad, because KPB 14 and 15 stay open. KPB 14 has the two findings above; KPB 15 has no footage. Every coefficient is still a PLACEHOLDER.

### Confirmation

- `test/kpb/reference.test.ts`: the 60 shots agree with pooltool as shipped, all 75 cut shots with the sign corrected, the open cases are only the recorded ones, and 256 steps are converged.
- `tools/kpb/test/kpb.test.ts`:
  - the fits recover the truth (within 3σ, or 0.5%, from noise alone, the rim within 5%; and within the t-adjusted interval with variation, the rim included);
  - the true and fitted parameters pass all 48 metrics;
  - v1 fails 13;
  - a 30% error in μR fails the cement roll-outs.
- `test/scenarios.test.ts`: walls, steps and curbs, the hole, resting contacts, edges and corners.
- `test/kpb/analytic.test.ts`: KPB 8 at both of the Phase 1 prompt's normals, 4.9° (9.5 mm on 8 mm) and 9.1° (11 mm on 8 mm).
- `apps/client/e2e/lab.spec.ts`: the footage overlay shows a generated clip under the court (Chromium).

## Pros and cons of the options

### Penalty contacts

- Good, because they are easy to code.
- Bad, because they need stiff springs and tiny steps. Their energy depends on the step, so neither the ledger nor the 1e-9 closed forms could hold.

### Billiard shortcuts

- Good, because they are cheap.
- Bad, because they fix the throw and ignore the ground's reaction during an impact. That is exactly where glass on cement differs from cloth (MECHANICS-REVIEW).

## More information

- `docs/physics.md` has the derivations and sign conventions, `docs/physics-calibration.md` the filming and fitting protocol, and `docs/kpb.md` the suites and scores.
- **To report upstream:** the pooltool sign finding, to pooltool's issue tracker. That is the owner's call, since it is an outward action.
