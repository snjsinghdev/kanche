# Kanche — Phase 10: Content, live-ops, art and audio

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-09.md. Work in plan mode first and write docs/phases/phase-10-plan.md.

## Goal
New marbles, courts and events ship without new code, and final art and audio made through MCP servers drop in cleanly.

## Content as data (packages/content; zod schemas, validated in CI)
- Data types:
  - courts: geometry, ring, hole, walls, terrain grid, surface parameters per physicsVersion, decor
  - kids
  - marble series
  - events: dates, modifiers, rewards
  - emotes
  - audio banks
- Bundles are versioned and hashed, served from Supabase Storage or a CDN, and hash-checked by the client.
- Physics-affecting fields are only valid for their physicsVersion.

## Remote config and OTA
- Non-physics remote config and feature flags: event calendar, caps, notification copy, kill switches.
- OTA web-bundle updates through Capgo or an equivalent (ADR-0015), with staged rollout and rollback. Updates are gated by physicsVersion, so none can change physics for a live match.

## Seasonal events (data only)
For example: Diwali sparkle glass, Holi colour swirls, and a monsoon puddle court where wet ground lowers friction.

## Analytics (PostHog or equivalent; ADR-0016)
- Events for the 12-quality metrics: first-shot time, rematch time, share rate, win-it-back rate, D1 and D7 retention, and unlock conversion.
- Child mode is excluded, as Phase 9 requires.

## Art pipeline for MCP-generated assets
- docs/art-bible.md: base resolution 270×480; one locked palette of about 32 colours (marbles use their own genome ramps); light direction; outline rules; a scale table (marble 12–16 px in aim view).
- An asset manifest with ids and sizes, plus naming conventions.
- tools/palette-quantize: nearest colour in OKLab with optional ordered dither; it reports violations.
- tools/atlas-pack.
- CI checks: palette compliance, clean transparent edges, readability at 1×.
- Placeholders swap to final art with no code changes.
- A consistency pass for character portraits across expressions, with a manual touch-up step.

## Audio pipeline
- Sound list: glass clacks by impulse tier and size pair, rolling loops per surface, slide hiss, hole drop, furnace and UI.
- Loudness normalised: target about −16 LUFS integrated and a peak of −1 dBTP or lower (verify the targets).
- A format with broad WebView support (verify; for example AAC .m4a with a fallback).
- Audio sprites for short sounds.
- Re-measure latency on devices.

## Localisation
- English and Hindi with ICU messages.
- Devanagari through a shaping-capable text path: canvas text with a Devanagari font such as Noto Sans Devanagari. Numbers stay in the pixel bitmap font.
- Pseudo-locale tests and a wordless-UI audit.

## Accessibility
Colour-blind-safe marble families, UI scale, reduced motion, haptics and audio toggles, left-hand mode, and screen-reader labels in menus.

## Tests
- Schema validation.
- Bundle hash checks.
- An OTA rollback drill.
- Palette CI on all assets.
- Localisation screenshots.

## Done when
- A new marble series and a new court ship as data only.
- docs/handoff/phase-10.md is written.
- PR "Phase 10 — Content, art and audio" is reviewed.
