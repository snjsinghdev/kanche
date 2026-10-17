# Kanche — Phase 6: Backend and the marble ledger

You are the lead engineer for Kanche. Read CLAUDE.md (root and supabase), docs/ARCHITECTURE.md, every ADR, docs/rules.md and docs/handoff/phase-05.md. Work in plan mode first and write docs/phases/phase-06-plan.md. Before designing, check current Supabase docs for Edge Function CPU and time limits, available regions and anonymous auth.

## Goal
Accounts, a tamper-proof marble ledger, and server-validated for-keeps matches against friends and kids.

## Platform
- A Supabase project in the region closest to Indian players (confirm availability).
- Supabase CLI for local development, SQL migrations and generated types.

## Auth
- Anonymous sign-in on first launch.
- Account linking with Google and Apple (email OTP as fallback) to protect marbles.
- Hooks for device attestation; Phase 9 enforces it.

## Schema (RLS on every table)
- profiles
- marbles: genome (immutable), genome_hash (unique), rarity, size_class, owner_id, status (owned or escrowed), protected, name, wear, created_at
- marble_events: append-only; kinds minted, crafted, escrowed, released, transferred, renamed, protected, unprotected; UPDATE and DELETE revoked and a trigger blocks mutation
- matches: mode, court, rules_version, physics_version, seed, players, status, current_turn, state, state_hash, deadline_at
- match_turns: input, result_hash, idempotency_key (unique)
- challenges: token, creator, mode, court, stake rules, expiry, accepted_by
- kid_state: per user and kid; ladder progress and the kid's jar
- push_tokens, rate_limits

## Ledger rules
- Clients can't write marbles or events; RLS denies it.
- Every change goes through SECURITY DEFINER SQL functions that only Edge Functions (service role) can call: mint_marble, escrow_stakes, release_stakes, rename_marble, set_protected, and apply_transfers.
- apply_transfers runs in one transaction, locks rows with SELECT … FOR UPDATE in id order, and is idempotent per match.
- Invariants, written as pgTAP tests:
  - every marble has exactly one owner
  - escrowed marbles belong to an active match
  - transfers only move between the match's players
  - no marble is ever deleted
  - the event chain agrees with the current owner

## Edge Functions (Deno)
Bundle packages/physics, rules, ai and protocol at pinned versions. Validate every request with the zod schemas in packages/protocol.
- POST /challenges
- POST /challenges/:token/accept: creates the match and runs the lag.
- POST /matches/:id/stakes: escrow.
- POST /matches/:id/turns: load state, run rules and physics at the match's pinned versions, persist, notify the opponent, and compare the client's result hash (log any desync).
- POST /matches/:id/resign
- POST /kid-matches: for-keeps against a kid. The server computes the kid's turns with packages/ai and returns their inputs.
- GET /matches/:id

Every turn is idempotent (by idempotency key) and rate limited.

Deadlines via pg_cron: 48 h per turn with a reminder at 24 h; forfeits come from packages/rules; matches abandoned before the first shot release their stakes.

## Versioning
- Matches pin physics and rules versions, and the server keeps every supported version.
- Clients that can't run a match's version are asked to update.

## Client integration
- Play the predicted shot immediately, confirm it with the server, and reconcile on mismatch; the server wins.
- Report every desync with both hashes and the inputs.

## Push and the starter jar
- FCM (APNs through FCM on iOS) for: your turn, marble captured, win-it-back requests.
- Quiet hours 22:00–08:00 IST, plus per-user caps.
- The starter jar is minted on the first verified sign-in. Starter marbles are bound (not stakeable) for 72 h; Phase 9 tunes this.

## Observability
Structured logs, function latency metrics, and Sentry on the client and functions.

## Tests
- pgTAP: RLS and ledger invariants.
- Deno: function tests.
- Concurrency: simultaneous turn submissions and double resolution must give exactly-once transfers.
- Playwright: a full async match between two browser contexts.
- k6: a load-test smoke for turn submission.

## Done when
- Invariants hold under the concurrency tests.
- ADR-0011 (ledger) and ADR-0012 (async multiplayer) are written.
- docs/handoff/phase-06.md is written.
- PR "Phase 06 — Backend and ledger" is reviewed.
