/// <reference lib="dom" />
import type { Page } from 'playwright';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import type { SourceProjectSnapshot } from '../source-project';

/**
 * A header control the shopper cannot click because something else receives the click at its centre (2026-10-12):
 * Ramo Ramón's fixed header sat inside an isolation:isolate poster, so the catalog painted over it on the way back up,
 * and Rampa's own never-opened cart drawer lay invisible over Buscar / Mi cuenta / Tu bolsa.
 * `trap` names the header ancestor whose stacking context holds the header's z-index down; `invisible` says why the
 * covering element is not seen (it still takes the click); `drawer` marks one that looks like a cart of the store's own.
 *
 * `under` turns it around (2026-10-16): the header hides one of the store's own links or buttons. baek asked for a login icon
 * «en el sidebar» and got a fixed sidebar of YAPI's own, drawn under the platform's side rail. `control` is then the store's
 * control, `cover` the header, `section` the fixed or sticky element holding the control ('' when the page itself holds it),
 * and `platform` says the header is the one the platform draws.
 */
export type HeaderCover = { width: number; control: string; cover: string; section: string; atTop: boolean; trap?: string; invisible?: string; drawer?: boolean; under?: boolean; platform?: boolean };

/** Desktop and phone, as the shopper has them. */
export const HEADER_CHECK_WIDTHS = [1440, 390] as const;

/**
 * Sweeps the loaded page from the top down (at most `maxPositions` stops, top included) and, at each stop, asks the
 * browser what a click at the centre of every visible header control would land on. Each stop scrolls 120px past its
 * position and wheels back up, so a header that hides on the way down is judged as it reappears.
 */
