/** Marks every editable part of the rendered preview and offers section insertions. */
import { Store, assetUrl } from "../api";
import { postToParent } from "../postmessage";
import { storeEditorMode, type StorePreviewSection, type StorePreviewEditorSelection } from "../preview-mode";
import { STORE_MOTION_EXPERIENCES, STORE_TEXT_ANIMATION_EXPERIENCES, STORE_MOTION_EXPERIENCE_LABELS } from "../storefront/motion";
import { escapeHtml } from "../ui/html";
import { app } from "../ui/app";
import { storePreviewRenderedSiteDocument, applyAnimationCopySceneLayout } from "./editor-base";
import { markStorePreviewEditorTarget, markAllStorePreviewEditorTargets, syncStorePreviewEditorMode, syncStorePreviewEditorSelection } from "./selection";
import { beginSiteSectionResizeGesture } from "./gestures";


export function storePreviewSectionInsertionOptions(pageSpecific = false): string {
  const visualOptions = STORE_MOTION_EXPERIENCES
    .filter((type) => !STORE_TEXT_ANIMATION_EXPERIENCES.has(type))
    .map((type) => `<option value="animation:${type}">${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[type])}</option>`)
    .join("");
  const textOptions = STORE_MOTION_EXPERIENCES
    .filter((type) => STORE_TEXT_ANIMATION_EXPERIENCES.has(type))
    .map((type) => `<option value="animation:${type}">${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[type])}</option>`)
    .join("");
  return `<option value="">Elige qué insertar…</option>
    <optgroup label="Secciones">
      <option value="about">Texto e historia</option>
      ${pageSpecific ? '<option value="products">Productos seleccionados</option>' : ""}
      <option value="gallery">Galería visual</option>
      <option value="links">Redes sociales</option>
      <option value="contact">Contacto</option>
      <option value="location">Ubicación</option>
      ${pageSpecific ? "" : '<option value="footer">Pie de página</option>'}
    </optgroup>
    <optgroup label="Animaciones visuales">${visualOptions}</optgroup>
    <optgroup label="Animaciones de texto">${textOptions}</optgroup>`;
}

export function renderStorePreviewSectionInsertions(): void {
  app.querySelectorAll(".store-section-insert-boundary").forEach((element) => element.remove());
  const siteDocument = storePreviewRenderedSiteDocument();
  const requestedPageSlug = new URLSearchParams(window.location.search).get("page");
  const activePage = requestedPageSlug
    ? siteDocument?.pages?.find((page) => page.slug === requestedPageSlug) ?? null
    : null;
  const sections = Array.from(app.children).filter((element): element is HTMLElement =>
    element instanceof HTMLElement && !!element.dataset.storeSectionKey,
  );
  const sectionLabels: Record<string, string> = {
    hero: "Portada", products: "Productos", about: "Nuestra historia", gallery: "Fotos editoriales",
    links: "Redes y enlaces", contact: "Contáctanos", location: "Ubicación",
  };
  const readableSection = (section: HTMLElement) => {
    const key = section.dataset.storeSectionKey || "";
    if (key.startsWith("animation-")) return "la animación";
    if (key.startsWith("site-")) return section.getAttribute("aria-label")?.trim() || "la sección";
    return sectionLabels[key] || "la sección";
  };
  const addBoundary = (reference: HTMLElement, position: "before" | "after", insertAfter: string, label: string) => {
    const boundary = document.createElement("div");
    boundary.className = "store-section-insert-boundary";
    boundary.dataset.insertAfter = insertAfter;
    boundary.innerHTML = `<label class="store-section-insert-trigger" title="${escapeHtml(label)}">
      <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
      <strong>Agregar primera sección</strong>
      <select aria-label="${escapeHtml(label)}" data-store-section-insert-select>${storePreviewSectionInsertionOptions(Boolean(activePage))}</select>
    </label>`;
    const select = boundary.querySelector<HTMLSelectElement>("select")!;
    select.addEventListener("change", () => {
      const choice = select.value;
      select.value = "";
      if (choice) postToParent("STORE_EDITOR_INSERT_SECTION", { choice, insertAfter, ...(activePage ? { pageId: activePage.id } : {}) });
    });
    if (position === "before") reference.before(boundary);
    else reference.after(boundary);
    return boundary;
  };
  if (!sections.length) {
    const header = app.querySelector<HTMLElement>(".store-site-header");
    if (header && activePage) addBoundary(header, "after", "__start__", `Agregar la primera sección a ${activePage.label}`).classList.add("is-empty-page");
    return;
  }
  addBoundary(sections[0], "before", "__start__", "Insertar una sección al inicio");
  sections.forEach((section, index) => {
    const next = sections[index + 1];
    const label = next
      ? `Insertar una sección entre ${readableSection(section)} y ${readableSection(next)}`
      : "Insertar una sección al final";
    addBoundary(section, "after", section.dataset.storeSectionKey || "__start__", label);
  });
}

