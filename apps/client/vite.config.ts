import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The browser floor is pinned rather than left to Vite's default, so a Vite update cannot move it
 * (ADR-0002). chrome111 matches Vite 8's default; the Android WebView must be 111 or newer.
 */
export const BUILD_TARGET = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig(({ mode }) => ({
  // .env.example and .env.local live at the repository root.
  envDir: '../..',
  build: {
    target: BUILD_TARGET,
    // Maps are generated for crash symbolication (Phase 11) but not referenced by the bundle.
    sourcemap: 'hidden',
    // The canvas app has a single entry; lazy chunks are Pixi's environment extensions.
    chunkSizeWarningLimit: 600,
    // The Physics Lab (lab.html) is a developer tool: dev, debug and e2e builds only, never the
    // production bundle or its budget (ADR-0006).
    rollupOptions: {
      input:
        mode === 'production'
          ? { index: page('index.html') }
          : { index: page('index.html'), lab: page('lab.html') },
    },
  },
  server: { host: true },
}));
