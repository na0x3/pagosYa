import { evaluateSourceMediaDesign, evaluateStripRuns, type SourceMediaPolicy } from '../source-media-design';
/// <reference lib="dom" />
import sharp from 'sharp';
import { evaluateRequirements } from './agent-checks';
import { STOREFRONT_PAGES, sourceAccountBranding, accountPreviewHtml, accountFormStyles } from '@pagosya/shared-types';
import { agentImagePaths, type AgentRequirement, type RequirementEvidence, type ValidationProfile } from './agent-task';
import type { SourceProjectBriefDto, SourceProjectFileDto } from '../dto/save-source-project.dto';
import { nextSourceFile, nextProjectScaffold, isNextSource } from '../source-next';
import { SourceProjectsService } from '../source-projects.service';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import { withSourceAssets } from '../source-asset-library';

/** The merchant's own uploaded photos: served by the API on the live store, unreachable from the sandbox (live 2026-10-19). */
const STORE_UPLOAD = /^https?:\/\/[^/]+\/(?:api\/)?v1\/uploads\/[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif)$/i;

export type AgentPreviewBase = { brief: SourceProjectBriefDto; files: SourceProjectFileDto[] };
/** `sections`: the same page cut top to bottom into at most six readable slices, for the agent's own look at its work. */
export type AgentShot = { width: 1280 | 820 | 390; image: string; thumbnail: string; errors: string[]; evidence: RequirementEvidence[]; sections?: string[] };

/** One full-page image shrunk to 2400 px tall made a 9,500 px desktop page 323 px wide, and the agent signed off a title sitting on
 *  a photo (Gramiyaa 2026-10-26). Even slices, each at most 1024 px wide and never enlarged, keep text and edges readable. */
