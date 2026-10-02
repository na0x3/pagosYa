import { evaluateSourceMediaDesign, type SourceMediaPolicy } from '../source-media-design';
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

export type AgentPreviewBase = { brief: SourceProjectBriefDto; files: SourceProjectFileDto[] };
export type AgentShot = { width: 1280 | 820 | 390; image: string; thumbnail: string; errors: string[]; evidence: RequirementEvidence[] };

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
    await page.goto(`https://preview.invalid/${entry}`, { waitUntil: 'load', timeout: 12_000 });
    const accountPage = STOREFRONT_PAGES.find(p => p.url === entry && p.owner === 'account');
    if (accountPage) {
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
      missing: Array.from(document.images).filter(img => img.getBoundingClientRect().width > 0 && !img.naturalWidth).map(img => img.getAttribute('src') || '(sin ruta)').slice(0, 8),
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      hiddenCatalog: Array.from(document.querySelectorAll<HTMLElement>('[data-pagosya-catalog]')).some(el => {
        const style = getComputedStyle(el);
        return el.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
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
    errors.push(...health.missing.map(path => 'Imagen no disponible: ' + path));
    errors.push(...[...new Set(health.brokenSections)].slice(0, 8).map(hash => 'Enlace a sección inexistente: ' + hash));
    if (health.overflow) errors.push('La página desborda horizontalmente.');
    if (health.staleCatalogCopy) errors.push('Texto permanente de catálogo vacío fuera del runtime. Usa texto de marca que siga siendo válido al añadir productos; el catálogo administra su estado vacío.');
    if (health.designProcessCopy) errors.push('Texto del proceso de diseño visible para compradores. Sustituye explicaciones de composición, runtime o catálogo real/vivo por texto breve sobre los productos o la marca, sin inventar datos.');
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
  return { width, errors, evidence, image: `data:image/jpeg;base64,${image.toString('base64')}`, thumbnail: `data:image/jpeg;base64,${thumbnail.toString('base64')}` };
}
