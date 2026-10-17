# Kanche — Phase 3: Engine and feel

You are the lead engineer for Kanche. Read CLAUDE.md (root and apps/client), docs/ARCHITECTURE.md, every ADR, docs/physics.md, docs/rules.md and docs/handoff/phase-02.md. Work in plan mode first and write docs/phases/phase-03-plan.md.

## Goal
Make a shot feel real on a phone. Rendering, camera, input, audio, haptics and effects are all driven by physics events. Use placeholder art drawn in code; final art arrives in Phase 10.

## App shell
- Vite + PixiJS + TypeScript, one canvas.
- Scene manager: boot, onboarding, match, jar, results.
- Pixel-art base resolution 270×480 portrait.
- Integer-first scaling plus a pixel-art sampling shader (texel snapping smoothed with fwidth), so zoom and sub-pixel motion never shimmer.
- Handle safe areas and notches.

## Shot playback, not live stepping
- On release, simulate the whole shot with packages/physics.
- Play the recorded timeline at the display rate (60, 90 or 120 Hz), interpolating with the same cubic Hermite curves the simulation uses.
- This gives exact replays, slow motion on decisive hits and instant replays without re-simulating.

## Scale and camera
- Choose world-to-pixel scales so a 16 mm marble is at least 12 base pixels while aiming and at least 4 in the whole-ring view. Record the choice in an ADR.
- Aim mode frames the shooter, the aim line and likely targets, with pinch zoom from 1× to 3×.
- Follow mode reads ahead in the timeline, so the camera arrives before the action.
- Result mode shows the whole ring.
- Motion is spring-damped, never cuts mid-shot and respects reduced motion.

## The flick
- Knuckle down: touch near the shooter and drag back to aim; the shot goes opposite the drag.
- Drag length sets finger speed through a tunable curve; packages/physics turns finger speed and contact offset into marble speed and spin. Release to shoot; drag back to the start to cancel.
- Spin: a small marble widget. Tap or drag its top, bottom or sides to set a continuous offset.
- Quantize everything to the integer input format before simulating, and show the raw values in a debug overlay.
- Aim aid: a short guide line only, with no collision prediction. Practice mode may lengthen it.

## Placeholder marbles
- Circles with a highlight, a contact shadow and a small caustic spot: a light patch on the ground, tinted by the marble, opposite the light.
- The interface must accept the Phase 4 glass shader without changes.
- Orientation is visual only: integrate each marble's rotation in the renderer from the timeline's angular velocity (trigonometry is fine here, outside the simulation).
- When a marble hops, lift it off its shadow.

## Audio (Web Audio)
- A voice pool and a mixer with ducking. Unlock audio on the first gesture.
- Collision clacks: gain from the impulse; click length and brightness from the Hertz contact time, which scales with impact speed to the power −1/5; pitch from the two marble sizes and the surface.
- A rolling loop per moving marble: gain follows speed, and a low-pass filter follows the surface's roughness.
- A slide hiss while slip is above a threshold, so players can hear spin.
- A hole-drop sound.
- Procedural placeholder sounds for now.
- A latency probe that measures impact-to-sound time on device. Target: 50 ms or less. If Android WebViews miss it, write an ADR for a native audio fallback.

## Haptics and effects
- Haptics through Capacitor Haptics: tiers mapped from impulse, with a settings toggle.
- Dust puffs by surface, a tink flash scaled by impulse, an out-of-ring celebration, and screen shake of at most 2 px on big hits (off in reduced motion).
- Instant replay: a 2-second replay button with trails and slow motion.

## Performance
- 60 fps on mid-range phones, and at least 30 fps p95 on a low-end Android reference device, with 16 marbles plus effects.
- GPU texture memory of 64 MB or less.
- No garbage-collection pause over 4 ms during shots; use object pools.

## Accessibility hooks
Left-handed mirrored UI, reduced motion, haptics and audio toggles, and cues that never rely on colour alone.

## Tests
- Unit tests: input quantization, camera framing, audio parameter mapping.
- Playwright: render a deterministic replay and screenshot-diff key frames.
- A device checklist for a low-end Android and an older iPhone.

## Quality gates
- Q1: record a silent 10-second clip; at least 4 of 5 people who have never seen the game can explain the goal.
- Q4: a rematch starts in 3 s or less.
- Q7: record the measured clack latency in the handoff note.

## Done when
- Gates and budgets are met, or each gap is documented with a fix plan.
- docs/handoff/phase-03.md is written.
- PR "Phase 03 — Engine and feel" is reviewed.
