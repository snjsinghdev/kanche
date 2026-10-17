# Kanche — Prompt Pack

Twelve copy-paste prompts take Kanche from an empty repo to a production launch, built to pass all 12 qualities.

Exported 17 October 2026 from the Claude Doc "Kanche — Prompt Pack".

## What's in this pack

Each file in `prompts/` holds one phase's prompt, ready to paste into a new Claude Code session. You can also keep the folder in your repo (for example under `docs/prompts/`) and ask Claude Code to follow the phase file.

[MECHANICS-REVIEW.md](MECHANICS-REVIEW.md) grades the physics, lists every fix, and defines the Kanche Physics Benchmark (KPB v1) that Phase 1 must pass.

| Phase | File | Builds | Done when |
| --- | --- | --- | --- |
| 0 · Foundations | [phase-00-foundations.md](prompts/phase-00-foundations.md) | Monorepo, CI, CLAUDE.md files, determinism lint, first ADRs | A fresh clone passes `pnpm verify`; the Android debug build shows the canvas |
| 1 · Physics core | [phase-01-physics-core.md](prompts/phase-01-physics-core.md) | Deterministic glass-on-ground simulation, the Physics Lab and the Kanche Physics Benchmark | Analytic, integrity, determinism and reference suites pass; benchmark scores recorded |
| 2 · Rules and modes | [phase-02-rules-and-modes.md](prompts/phase-02-rules-and-modes.md) | Ring, Hit and Hole; the lag; stakes and transfers | Every staked marble ends with exactly one owner in every test |
| 3 · Engine and feel | [phase-03-engine-and-feel.md](prompts/phase-03-engine-and-feel.md) | Rendering, camera, flick input, audio, haptics, effects | Silent-clip test passes; 30 fps p95 on a low-end Android |
| 4 · Marbles and the jar | [phase-04-marbles-and-the-jar.md](prompts/phase-04-marbles-and-the-jar.md) | Genome, glass shader, jar, passport | The same seed draws the same marble everywhere; the jar holds 60 fps |
| 5 · Neighbourhood kids | [phase-05-neighbourhood-kids.md](prompts/phase-05-neighbourhood-kids.md) | Six AI personalities, the ladder, offline practice, pass-and-play | Ladder difficulty rises steadily in simulated matches |
| 6 · Backend and ledger | [phase-06-backend-and-ledger.md](prompts/phase-06-backend-and-ledger.md) | Accounts, the marble ledger, server-checked turns | Ledger invariants hold under concurrency tests |
| 7 · Social loop | [phase-07-social-loop.md](prompts/phase-07-social-loop.md) | Challenges, win it back, share cards, replay links | A WhatsApp link plays in the browser and converts to for-keeps |
| 8 · Glassmaking | [phase-08-glassmaking.md](prompts/phase-08-glassmaking.md) | Furnace minigame, server recipes, discovery journal | No recipe data ships to the client |
| 9 · Unlock and safety | [phase-09-unlock-and-safety.md](prompts/phase-09-unlock-and-safety.md) | Purchase, child mode, anti-farming, compliance | Purchase, restore and child-mode gates pass |
| 10 · Content, art and audio | [phase-10-content-art-and-audio.md](prompts/phase-10-content-art-and-audio.md) | Content as data, OTA, asset pipelines, localisation | A new marble series ships without an app update |
| 11 · Hardening and launch | [phase-11-hardening-and-launch.md](prompts/phase-11-hardening-and-launch.md) | Performance, security, load, store, rollout | Every quality gate re-run and recorded |

## How to use this pack

Run one prompt per phase, in order, each in a fresh Claude Code session. Phase 0 writes the CLAUDE.md files that carry the rules every later prompt depends on, so later prompts stay short and consistent.

- **Start in plan mode.** Each prompt has Claude Code read the repo rules, the ADRs and the last handoff note, then write a plan before touching code.
- **End with a pull request.** Every phase finishes with green tests, new ADRs, a handoff note and a PR reviewed by CodeRabbit; Playwright covers QA.
- **Keep the order.** Physics (Phase 1) and rules (Phase 2) are shared by the phone, the AI and the server, so everything after them depends on their exact behaviour.
- **Verify before trusting.** The prompts name current tools, and each one tells the agent to check current docs and pin versions, because APIs and limits change.
- **Hold the gate.** If a phase misses its gate, fix it before moving on, because later phases assume it holds.

