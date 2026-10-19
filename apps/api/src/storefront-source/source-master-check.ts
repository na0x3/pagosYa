/** Spec 2026-10-19 §3.2: after a design edit on a master store, the home at 1280 and 390 must not scroll sideways and
 *  no two visible text boxes may overlap. Returns Spanish findings (empty = fine). */
import { withVisualSandbox } from './source-visual-capture';
import type { SourceProjectSnapshot } from './source-project';

export async function masterLayoutFindings(snapshot: SourceProjectSnapshot): Promise<string[]> {
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const findings: string[] = [];
    for (const width of [1280, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      const read = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const visible = (el: Element) => { const style = getComputedStyle(el); return !el.closest('[hidden],[aria-hidden="true"],template,.es-menu') && style.visibility !== 'hidden' && Number(style.opacity) > 0.05; };
        const boxes = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,li'))
          .filter(el => !el.querySelector('h1,h2,h3,p,a,button,li') && (el.textContent || '').trim() && visible(el))
          .map(el => ({ r: el.getBoundingClientRect(), t: (el.textContent || '').trim().slice(0, 40) }))
          .filter(box => box.r.width > 0 && box.r.height > 0);
        const overlaps: string[] = [];
        for (let i = 0; i < boxes.length && overlaps.length < 3; i++) for (let j = i + 1; j < boxes.length && overlaps.length < 3; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 4 && h > 4) overlaps.push(`«${boxes[i].t}» y «${boxes[j].t}»`);
        }
        return { overflow, overlaps };
      });
      if (read.overflow > 1) findings.push(`A ${width}px la página se desborda ${read.overflow}px hacia el costado.`);
      for (const pair of read.overlaps) findings.push(`A ${width}px se superponen los textos ${pair}.`);
      await page.close();
    }
    return findings;
  });
}
