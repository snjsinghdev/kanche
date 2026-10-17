import type { Viewport } from './viewport.ts';

export interface KancheTestHook {
  readonly ready: true;
  readonly versions: { readonly physics: number; readonly rules: number };
  viewport(): Viewport;
  /** RGBA of one game pixel, read back from the renderer. */
  sample(x: number, y: number): readonly [number, number, number, number];
}

declare global {
  interface Window {
    __kanche?: KancheTestHook;
  }
}

/** Exposes app state to Playwright and device debugging. Never part of a production build. */
export function installTestHook(hook: Omit<KancheTestHook, 'ready'>): void {
  window.__kanche = { ready: true, ...hook };
}
