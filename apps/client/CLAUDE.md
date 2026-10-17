# apps/client

The Kanche app: Vite + PixiJS (WebGL), shipped to Android and iOS by Capacitor and to the web as a WhatsApp-link player (ADR-0002).

## Local rules

- **270×480 portrait base.** The game draws in game pixels. `src/viewport.ts` places it: integer scale when that fills at least 90% of the screen, otherwise "sharp" (render at ⌈fit⌉ and downscale), always inside the safe area. Textures use `nearest` scaling and `roundPixels`.
- **Safe areas.** `src/safe-area.ts` reads `env(safe-area-inset-*)` and Capacitor's `--safe-area-inset-*`. `MainActivity` enables edge-to-edge.
- **Wordless first.** No text in the game UI. Every core action reads without words; chat is preset emotes. The page body has no text (an e2e test checks).
- **Budgets are tests** (`budgets.json`): initial JS gzip, art, audio, and the Android download of 30 MB or less. Lazy-load what the first shot doesn't need. Avoid per-frame allocations. The target is 30 fps p95 on a low-end Android phone (Phase 3).
- **Accessibility.** Large thumb targets, reduced motion respected, colour never the only signal, and an accessible name on the canvas.
- **Never write marble ownership.** The client sends shot inputs; the server decides.
- **The browser floor is pinned** in `vite.config.ts` (`chrome111`, `safari16.4`). Moving it needs an ADR.
- **The test hook** `window.__kanche` exists only in non-production modes (`e2e`, `debug`, dev).
- **The Physics Lab** (`lab.html`, `src/lab/`) is a developer page, not game UI, so words are allowed there.
  - It is built only in non-production modes (`vite.config.ts` lists it as an input outside `production`), and the production bundle stays byte-identical without it.
  - It imports `@kanche/kpb/tracker` for the Tracker overlay.
  - Its hook is `window.__kancheLab`, including `bench(runs)`, which times KPB 16 in whatever browser loads it, a phone's included.

## Commands

- `pnpm dev`, `pnpm build` (production), `pnpm e2e` (builds `--mode e2e` into `dist-e2e`, then Playwright on three engines).
- `pnpm android:debug` builds `--mode debug`, runs `cap sync`, then `gradlew assembleDebug`. Install with `adb -s <serial> install -r android/app/build/outputs/apk/debug/app-debug.apk` (`docs/setup.md`).
- `pnpm ios:sync` syncs the iOS project. iOS builds need macOS. CI's `ios.yml` builds for the simulator on demand: label the PR `ios`.
- `android/` and `ios/` are committed native projects. Edit them by hand only for native settings, and record why.
