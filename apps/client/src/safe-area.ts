import type { Insets } from './viewport.ts';

let probe: HTMLElement | undefined;

/**
 * A hidden, fixed, full-window element whose padding is the safe area (src/style.css). Its
 * content box shrinks when an inset grows, so a ResizeObserver on it sees inset changes, which
 * fire no window resize event (seen on Android 11, where the insets arrive after the first layout).
 */
export function safeAreaProbe(doc: Document = document): HTMLElement {
  if (probe === undefined || !probe.isConnected) {
    probe = doc.createElement('div');
    probe.className = 'safe-area-probe';
    probe.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(probe);
  }
  return probe;
}

/**
 * The safe-area insets in CSS pixels. Reads env(safe-area-inset-*) and Capacitor's
 * --safe-area-inset-* variables (WebViews below 140) through the probe's padding, which the
 * browser resolves to pixels.
 */
export function readSafeAreaInsets(doc: Document = document): Insets {
  const style = getComputedStyle(safeAreaProbe(doc));
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}
