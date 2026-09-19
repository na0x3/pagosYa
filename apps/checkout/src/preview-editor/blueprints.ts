/** The editor's "add a section" blueprints and their builder dialog. */
import { Store, assetUrl } from "../api";
import { postToParent } from "../postmessage";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { app } from "../ui/app";


export const PREVIEW_BLUEPRINT_ICONS = {
  category: `<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M12 24h37l9 10h50v44H12z"/><path d="M20 43h78M28 55h28M28 65h44"/><circle cx="91" cy="18" r="10"/><path d="M91 13v10M86 18h10"/></svg>`,
  product: `<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="19" y="12" width="82" height="66" rx="2"/><path d="M30 23h60v31H30zM30 64h30M76 64h14"/><circle cx="60" cy="38" r="8"/><path d="M60 33v10M55 38h10"/></svg>`,
  recommendation: `<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="13" y="20" width="40" height="52" rx="2"/><rect x="67" y="20" width="40" height="52" rx="2"/><path d="M23 31h20v18H23zM77 31h20v18H77zM23 58h18M77 58h18"/><circle cx="60" cy="46" r="9"/><path d="M60 41v10M55 46h10"/></svg>`,
} as const;

export function previewBlueprintButton(kind: keyof typeof PREVIEW_BLUEPRINT_ICONS, options: { label: string; copy: string; categoryId?: string; productId?: string; compact?: boolean }): string {
  return `<button type="button" class="preview-blueprint${options.compact ? " is-compact" : ""}" data-preview-blueprint="${kind}"${options.categoryId ? ` data-category-id="${escapeHtml(options.categoryId)}"` : ""}${options.productId ? ` data-product-id="${escapeHtml(options.productId)}"` : ""}>
    <span class="preview-blueprint-grid" aria-hidden="true"></span>
    <span class="preview-blueprint-drawing">${PREVIEW_BLUEPRINT_ICONS[kind]}</span>
    <span class="preview-blueprint-copy"><strong>${escapeHtml(options.label)}</strong><small>${escapeHtml(options.copy)}</small></span>
  </button>`;
}

export function previewBuilderImageField(id: string, label: string): string {
  return `<label class="preview-builder-image" for="${id}"><span class="preview-builder-image-canvas"><span>${PREVIEW_BLUEPRINT_ICONS.product}</span></span><strong>${escapeHtml(label)}</strong><small>PNG, JPEG o WEBP · máximo 8 MB</small><input id="${id}" name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>`;
}

