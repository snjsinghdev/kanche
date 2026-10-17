/**
 * The Physics Lab route (lab.html; Phase 1 prompt, "Physics Lab"). Built only in dev, debug and
 * e2e modes (vite.config.ts), never in the production bundle. It plays a shot back with its
 * velocity, slip and spin vectors, trails and live values; runs it again with a second parameter
 * set (B, overrides of v1) on top; and overlays a track exported from Tracker and the overhead
 * footage it came from, kept in step with the playback.
 */
import {
  buildCourt,
  deriveParams,
  PARAMS_V1,
  simulateShot,
  type ParamOverrides,
  type PhysicsParams,
  type ShotResult,
  type ShotSetup,
} from '@kanche/physics';
import { parseTrackerCsv } from '@kanche/kpb/tracker';

import { frame, parseRect, sampleAt, trail, videoTime, type Bounds } from './playback.ts';
import { SCENARIOS } from './scenarios.ts';

/** Arrow length per unit: an arrow shows where the vector would carry the marble in 0.1 s. */
const ARROW_TIME = 0.1; // s

interface Run {
  readonly params: PhysicsParams;
  readonly setup: ShotSetup;
  readonly result: ShotResult;
}

interface LabHook {
  readonly ready: true;
  /** KPB 16 on this device: the break's wall time over warm runs (ms). */
  bench(runs: number): { median: number; min: number; p90: number; runs: number; hash: string };
  runs(): {
    a: { hash: string; duration: number } | null;
    b: { hash: string; duration: number } | null;
  };
  overlayPoints(): number;
  /** Whether footage is loaded and has a frame to draw. */
  videoReady(): boolean;
  error(): string;
}

declare global {
  interface Window {
    __kancheLab?: LabHook;
  }
}

