/** The floating canvas toolbar, its color palette, and navigation/footer drafts. */
import { Store, StoreItem, assetUrl } from "../api";
import { postToParent } from "../postmessage";
import { state } from "../state";
import { type StorePreviewEditorSelection } from "../preview-mode";
import { escapeHtml, formatAmount } from "../ui/html";
import { storePreviewRenderedSiteDocument, beginStorePreviewInlineImageEdit } from "./editor-base";
import { accentContrastColor, colorContrastRatio } from "../ui/color";
import { storefrontRouteFromLocation, storeCatalogUrl, storeCollectionUrl, storePageUrl } from "../storefront/routes";
import { app } from "../ui/app";
import { activeSiteSectionViewport, SITE_SECTION_MAX_HEIGHT, SITE_SECTION_MIN_HEIGHT, storeAnimationMediaRequirement, STORE_MOTION_EXPERIENCE_LABELS, applySiteSectionPreviewHeight } from "../storefront/motion";
import { isVideoMediaUrl } from "../ui/media";


export function storePreviewCanvasToolbar(): HTMLElement {
  let toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "store-preview-canvas-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Controles directos de la selección");
    document.body.appendChild(toolbar);
  }
  return toolbar;
}

export function positionStorePreviewCanvasToolbar(toolbar: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const maxLeft = Math.max(10, window.innerWidth - toolbarRect.width - 10);
  const preferredLeft = toolbar.classList.contains("is-animation-popover")
    ? rect.right - toolbarRect.width - 10
    : rect.left + (rect.width - toolbarRect.width) / 2;
  const left = Math.max(10, Math.min(preferredLeft, maxLeft));
  const above = rect.top - toolbarRect.height - 10;
  const maxTop = Math.max(10, window.innerHeight - toolbarRect.height - 10);
  // A tall popover placed below a selected section can cover the next section
  // completely, making it look like a blank white bar and preventing clicks.
  // When there is no room above, keep it inside the selected target instead.
  const insideSelectedTarget = Math.max(10, Math.min(rect.top + 10, maxTop));
  const top = above >= 10 ? Math.min(above, maxTop) : insideSelectedTarget;
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.max(10, Math.round(top))}px`;
  bindStorePreviewCanvasToolbarDrag(toolbar, target);
}

export function bindStorePreviewCanvasToolbarDrag(toolbar: HTMLElement, target: HTMLElement): void {
  const handle = toolbar.querySelector<HTMLElement>(":scope > .store-preview-animation-popover > header");
  if (!handle || handle.dataset.canvasDragBound === "true") return;
  handle.dataset.canvasDragBound = "true";
  handle.classList.add("store-preview-popover-drag-handle");
  handle.title = "Arrastra para mover este panel · doble clic para devolverlo a su lugar";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const finish = (pointerId?: number) => {
    if (!dragging) return;
    dragging = false;
    toolbar.classList.remove("is-dragging");
    if (pointerId !== undefined) handle.releasePointerCapture?.(pointerId);
  };
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || window.matchMedia("(max-width: 640px)").matches) return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a, label")) return;
    const rect = toolbar.getBoundingClientRect();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    toolbar.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = toolbar.getBoundingClientRect();
    const left = Math.max(8, Math.min(startLeft + event.clientX - startX, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(startTop + event.clientY - startY, window.innerHeight - rect.height - 8));
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
    event.preventDefault();
  });
  handle.addEventListener("pointerup", (event) => finish(event.pointerId));
  handle.addEventListener("pointercancel", (event) => finish(event.pointerId));
  handle.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a, label")) return;
    positionStorePreviewCanvasToolbar(toolbar, target);
  });
}

export function storePreviewUsedColors(store: Store | null | undefined): string[] {
  const colors = new Map<string, { color: string; score: number; order: number }>();
  let order = 0;
  const add = (value: unknown, score = 1) => {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return;
    const color = value.toLowerCase();
    const existing = colors.get(color);
    if (existing) existing.score += score;
    else colors.set(color, { color, score, order: order++ });
  };
  if (!store) return [];

  const theme = store.siteDocument?.theme;
  add(theme?.pageBackground, 6);
  add(theme?.textColor, 6);
  add(theme?.accentColor, 5);
  add(theme?.surfaceColor, 4);
  add(theme?.secondaryColor, 3);
  add(theme?.mutedColor, 2);
  add(theme?.borderColor);
  add(store.backgroundColor, 2);
  add(store.backgroundGradientStart, 2);
  add(store.backgroundGradientEnd, 2);
  add(store.accentColor, 3);
  add(store.announcementColor, 2);
  Object.values(store.sectionBackgrounds ?? {}).forEach((color) => add(color, 3));

  store.siteDocument?.sections.forEach((section) => {
    add(section.backgroundColor, 3);
    add(section.textColor, 3);
    add(section.titleStyle?.textColor);
    add(section.bodyStyle?.textColor);
    section.items.forEach((item) => {
      add(item.titleStyle?.textColor);
      add(item.bodyStyle?.textColor);
    });
    const addBlockColors = (blocks = section.blocks ?? []) => blocks.forEach((block) => {
      add(block.style?.textColor);
      addBlockColors(block.children ?? []);
    });
    addBlockColors();
  });
  store.animations?.forEach((animation) => {
    add(animation.backgroundColor, 2);
    add(animation.textColor, 2);
    animation.textBlocks?.forEach((block) => add(block.textColor));
    animation.media.forEach((media) => {
      add(media.boxColor);
      add(media.textColor);
    });
  });

  return [...colors.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 8)
    .map(({ color }) => color);
}

export function storePreviewPaletteHtml(colors: string[], target: string, current: string, label: string): string {
  const normalizedCurrent = current.toLowerCase();
  const palette = /^#[0-9a-f]{6}$/i.test(normalizedCurrent) && !colors.includes(normalizedCurrent)
    ? [normalizedCurrent, ...colors].slice(0, 8)
    : colors;
  if (!palette.length) return "";
  return `<div class="store-preview-site-palette" role="group" aria-label="Colores más usados en este sitio para ${label.toLowerCase()}">
    <span class="store-preview-site-palette-label">${escapeHtml(label)}</span>
    ${palette.map((color) => `<button type="button" class="store-preview-palette-swatch" data-canvas-palette="${target}" data-palette-color="${color}" style="--palette-color:${color}" aria-label="Usar ${color}" aria-pressed="${color === normalizedCurrent}" title="Usar ${color}"></button>`).join("")}
  </div>`;
}

export function bindStorePreviewPalette(toolbar: HTMLElement, controls: Record<string, HTMLInputElement | null>): void {
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-palette]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.canvasPalette;
    const color = button.dataset.paletteColor;
    const control = target ? controls[target] : null;
    if (!control || !color || !/^#[0-9a-f]{6}$/i.test(color)) return;
    control.value = color;
    toolbar.querySelectorAll<HTMLButtonElement>(`[data-canvas-palette="${target}"]`).forEach((swatch) => {
      swatch.setAttribute("aria-pressed", String(swatch.dataset.paletteColor === color));
    });
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }));
}

export function updateStorePreviewNavigationDraft(index: number, key: "label" | "target", value: string): void {
  const document = storePreviewRenderedSiteDocument();
  const item = document?.navigation?.items?.[index];
  if (!item) return;
  if (key === "label") {
    item.label = value.slice(0, 40);
    return;
  }
  if (value === "home" || value === "catalog") {
    item.target = value;
    delete item.sectionId;
    delete item.pageId;
    return;
  }
  if (value.startsWith("page:")) {
    const pageId = value.slice("page:".length);
    if (!document?.pages?.some((page) => page.id === pageId)) return;
    item.target = "page";
    item.pageId = pageId;
    delete item.sectionId;
    return;
  }
  if (!value.startsWith("section:")) return;
  const sectionId = value.slice("section:".length);
  if (!document?.sections.some((section) => section.id === sectionId)) return;
  item.target = "section";
  item.sectionId = sectionId;
  delete item.pageId;
}

export function updateStorePreviewFooterDraft(
  selection: StorePreviewEditorSelection,
  key: "brandDescription" | "copyright" | "badge" | "columnTitle" | "itemLabel" | "itemHref",
  value: string,
): void {
  const footer = storePreviewRenderedSiteDocument()?.footer;
  if (!footer) return;
  if (key === "brandDescription" || key === "copyright" || key === "badge") {
    footer[key] = value;
    return;
  }
  if (key === "columnTitle" && Number.isInteger(selection.itemIndex)) {
    const column = footer.columns[selection.itemIndex!];
    if (column) column.title = value;
    return;
  }
  if (!selection.itemId) return;
  const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
  const item = footer.columns[columnIndex]?.items[itemIndex];
  if (!item) return;
  if (key === "itemLabel") item.label = value;
  else item.href = value;
}

export function renderStorePreviewCanvasToolbar(target: HTMLElement | null, selection: StorePreviewEditorSelection | null): void {
  const toolbar = storePreviewCanvasToolbar();
  toolbar.className = "store-preview-canvas-toolbar";
  if (!target || !selection || !state.storePreviewEditorEnabled) {
    toolbar.hidden = true;
    toolbar.replaceChildren();
    return;
  }
  const renderedStore = state.activePreviewRenderedStore ?? state.activePreviewStore?.store ?? state.activeStoreRoute?.store;
  const paletteColors = storePreviewUsedColors(renderedStore);
  if (selection.section === "announcement") {
    const mode = target.dataset.announcementMode === "marquee" ? "marquee" : "static";
    const speed = Math.min(40, Math.max(8, Number(target.dataset.announcementSpeed || 18)));
    const size = ["small", "medium", "large"].includes(target.dataset.announcementSize || "") ? target.dataset.announcementSize! : "small";
    const font = ["store", "modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(target.dataset.announcementFont || "") ? target.dataset.announcementFont! : "store";
    const effect = ["none", "wave", "pulse", "sparkle"].includes(target.dataset.announcementEffect || "") ? target.dataset.announcementEffect! : "none";
    const color = /^#[0-9a-f]{6}$/i.test(target.dataset.announcementColor || "") ? target.dataset.announcementColor! : "#ffffff";
    const announcementText = renderedStore?.announcement || "";
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-announcement-popover">
      <header><strong>Marquesina superior</strong><span>Texto, apariencia y movimiento</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <label class="store-preview-animation-field"><span>Mensaje</span><textarea data-canvas-announcement-text maxlength="240" rows="3">${escapeHtml(announcementText)}</textarea></label>
      <div class="store-preview-animation-fields">
        <label class="store-preview-animation-field"><span>Movimiento</span><select data-canvas-announcement="announcementMode" aria-label="Movimiento de la marquesina"><option value="static"${mode === "static" ? " selected" : ""}>Texto fijo</option><option value="marquee"${mode === "marquee" ? " selected" : ""}>Cinta continua</option></select></label>
        <label class="store-preview-animation-field"><span>Altura</span><select data-canvas-announcement="announcementSize" aria-label="Altura de la marquesina"><option value="small"${size === "small" ? " selected" : ""}>Compacta</option><option value="medium"${size === "medium" ? " selected" : ""}>Mediana</option><option value="large"${size === "large" ? " selected" : ""}>Grande</option></select></label>
        <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-announcement="announcementFont" aria-label="Tipografía de la marquesina"><option value="store"${font === "store" ? " selected" : ""}>Fuente de tienda</option><option value="modern"${font === "modern" ? " selected" : ""}>Moderna</option><option value="editorial"${font === "editorial" ? " selected" : ""}>Editorial</option><option value="friendly"${font === "friendly" ? " selected" : ""}>Cercana</option><option value="classic"${font === "classic" ? " selected" : ""}>Clásica</option><option value="geometric"${font === "geometric" ? " selected" : ""}>Geométrica</option><option value="artisan"${font === "artisan" ? " selected" : ""}>Artesanal</option><option value="condensed"${font === "condensed" ? " selected" : ""}>Condensada</option><option value="luxury"${font === "luxury" ? " selected" : ""}>Alta moda</option></select></label>
        <label class="store-preview-animation-field"><span>Efecto</span><select data-canvas-announcement="announcementEffect" aria-label="Efecto de letras"><option value="none"${effect === "none" ? " selected" : ""}>Sin efecto</option><option value="wave"${effect === "wave" ? " selected" : ""}>Onda</option><option value="pulse"${effect === "pulse" ? " selected" : ""}>Pulso</option><option value="sparkle"${effect === "sparkle" ? " selected" : ""}>Destello</option></select></label>
      </div>
      <div class="store-preview-announcement-finish">
        ${mode === "marquee" ? `<label class="store-preview-toolbar-speed"><span>Duración de la vuelta</span><input type="range" min="8" max="40" step="1" value="${speed}" data-canvas-announcement="announcementSpeed" aria-label="Segundos por vuelta"><output>${speed}s</output></label>` : ""}
        <label class="store-preview-toolbar-color" title="Color de fondo"><span class="sr-only">Color de fondo</span><input type="color" data-canvas-announcement="announcementColor" value="${color}" aria-label="Color de fondo de la marquesina"></label>
      </div>
      ${storePreviewPaletteHtml(paletteColors, "announcement", color, "Fondo")}
      <footer><span class="store-preview-footer-help">Al quitarla se oculta de la tienda; puedes deshacer antes de guardar.</span><span class="store-preview-animation-spacer"></span><button type="button" class="danger" data-canvas-announcement-remove>Quitar marquesina</button></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-announcement-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-canvas-announcement]").forEach((control) => {
      const preview = () => {
        const key = control.dataset.canvasAnnouncement;
        if (key === "announcementColor" && /^#[0-9a-f]{6}$/i.test(control.value)) {
          target.dataset.announcementColor = control.value;
          target.style.setProperty("--announcement-bg", control.value);
          target.style.setProperty("--announcement-ink", accentContrastColor(control.value));
        }
        if (key === "announcementSpeed") {
          target.dataset.announcementSpeed = control.value;
          target.style.setProperty("--marquee-duration", `${control.value}s`);
          control.nextElementSibling?.replaceChildren(`${control.value}s`);
        }
        if (key === "announcementFont") {
          Array.from(target.classList)
            .filter((className) => className.startsWith("announcement-font-"))
            .forEach((className) => target.classList.remove(className));
          target.classList.add(`announcement-font-${control.value}`);
          target.dataset.announcementFont = control.value;
        }
      };
      const send = () => {
        const key = control.dataset.canvasAnnouncement;
        const value = control instanceof HTMLInputElement && control.type === "range" ? Number(control.value) : control.value;
        preview();
        postToParent("STORE_EDITOR_ANNOUNCEMENT_STYLE", { selection, key, value });
      };
      if (control instanceof HTMLInputElement && ["color", "range"].includes(control.type)) control.addEventListener("input", preview);
      control.addEventListener("change", send);
    });
    bindStorePreviewPalette(toolbar, {
      announcement: toolbar.querySelector<HTMLInputElement>('[data-canvas-announcement="announcementColor"]'),
    });
    toolbar.querySelector<HTMLTextAreaElement>("[data-canvas-announcement-text]")?.addEventListener("change", (event) => {
      postToParent("STORE_EDITOR_INLINE_TEXT", { selection, value: (event.currentTarget as HTMLTextAreaElement).value });
    });
    toolbar.querySelector("[data-canvas-announcement-remove]")?.addEventListener("click", () => {
      postToParent("STORE_EDITOR_ANNOUNCEMENT_REMOVE", { selection });
    });
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "brand" && selection.field === "storeName") {
    const brandStyle = renderedStore?.siteDocument?.navigation?.brandStyle;
    const scale = Math.min(200, Math.max(50, Number(target.dataset.canvasTextScale || brandStyle?.textScale || 100)));
    const fontStyle = target.dataset.animationFontStyle || brandStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
    const color = /^#[0-9a-f]{6}$/i.test(target.dataset.canvasTextColor || "")
      ? target.dataset.canvasTextColor!
      : /^#[0-9a-f]{6}$/i.test(brandStyle?.textColor || "")
        ? brandStyle!.textColor!
        : renderedStore?.siteDocument?.theme?.textColor || "#171717";
    const fontOptions = [
      ["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"],
      ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"],
    ].map(([value, label]) => `<option value="${value}"${fontStyle === value ? " selected" : ""}>${label}</option>`).join("");
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-brand-popover">
      <header><strong>Heading superior</strong><span>Nombre de la tienda</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <div class="store-preview-animation-fields store-preview-brand-appearance">
        <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-brand-font aria-label="Tipografía del nombre de la tienda">${fontOptions}</select></label>
        <label class="store-preview-animation-field"><span>Color</span><span class="store-preview-brand-color-control"><input type="color" data-canvas-brand-color value="${color}" aria-label="Color del nombre de la tienda"><output data-canvas-brand-color-output>${color.toUpperCase()}</output></span></label>
      </div>
      ${storePreviewPaletteHtml(paletteColors, "brand-text", color, "Color del heading")}
      <section class="store-preview-section-height-control store-preview-brand-scale" aria-labelledby="store-preview-brand-scale-title">
        <div><strong id="store-preview-brand-scale-title">Tamaño del heading</strong><span>50–200%</span></div>
        <label><span class="sr-only">Tamaño del nombre de la tienda</span><input type="range" min="50" max="200" step="5" value="${scale}" data-canvas-brand-scale aria-valuetext="${scale}%"></label>
        <output data-canvas-brand-scale-output>${scale}%</output>
      </section>
      <p class="store-preview-footer-help">Ajusta el título de la parte superior sin cerrar Yapi.</p>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-brand-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    const scaleControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-brand-scale]");
    const previewScale = () => {
      if (!scaleControl) return;
      const value = Math.min(200, Math.max(50, Number(scaleControl.value) || 100));
      target.dataset.canvasTextScale = String(value);
      target.style.setProperty("--canvas-text-scale", String(value / 100));
      scaleControl.setAttribute("aria-valuetext", `${value}%`);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-brand-scale-output]")?.replaceChildren(`${value}%`);
    };
    scaleControl?.addEventListener("input", previewScale);
    scaleControl?.addEventListener("change", () => {
      previewScale();
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "textScale", value: Number(scaleControl.value) });
    });
    toolbar.querySelector<HTMLSelectElement>("[data-canvas-brand-font]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      target.dataset.animationFontStyle = value;
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "fontStyle", value });
    });
    const colorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-brand-color]");
    colorControl?.addEventListener("input", () => {
      target.dataset.canvasTextColor = colorControl.value;
      target.style.setProperty("--canvas-text-color", colorControl.value);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-brand-color-output]")?.replaceChildren(colorControl.value.toUpperCase());
    });
    colorControl?.addEventListener("change", () => {
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "textColor", value: colorControl.value });
    });
    bindStorePreviewPalette(toolbar, { "brand-text": colorControl });
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "products" && selection.field === "categoryBanner" && selection.itemId) {
    toolbar.innerHTML = `<button type="button" data-canvas-category-cover><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5M13.5 7.5h.01"/></svg><span>Cambiar portada</span></button>`;
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelector("[data-canvas-category-cover]")?.addEventListener("click", () => beginStorePreviewInlineImageEdit(selection));
    return;
  }
  if (selection.section === "navigation") {
    const siteDocument = renderedStore?.siteDocument;
    const siteSections = siteDocument?.sections ?? [];
    const sitePages = siteDocument?.pages ?? [];
    const navigationItems = siteDocument?.navigation?.items?.length
      ? siteDocument.navigation.items
      : [
          { id: "home", label: "Inicio", target: "home" as const },
          { id: "catalog", label: "Catálogo", target: "catalog" as const },
          ...siteSections
            .filter((section) => !["hero", "catalog", "links"].includes(section.kind))
            .slice(0, 6)
            .map((section) => ({ id: `section-${section.id}`.slice(0, 48), label: section.title || "Sección", target: "section" as const, sectionId: section.id })),
        ];
    const brandScale = Math.min(200, Math.max(50, Number(siteDocument?.navigation?.brandStyle?.textScale || 100)));
    const brandFontStyle = siteDocument?.navigation?.brandStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
    const brandColor = /^#[0-9a-f]{6}$/i.test(siteDocument?.navigation?.brandStyle?.textColor || "")
      ? siteDocument!.navigation.brandStyle!.textColor!
      : siteDocument?.theme?.textColor || "#171717";
    const navigation = siteDocument?.navigation;
    const legacyLayout = navigation?.layout || "brand-left";
    const brandPosition = navigation?.brandPosition || (legacyLayout === "centered" ? "center" : "left");
    const navPosition = navigation?.navPosition || (legacyLayout === "split" ? "left" : "center");
    const option = (value: string, label: string, current: string) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
    const brandFontOptions = [["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"], ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"]]
      .map(([value, label]) => option(value, label, brandFontStyle)).join("");
    const destinationOptions = (item: { target: "home" | "catalog" | "section" | "page"; sectionId?: string; pageId?: string }) => {
      const selected = item.target === "section" ? `section:${item.sectionId || ""}` : item.target === "page" ? `page:${item.pageId || ""}` : item.target;
      return `<option value="home"${selected === "home" ? " selected" : ""}>Inicio de la tienda</option>
        <option value="catalog"${selected === "catalog" ? " selected" : ""}>Catálogo</option>
        ${sitePages.map((page) => `<option value="page:${escapeHtml(page.id)}"${selected === `page:${page.id}` ? " selected" : ""}>Página: ${escapeHtml(page.label)}</option>`).join("")}
        ${siteSections.map((section) => `<option value="section:${escapeHtml(section.id)}"${selected === `section:${section.id}` ? " selected" : ""}>${escapeHtml(section.title || "Sección")}</option>`).join("")}`;
    };
    const navigationDestinationUrl = (item: { target: "home" | "catalog" | "section" | "page"; pageId?: string }) => {
      const storefrontSlug = state.activePreviewStore?.slug ?? storefrontRouteFromLocation().slug;
      if (!storefrontSlug) return "";
      if (item.target === "home") return storeCatalogUrl(storefrontSlug);
      if (item.target === "catalog") return storeCollectionUrl(storefrontSlug, "ALL");
      if (item.target === "page") {
        const page = sitePages.find((candidate) => candidate.id === item.pageId);
        return page ? storePageUrl(storefrontSlug, page.slug) : "";
      }
      return "";
    };
    const collections = siteDocument?.merchandising.collections ?? [];
    const collectionEditorHtml = `<section class="store-preview-collections-editor" aria-labelledby="store-preview-collections-title">
      <div class="store-preview-structure-heading"><strong id="store-preview-collections-title">Menú desplegable de colecciones</strong><span>Se abre al pasar el cursor por el enlace del catálogo.</span></div>
      <p class="store-preview-footer-help">Crea colecciones y marca qué productos aparecen en cada una. El enlace “Catálogo” cambiará a “Colecciones” al crear la primera.</p>
      <div class="store-preview-collections-list">${collections.map((collection, collectionIndex) => `<details class="store-preview-collection-row"${collectionIndex === 0 ? " open" : ""}>
        <summary><strong>${escapeHtml(collection.name)}</strong><span>${collection.productIds.length} ${collection.productIds.length === 1 ? "producto" : "productos"}</span></summary>
        <div class="store-preview-collection-fields">
          <label class="store-preview-animation-field"><span>Nombre visible</span><input data-canvas-collection-name="${collectionIndex}" maxlength="60" value="${escapeHtml(collection.name)}"></label>
          <div class="store-preview-collection-products" role="group" aria-label="Productos de ${escapeHtml(collection.name)}">${(renderedStore?.items ?? []).map((product) => `<label><input type="checkbox" data-canvas-collection-product="${collectionIndex}" value="${escapeHtml(product.id)}"${collection.productIds.includes(product.id) ? " checked" : ""}><span>${escapeHtml(product.name)}</span></label>`).join("") || "<p>No hay productos disponibles todavía.</p>"}</div>
          <button type="button" class="danger" data-canvas-collection-remove="${collectionIndex}">Quitar colección</button>
        </div>
      </details>`).join("") || '<p class="store-preview-collection-empty">Todavía no hay colecciones. Crea la primera y asígnale productos.</p>'}</div>
      <button type="button" data-canvas-collection-add${collections.length >= 12 ? " disabled" : ""}>+ Crear colección</button>
    </section>`;
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-structure-popover store-preview-navigation-popover">
      <header><strong>Encabezado</strong><span>Diseño, posición y enlaces</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <section class="store-preview-header-settings" aria-labelledby="store-preview-header-layout-title">
        <div><strong id="store-preview-header-layout-title">Forma y posición</strong><span>Todos los cambios se ven aquí mismo.</span></div>
        <div class="store-preview-animation-fields">
          <label class="store-preview-animation-field"><span>Logo</span><select data-canvas-navigation-style="logoTreatment">${option("mark", "Símbolo", navigation?.logoTreatment || "wordmark")}${option("wordmark", "Nombre y logo", navigation?.logoTreatment || "wordmark")}${option("oversized", "Logo protagonista", navigation?.logoTreatment || "wordmark")}${option("seal", "Sello", navigation?.logoTreatment || "wordmark")}</select></label>
          <label class="store-preview-animation-field"><span>Logo y marca</span><select data-canvas-navigation-style="brandPosition">${option("left", "Izquierda", brandPosition)}${option("center", "Centro", brandPosition)}${option("right", "Derecha", brandPosition)}</select></label>
          <label class="store-preview-animation-field"><span>Menú</span><select data-canvas-navigation-style="navPosition">${option("left", "Izquierda", navPosition)}${option("center", "Centro", navPosition)}${option("right", "Derecha", navPosition)}</select></label>
          <label class="store-preview-animation-field"><span>Búsqueda</span><select data-canvas-navigation-style="searchPosition">${option("left", "Izquierda", navigation?.searchPosition || "right")}${option("right", "Derecha", navigation?.searchPosition || "right")}</select></label>
          <label class="store-preview-animation-field"><span>Perfil</span><select data-canvas-navigation-style="profilePosition">${option("left", "Izquierda", navigation?.profilePosition || "right")}${option("right", "Derecha", navigation?.profilePosition || "right")}</select></label>
          <label class="store-preview-animation-field"><span>Carrito</span><select data-canvas-navigation-style="cartPosition">${option("left", "Izquierda", navigation?.cartPosition || "right")}${option("right", "Derecha", navigation?.cartPosition || "right")}</select></label>
        </div>
        <div class="store-preview-header-toggles">
          <label><input type="checkbox" data-canvas-navigation-style="sticky"${navigation?.sticky !== false ? " checked" : ""}><span>Fijar al desplazarse</span></label>
          <label><input type="checkbox" data-canvas-navigation-style="transparent"${navigation?.transparent === true ? " checked" : ""}><span>Fondo translúcido</span></label>
        </div>
      </section>
      <section class="store-preview-header-settings" aria-labelledby="store-preview-navigation-brand-style-title">
        <div><strong id="store-preview-navigation-brand-style-title">Apariencia de la marca</strong><span>Fuente y color independientes del resto del sitio.</span></div>
        <div class="store-preview-animation-fields store-preview-brand-appearance">
          <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-navigation-brand-font>${brandFontOptions}</select></label>
          <label class="store-preview-animation-field"><span>Color</span><span class="store-preview-brand-color-control"><input type="color" data-canvas-navigation-brand-color value="${brandColor}" aria-label="Color del nombre de la tienda"><output data-canvas-navigation-brand-color-output>${brandColor.toUpperCase()}</output></span></label>
        </div>
        ${storePreviewPaletteHtml(paletteColors, "navigation-brand-text", brandColor, "Color del heading")}
      </section>
      <section class="store-preview-section-height-control store-preview-brand-scale" aria-labelledby="store-preview-navigation-brand-scale-title">
        <div><strong id="store-preview-navigation-brand-scale-title">Tamaño del heading superior</strong><span>Nombre de la tienda</span></div>
        <label><span class="sr-only">Tamaño del nombre de la tienda</span><input type="range" min="50" max="200" step="5" value="${brandScale}" data-canvas-navigation-heading-scale aria-valuetext="${brandScale}%"></label>
        <output data-canvas-navigation-heading-scale-output>${brandScale}%</output>
      </section>
      <div class="store-preview-structure-heading"><strong>Enlaces visibles</strong><span>Cambia el texto o el destino.</span></div>
      <div class="store-preview-structure-list">${navigationItems.map((item, index) => `<section class="store-preview-structure-row" data-canvas-navigation-row="${index}">
        <label class="store-preview-animation-field"><span>Texto del enlace ${index + 1}</span><input data-canvas-navigation-label="${index}" maxlength="40" value="${escapeHtml(item.label)}"></label>
        <label class="store-preview-animation-field"><span>Destino</span><select data-canvas-navigation-target="${index}">${destinationOptions(item)}</select></label>
        <div class="store-preview-structure-actions">${navigationDestinationUrl(item) ? `<button type="button" data-canvas-navigation-open="${escapeHtml(navigationDestinationUrl(item))}" aria-label="Abrir ${escapeHtml(item.label)} en la vista previa">Abrir</button>` : ""}<button type="button" class="danger store-preview-structure-remove" data-canvas-navigation-remove="${index}" aria-label="Quitar ${escapeHtml(item.label)}">Quitar</button></div>
      </section>`).join("")}</div>
      ${collectionEditorHtml}
      <footer><button type="button" data-canvas-navigation-add${navigationItems.length >= 8 ? " disabled" : ""}>+ Agregar enlace</button><span class="store-preview-animation-spacer"></span></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-navigation-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-navigation-label]").forEach((control) => {
      const updateDraft = () => updateStorePreviewNavigationDraft(Number(control.dataset.canvasNavigationLabel), "label", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "update", index: Number(control.dataset.canvasNavigationLabel), key: "label", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLSelectElement>("[data-canvas-navigation-target]").forEach((control) => control.addEventListener("change", () => {
      updateStorePreviewNavigationDraft(Number(control.dataset.canvasNavigationTarget), "target", control.value);
      postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "update", index: Number(control.dataset.canvasNavigationTarget), key: "target", value: control.value });
    }));
    toolbar.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-canvas-navigation-style]").forEach((control) => control.addEventListener("change", () => {
      const key = control.dataset.canvasNavigationStyle;
      const value = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value;
      postToParent("STORE_EDITOR_NAVIGATION_STYLE", { key, value });
    }));
    const headingScaleControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-heading-scale]");
    const previewHeadingScale = () => {
      if (!headingScaleControl) return;
      const value = Math.min(200, Math.max(50, Number(headingScaleControl.value) || 100));
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) {
        storeTitle.dataset.canvasTextScale = String(value);
        storeTitle.style.setProperty("--canvas-text-scale", String(value / 100));
      }
      headingScaleControl.setAttribute("aria-valuetext", `${value}%`);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-navigation-heading-scale-output]")?.replaceChildren(`${value}%`);
    };
    headingScaleControl?.addEventListener("input", previewHeadingScale);
    headingScaleControl?.addEventListener("change", () => {
      previewHeadingScale();
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "textScale",
        value: Number(headingScaleControl.value),
      });
    });
    toolbar.querySelector<HTMLSelectElement>("[data-canvas-navigation-brand-font]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) storeTitle.dataset.animationFontStyle = value;
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "fontStyle",
        value,
      });
    });
    const navigationBrandColorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-brand-color]");
    navigationBrandColorControl?.addEventListener("input", () => {
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) {
        storeTitle.dataset.canvasTextColor = navigationBrandColorControl.value;
        storeTitle.style.setProperty("--canvas-text-color", navigationBrandColorControl.value);
      }
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-navigation-brand-color-output]")?.replaceChildren(navigationBrandColorControl.value.toUpperCase());
    });
    navigationBrandColorControl?.addEventListener("change", () => {
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "textColor",
        value: navigationBrandColorControl.value,
      });
    });
    bindStorePreviewPalette(toolbar, { "navigation-brand-text": navigationBrandColorControl });
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-navigation-remove]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "remove", index: Number(button.dataset.canvasNavigationRemove) });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-navigation-open]").forEach((button) => button.addEventListener("click", () => {
      const url = button.dataset.canvasNavigationOpen;
      if (url) window.location.href = url;
    }));
    toolbar.querySelector("[data-canvas-navigation-add]")?.addEventListener("click", () => postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "add" }));
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-collection-name]").forEach((control) => control.addEventListener("change", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "rename", index: Number(control.dataset.canvasCollectionName), value: control.value });
    }));
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-collection-product]").forEach((control) => control.addEventListener("change", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "product", index: Number(control.dataset.canvasCollectionProduct), productId: control.value, selected: control.checked });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-collection-remove]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "remove", index: Number(button.dataset.canvasCollectionRemove) });
    }));
    toolbar.querySelector("[data-canvas-collection-add]")?.addEventListener("click", () => postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "add" }));
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "footer") {
    const footer = renderedStore?.siteDocument?.footer;
    if (!footer) {
      toolbar.hidden = true;
      return;
    }
    const footerField = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
      ? `<textarea data-canvas-footer-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
      : `<input data-canvas-footer-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
    const fieldMap: Record<string, { key: string; label: string; value: string; maxlength: number; multiline?: boolean }> = {
      footerBrandDescription: { key: "brandDescription", label: "Descripción de la marca", value: footer.brandDescription || "", maxlength: 320, multiline: true },
      footerCopyright: { key: "copyright", label: "Texto inferior", value: footer.copyright || "", maxlength: 160 },
      footerBadge: { key: "badge", label: "Sello", value: footer.badge || "", maxlength: 80 },
    };
    if (selection.field === "footerColumnTitle" && Number.isInteger(selection.itemIndex)) {
      fieldMap.footerColumnTitle = { key: "columnTitle", label: "Título de la columna", value: footer.columns?.[selection.itemIndex!]?.title || "", maxlength: 60 };
    }
    if (selection.field === "footerItemLabel" && selection.itemId) {
      const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
      const item = footer.columns?.[columnIndex]?.items?.[itemIndex];
      fieldMap.footerItemLabel = { key: "itemLabel", label: "Texto del enlace", value: item?.label || "", maxlength: 100 };
      fieldMap.footerItemHref = { key: "itemHref", label: "Destino del enlace", value: item?.href || "", maxlength: 500 };
    }
    const selectedFields: Array<{ key: string; label: string; value: string; maxlength: number; multiline?: boolean }> = [];
    if (selection.field === "section") {
      selectedFields.push(
        { key: "brandDescription", label: "Descripción de la marca", value: footer.brandDescription || "", maxlength: 320, multiline: true },
        { key: "copyright", label: "Texto inferior", value: footer.copyright || "", maxlength: 160 },
        { key: "badge", label: "Sello", value: footer.badge || "", maxlength: 80 },
      );
    } else {
      if (fieldMap[selection.field]) selectedFields.push(fieldMap[selection.field]);
      if (selection.field === "footerItemLabel" && fieldMap.footerItemHref) selectedFields.push(fieldMap.footerItemHref);
    }
    const footerStructure = footer.columns.map((column, columnIndex) => `<section class="store-preview-structure-group">
      <header><label class="store-preview-animation-field"><span>Columna ${columnIndex + 1}</span><input data-canvas-footer-column-title="${columnIndex}" maxlength="60" value="${escapeHtml(column.title)}"></label><button type="button" class="danger" data-canvas-footer-remove-column="${columnIndex}" aria-label="Quitar columna ${columnIndex + 1}">Quitar columna</button></header>
      <div class="store-preview-structure-items">${column.items.map((item, itemIndex) => `<div class="store-preview-structure-item">
        <label class="store-preview-animation-field"><span>Texto ${itemIndex + 1}</span><input data-canvas-footer-item-label="${columnIndex}:${itemIndex}" maxlength="100" value="${escapeHtml(item.label)}"></label>
        <label class="store-preview-animation-field"><span>Destino</span><input data-canvas-footer-item-href="${columnIndex}:${itemIndex}" maxlength="500" value="${escapeHtml(item.href)}" placeholder="#sección o https://"></label>
        <button type="button" class="danger store-preview-structure-remove" data-canvas-footer-remove-item="${columnIndex}:${itemIndex}" aria-label="Quitar ${escapeHtml(item.label)}">Quitar</button>
      </div>`).join("")}</div>
      <footer><button type="button" data-canvas-footer-add-item="${columnIndex}"${column.items.length >= 8 ? " disabled" : ""}>+ Agregar enlace</button></footer>
    </section>`).join("");
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-footer-popover store-preview-structure-popover">
      <header><strong>Pie de página</strong><span>Edita aquí mismo</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <div class="store-preview-animation-fields">${selectedFields.map((field) => footerField(field.key, field.label, field.value, field.maxlength, field.multiline)).join("")}</div>
      <p class="store-preview-footer-help">Agrega columnas y enlaces aquí. Cada destino puede ser una sección (#), una página (https://), un correo (mailto:) o un teléfono (tel:).</p>
      <div class="store-preview-structure-list">${footerStructure}</div>
      <footer><button type="button" data-canvas-footer-add-column${footer.columns.length >= 4 ? " disabled" : ""}>+ Agregar columna</button><span class="store-preview-animation-spacer"></span><button type="button" class="danger" data-canvas-hide-footer>Quitar pie de página</button></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-canvas-footer-field]").forEach((control) => {
      const key = control.dataset.canvasFooterField as "brandDescription" | "copyright" | "badge" | "columnTitle" | "itemLabel" | "itemHref";
      const updateDraft = () => updateStorePreviewFooterDraft(selection, key, control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection, key, value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-column-title]").forEach((control) => {
      const itemIndex = Number(control.dataset.canvasFooterColumnTitle);
      const fieldSelection = { section: "footer", field: "footerColumnTitle", label: `Columna ${itemIndex + 1}`, itemIndex } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "columnTitle", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "columnTitle", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-item-label]").forEach((control) => {
      const itemId = control.dataset.canvasFooterItemLabel;
      const fieldSelection = { section: "footer", field: "footerItemLabel", label: "Enlace del pie", itemId } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "itemLabel", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "itemLabel", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-item-href]").forEach((control) => {
      const itemId = control.dataset.canvasFooterItemHref;
      const fieldSelection = { section: "footer", field: "footerItemLabel", label: "Enlace del pie", itemId } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "itemHref", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "itemHref", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-add-item]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-item", columnIndex: Number(button.dataset.canvasFooterAddItem) });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-remove-item]").forEach((button) => button.addEventListener("click", () => {
      const [columnIndex, itemIndex] = String(button.dataset.canvasFooterRemoveItem).split(":").map(Number);
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "remove-item", columnIndex, itemIndex });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-remove-column]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "remove-column", columnIndex: Number(button.dataset.canvasFooterRemoveColumn) });
    }));
    toolbar.querySelector("[data-canvas-footer-add-column]")?.addEventListener("click", () => postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-column" }));
    toolbar.querySelector("[data-canvas-hide-footer]")?.addEventListener("click", () => postToParent("STORE_EDITOR_FOOTER_FIELD", { selection, key: "enabled", value: false }));
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  const siteId = selection.section.startsWith("site-") ? selection.section.slice("site-".length) : "";
  const section = selection.animationId
    ? target.closest<HTMLElement>(".store-motion-section[data-animation-id]")
      ?? Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]")).find((candidate) => candidate.dataset.animationId === selection.animationId)
      ?? null
    : siteId
      ? target.closest<HTMLElement>(".bespoke-zone[data-site-section]")
        ?? Array.from(app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]")).find((candidate) => candidate.dataset.siteSection === siteId)
        ?? null
      : null;
  if (!section) {
    toolbar.hidden = true;
    return;
  }
  const textFields = new Set(["animationTitle", "animationSubtitle", "animationStyle", "title", "caption", "body", "textBlock", "siteTitle", "siteBody", "siteItemTitle", "siteItemBody", "siteBlockText"]);
  const isText = textFields.has(selection.field);
  const animation = renderedStore?.animations?.find((candidate) => candidate.id === selection.animationId);
  const siteSection = siteId ? renderedStore?.siteDocument?.sections?.find((candidate) => candidate.id === siteId) : undefined;
  const siteSectionLocked = Boolean(siteId && state.storePreviewLockedSectionIds.has(siteId));
  const siteHasAnimation = Boolean(siteSection && siteSection.motion !== "none");
  if (!animation && !siteSection) {
    toolbar.hidden = true;
    return;
  }
  const siteItem = siteSection && Number.isInteger(selection.itemIndex) ? siteSection.items?.[selection.itemIndex!] : undefined;
  const sectionViewport = activeSiteSectionViewport();
  const viewportHeight = siteSection
    ? sectionViewport === "mobile" ? siteSection.mobileHeightPx : siteSection.heightPx
    : undefined;
  const renderedHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(section.getBoundingClientRect().height || SITE_SECTION_MIN_HEIGHT)));
  const selectedSectionHeight = Number.isInteger(viewportHeight)
    ? viewportHeight!
    : sectionViewport === "mobile" && Number.isInteger(siteSection?.heightPx)
      ? siteSection!.heightPx!
      : renderedHeight;
  const siteSectionHeightControl = siteSection ? `<section class="store-preview-section-height-control" aria-labelledby="store-preview-section-height-title">
      <div><strong id="store-preview-section-height-title">Alto de la sección</strong><span>${sectionViewport === "mobile" ? "Móvil · imágenes y controles protegidos" : "Escritorio · el texto no cambia este límite"}</span></div>
      <label><span class="sr-only">Alto de la sección en píxeles</span><input type="range" min="${SITE_SECTION_MIN_HEIGHT}" max="${SITE_SECTION_MAX_HEIGHT}" step="10" value="${selectedSectionHeight}" data-canvas-section-height></label>
      <output data-canvas-section-height-output>${Number.isInteger(viewportHeight) ? `${selectedSectionHeight} px` : `Auto · ${selectedSectionHeight} px`}</output>
      <button type="button" data-canvas-section-height-reset${Number.isInteger(viewportHeight) ? "" : " disabled"}>Automático</button>
    </section>` : "";
  const findSiteBlock = (blocks: NonNullable<typeof siteSection>["blocks"] = []): NonNullable<NonNullable<typeof siteSection>["blocks"]>[number] | undefined => {
    for (const block of blocks ?? []) {
      if (block.id === selection.itemId) return block;
      const nested = findSiteBlock(block.children);
      if (nested) return nested;
    }
    return undefined;
  };
  const selectedSiteBlock = siteSection && selection.itemId ? findSiteBlock(siteSection.blocks) : undefined;
  const siteStyle = siteSection
    ? selectedSiteBlock?.style || (["siteBody", "siteItemBody"].includes(selection.field)
      ? (siteItem?.bodyStyle || siteSection.bodyStyle)
      : (siteItem?.titleStyle || siteSection.titleStyle))
    : undefined;
  const freeSiteBlock = Boolean(selectedSiteBlock && !["heading", "body", "action"].includes(selectedSiteBlock.id));
  const copy = animation ? target.closest<HTMLElement>("[data-animation-copy]") ?? section : target;
  const scale = Math.min(200, Math.max(50, Number(copy.dataset.animationTextScale || copy.dataset.canvasTextScale || section.dataset.animationTextScale || siteStyle?.textScale || 100)));
  const textWidth = Math.min(100, Math.max(20, Number(copy.dataset.canvasTextWidth || siteStyle?.textWidthPercent || 62)));
  const align = copy.dataset.animationTextAlign || copy.dataset.canvasTextAlign || section.dataset.animationTextAlign || siteStyle?.textAlign || siteSection?.align || "left";
  const fontStyle = copy.dataset.animationFontStyle || section.dataset.animationFontStyle || siteStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
  const color = copy.dataset.animationTextColor || copy.dataset.canvasTextColor || section.dataset.animationTextColor || siteStyle?.textColor || siteSection?.textColor || "#171717";
  const background = section.dataset.animationBackground || "#ffffff";
  const textContrastBackground = siteSection?.backgroundColor || background;
  const hasLowTextContrast = Boolean(siteSection && colorContrastRatio(color, textContrastBackground) < 3);
  const fontOptions = [
    ["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"], ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"],
  ].map(([value, label]) => `<option value="${value}"${fontStyle === value ? " selected" : ""}>${label}</option>`).join("");
  const alignButton = (value: string, label: string, path: string) => `<button type="button" data-canvas-align="${value}" aria-label="${label}" aria-pressed="${align === value}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg></button>`;
  const styleControls = `<div class="store-preview-animation-style" aria-label="Estilo del texto">
      <label class="store-preview-toolbar-font"><span class="sr-only">Tipografía</span><select data-canvas-font aria-label="Tipografía del texto">${fontOptions}</select></label>
      <span class="store-preview-toolbar-size"><button type="button" data-canvas-size-step="-10" aria-label="Reducir texto">−</button><output data-canvas-size>${scale}%</output><button type="button" data-canvas-size-step="10" aria-label="Aumentar texto">+</button></span>
      ${isText && freeSiteBlock ? `<span class="store-preview-toolbar-size" title="Ancho del cuadro de texto"><button type="button" data-canvas-width-step="-5" aria-label="Estrechar cuadro de texto">−</button><output data-canvas-width>${textWidth}% ancho</output><button type="button" data-canvas-width-step="5" aria-label="Ensanchar cuadro de texto">+</button></span>` : ""}
      <label class="store-preview-toolbar-color" title="Color del texto"><span class="sr-only">Color del texto</span><input type="color" data-canvas-color value="${color}" aria-label="Color del texto"></label>
      ${siteSection ? `<span class="store-preview-contrast-warning" data-canvas-contrast-warning role="status" ${hasLowTextContrast ? "" : "hidden"}>Contraste bajo</span>` : ""}
      <span class="store-preview-toolbar-align" aria-label="Alineación">${alignButton("left", "Alinear a la izquierda", "M3 4h14M3 8h10M3 12h14M3 16h8")}${alignButton("center", "Centrar", "M3 4h14M5 8h10M3 12h14M6 16h8")}${alignButton("right", "Alinear a la derecha", "M3 4h14M7 8h10M3 12h14M9 16h8")}</span>
      ${storePreviewPaletteHtml(paletteColors, "text", color, "Paleta")}
    </div>`;
  const selectedMedia = animation && Number.isInteger(selection.itemIndex) ? animation.media[selection.itemIndex!] : undefined;
  const fieldInput = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
    ? `<textarea data-canvas-animation-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
    : `<input data-canvas-animation-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
  const siteFieldInput = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
    ? `<textarea data-canvas-site-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
    : `<input data-canvas-site-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
  const productOptions = [`<option value="">Sin producto</option>`, ...(renderedStore?.items ?? []).map((item) => `<option value="${escapeHtml(item.id)}"${animation?.productId === item.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`)].join("");
  const animationMediaRequirement = animation ? storeAnimationMediaRequirement(animation.type) : { min: 0, max: 0 };
  const missingAnimationMedia = animation ? Math.max(0, animationMediaRequirement.min - animation.media.length) : 0;
  const mediaActions = animation && animationMediaRequirement.max > 0
    ? `<div class="store-preview-animation-media" aria-label="Medios de la animación">${animation.media.map((media, index) => `<button type="button" data-canvas-media="${index}"${selection.itemIndex === index ? ` aria-pressed="true"` : ""} aria-label="Cambiar medio ${index + 1}"><span>${isVideoMediaUrl(media.imageUrl) ? "MP4" : "IMG"}</span>${index + 1}</button>`).join("")}${Array.from({ length: missingAnimationMedia }, (_, missingIndex) => {
        const index = animation.media.length + missingIndex;
        return `<button type="button" class="is-empty" data-canvas-add-media="${index}" aria-label="Agregar medio ${index + 1}"><span>+</span>${index + 1}</button>`;
      }).join("")}</div>`
    : "";
  const siteMediaActions = siteSection?.mediaUrls?.length
    ? `<div class="store-preview-animation-media" aria-label="Medios de la sección">${siteSection.mediaUrls.map((mediaUrl, index) => `<button type="button" data-canvas-site-media="${index}"${selection.itemIndex === index ? ` aria-pressed="true"` : ""} aria-label="Cambiar medio ${index + 1}"><span>${isVideoMediaUrl(mediaUrl) ? "MP4" : "IMG"}</span>${index + 1}</button>`).join("")}</div>`
    : "";
  const catalogProducts = renderedStore?.items ?? [];
  const recoverGeneratedPrimaryCatalog = Boolean(
    siteSection?.kind === "catalog"
    && !siteSection.pageId
    && Array.isArray(siteSection.productIds)
    && siteSection.productIds.length === 0
    && renderedStore?.siteDocument?.merchandising.productOrderIds.length,
  );
  const selectedCatalogIds = siteSection?.kind === "catalog"
    ? (Array.isArray(siteSection.productIds) && !recoverGeneratedPrimaryCatalog ? siteSection.productIds : catalogProducts.map((product) => product.id))
      .filter((productId) => catalogProducts.some((product) => product.id === productId))
    : [];
  const selectedCatalogIdSet = new Set(selectedCatalogIds);
  const selectedCatalogProducts = selectedCatalogIds
    .map((productId) => catalogProducts.find((product) => product.id === productId))
    .filter((product): product is StoreItem => Boolean(product));
  const catalogProductOption = (product: StoreItem) => {
    const imageUrl = assetUrl(product.imageUrls.find(Boolean) || null);
    const searchText = [product.name, ...product.tags].join(" ").toLocaleLowerCase("es");
    return `<label class="store-preview-catalog-product" data-canvas-catalog-option data-product-search="${escapeHtml(searchText)}">
      <input type="checkbox" data-canvas-catalog-product value="${escapeHtml(product.id)}"${selectedCatalogIdSet.has(product.id) ? " checked" : ""}>
      <span class="store-preview-catalog-product-media">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : `<span aria-hidden="true">${escapeHtml(product.name.slice(0, 1).toUpperCase())}</span>`}</span>
      <span class="store-preview-catalog-product-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(formatAmount(product.amount, product.currency))}</small></span>
    </label>`;
  };
  const catalogProductsControl = siteSection?.kind === "catalog" && !siteItem
    ? `<section class="store-preview-catalog-editor" aria-labelledby="store-preview-catalog-title">
        <div class="store-preview-structure-heading"><strong id="store-preview-catalog-title">Productos de esta sección</strong><span>${selectedCatalogProducts.length} seleccionados</span></div>
        <p class="store-preview-footer-help">Selecciona aquí los productos que verá el cliente. El orden se guarda junto con la tienda.</p>
        ${catalogProducts.length ? `<label class="store-preview-animation-field"><span>Buscar en tu catálogo</span><input type="search" data-canvas-catalog-search placeholder="Nombre o etiqueta" autocomplete="off"></label>
          ${selectedCatalogProducts.length ? `<div class="store-preview-catalog-order" aria-label="Orden de productos seleccionados">${selectedCatalogProducts.map((product, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(product.name)}</strong><button type="button" data-canvas-catalog-move="${escapeHtml(product.id)}" data-direction="-1" aria-label="Mover ${escapeHtml(product.name)} antes"${index === 0 ? " disabled" : ""}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button><button type="button" data-canvas-catalog-move="${escapeHtml(product.id)}" data-direction="1" aria-label="Mover ${escapeHtml(product.name)} después"${index === selectedCatalogProducts.length - 1 ? " disabled" : ""}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>`).join("")}</div>` : ""}
          <div class="store-preview-catalog-products" role="group" aria-label="Elegir productos">${catalogProducts.map(catalogProductOption).join("")}</div>
          <p class="store-preview-catalog-empty" data-canvas-catalog-empty hidden>No encontramos productos con ese nombre.</p>`
        : '<p class="store-preview-collection-empty">Todavía no hay productos activos. Créalo en Productos y volverá a aparecer aquí.</p>'}
      </section>`
    : "";
  const compatibleSiteMotions: Record<string, string[]> = {
    hero: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    story: ["none", "reveal", "clip", "drift", "parallax", "story-scroll"],
    gallery: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    catalog: ["none", "reveal", "drift", "scale"],
    contact: ["none", "reveal", "drift"],
    location: ["none", "reveal", "clip", "parallax"],
    links: ["none", "reveal", "drift"],
  };
  const compatibleSiteLayouts: Record<string, string[]> = {
    hero: ["split", "full-bleed", "centered", "offset"],
    story: ["split", "offset", "stacked", "rail"],
    gallery: ["grid", "offset", "stacked", "rail"],
    catalog: ["grid", "stacked", "minimal"],
    contact: ["split", "stacked", "minimal"], location: ["split", "stacked", "minimal"], links: ["centered", "minimal"],
  };
  const siteMotionOptions = [["none", "Sin movimiento"], ["reveal", "Revelar"], ["clip", "Recorte"], ["drift", "Desplazar"], ["scale", "Escalar"], ["parallax", "Parallax"], ["story-scroll", "Historia al scroll"]]
    .filter(([value]) => compatibleSiteMotions[siteSection?.kind || ""]?.includes(value) || siteSection?.motion === value)
    .map(([value, label]) => `<option value="${value}"${siteSection?.motion === value ? " selected" : ""}>${label}</option>`).join("");
  const siteLayoutOptions = [["split", "Dividida"], ["full-bleed", "Pantalla completa"], ["centered", "Centrada"], ["offset", "Desplazada"], ["grid", "Cuadrícula"], ["stacked", "Apilada"], ["rail", "Carril"], ["minimal", "Mínima"]]
    .filter(([value]) => compatibleSiteLayouts[siteSection?.kind || ""]?.includes(value) || siteSection?.layout === value)
    .map(([value, label]) => `<option value="${value}"${siteSection?.layout === value ? " selected" : ""}>${label}</option>`).join("");
  const textSectionMoveControl = freeSiteBlock && siteSection && (renderedStore?.siteDocument?.sections?.length ?? 0) > 1
    ? `<label class="store-preview-toolbar-font" title="Mover este texto a otra sección"><span class="sr-only">Mover texto a sección</span><select data-canvas-move-text-section aria-label="Mover texto a otra sección"><option value="">Mover a…</option>${renderedStore!.siteDocument!.sections.filter((candidate) => candidate.id !== siteSection.id).map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.title || candidate.kind)}</option>`).join("")}</select></label>`
    : "";
  toolbar.innerHTML = isText
    ? `${styleControls}
      <span class="store-preview-toolbar-divider" aria-hidden="true"></span>
      ${animation ? `<button type="button" data-canvas-animation-settings aria-label="Abrir opciones de esta animación" title="Opciones de la animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h7M14 15h3"/><circle cx="13" cy="5" r="2"/><circle cx="7" cy="10" r="2"/><circle cx="12" cy="15" r="2"/></svg><span>Animación</span></button>
        <button type="button" data-canvas-copy aria-label="Copiar texto" title="Copiar · Ctrl/Cmd+C"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1"/><path d="M4 13V4h9"/></svg></button>
        <button type="button" data-canvas-paste aria-label="Pegar texto" title="Pegar · Ctrl/Cmd+V"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        <button type="button" data-canvas-duplicate aria-label="Duplicar texto" title="Duplicar · Ctrl/Cmd+D"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        ${selection.field === "textBlock" ? `<button type="button" class="danger" data-canvas-delete-text aria-label="Eliminar este texto" title="Eliminar texto"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Eliminar texto</span></button>` : ""}` : `<button type="button" data-canvas-site-settings aria-label="Abrir opciones de esta sección animada" title="Opciones de la sección"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h7M14 15h3"/><circle cx="13" cy="5" r="2"/><circle cx="7" cy="10" r="2"/><circle cx="12" cy="15" r="2"/></svg><span>Sección</span></button>
        <button type="button" data-canvas-copy aria-label="Copiar texto" title="Copiar · Ctrl/Cmd+C"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1"/><path d="M4 13V4h9"/></svg></button>
        <button type="button" data-canvas-paste aria-label="Pegar texto" title="Pegar · Ctrl/Cmd+V"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        <button type="button" data-canvas-duplicate aria-label="Duplicar texto" title="Duplicar · Ctrl/Cmd+D"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button><button type="button" class="danger" data-canvas-delete-text aria-label="Eliminar este texto" title="Eliminar texto"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Eliminar texto</span></button>${textSectionMoveControl}`}`
    : animation ? `<div class="store-preview-animation-popover">
        <header><strong>${escapeHtml(animation.name || STORE_MOTION_EXPERIENCE_LABELS[animation.type])}</strong><span>${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[animation.type])}${selectedMedia ? ` · escena ${selection.itemIndex! + 1}` : ""}</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        ${styleControls}
        ${missingAnimationMedia ? `<div class="store-preview-animation-incomplete" role="status"><strong>Completa esta animación</strong><span>Agrega ${missingAnimationMedia} ${missingAnimationMedia === 1 ? "archivo" : "archivos"} para verla terminada. Acepta imágenes, GIF, MP4 y WebM.</span></div>` : ""}
        <div class="store-preview-animation-fields">${selectedMedia
          ? `${fieldInput("title", "Título de escena", selectedMedia.title || "", 100)}${fieldInput("caption", "Subtítulo", selectedMedia.caption || "", 180)}${fieldInput("body", "Texto", selectedMedia.body || "", 360, true)}`
          : `${fieldInput("title", "Título", animation.title || "", 100)}${fieldInput("subtitle", "Subtítulo", animation.subtitle || "", 220)}`}</div>
        ${mediaActions}
        ${!selectedMedia ? `<div class="store-preview-animation-fields is-secondary"><label class="store-preview-animation-field"><span>Producto</span><select data-canvas-animation-field="productId">${productOptions}</select></label>${fieldInput("buttonLabel", "Texto del botón", animation.buttonLabel || "", 36)}</div>` : ""}
        ${storePreviewPaletteHtml(paletteColors, "animation-background", background, "Fondo")}
        <footer>
          <button type="button" data-canvas-add-text="title">+ Título</button><button type="button" data-canvas-add-text="subtitle">+ Subtítulo</button>
          <label class="store-preview-toolbar-color" title="Fondo de la sección"><span class="sr-only">Fondo de la sección</span><input type="color" data-canvas-background value="${background}" aria-label="Fondo de la sección"></label>
          <span class="store-preview-animation-spacer"></span>
          <button type="button" data-canvas-move="-1" aria-label="Mover sección arriba" title="Mover arriba"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button>
          <button type="button" data-canvas-move="1" aria-label="Mover sección abajo" title="Mover abajo"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
          <button type="button" class="danger" data-canvas-delete-animation aria-label="Eliminar esta animación" title="Eliminar animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg></button>
        </footer>
      </div>` : `<div class="store-preview-animation-popover">
        <header><strong>${escapeHtml(siteSection?.title || "Sección")}</strong><span>${escapeHtml(siteHasAnimation ? (siteSection?.kind === "hero" ? "Portada animada" : siteSection?.kind === "story" ? "Historia animada" : "Sección animada") : (siteSection?.kind === "hero" ? "Portada" : siteSection?.kind === "story" ? "Historia" : "Sección"))}${siteItem ? ` · escena ${selection.itemIndex! + 1}` : ""}</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        ${styleControls}
        ${siteSectionHeightControl}
        <div class="store-preview-animation-fields">${selectedSiteBlock
          ? `${siteFieldInput("text", selectedSiteBlock.kind === "heading" ? "Título" : selectedSiteBlock.kind === "action" ? "Botón" : "Texto", selectedSiteBlock.text || "", selectedSiteBlock.kind === "action" ? 40 : selectedSiteBlock.kind === "heading" ? 120 : 600, selectedSiteBlock.kind === "text")}`
          : siteItem
          ? `${siteFieldInput("title", "Título de escena", siteItem.title || "", 100)}${siteFieldInput("body", "Texto de escena", siteItem.body || "", 320, true)}`
          : `${siteFieldInput("title", "Título", siteSection?.title || "", 120)}${siteFieldInput("body", "Texto", siteSection?.body || "", 600, true)}`}</div>
        ${siteMediaActions}
        ${catalogProductsControl}
        ${!siteItem ? `<div class="store-preview-animation-fields is-secondary"><label class="store-preview-animation-field"><span>Movimiento</span><select data-canvas-site-field="motion">${siteMotionOptions}</select></label><label class="store-preview-animation-field"><span>Composición</span><select data-canvas-site-field="layout">${siteLayoutOptions}</select></label></div>` : ""}
        ${storePreviewPaletteHtml(paletteColors, "site-background", siteSection?.backgroundColor || "#ffffff", "Fondo")}
        <footer><button type="button" data-canvas-add-text="title">+ Título</button><button type="button" data-canvas-add-text="subtitle">+ Texto</button><label class="store-preview-toolbar-color" title="Fondo de la sección"><span class="sr-only">Fondo de la sección</span><input type="color" data-canvas-site-background value="${siteSection?.backgroundColor || "#ffffff"}" aria-label="Fondo de la sección"></label><button type="button" data-canvas-section-lock aria-pressed="${siteSectionLocked}" title="${siteSectionLocked ? "Permitir que la IA cambie esta sección" : "Conservar esta sección al regenerar"}">${siteSectionLocked ? "Se conserva" : "Conservar"}</button><span class="store-preview-animation-spacer"></span><button type="button" data-canvas-move="-1" aria-label="Mover sección arriba" title="Mover arriba"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button><button type="button" data-canvas-move="1" aria-label="Mover sección abajo" title="Mover abajo"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>${siteHasAnimation ? `<button type="button" class="danger" data-canvas-delete-site-animation aria-label="Eliminar la animación de esta sección" title="Eliminar animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg></button>` : ""}${siteSection && !["hero", "catalog", "contact"].includes(siteSection.kind) ? `<button type="button" class="danger" data-canvas-delete-section aria-label="Eliminar la sección completa" title="Eliminar sección"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Sección</span></button>` : ""}</footer>
      </div>`;
  toolbar.classList.toggle("is-animation-popover", !isText);
  toolbar.hidden = false;
  positionStorePreviewCanvasToolbar(toolbar, target);
  const styleSelection = isText
    ? selection
    : animation
      ? { ...selection, field: selectedMedia ? "title" : "animationStyle" }
      : { ...selection, field: siteItem ? "siteItemTitle" : "siteTitle" };
  const sendStyle = (key: string, value: unknown) => postToParent("STORE_EDITOR_TEXT_STYLE", { selection: styleSelection, key, value });
  toolbar.querySelector<HTMLSelectElement>("[data-canvas-font]")?.addEventListener("change", (event) => sendStyle("fontStyle", (event.currentTarget as HTMLSelectElement).value));
  const colorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-color]");
  colorControl?.addEventListener("input", () => {
    if (animation) {
      const stylesExactCopy = isText || !!selectedMedia;
      const styleTarget = stylesExactCopy ? copy : section;
      styleTarget.dataset.animationTextColor = colorControl.value;
      styleTarget.style.setProperty(stylesExactCopy ? "--animation-scene-text-color" : "--animation-text-color", colorControl.value);
    } else {
      copy.dataset.canvasTextColor = colorControl.value;
      copy.style.setProperty("--canvas-text-color", colorControl.value);
      const warning = toolbar.querySelector<HTMLElement>("[data-canvas-contrast-warning]");
      if (warning) warning.hidden = colorContrastRatio(colorControl.value, textContrastBackground) >= 3;
    }
  });
  colorControl?.addEventListener("change", () => sendStyle("textColor", colorControl.value));
  const backgroundControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-background]");
  backgroundControl?.addEventListener("input", () => section.style.setProperty("--animation-background", backgroundControl.value));
  backgroundControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SECTION_STYLE", { selection, key: "backgroundColor", value: backgroundControl.value }));
  const siteBackgroundControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-site-background]");
  siteBackgroundControl?.addEventListener("input", () => section.style.setProperty("--zone-bg", siteBackgroundControl.value));
  siteBackgroundControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SITE_FIELD", { selection, key: "backgroundColor", value: siteBackgroundControl.value }));
  const sectionHeightControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-section-height]");
  const sectionHeightOutput = toolbar.querySelector<HTMLOutputElement>("[data-canvas-section-height-output]");
  const sectionHeightReset = toolbar.querySelector<HTMLButtonElement>("[data-canvas-section-height-reset]");
  sectionHeightControl?.addEventListener("input", () => {
    const heightPx = Number(sectionHeightControl.value);
    applySiteSectionPreviewHeight(section, heightPx, sectionViewport);
    if (sectionHeightOutput) sectionHeightOutput.value = `${heightPx} px`;
    if (sectionHeightReset) sectionHeightReset.disabled = false;
  });
  sectionHeightControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SECTION_HEIGHT", {
    selection,
    viewport: sectionViewport,
    heightPx: Number(sectionHeightControl.value),
  }));
  sectionHeightReset?.addEventListener("click", () => {
    applySiteSectionPreviewHeight(section, null, sectionViewport);
    sectionHeightReset.disabled = true;
    postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: null });
  });
  bindStorePreviewPalette(toolbar, {
    text: colorControl,
    "animation-background": backgroundControl,
    "site-background": siteBackgroundControl,
  });
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-align]").forEach((button) => button.addEventListener("click", () => sendStyle("textAlign", button.dataset.canvasAlign)));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-size-step]").forEach((button) => button.addEventListener("click", () => sendStyle("textScale", Math.min(200, Math.max(50, scale + Number(button.dataset.canvasSizeStep))))));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-width-step]").forEach((button) => button.addEventListener("click", () => sendStyle("textWidthPercent", Math.min(100, Math.max(20, textWidth + Number(button.dataset.canvasWidthStep))))));
  toolbar.querySelector<HTMLSelectElement>("[data-canvas-move-text-section]")?.addEventListener("change", (event) => {
    const targetSectionId = (event.currentTarget as HTMLSelectElement).value;
    if (targetSectionId) postToParent("STORE_EDITOR_MOVE_TEXT_SECTION", { selection, targetSectionId });
  });
  toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-canvas-animation-field]").forEach((control) => {
    control.addEventListener("change", () => postToParent("STORE_EDITOR_ANIMATION_FIELD", {
      selection,
      key: control.dataset.canvasAnimationField,
      value: control.value,
    }));
  });
  toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-canvas-site-field]").forEach((control) => {
    control.addEventListener("change", () => postToParent("STORE_EDITOR_SITE_FIELD", {
      selection,
      key: control.dataset.canvasSiteField,
      value: control.value,
    }));
  });
  toolbar.querySelector<HTMLInputElement>("[data-canvas-catalog-search]")?.addEventListener("input", (event) => {
    const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("es");
    let visible = 0;
    toolbar.querySelectorAll<HTMLElement>("[data-canvas-catalog-option]").forEach((option) => {
      const matches = !query || (option.dataset.productSearch || "").includes(query);
      option.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = toolbar.querySelector<HTMLElement>("[data-canvas-catalog-empty]");
    if (empty) empty.hidden = visible > 0;
  });
  toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-catalog-product]").forEach((control) => control.addEventListener("change", () => {
    postToParent("STORE_EDITOR_SITE_PRODUCTS", { selection, action: "toggle", productId: control.value, selected: control.checked });
  }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-catalog-move]").forEach((button) => button.addEventListener("click", () => {
    postToParent("STORE_EDITOR_SITE_PRODUCTS", { selection, action: "move", productId: button.dataset.canvasCatalogMove, direction: Number(button.dataset.direction) });
  }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "media",
    label: `medio ${Number(button.dataset.canvasMedia) + 1} de la animación`,
    animationId: selection.animationId,
    itemIndex: Number(button.dataset.canvasMedia),
  })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-add-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "mediaAdd",
    label: `medio ${Number(button.dataset.canvasAddMedia) + 1} de la animación`,
    animationId: selection.animationId,
    itemIndex: Number(button.dataset.canvasAddMedia),
  })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-site-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "siteMedia",
    label: `medio ${Number(button.dataset.canvasSiteMedia) + 1} de la sección`,
    itemIndex: Number(button.dataset.canvasSiteMedia),
  })));
  toolbar.querySelector("[data-canvas-animation-settings]")?.addEventListener("click", () => renderStorePreviewCanvasToolbar(section, {
    section: selection.section,
    field: "section",
    label: animation?.name || "sección animada",
    animationId: selection.animationId,
  }));
  toolbar.querySelector("[data-canvas-site-settings]")?.addEventListener("click", () => renderStorePreviewCanvasToolbar(section, {
    section: selection.section,
    field: "section",
    label: siteSection?.title || "sección animada",
  }));
  toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
    // Reset the popover variant before emptying it. Otherwise the later
    // `.is-animation-popover { display: block }` rule can override `[hidden]`
    // and leave an empty white toolbar behind after the close button is used.
    toolbar.className = "store-preview-canvas-toolbar";
    toolbar.hidden = true;
    toolbar.replaceChildren();
  });
  toolbar.querySelector("[data-canvas-copy]")?.addEventListener("click", () => postToParent("STORE_EDITOR_COPY_TEXT", { selection, value: target?.textContent || "" }));
  toolbar.querySelector("[data-canvas-paste]")?.addEventListener("click", () => postToParent("STORE_EDITOR_PASTE_TEXT", { selection }));
  toolbar.querySelector("[data-canvas-duplicate]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DUPLICATE_TEXT", { selection }));
  toolbar.querySelector("[data-canvas-delete-text]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_TEXT", { selection }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-add-text]").forEach((button) => button.addEventListener("click", () => postToParent("STORE_EDITOR_ADD_TEXT", { selection, role: button.dataset.canvasAddText })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-move]").forEach((button) => button.addEventListener("click", () => postToParent("STORE_EDITOR_MOVE_SECTION", { selection, direction: Number(button.dataset.canvasMove) })));
  toolbar.querySelector<HTMLButtonElement>("[data-canvas-section-lock]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const locked = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(locked));
    button.textContent = locked ? "Se conserva" : "Conservar";
    postToParent("STORE_EDITOR_SECTION_LOCK", { selection, locked });
  });
  toolbar.querySelector("[data-canvas-delete-animation]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_ANIMATION", { animationId: selection.animationId }));
  toolbar.querySelector("[data-canvas-delete-site-animation]")?.addEventListener("click", () => postToParent("STORE_EDITOR_SITE_FIELD", { selection, key: "motion", value: "none" }));
  toolbar.querySelector("[data-canvas-delete-section]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_SECTION", { selection }));
}