## Architecture at a glance

One deterministic TypeScript core runs on the phone, in the browser and on the server, so a shot always resolves the same way.

```text
                              shot inputs, challenges, claims
             +---------------------------------------------------------------+
             |                                                               v
+------------------------+      +------------------------+      +------------------------+
| Phone and web app      |      | Shared TypeScript core |      | Supabase backend       |
|                        |      |                        |      |                        |
| PixiJS renderer        |----->| physics                |<-----| Edge Functions         |
| Game app               |      | rules                  |      | Postgres               |
| AI worker              |      | marble-gen             |      | Auth                   |
|                        |      | protocol               |      |                        |
+------------------------+      +------------------------+      +------------------------+
Services: FCM push · RevenueCat unlock · Sentry · PostHog · OTA updates
```

The side arrows mean "imports": the app and the backend both use the shared core. The app sends only shot inputs; the server re-runs each shot with the same core before any marble changes hands.

## Stack decisions: the least-worst choices

Each choice wins on the trade-off that matters most for a solo builder shipping to low-end Android phones in India.

| Area | Choice | Why | Trade-off accepted |
| --- | --- | --- | --- |
| Code layout | pnpm + Turborepo monorepo, strict TypeScript | One language from physics to server, with shared packages | Monorepo tooling to learn |
| Renderer | PixiJS (current major) on WebGL | Fast 2D batching and custom shaders for glass | You build your own scene and UI glue |
| App shells | Capacitor for Android and iOS, plus the web build | One codebase; a WhatsApp link can play instantly in the browser | WebView performance and audio latency must be measured |
| Physics | Custom sphere-on-ground simulation | Real sliding, rolling, spin and friction; generic 2D engines fake these with damping | More code, so it is tested against textbook results, filmed reality and a reference simulator |
| Determinism | Plain double maths without transcendental functions; seeded randomness; integer inputs | Same shot, same result in V8, JavaScriptCore and SpiderMonkey | No sin, cos or exp inside the sim; lookup tables instead |
| Backend | Supabase: Postgres, Auth, Edge Functions | Transactions for the marble ledger; Edge Functions run the same TypeScript physics | Vendor coupling, limited by plain SQL and portable functions |
| Multiplayer | Asynchronous turns, validated by the server | Fits patchy mobile data and WhatsApp-paced play; no real-time servers | No live duels in v1 |
| AI kids | Physics-search AI in a Web Worker; the server runs it in for-keeps matches | Kids play like people, and stake matches can't be faked offline | For-keeps matches against kids need a connection |
| Audio | Web Audio driven by collision impulses | Every clack matches the real hit | Native fallback if Android latency misses the target |
| Unlock | One non-consumable purchase via RevenueCat or the current maintained plugin | Receipts and restores handled; entitlements sync to the account | A fee above a revenue threshold (check current pricing) |
| Updates | OTA web-bundle updates gated by physics version | Fixes and content ship fast | Live matches stay on the physics version they started with |
| Observability | Sentry for errors, PostHog for product metrics | Crash and quality metrics from day one | Child mode limits analytics by design |

## Physics: the laws behind the feel

Every shot is simulated with textbook rigid-body physics for glass spheres on real ground, so the feel comes from the laws, not from tuning tricks.

| Effect | Law used | What the player feels |
| --- | --- | --- |
| Slide, then roll | Friction at the contact couples speed and spin; slip shrinks at (7/2)·μₛ·g | A hard flick skids, then grips and rolls on |
| Settling speed | Rolling starts at (5v₀ + 2Rω₀)/7, so a spinless slide keeps 5/7 of its speed | Rough ground eats a hard flick; topspin keeps it running |
| Rolling resistance and air drag | Deceleration μᵣ·g per surface, plus quadratic air drag | Dirt stops marbles short, tile lets them run, and long rolls fade a little sooner |
| The flick | The thumb strikes the marble: the impulse comes from finger speed, finger mass and contact offset | A bigger shooter leaves slower but hits harder; striking too far off-centre slips |
| Spin | An off-centre strike adds spin: ω = (r × J)/I | Backspin makes the shooter stick after a hit; topspin follows through |
| Collisions | One impulse solve with the ground in the loop: friction at every contact and Stronge's energetic restitution | Clean clacks, throw on cut shots, spin carried into the next roll, and never energy from nowhere |
| Unequal sizes | A true 3D contact: an 11 mm shooter meets an 8 mm marble 9.1° below horizontal | A hard hit with a big shooter makes it hop a millimetre or two |
| Mass and size | m = ρ·(4/3)·π·R³ and I = (2/5)·m·R², glass at 2,500 kg/m³ | A bigger shooter carries more momentum but is harder to stop |
| Slopes | A rolling sphere accelerates at (5/7)·g·sinθ | Each court has small drifts you can learn |
| Walls and edges | Restitution and friction at walls; true contact normals on edges lower than the marble | Bank shots off the gully wall; marbles climb or hop low curbs and cracks |
| The hole | Three contact regions: the ground, a rounded rim and the pit | Lip-outs, rim rolls and clean drops, all from the same physics |

