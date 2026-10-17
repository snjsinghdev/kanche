## What and why

<!-- One paragraph: the change, the phase it belongs to, and the plan it follows (docs/phases/). -->

## Checks

- [ ] `pnpm verify` passes (typecheck, lint, test, build, budgets)
- [ ] `pnpm e2e` and `pnpm harness` pass when the client or simulation code changed
- [ ] Simulation changes bump `physicsVersion` / `rulesVersion` / `aiVersion` where outcomes can change
- [ ] Every decision has an ADR in `docs/adr/`; the phase handoff note is updated
- [ ] CodeRabbit feedback resolved

## The 12 qualities

Tick each one this PR touches, and say how it holds (or "not affected").

- [ ] 1. Readable in five seconds: 4 of 5 strangers explain a silent 10-second clip.
- [ ] 2. Familiar shape, one twist: the first session ends with a marble won from a kid.
- [ ] 3. Nothing in the way of play: first shot within 30 s of first launch; Android download ≤ 30 MB; offline practice.
- [ ] 4. Cheap, fair failure: hashes match across engines; rematch in ≤ 3 s.
- [ ] 5. Unpredictable rewards: rarity set on the server, rates within targets; nothing purchasable.
- [ ] 6. End high, leave a thread: win-it-back offered after every loss.
- [ ] 7. A sound you recognise: clack ≤ 50 ms after impact on reference devices.
- [ ] 8. It's mine: no two genomes alike; full history on every marble.
- [ ] 9. Stories worth telling: share in ≤ 2 taps.
- [ ] 10. Secrets that need others: no recipe data in the client bundle.
- [ ] 11. Depth, many kinds of fun: difficulty rises steadily across the kid ladder.
- [ ] 12. Generosity: a new marble series ships without an app update.
