import { STOREFRONT_PAGES } from '@pagosya/shared-types';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/**
 * The standard pages for a store the generator WROTE, rather than one the engine renders from React
 * (spec 2026-09-30-store-page-architecture-design; `source-content-pages.ts` is the React counterpart).
 *
 * Nothing here is new capability. `packages/storefront-kit/kit/commerce.js` already fills
 * `[data-pagosya-page]` from the merchant's real settings (`infoBody`, line 1214) and fills
 * `[data-pagosya-pages]` with links to whichever pages have content plus the customer's account link
 * (line 1236) — in plain JS, on any page that loads it, with no framework involved. The authored
 * pipeline simply never grew the pages that carry those two hooks, so a merchant who kept an authored
 * store had no cookies, privacy or terms page, and no account navigation beyond the runtime's fallback.
 *
 * A page is the store's own `index.html` with its `<main>` swapped for the mount, which is what the
 * React side gets by reusing `<Shell>`: same head, same header, same footer, same stylesheet, so a
 * standard page cannot drift from the design the merchant approved.
 */

/** The same filter the React side uses, so both pipelines offer the merchant exactly one set of pages. */
const PAGES = STOREFRONT_PAGES.filter(page => page.kind).map(page => ({ url: page.url, kind: page.kind!, label: page.label }));

/** The runtime fills this with the information links and the account link; it stays hidden until it does. */
const NAV_SLOT = '<nav data-pagosya-pages class="pagosya-info-nav" aria-label="Información" hidden></nav>';

/** The index of `needle` when the string holds exactly one, else -1: ambiguity is declined, never guessed. */
const onlyIndexOf = (haystack: string, needle: string): number => {
  const first = haystack.indexOf(needle);
  return first >= 0 && haystack.indexOf(needle, first + 1) < 0 ? first : -1;
};

/**
 * The footer nav slot inserted before the single closing `</footer>`, or null when the page already has a
 * slot or its footer cannot be found safely. Mirrors `withNavSlot` on the React side: more than one
 * closing tag means the surgery could land in the wrong element, so it is declined rather than guessed.
 */
export function withStaticNavSlot(html: string): string | null {
  if (html.includes('data-pagosya-pages')) return null;
  const close = onlyIndexOf(html, '</footer>');
  if (close < 0) return null;
  return `${html.slice(0, close)}  ${NAV_SLOT}\n  ${html.slice(close)}`;
}

/** Everything inside `<main …>` replaced by the mount, keeping the element's own attributes so the page keeps
 *  the store's layout and spacing. Null when there is no single unambiguous main to stand in for. */
function withPageMount(html: string, kind: string, label: string): string | null {
  const open = onlyIndexOf(html, '<main');
  const close = onlyIndexOf(html, '</main>');
  if (open < 0 || close < 0 || close < open) return null;
  const openEnd = html.indexOf('>', open);
  if (openEnd < 0 || openEnd > close) return null;
  const page = `${html.slice(0, openEnd + 1)}\n    <div data-pagosya-page="${kind}"></div>\n  ${html.slice(close)}`;
  // The authored title describes the homepage, and this is a different page. The platform still owns the
  // rest of the head and rewrites the SEO block on publication.
  return page.replace(/<title>[\s\S]*?<\/title>/, `<title>${label}</title>`);
}

/**
 * Adds the standard pages, and the footer navigation that links them, to an authored (static) store.
 *
 * Idempotent: a page the store already has is left alone, and a footer that already carries a slot is not
 * touched. A store with no `index.html` to build from comes back unchanged, exactly as the React side
 * returns a store with no `Shell.tsx` unchanged.
 */
export function withStaticStandardPages(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; added: string[]; slotAdded: boolean } {
  const index = files.find(file => file.path === 'index.html' && file.encoding !== 'base64');
  if (!index) return { files, added: [], slotAdded: false };

  const added: SourceProjectFileDto[] = [];
  for (const page of PAGES) {
    if (files.some(file => file.path === page.url)) continue;
    // The slot is applied to the shell first, so every page this adds carries the footer navigation too.
    const content = withPageMount(withStaticNavSlot(index.content) ?? index.content, page.kind, page.label);
    if (content) added.push({ path: page.url, content });
  }

  // The pages the store already had need the slot as well, or the navigation appears only on the new ones.
  let slotAdded = false;
  const patched = files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path)) return file;
    const withSlot = withStaticNavSlot(file.content);
    if (!withSlot) return file;
    slotAdded = true;
    return { ...file, content: withSlot };
  });

  return { files: [...patched, ...added], added: added.map(page => page.path), slotAdded };
}