Every model is held to the Kanche Physics Benchmark (KPB v1): exact textbook results such as the 5/7 settling speed and the 33.7° rolling half-ball deflection, filmed reality on five surfaces, a reference simulator, an energy ledger and identical replays across engines. Friction, restitution and drag start as placeholders and are calibrated from 240 fps footage of real marbles. The review and the benchmark are in [MECHANICS-REVIEW.md](MECHANICS-REVIEW.md).

## The 12 qualities, traced

Each quality has a feature that delivers it, a gate that measures it, and the phases that build it.

| # | Quality | How Kanche delivers it | Gate | Phase |
| --- | --- | --- | --- | --- |
| 1 | Readable in five seconds | Top-down ring, one glowing shooter, a short aim line, no words | 4 of 5 strangers explain a silent 10-second clip | 3, 10 |
| 2 | Familiar shape, one twist | Street marbles everyone knows, played for keeps with marbles that carry their history | The first session ends with a marble won from a kid | 2, 5 |
| 3 | Nothing in the way of play | No sign-up, offline practice, links that play in the browser | First shot within 30 s of first launch; Android download ≤ 30 MB | 0, 5, 7 |
| 4 | Cheap, fair failure | Deterministic physics: same input, same result on every device | Hashes match across engines; rematch in ≤ 3 s | 1, 3 |
| 5 | Unpredictable rewards | Unique marbles from kids, events and the furnace; rarity set on the server | Rarity rates within targets; nothing purchasable | 4, 8 |
| 6 | End high, leave a thread | Won marbles fly into your jar; a lost marble shows who has it, with a win-it-back button | Win-it-back offered after every loss; ≥ 30% accepted (hypothesis) | 5, 7 |
| 7 | A sound you recognize | Clacks, rolls and slide hiss driven by real impulses | Clack ≤ 50 ms after impact on reference devices | 3, 10 |
| 8 | It's mine | Every marble unique, nameable and protectable, with a passport | No two genomes alike; full history on every marble | 4, 6 |
| 9 | Stories worth telling | Share cards and replay links sized for WhatsApp | Share in ≤ 2 taps; ≥ 5% of matches shared (hypothesis) | 7 |
| 10 | Secrets that need others | Furnace recipes kept on the server, court drifts, trick shots | No recipe data in the client bundle (CI check) | 5, 8 |
| 11 | Depth, many kinds of fun | Three modes, spin, shooter sizes, collecting, crafting, rivalries | Difficulty rises steadily across the kid ladder | 2, 5, 8 |
| 12 | Generosity (room for free updates) | Courts, marble series and events as data; OTA updates | A new marble series ships without an app update | 10 |

## Non-negotiables

These rules hold in every phase; Phase 0 writes them into CLAUDE.md.

- **Determinism.** Simulation code uses only basic arithmetic and square roots, seeded randomness and integer inputs; lint enforces it.
- **The server owns marbles.** Clients never write ownership; every change is an append-only ledger event made in one transaction.
- **No money near marbles.** Marbles, glass rods and furnace fuel are never sold, traded for money or won through paid randomness.
- **Wordless first.** Every core action reads without text, and chat is preset emotes only.
- **Fair by construction.** The same input gives the same result on every device, and kids never cheat.
- **Budgets are tests.** Download size, frame rate, memory and start-up time are checked before merge.
- **Children are protected.** Child mode limits data, stakes and notifications, and DPDP compliance is reviewed with counsel.
- **Every decision leaves a trail.** ADRs for choices, a handoff note per phase, and a PR reviewed by CodeRabbit.
