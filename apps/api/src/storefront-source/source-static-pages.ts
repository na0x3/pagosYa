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

/** The customer-access and account pages, as the React side's ACCOUNT_PAGES: the gate view is the key's last segment. */
const ACCOUNT_PAGES = STOREFRONT_PAGES.filter(page => page.owner === 'account').map(page => ({ url: page.url, view: page.key.split('/')[1], label: page.label }));

/** The pages this module writes. They are copies of the store's own index.html, rebuilt from it at every save,
 *  so a redesign leaves them out of what it shows the model. */
export const STATIC_STANDARD_PAGE_PATHS: readonly string[] = [...PAGES, ...ACCOUNT_PAGES].map(page => page.url);

/** The copy and gate rules of the kit's AccountGatePage (packages/storefront-kit/kit/ui.tsx), which an authored store
 *  cannot import. The store runtime draws the account forms in the container where a trusted parent answers its account
 *  bridge (Studio, full-window preview, published store); an exported site keeps the button, pointed at the account app. */
const GATE_COPY: Record<string, { title: string; lead: string; action: string }> = {
  login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y guarda tus datos para comprar más rápido.', action: 'Ingresar' },
  register: { title: 'Crea tu cuenta', lead: 'Con una cuenta sigues tus pedidos y guardas tus direcciones.', action: 'Crear cuenta' },
  'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace a tu correo para elegir una contraseña nueva.', action: 'Recuperar contraseña' },
  'reset-password': { title: 'Elige una contraseña nueva', lead: 'Pide un enlace a tu correo y desde ahí eliges la contraseña nueva.', action: 'Pedir un enlace' },
  orders: { title: 'Mis pedidos', lead: 'Mira el estado y el detalle de tus compras.', action: 'Ver mis pedidos' },
  addresses: { title: 'Mis direcciones', lead: 'Guarda y cambia las direcciones donde recibes tus pedidos.', action: 'Ver mis direcciones' },
  profile: { title: 'Mi perfil', lead: 'Cambia tus datos, descarga tu información o elimina tu cuenta.', action: 'Ver mi perfil' },
  subscriptions: { title: 'Mis suscripciones', lead: 'Revisa y administra tus entregas recurrentes.', action: 'Ver mis suscripciones' },
};
const GATE_CSS = '.ui-account-gate{box-sizing:border-box;min-height:45vh;padding-block:clamp(40px,6vw,88px)}.ui-account-gate>.ui-container{box-sizing:border-box;width:calc(100% - 48px);max-width:1120px;margin-inline:auto}.ui-account-gate h1{max-width:22ch;margin:0 0 28px;font-size:clamp(32px,4.5vw,60px);line-height:1.08;text-wrap:balance}.ui-account-gate p{font-size:clamp(17px,1.4vw,21px);line-height:1.6;max-width:48ch;margin:0 0 32px}.ui-account-gate .ui-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:48px;max-width:100%;padding:14px 24px;font:inherit;font-weight:700;text-decoration:none;border:1px solid currentColor;color:inherit}.ui-account-gate .ui-button[aria-disabled=true]{opacity:.55}@media(max-width:600px){.ui-account-gate>.ui-container{width:calc(100% - 32px)}.ui-account-gate .ui-button{width:100%}}';
const gateMarkup = (view: string) => {
  const copy = GATE_COPY[view];
  return `<section class="ui-account-gate" data-account-gate="${view}"><style data-pagosya-standard-pages>${GATE_CSS}</style><div class="ui-container"><h1>${copy.title}</h1><p>${copy.lead}</p><a class="ui-button" href="#" data-pagosya-account="${view}">${copy.action}</a></div></section>`;
};

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

/** Everything inside `<main …>` replaced by `content`, keeping the element's own attributes so the page keeps
 *  the store's layout and spacing. Null when there is no single unambiguous main to stand in for. */
