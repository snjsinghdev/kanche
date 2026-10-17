---
status: accepted
date: 2026-10-17
decision-makers: owner (approved the Phase 0 plan and the app ID), agent
consulted: Capacitor SystemBars docs; Fuselings ADR-0013 (WebView floor, measured on the same emulators); Phase 0 measurements on fuselings_low_api30
informed: Phase 3 (engine and feel), Phase 7 (browser play), Phase 11 (store)
---

# PixiJS 8 + Vite 8 + Capacitor 8, with a 270×480 integer-first canvas

## Context and problem statement

Kanche is pixel art on low-end Android phones in India. It must also play instantly in a browser from a WhatsApp link, and later ship to iOS. One codebase has to render fast 2D with custom glass shaders, fit portrait screens from 720×1280 to 1440×3200 with notches and gesture bars, and stay within a 30 MB download.

## Decision drivers

- 2D batching speed and custom shaders on weak GPUs
- One codebase for Android, iOS and the web link
- Crisp pixel art at any screen size, inside the safe area
- Small initial download for link play

## Considered options

- **PixiJS 8 + Vite 8 + Capacitor 8**
- Phaser 4 (a full game framework) + Capacitor
- Godot 4 exported to web and Android
- React Native + Skia, plus a separate web build

## Decision outcome

Chosen option: **PixiJS 8.22.0 on WebGL, built by Vite 8.3.4, shipped by Capacitor 8.5.3** (android and ios), plus the same web build.

- PixiJS gives fast batching and custom shaders without imposing a game architecture. That matters because the simulation, rules and AI are our own shared packages.
- Capacitor wraps the same bundle for both stores.
- The web build is the WhatsApp-link player.

What else is decided:

- **Fixed portrait base of 270×480 game pixels** (9:16). The canvas size comes from the pure function `computeViewport()` (`apps/client/src/viewport.ts`):
  - The usable area is the window minus the safe-area insets (`env(safe-area-inset-*)` and Capacitor's `--safe-area-inset-*`).
  - `fit` = device pixels per game pixel that fit.
  - **Integer mode** applies when ⌊fit⌋ ≥ 1 and ⌊fit⌋/fit ≥ 0.9: the scale is ⌊fit⌋, `image-rendering: pixelated`, and every game pixel is a whole k×k block.
  - **Sharp mode** applies otherwise: render at ⌈fit⌉ (nearest-neighbour) and let the browser downscale smoothly to `fit` (sharp bilinear).
  - The canvas corner is snapped to a whole device pixel.

  On a 720×1280 phone, integer 2× would fill only 84% of the height. The game uses sharp 2.37× instead, measured on the emulator as `{mode: sharp, scale: 2.3667, resolution: 3}` with insets of 24 and 48 CSS px (`docs/evidence/phase-00/`). A 1080×2400 phone gets crisp 4×.

- **Pixel-art defaults:** `TextureSource.defaultOptions.scaleMode = 'nearest'`, `roundPixels: true` and `antialias: false`.
- **Rendering on demand** (`autoStart: false`) while the scene is static. Phase 3 adds the frame loop.
- **The browser floor is pinned** in `vite.config.ts` at Vite 8's default: `chrome111`, `edge111`, `firefox114`, `safari16.4`, `ios16.4`. Android WebViews below 111 show a blank page (Fuselings measured this on stock API 30: WebView 83). A feature-detecting "update your WebView" page is a Phase 11 item.
- **Edge-to-edge on Android:**
  - `MainActivity` calls `EdgeToEdge.enable(this)` before `super.onCreate`, as Capacitor 8's SystemBars docs advise when `insetsHandling` isn't `disable`. Capacitor 9 makes this automatic.
  - `SystemBars` uses `insetsHandling: 'css'`, so WebViews below 140 still get the insets as CSS variables.
  - `style: 'DARK'` gives light icons over the dark letterbox.
- **The app ID `com.jupiterlabtech.kanche.dev` is a placeholder.** The store ID is chosen in Phase 11 and is permanent after the first upload.
- **The test hook** `window.__kanche` (viewport, versions, pixel sampling) is included only in non-production modes (`e2e`, `debug`, dev), and is lazy-loaded.
- **iOS** uses Capacitor 8's Swift Package Manager project. Linux can't build it, so the `ios-simulator` job (`ios.yml`, `macos-26`) builds it unsigned, on demand. macOS minutes count 10× (ADR-0001).
- **Source maps** are `hidden`: generated for crash symbolication (Phase 11) but not referenced by the bundle.

### Consequences

- Good, because the whole game stays in TypeScript and the web build is the link player.
- Good, because the Phase 0 initial JS is 131.9 KiB gzip and the debug APK is 4.74 MiB. That leaves room in the 30 MB budget for art and audio.
- Bad, because WebView performance and audio latency must be measured, not assumed (Phase 3: 30 fps p95, clack ≤ 50 ms). A native audio fallback is the escape hatch.
- Bad, because the scene graph, UI glue and input are ours to build. Phaser would have given them.

### Confirmation

- Unit and property tests for `computeViewport` (`apps/client/test/viewport.test.ts`): the canvas fits inside the safe area, keeps 9:16, is integer whenever that fills ≥ 90%, and sits on whole device pixels.
- Playwright e2e on Chromium, WebKit (at DPR 2) and Firefox: the scale, the backing size, the sampled pixels, relayout on resize, and no words on the page.
- The debug APK runs on the low-end emulator and the owner's phone, with screenshots in `docs/evidence/phase-00/`.

## Pros and cons of the options

### Phaser 4

- Good, because it has scenes, input, tweens and audio built in.
- Bad, because it's larger, and its own loop and physics fight a deterministic external simulation.

### Godot 4

- Good, because it has a strong editor and native exports.
- Bad, because its web export is heavy for instant link play, the core would be GDScript or C# rather than shared TypeScript, and the server couldn't reuse it.

### React Native + Skia

- Good, because it's native and fast.
- Bad, because the web link player would be a second codebase, and there's no shared physics with a Deno server without bridging.

## More information

Revisit when a low-end device misses 30 fps p95 or 50 ms audio (Phase 3), when Capacitor 9 ships (remove the `EdgeToEdge` call), or when store data shows real users below WebView 111.
