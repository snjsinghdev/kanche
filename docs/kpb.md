# The Kanche Physics Benchmark (KPB v1)

KPB v1 is the bar `packages/physics` is held to. The review that defines it is [`prompt-pack/MECHANICS-REVIEW.md`](prompt-pack/MECHANICS-REVIEW.md), and the Phase 1 prompt lists the sixteen tests. This page says where each test lives, how to run it, and the scores of every physics version. **A score is recorded with the number reached; a pass mark is never loosened to make a test pass.**

## Scores for physicsVersion 1 (2026-10-17)

| Suite       | Tests | Pass mark                                                             | Result                                                                                                                                                                                                                                                    | Status |
| ----------- | ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Analytic    | 1–8   | Closed forms to 1e-9 relative                                         | All pass. KPB 6 checks (5/7)·g·tan θ under the small-slope model (ADR-0007). KPB 8 runs at both of the Phase 1 prompt's normals, 4.9° and 9.1°. Each test fails when its law is broken (mutation checks, `evidence/phase-01/`)                            | PASS   |
| Integrity   | 9–12  | Ledger to 1e-9; no gain; no penetration > 1e-9 m; halving dt < 1e-9 m | 1,000 shots per PR and 10,000 nightly: worst ledger 6.5e-10, worst pair overlap 5.5e-13 m, worst static 1.2e-10 m (1,000 shots), no caps. Halving dt moves final positions by 2e-11 m. The first 10,000-shot run found five defects, now fixed (evidence) | PASS   |
| Determinism | 13    | Identical hashes in Chromium, WebKit, Firefox, Node and Deno          | 200 golden replays and 1,000 seeded shots (10,000 nightly) identical in all five; the break's hash is also identical in Chrome on an ARM phone                                                                                                            | PASS   |
| Reference   | 14    | Within 0.5% of pooltool's frictional_mathavan                         | 60 of 81 collisions within 0.5% (worst 0.24%). Draws differ by up to 13% (a sign error in pooltool), head-on returns by up to 5.5% (a model difference)                                                                                                   | OPEN   |
| Reality     | 15    | Each metric's error ≤ 1.5 × the filmed repeat scatter                 | No footage yet. The tools are proven on a **synthetic** dataset only                                                                                                                                                                                      | OPEN   |
| Performance | 16    | A 16-marble break ≤ 5 ms on CI; ≤ 20 ms on a low-end phone            | 25 ms median on an i7-5600U (2015 laptop), 30 ms on a Snapdragon 695 phone (Chrome 155)                                                                                                                                                                   | OPEN   |

## Running the suites

| Suite | Where                                                | Command                                                                                                       |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1–8   | `packages/physics/test/kpb/analytic.test.ts`         | `pnpm test` (in every `pnpm verify`)                                                                          |
| 9–12  | `packages/physics/test/kpb/integrity.test.ts`        | `pnpm test`; `KANCHE_KPB_SHOTS=10000` for the nightly size (the `kpb` job in `nightly.yml`)                   |
| 13    | `test/kpb/determinism.test.ts`, `tools/determinism`  | `pnpm test` and `pnpm harness` (`KANCHE_HARNESS_SEEDS=10000` nightly)                                         |
| 14    | `test/kpb/reference.test.ts`, `tools/kpb/reference/` | `pnpm test`; regenerate with `python3 tools/kpb/reference/pooltool_mathavan.py --wheel <wheel>` (never in CI) |
| 15    | `tools/kpb`, `packages/testkit/kpb/`                 | `pnpm kpb score <dataset> [--params <overrides.json>]`                                                        |
| 16    | `test/kpb/performance.test.ts`, `scripts/bench.ts`   | `pnpm --filter @kanche/physics bench [runs] [--json <file>] [--max <ms>]` (CI: 200 runs, 60 ms ceiling)       |

## KPB 14: the reference

The pooltool reference values are pooltool-billiards 0.6.0's `_collide_balls`, vendored verbatim and run at a converged 20,000 impulse steps. There are 81 equal-size collisions on cement with Kanche's v1 coefficients:

- speeds of 0.3, 1 and 3 m/s;
- cut angles of 0–60°;
- stun, roll, draw and side-spin shooters;
- head-on returns into a marble rolling the other way.

Errors are measured against the striker's speed v for velocities, and v/R for spins.

