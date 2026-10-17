import { physicsVersion } from '@kanche/physics';
import { rulesVersion } from '@kanche/rules';
import { Application, Rectangle, TextureSource } from 'pixi.js';

import { PALETTE } from './palette.ts';
import { readSafeAreaInsets, safeAreaProbe } from './safe-area.ts';
import { buildScene } from './scene.ts';
import { BASE_HEIGHT, BASE_WIDTH, computeViewport, type Viewport } from './viewport.ts';

// Pixel art: sample textures by nearest neighbour, never blur.
TextureSource.defaultOptions.scaleMode = 'nearest';

function currentViewport(): Viewport {
  const vv = window.visualViewport;
  return computeViewport({
    cssWidth: vv?.width ?? window.innerWidth,
    cssHeight: vv?.height ?? window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    insets: readSafeAreaInsets(),
  });
}

function applyViewport(app: Application, vp: Viewport): void {
  app.renderer.resize(BASE_WIDTH, BASE_HEIGHT, vp.resolution);
  const style = app.canvas.style;
  style.left = `${String(vp.cssLeft)}px`;
  style.top = `${String(vp.cssTop)}px`;
  style.width = `${String(vp.cssWidth)}px`;
  style.height = `${String(vp.cssHeight)}px`;
  // Integer mode maps each game pixel to whole device pixels; sharp mode downscales smoothly.
  style.imageRendering = vp.mode === 'integer' ? 'pixelated' : 'auto';
  app.canvas.dataset['mode'] = vp.mode;
  app.canvas.dataset['scale'] = String(vp.scale);
  app.render();
}

async function start(): Promise<void> {
  const host = document.getElementById('app');
  if (host === null) throw new Error('#app is missing from index.html');

  const app = new Application();
  let viewport = currentViewport();
  await app.init({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    resolution: viewport.resolution,
    autoDensity: false,
    antialias: false,
    roundPixels: true,
    background: PALETTE.dirt,
    preference: 'webgl',
    // The Phase 0 scene is static: render on change, not every frame (Phase 3 adds the loop).
    autoStart: false,
  });
  app.canvas.setAttribute('aria-label', 'Kanche');
  app.canvas.dataset['physicsVersion'] = String(physicsVersion);
  app.canvas.dataset['rulesVersion'] = String(rulesVersion);
  host.appendChild(app.canvas);
  app.stage.addChild(buildScene());
  applyViewport(app, viewport);

  let pending = false;
  const relayout = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      viewport = currentViewport();
      applyViewport(app, viewport);
    });
  };
  window.addEventListener('resize', relayout);
  window.visualViewport?.addEventListener('resize', relayout);
  screen.orientation.addEventListener('change', relayout);
  // Safe-area insets can change without a resize event (they arrive late on Android 11, and
  // change with split screen or the navigation mode). The probe's box changes with them.
  new ResizeObserver(relayout).observe(safeAreaProbe());

  if (import.meta.env.MODE !== 'production') {
    const { installTestHook } = await import('./test-hook.ts');
    installTestHook({
      viewport: () => viewport,
      versions: { physics: physicsVersion, rules: rulesVersion },
      sample: (x, y) => {
        const { pixels } = app.renderer.extract.pixels({
          target: app.stage,
          frame: new Rectangle(x, y, 1, 1),
          resolution: 1,
        });
        return [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0, pixels[3] ?? 0];
      },
    });
  }
}

void start();
