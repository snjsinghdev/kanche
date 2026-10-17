import type { Insets } from './viewport.ts';

let probe: HTMLElement | undefined;

/**
 * The safe-area insets in CSS pixels. Reads env(safe-area-inset-*) and Capacitor's
 * --safe-area-inset-* variables (WebViews below 140) through a hidden probe's padding, which the
 * browser resolves to pixels (src/style.css).
 */
export function readSafeAreaInsets(doc: Document = document): Insets {
  if (probe === undefined || !probe.isConnected) {
    probe = doc.createElement('div');
    probe.className = 'safe-area-probe';
    probe.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
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