export async function agentShotSections(png: Buffer, max = 6): Promise<string[]> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  if (!width || !height) return [];
  const count = Math.min(max, Math.max(1, Math.ceil(height / (width > 600 ? width * 1.1 : width * 2.2))));
  const tall = Math.ceil(height / count);
  const slices: string[] = [];
  for (let top = 0; top < height; top += tall) {
    const slice = await sharp(png).extract({ left: 0, top, width, height: Math.min(tall, height - top) }).resize({ width: Math.min(width, 1024), withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    slices.push(`data:image/jpeg;base64,${slice.toString('base64')}`);
  }
  return slices;
}

/** The draft as a site the sandbox can open: the store's runtime files with this draft's pages, compiled by prepare(). */
export async function agentPreviewSnapshot(base: AgentPreviewBase, authored: SourceProjectFileDto[]) {
  let runtime = base.files.filter(f => !nextSourceFile(f.path) && !f.path.startsWith('_compiled/'));
  // Scratch workspaces contain authored components only; the platform owns this non-design scaffold.
  if (!isNextSource(runtime)) runtime = [...runtime, ...nextProjectScaffold('preview')].filter((file, index, all) => all.findIndex(other => other.path === file.path) === index);
  const files = await withSourceAssets([...runtime, ...authored], base.files);
  return new SourceProjectsService({} as any).prepare({ revision: 0, label: 'Borrador de YAPI', brief: base.brief, files } as any);
}

export async function captureAgentDraft(snapshot: Awaited<ReturnType<typeof agentPreviewSnapshot>>, width: 1280 | 820 | 390, signal?: AbortSignal, entry = 'index.html', requirements: AgentRequirement[] = [], profile: ValidationProfile = 'normal', mediaPolicy?: SourceMediaPolicy): Promise<AgentShot> {
  if (!/^[a-z0-9-]+\.html$/.test(entry) || !snapshot.files.some(f => f.path === entry)) throw new Error('La página solicitada no existe: ' + entry);
  const errors: string[] = [];
  let evidence: RequirementEvidence[] = [];
  // The sandbox serves only query-less URLs; the preview query reaches the page through its init script.
  const png = await withVisualSandbox(snapshot, sourceVisualState(snapshot, entry, undefined, true).query, signal, false, async context => {
    const page = await context.newPage();
    page.on('pageerror', error => { if (errors.length < 5) errors.push(error.message.slice(0, 300)); });
    page.on('dialog', dialog => { void dialog.dismiss(); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const accountPage = STOREFRONT_PAGES.find(p => p.url === entry && p.owner === 'account');
    // A kit store draws its own account form, the account theme included, once the trusted parent answers: stand in
    // for a signed-out shopper, as account-theme-check does. Pasting the older checkout form over it hid every
    // [data-part] the agent planned on and the theme it was editing (PEPPA please 2026-10-20).
    if (accountPage) await page.addInitScript(() => { (window as any).PAGOSYA_ACCOUNT_REQUEST = async () => ({ ok: true, body: { signedIn: false } }); });
    await page.goto(`https://preview.invalid/${entry}`, { waitUntil: 'load', timeout: 12_000 });
    const kitAccount = accountPage ? await page.waitForSelector('[data-account-gate] [data-part=form]', { timeout: 4000 }).then(() => true, () => false) : false;
    if (accountPage && !kitAccount) {
      // The same trusted markup and styles as checkout, with no session, API, or form submission.
      // The offline sandbox stays closed to all network and frames.
      const context = { slug: 'preview', storeName: 'Vista previa', signedIn: false, preview: true };
      const brand = sourceAccountBranding({ name: context.storeName }, snapshot);
      const mounted = await page.evaluate(({ html, css, brand }) => {
        const slot = document.querySelector('[data-account-gate] .ui-container');
        if (!slot) return false;
        slot.innerHTML = '';
        const surface = document.createElement('div'); surface.className = 'account-page account-embedded';
        for (const [key, value] of Object.entries({ background:brand.background, foreground:brand.foreground, accent:brand.accent, 'accent-foreground':brand.accentForeground, 'body-font':brand.bodyFont, 'heading-font':brand.headingFont, radius:brand.radius })) surface.style.setProperty('--account-' + key, value);
        const style = document.createElement('style'); style.textContent = css;
        surface.innerHTML = html; surface.prepend(style); slot.append(surface);
        surface.addEventListener('submit', e => e.preventDefault());
        return true;
      }, { html: accountPreviewHtml(context, accountPage.view!), css: accountFormStyles, brand });
      if (!mounted) errors.push('No existe el espacio para el formulario de cuenta protegido.');
    }
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.evaluate(async () => {
      for (const img of Array.from(document.images)) img.loading = 'eager';
      await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {})));
    });
    if (requirements.some(r => r.page === entry && r.check === 'video' && (r.profile || 'normal') === profile)) {
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.querySelectorAll('video')).map(video => new Promise<void>(resolve => {
          if (video.readyState >= 2 || video.error) return resolve();
          const timer = setTimeout(done, 5000);
          function done() { clearTimeout(timer); video.removeEventListener('loadeddata', done); video.removeEventListener('error', done); resolve(); }
          video.addEventListener('loadeddata', done); video.addEventListener('error', done); video.preload = 'auto'; video.load();
        })));
      });
    }
    if (requirements.some(r => r.check === 'video-paused' && r.profile === profile)) await page.waitForTimeout(500);
    const health = await page.evaluate(() => ({
      // The runtime's second card photo has only data-src until the shopper reaches the card (commerce.js loadCardAlt).
      illustrations: Array.from(document.querySelectorAll<HTMLElement>('[data-illustration]')).map(el => el.dataset.illustration || ''),
      colourless: Array.from(document.querySelectorAll<HTMLElement>('[data-illustration]')).filter(el => { const colour = getComputedStyle(el).backgroundColor; return colour === 'transparent' || /^rgba\(.*,\s*0\)$/.test(colour); }).map(el => el.dataset.illustration || ''),
      missing: Array.from(document.images).filter(img => img.getBoundingClientRect().width > 0 && !img.naturalWidth && !img.matches('.menu-item__image-alt:not([src])')).map(img => img.getAttribute('src') || '(sin ruta)').slice(0, 8),
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      // Meathouse 2026-10-20: a sticky buy column stays stuck for its whole parent, so the reviews and «Combínalo con»
      // that YAPI put in the same grid scrolled under it. Measured without scrolling: what lies below it in its parent,
      // in its columns, is what it will slide over.
      stickyOver: Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el => getComputedStyle(el).position === 'sticky'
        // A sticky header is meant to ride over the page; the kit's own product parts are laid out for it.
        && !el.matches('header, nav, [role=banner], [class*="product-detail__"]') && !el.querySelector('nav') && el.getBoundingClientRect().width < innerWidth * 0.9).flatMap(el => {
        const parent = el.parentElement, box = el.getBoundingClientRect();
        if (!parent || !box.width || !box.height) return [];
        const end = parent.getBoundingClientRect().bottom;
        const under = Array.from(parent.children).filter(other => other !== el && !el.contains(other) && !other.contains(el)).some(other => {
          const r = other.getBoundingClientRect();
          return r.width > 0 && r.height > 24 && r.top >= box.bottom - 1 && r.top < end && r.left < box.right - 8 && r.right > box.left + 8;
        });
        return under ? [(el.className || el.tagName).toString().split(/\s+/)[0]] : [];
      }).slice(0, 4),
      // A positioned text (a big «01 / MH» index) laid over a button or a text link: the shopper cannot read either.
      textOverButton: Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el => ['absolute', 'fixed'].includes(getComputedStyle(el).position) && Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent!.trim())).flatMap(el => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) < 0.2) return [];
        // A viewport-pinned control (the kit's «Contacto» launcher, BAEK 2026-10-23) floats over whatever scrolls under it:
        // only text in the same fixed holder can collide with it for real.
        const pinned = (node: Element) => { for (let at: Element | null = node; at; at = at.parentElement) if (getComputedStyle(at).position === 'fixed') return at; return null; };
        const hit = Array.from(document.querySelectorAll<HTMLElement>('a, button')).find(control => {
          if (control.contains(el) || el.contains(control) || !(control.textContent || '').trim()) return false;
          const fixed = pinned(control);
          if (fixed && !fixed.contains(el)) return false;
          const r = control.getBoundingClientRect();
          const w = Math.min(box.right, r.right) - Math.max(box.left, r.left), h = Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top);
          return w > 0 && h > 0 && w * h > 0.15 * r.width * r.height;
        });
        return hit ? [`«${(el.textContent || '').trim().slice(0, 30)}» sobre «${(hit.textContent || '').trim().slice(0, 30)}»`] : [];
      }).slice(0, 4),
      // Text nearly the colour of what is behind it (BOXY 2026-10-25: a white title on a white card over a photo). Only a solid
      // ground counts: text over a photo or a gradient is left to the screenshot.
      lowContrast: (() => {
        // rgb()/rgba(), and color(srgb …) which color-mix() computes to; any other form is unknown (null).
        const rgb = (value: string) => {
          const plain = value.match(/^rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\)$/);
          if (plain) return [Number(plain[1]), Number(plain[2]), Number(plain[3]), plain[4] === undefined ? 1 : Number(plain[4])];
          const srgb = value.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
          return srgb ? [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])] : null;
        };
        const clear = (value: string) => value === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(value) || /\/ 0\)$/.test(value);
        const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        // What is painted behind the text's centre: a layer behind it may be a sibling, not a parent (a quote on a dark
        // panel drawn by a positioned div). The text is scrolled to mid-screen to read the stack there.
        const ground = (el: Element) => {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
          const at = el.getBoundingClientRect(), x = at.left + at.width / 2, y = at.top + at.height / 2;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
          const stack = document.elementsFromPoint(x, y);
          if (!stack.length) return null;
          // Text under another layer (the calm checkout over the store's footer) is covered, not low-contrast.
          if (!stack.some(layer => layer === el || el.contains(layer))) return null;
          for (const layer of stack) {
            const style = getComputedStyle(layer);
            // Esencial paints its full-width bands with border-image, not a background: unknown too.
            if (style.backgroundImage !== 'none' || style.borderImageSource !== 'none' || layer instanceof HTMLImageElement || layer instanceof HTMLVideoElement || layer instanceof HTMLCanvasElement || layer instanceof SVGElement) return null;
            // A decorative layer drawn by ::before/::after (a scrim, a tint) is behind the text too: unknown.
            if ([getComputedStyle(layer, '::before'), getComputedStyle(layer, '::after')].some(pseudo => pseudo.content !== 'none' && (pseudo.backgroundImage !== 'none' || !clear(pseudo.backgroundColor)))) return null;
            if (clear(style.backgroundColor)) continue;
            const colour = rgb(style.backgroundColor);
            if (!colour) return null;
            if (colour[3] >= 0.9) return colour;
            return null;
          }
          return [255, 255, 255, 1];
        };
        const found: string[] = [];
        // Photos and scrims often take no clicks (pointer-events:none), which hides them from elementsFromPoint.
        // …and a smooth-scrolling page would still be moving when the stack is read.
        const hitAll = document.createElement('style'); hitAll.textContent = '*,*::before,*::after{pointer-events:auto!important}html,body{scroll-behavior:auto!important}'; document.head.append(hitAll);
        for (const el of Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,button,li,label,span,strong'))) {
          if (found.length >= 4) break;
          const text = Array.from(el.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').replace(/\s+/g, ' ').trim();
          if (text.length < 3 || el.closest('[hidden],[aria-hidden="true"],template,dialog:not([open]),.es-skip,[data-pagosya-assistant],:disabled')) continue;
          const box = el.getBoundingClientRect(), style = getComputedStyle(el);
          if (box.width < 2 || box.height < 2 || style.visibility === 'hidden' || Number(style.opacity) < 0.3) continue;
          const ink = rgb(style.color), back = ground(el);
          if (!ink || !back || ink[3] < 0.5) continue;
          const a = lum(ink), b = lum(back);
          if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 1.6) found.push(`«${text.slice(0, 40)}»`);
        }
        hitAll.remove(); window.scrollTo(0, 0);
        return found;
      })(),
      // A custom property declared with a value that computes to nothing: two variables pointing at each other (BAEK
      // 2026-10-23, --es-paper ↔ --store-background on .es) or one leaning on a variable no rule defines. Everything painted
      // with it goes transparent — the menu panel opened see-through over the page.
      unresolvedVars: (() => {
        const found = new Map<string, Set<string>>();
        const visit = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            if ('cssRules' in rule && !(rule instanceof CSSStyleRule)) { visit((rule as CSSGroupingRule).cssRules); continue; }
            if (!(rule instanceof CSSStyleRule)) continue;
            // Colours only: the kit's own font and size variables may lean on store tokens a template never sets, and fall back.
            const names = Array.from(rule.style).filter(name => /^--.*(?:paper|ink|background|bg|surface|colou?r|accent|foreground|muted|deep|border)/.test(name)
              && !/^\s*(?:initial)?\s*$/.test(rule.style.getPropertyValue(name)));
            if (!names.length) continue;
            let el: Element | null = null;
            try { el = document.querySelector(rule.selectorText); } catch { continue; }
            if (!el) continue;
            const style = getComputedStyle(el), empty = names.filter(name => !style.getPropertyValue(name).trim());
            if (!empty.length) continue;
            const seen = found.get(rule.selectorText) ?? new Set<string>();
            empty.forEach(name => seen.add(name)); found.set(rule.selectorText, seen);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) { try { visit(sheet.cssRules); } catch { /* a cross-origin sheet cannot be read */ } }
        return [...found].slice(0, 4).map(([selector, names]) => ({ selector, names: [...names].slice(0, 6) }));
      })(),
      hiddenCatalog: Array.from(document.querySelectorAll<HTMLElement>('[data-pagosya-catalog]')).some(el => {
        const style = getComputedStyle(el);
        // Clipped to a sliver hides it as surely (BAEK 2026-10-23: height:1px;overflow:hidden on the products page).
        const clipped = /hidden|clip/.test(style.overflow) && el.getBoundingClientRect().height < 4;
        return el.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || clipped;
      }),
      staleCatalogCopy: Boolean(document.querySelector('[data-pagosya-catalog]')) && Array.from(document.querySelectorAll('h1,h2,h3,p,[role=status]')).some(el => {
        if (el.closest('[data-pagosya-catalog],[data-pagosya-product-page],[data-pagosya-checkout-page],[data-pagosya-cart],[data-pagosya-status]')) return false;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return /cat[aá]logo.{0,70}(?:se est[aá] preparando|cuando.{0,30}disponible|pr[oó]ximamente|vac[ií]o)|no (?:hay|tenemos) productos|productos.{0,35}(?:se incorporar[aá]n|a[uú]n no disponibles)|catalog.{0,45}(?:coming soon|is empty)|no products (?:yet|available)/i.test(text);
      }),
      designProcessCopy: Boolean(document.querySelector('[data-pagosya-catalog]')) && Array.from(document.querySelectorAll('h1,h2,h3,p')).some(el => {
        if (el.closest('[data-pagosya-catalog],[data-pagosya-product-page],[data-pagosya-checkout-page]')) return false;
        if (!el.getBoundingClientRect().width || !el.getBoundingClientRect().height) return false;
        return /(?:secuencia|composici[oó]n) visual contenida|cat[aá]logo (?:vivo|real)|(?:runtime|data-pagosya|verificaci[oó]n autom[aá]tica)|live catalog|verified (?:desktop|mobile) layout/i.test(el.textContent || '');
      }),
      brokenSections: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).flatMap(link => {
        const target = new URL(link.href, location.href);
        if (target.origin !== location.origin || target.pathname !== location.pathname || !target.hash) return [];
        let id: string;
        try { id = decodeURIComponent(target.hash.slice(1).split(':~:')[0]); } catch { return [target.hash]; }
        if (!id || ['top', 'pedido', 'carrito', 'cart', 'checkout', 'pago-de-prueba'].includes(id)) return [];
        return document.getElementById(id) || document.getElementsByName(id).length ? [] : [target.hash];
      }),
    }));
    if (mediaPolicy && !['product.html', 'checkout.html', 'productos.html'].includes(entry)) errors.push(...await page.evaluate(evaluateSourceMediaDesign, { ...mediaPolicy, page: entry }));
    if (!['product.html', 'checkout.html'].includes(entry)) errors.push(...await page.evaluate(evaluateStripRuns));
    errors.push(...health.missing.filter(path => !STORE_UPLOAD.test(path)).map(path => 'Imagen no disponible: ' + path));
    // A store-colour illustration is a CSS mask: a wrong path draws nothing and raises no image error.
    errors.push(...[...new Set(health.illustrations)].filter(src => !snapshot.files.some(file => '/' + file.path === src || file.path === src)).slice(0, 8).map(src => 'Ilustración no disponible: ' + src));
    // A tone such as var(--butter) on a store without that variable paints the mask transparent.
    errors.push(...[...new Set(health.colourless)].slice(0, 8).map(src => 'Ilustración sin color visible: ' + src));
    errors.push(...[...new Set(health.brokenSections)].slice(0, 8).map(hash => 'Enlace a sección inexistente: ' + hash));
    if (health.overflow) errors.push('La página desborda horizontalmente.');
    errors.push(...health.stickyOver.map(name => `«${name}» es sticky y se desliza sobre las secciones que siguen en su mismo contenedor. Quita el sticky o deja esas secciones fuera de su contenedor.`));
    errors.push(...health.textOverButton.map(pair => `Texto encima de un botón: ${pair}. Muévelo para que no se toquen.`));
    if (health.staleCatalogCopy) errors.push('Texto permanente de catálogo vacío fuera del runtime. Usa texto de marca que siga siendo válido al añadir productos; el catálogo administra su estado vacío.');
    if (health.designProcessCopy) errors.push('Texto del proceso de diseño visible para compradores. Sustituye explicaciones de composición, runtime o catálogo real/vivo por texto breve sobre los productos o la marca, sin inventar datos.');
    if (health.lowContrast.length) errors.push(`Texto casi invisible, del mismo color que el fondo donde está: ${health.lowContrast.join(', ')}. Dale un color que contraste con ese fondo.`);
    errors.push(...health.unresolvedVars.map(({ selector, names }) => `Variables de color sin valor en «${selector}»: ${names.join(', ')}. Se apuntan entre sí o usan una variable que no existe, y todo lo pintado con ellas queda transparente (menú, encabezado, carrito). Da a cada una un valor real, sin que una variable apunte a otra que la vuelve a nombrar.`));
    if (health.hiddenCatalog) errors.push('El catálogo está oculto. Mantén visible data-pagosya-catalog incluso sin productos; el runtime controla su estado vacío y los productos futuros.');
    evidence = await page.evaluate(evaluateRequirements, { requirements: requirements.map(r => ({ ...r, imagePaths: r.check === 'image' ? agentImagePaths(r.expected) : [] })), entry, width, profile });
    for (const requirement of requirements.filter(r => r.page === entry && r.check === 'navigation' && (r.profile || 'normal') === profile)) {
      let passed = false, detail = '';
      try {
        if (!/^[a-z][a-z0-9-]{0,47}\.html$/.test(requirement.expected) || !snapshot.files.some(f => f.path === requirement.expected)) throw new Error('La página de destino no existe.');
        const link = page.locator(requirement.selector).first();
        if (!await link.isVisible()) {
          const menu = page.getByRole('button', { name: /menú|menu|abrir navegación/i }).first();
          if (await menu.isVisible()) await menu.click({ timeout: 2000 });
        }
        const href = await link.getAttribute('href');
        if (!href || new URL(href, `https://preview.invalid/${entry}`).href !== `https://preview.invalid/${requirement.expected}`) throw new Error('El enlace no apunta a la página pedida.');
        await link.click({ timeout: 3000 });
        await page.waitForURL(`https://preview.invalid/${requirement.expected}`, { timeout: 4000 });
        await page.locator('h1').first().waitFor({ state: 'visible', timeout: 4000 });
        passed = true; detail = 'Enlace navega a ' + requirement.expected;
      } catch (error) { detail = 'Navegación fallida (' + requirement.expected + '): ' + (error as Error).message.slice(0, 300); }
      evidence.push({ id:requirement.id, page:entry, width, profile, passed, detail });
      await page.goto(`https://preview.invalid/${entry}`, { waitUntil:'load', timeout:12000 });
    }
    const shot = await page.screenshot({ type: 'png', fullPage: true, timeout: 12_000 });
    await page.close();
    return shot;
  }, profile === 'reduced-motion' ? 'reduce' : 'no-preference');
  const image = await sharp(png).resize({ width: Math.min(width, 1024), height: 2400, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
  const thumbnail = await sharp(png).resize({ width: 320, height: 640, fit: 'cover', position: 'top' }).jpeg({ quality: 65 }).toBuffer();
  return { width, errors, evidence, image: `data:image/jpeg;base64,${image.toString('base64')}`, thumbnail: `data:image/jpeg;base64,${thumbnail.toString('base64')}`, sections: await agentShotSections(png) };
}
