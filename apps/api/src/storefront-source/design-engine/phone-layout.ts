/// <reference lib="dom" />
/**
 * Headlines that still split a word after the kit fits them (baek, 2026-10-16): a chat edit re-set the hero to two columns
 * outside any media query, after the phone rule, so at 390px the headline sat in a ~70px column, one letter per line. The
 * design review measured this on builds only; edits now get it beside the header gate. Never calls a model and never writes.
 */
import type { Page } from 'playwright';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import type { SourceProjectSnapshot } from '../source-project';
import { HEADER_CHECK_WIDTHS } from './header-clickable';

/** `column` is the heading's own width in px, the number that tells a squeezed column from a single long word. */
export type BrokenHeading = { width: number; word: string; heading: string; column: number };

/** h1/h2 only, as the design review: the layout baseline lets smaller headings break anywhere by design. */
export async function measureBrokenHeadings(page: Page): Promise<BrokenHeading[]> {
  const width = page.viewportSize()?.width ?? 0;
  const found = await page.evaluate(() => {
    const out: Array<{ word: string; heading: string; column: number }> = [];
    for (const heading of Array.from(document.querySelectorAll('h1,h2'))) {
      const box = heading.getBoundingClientRect();
      // A box under 2px is visually hidden text.
      if (box.width < 2 || box.height < 2) continue;
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && out.length < 6; node = walker.nextNode()) {
        for (const match of (node.textContent || '').matchAll(/[\p{L}\p{N}]{4,}/gu)) {
          const range = document.createRange();
          range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
          const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
          if (lines.size > 1 && !out.some(item => item.word === match[0])) out.push({ word: match[0], heading: (heading.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), column: Math.round(box.width) });
        }
      }
    }
    return out;
  });
  return found.map(item => ({ width, ...item }));
}

/** index.html in its own offline sandbox, at desktop and phone widths, after the kit's headline fitting has run. */
export async function captureBrokenHeadings(snapshot: SourceProjectSnapshot, signal?: AbortSignal): Promise<BrokenHeading[]> {
  const broken: BrokenHeading[] = [];
  await withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html', undefined, true).query, signal, false, async context => {
    for (const width of HEADER_CHECK_WIDTHS) {
      signal?.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      page.setDefaultTimeout(7000);
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      // The fitting runs on the next frame after the fonts; give it time to settle.
      await page.waitForTimeout(500);
      broken.push(...await measureBrokenHeadings(page));
      await page.close();
    }
  }, 'no-preference');
  return broken;
}

/** The breaks a save brings in: a word already split at that width in the saved revision is not this save's to fix. */
export function introducedBrokenHeadings(current: BrokenHeading[], previous: BrokenHeading[]): BrokenHeading[] {
  const key = (item: BrokenHeading) => `${item.width}|${item.word}`;
  const saved = new Set(previous.map(key));
  return current.filter(item => !saved.has(key(item)));
}

/** One sentence per heading and width, in the Spanish of the neighbouring measured facts. */
export function brokenHeadingProblems(broken: BrokenHeading[]): string[] {
  const groups = new Map<string, BrokenHeading[]>();
  for (const item of broken) groups.set(`${item.width}|${item.heading}`, [...(groups.get(`${item.width}|${item.heading}`) ?? []), item]);
  return [...groups.values()].map(group => {
    const first = group[0], words = group.map(item => `«${item.word}»`).join(', ');
    return `${first.width}px: el título «${first.heading}» corta ${words} a mitad de palabra porque su columna mide solo ${first.column}px.`
      + ' Suele pasar cuando una regla de escritorio escrita más abajo en el CSS, fuera de un @media, deshace la regla del teléfono:'
      + ' pon esa regla dentro de un @media (min-width: …) o vuelve a escribir la del teléfono después de ella, para que en el teléfono el título tenga el ancho de la pantalla.';
  });
}
