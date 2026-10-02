/// <reference lib="dom" />

import type { SourceCompositionPlan } from './source-composition-plan';

export type SourceMediaPolicy = { allowLayered: boolean; compositionPlan?: SourceCompositionPlan; page?: string };

/** Server-owned scope: local copy edits do not silently redesign an existing gallery. */
export function sourceMediaPolicy(purpose: string, wholeDesign: boolean, instruction: string, compositionPlan?: SourceCompositionPlan): SourceMediaPolicy | undefined {
  if (purpose !== 'shop' || !wholeDesign) return undefined;
  const text = instruction.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const layered = /(?:collage|parallax|superpuest|overlap)/.test(text)
    && !/(?:no|sin|without|avoid).{0,24}(?:collage|parallax|superpuest|overlap)/.test(text);
  return { allowLayered: layered, ...(compositionPlan ? { compositionPlan } : {}) };
}

export const SOURCE_MEDIA_DESIGN_CONTRACT = `SHOP IMAGE AND SECTION PLAN. Before choosing a layout, use each asset's measured pixels.width and pixels.height. Aim for two source pixels per displayed CSS pixel; never enlarge a raster photograph beyond its source resolution. A small portrait belongs in a bounded portrait panel or product card, not stretched across a wide desktop banner. If no asset supports a large hero, choose a compact image or typography-led opening. CSS cover is not a quality fix: retain at least half the original photo's area and keep the product recognizable. Use contain or change the panel ratio when the crop would discard most of the photo. Do not blur an inadequate photo or invent/upscale a replacement.
Choose image quantity and arrangement from the products, theme and customer task, not a universal photo quota. Product and category grids, useful comparisons and intentional editorial/lookbook galleries are valid. Commit their page purpose, section intent and individual media roles in the composition plan before code. A heading alone does not justify a repeated photo wall. Keep unused uploads available: never create an extra gallery or repeated photo-only sections merely to display every upload. If all images are requested, plan a useful and coherent destination without changing product-photo ownership or inventing products.
Every authored page and section must help the customer choose, understand a real product, or find confirmed purchase information. Omit a section when it adds only another photo, another label or a repeated shop-all action. Do not invent content to justify a planned section. Choose a short buying journey before writing decorative sections. Keep an obvious product/catalog action fully visible in the first screen on desktop and mobile, one primary action in each group, truthful destination labels and a simple header; a logo does not need a subtitle or extra navigation row. Preserve explicit current merchant instructions. Composition is checked across authored pages on whole-store designs; local copy changes preserve existing layout.`;

