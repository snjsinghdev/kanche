# Phase gates

Ten tests that each phase must pass before the next one starts. They come from the prompt pack's "Phase gates" (exported 17 October 2026). A failed gate means fixing the problem or cutting scope, never pushing on. Each phase logs the evidence for its exit gates here and in its handoff note. Gates 5 and 6 are checked at the end of every phase. Pass marks are written before any test runs (Gate 9).

## The ten gates

| #   | Gate                                                                               | Rule                                                                                                                                                                                                                                     | Test to pass                                                                                                                                                         | Blocks                                       |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Prove the fun first (Anthem, 38 Studios, Concord)                                  | Before any art, furnace or multiplayer work, an art-free flick-and-capture build on the reference budget phone must make testers want to play again                                                                                      | At least 7 of 10 testers from the target audience start another match without being asked                                                                            | Phase 4                                      |
| 2   | Complete without other people (Suicide Squad, Babylon's Fall, Apex Legends Mobile) | The game against the six kids is the whole game; multiplayer is an extra, and no schedule of new content is promised                                                                                                                     | Every mode that will ship passes Gate 1's test against the kids alone                                                                                                | Phase 6                                      |
| 3   | Nothing money can buy can be staked (India's 2025 real-money ban, Battlefront II)  | Stakeable marbles and furnace ingredients come only from free play; nothing can be traded, gifted or cashed out; for-keeps play stays outside the paywall; the unlock buys content, never better odds, and furnace marbles are keepsakes | A written legal opinion on the 2025 Act and its 2026 Rules, and an answer on registration                                                                            | Phase 6; rechecked after Phases 6–9          |
| 4   | Ship a game, not a roadmap (FAU-G, Anthem, Marvel's Avengers)                      | Launch with one or two polished modes, announce only what has shipped, run no prize tournaments and report problems honestly                                                                                                             | Every feature named in the store listing and announcements is live on launch day                                                                                     | Checked after Phases 7 and 10, and at launch |
| 5   | Honest scope and calendar (Skull and Bones, Duke Nukem Forever, Shenmue)           | Log every design change, re-plan after Phase 2 from the real pace, and meet overruns by cutting scope, starting with furnace depth and extra modes                                                                                       | No phase ends more than 50% over plan without a matching, logged cut                                                                                                 | Every phase                                  |
| 6   | Locked, light technology (Hyenas, Daikatana, Cyberpunk 2077 on old consoles)       | No engine or backend switch; test on the reference phone; load-test the server's turn checks with spending caps set                                                                                                                      | Smooth play on the reference phone at every phase review, and turn checks that hold at 10× the forecast peak                                                         | Every phase; the server test after Phase 6   |
| 7   | Built for the real player (Indus Battle Royale, Concord, Catan: World Explorers)   | Test with the real audience on their own phones, and keep the street rules they remember                                                                                                                                                 | Offered both, most testers choose for keeps, and most who lose a marble ask for a rematch rather than calling it unfair                                              | Phase 6                                      |
| 8   | Demand, not hype (FAU-G, Indus Battle Royale, Apex Legends Mobile)                 | Pre-registrations, nostalgia and launch spikes are reach, not proof that players will stay                                                                                                                                               | Retention of about 25% on day 1, above 4% on day 7 and above 3% on day 30                                                                                            | Full rollout                                 |
| 9   | Stop rules first (Concord, Suicide Squad, XDefiant)                                | Pass marks are written before each test                                                                                                                                                                                                  | Two failed rounds of changes mean reworking the core game or shelving it                                                                                             | Every test                                   |
| 10  | Revenue that lasts (APB, Anthem, Super Mario Run)                                  | Keep fixed costs flat until enough players pay, plan for 1–5% of players buying the unlock, and add paid neighbourhood packs and new platforms over time                                                                                 | A dated break-even target written before launch: at ₹99 and about ₹18,000 a month, about 182 unlocks a month before fees, or about 261 after GST and the store's fee | After Phase 9, and at launch                 |

## Gates by phase

| Phase                       | Must pass before the next phase starts                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0 · Foundations             | 9 (pass marks written), 3 (legal questions sent), 6 (reference phone chosen, stack locked), 5 (phase durations planned) |
| 1 · Physics core            | 6 (a 16-marble break in 20 ms or less on the reference phone), 5                                                        |
| 2 · Rules and modes         | 5 (re-plan from the real pace), 7 (rules match the street game), 6                                                      |
| 3 · Engine and feel         | 1 (the fun test), 9, 6, 5                                                                                               |
| 4 · Marbles and the jar     | 6, 5                                                                                                                    |
| 5 · Neighbourhood kids      | 2, 7, 3 (legal opinion in hand), 9, 6, 5                                                                                |
| 6 · Backend and ledger      | 6 (server load test, spending caps), 10 (fixed costs recorded), 3 (only match results move marbles), 5                  |
| 7 · Social loop             | 4 (shares show only shipped features), 3, 6, 5                                                                          |
| 8 · Glassmaking             | 3 (furnace marbles are keepsakes), 5 (cut furnace depth first), 6                                                       |
| 9 · Unlock and safety       | 3 (the unlock buys content, never odds), 10 (break-even target), 6, 5                                                   |
| 10 · Content, art and audio | 4 (store copy names only shipped features), 6, 5                                                                        |
| 11 · Hardening and launch   | 9, 8 (retention floors before full rollout), 4, 10, 6                                                                   |

## Log

### Phase 0: Foundations (merged before the gates existed)

Phase 0 merged (PR #1) before this gates list reached the repository, so none of its four exit gates was run. They are recorded here as **not run**, not passed, and the owner needs to act on them:

| Gate | Phase 0's part                       | Status                                                                                                                                                          |
| ---- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9    | Pass marks written before tests run  | The ten pass marks above are written down. The KPB pass marks are in `kpb.md`. Phase 3's fun test still needs its exact protocol before it runs                 |
| 3    | Legal questions sent                 | **Not done.** The questions on the 2025 Act and its 2026 Rules are the owner's to send                                                                          |
| 6    | Reference phone chosen, stack locked | **Stack locked** (ADRs 0001–0005). **No reference budget phone chosen.** The owner's OnePlus CPH2467 is mid-range, and the API 30 emulator is not a real device |
| 5    | Phase durations planned              | **Not done.** No phase has a planned duration, so Gate 5 cannot be measured yet                                                                                 |

### Phase 1: Physics core (2026-10-17)

**Gate 6, technology: a 16-marble break in 20 ms or less on the reference budget phone, with the stack unchanged.**

| Check                    | Result                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack unchanged          | ✅ No engine or backend change. No new runtime dependency: pooltool is vendored Python that never runs in CI (ADR-0007)                                                                                                   |
| The break on a phone     | ❌ **29.6 ms median** (24.3 fastest, 31.2 p90, 100 runs) on the owner's OnePlus CPH2467: Snapdragon 695, Android 15, Chrome 155. That is a **mid-range** phone, so a budget phone will be slower. Its hash matches Node's |
| The break on CI hardware | 25.0 ms median on an i7-5600U, against KPB 16's 5 ms. CI's own number is in the `kpb16` artifact of each run                                                                                                              |
| Verdict                  | **FAILED.** By the gate rule, Phase 2 waits until the break is fast enough on the reference phone, or the scope is cut. `handoff/phase-01.md` sets out the options for the owner                                          |
| Owner's decision         | 2026-10-18: optimise further (the handoff's option 1, which was recommended). The owner has no reference budget phone yet, so the gate can't be measured on one and stays open until it is                                |

**A proxy target while there is no reference phone** (written 2026-10-18, before the optimisation). It steers the work; it is not the gate, which is still decided on the reference phone.

- **How it is derived:** the 20 ms is scaled to the machines at hand by single-core Geekbench 6 scores. These are third-party aggregates, approximate, and only a proxy for JavaScript speed:

  | SoC            | Phone                            | Geekbench 6 single-core |
  | -------------- | -------------------------------- | ----------------------- |
  | Snapdragon 695 | The owner's OnePlus CPH2467      | about 905 (894–908)     |
  | Unisoc T606    | Moto G04 (ADR-0002's candidates) | about 372 (365–378)     |
  | Unisoc T612    | realme C61                       | about 421               |
  | Helio G85      | Galaxy F05                       | about 420               |
  | Unisoc T7250   | POCO C71                         | 429–441                 |

  Sources: [NanoReview](https://nanoreview.net/en/soc-compare/unisoc-t606-vs-qualcomm-snapdragon-695), [TopCPU](https://www.topcpu.net/en/soc-r/geekbench-6-single-core), [CPU-Monkey](https://www.cpu-monkey.com/en/compare_cpu-qualcomm_snapdragon_695_5g-vs-unisoc_t606), [Notebookcheck](https://www.notebookcheck.net/Unisoc-T7250-T615-Processor-Benchmarks-and-Specs.929759.0.html), [91mobiles](https://www.91mobiles.com/processor/unisoc-t7250-pdp).

- **The slowest candidate, the T606, is about 2.4× slower** than the Snapdragon 695 (2.37–2.49 across the ranges).
- **The proxy targets** are the break's median:
  - on the OnePlus, 20 ms ÷ 2.4 ≈ **8.2 ms**;
  - on the i7-5600U laptop, 8.2 × 25.0 / 29.6 (the measured laptop-to-phone ratio) ≈ **6.9 ms**.
- **Today** the break takes 29.6 ms and 25.0 ms, so about 3.6× is needed. With a faster candidate (about 420–440), the OnePlus target would be about 9.5 ms.

**Gate 5, scope: log planned versus actual time and every design change; if this phase ran more than 50% over plan, log the matching cut.**

- **Planned:** no duration was set (see Phase 0, Gate 5).
- **Actual:** one working session on 2026-10-17, by the branch's commit times and file timestamps.
- **Over plan:** cannot be measured without a plan. The owner should set planned durations for Phase 2 onwards; the gate's re-plan after Phase 2 is the natural point.
- **Design changes from the approved plan** (`phases/phase-01-plan.md`), each with its ADR:
  1. **Commits are local.** Only the marbles an event involves are re-integrated, which makes results independent of unrelated events and halved the work. Not in the plan (ADR-0006).
  2. **Held contacts use an exact LCP** with relaxation after impacts. The plan said a single frictionless constraint force (ADR-0006).
  3. **Substeps are refined** near Coulomb stops and on curved supports, inside the fixed step (ADR-0006).
  4. **KPB 6 checks tan θ**, under the review's own small-slope model (ADR-0007).
  5. **Cut from v1:** cracks (lowered blocks), and spin friction on curved supports (ADR-0007).
     - The Phase 1 prompt names cracks ("steps, curbs and cracks lower than R"), so leaving them out is a scope cut, not a simplification. It was first logged as settled without asking the owner, then put to the owner as a proposal.
     - **The owner's decision (2026-10-18):** the recommendation was to leave both out of v1 and add cracks in a later `physicsVersion` if Phase 2's courts call for them. The owner replied "go ahead as per recommendations".
     - **What building cracks takes.** A crack is the first court feature that isn't convex.
       - It needs a new support region (the lowered floor), and probes for entering and leaving it across an edge.
       - From the floor, the crack's edges must be strikeable, and from an edge, its floor and other edges.
       - A marble lodged across a narrow crack rests on one edge while held by the other: two edge contacts at once, which no court has exercised yet and which needs its own tests.
       - It also adds feature checks to the per-step path that Gate 6 is waiting on.
     - **Why it was recommended:** no court needs a crack until Phase 2's courts are designed, the performance work for Gate 6 comes first, and v1 stays runnable when a later version adds them.
  6. **pooltool is vendored,** the plan's fallback, because it needs a development panda3d on Linux (ADR-0007).
  7. **e(v) and μBB are fitted jointly,** not one after the other, because each biases the other (ADR-0007).
  8. **KPB 16's wall time is measured outside the test runner.** Coverage instrumentation slows the shot twelvefold, so the timing runs in `scripts/bench.ts`, with a regression ceiling in CI. The suite holds the deterministic substep count (ADR-0006).
  9. **The lab route is Canvas2D,** not Pixi. It is a developer page outside the game (ADR-0007).
  10. **The golden replays were regenerated** before the merge: v1 is frozen at the merge (ADR-0006).
  11. **The KPB 10,000-shot suites run nightly** in their own job, without coverage. The KPB tools' tests also run without coverage.
  12. **The fixes from the 10,000-shot survey change the algorithm:** static contacts are searched per surface; a rounding-rate closing within `gapTol` is not a contact; no impulse step changes the normal speed by less than 1e-12 m/s; a plane-supported marble's separation is removed along the plane; and `DRAG_SIDE` is 3e-4 (ADR-0006, ADR-0007).
  13. **The rim is fitted,** which the plan left for later. `fitRim` fits the hole rim's restitution and friction from the hole shots, as the fourth calibration step, before the finger (ADR-0007).
  14. **The lab overlays the footage itself,** not only its tracked positions. The plan left video out along with filming, but the prompt's lab "overlays tracked real-world footage on the simulation". The overlay is tested on a generated clip; no real footage is involved (ADR-0007).
  15. **The broadphase is the prompt's sort-and-sweep.** Until the retrofit the code searched every pair whose boxes overlapped, an undocumented deviation; outcomes are the same either way (ADR-0006).
