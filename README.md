# Kanche

Street marbles, played for keeps. A mobile-first pixel-art game for Android, iOS and the web, built on one deterministic TypeScript core shared by the phone, the AI kids and the server.

> Private and proprietary. All rights reserved.

## Start here

- **Working on the code (people and Claude Code):** read [`CLAUDE.md`](CLAUDE.md).
- **Setting up a machine:** [`docs/setup.md`](docs/setup.md).
- **How it fits together:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the ADRs in [`docs/adr/`](docs/adr/).
- **The plan:** twelve phases in [`docs/prompt-pack/`](docs/prompt-pack/README.md), each with a plan in [`docs/phases/`](docs/phases/) and a handoff note in [`docs/handoff/`](docs/handoff/).
- **What "good" means:** [`docs/qualities.md`](docs/qualities.md).

## Quick start

```sh
corepack enable
pnpm install
pnpm verify      # typecheck, lint, test, build, budgets
pnpm dev         # http://localhost:5173
```

## Status

| Phase            | State                                                            |
| ---------------- | ---------------------------------------------------------------- |
| 0 · Foundations  | Done: see [`docs/handoff/phase-00.md`](docs/handoff/phase-00.md) |
| 1 · Physics core | Next                                                             |
