/** V2 prototype measure (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §5): structural originality. The rendered home is
 *  read as a sequence of its top-level sections, each reduced to its composition — columns, how much media and where, full-bleed,
 *  height band, heading alignment — so two homes with the same skeleton in different colours read as alike. */

export type SectionShape = { cols: number; media: 0 | 1 | 2 | 3; side: 'none' | 'left' | 'right' | 'center' | 'full'; bleed: boolean; tall: 0 | 1 | 2 | 3; align: 'left' | 'center' | 'none' };

/** Runs in the page (page.evaluate): no imports, no closures. */
export function layoutSignature(): SectionShape[] {
  const main = document.querySelector('main') || document.body;
  let blocks = Array.from(main.children);
  // A design that wraps every section in one container: read the container's children.
  while (blocks.length === 1 && blocks[0].children.length > 1) blocks = Array.from(blocks[0].children);
  const vw = window.innerWidth, vh = window.innerHeight;
  const out: SectionShape[] = [];
  for (const block of blocks) {
    const box = block.getBoundingClientRect();
    const style = getComputedStyle(block);
    if (box.height < 48 || box.width < 0.3 * vw || style.display === 'none' || style.visibility === 'hidden') continue;
    const parts = Array.from(block.querySelectorAll('*')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width >= 0.18 * box.width && r.width <= 0.92 * box.width && r.height >= 60 && r.top < box.bottom && r.bottom > box.top;
    });
    const lefts: number[] = [];
    for (const el of parts) { const x = el.getBoundingClientRect().left; if (!lefts.some(seen => Math.abs(seen - x) < 24)) lefts.push(x); }
    const media = Array.from(block.querySelectorAll('img,video,picture')).map(el => el.getBoundingClientRect()).filter(r => r.width > 40 && r.height > 40);
    const area = media.reduce((sum, r) => sum + r.width * r.height, 0) / Math.max(1, box.width * box.height);
    const widest = media.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const center = widest ? (widest.left + widest.right) / 2 - box.left : 0;
    const side: SectionShape['side'] = !widest ? 'none' : widest.width > 0.9 * box.width ? 'full' : center < 0.4 * box.width ? 'left' : center > 0.6 * box.width ? 'right' : 'center';
    const heading = block.querySelector('h1,h2,h3');
    const align = heading ? (getComputedStyle(heading).textAlign === 'center' ? 'center' : 'left') : 'none';
    const ratio = box.height / vh;
    out.push({ cols: Math.min(4, Math.max(1, lefts.length)), media: area === 0 ? 0 : area < 0.3 ? 1 : area < 0.6 ? 2 : 3, side, bleed: box.width >= 0.98 * vw && Boolean(widest && widest.width >= 0.98 * vw),
      tall: ratio < 0.4 ? 0 : ratio < 0.8 ? 1 : ratio < 1.2 ? 2 : 3, align });
  }
  return out;
}

const KEYS: Array<keyof SectionShape> = ['cols', 'media', 'side', 'bleed', 'tall', 'align'];
/** 0 when two sections are composed the same way, 1 when every trait differs. */
export function shapeDistance(a: SectionShape, b: SectionShape): number { return KEYS.filter(key => a[key] !== b[key]).length / KEYS.length; }

/** Edit distance between two homes' section sequences (insert/delete cost 1, substitute = shapeDistance), over the longer length:
 *  0 = the same skeleton, 1 = nothing in common. */
export function signatureDistance(a: readonly SectionShape[], b: readonly SectionShape[]): number {
  if (!a.length && !b.length) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + shapeDistance(a[i - 1], b[j - 1]));
      diagonal = above;
    }
  }
  return Number((row[b.length] / Math.max(a.length, b.length)).toFixed(3));
}