function $<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing from lab.html`);
  return el;
}

const canvas = $('view', HTMLCanvasElement);
const scenario = $('scenario', HTMLSelectElement);
const setupBox = $('setup', HTMLTextAreaElement);
const overridesBox = $('overrides', HTMLTextAreaElement);
const timeSlider = $('time', HTMLInputElement);
const playButton = $('play', HTMLButtonElement);
const errorBox = $('error', HTMLParagraphElement);
const values = $('values', HTMLTableElement);
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('no 2D context');
const css = getComputedStyle(document.documentElement);
const colour = (name: string): string => css.getPropertyValue(name).trim();

let a: Run | null = null;
let b: Run | null = null;
let overlay: { x: number[]; y: number[]; t0: number; fps: number } | null = null;
const footage = document.createElement('video');
footage.muted = true;
footage.preload = 'auto';
let footageUrl: string | null = null;
const videoRectBox = $('videoRect', HTMLInputElement);
const videoOffsetBox = $('videoOffset', HTMLInputElement);
let view: Bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
let t = 0;
let playing = false;

for (const name of Object.keys(SCENARIOS)) scenario.add(new Option(name, name));

function load(name: string): void {
  setupBox.value = JSON.stringify(SCENARIOS[name], null, 1);
}

function simulate(setup: ShotSetup, params: PhysicsParams): Run {
  return { params, setup, result: simulateShot(setup, { params, timeline: true }) };
}

function run(): void {
  errorBox.textContent = '';
  try {
    const setup = JSON.parse(setupBox.value) as ShotSetup;
    a = simulate(setup, PARAMS_V1);
    const text = overridesBox.value.trim();
    b =
      text === ''
        ? null
        : simulate(setup, deriveParams(PARAMS_V1, JSON.parse(text) as ParamOverrides));
    view = frame([...(a.result.timeline ?? []), ...(b?.result.timeline ?? [])]);
    t = 0;
  } catch (e) {
    errorBox.textContent = e instanceof Error ? e.message : String(e);
    a = null;
    b = null;
  }
  draw();
}

function duration(): number {
  return Math.max(a?.result.duration ?? 0, b?.result.duration ?? 0, 1e-3);
}

/** World (m) to canvas pixels, preserving aspect; y up. */
function transform(): { sx: (x: number) => number; sy: (y: number) => number; k: number } {
  const w = canvas.width;
  const h = canvas.height;
  const k = Math.min(w / (view.xMax - view.xMin), h / (view.yMax - view.yMin));
  const ox = (w - k * (view.xMax - view.xMin)) / 2;
  const oy = (h - k * (view.yMax - view.yMin)) / 2;
  return { sx: (x) => ox + k * (x - view.xMin), sy: (y) => h - oy - k * (y - view.yMin), k };
}

function arrow(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: string,
  width: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  g.lineWidth = width;
  g.strokeStyle = c;
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - 6 * ux + 3 * uy, y1 - 6 * uy - 3 * ux);
  g.lineTo(x1 - 6 * ux - 3 * uy, y1 - 6 * uy + 3 * ux);
  g.fill();
}

function drawCourt(
  g: CanvasRenderingContext2D,
  setup: ShotSetup,
  tf: ReturnType<typeof transform>,
): void {
  const court = buildCourt(setup.court as Parameters<typeof buildCourt>[0]);
  g.strokeStyle = '#4a3b2c';
  g.lineWidth = 1;
  const bnd = court.bounds;
  g.strokeRect(
    tf.sx(bnd.xMin),
    tf.sy(bnd.yMax),
    tf.k * (bnd.xMax - bnd.xMin),
    tf.k * (bnd.yMax - bnd.yMin),
  );
  g.strokeStyle = '#d8c8a8';
  g.lineWidth = 3;
  for (const w of court.walls) {
    g.beginPath();
    g.moveTo(tf.sx(w.ax), tf.sy(w.ay));
    g.lineTo(tf.sx(w.ax + w.length * w.dx), tf.sy(w.ay + w.length * w.dy));
    g.stroke();
  }
  g.lineWidth = 1;
  for (const block of court.blocks) {
    g.beginPath();
    block.corners.forEach((c, i) => {
      if (i === 0) g.moveTo(tf.sx(c.x), tf.sy(c.y));
      else g.lineTo(tf.sx(c.x), tf.sy(c.y));
    });
    g.closePath();
    g.stroke();
  }
  const hole = court.hole;
  if (hole !== undefined) {
    g.fillStyle = '#000000';
    g.beginPath();
    g.arc(tf.sx(hole.cx), tf.sy(hole.cy), tf.k * hole.rh, 0, 2 * Math.PI);
    g.fill();
  }
}

/** The footage frame for the current time, under everything else, if it is loaded. */
function drawFootage(g: CanvasRenderingContext2D, tf: ReturnType<typeof transform>): void {
  if (footageUrl === null || footage.readyState < 2) return;
  let rect: Bounds;
  try {
    rect = parseRect(videoRectBox.value);
  } catch (e) {
    errorBox.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  const want = videoTime(t, Number(videoOffsetBox.value) || 0, footage.duration);
  // Seek only when the shown frame is more than half a 60 fps frame away; 'seeked' redraws.
  if (!footage.seeking && Math.abs(footage.currentTime - want) > 1 / 120)
    footage.currentTime = want;
  g.globalAlpha = 0.6;
  g.drawImage(
    footage,
    tf.sx(rect.xMin),
    tf.sy(rect.yMax),
    tf.k * (rect.xMax - rect.xMin),
    tf.k * (rect.yMax - rect.yMin),
  );
  g.globalAlpha = 1;
}

function drawRun(
  g: CanvasRenderingContext2D,
  r: Run,
  c: string,
  tf: ReturnType<typeof transform>,
): void {
  for (const tl of r.result.timeline ?? []) {
    const size = r.setup.marbles.find((m) => m.id === tl.id)?.size ?? 'r80';
    const radius = r.params.radius[size];
    const path = trail(tl, t);
    g.strokeStyle = c;
    g.globalAlpha = 0.5;
    g.beginPath();
    path.forEach((p, i) => {
      if (i === 0) g.moveTo(tf.sx(p.x), tf.sy(p.y));
      else g.lineTo(tf.sx(p.x), tf.sy(p.y));
    });
    g.stroke();
    g.globalAlpha = 1;
    const s = sampleAt(tl, radius, t);
    const x = tf.sx(s.x);
    const y = tf.sy(s.y);
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, Math.max(2, tf.k * radius), 0, 2 * Math.PI);
    g.fill();
    const L = tf.k * ARROW_TIME;
    // Widest first: rolling makes the spin arrow coincide with the velocity arrow (v = r·ω).
    arrow(g, x, y, x + L * s.vx, y - L * s.vy, colour('--v'), 4);
    arrow(g, x, y, x + L * s.ux, y - L * s.uy, colour('--u'), 2);
    // Spin as the surface speed it gives the top of the marble: r·(ω × ẑ) is (r·ωy, −r·ωx).
    arrow(g, x, y, x + L * radius * s.wy, y + L * radius * s.wx, colour('--w'), 1);
    g.lineWidth = 1;
  }
}

function drawOverlay(g: CanvasRenderingContext2D, tf: ReturnType<typeof transform>): void {
  if (overlay === null) return;
  g.fillStyle = colour('--o');
  const now = Math.round((t - overlay.t0) * overlay.fps);
  overlay.x.forEach((x, k) => {
    const y = overlay?.y[k] ?? NaN;
    const r = k === now ? 4 : 1.5;
    g.beginPath();
    g.arc(tf.sx(x), tf.sy(y), r, 0, 2 * Math.PI);
    g.fill();
  });
}

function table(): void {
  const rows = [
    '<tr><th>run</th><th>id</th><th>motion</th><th>|v|</th><th>|u|</th><th>|ω|</th></tr>',
  ];
  for (const [name, r] of [
    ['A', a],
    ['B', b],
  ] as const) {
    if (r === null) continue;
    for (const tl of r.result.timeline ?? []) {
      const size = r.setup.marbles.find((m) => m.id === tl.id)?.size ?? 'r80';
      const s = sampleAt(tl, r.params.radius[size], t);
      if (s.speed === 0 && s.spin === 0 && t > 0) continue;
      const u = Math.hypot(s.ux, s.uy);
      rows.push(
        `<tr><td>${name}</td><td>${String(tl.id)}</td><td>${s.motion}</td><td>${s.speed.toFixed(3)}</td><td>${u.toFixed(3)}</td><td>${s.spin.toFixed(1)}</td></tr>`,
      );
    }
  }
  values.innerHTML = rows.join('');
}

function draw(): void {
  const dpr = window.devicePixelRatio;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = ctx as CanvasRenderingContext2D;
  g.fillStyle = colour('--bg');
  g.fillRect(0, 0, w, h);
  if (a === null) return;
  const tf = transform();
  drawFootage(g, tf);
  drawCourt(g, a.setup, tf);
  drawOverlay(g, tf);
  if (b !== null) drawRun(g, b, colour('--b'), tf);
  drawRun(g, a, colour('--a'), tf);
  timeSlider.value = String(Math.round((1000 * t) / duration()));
  table();
}

let last = 0;
function tick(now: number): void {
  if (!playing) return;
  const step = last === 0 ? 0 : (now - last) / 1000;
  last = now;
  t = Math.min(duration(), t + step);
  if (t >= duration()) playing = false;
  draw();
  requestAnimationFrame(tick);
}

scenario.addEventListener('change', () => {
  load(scenario.value);
  run();
});
$('run', HTMLButtonElement).addEventListener('click', run);
playButton.addEventListener('click', () => {
  playing = !playing;
  if (t >= duration()) t = 0;
  last = 0;
  requestAnimationFrame(tick);
});
timeSlider.addEventListener('input', () => {
  playing = false;
  t = (Number(timeSlider.value) / 1000) * duration();
  draw();
});
$('overlay', HTMLInputElement).addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  void file.text().then((text) => {
    try {
      const tr = parseTrackerCsv(text);
      overlay = { x: tr.x, y: tr.y, t0: tr.t0, fps: tr.fps };
      errorBox.textContent = '';
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
    }
    draw();
  });
});
// Wheel to zoom about the pointer, drag to pan.
function worldAt(px: number, py: number): { x: number; y: number } {
  const tf = transform();
  const dpr = window.devicePixelRatio;
  const k = tf.k;
  const x0 = tf.sx(view.xMin);
  const y0 = tf.sy(view.yMin);
  return { x: view.xMin + (px * dpr - x0) / k, y: view.yMin + (y0 - py * dpr) / k };
}
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const at = worldAt(e.offsetX, e.offsetY);
    const f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    view = {
      xMin: at.x + (view.xMin - at.x) * f,
      xMax: at.x + (view.xMax - at.x) * f,
      yMin: at.y + (view.yMin - at.y) * f,
      yMax: at.y + (view.yMax - at.y) * f,
    };
    draw();
  },
  { passive: false },
);
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = worldAt(e.offsetX, e.offsetY);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag === null) return;
  const at = worldAt(e.offsetX, e.offsetY);
  view = {
    xMin: view.xMin + drag.x - at.x,
    xMax: view.xMax + drag.x - at.x,
    yMin: view.yMin + drag.y - at.y,
    yMax: view.yMax + drag.y - at.y,
  };
  draw();
});
canvas.addEventListener('pointerup', () => {
  drag = null;
});
$('video', HTMLInputElement).addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  if (footageUrl !== null) URL.revokeObjectURL(footageUrl);
  footageUrl = URL.createObjectURL(file);
  footage.src = footageUrl;
  footage.load();
});
footage.addEventListener('loadeddata', draw);
footage.addEventListener('seeked', draw);
footage.addEventListener('error', () => {
  errorBox.textContent = 'the footage could not be decoded';
});
for (const box of [videoRectBox, videoOffsetBox]) box.addEventListener('input', draw);
new ResizeObserver(draw).observe(canvas);

load('break');
run();
function bench(runs: number): {
  median: number;
  min: number;
  p90: number;
  runs: number;
  hash: string;
} {
  const setup = SCENARIOS['break'] as ShotSetup;
  for (let i = 0; i < 20; i += 1) simulateShot(setup, { timeline: false });
  const times: number[] = [];
  let hash = '';
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    hash = simulateShot(setup, { timeline: false }).hash;
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  const at = (q: number): number => times[Math.min(runs - 1, Math.floor(q * runs))] ?? NaN;
  return { median: at(0.5), min: at(0), p90: at(0.9), runs, hash };
}

window.__kancheLab = {
  ready: true,
  bench,
  runs: () => ({
    a: a === null ? null : { hash: a.result.hash, duration: a.result.duration },
    b: b === null ? null : { hash: b.result.hash, duration: b.result.duration },
  }),
  overlayPoints: () => overlay?.x.length ?? 0,
  videoReady: () => footageUrl !== null && footage.readyState >= 2,
  error: () => errorBox.textContent,
};
