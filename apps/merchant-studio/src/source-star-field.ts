import './source-star-field.css';
import { renderFaceMark, type FaceColor } from './source-face';

/**
 * The playground that fills Diseñar sitio while YAPI has not made a site yet: YAPI's star and a few friends in other
 * colours, falling, bouncing off the walls, the ceiling and each other, resting a moment on the floor and jumping again —
 * some of them all the way up. It covers the whole Studio (the chat and the canvas) and is pure decoration: no pointer
 * events, hidden from assistive tech, paused with the tab, still for people who reduce motion, gone once a site exists.
 */

export type FieldStar = { x: number; y: number; vx: number; vy: number; r: number; angle: number; squash: number; resting: boolean; wait: number };

/** px/s²: brisk enough that a jump reads as a hop, not a float. */
export const GRAVITY = 2200;
const WALL_BOUNCE = 0.8, CEILING_BOUNCE = 0.5, FLOOR_BOUNCE = 0.45, STAR_BOUNCE = 0.85;
/** Below this landing speed a star stops bouncing and sits. */
const SETTLE_SPEED = 240;
const COLORS: readonly FaceColor[] = ['amarillo', 'rosa', 'azul', 'verde', 'morado', 'naranja'];
const SIZES = [52, 36, 44, 32, 40, 34, 46, 30];

/**
 * One physics step. Pure apart from `rand`, so it can be tested and replayed. A resting star waits, then jumps to a
 * random height between a third of the box and a little past the ceiling; stars bounce off the walls, the ceiling, the
 * floor and each other (equal masses), squash when they hit something, and never leave the box.
 */
export function stepStars(stars: FieldStar[], dt: number, box: { width: number; height: number }, rand: () => number = Math.random) {
  const { width: w, height: h } = box;
  for (const s of stars) {
    if (s.resting) {
      s.wait -= dt;
      s.vx *= Math.pow(0.02, dt);
      if (s.wait <= 0) {
        s.resting = false;
        s.vy = -Math.sqrt(2 * GRAVITY * h * (0.35 + rand() * 0.75));
        s.vx = (rand() * 2 - 1) * 380;
        s.squash = 0.5;
      }
    }
    if (!s.resting) s.vy += GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.vx * dt * 0.6;
    if (s.x - s.r < 0) { s.x = s.r; s.vx = Math.abs(s.vx) * WALL_BOUNCE; }
    if (s.x + s.r > w) { s.x = w - s.r; s.vx = -Math.abs(s.vx) * WALL_BOUNCE; }
    if (s.y - s.r < 0) { s.y = s.r; s.vy = Math.abs(s.vy) * CEILING_BOUNCE; s.squash = 0.8; }
    if (s.y + s.r >= h) {
      s.y = h - s.r;
      if (s.vy > SETTLE_SPEED) { s.squash = Math.min(1, s.vy / 1400); s.vy = -s.vy * FLOOR_BOUNCE; }
      else if (!s.resting) { s.vy = 0; s.resting = true; s.wait = 0.4 + rand() * 1.8; }
    }
    s.squash = Math.max(0, s.squash - dt * 4);
  }
  for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) {
    const a = stars[i], b = stars[j];
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 0.001, min = a.r + b.r;
    if (dist >= min) continue;
    const nx = dx / dist, ny = dy / dist, push = (min - dist) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing < 0) {
      const impulse = -(1 + STAR_BOUNCE) * closing / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
      // A star knocked hard enough leaves the floor.
      for (const s of [a, b]) if (s.resting && Math.abs(s.vy) > SETTLE_SPEED / 2) s.resting = false;
      a.squash = Math.max(a.squash, 0.35); b.squash = Math.max(b.squash, 0.35);
    }
  }
  // Collisions can push a star past a wall; the box always wins.
  for (const s of stars) {
    s.x = Math.min(Math.max(s.x, s.r), w - s.r);
    s.y = Math.min(Math.max(s.y, s.r), h - s.r);
  }
}

export function mountStarField(host: HTMLElement = document.body, options: { count?: number } = {}): { destroy(): void } {
  const count = options.count ?? 7;
  const layer = document.createElement('div');
  layer.className = 'star-field';
  layer.setAttribute('aria-hidden', 'true');
  const els = Array.from({ length: count }, (_, i) => {
    const el = document.createElement('span');
    el.className = 'star-field__star';
    el.innerHTML = renderFaceMark({ size: SIZES[i % SIZES.length], color: COLORS[i % COLORS.length] });
    layer.append(el);
    return el;
  });
  host.append(layer);
  const box = () => ({ width: layer.clientWidth || window.innerWidth || 800, height: layer.clientHeight || window.innerHeight || 600 });
  const start = box();
  const stars: FieldStar[] = els.map((_, i) => {
    const r = SIZES[i % SIZES.length] * 0.46;
    return { x: r + Math.random() * Math.max(1, start.width - 2 * r), y: r + Math.random() * start.height * 0.5, vx: (Math.random() * 2 - 1) * 200, vy: 0, r, angle: 0, squash: 0, resting: false, wait: 0 };
  });
  const paint = () => stars.forEach((s, i) => {
    const sx = 1 + s.squash * 0.22, sy = 1 - s.squash * 0.26;
    els[i].style.transform = `translate3d(${s.x - s.r}px, ${s.y - s.r}px, 0) rotate(${s.angle}deg) scale(${sx}, ${sy})`;
  });
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (still) {
    // Resting in a row along the floor.
    stars.forEach((s, i) => { s.x = Math.min(start.width - s.r, s.r + i * (start.width / count)); s.y = start.height - s.r; });
    paint();
    return { destroy: () => layer.remove() };
  }
  let frame = 0, last = 0;
  const tick = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    stepStars(stars, dt, box());
    paint();
    frame = requestAnimationFrame(tick);
  };
  // Nothing moves behind a hidden tab; the clock restarts cleanly when it comes back.
  const onVisibility = () => {
    cancelAnimationFrame(frame);
    if (!document.hidden) { last = 0; frame = requestAnimationFrame(tick); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  paint();
  frame = requestAnimationFrame(tick);
  return {
    destroy() {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      layer.remove();
    },
  };
}
