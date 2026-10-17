# Kanche — Phase 9: Unlock, safety and compliance

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR and docs/handoff/phase-08.md. Work in plan mode first and write docs/phases/phase-09-plan.md. Check current store policies and pricing before deciding.

## Goal
One honest purchase, and a game that is safe for children and fair for everyone.

## The unlock
- One non-consumable product, "Full unlock": the rooftop and seasonal courts, kids 5 and 6, and glassmaking.
- Choose RevenueCat's Capacitor SDK or the current maintained native IAP plugin, and record the choice with pricing in ADR-0014.
- Purchase, restore and receipt validation.
- A server webhook writes the entitlements table. The client keeps a signed cache for offline use.
- Web: no purchase in v1, but account entitlements apply on the web.
- Guest pass: a free player invited by an unlocked friend can play that match on a locked court.
- Never sell marbles, rods, fuel or randomness. No ads and no ad SDKs in v1.

## Children
- A wordless-friendly age gate at first launch.
- Child mode (under 18):
  - no behavioural analytics or tracking
  - no marketing notifications
  - account linking only after verifiable parental consent
  - tighter stake caps
- Write docs/compliance/dpdp.md covering the data processed, purpose, retention and consent flows under India's DPDP Act and its current rules. Flag every item for legal review.
- Decide the target age rating and whether Google Play's Families policy applies (ADR).
- In-app and web account deletion.
- Privacy policy and terms pages. Prepare the Data safety and App Privacy forms.

## Anti-farming and abuse
- Device attestation (Play Integrity, App Attest) is required to mint starter jars and to stake.
- Per-device and per-account caps, and bound starter marbles.
- Velocity and collusion checks on transfers between the same accounts.
- Automated flags with a review queue.
- Stake caps by account age, plus block and report.
- Name filters for Hindi, English and Hinglish, with transliteration-aware matching.

## Real-money boundary
- No trading for money and no cash-out.
- Terms forbid selling accounts or marbles.
- Detection signals for marketplace abuse.

## Security review
OWASP MASVS L1 checklist, an RLS audit, secrets rotation and a dependency audit in CI.

## Tests
- Sandbox purchases and restore.
- Entitlement sync.
- Child-mode gates.
- Attestation failure paths.
- Simulated alt-account farming and collusion.
- RLS penetration tests.

## Done when
- All tests pass.
- docs/handoff/phase-09.md lists the open legal items.
- PR "Phase 09 — Unlock and safety" is reviewed.