| Comparison                                                 | Cases | Worst  | Within 0.5% |
| ---------------------------------------------------------- | ----- | ------ | ----------- |
| pooltool as shipped: no draws, no head-on returns          | 60    | 0.24%  | all         |
| pooltool as shipped: draws                                 | 15    | 12.97% | none        |
| pooltool with its ball–table slip sign corrected: all cuts | 75    | 0.25%  | all         |
| pooltool corrected: head-on returns into a rolling marble  | 6     | 5.49%  | none        |

Two findings keep the gate open:

1. **pooltool's ball–table slip has the wrong sign.** `_collide_balls` computes the slip at the table as (v_x + R·ω_y, v_y − R·ω_x) in its local frame. pooltool's own `rel_velocity`, and the function's own ball–ball slip and torque updates, all use the right-handed v + ω × (−R·ẑ) = (v_x − R·ω_y, v_y + R·ω_x). So a marble that pooltool elsewhere calls rolling is seen as slipping at 2v, and a drawn marble as rolling. The error only matters when contact friction presses a marble into the table, which happens with top- or backspin about the line of centres. It is worth reporting upstream; that is the owner's call.
2. **Head-on returns differ in the model.** Kanche keeps the vertical velocity that contact friction gives the lifted marble, and it feeds back into the contact slip. Where the slip runs out, the contact sticks. Mathavan's model discards the vertical velocity, and its explicit steps chatter about zero slip, which applies ground friction throughout. Holding the lifted marble down in a scratch copy of Kanche brings the worst case from 5.5% to 0.87%. The remainder is the sticking.

Kanche's 256 impulse steps are converged. Against 65,536 steps they differ by under 0.004% on cut shots and under 0.03% on head-on returns.

## KPB 15: reality

**No marbles have been filmed yet, so the reality gate is open, and every coefficient in `PARAMS_V1` is a PLACEHOLDER.** The tools are built and proven on [`packages/testkit/kpb/synthetic-v1.json`](../packages/testkit/kpb/README.md). That dataset is 115 recordings generated from the simulation itself. It uses known coefficients that differ from v1, has realistic launch and coefficient variation from repeat to repeat, and has tracking noise. It is flagged `synthetic: true`. Its scores say the tools work; they say nothing about real marbles.

| Parameter set                          | Metrics within 1.5 × scatter                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The coefficients the set was made with | 48 of 48                                                                                                                                                                                   |
| The coefficients fitted from it        | 48 of 48                                                                                                                                                                                   |
| v1's placeholders                      | 35 of 48. Fails roll-outs on cement 0.6, tile and dirt, all three slide times, the 0.5 m/s head-on speed ratio and the bank angle, because v1's μR, μS, e and wall model are not the truth |

The fits recover what the set was made with:

| Coefficient             | Fitted             | Truth  | Recordings |
| ----------------------- | ------------------ | ------ | ---------- |
| Cd                      | 0.48 ± 0.16        | 0.45   | 25         |
| cement.muR              | 0.00948 ± 0.00022  | 0.0095 | 10         |
| tile.muR                | 0.00684 ± 0.000095 | 0.0068 | 10         |
| dirt.muR                | 0.02695 ± 0.00035  | 0.028  | 5          |
| cement.muS              | 0.314 ± 0.005      | 0.32   | 5          |
| tile.muS                | 0.268 ± 0.003      | 0.27   | 5          |
| dirt.muS                | 0.401 ± 0.007      | 0.42   | 5          |
| glass.e at 0.45 m/s     | 0.945 ± 0.002      | 0.946  | 5          |
| glass.e at 0.98 m/s     | 0.923 ± 0.005      | 0.931  | 5          |
| glass.e at 1.98 m/s     | 0.909 ± 0.005      | 0.904  | 5          |
| glass.mu (μBB)          | 0.0638 ± 0.0008    | 0.065  | 25         |
| edge.e (the rim)        | 0.420 ± 0.026      | 0.40   | 15         |
| edge.mu (the rim)       | 0.255 ± 0.006      | 0.25   | 15         |
| flick.fingerMass (kg)   | 0.0058 ± 0.0004    | 0.0055 | 30         |
| flick.fingerRestitution | 0.49 ± 0.06        | 0.55   | 30         |

The errors are cluster-robust over recordings. With five recordings, read them with Student's t at four degrees of freedom, so ±3σ becomes ±6.6σ. From tracking noise alone (`makeSynthetic({ variation: false })`), every estimate is within 3σ of the truth, or within 0.5%, except the rim's. The one systematic is −0.1% on e at the fastest breakpoint, where the table's flat extension cuts off the faster hits.

