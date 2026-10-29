import { useEffect } from 'react';

/** Owner 2026-10-27 («I want motion and etc, not ordinary things»): the skeletons' motion kit. Markup opts in with data attributes:
 *  data-mo="rise" (enters with a spring when scrolled to; children marked data-mo-item cascade one after another),
 *  data-mo="tilt" (a photo that tilts toward the pointer), data-mo="parallax" + data-mo-speed (moves at its own speed on scroll),
 *  and <Words> (a headline whose words drop in one by one). Nothing is hidden until this script runs, and visitors who asked for
 *  less motion — or a store with motion off — get the still page. */

const still = () => typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.pagosyaMotion === 'off';

export function MotionKit() {
  useEffect(() => {
    if (still()) return;
    const root = document.documentElement;
    root.classList.add('mo-ready');
    // Rise: once, when a sixth of it is on screen; its items get their place in the cascade.
    const seen = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.setAttribute('data-mo-in', ''); seen.unobserve(entry.target); }
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
    const watch = () => document.querySelectorAll<HTMLElement>('[data-mo="rise"]:not([data-mo-watched])').forEach(el => {
      el.setAttribute('data-mo-watched', '');
      el.querySelectorAll<HTMLElement>('[data-mo-item]').forEach((item, index) => item.style.setProperty('--mo-i', String(Math.min(index, 12))));
      seen.observe(el);
    });
    watch();
    // The kit draws the product cards after load: number them as they arrive so the grid cascades too.
    const grids = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>('[data-mo-cards]').forEach(grid => Array.from(grid.children).forEach((card, index) => {
        if (!(card as HTMLElement).dataset.moItem) { (card as HTMLElement).dataset.moItem = ''; (card as HTMLElement).style.setProperty('--mo-i', String(Math.min(index, 12))); }
      }));
      watch();
    });
    grids.observe(document.body, { childList: true, subtree: true });
    // Tilt: the photo leans toward the pointer, and settles back when it leaves.
    const tilt = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest?.('[data-mo="tilt"]') as HTMLElement | null;
      if (!el || event.pointerType !== 'mouse') return;
      const box = el.getBoundingClientRect();
      el.style.setProperty('--mo-rx', `${(((event.clientY - box.top) / box.height) - 0.5) * -10}deg`);
      el.style.setProperty('--mo-ry', `${(((event.clientX - box.left) / box.width) - 0.5) * 12}deg`);
    };
    const untilt = (event: PointerEvent) => {
      const el = (event.target as Element | null)?.closest?.('[data-mo="tilt"]') as HTMLElement | null;
      if (el && !el.contains(event.relatedTarget as Node)) { el.style.setProperty('--mo-rx', '0deg'); el.style.setProperty('--mo-ry', '0deg'); }
    };
    document.addEventListener('pointermove', tilt, { passive: true });
    document.addEventListener('pointerout', untilt, { passive: true });
    // Parallax: each marked element drifts by its speed against the page, measured from the middle of the screen.
    let frame = 0;
    const drift = () => {
      frame = 0;
      const middle = innerHeight / 2;
      document.querySelectorAll<HTMLElement>('[data-mo="parallax"]').forEach(el => {
        const box = el.getBoundingClientRect();
        if (box.bottom < -200 || box.top > innerHeight + 200) return;
        const speed = Number(el.dataset.moSpeed || '0.12');
        el.style.setProperty('--mo-p', `${Math.round((box.top + box.height / 2 - middle) * -speed)}px`);
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(drift); };
    addEventListener('scroll', onScroll, { passive: true });
    drift();
    return () => {
      seen.disconnect(); grids.disconnect(); root.classList.remove('mo-ready');
      document.removeEventListener('pointermove', tilt); document.removeEventListener('pointerout', untilt); removeEventListener('scroll', onScroll);
    };
  }, []);
  return null;
}

/** A headline whose words drop in one after another (the words stay one text for screen readers and search). */
export function Words({ text }: { text: string }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  return <span className="mo-words" aria-label={text}>{words.map((word, index) => <span key={index} className="mo-w" aria-hidden="true" style={{ ['--i' as string]: index }}>{word}{index < words.length - 1 ? ' ' : ''}</span>)}</span>;
}
