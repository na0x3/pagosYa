import { escapeHtml as esc } from "./html.mjs";
import { prepareAiInventoryRows } from "./inventory-import.mjs";

/**
 * Importar inventario: the CSV/AI inventory import (moved from dashboard.js 2026-10-15, no behaviour change).
 * create…() only looks things up (creating the toggle button has no visible effect until init() appends it); init()
 * attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   errorEl, infoEl                the dashboard's error and info banners
 *   checkoutOriginEl               the checkout origin select
 *   money(cents)                   formats an amount, honouring the hide-money toggle
 *   initInlineCollapsible, uploadFile
 *                                  dashboard.js helpers this screen calls
 *   storeId()                      the active store id, read at use time
 *   stores(), paymentLinks()       the merchant's stores and payment links, read at use time
 *   categories(), setCategories(categories)
 *                                  the loaded categories, read and written at use time
 *   renderCurrentStoreBanner, renderStoreRows, refreshFinancesInBackground, renderPaymentLinkRows,
 *   resetPaymentLinkBrowseState    other screens' redraws, reached through arrows
 */
export function createInventoryImportPanel(deps) {
  const { api, errorEl, infoEl, checkoutOriginEl, money, initInlineCollapsible, uploadFile, renderCurrentStoreBanner, renderStoreRows, refreshFinancesInBackground, renderPaymentLinkRows, resetPaymentLinkBrowseState } = deps;
  const inventoryToggle = document.createElement("button");
  const inventoryCsvInputEl = document.getElementById("inventoryCsvInput");
  const inventoryImagesInputEl = document.getElementById("inventoryImagesInput");
  const inventoryDropzoneEl = document.getElementById("inventoryDropzone");
  const inventoryFileSummaryEl = document.getElementById("inventoryFileSummary");
  const inventoryConnectionEl = document.getElementById("inventoryConnection");
  const inventoryReviewEl = document.getElementById("inventoryReview");
  const inventoryReviewRowsEl = document.getElementById("inventoryReviewRows");
  const inventoryReviewSummaryEl = document.getElementById("inventoryReviewSummary");
  const inventoryImportStatusEl = document.getElementById("inventoryImportStatus");
  const inventoryAiWarningsEl = document.getElementById("inventoryAiWarnings");
  const inventoryCommitEl = document.getElementById("inventoryCommit");
  let preparedInventoryRows = [];
  let preparedInventoryStoreId = null;
  let inventoryImportInProgress = false;
  let inventoryImportVersion = 0;
  function renderInventoryAiWarnings(warnings = []) {
    const visibleWarnings = Array.isArray(warnings) ? warnings.filter(Boolean).slice(0, 30) : [];
    inventoryAiWarningsEl.replaceChildren(...visibleWarnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
    inventoryAiWarningsEl.hidden = visibleWarnings.length === 0;
  }

  function renderInventoryReview() {
    const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
    const categoryCount = new Set(preparedInventoryRows.map((row) => row.product.categoryName).filter(Boolean).map((name) => name.toLocaleLowerCase("es"))).size;
    const preparedStore = deps.stores().find((store) => store.id === preparedInventoryStoreId);
    const belongsToCurrentStore = !!preparedInventoryStoreId && preparedInventoryStoreId === deps.storeId();
    inventoryReviewEl.hidden = preparedInventoryRows.length === 0;
    const skuCount = preparedInventoryRows.filter((row) => row.product.codigoProducto).length;
    const connectionLabel = inventoryConnectionEl.selectedOptions[0]?.textContent || "sin conexión";
    inventoryReviewSummaryEl.innerHTML = `<strong>${preparedInventoryRows.length} productos</strong> · destino: <strong>${esc(preparedStore?.name || "tienda seleccionada")}</strong> · ${skuCount} con SKU · ${inventoryConnectionEl.value ? `conectar a <strong>${esc(connectionLabel)}</strong>` : "guardar sin conexión"} · ${categoryCount} categorías · ${invalidCount ? `${invalidCount} filas por corregir` : "listos para importar"}`;
    inventoryCommitEl.disabled = preparedInventoryRows.length === 0 || invalidCount > 0 || !belongsToCurrentStore || inventoryImportInProgress;
    inventoryReviewRowsEl.innerHTML = preparedInventoryRows.map((row) => {
      const amounts = row.product.variants.length ? row.product.variants.map((variant) => variant.amount) : [row.product.amount];
      const price = Math.min(...amounts) === Math.max(...amounts)
        ? money(amounts[0])
        : `${money(Math.min(...amounts))} – ${money(Math.max(...amounts))}`;
      return `<tr>
        <td>${row.rowNumber}</td>
        <td><strong>${esc(row.product.name || "Sin nombre")}</strong></td>
        <td><code>${esc(row.product.codigoProducto || "—")}</code></td>
        <td>${esc(row.product.categoryName || "Sin categoría")}</td>
        <td>${price}</td>
        <td>${row.product.variants.length ? row.product.variants.map((variant) => esc(variant.name)).join(", ") : "—"}</td>
        <td class="inventory-photo-count">${row.imageFiles.length}</td>
        <td>${row.errors.length ? `<span class="inventory-row-error">${row.errors.map(esc).join("<br>")}</span>` : '<span class="inventory-row-ready">Lista</span>'}</td>
      </tr>`;
    }).join("");
  }

  function resetInventoryImportState(status = "Aún no hay un archivo preparado.") {
    inventoryImportVersion++;
    preparedInventoryRows = [];
    preparedInventoryStoreId = null;
    inventoryCsvInputEl.value = "";
    inventoryImagesInputEl.value = "";
    updateInventoryFileSummary();
    renderInventoryAiWarnings();
    inventoryImportStatusEl.textContent = status;
    renderInventoryReview();
  }

  async function loadInventoryConnections({ force = false } = {}) {
    if (!deps.storeId()) {
      inventoryConnectionEl.innerHTML = '<option value="">Crea o selecciona una tienda primero</option>';
      inventoryConnectionEl.disabled = true;
      return [];
    }
    if (!force && inventoryConnectionEl.dataset.storeId === deps.storeId()) return [];
    const selected = inventoryConnectionEl.value;
    inventoryConnectionEl.disabled = true;
    inventoryConnectionEl.innerHTML = '<option value="">Cargando conexiones…</option>';
    try {
      const connections = await api(`/stores/${deps.storeId()}/operations/integrations`);
      inventoryConnectionEl.innerHTML = '<option value="">Guardar SKU sin conectar todavía</option>' +
        connections.map((connection) => `<option value="${esc(connection.id)}">${esc(connection.name)} · ${esc(inventoryConnectionKindLabel(connection.kind))}</option>`).join("");
      inventoryConnectionEl.dataset.storeId = deps.storeId();
      inventoryConnectionEl.disabled = false;
      if (connections.some((connection) => connection.id === selected)) inventoryConnectionEl.value = selected;
      renderInventoryReview();
      return connections;
    } catch (error) {
      inventoryConnectionEl.innerHTML = '<option value="">No se pudieron cargar las conexiones</option>';
      inventoryConnectionEl.disabled = false;
      inventoryImportStatusEl.textContent = `Puedes importar sin conexión. ${error.message}`;
      return [];
    }
  }

  function inventoryConnectionKindLabel(kind) {
    return ({
      CUSTOM_DATABASE: "base propia",
      SHOPIFY: "Shopify",
      WOOCOMMERCE: "WooCommerce",
      POS: "otro POS",
      ACCOUNTING: "contabilidad",
      OTHER: "otro sistema",
    })[kind] || String(kind || "conexión").replaceAll("_", " ").toLowerCase();
  }

  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function takeNext() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, takeNext));
    return results;
  }

  function updateInventoryFileSummary() {
    const csv = inventoryCsvInputEl.files[0];
    const imageCount = inventoryImagesInputEl.files.length;
    if (!csv && imageCount === 0) {
      inventoryFileSummaryEl.textContent = "Ningún archivo seleccionado.";
      return;
    }
    inventoryFileSummaryEl.innerHTML = [
      csv ? `<strong>${esc(csv.name)}</strong>` : "Falta el CSV",
      imageCount ? `${imageCount} ${imageCount === 1 ? "foto seleccionada" : "fotos seleccionadas"}` : "sin fotos",
    ].join(" · ");
  }

  function replaceInventoryInputFiles(input, files) {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }

  function acceptDroppedInventoryFiles(files) {
    const dropped = [...files];
    const csvFiles = dropped.filter((file) => /\.(csv|tsv)$/i.test(file.name) || ["text/csv", "text/tab-separated-values"].includes(file.type));
    const imageFiles = dropped.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
    if (csvFiles.length) replaceInventoryInputFiles(inventoryCsvInputEl, [csvFiles[0]]);
    if (imageFiles.length) {
      const combined = [...inventoryImagesInputEl.files, ...imageFiles];
      const unique = [...new Map(combined.map((file) => [`${file.name.toLocaleLowerCase("es")}:${file.size}:${file.lastModified}`, file])).values()];
      replaceInventoryInputFiles(inventoryImagesInputEl, unique);
    }
    const unsupported = dropped.length - csvFiles.length - imageFiles.length;
    inventoryImportStatusEl.textContent = unsupported
      ? `${unsupported} ${unsupported === 1 ? "archivo no compatible fue ignorado" : "archivos no compatibles fueron ignorados"}. Usa CSV, TSV, PNG, JPG o WebP.`
      : csvFiles.length || imageFiles.length
        ? "Archivos listos. Presiona “Adaptar y revisar con IA”."
        : "No encontramos un CSV ni fotos compatibles en lo que soltaste.";
    updateInventoryFileSummary();
  }

  async function readInventoryCsvFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function downloadInventoryTemplate(advanced = false) {
    const template = advanced
      ? [
          "sku;nombre;precio;categoria;stock;descripcion;etiquetas;imagenes;opciones;color",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;Popular|Almuerzo;silpancho.webp;;#c2410c",
          "BEB-001;Limonada;;Bebidas;;Preparada al momento;Fría;limonada.jpg;Vaso:12:20|Jarra:30:8;#15803d",
        ].join("\r\n")
      : [
          "sku;nombre;precio;categoria;stock;descripcion;imagenes",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;silpancho.webp",
          "BEB-001;Limonada;12,50;Bebidas;;Preparada al momento;limonada.jpg",
        ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = advanced ? "plantilla-productos-pagosya-completa.csv" : "plantilla-productos-pagosya.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  /** How many rows the import has prepared (setMonetaryValuesHidden re-renders the review only when there are some). */
  function preparedRowCount() { return preparedInventoryRows.length; }

  function init() {
    inventoryToggle.type = "button";
    inventoryToggle.id = "inventoryImporterToggle";
    inventoryToggle.className = "ghost inline-section-toggle";
    document.querySelector(".inventory-import-head")?.appendChild(inventoryToggle);
    initInlineCollapsible("inventoryImporter", ".inventory-import-head", "inventoryImporterToggle", "pagosya_inventory_importer_expanded", "importador de inventario", false);
    checkoutOriginEl.addEventListener("change", () => {
      sessionStorage.setItem("pagosya_checkout_origin", checkoutOriginEl.value);
      renderCurrentStoreBanner();
      if (deps.stores()) renderStoreRows(deps.stores());
    });
    inventoryConnectionEl.addEventListener("focus", () => loadInventoryConnections().catch(() => undefined));
    inventoryConnectionEl.addEventListener("change", renderInventoryReview);
    ["dragenter", "dragover"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      inventoryDropzoneEl.classList.add("is-dragging");
    }));
    ["dragleave", "dragend"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, () => {
      inventoryDropzoneEl.classList.remove("is-dragging");
    }));
    inventoryDropzoneEl.addEventListener("drop", (event) => {
      event.preventDefault();
      inventoryDropzoneEl.classList.remove("is-dragging");
      acceptDroppedInventoryFiles(event.dataTransfer?.files || []);
    });
    inventoryDropzoneEl.addEventListener("keydown", (event) => {
      if (event.target !== inventoryDropzoneEl || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      inventoryCsvInputEl.click();
    });
    inventoryCsvInputEl.addEventListener("change", updateInventoryFileSummary);
    inventoryImagesInputEl.addEventListener("change", updateInventoryFileSummary);
    document.getElementById("inventoryTemplateDownload").addEventListener("click", () => downloadInventoryTemplate());
    document.getElementById("inventoryTemplateAdvancedDownload").addEventListener("click", () => downloadInventoryTemplate(true));
    document.getElementById("inventoryPrepare").addEventListener("click", async () => {
      const prepareButton = document.getElementById("inventoryPrepare");
      const csvFile = inventoryCsvInputEl.files[0];
      if (!csvFile) {
        inventoryImportStatusEl.textContent = "Selecciona primero un archivo CSV.";
        inventoryCsvInputEl.focus();
        return;
      }
      if (!deps.storeId()) {
        inventoryImportStatusEl.textContent = "Selecciona una tienda antes de revisar el CSV.";
        return;
      }
      const targetStoreId = deps.storeId();
      const prepareVersion = ++inventoryImportVersion;
      if (inventoryConnectionEl.dataset.storeId !== targetStoreId) await loadInventoryConnections();
      prepareButton.disabled = true;
      prepareButton.textContent = "Adaptando inventario…";
      inventoryImportStatusEl.textContent = "La IA está interpretando columnas, precios y stock…";
      renderInventoryAiWarnings();
      try {
        const normalized = await api(`/stores/${targetStoreId}/payment_links/import/normalize`, {
          method: "POST",
          body: JSON.stringify({
            csv: await readInventoryCsvFile(csvFile),
            imageFileNames: [...inventoryImagesInputEl.files].map((file) => file.name),
          }),
        });
        const prepared = prepareAiInventoryRows(normalized?.products, [...inventoryImagesInputEl.files]);
        if (prepareVersion !== inventoryImportVersion || targetStoreId !== deps.storeId()) return;
        preparedInventoryRows = prepared.rows;
        preparedInventoryStoreId = targetStoreId;
        renderInventoryAiWarnings([...(normalized?.warnings || []), ...prepared.warnings]);
        renderInventoryReview();
        const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
        inventoryImportStatusEl.textContent = invalidCount
          ? `Revisa ${invalidCount} ${invalidCount === 1 ? "fila marcada" : "filas marcadas"}.`
          : "Archivo adaptado por IA y listo para revisar.";
      } catch (err) {
        if (prepareVersion !== inventoryImportVersion || targetStoreId !== deps.storeId()) return;
        preparedInventoryRows = [];
        preparedInventoryStoreId = null;
        renderInventoryReview();
        inventoryImportStatusEl.textContent = err.networkFailure
          ? `${err.message} El CSV y las fotos siguen seleccionados.`
          : err.message;
      } finally {
        if (prepareVersion === inventoryImportVersion) {
          prepareButton.disabled = false;
          prepareButton.textContent = "Adaptar y revisar con IA";
        }
      }
    });
    inventoryCommitEl.addEventListener("click", async () => {
      if (
        inventoryImportInProgress ||
        !deps.storeId() ||
        preparedInventoryStoreId !== deps.storeId() ||
        preparedInventoryRows.length === 0 ||
        preparedInventoryRows.some((row) => row.errors.length)
      ) return;
      errorEl.textContent = "";
      infoEl.textContent = "";
      const importStoreId = deps.storeId();
      const importVersion = inventoryImportVersion;
      const rowsToImport = preparedInventoryRows;
      inventoryImportInProgress = true;
      inventoryCommitEl.disabled = true;
      let importCommitted = false;
      const uniqueFiles = [...new Map(rowsToImport.flatMap((row) => row.imageFiles).map((file) => [file.name.toLocaleLowerCase("es"), file])).values()];
      const importStillVisible = () => importVersion === inventoryImportVersion && importStoreId === deps.storeId();
      try {
        let uploadedCount = 0;
        const uploadedUrls = await runWithConcurrency(uniqueFiles, 3, async (file) => {
          const url = await uploadFile(file);
          uploadedCount++;
          if (importStillVisible()) inventoryImportStatusEl.textContent = `Subiendo fotos ${uploadedCount} de ${uniqueFiles.length}…`;
          return [file.name.toLocaleLowerCase("es"), url];
        });
        const urlByFilename = new Map(uploadedUrls);
        if (importStillVisible()) inventoryImportStatusEl.textContent = "Creando productos y categorías…";
        const products = rowsToImport.map((row) => ({
          ...row.product,
          imageUrls: row.imageFiles.map((file) => urlByFilename.get(file.name.toLocaleLowerCase("es"))).filter(Boolean),
        }));
        const result = await api(`/stores/${importStoreId}/payment_links/import`, {
          method: "POST",
          body: JSON.stringify({
            products,
            ...(inventoryConnectionEl.value && { integrationConnectionId: inventoryConnectionEl.value }),
          }),
        });
        importCommitted = true;
        if (importStillVisible()) {
          const importedProducts = Array.isArray(result?.products) ? result.products : [];
          const categoriesCreated = Array.isArray(result?.categoriesCreated) ? result.categoriesCreated : [];
          // Once the API confirms the transaction, the import succeeded. Mark it
          // complete before refreshing local views so a rendering problem cannot
          // be reported as a failed import (and tempt the merchant to retry it).
          resetInventoryImportState("Importación completada.");
          const mappingsCreated = Number(result?.mappingsCreated || 0);
          infoEl.textContent = `${importedProducts.length} ${importedProducts.length === 1 ? "producto importado" : "productos importados"}${categoriesCreated.length ? ` y ${categoriesCreated.length} categorías nuevas` : ""}${mappingsCreated ? `; ${mappingsCreated} SKU ${mappingsCreated === 1 ? "conectado" : "conectados"}` : ""}.`;
          try {
            resetPaymentLinkBrowseState();
            deps.setCategories([...deps.categories(), ...categoriesCreated]);
            renderPaymentLinkRows([...importedProducts, ...deps.paymentLinks()]);
          } catch (renderError) {
            console.error("La importación terminó, pero el catálogo no se pudo actualizar en pantalla.", renderError);
            infoEl.textContent += " Actualiza la página para ver el catálogo completo.";
          }
        }
        refreshFinancesInBackground();
      } catch (err) {
        if (importStillVisible()) {
          if (importCommitted) {
            inventoryImportStatusEl.textContent = "Importación completada.";
            infoEl.textContent = "Los productos se importaron. Actualiza la página para ver el catálogo completo.";
          } else {
            errorEl.textContent = "Error importando el inventario: " + err.message;
            inventoryImportStatusEl.textContent = "La importación no se completó. Corrige el problema e intenta otra vez.";
          }
        }
      } finally {
        inventoryImportInProgress = false;
        renderInventoryReview();
      }
    });
  }

  return { init, renderInventoryReview, resetInventoryImportState, preparedRowCount };
}
