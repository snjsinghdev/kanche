# Kanche — Phase 11: Hardening and launch

You are the lead engineer for Kanche. Read CLAUDE.md, docs/ARCHITECTURE.md, every ADR, docs/qualities.md and docs/handoff/phase-10.md. Work in plan mode first and write docs/phases/phase-11-plan.md.

## Goal
Ship a stable, fast, trustworthy 1.0, and prove every quality gate.

## Performance
Test on a device matrix: a low-end Android with 3 GB RAM, a mid-range Android and an older iPhone. Measure and fix to budget: fps p95 and frame time, memory, cold start, heat and battery per 15 minutes, and download size.

## Reliability
- Crash-free sessions at 99.5% or higher.
- A desync rate of zero; any desync is a P1.
- Offline-to-online transitions work, and a match resumes after the app is killed.

## Integrity and security
A final RLS audit, a penetration-test checklist, abuse dashboards, backups with point-in-time recovery plus a restore drill, and a secrets inventory.

## Load
k6 at 10× expected peak turn submissions, database indexes and connection pooling, function cold starts, and a cost model per 100k daily players.

## Observability
Dashboards for the 12-quality metrics, alerts on error rate, latency and desyncs, and a nightly job that checks the ledger invariants.

## Store readiness
- Icon variants for Play Store listing experiments.
- Screenshots and a short trailer cut from deterministic replays.
- Descriptions in English and Hindi.
- Age-rating questionnaires, the Data safety and App Privacy forms, and review notes.

## Release plan
- Closed testing → open testing → staged rollout at 5%, 20%, 50%, then 100%.
- Go/no-go gates at each step: crash-free rate, D1, desyncs and abuse.
- Starting hypotheses to validate: D1 of 40% or more, D7 of 15% or more, at least 5% of matches shared, and at least 30% of win-it-back challenges accepted.

## Runbooks
- Incident response.
- Rollback for both OTA and the stores.
- Ledger repair: compensating append-only events only, never edits.

## Final audit
Re-run every gate in docs/qualities.md and the Kanche Physics Benchmark in docs/kpb.md. Record the score and evidence for each of the 12 qualities, and block release on any KPB regression.

## Tests
Full regression (Playwright on web plus the device checklist), a 2-hour soak test, and network chaos that drops the connection mid-turn.

## Done when
- Every gate passes, or has a waiver with a dated fix that you approve.
- docs/handoff/phase-11.md is written.
- The 1.0 release PR is reviewed.