export async function measureHeaderCovers(page: Page, options: { maxPositions?: number } = {}): Promise<HeaderCover[]> {
  const viewport = page.viewportSize();
  if (!viewport) return [];
  const maxPositions = Math.max(1, options.maxPositions ?? 8);
  const scrollable = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const step = Math.max(350, Math.ceil(scrollable / Math.max(1, maxPositions - 1)));
  const positions: number[] = [0];
  for (let y = step; y <= scrollable && positions.length < maxPositions; y += step) positions.push(y);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  const found = new Map<string, HeaderCover>();
  for (const y of positions) {
    if (y === 0) await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    else {
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y + 120);
      await page.waitForTimeout(60);
      await page.mouse.wheel(0, -120);
    }
    // Settle: the scroll has stopped and the header (or a wrapper) has finished its show/hide transition, at most 700ms.
    await page.evaluate(async () => {
      const header = document.querySelector('header,[role=banner]');
      const started = performance.now();
      let last = -1, still = 0;
      while (performance.now() - started < 700) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const moving = header ? document.getAnimations().some(animation => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return animation.playState === 'running' && target && (target.contains(header) || header.contains(target)) && animation.effect?.getTiming().iterations !== Infinity;
        }) : false;
        if (scrollY === last && !moving) { if (++still >= 3) break; } else still = 0;
        last = scrollY;
      }
    });
    const atTop = y === 0;
    const hits = await page.evaluate(() => {
      const describe = (el: Element) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + Array.from(el.classList).slice(0, 2).map(name => '.' + name).join('');
      const header = Array.from(document.querySelectorAll('header,[role=banner]')).find(el => !el.closest('article,footer,dialog,[data-pagosya-cart]') && el.getBoundingClientRect().height > 0);
      if (!header) return [];
      const visible = (el: Element) => typeof (el as any).checkVisibility === 'function' ? (el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden';
      // Why an ancestor holds a stacking context of its own, or '' when it does not.
      const stacking = (el: Element) => {
        const style = getComputedStyle(el), parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
        if (style.isolation === 'isolate') return 'isolation:isolate';
        if (style.transform !== 'none') return 'transform';
        if (style.translate !== 'none' || style.rotate !== 'none' || style.scale !== 'none') return 'transform';
        if (style.filter !== 'none') return 'filter';
        if ((style as any).backdropFilter && (style as any).backdropFilter !== 'none') return 'backdrop-filter';
        if (style.perspective !== 'none') return 'perspective';
        if (style.clipPath !== 'none') return 'clip-path';
        if (Number(style.opacity) < 1) return `opacity:${style.opacity}`;
        if (style.mixBlendMode !== 'normal') return `mix-blend-mode:${style.mixBlendMode}`;
        if (/paint|layout|strict|content/.test(style.contain)) return `contain:${style.contain}`;
        if (/transform|opacity|filter|isolation/.test(style.willChange)) return `will-change:${style.willChange}`;
        if (style.position === 'fixed' || style.position === 'sticky') return `position:${style.position}`;
        if (style.zIndex !== 'auto' && (style.position !== 'static' || /flex|grid/.test(parent?.display || ''))) return `z-index:${style.zIndex}`;
        return '';
      };
      const out: Array<{ control: string; cover: string; section: string; trap?: string; invisible?: string; drawer?: boolean }> = [];
      for (const control of Array.from(header.querySelectorAll('a[href],button,[role=button],summary'))) {
        if (!visible(control)) continue;
        const box = control.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) continue;
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        // An ancestor receiving the click means the control itself has pointer-events:none: not something on top of it.
        if (!hit || hit === control || control.contains(hit) || hit.contains(control)) continue;
        // The layer that wins: the nearest positioned ancestor of the hit, or the hit itself.
        let layer: Element = hit;
        for (let node: Element | null = hit; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.position !== 'static') { layer = node; break; }
        }
        let fixed: Element | null = null;
        for (let node: Element | null = hit; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).position === 'fixed') { fixed = node; break; }
        const section = layer.parentElement?.closest('section,footer,aside,nav,main>*,[data-pagosya-catalog]');
        // The outermost stacking context around the header that does not also hold the covering element.
        let trap: string | undefined;
        for (let node = header.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
          if (node.contains(hit)) break;
          const reason = stacking(node);
          if (reason) trap = `${describe(node)} (${reason})`;
        }
        let invisible: string | undefined;
        if (!visible(hit)) {
          let opacityNode: Element | null = hit;
          while (opacityNode && opacityNode !== document.body && Number(getComputedStyle(opacityNode).opacity) > 0.05) opacityNode = opacityNode.parentElement;
          invisible = opacityNode && opacityNode !== document.body ? `opacity:${getComputedStyle(opacityNode).opacity}` : 'invisible';
        }
        const owner = fixed || layer;
        const words = [owner.className, ...Array.from(owner.attributes).filter(attribute => attribute.name.startsWith('data-') || attribute.name === 'aria-label').map(attribute => attribute.name + ' ' + attribute.value)].join(' ');
        const drawer = Boolean(invisible && fixed && !fixed.closest('[data-pagosya-cart]') && /cart|carrito|bolsa|cesta|basket|drawer/i.test(words));
        const clone = control.cloneNode(true) as Element;
        clone.querySelectorAll('[data-cart-count]').forEach(count => count.remove());
        const label = ((control.getAttribute('aria-label') || clone.textContent || control.getAttribute('title') || control.querySelector('img')?.getAttribute('alt') || '').replace(/\s+/g, ' ').trim() || describe(control)).slice(0, 40);
        const cover = describe(invisible && fixed ? fixed : layer);
        out.push({ control: label, cover, section: section && /[.#]|^(section|footer|aside|nav|main)/.test(describe(section)) ? describe(section) : '', ...(trap && !invisible ? { trap } : {}), ...(invisible ? { invisible } : {}), ...(drawer ? { drawer } : {}) });
      }
      return out;
    });
    // The store's own controls the header hides: a quarter or more of the control lies under the header, and the header (not
    // the control) takes a click there. Content that only scrolls under a sticky header is fine; content the header hides at
    // the top of the page, or a fixed or sticky element (a sidebar, a bar) that stays under it, is not.
    const under = await page.evaluate(atTop => {
      const describe = (el: Element) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + Array.from(el.classList).slice(0, 2).map(name => '.' + name).join('');
      const header = Array.from(document.querySelectorAll('header,[role=banner]')).find(el => !el.closest('article,footer,dialog,[data-pagosya-cart]') && el.getBoundingClientRect().height > 0);
      if (!header) return [];
      const visible = (el: Element) => typeof (el as any).checkVisibility === 'function' ? (el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden';
      const area = header.getBoundingClientRect();
      const out: Array<{ control: string; cover: string; section: string; under: true; platform: boolean }> = [];
      for (const control of Array.from(document.querySelectorAll('a[href],button,[role=button],summary,input:not([type=hidden]),select,textarea'))) {
        if (header.contains(control) || control.closest('[data-pagosya-cart],[data-pagosya-header-menu],dialog') || !visible(control)) continue;
        const box = control.getBoundingClientRect();
        if (box.width < 4 || box.height < 4 || box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) continue;
        const left = Math.max(box.left, area.left), right = Math.min(box.right, area.right), top = Math.max(box.top, area.top), bottom = Math.min(box.bottom, area.bottom);
        if (right <= left || bottom <= top || (right - left) * (bottom - top) < 0.25 * box.width * box.height) continue;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (!hit || !header.contains(hit)) continue;
        let holder: Element | null = null;
        for (let node: Element | null = control; node && node !== document.body; node = node.parentElement) if (/fixed|sticky/.test(getComputedStyle(node).position)) { holder = node; break; }
        if (!holder && !atTop) continue;
        const label = ((control.getAttribute('aria-label') || control.textContent || control.getAttribute('title') || control.querySelector('img')?.getAttribute('alt') || '').replace(/\s+/g, ' ').trim() || describe(control)).slice(0, 40);
        out.push({ control: label, cover: describe(header), section: holder ? describe(holder) : '', under: true, platform: header.hasAttribute('data-pagosya-header') });
      }
      return out;
    }, atTop);
    for (const hit of [...hits, ...under] as Array<Omit<HeaderCover, 'width' | 'atTop'>>) {
      const key = `${hit.under ? 'under|' : ''}${hit.control}|${hit.cover}`;
      if (!found.has(key)) found.set(key, { width: viewport.width, ...hit, atTop });
    }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  return [...found.values()];
}

/** index.html in its own offline sandbox, at desktop and phone widths. */
export async function captureHeaderCovers(snapshot: SourceProjectSnapshot, signal?: AbortSignal): Promise<HeaderCover[]> {
  const covers: HeaderCover[] = [];
  await withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html', undefined, true).query, signal, false, async context => {
    for (const width of HEADER_CHECK_WIDTHS) {
      signal?.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      page.setDefaultTimeout(7000);
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(300);
      covers.push(...await measureHeaderCovers(page));
      await page.close();
    }
  }, 'no-preference');
  return covers;
}

