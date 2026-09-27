// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAVITY, mountStarField, stepStars, type FieldStar } from './source-star-field';

const star = (over: Partial<FieldStar> = {}): FieldStar => ({ x: 100, y: 100, vx: 0, vy: 0, r: 20, angle: 0, squash: 0, resting: false, wait: 0, ...over });
const box = { width: 800, height: 600 };
const run = (stars: FieldStar[], seconds: number, rand = () => 0.5) => { for (let t = 0; t < seconds; t += 1 / 60) stepStars(stars, 1 / 60, box, rand); };

describe('star physics', () => {
  it('falls, lands on the floor and settles inside the box', () => {
    const stars = [star({ y: 40 })];
    run(stars, 3, () => 0.99);
    expect(stars[0].y + stars[0].r).toBeLessThanOrEqual(box.height + 0.001);
    expect(stars[0].x - stars[0].r).toBeGreaterThanOrEqual(0);
  });

  it('never leaves the box, however hard it is thrown', () => {
    const stars = [star({ vx: 9000, vy: -9000 }), star({ x: 700, vx: -9000, vy: 9000 })];
    for (let t = 0; t < 5; t += 1 / 60) {
      stepStars(stars, 1 / 60, box, Math.random);
      for (const s of stars) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(-0.001); expect(s.x + s.r).toBeLessThanOrEqual(box.width + 0.001);
        expect(s.y - s.r).toBeGreaterThanOrEqual(-0.001); expect(s.y + s.r).toBeLessThanOrEqual(box.height + 0.001);
      }
    }
  });

  it('a resting star jumps again once its wait is over, sometimes all the way to the ceiling', () => {
    const stars = [star({ y: box.height - 20, resting: true, wait: 0.05 })];
    stepStars(stars, 1 / 60, box, () => 0.5);
    stepStars(stars, 1 / 60, box, () => 0.99);
    stepStars(stars, 1 / 60, box, () => 0.99);
    stepStars(stars, 1 / 60, box, () => 0.99);
    expect(stars[0].resting).toBe(false);
    // The highest jump clears the whole box: v² / 2g reaches past the ceiling.
    expect((stars[0].vy ** 2) / (2 * GRAVITY)).toBeGreaterThan(box.height - 40);
  });

  it('stars bump off each other instead of passing through', () => {
    const a = star({ x: 300, vx: 400 }), b = star({ x: 330, vx: -400 });
    stepStars([a, b], 1 / 60, box, () => 0.5);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(a.r + b.r - 0.001);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('the star field', () => {
  afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

  it('drops a decorative layer of colourful stars over the page and removes it on destroy', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const field = mountStarField(document.body, { count: 6 });
    const layer = document.querySelector('.star-field')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    const stars = [...layer.querySelectorAll<HTMLElement>('.yapi-mark')];
    expect(stars).toHaveLength(6);
    expect(new Set(stars.map(s => s.dataset.color)).size).toBeGreaterThan(3);
    field.destroy();
    expect(document.querySelector('.star-field')).toBeNull();
  });

  it('holds the stars still, resting on the floor, for people who reduce motion', () => {
    const frame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', frame);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    const field = mountStarField(document.body, { count: 4 });
    expect(frame).not.toHaveBeenCalled();
    field.destroy();
  });
});