/** Runs inside the isolated browser. Pure observations; never changes generated content. */
export function evaluateSourceMediaDesign(policy: SourceMediaPolicy): string[] {
  const errors: string[] = [];
  const platform = '[data-pagosya-catalog],[data-pagosya-product-page],[data-pagosya-checkout-page],[data-pagosya-cart]';
  const photos = Array.from(document.querySelectorAll<HTMLImageElement>('main img')).slice(0, 200).flatMap(img => {
    if (img.closest(platform)) return [];
    const src = img.currentSrc || img.src;
    if (/\.svg(?:[?#]|$)|^data:image\/svg/i.test(src)) return [];
    const rect = img.getBoundingClientRect();
    if (!img.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || rect.width < 80 || rect.height < 80 || !img.naturalWidth || !img.naturalHeight) return [];
    const style = getComputedStyle(img);
    const x = rect.width / img.naturalWidth, y = rect.height / img.naturalHeight;
    const scale = style.objectFit === 'contain' ? Math.min(x, y) : style.objectFit === 'scale-down' ? Math.min(1, x, y) : style.objectFit === 'none' ? 1 : Math.max(x, y);
    const name = (img.alt || 'Foto sin descripción').slice(0, 100);
    if (scale > 1.05) errors.push(`Foto ampliada y potencialmente borrosa: ${name} (${img.naturalWidth}×${img.naturalHeight}, panel ${Math.round(rect.width)}×${Math.round(rect.height)}, escala ${scale.toFixed(2)}). Reduce el panel o elige una foto con resolución suficiente; no ocultes la foto.`);
    const retained = rect.width * rect.height / (img.naturalWidth * img.naturalHeight * scale * scale);
    if (style.objectFit === 'cover' && retained < 0.5) errors.push(`Recorte excesivo: ${name}, conserva solo ${Math.round(retained * 100)}% de la foto. Usa un panel de proporción compatible o contain.`);
    return [{ rect, name, element: img as HTMLElement, src }];
  });
  // Background photography counts too. Keep work bounded, ignore gradients/SVG and
  // never fetch an asset from the checker. Raster resolution checks remain img-only.
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('main *')).slice(0, 1200)) {
    if (element.tagName === 'IMG' || element.closest(platform)) continue;
    const background = getComputedStyle(element).backgroundImage;
    const src = background.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
    if (!src || !/\.(?:png|jpe?g|webp|avif|gif)(?:[?#]|$)|^data:image\/(?:png|jpeg|webp)/i.test(src)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80 || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    photos.push({ rect, name: (element.getAttribute('aria-label') || 'Foto de fondo').slice(0, 100), element, src });
  }
  const catalogs = Array.from(document.querySelectorAll('[data-pagosya-catalog]'));
  if (catalogs.length && (policy.page || 'index.html') === 'index.html') {
    const shoppingAction = Array.from(document.querySelectorAll<HTMLElement>('a[href], [data-product-add]')).some(control => {
      const rect = control.getBoundingClientRect();
      if (!control.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || rect.width < 1 || rect.height < 1 || rect.top < 0 || rect.bottom > innerHeight || rect.right < 0 || rect.left > innerWidth) return false;
      if (control.matches('[data-product-add]')) return true;
      const url = new URL((control as HTMLAnchorElement).href, location.href);
      if (url.origin !== location.origin) return false;
      if (/\/(?:productos|product|colecciones)\.html$/.test(url.pathname)) return true;
      if (url.pathname !== location.pathname || !url.hash) return false;
      let target: Element | null;
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch { return false; }
      return !!target && catalogs.some(catalog => target === catalog || target!.contains(catalog));
    });
    if (!shoppingAction) errors.push('Inicio sin una acción de compra visible en la primera pantalla. Ajusta la altura de la portada y la jerarquía para mostrar un enlace al catálogo o un producto comprable en escritorio y móvil; el carrito solo no sustituye esa entrada.');
  }
  const pagePlan = policy.compositionPlan?.pages.find(page => page.page === (policy.page || 'index.html'));
  const assetPath = (src: string) => { try { return new URL(src, location.href).pathname.replace(/^\//, ''); } catch { return src; } };
  const meaningfulText = (container: Element) => Array.from(container.querySelectorAll('p,figcaption,dd,td,li')).some(node => (node.textContent || '').trim().length >= 24);
  const usefulLink = (photo: typeof photos[number]) => {
    const link = photo.element.closest<HTMLAnchorElement>('a[href]');
    if (!link || !(link.textContent || link.getAttribute('aria-label') || '').trim()) return false;
    try {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && /\/(?:product|productos|coleccion|colecciones)\.html$/.test(url.pathname);
    } catch { return false; }
  };
  const plannedPurpose = (container: Element, members: typeof photos) => {
    const section = pagePlan?.sections.find(section => {
      const node = document.getElementById(section.id);
      return !!node && (node === container || node.contains(container));
    });
    if (!section || !['product-grid','category-grid','comparison','editorial-gallery'].includes(section.layout)) return false;
    // A plan must actually identify the photos serving its purpose. Merely
    // relabelling an arbitrary section "gallery" is not enough.
    return members.every(photo => section.media.some(media => assetPath(media.asset) === assetPath(photo.src)));
  };
  const unplanned = photos.filter(photo => !usefulLink(photo));
  const groups = new Map<Element, typeof photos>();
  for (const photo of unplanned) {
    let container = photo.element.parentElement;
    while (container && container.tagName !== 'MAIN') {
      const members = unplanned.filter(other => container!.contains(other.element));
      if (members.length >= 3) { groups.set(container, members); break; }
      container = container.parentElement;
    }
  }
  for (const [container, members] of groups) {
    const explainedIndividually = members.every(photo => {
      const card = photo.element.closest('figure,article,li') || photo.element.parentElement;
      return !!card && card !== container && members.filter(other => card.contains(other.element)).length === 1 && meaningfulText(card);
    });
    if (plannedPurpose(container, members) || explainedIndividually) continue;
    const areas = members.map(photo => photo.rect.width * photo.rect.height);
    const largest = Math.max(...areas);
    // Equal-weight panels can become a wall whether arranged beside each other
    // on desktop or stacked on mobile. A dominant image with small supports is
    // deliberately different; total photo count alone is never a failure.
    if (areas.filter(area => area >= largest * 0.55).length >= 3) {
      errors.push('[composition:unjustified-image-wall] Grupo de fotos con el mismo peso visual sin propósito demostrado. Define una colección, comparación o relato útil en el plan y relaciona sus imágenes; no crees una galería solo para consumir archivos.');
      break;
    }
  }
  const blocks = Array.from(document.querySelectorAll('main > section, main > article'));
  let photoOnlyRun = 0;
  for (const block of blocks) {
    const members = unplanned.filter(photo => block.contains(photo.element));
    photoOnlyRun = members.length && !plannedPurpose(block, members) && !meaningfulText(block) ? photoOnlyRun + 1 : 0;
    if (photoOnlyRun >= 3) {
      errors.push('[composition:photo-only-sequence] Tres secciones consecutivas repiten fotos sin contenido o propósito definido. Replantea la secuencia para ayudar a elegir o comprender los productos; preserva las imágenes disponibles.');
      break;
    }
  }
  if (!policy.allowLayered) {
    for (let i = 0; i < photos.length; i++) for (let j = i + 1; j < photos.length; j++) {
      const a = photos[i].rect, b = photos[j].rect;
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (overlap > Math.min(a.width * a.height, b.width * b.height) * 0.15) {
        errors.push(`Fotos editoriales superpuestas sin una petición de collage: ${photos[i].name} / ${photos[j].name}. Usa una composición con separación clara.`);
        return errors;
      }
    }
  }
  return errors;
}