const quoted = (labels: string[]) => {
  const names = labels.map(label => `«${label}»`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0];
};

/**
 * One sentence per cause and width, in the Spanish of the neighbouring measured facts. Covers that share a trapping wrapper are
 * one problem however many sections paint over the header (Ramo Ramón had 17), so they read as one fix.
 */
export function headerCoverProblems(covers: HeaderCover[]): string[] {
  const groups = new Map<string, HeaderCover[]>();
  for (const cover of covers) {
    const key = cover.under ? ['under', cover.width, cover.section, cover.platform].join('|')
      : cover.trap && !cover.invisible ? [cover.width, cover.trap, cover.atTop].join('|') : [cover.width, cover.cover, cover.section, cover.invisible, cover.drawer, cover.atTop].join('|');
    groups.set(key, [...(groups.get(key) ?? []), cover]);
  }
  return [...groups.values()].map(group => {
    const first = group[0], labels = [...new Set(group.map(cover => cover.control))], many = labels.length > 1;
    if (first.under) {
      const where = group.some(cover => cover.atTop) ? 'arriba de la página' : 'al bajar por la página';
      const lead = `${first.width}px: el encabezado${first.platform ? ' de la plataforma' : ''} tapa ${quoted(labels.slice(0, 6))}${first.section ? ` de ${first.section}` : ''} ${where}.`;
      return lead + (first.platform && first.section
        ? ` La tienda ya tiene su menú en el encabezado de la plataforma: no hagas un encabezado, barra lateral ni menú propio. Quita ${first.section}; si son secciones de la página, se llega a ellas desde el menú de la plataforma con data-nav-label en index.html. Si es otro contenido, colócalo fuera de la zona del encabezado.`
        : ' Ese contenido queda debajo del encabezado y no se puede pulsar: déjale espacio al encabezado (por ejemplo padding-top o margin-left del tamaño del encabezado) o muévelo fuera de su zona; nunca dibujes un encabezado, barra lateral ni menú propio.');
    }
    const coverers = [...new Set(group.map(cover => cover.cover + (cover.section ? ` (en ${cover.section})` : '')))];
    const shown = coverers.length > 3 ? [...coverers.slice(0, 2), `${coverers.length - 2} elementos más`] : coverers;
    const named = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} y ${shown.at(-1)}` : shown[0];
    const where = first.atTop ? 'arriba de la página' : 'al bajar y volver a subir';
    const lead = `${first.width}px: ${many ? 'los controles' : 'el control'} ${quoted(labels)} del encabezado no se ${many ? 'pueden' : 'puede'} pulsar: ${where} ${many ? 'los' : 'lo'} tapa ${named}.`;
    const cause = first.drawer
      ? ` ${first.cover} es un elemento fijo invisible (${first.invisible}) que sigue recibiendo clics y parece un carrito propio: quítalo, la plataforma ya pone el carrito (los botones [data-cart-open] abren el suyo). Si no es un carrito, cuando esté cerrado dale pointer-events:none y visibility:hidden.`
      : first.invisible
        ? ` ${first.cover} es un elemento fijo invisible (${first.invisible}) que sigue recibiendo clics: cuando esté cerrado dale pointer-events:none y visibility:hidden (o display:none).`
        : first.trap
          ? ` El encabezado está dentro de ${first.trap}, que crea su propio contexto de apilamiento, así que su z-index no puede quedar sobre el contenido que viene después: saca el <header> de ese contenedor (hijo directo de <body>) o quita esa propiedad del contenedor.`
          : ' Ese contenido queda por encima del encabezado: dale al encabezado position:sticky o fixed con un z-index mayor que el de ese contenido, sin envolverlo en un contenedor con isolation, transform, filter o z-index propio.';
    return lead + cause;
  });
}

/**
 * The covers a save brings in (524dfd73): a control already covered at that width in the saved revision is not this
 * save's to fix, whatever covers it now.
 */
export function introducedHeaderCovers(current: HeaderCover[], previous: HeaderCover[]): HeaderCover[] {
  const key = (cover: HeaderCover) => `${cover.width}|${cover.under ? 'under|' : ''}${cover.control}`;
  const saved = new Set(previous.map(key));
  return current.filter(cover => !saved.has(key(cover)));
}
