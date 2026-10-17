# Phase gates

Ten tests that each phase must pass before the next one starts. They come from the prompt pack's "Phase gates" (exported 17 October 2026), drawn from the costliest game disasters.

- **A failed gate means fixing the problem or cutting scope, never pushing on.** No phase starts until the previous phase's exit gates below have passed (CLAUDE.md).
- **Gates 5 and 6 are checked at the end of every phase.**
- **Pass marks are written before any test runs** (Gate 9).
- **The owner runs the playtests and gets the legal opinion.** Claude Code prepares the builds, scripts and logging, then stops until the result is recorded here.
- **Testers under 18 take part only with a parent's consent.**

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

## Pass marks (Gate 9)

Drafted by the agent on 2026-10-17, **for the owner to confirm or change before any of these tests runs**. Once a test has run against a pass mark, that mark is not changed for that round.

**The stop rule, for every test below.** A round is one set of changes followed by a re-test. After **two failed rounds**, stop: decide here between reworking the core game and shelving it, and record the decision before any more work.

**Gate 1: prove the fun first.**

- **Build:** the art-free flick-and-capture build from Phase 3, on the reference budget phone (ADR-0002).
- **Testers:** 10 people from the target audience, recruited for the session. Each plays one match.
- **Measure:** after a tester's first match ends, the facilitator says nothing for 60 seconds. A tester counts if they start another match within that minute, unprompted.
- **Pass:** at least 7 of 10.

**Gate 2: complete without other people.**

- **Measure:** for every mode that will ship, the Gate 1 test, played against the neighbourhood kids alone, with no other human in the match.
- **Pass:** at least 7 of 10, in every mode.

**Gate 7: built for the real player.**

- **Testers:** 10 people from the target audience, on their own phones. Each chooses between a for-keeps match and a friendly match before playing.
- **Pass, both of:**
  - at least 6 of 10 choose for keeps;
  - of the testers who lose a marble, more than half ask for a rematch rather than calling the result unfair.
- **Recording:** the facilitator records each loser's first reaction as either a rematch request or a complaint ("unfair", "rigged", "random", or similar).

**Gate 8: demand, not hype.**

- **Cohort:** every install in the first 28 days of the soft launch, with at least 1,000 installs. A smaller cohort is recorded as "not measured", not as a pass.
- **Pass, all three:**
  - day-1 retention at least 25%;
  - day-7 above 4%;
  - day-30 above 3%.

The KPB pass marks for the physics (Phase 1) are written in `kpb.md`.

## Planned durations (Gate 5)

Proposed by the agent on 2026-10-17, **for the owner to confirm**. They are re-planned after Phase 2 from the real pace (Gate 5).

**What a day means.** One agent day is one long Claude Code working session, the pace at which Phases 0 and 1 were built. The owner's tasks run in calendar time alongside.

**The overrun rule.** A phase that ends more than 50% over its agent days needs a matching cut, logged below, starting with furnace depth and extra modes.

| Phase                       | Agent days | Owner's part, in calendar time                                                                       |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| 0 · Foundations             | done       | Built before durations existed                                                                       |
| 0 · Gates retrofit          | 1          | Send the legal questions; choose and buy the reference phone; confirm these pass marks and durations |
| 1 · Physics core            | done, +2   | The +2 is the Gate 6 work, which needs the reference phone                                           |
| 2 · Rules and modes         | 2          | Check the rules against the street game (Gate 7's `docs/rules.md`)                                   |
| 3 · Engine and feel         | 4          | The fun test (Gate 1): recruit and run 10 testers, about 2 weeks                                     |
| 4 · Marbles and the jar     | 3          | –                                                                                                    |
| 5 · Neighbourhood kids      | 4          | Gate 2 and Gate 7 playtests, about 2 weeks; the legal opinion in hand (Gate 3)                       |
| 6 · Backend and ledger      | 5          | A hosted Supabase project; the load test's spending caps                                             |
| 7 · Social loop             | 3          | Share-link tests on WhatsApp                                                                         |
| 8 · Glassmaking             | 3          | –                                                                                                    |
| 9 · Unlock and safety       | 4          | Store accounts and purchase testing                                                                  |
| 10 · Content, art and audio | 8          | Art direction; the expert panel, blind comparison and authenticity review; about 6 weeks             |
| 11 · Hardening and launch   | 6          | The soft launch: 28 days or more for Gate 8's cohort                                                 |

## Log

One row per gate check, newest last. Results are **passed**, **failed**, **open** (not yet testable, or waiting on the owner) or **not run**.

| Date       | Phase | Gate | Evidence                                                                                              | Result                   |
| ---------- | ----- | ---- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| 2026-10-17 | 0     | 9    | Pass marks for Gates 1, 2, 7 and 8, and the stop rule, written above before any test                  | open: the owner confirms |
| 2026-10-17 | 0     | 3    | `docs/legal/questions.md` drafted for an Indian lawyer                                                | open: the owner sends it |
| 2026-10-17 | 0     | 6    | Stack locked (ADRs 0001–0005). Reference budget phone not chosen; candidates and criteria in ADR-0002 | open: the owner chooses  |
| 2026-10-17 | 0     | 5    | Durations proposed above                                                                              | open: the owner confirms |

Phase 0 merged (PR #1) before this gates list existed. Its exit gates are being retrofitted on `phase-00-gates`. Phase 1 (`phase-01-physics-core`, PR #2) was built before they passed, and stays a draft until they do and its own Gate 6 passes.

## Where the gates come from

Each gate answers a cause shared by the ten costliest disasters studied: Concord, Suicide Squad: Kill the Justice League, Skull and Bones, Marathon, Anthem, Kingdoms of Amalur, APB, Hyenas, Apex Legends Mobile, and Indus Battle Royale with FAU-G. Each spent heavily before proving that the game was fun, that its audience existed and that its business model fit, and then shipped despite the warnings. Games that recovered from bad launches, such as No Man's Sky and Cyberpunk 2077, had players worth winning back and an owner who kept paying for fixes. The full analysis is in the report "Why big budget games fail".
