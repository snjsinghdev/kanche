# The 12 qualities and their gates

Every phase is built to these. The PR template carries them as a checklist, and the README in `docs/prompt-pack/` traces each one to the phases that deliver it.

1. **Readable in five seconds:** 4 of 5 strangers explain a silent 10-second clip.
2. **Familiar shape, one twist:** the first session ends with a marble won from a kid.
3. **Nothing in the way of play:** first shot within 30 s of first launch; Android download ≤ 30 MB; offline practice.
4. **Cheap, fair failure:** hashes match across engines; rematch in ≤ 3 s.
5. **Unpredictable rewards:** rarity set on the server, rates within targets; nothing purchasable.
6. **End high, leave a thread:** win-it-back offered after every loss.
7. **A sound you recognise:** clack ≤ 50 ms after impact on reference devices.
8. **It's mine:** no two genomes alike; full history on every marble.
9. **Stories worth telling:** share in ≤ 2 taps.
10. **Secrets that need others:** no recipe data in the client bundle.
11. **Depth, many kinds of fun:** difficulty rises steadily across the kid ladder.
12. **Generosity:** a new marble series ships without an app update.

## Where Phase 0 stands

| #   | Gate                         | Phase 0 contribution                                                                                                         |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 3   | Android download ≤ 30 MB     | `budgets.json` `android.downloadBytes`; CI's `android-debug` job fails over budget. Debug APK: 4.74 MiB.                     |
| 4   | Hashes match across engines  | `pnpm harness` and the CI `determinism` job: Node, Deno, Chromium, WebKit and Firefox agree on 1,000 seeds (10,000 nightly). |
| 1   | Reads without words          | The canvas has no text, and an e2e test asserts an empty page body.                                                          |
| 10  | No recipe data in the client | Not yet: the CI check that scans the bundle arrives in Phase 8.                                                              |