export function openPreviewBuilderDialog(kind: "category" | "product" | "recommendation", store: Store, options: { categoryId?: string; productId?: string } = {}): void {
  document.querySelector(".preview-builder-dialog")?.remove();
  const requestId = `preview-builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = document.createElement("dialog");
  dialog.className = "preview-builder-dialog";
  dialog.dataset.requestId = requestId;
  const category = options.categoryId ? store.categories.find((entry) => entry.id === options.categoryId) : null;
  const product = options.productId ? store.items.find((entry) => entry.id === options.productId) : null;
  const recommendationIds = new Set(product?.recommendedProductIds ?? []);
  const candidates = product ? store.items.filter((entry) => entry.id !== product.id) : [];
  const title = kind === "category" ? "Crear una categoría" : kind === "product" ? `Agregar producto${category ? ` a ${category.name}` : ""}` : `Recomendados para ${product?.name || "este producto"}`;
  const body = kind === "category"
    ? `<div class="preview-builder-fields"><label for="preview-builder-name">Nombre de la categoría<input id="preview-builder-name" name="name" maxlength="60" placeholder="Ej. Panes artesanales" required></label>${previewBuilderImageField("preview-builder-image", "Foto de la categoría")}</div>`
    : kind === "product"
      ? `<div class="preview-builder-fields"><label for="preview-builder-name">Nombre del producto<input id="preview-builder-name" name="name" maxlength="120" placeholder="Ej. Pan brioche" required></label><label for="preview-builder-price">Precio en bolivianos<input id="preview-builder-price" name="price" type="number" min="0" step="0.01" placeholder="Ej. 28,00" required></label><label class="preview-builder-full" for="preview-builder-description">Descripción breve (opcional)<textarea id="preview-builder-description" name="description" maxlength="500" rows="2" placeholder="Qué hace especial a este producto"></textarea></label>${previewBuilderImageField("preview-builder-image", "Foto del producto")}</div>`
      : `<fieldset class="preview-builder-recommendations"><legend>Elige hasta 4 productos</legend>${candidates.map((candidate) => {
          const image = candidate.imageUrls.map(assetUrl).find(Boolean);
          return `<label><input type="checkbox" name="recommendation" value="${escapeHtml(candidate.id)}" ${recommendationIds.has(candidate.id) ? "checked" : ""}><span class="preview-builder-recommendation-media">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span>${escapeHtml(initials(candidate.name))}</span>`}</span><span><strong>${escapeHtml(candidate.name)}</strong><small>${formatAmount(candidate.amount, candidate.currency)}</small></span></label>`;
        }).join("")}</fieldset>`;
  dialog.innerHTML = `<form method="dialog" class="preview-builder-form" aria-labelledby="preview-builder-title">
    <header><div><h2 id="preview-builder-title">${escapeHtml(title)}</h2><p>${kind === "recommendation" ? "Estas tarjetas aparecerán debajo del producto, en el orden del catálogo." : "Se guardará directamente en tu catálogo sin salir de esta vista previa."}</p></div><button type="button" class="preview-builder-close" aria-label="Cerrar">×</button></header>
    ${body}
    <p class="preview-builder-status" role="status" aria-live="polite"></p>
    <footer><button type="button" class="preview-builder-cancel">Cancelar</button><button type="submit" class="preview-builder-submit">${kind === "category" ? "Crear categoría" : kind === "product" ? "Crear producto" : "Guardar recomendados"}</button></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  const status = dialog.querySelector<HTMLElement>(".preview-builder-status")!;
  const imageInput = dialog.querySelector<HTMLInputElement>('input[name="image"]');
  let previewObjectUrl = "";
  const close = () => {
    const saveTimeout = Number(dialog.dataset.saveTimeout);
    if (Number.isFinite(saveTimeout)) window.clearTimeout(saveTimeout);
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    dialog.close();
  };
  dialog.querySelector(".preview-builder-close")?.addEventListener("click", close);
  dialog.querySelector(".preview-builder-cancel")?.addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    const canvas = dialog.querySelector<HTMLElement>(".preview-builder-image-canvas");
    if (!file || !canvas) return;
    let image = canvas.querySelector<HTMLImageElement>("img");
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      canvas.append(image);
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    image.src = previewObjectUrl;
  });
  const recommendationInputs = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="recommendation"]'));
  recommendationInputs.forEach((input) => input.addEventListener("change", () => {
    const checked = recommendationInputs.filter((candidate) => candidate.checked);
    if (checked.length > 4) {
      input.checked = false;
      status.textContent = "Puedes elegir hasta 4 productos.";
    } else status.textContent = `${checked.length} de 4 seleccionados.`;
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = dialog.querySelector<HTMLButtonElement>(".preview-builder-submit")!;
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = "Guardando…";
    dialog.setAttribute("aria-busy", "true");
    status.textContent = "Guardando en tu catálogo…";
    const previousTimeout = Number(dialog.dataset.saveTimeout);
    if (Number.isFinite(previousTimeout)) window.clearTimeout(previousTimeout);
    dialog.dataset.saveTimeout = String(window.setTimeout(() => {
      if (!dialog.isConnected || !dialog.hasAttribute("aria-busy")) return;
      dialog.removeAttribute("aria-busy");
      submit.disabled = false;
      submit.textContent = kind === "recommendation" ? "Guardar recomendados" : kind === "category" ? "Crear categoría" : "Crear producto";
      status.textContent = "La vista previa no recibió confirmación. Intenta nuevamente o recarga el panel.";
      delete dialog.dataset.saveTimeout;
    }, 15_000));
    if (kind === "category") {
      postToParent("STORE_EDITOR_CREATE_CATEGORY", { requestId, name: String(data.get("name") || ""), image: imageInput?.files?.[0] || null });
    } else if (kind === "product") {
      postToParent("STORE_EDITOR_CREATE_PRODUCT", { requestId, categoryId: options.categoryId || null, name: String(data.get("name") || ""), description: String(data.get("description") || ""), price: String(data.get("price") || ""), image: imageInput?.files?.[0] || null });
    } else {
      postToParent("STORE_EDITOR_UPDATE_PRODUCT_RECOMMENDATIONS", { requestId, productId: options.productId, recommendedProductIds: recommendationInputs.filter((input) => input.checked).map((input) => input.value) });
    }
  });
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>("input:not([type='file'])")?.focus();
}

export function bindPreviewBlueprints(store: Store): void {
  app.querySelectorAll<HTMLButtonElement>("[data-preview-blueprint]:not([data-blueprint-bound])").forEach((button) => {
    button.dataset.blueprintBound = "true";
    button.addEventListener("click", () => {
      const kind = button.dataset.previewBlueprint as "category" | "product" | "recommendation";
      const product = button.dataset.productId ? store.items.find((entry) => entry.id === button.dataset.productId) : null;
      if (kind === "recommendation" && product && store.items.length <= 1) {
        openPreviewBuilderDialog("product", store, { categoryId: product.categoryId || undefined });
        return;
      }
      openPreviewBuilderDialog(kind, store, { categoryId: button.dataset.categoryId, productId: button.dataset.productId });
    });
  });
}
