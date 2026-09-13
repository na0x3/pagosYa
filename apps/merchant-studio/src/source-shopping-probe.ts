import type { SourceCheck } from './source-checks';

// This function is serialized and executes only inside an opaque preview frame.
export function sourceShoppingProbe(design?: { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean }) {
  // Exercising the background frame must not take focus from the merchant.
  HTMLElement.prototype.focus = () => {};
  window.focus = () => {};
  const results: SourceCheck[] = [];
  const add = (label: string, ok: boolean, detail?: string) => results.push({ label, status: ok ? 'passed' : 'failed', ...(detail ? { detail } : {}) });
  window.addEventListener('error', event => add('JavaScript', false, String(event.message).slice(0, 160)));
  window.addEventListener('unhandledrejection', () => add('JavaScript', false, 'Promesa rechazada sin controlar'));
  window.addEventListener('load', () => setTimeout(async () => {
    try {
      await document.fonts.ready;
      const cart = () => { const state = { items: [] as Array<{ id: string; quantity: number }> }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail: state })); return state.items; };
      const shown = (el: Element) => { const r = el.getBoundingClientRect(); const style = getComputedStyle(el); return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[hidden],[inert]'); };
      const brokenImages = [...document.images].filter(img => img.getAttribute('src') && img.complete && img.naturalWidth === 0);
      add('Imágenes cargadas', brokenImages.length === 0, brokenImages.length ? `${brokenImages.length} imágenes no pudieron cargarse.` : undefined);
      // A placeholder icon/illustration standing in for real product photography reads as
      // unfinished; catch it before the merchant's customers do.
      const placeholderPhotos = [...document.querySelectorAll<HTMLImageElement>('[data-pagosya-catalog] img,[data-pagosya-product] img')].filter(img => {
        const src = img.currentSrc || img.getAttribute('src') || '';
        return shown(img) && (/\.svg(?:[?#]|$)/i.test(src) || /^data:image\/svg\+xml/i.test(src));
      });
      add('La página muestra contenido', document.body.innerText.trim().length >= 20);
      const pageWidth = document.documentElement.scrollWidth;
      const overflowing = [...document.querySelectorAll<HTMLElement>('body *')].filter(el => {
        if (!shown(el)) return false;
        const r = el.getBoundingClientRect();
        return r.left < -2 || r.right > window.innerWidth + 2;
      });
      const leafOverflowing = overflowing.filter(el => ![...el.children].some(child => overflowing.includes(child as HTMLElement)));
      const describe = (el: HTMLElement) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
      const offenders = [...new Set(leafOverflowing.slice(0, 4).map(describe))];
      add('Ancho de la página', pageWidth <= window.innerWidth + 2, pageWidth <= window.innerWidth + 2
        ? 'Sin desbordamiento horizontal'
        : `El contenido ocupa ${pageWidth} px en una pantalla de ${window.innerWidth} px. Elementos fuera del viewport: ${offenders.join(', ') || 'no identificado'}. Ajusta las columnas y el texto que se sale de ellas; no ocultes el desbordamiento de toda la página.`);
      // Advisory findings describe rendered evidence, never a prescribed aesthetic.
      const warn = (label: string, detail: string) => results.push({ label, detail, status: 'warning' });
      if (placeholderPhotos.length) warn('Fotografía de producto', `${placeholderPhotos.length} producto(s) muestran un ícono o ilustración vectorial en vez de una foto real: ${[...new Set(placeholderPhotos.map(img => img.alt || img.closest('.menu-item,[data-pagosya-product]')?.querySelector('[data-product-field="name"],h1,h2,h3')?.textContent?.trim() || 'producto'))].slice(0, 3).join(' · ')}. Sube fotografía real del producto; un marcador de posición se percibe como una tienda inacabada.`);
      const collidingHeadings = [...document.querySelectorAll<HTMLElement>('h1,h2,h3')].filter(heading => {
        if (!shown(heading) || heading.closest('[aria-hidden="true"]')) return false;
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        const boxes: DOMRect[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          boxes.push(...[...range.getClientRects()].filter(rect => rect.width > 2 && rect.height > 2));
        }
        return boxes.some((a, index) => boxes.slice(index + 1).some(b => {
          const height = Math.min(a.height, b.height);
          const lineDistance = Math.abs((a.top + a.bottom - b.top - b.bottom) / 2);
          return lineDistance > height * .35 && lineDistance < Math.max(a.height, b.height)
            && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 6
            && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > height * .15;
        }));
      });
      if (collidingHeadings.length) warn('Líneas de título superpuestas', `Las cajas de texto de distintas líneas se cruzan en: ${collidingHeadings.slice(0, 3).map(el => el.textContent?.trim().slice(0, 100)).join(' · ')}. Revisa el interlineado, los saltos y el ancho disponible con la fuente cargada; conserva la identidad del diseño.`);
      const croppedSlides = [...document.querySelectorAll<HTMLImageElement>('[aria-roledescription="carrusel"] img,[aria-roledescription="carousel"] img')].filter(img => {
        if (!img.naturalWidth || !img.naturalHeight || getComputedStyle(img).objectFit !== 'cover') return false;
        const box = img.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        const sourceRatio = img.naturalWidth / img.naturalHeight, frameRatio = box.width / box.height;
        return Math.min(sourceRatio / frameRatio, frameRatio / sourceRatio) < .45;
      });
      if (croppedSlides.length) warn('Encuadre del carrusel', `${croppedSlides.length} fotos muestran menos del 45% de su superficie por el recorte. Revisa que el producto se vea completo; adapta el marco o usa object-fit:contain cuando corresponda.`);
      const tightHeadings = [...document.querySelectorAll<HTMLElement>('h1,h2,h3,[data-product-field="name"]')].filter(el => {
        const style = getComputedStyle(el);
        return shown(el) && parseFloat(style.letterSpacing) / parseFloat(style.fontSize) < -.041;
      });
      if (tightHeadings.length) warn('Lectura de titulares', `El espaciado de letras es muy cerrado en ${tightHeadings.slice(0, 2).map(el => el.innerText.trim()).join(' · ')}. Comprueba que las letras y palabras no se toquen; el punto de partida es -0.04em o más abierto.`);
      const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const textRects = (el: Element) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const rects: DOMRect[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim() || !node.parentElement || !shown(node.parentElement)) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          rects.push(...range.getClientRects());
        }
        return rects;
      };
      const overlaps = new Set<string>(), separated = new Set<string>(), clipped = new Set<string>();
      for (const card of document.querySelectorAll<HTMLElement>('[data-pagosya-catalog] .menu-item')) {
        if (!shown(card)) continue;
        const name = card.querySelector<HTMLElement>('[data-product-field="name"],.menu-item__name,h2,h3');
        const price = card.querySelector('[data-product-field="price"],.menu-item__price');
        const label = name?.innerText.trim() || 'Producto';
        const important = [...card.querySelectorAll('[data-product-field="name"],[data-product-field="price"],h2,h3,button,a[data-product-link]')].filter(shown);
        const reading = important.flatMap(textRects);
        // Opt-in artwork markers and existing aria-hidden illustrations only.
        // Ignore button icons and SVG path bounds; these boxes are advisory evidence.
        const art = [...card.querySelectorAll<HTMLElement>('[data-product-decoration],[aria-hidden="true"]')].filter(el => !el.closest('button,a,[data-product-field]'));
        for (const ornament of art) {
          const parts = [ornament, ...ornament.querySelectorAll<HTMLElement>('*')].filter(el => el.closest('svg') === null || el.tagName.toLowerCase() === 'svg');
          if (parts.some(el => {
            const r = el.getBoundingClientRect();
            return shown(el) && r.width * r.height > 256 && reading.some(text => intersects(r, text));
          })) overlaps.add(label);
        }
        if (name && price && shown(price)) {
          const n = name.getBoundingClientRect(), p = price.getBoundingClientRect();
          if (p.top - n.bottom > Math.max(160, innerHeight * .2) && (p.right < n.left || p.left > n.right)) separated.add(label);
        }
        for (const control of card.querySelectorAll<HTMLElement>('button[data-add],a[data-product-link]')) {
          if (!shown(control)) continue;
          const r = control.getBoundingClientRect();
          let scrollableX = false, clippedByParent = false;
          for (let parent = control.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
            if (/^(auto|scroll)$/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 2) scrollableX = true;
            if (/^(hidden|clip)$/.test(style.overflowX) && (r.left < box.left - 2 || r.right > box.right + 2)) clippedByParent = true;
            if (/^(hidden|clip)$/.test(style.overflowY) && (r.top < box.top - 2 || r.bottom > box.bottom + 2)) clippedByParent = true;
          }
          if (clippedByParent || (!scrollableX && (r.left < -2 || r.right > innerWidth + 2))) clipped.add(label);
        }
      }
      if (overlaps.size) warn('Ilustración sobre el producto', `La caja de una ilustración decorativa cruza texto o controles en: ${[...overlaps].slice(0, 3).join(' · ')}. Revisa el solapamiento; reserva espacio propio y adapta el dibujo al ancho real de su columna.`);
      if (separated.size) warn('Precio separado del producto', `El precio queda en otra columna y muy por debajo del nombre en: ${[...separated].slice(0, 3).join(' · ')}. Revisa las áreas de la cuadrícula y acerca nombre, precio y compra.`);
      add('Controles de compra completos', !clipped.size, clipped.size ? `Hay controles recortados o fuera de pantalla en: ${[...clipped].slice(0, 3).join(' · ')}. Ajusta columnas y permite envolver las acciones.` : undefined);
      if (design && Array.isArray(design.sections)) {
        const main = document.querySelector('main');
        const sections = main ? [...main.children].filter(el => !el.matches('script,style,template,[data-pagosya-contact],[data-pagosya-comeback],[data-pagosya-subscribe],[data-pagosya-status],[data-pagosya-cart]')) : [];
        const actual = sections.map(el => el.id);
        if (JSON.stringify(actual) !== JSON.stringify(design.sections)) warn('Composición elegida', `El orden previsto es ${design.sections.join(' → ')}; la página muestra ${actual.map(id => id || '(sin nombre)').join(' → ')}.`);
        const catalogSection = document.getElementById(design.catalogSection);
        const catalog = document.querySelector('[data-pagosya-catalog]');
        if (!catalogSection || !catalog || !catalogSection.contains(catalog) || (!design.standaloneIntro && sections[0] !== catalogSection)) warn('Apertura del catálogo', 'La composición elegida abre con el catálogo. Elimina la portada independiente y sitúa los productos en el bloque previsto.');
        if (!design.standaloneIntro && catalog && catalog.getBoundingClientRect().top > 320) warn('Catálogo sin portada', `El catálogo empieza a ${Math.round(catalog.getBoundingClientRect().top)} px. La composición elegida admite hasta 320 px de cabecera y contexto antes de los productos; reduce la introducción o colócala a su lado.`);
        const inOpening = (el: Element | null) => {
          if (!el || !shown(el)) return false;
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        };
        if (design.productsInOpening) {
          const product = [...document.querySelectorAll('[data-pagosya-catalog] .menu-item')].find(card =>
            inOpening(card.querySelector('[data-product-field="name"],.menu-item__name,h3')) &&
            inOpening(card.querySelector('[data-product-field="price"],.menu-item__price')) &&
            inOpening(card.querySelector('[data-add]')));
          if (!product) warn('Productos en la primera pantalla', 'El diseño elegido promete un producto con nombre, precio y acción de compra sin desplazarse. Reduce la apertura y comprueba los tres elementos en esta pantalla.');
        }
        if (innerWidth < 650 && ![...document.querySelectorAll('header [data-cart-open]')].some(inOpening)) warn('Pedido visible en móvil', 'Mantén Mi pedido y su cantidad visibles en la cabecera, fuera del menú plegado.');
      }
      if (document.documentElement.dataset.productTemplateInvalid === 'true') warn('Composición de productos', 'La plantilla personalizada no pudo conectarse al catálogo; se mostró la presentación básica. Revisa sus campos de nombre, precio, detalle y compra.');
      const emptySections = [...document.querySelectorAll<HTMLElement>('section')].filter(section => {
        if (!shown(section) || section.querySelector('img,svg,canvas,video,iframe,input,button,[data-pagosya-catalog],[data-pagosya-product],[data-pagosya-cart]') || section.matches('[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-contact]')) return false;
        if (getComputedStyle(section).backgroundImage !== 'none' || getComputedStyle(section, '::before').content !== 'none') return false;
        const heading = section.querySelector('h1,h2,h3');
        return heading && section.innerText.trim() === (heading as HTMLElement).innerText.trim();
      });
      if (emptySections.length) warn('Secciones sin contenido', `Revisa si estas secciones solo necesitan un título o están incompletas: ${emptySections.slice(0, 3).map(s => s.innerText.trim()).join(', ')}.`);
      const unusedCatalogLayouts = new Set<string>();
      const inspectRules = (rules: CSSRuleList) => {
        for (const rule of [...rules]) {
          if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
          if (rule instanceof CSSStyleRule && /^(grid|inline-grid|flex|inline-flex)$/.test(rule.style.display)) {
            for (const selector of rule.selectorText.split(',')) {
              if (!/\.(?:catalog|products?)[-_](?:grid|list|items|cards)\b/.test(selector) || selector.includes(':')) continue;
              try { if (!document.querySelector(selector)) unusedCatalogLayouts.add(selector.trim()); } catch { /* Unsupported selector. */ }
            }
          } else if ('cssRules' in rule) inspectRules((rule as CSSGroupingRule).cssRules);
        }
      };
      if (document.querySelector('[data-pagosya-catalog] .menu-item')) {
        for (const sheet of [...document.styleSheets]) try { inspectRules(sheet.cssRules); } catch { /* An unreadable stylesheet is not a design failure. */ }
        if (unusedCatalogLayouts.size) warn('Distribución del catálogo', `Hay reglas de distribución sin elementos correspondientes: ${[...unusedCatalogLayouts].slice(0, 3).join(', ')}. Comprueba que el diseño previsto se aplique al catálogo visible.`);
      }
      const pause = () => new Promise(resolve => setTimeout(resolve, 80));
      const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].find(shown);
      const buy = visible('[data-pagosya-catalog] button[data-add]:not(:disabled),[data-pagosya-product] button[data-add]:not(:disabled)');
      if (buy) {
        const before = cart().reduce((s, i) => s + i.quantity, 0);
        buy.click(); await pause();
        add('Añadir un producto', cart().reduce((s, i) => s + i.quantity, 0) === before + 1);
        add('Confirmación de producto añadido', Boolean(visible('.cart-added')));
      }
      const opener = [...document.querySelectorAll<HTMLElement>('[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]')].find(el => shown(el) && !el.closest('.cart-added'))
        || [...document.querySelectorAll<HTMLElement>('button,a')].find(el => shown(el) && el.querySelector('[data-cart-count]'));
      if (buy) {
        add('Pedido abre el carrito', Boolean(opener));
        opener?.click(); await pause();
        const drawer = visible('dialog.cart-drawer[open]');
        add('Carrito visible en un panel lateral', Boolean(drawer));
        if (drawer) {
          const bounds = drawer.getBoundingClientRect();
          add('Proporciones del carrito', bounds.width <= (innerWidth >= 768 ? innerWidth * .5 + 2 : innerWidth + 2));
          const remove = [...drawer.querySelectorAll<HTMLButtonElement>('[data-remove]')].find(b => b.dataset.remove === buy.dataset.add && shown(b));
          const before = cart().reduce((sum, item) => sum + item.quantity, 0);
          remove?.click(); await pause();
          add('Quitar un producto del pedido', Boolean(remove) && cart().reduce((sum, item) => sum + item.quantity, 0) === before - 1);
          // Re-add through the catalog after closing the empty drawer.
          (drawer as HTMLDialogElement).close(); buy.click(); opener?.click(); await pause();
        }
      }
      if (cart().length) {
        const checkout = visible('button[data-checkout]:not(:disabled)');
        checkout?.click(); await pause();
        let panel = visible('[data-checkout-review]');
        if (panel) {
          const branch = panel.querySelector<HTMLSelectElement>('[name=location]');
          const method = () => panel!.querySelector<HTMLSelectElement>('[name=method]');
          const choose = (value: string) => { const field = method(); if (field) { field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); } };
          // A disabled first branch must not mask another available branch.
          if (branch && !method()?.value) for (const option of branch.options) {
            branch.value = option.value; branch.dispatchEvent(new Event('change', { bubbles: true }));
            if (method()?.value) break;
          }
          if (method()) {
            add('Entrega o recojo disponible', Boolean(method()?.value));
            const options = [...method()!.options].map(o => o.value);
            if (options.includes('pickup')) { choose('pickup'); add('Recojo sin dirección obligatoria', !panel.querySelector<HTMLInputElement>('[name=shippingAddress]')?.required); }
            if (options.includes('delivery')) {
              choose('delivery');
              const address = panel.querySelector<HTMLInputElement>('[name=shippingAddress]');
              if (address) address.value = '';
              const validation = { panel, valid: true };
              document.dispatchEvent(new CustomEvent('pagosya:validate-checkout', { detail: validation }));
              add('Delivery solicita una dirección', Boolean(address && shown(address) && !validation.valid));
              if (address) { address.value = 'Calle de prueba 123, zona central'; address.dispatchEvent(new Event('input', { bubbles: true })); }
              const complete = { panel, valid: true };
              document.dispatchEvent(new CustomEvent('pagosya:validate-checkout', { detail: complete }));
              add('Dirección permite continuar', complete.valid);
            }
          }
          visible('button[data-pay]:not(:disabled)')?.click(); await pause();
        }
      } else if ((window as any).PAGOSYA_HOSTED) {
        const options = visible('a.menu-add,a.product-detail__buy');
        if (document.querySelector('[data-pagosya-catalog]')) add('Opciones de producto disponibles', Boolean(options));
        // A product that needs options should stay on the merchant's own storefront; sending the
        // customer to a different origin breaks the identity built into the rest of the page.
        if (options instanceof HTMLAnchorElement && options.href) {
          try {
            if (new URL(options.href, location.href).origin !== location.origin) warn('Opciones fuera del sitio', 'Elegir opciones abre un dominio distinto al de tu tienda. Muestra las combinaciones dentro de la misma página para mantener tu diseño durante la compra.');
          } catch { /* Relative or unparsable href; nothing to flag. */ }
        }
        options?.click(); await pause();
      } else if (document.querySelector('[data-pagosya-catalog]')) add('Compra de producto', false, 'Añade un producto simple disponible para comprobar el recorrido.');
      const form = document.querySelector<HTMLFormElement>('[data-pagosya-contact] form');
      if (form && !(window as any).PAGOSYA_HOSTED) {
        const values: Record<string, string> = { name: 'Prueba de sitio', email: 'prueba@example.com', message: 'Comprobación automática del formulario.' };
        for (const [name, value] of Object.entries(values)) { const input = form.elements.namedItem(name) as HTMLInputElement | null; if (input) input.value = value; }
        form.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
        add('Formulario en modo de prueba', Boolean(form.querySelector('[data-contact-status]')?.textContent?.includes('Prueba completada')));
      }
    } catch (error) { add('Recorrido de compra', false, error instanceof Error ? error.message : 'Error inesperado'); }
    parent.postMessage({ type: 'pagosya:source-check-result', results }, '*');
  }, 100));
}