export function annotateStorePreviewEditor(store: Store): void {
  if (!storeEditorMode) return;
  const siteKindLabels: Record<string, string> = { hero: "portada", story: "historia con scroll", catalog: "catálogo", gallery: "galería", contact: "contacto", location: "ubicación", links: "redes" };
  app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-kind]").forEach((element) => {
    const kind = element.dataset.siteKind;
    const id = element.dataset.siteSection;
    const section = id ? `site-${id}` : kind === "catalog" ? "products" : kind === "story" ? "about" : kind;
    if (!section) return;
    const title = element.getAttribute("aria-label")?.trim();
    markStorePreviewEditorTarget(element, { section: section as StorePreviewSection, field: "section", label: title || siteKindLabels[kind || ""] || "sección de marca" });
    if (!id) return;
    const sectionSelection = { section: `site-${id}` as StorePreviewSection, field: "section", label: title || siteKindLabels[kind || ""] || "sección de marca" };
    if (!element.querySelector(":scope > .store-site-section-resize-handle")) {
      const resizeHandle = document.createElement("button");
      resizeHandle.type = "button";
      resizeHandle.className = "store-site-section-resize-handle";
      resizeHandle.setAttribute("aria-label", `Cambiar el alto de ${sectionSelection.label}`);
      resizeHandle.title = "Arrastra para cambiar el alto";
      resizeHandle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg><span>Alto</span>';
      resizeHandle.addEventListener("pointerdown", (event) => beginSiteSectionResizeGesture(event, element, sectionSelection));
      element.append(resizeHandle);
    }
    const markBlockText = (target: HTMLElement, fallbackField: string, label: string) => markStorePreviewEditorTarget(target, {
      section: `site-${id}`,
      field: target.dataset.siteBlock ? "siteBlockText" : fallbackField,
      label,
      ...(target.dataset.siteBlock ? { itemId: target.dataset.siteBlock } : {}),
    });
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy :is(h1, h2)").forEach((target) => markBlockText(target, "siteTitle", `título de ${siteKindLabels[kind || ""] || "la sección"}`));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy p").forEach((target) => markBlockText(target, "siteBody", `texto de ${siteKindLabels[kind || ""] || "la sección"}`));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy .bespoke-cta").forEach((target) => markBlockText(target, "siteCtaLabel", "botón de la sección"));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-free-copy-layer > [data-site-block]").forEach((target) => {
      const blockKind = target.dataset.siteBlockKind;
      const label = blockKind === "heading"
        ? "título adicional de la sección"
        : blockKind === "action"
          ? "botón adicional de la sección"
          : "texto adicional de la sección";
      markBlockText(target, "siteBlockText", label);
    });
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-media [data-site-block-kind='media']").forEach((target) => {
      markStorePreviewEditorTarget(target, { section: `site-${id}`, field: "siteBlockMedia", label: "imagen de la sección", itemId: target.dataset.siteBlock });
    });
    element.querySelectorAll<HTMLElement>(".bespoke-story-flow .store-flow-section").forEach((scene, itemIndex) => {
      const heading = scene.querySelector<HTMLElement>(".store-flow-copy h3");
      const body = scene.querySelector<HTMLElement>(".store-flow-copy p");
      const media = scene.querySelector<HTMLElement>("figure");
      if (heading) markStorePreviewEditorTarget(heading, { section: `site-${id}`, field: heading.dataset.siteBlock ? "siteBlockText" : "siteItemTitle", label: `título de escena ${itemIndex + 1}`, itemIndex, ...(heading.dataset.siteBlock ? { itemId: heading.dataset.siteBlock } : {}) });
      if (body) markStorePreviewEditorTarget(body, { section: `site-${id}`, field: body.dataset.siteBlock ? "siteBlockText" : "siteItemBody", label: `texto de escena ${itemIndex + 1}`, itemIndex, ...(body.dataset.siteBlock ? { itemId: body.dataset.siteBlock } : {}) });
      if (media) markStorePreviewEditorTarget(media, { section: `site-${id}`, field: media.dataset.siteBlock ? "siteBlockMedia" : "siteMedia", label: `imagen de escena ${itemIndex + 1}`, itemIndex, ...(media.dataset.siteBlock ? { itemId: media.dataset.siteBlock } : {}) });
    });
  });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-hero:not([data-site-section]) .bespoke-copy :is(h1, h2)'), { section: "hero", field: "storeTagline", label: "título de portada" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-hero:not([data-site-section]) .bespoke-media'), { section: "hero", field: "storeBanner", label: "imagen de portada" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-copy h2'), { section: "about", field: "aboutTitle", label: "título de la historia" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-copy p'), { section: "about", field: "aboutBody", label: "historia de la marca" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-media'), { section: "about", field: "aboutImage", label: "imagen de la historia" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-gallery:not([data-site-section]) .bespoke-copy h2'), { section: "gallery", field: "galleryTitle", label: "título de la galería" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-gallery:not([data-site-section]) .bespoke-copy p'), { section: "gallery", field: "gallerySubtitle", label: "subtítulo de la galería" });
  app.querySelectorAll<HTMLElement>(".bespoke-gallery[data-site-section]").forEach((gallery) => {
    const siteSectionId = gallery.dataset.siteSection;
    if (!siteSectionId) return;
    const mediaTargets = gallery.querySelectorAll<HTMLElement>(":scope > .bespoke-media > [data-site-block-kind='media'], :scope > .bespoke-media > .store-fidelity-media, :scope > .bespoke-media > video");
    mediaTargets.forEach((media, itemIndex) => {
      markStorePreviewEditorTarget(media, {
        section: `site-${siteSectionId}`,
        field: media.dataset.siteBlock ? "siteBlockMedia" : "editorialMedia",
        label: `imagen ${itemIndex + 1} de ${gallery.getAttribute("aria-label") || "la galería"}`,
        itemIndex,
        ...(media.dataset.siteBlock ? { itemId: media.dataset.siteBlock } : {}),
      });
    });
  });
  app.querySelectorAll<HTMLElement>("[data-store-section-key]").forEach((element) => {
    const section = element.dataset.storeSectionKey!;
    const animationId = section.startsWith("animation-") ? section.slice("animation-".length) : undefined;
    const siteId = section.startsWith("site-") ? section.slice("site-".length) : undefined;
    const authoredSection = siteId ? store.siteDocument?.sections?.find((candidate) => candidate.id === siteId) : undefined;
    markStorePreviewEditorTarget(element, {
      section: section as StorePreviewEditorSelection["section"],
      field: "section",
      label: animationId
        ? "sección animada"
        : authoredSection?.title || (authoredSection ? siteKindLabels[authoredSection.kind] : undefined) || `sección ${section}`,
      ...(animationId ? { animationId } : {}),
    });
  });
  markStorePreviewEditorTarget(app.querySelector(".store-title"), { section: "brand", field: "storeName", label: "nombre de la tienda" });
  markStorePreviewEditorTarget(app.querySelector(".store-tagline"), { section: "brand", field: "storeTagline", label: "descripción corta" });
  markStorePreviewEditorTarget(app.querySelector(".merchant-header-logo"), { section: "brand", field: "storeLogo", label: "logo" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-nav"), { section: "navigation", field: "section", label: "navegación superior" });
  markAllStorePreviewEditorTargets(".store-site-nav [data-site-navigation-item]", (element, index) => ({
    section: "navigation",
    field: "navigationLabel",
    label: `enlace superior ${index + 1}`,
    itemIndex: Number(element.dataset.siteNavigationIndex || index),
  }));
  const announcement = app.querySelector<HTMLElement>(".store-announcement");
  markStorePreviewEditorTarget(announcement, { section: "announcement", field: "announcementText", label: "marquesina superior" });
  if (announcement) {
    announcement.removeAttribute("data-store-editor-inline");
    announcement.tabIndex = 0;
    announcement.setAttribute("role", "button");
    announcement.setAttribute("aria-label", "Configurar marquesina superior");
    announcement.setAttribute("aria-description", "Cambia el texto y la apariencia, o quita la marquesina desde la vista previa.");
  }
  markStorePreviewEditorTarget(app.querySelector(".store-hero.has-banner img"), { section: "hero", field: "storeBanner", label: "imagen de portada" });
  const authoredHeroId = app.querySelector<HTMLElement>(".bespoke-hero[data-site-section]")?.dataset.siteSection;
  markAllStorePreviewEditorTargets(".store-slide", (element) => ({
    section: authoredHeroId ? `site-${authoredHeroId}` : "hero",
    field: authoredHeroId ? "siteMedia" : "media",
    label: `escena ${Number(element.dataset.slideIndex || 0) + 1} de la portada`,
    itemIndex: Number(element.dataset.slideIndex || 0),
  }));
  markAllStorePreviewEditorTargets(".store-slide h2", (element) => ({ section: authoredHeroId ? `site-${authoredHeroId}` : "hero", field: authoredHeroId ? "siteItemTitle" : "title", label: "título de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide p", (element) => ({ section: authoredHeroId ? `site-${authoredHeroId}` : "hero", field: authoredHeroId ? "siteItemBody" : "body", label: "texto de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide-cta", (element) => ({ section: "hero", field: "ctaLabel", label: "botón de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markStorePreviewEditorTarget(app.querySelector("#store-products-title"), { section: "products", field: "catalogTitle", label: "título del catálogo" });
  markStorePreviewEditorTarget(app.querySelector(".store-catalog-heading p"), { section: "products", field: "catalogSubtitle", label: "subtítulo del catálogo" });
  app.querySelectorAll<HTMLElement>(".catalog-section-card[data-catalog-section]").forEach((card) => {
    const categoryId = card.dataset.catalogSection;
    if (!categoryId || categoryId === "null") return;
    const category = store.categories.find((candidate) => candidate.id === categoryId);
    markStorePreviewEditorTarget(card.querySelector(".catalog-section-media"), {
      section: "products",
      field: "categoryBanner",
      label: `portada de ${category?.name || "la sección de productos"}`,
      itemId: categoryId,
    });
  });
  markAllStorePreviewEditorTargets(".store-item", (element) => {
    const item = store.items.find((candidate) => candidate.id === element.dataset.id);
    const siteCatalog = element.closest<HTMLElement>(".bespoke-zone[data-site-kind='catalog'][data-site-section]");
    if (siteCatalog?.dataset.siteSection) {
      return {
        section: `site-${siteCatalog.dataset.siteSection}`,
        field: "section",
        label: item ? `productos de ${item.name}` : "productos del catálogo",
      };
    }
    return { section: "products", field: "product", label: item ? `producto ${item.name}` : "producto", itemId: element.dataset.id };
  });
  markStorePreviewEditorTarget(app.querySelector(".store-about"), { section: "about", field: "aboutImage", label: "imagen de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-title-text"), { section: "about", field: "aboutTitle", label: "título de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-subtitle"), { section: "about", field: "aboutSubtitle", label: "subtítulo de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-body"), { section: "about", field: "aboutBody", label: "historia de la marca" });
  markStorePreviewEditorTarget(app.querySelector("#store-gallery-title"), { section: "gallery", field: "galleryTitle", label: "título de la galería" });
  markStorePreviewEditorTarget(app.querySelector(".store-editorial-gallery > .store-section-heading p"), { section: "gallery", field: "gallerySubtitle", label: "subtítulo de la galería" });
  const editorialCount = Math.max(store.editorialGallery?.length || 0, 1);
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item", (_element, index) => ({ section: "gallery", field: "editorialMedia", label: `imagen editorial ${(index % editorialCount) + 1}`, itemIndex: index % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption strong", (element, index) => ({ section: "gallery", field: "editorialTitle", label: "título de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption span", (element, index) => ({ section: "gallery", field: "editorialCaption", label: "línea de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption p", (element, index) => ({ section: "gallery", field: "editorialBody", label: "texto de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]").forEach((section) => {
    const animationId = section.dataset.animationId!;
    const animation = store.animations?.find((candidate) => candidate.id === animationId);
    markStorePreviewEditorTarget(section, { section: `animation-${animationId}`, field: "section", label: animation?.name || "sección animada", animationId });
    if (!section.querySelector(".store-animation-delete-control")) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "store-animation-delete-control";
      deleteButton.dataset.animationId = animationId;
      deleteButton.setAttribute("aria-label", `Eliminar ${animation?.name || "animación"}`);
      deleteButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>Eliminar animación</span>`;
      section.prepend(deleteButton);
    }
    const animationMediaUrls = (animation?.media ?? []).map((entry) => assetUrl(entry.imageUrl));
    const markAnimationMediaTarget = (element: HTMLElement | null, itemIndex: number) => {
      if (!element || itemIndex < 0 || itemIndex >= animationMediaUrls.length) return;
      markStorePreviewEditorTarget(element, {
        section: `animation-${animationId}`,
        field: "media",
        label: `medio ${itemIndex + 1} de la animación`,
        animationId,
        itemIndex,
      });
    };
    section.querySelectorAll<HTMLElement>("img[src], video[src]").forEach((media) => {
      if (media.closest("[data-animation-product-card]")) return;
      const itemIndex = animationMediaUrls.indexOf(media.getAttribute("src"));
      markAnimationMediaTarget(media, itemIndex);
    });
    const indexedTargets = [
      [".store-flow-section", null],
      ["[data-motion-hero-to]", "data-motion-hero-to"],
      ["[data-gallery-scroll-cell]", "data-gallery-scroll-cell"],
      ["[data-testimonial-index]", "data-testimonial-index"],
      ["[data-zoom-index]", "data-zoom-index"],
      ["[data-portfolio-panel]", "data-portfolio-panel"],
      ["[data-full-chapter-copy]", "data-full-chapter-copy"],
      ["[data-frame]", "data-frame"],
    ] as const;
    indexedTargets.forEach(([selector, attribute]) => {
      section.querySelectorAll<HTMLElement>(selector).forEach((element, fallbackIndex) => {
        const itemIndex = attribute ? Number(element.getAttribute(attribute)) : fallbackIndex;
        if (Number.isInteger(itemIndex)) markAnimationMediaTarget(element, itemIndex);
      });
    });
    section.querySelectorAll<HTMLElement>(".store-image-stream-grid > figure").forEach(markAnimationMediaTarget);
    markAnimationMediaTarget(section.querySelector<HTMLElement>(".store-scroll-expansion-sticky > figure"), 0);
    markAnimationMediaTarget(section.querySelector<HTMLElement>(".store-scroll-expansion-background"), 1);
    const magneticTarget = section.querySelector<HTMLElement>("[data-magnetic-target]");
    markAnimationMediaTarget(magneticTarget, 0);
    section.querySelectorAll<HTMLElement>(
      "[data-animation-general-copy] > h3, [data-animation-general-copy] > p, [data-animation-copy] [data-animation-copy-field]",
    ).forEach((text) => {
      const textBlock = text.closest<HTMLElement>("[data-animation-text-block]");
      if (textBlock) {
        const blockId = textBlock.dataset.animationTextBlock;
        const block = animation?.textBlocks?.find((candidate) => candidate.id === blockId);
        if (blockId) markStorePreviewEditorTarget(text, {
          section: `animation-${animationId}`,
          field: "textBlock",
          label: block?.role === "subtitle" ? "subtítulo adicional" : "título adicional",
          animationId,
          itemId: blockId,
        });
        return;
      }
      const general = !!text.closest("[data-animation-general-copy]");
      const copy = text.closest<HTMLElement>("[data-animation-copy]");
      const itemIndex = Number(copy?.dataset.animationMediaIndex);
      const explicitField = text.dataset.animationCopyField;
      const inferredField = text.matches("h3, strong") ? "title" : text.matches("blockquote") ? "body" : "body";
      const field = general
        ? text.matches("h3") ? "animationTitle" : "animationSubtitle"
        : Number.isInteger(itemIndex)
          ? explicitField || inferredField
          : ["body", "caption"].includes(explicitField || inferredField) ? "animationSubtitle" : "animationTitle";
      const labels: Record<string, string> = {
        title: "título de la escena",
        caption: "subtítulo de la escena",
        body: "texto de la escena",
        animationTitle: "título general de la animación",
        animationSubtitle: "subtítulo general de la animación",
      };
      markStorePreviewEditorTarget(text, {
        section: `animation-${animationId}`,
        field,
        label: labels[field] || "texto de la animación",
        animationId,
        ...(!general && Number.isInteger(itemIndex) ? { itemIndex } : {}),
      });
    });
    section.querySelectorAll<HTMLElement>("[data-animation-style-target]").forEach((text) => {
      markStorePreviewEditorTarget(text, {
        section: `animation-${animationId}`,
        field: "animationStyle",
        label: "texto de la animación",
        animationId,
      });
    });
    section.querySelectorAll<HTMLElement>("[data-animation-copy]").forEach((copy, copyIndex) => {
      if (copy.hasAttribute("data-animation-media-index")) applyAnimationCopySceneLayout(copy);
      // Text-along-path is a full-bleed animation surface, not a movable copy
      // layer. Dragging it used to pull the background and SVG out of the
      // section instead of repositioning text.
      if (copy.matches("[data-text-along-path]")) {
        delete copy.dataset.animationLayoutTarget;
        delete copy.dataset.animationCopyIndex;
        copy.classList.remove("store-animation-layout-static", "store-animation-layout-selected");
        copy.querySelector(":scope > .store-animation-layout-controls")?.remove();
        copy.removeAttribute("aria-description");
        return;
      }
      copy.dataset.animationLayoutTarget = animationId;
      copy.dataset.animationCopyIndex = String(copyIndex);
      copy.tabIndex = 0;
      copy.classList.toggle("store-animation-layout-static", getComputedStyle(copy).position === "static");
      copy.setAttribute("aria-description", "Arrastra el bloque o su agarre para mover el texto. Haz clic para escribir; el ancho y el tamaño se ajustan en el panel.");
      if (copy.querySelector(":scope > .store-animation-layout-controls")) return;
      const controls = document.createElement("span");
      controls.className = "store-animation-layout-controls";
      controls.setAttribute("aria-label", "Mover el bloque de texto");
      controls.innerHTML = `
        <button type="button" data-animation-layout-handle="move" aria-label="Mover texto" title="Arrastrar para mover el texto"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="7" cy="10" r="1.35"/><circle cx="13" cy="10" r="1.35"/><circle cx="7" cy="15" r="1.35"/><circle cx="13" cy="15" r="1.35"/></svg></button>`;
      copy.appendChild(controls);
    });
    const animationButtonSelection: StorePreviewEditorSelection = {
      section: `animation-${animationId}`,
      field: "buttonLabel",
      label: "botón de la animación",
      animationId,
    };
    const animationButton = section.querySelector<HTMLElement>(".store-animation-cta[data-animation-button-layout-target]");
    const animationButtonLabel = animationButton?.querySelector<HTMLElement>(".store-animation-cta-label") ?? null;
    markStorePreviewEditorTarget(animationButtonLabel, animationButtonSelection);
    // The whole CTA belongs to the editor while preview editing is active.
    // Marking only its text allowed clicks on the arrow/padding to follow the
    // storefront link and made the button feel much harder to grab.
    markStorePreviewEditorTarget(animationButton, animationButtonSelection);
    if (animationButton) {
      delete animationButton.dataset.storeEditorInline;
      animationButton.setAttribute("aria-description", "Arrastra desde cualquier parte del botón para moverlo. Tócalo para editar su texto.");
      if (!animationButton.querySelector(".store-animation-button-handle")) {
        const handle = document.createElement("span");
        handle.className = "store-animation-button-handle";
        handle.setAttribute("aria-hidden", "true");
        handle.innerHTML = `<svg viewBox="0 0 20 20"><circle cx="7" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="7" cy="10" r="1.35"/><circle cx="13" cy="10" r="1.35"/><circle cx="7" cy="15" r="1.35"/><circle cx="13" cy="15" r="1.35"/></svg>`;
        animationButton.appendChild(handle);
      }
    }
  });
  markAllStorePreviewEditorTargets(".store-link-btn", (_element, index) => ({ section: "links", field: "linkLabel", label: `enlace social ${index + 1}`, itemIndex: index }));
  markStorePreviewEditorTarget(app.querySelector("#store-links-title"), { section: "links", field: "linksTitle", label: "título de redes sociales" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-footer"), { section: "footer", field: "section", label: "pie de página" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-footer-brand p"), { section: "footer", field: "footerBrandDescription", label: "descripción del pie" });
  markAllStorePreviewEditorTargets(".store-site-footer-column h2", (_element, index) => ({ section: "footer", field: "footerColumnTitle", label: `título de columna ${index + 1}`, itemIndex: index }));
  app.querySelectorAll<HTMLElement>(".store-site-footer-column").forEach((column, columnIndex) => {
    column.querySelectorAll<HTMLElement>("[data-site-footer-item]").forEach((item, itemIndex) => markStorePreviewEditorTarget(item, {
      section: "footer",
      field: "footerItemLabel",
      label: `elemento ${itemIndex + 1} de la columna ${columnIndex + 1}`,
      itemId: `${columnIndex}:${itemIndex}`,
    }));
  });
  markStorePreviewEditorTarget(app.querySelector("[data-site-footer-copyright]"), { section: "footer", field: "footerCopyright", label: "texto legal del pie" });
  markStorePreviewEditorTarget(app.querySelector("[data-site-footer-badge]"), { section: "footer", field: "footerBadge", label: "sello del pie" });
  markStorePreviewEditorTarget(app.querySelector(".store-contact-section"), { section: "contact", field: "contact", label: "formulario de contacto" });
  markStorePreviewEditorTarget(app.querySelector("#store-contact-title"), { section: "contact", field: "contactTitle", label: "título de contacto" });
  markStorePreviewEditorTarget(app.querySelector(".store-contact-copy p"), { section: "contact", field: "contactSubtitle", label: "texto de contacto" });
  markStorePreviewEditorTarget(app.querySelector(".store-location-section"), { section: "location", field: "location", label: "ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector("#store-location-title"), { section: "location", field: "locationTitle", label: "título de ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector(".store-location-heading p"), { section: "location", field: "locationSubtitle", label: "texto de ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-image"), { section: "promotion", field: "promotionImage", label: "imagen de promoción" });
  markStorePreviewEditorTarget(app.querySelector("#promotion-title"), { section: "promotion", field: "promotionTitle", label: "título de promoción" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-dialog p"), { section: "promotion", field: "promotionBody", label: "texto de promoción" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-action"), { section: "promotion", field: "promotionAction", label: "botón de promoción" });
  markStorePreviewEditorTarget(app.querySelector("#cart-pay"), { section: "products", field: "cartButton", label: "botón del carrito" });
  renderStorePreviewSectionInsertions();
  syncStorePreviewEditorMode();
  syncStorePreviewEditorSelection();
}
