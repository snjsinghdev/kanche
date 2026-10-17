# Kanche — Phase 7: The social loop

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-06.md. Work in plan mode first and write docs/phases/phase-07-plan.md.

## Goal
Challenges, win-it-back and stories that spread through WhatsApp, with links that play instantly even without the app.

## Challenge links
- Share through the native share sheet (Capacitor Share; Web Share on the web) with a pre-rendered card image and a short link.
- Android App Links and iOS Universal Links open the app.
- Without the app, the link opens the web build and starts playing at once, as a guest in a friendly match. For-keeps unlocks once the guest links an account, within the Phase 9 caps.

## Win it back
- After a loss, the results screen shows exactly who now holds your marble, with a one-tap win-it-back challenge.
- The challenge pre-fills a Hit or Ring match and asks for that marble as the holder's stake. The holder decides whether to stake it and gets a gentle reminder.
- Both players are notified, and the passport records the rematch.
- The same flow works when a kid holds your marble.

## Share cards
- Three cards: marble passport, match result (for example "captured 4") and trick shot.
- Rendered on the client (PixiJS extract to PNG) and wordless first.
- Sized for WhatsApp chats and Status, and for Reels covers. Each carries a short link.

## Replay links
- Store a replay (seed, versions, inputs) on the server under a short code.
- The web replay viewer, which is the same client in replay mode, plays it instantly with slow motion and trails.
- Add a "watch my shot" share.

## Social basics
- Preset wordless emotes in matches, with mute and block. No free text anywhere.
- Recent opponents and rematch buttons. No contact upload.
- Profile: a preset avatar, a filtered display name, jar highlights and simple stats.

## Tests
- Playwright end to end: link → web guest play → account link → for-keeps match.
- Deep-link routing on real devices.
- Screenshot tests for share cards.
- Notification flows with a mocked FCM.

## Quality gates
- Q9: share in 2 taps or fewer.
- Q6: win-it-back is offered after every loss.
- Q3: the first shot from a link lands in under 10 s on 4G.
- Q1: cards read without words.

## Done when
- Gates pass.
- docs/handoff/phase-07.md is written.
- PR "Phase 07 — Social loop" is reviewed.