**The rim's σ is not reliable on its own.** The rim fit's residuals are rugged in e and μ, so it starts from three points and keeps the best (ADR-0007).

- From noise alone, the full calibration recovers e as 0.408 ± 0.001 (+2.1%, about 8σ out) and μ as 0.253 ± 0.005 (+1.4%, within 1σ).
- Fitting the rim alone, from v1's 0.5 and 0.3 with the truth elsewhere, gives −1.7% (about 11σ) and −4.5% (about 3σ).
- So without repeat-to-repeat variation its σ understates the error, and its test holds it to 5% instead of 3σ.
- With the variation real footage has, its σ is realistic: the rim's estimates above are within 1σ of the truth.

Regenerating the dataset with the rim's truth changed the hole shots' track lengths, so the tracking noise drawn for the flicks after them changed too. That is why the finger's estimates differ from the first run's (0.0049 kg and 0.66), within their errors both times.

### The pass mark with five repeats

For a metric the launch drives, such as a roll-out, the filmed scatter includes the launch's spread, while the simulation replays each launch. Such a metric passes comfortably. For a metric the launch does not drive, such as a speed ratio or a slide time, the simulation's error and the filmed scatter are both mostly tracking noise and natural variation. So even a perfect simulation fails 1.5 × scatter by chance. By Monte Carlo (200,000 trials each):

| Repeats | Launch-driven spread ÷ the rest | A perfect simulation fails |
| ------- | ------------------------------- | -------------------------- |
| 5       | 0                               | 5.5%                       |
| 5       | 1                               | 4.7%                       |
| 5       | 3                               | 0.4%                       |
| 10      | 0                               | 0.5%                       |
| 20      | 0                               | 0.0%                       |

The prompt asks for five repeats. With the roughly 25 such metrics on the synthetic set, expect one or two chance failures in a perfect model (the synthetic set happens to show none). The owner could film **ten repeats** for the impact and slide conditions, which cuts the chance failure rate to 0.5% per metric. Alternatively, a lone failure could be read as a call for more repeats rather than as a failed gate. That decision belongs in `docs/gates.md` before the footage is scored (Gate 9).

## KPB 16: performance

| Machine                                                  | Median                                  | Fastest | p90     |
| -------------------------------------------------------- | --------------------------------------- | ------- | ------- |
| Intel i7-5600U (2015 laptop, Node 24.22.0)               | 25.0 ms                                 | 21.1 ms | 32.5 ms |
| OnePlus CPH2467 (Snapdragon 695, Android 15, Chrome 155) | 29.6 ms                                 | 24.3 ms | 31.2 ms |
| CI (`ubuntu-24.04`)                                      | in the `kpb16` artifact of every CI run |         |         |

The break is a 15-marble rack, 1 mm apart, struck from 0.3 m on cement (`breakShot()` in `@kanche/physics/testing`). It runs 4.66 s of shot time, with 160 events, 76 impacts, 1,118 steps and 6,182 substeps. Phase 1 brought it from 38 ms to 21 ms by committing only the marbles an event involves (ADR-0006). The defect fixes the 10,000-shot survey called for then cost about 6%, and this machine varies by about 10% across a day (`evidence/phase-01/`). Both pass marks remain open, and so does Gate 6. A mid-range phone misses 20 ms, so a budget phone will too (`docs/gates.md`).

**After the first optimisation (2026-10-18), 1.31× faster with identical results.** The break, a lone rolling marble and sixteen marbles with one moving run 1.31×, 1.36× and 1.79× faster than at `0d03e7e`, with every hash the same. That is about 19 ms on the i7-5600U. KPB 16's own marks stay open. Gate 6 no longer uses them: since 2026-10-19 it asks for a break's full outcome within 100 ms of release on the reference phone, which the proxy in `docs/gates.md` puts at about 35 ms on this laptop. The figures are ratios, measured shot by shot against the baseline in one process, because the machine was loaded by another program while they were taken; an idle re-measure and the phone are still to do (`evidence/phase-01/`).

## When physics changes

Any change to an outcome bumps `physicsVersion` once v1 has shipped (ADR-0006). The new version's scores go into a new section above v1's. A reality score that gets worse blocks release (MECHANICS-REVIEW).
