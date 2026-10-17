/**
 * The genome version. The same seed must draw the same marble everywhere (Phase 4 gate), so any
 * change to how a genome is derived from its seed bumps it. Genome code is simulation code: the
 * determinism lint applies to this folder (ADR-0004).
 */
export const genomeVersion = 1;
