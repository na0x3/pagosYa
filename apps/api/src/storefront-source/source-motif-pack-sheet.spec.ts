jest.setTimeout(90_000);
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks } from './source-motif-packs';

/** Every pack drawing at the size the kit renders it, on a light and a dark paper: the drawings must stay inside their
 * viewBox, and the sheets in tmp/identity-shots are looked at before a batch is committed. */
const SHOTS = join(__dirname, '../../../../tmp/identity-shots');
const SIZE: Record<string, [number, number]> = { 'button.svg': [24, 24], 'pattern.svg': [96, 96], 'divider.svg': [64, 24], 'sticker.svg': [48, 48], 'empty.svg': [64, 64] };

it('draws every pack inside its viewBox, on light and dark paper (contact sheets in tmp/identity-shots)', async () => {
  mkdirSync(SHOTS, { recursive: true });
  const rows = listMotifPacks().map(pack => `<tr><th>${pack.id}</th>${Object.keys(SIZE).map(file => `<td><span data-file="${pack.id}/${file}" style="display:inline-block;width:${SIZE[file][0]}px;height:${SIZE[file][1]}px">${readFileSync(kitPath('motif-packs', pack.id, file), 'utf8')}</span></td>`).join('')}</tr>`).join('');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, paper, ink] of [['light', '#fbf6ee', '#8a3b12'], ['dark', '#161412', '#f3c77a']]) {
      const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
      await page.setContent(`<!doctype html><html><head><style>body{margin:16px;background:${paper};color:${ink};font:12px sans-serif}[data-file] svg{display:block;width:100%;height:100%}td{padding:8px 12px}</style></head><body><table>${rows}</table></body></html>`);
      const escaped = await page.$$eval('[data-file] > svg', svgs => svgs.flatMap(svg => {
        const box = (svg as SVGSVGElement).getBBox(), view = (svg as SVGSVGElement).viewBox.baseVal;
        const inside = box.width > 0 && box.height > 0 && box.x >= view.x - 1 && box.y >= view.y - 1 && box.x + box.width <= view.x + view.width + 1 && box.y + box.height <= view.y + view.height + 1;
        return inside ? [] : [(svg.parentElement as HTMLElement).dataset.file];
      }));
      expect(escaped).toEqual([]);
      await page.screenshot({ path: join(SHOTS, `motif-packs-${name}.png`), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});