function withPageMount(html: string, content: string, label: string): string | null {
  const open = onlyIndexOf(html, '<main');
  const close = onlyIndexOf(html, '</main>');
  if (open < 0 || close < 0 || close < open) return null;
  const openEnd = html.indexOf('>', open);
  if (openEnd < 0 || openEnd > close) return null;
  const page = `${html.slice(0, openEnd + 1)}\n    ${content}\n  ${html.slice(close)}`;
  // The authored title describes the homepage, and this is a different page. The platform still owns the
  // rest of the head and rewrites the SEO block on publication.
  return page.replace(/<title>[\s\S]*?<\/title>/, `<title>${label}</title>`);
}

/** Section links the homepage keeps in its header and footer (`href="#catalogo"`) point at ids that live in its
 *  `<main>`, which a standard page replaces. Those links go to the homepage instead; a link whose id is still on the
 *  page, a bare `#`, and every non-hash link stay as they are. Standard pages are top-level files, so no `../`. */
function relinkMissingAnchors(html: string): string {
  const ids = new Set([...html.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => m[1] ?? m[2]));
  return html.replace(/(\shref\s*=\s*)(["'])#([^"'\s]+)\2/g, (whole, head: string, quote: string, name: string) =>
    ids.has(name) ? whole : `${head}${quote}index.html#${name}${quote}`);
}

/**
 * Adds the standard pages, and the footer navigation that links them, to an authored (static) store.
 *
 * Idempotent: a page the store already has is left alone, and a footer that already carries a slot is not
 * touched. A store with no `index.html` to build from comes back unchanged, exactly as the React side
 * returns a store with no `Shell.tsx` unchanged.
 */
/** What sits inside the single `<main …>`, trimmed; null when there is no unambiguous main. */
function mainInner(html: string): string | null {
  const open = onlyIndexOf(html, '<main');
  const close = onlyIndexOf(html, '</main>');
  if (open < 0 || close < 0 || close < open) return null;
  const openEnd = html.indexOf('>', open);
  return openEnd < 0 || openEnd > close ? null : html.slice(openEnd + 1, close).trim();
}

export function withStaticStandardPages(files: SourceProjectFileDto[]): { files: SourceProjectFileDto[]; added: string[]; refreshed: string[]; slotAdded: boolean } {
  const index = files.find(file => file.path === 'index.html' && file.encoding !== 'base64');
  if (!index) return { files, added: [], refreshed: [], slotAdded: false };

  const added: SourceProjectFileDto[] = [];
  // A page that is still the platform's own copy (its main holds only the stock mount) is rebuilt from the current
  // index.html, so a header or footer fixed later reaches it too. A page someone authored is left alone.
  const refreshed = new Map<string, string>();
  const standard = [
    ...PAGES.map(page => ({ url: page.url, label: page.label, mount: `<div data-pagosya-page="${page.kind}"></div>` })),
    ...ACCOUNT_PAGES.filter(page => GATE_COPY[page.view]).map(page => ({ url: page.url, label: page.label, mount: gateMarkup(page.view) })),
  ];
  for (const page of standard) {
    const existing = files.find(file => file.path === page.url);
    if (existing && (existing.encoding === 'base64' || mainInner(existing.content) !== page.mount.trim())) continue;
    // The slot is applied to the shell first, so every page this adds carries the footer navigation too.
    let content = withPageMount(withStaticNavSlot(index.content) ?? index.content, page.mount, page.label);
    if (!content) continue;
    content = relinkMissingAnchors(content);
    if (!existing) added.push({ path: page.url, content });
    else if (content !== existing.content) refreshed.set(page.url, content);
  }

  // The pages the store already had need the slot as well, or the navigation appears only on the new ones.
  let slotAdded = false;
  const patched = files.map(file => {
    const rebuilt = refreshed.get(file.path);
    if (rebuilt !== undefined) return { ...file, content: rebuilt };
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path)) return file;
    const withSlot = withStaticNavSlot(file.content);
    if (!withSlot) return file;
    slotAdded = true;
    return { ...file, content: withSlot };
  });

  return { files: [...patched, ...added], added: added.map(page => page.path), refreshed: [...refreshed.keys()], slotAdded };
}
