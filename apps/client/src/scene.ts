import { createRng } from '@kanche/physics';
import { Container, Graphics } from 'pixi.js';

import { RING, SHOOTER } from './layout.ts';
import { PALETTE } from './palette.ts';
import { BASE_HEIGHT, BASE_WIDTH } from './viewport.ts';

/**
 * The wordless Phase 0 test scene: packed dirt, a chalk ring with marbles in it, and one glowing
 * shooter below. Static and drawn once; Phase 3 brings the real renderer.
 */
export function buildScene(): Container {
  const scene = new Container();

  const ground = new Graphics().rect(0, 0, BASE_WIDTH, BASE_HEIGHT).fill(PALETTE.dirt);
  // Seeded pebbles, so the ground is the same on every device (and in screenshots).
  const rng = createRng(2026);
  for (let i = 0; i < 260; i += 1) {
    const x = rng.nextInt(BASE_WIDTH);
    const y = rng.nextInt(BASE_HEIGHT);
    ground.rect(x, y, 1, 1).fill(rng.nextInt(2) === 0 ? PALETTE.dirtDark : PALETTE.dirtLight);
  }
  scene.addChild(ground);

  scene.addChild(
    new Graphics().circle(RING.x, RING.y, RING.r).stroke({ width: 2, color: PALETTE.chalk }),
  );

  const marbles = new Graphics();
  PALETTE.marbles.forEach((color, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    marbles.circle(RING.x - 24 + col * 24, RING.y - 10 + row * 22, 4).fill(color);
  });
  scene.addChild(marbles);

  const shooter = new Graphics();
  for (const [r, alpha] of [
    [14, 0.12],
    [11, 0.2],
    [8, 0.35],
  ] as const) {
    shooter.circle(SHOOTER.x, SHOOTER.y, r).fill({ color: PALETTE.glow, alpha });
  }
  shooter.circle(SHOOTER.x, SHOOTER.y, SHOOTER.r).fill(PALETTE.shooter);
  scene.addChild(shooter);

  return scene;
}
