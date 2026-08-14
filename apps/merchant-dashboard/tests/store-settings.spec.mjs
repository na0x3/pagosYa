import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  editorialGallery: [],
  links: [],
  checkoutMode: "payment",
  contactPhone: null,
});

async function openDashboard(
  page,
  stores = [store("store_1", "Primera"), store("store_2", "Segunda")],
  responseForRequest,
) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3000/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({
      path,
      method: request.method(),
      body: contentType.includes("application/json") ? request.postDataJSON() : undefined,
    });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path.includes("/categories") || path.includes("/payment_links")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = request.postDataJSON();
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-appearance");
  await expect(page.locator("#storeNameInput")).toHaveValue(stores[0].name);
  if (await page.locator("dialog[open]").count()) {
    const explore = page.getByRole("button", { name: "Explorar por mi cuenta" });
    if (await explore.count()) await explore.click();
    else await page.locator("dialog[open]").evaluate((dialog) => dialog.close());
  }
  const appearanceToggle = page.locator("#storeSettingsSection > .panel > .section-head .section-toggle");
  if (await appearanceToggle.getAttribute("aria-expanded") !== "true") await appearanceToggle.click();
  await expect(page.locator("#storeNameInput")).toBeVisible();
  return requests;
}

async function prepareInventoryImport(page, responseForRequest) {
  const requests = await openDashboard(page, [store("store_1", "Primera")], responseForRequest);
  await page.locator('[data-dashboard-view="products"]').click();
  const importerToggle = page.locator("#inventoryImporterToggle");
  if (await importerToggle.getAttribute("aria-expanded") !== "true") await importerToggle.click();
  await page.locator("#inventoryCsvInput").setInputFiles({
    name: "productos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nombre;precio;categoria;imagenes\nSilpancho;45,50;Comida;silpancho.png"),
  });
  await page.locator("#inventoryImagesInput").setInputFiles({
    name: "silpancho.png",
    mimeType: "image/png",
    buffer: Buffer.from("imagen-de-prueba"),
  });
  await page.locator("#inventoryPrepare").click();
  await expect(page.locator("#inventoryImportStatus")).toHaveText("Archivo revisado y listo.");
  return requests;
}

const successfulInventoryResponse = ({ path }) => {
  if (path === "/uploads") return { url: "/uploads/silpancho.png" };
  if (path === "/stores/store_1/payment_links/import") {
    return {
      categoriesCreated: [{ id: "category_food", name: "Comida" }],
      products: [{
        id: "product_1",
        name: "Silpancho",
        amount: 4550,
        currency: "BOB",
        status: "ACTIVE",
        categoryId: "category_food",
        imageUrls: ["/uploads/silpancho.png"],
        tags: [],
        variants: [],
        stock: null,
      }],
    };
  }
  return undefined;
};

test("typing keeps focus and previews without reloading the iframe", async ({ page }) => {
  await openDashboard(page);
  const name = page.locator("#storeNameInput");
  const initialSrc = await page.locator("#storePreviewFrame").getAttribute("src");
  await name.fill("");
  await name.pressSequentially("Suave", { delay: 20 });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Suave");
  await expect(page.locator("#storePreviewFrame")).toHaveAttribute("src", initialSrc);
});

test("appearance and links save once to the captured store", async ({ page }) => {
  const requests = await openDashboard(page);
  await page.locator("#storeNameInput").fill("Nombre guardado");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const writes = requests.filter((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/stores/store_1/settings");
  expect(writes[0].body).toMatchObject({ name: "Nombre guardado", links: [] });
  expect(requests.some((request) => request.path.endsWith("/links"))).toBe(false);
});

test("switching stores clears the other store's AI output", async ({ page }) => {
  await openDashboard(page);
  await page.evaluate(() => {
    const target = document.getElementById("visualProposals");
    target.innerHTML = '<article class="visual-proposal">Borrador anterior</article>';
  });
  await page.locator('[data-dashboard-view="stores"]').click();
  await page.locator('.store-row[data-id="store_2"]').click();
  await expect(page.locator("#storeNameInput")).toHaveValue("Segunda");
  await expect(page.locator("#visualProposals .visual-proposal")).toHaveCount(0);
});

test("appearance editor remains usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, [store("store_1", "Móvil")]);
  await expect(page.locator("#storeNameInput")).toBeVisible();
  const pageWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport);
  const saveBox = await page.locator("#storeSettingsForm button[type=submit]").boundingBox();
  expect(saveBox?.height).toBeGreaterThanOrEqual(44);
});

test("merchant classifies a product from readable taxpayer-scoped SIAT catalogs", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Zapatería")], ({ path, request }) => {
    if (path === "/merchants/invoicing_profile") {
      return { id: "profile_1", nit: "709354049", cuis: "CUIS-STORED", sucursal: 0, puntoVenta: 0 };
    }
    if (path === "/siat/catalogs/activities") {
      return { total: 1, entries: [{ codigoCaeb: "477210", descripcion: "VENTA DE CALZADO" }] };
    }
    if (path === "/siat/catalogs/units") {
      return { total: 1, entries: [{ codigoClasificador: 58, descripcion: "UNIDAD" }] };
    }
    if (path === "/siat/catalogs/products") {
      expect(new URL(request.url()).searchParams.get("activityCode")).toBe("477210");
      return { total: 1, entries: [{ codigoActividad: "477210", codigoProducto: 123456, descripcionProducto: "CALZADO" }] };
    }
    if (path === "/stores/store_1/payment_links" && request.method() === "POST") {
      return { id: "product_1", status: "ACTIVE", imageUrls: [], imagePositions: [], tags: [], variants: [], stock: null, ...request.postDataJSON() };
    }
    return undefined;
  });
  await page.locator('[data-dashboard-view="products"]').click();
  await page.locator("#productFiscalMapping summary").click();
  await expect(page.locator("#productActividadEconomica")).toBeEnabled();
  await page.locator("#productActividadEconomica").selectOption("477210");
  await expect(page.locator("#productCodigoProductoSin")).toBeEnabled();
  await page.locator("#productCodigoProducto").fill("NIKE-AM90");
  await page.locator("#productCodigoProductoSin").selectOption("123456");
  await page.locator("#productUnidadMedida").selectOption("58");
  await page.locator('#paymentLinkForm [name="name"]').fill("Nike Air Max 90");
  await page.locator('#paymentLinkForm [name="amount"]').fill("850");
  await page.locator("#paymentLinkSubmit").click();

  await expect(page.locator("#info")).toContainText("creado");
  const create = requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST");
  expect(create.body).toMatchObject({
    codigoProducto: "NIKE-AM90",
    actividadEconomica: "477210",
    codigoProductoSin: "123456",
    unidadMedida: 58,
  });
});

test("CSV and picture import reports the committed result as successful", async ({ page }) => {
  const requests = await prepareInventoryImport(page, successfulInventoryResponse);
  await page.locator("#inventoryCommit").click();

  await expect(page.locator("#inventoryImportStatus")).toHaveText("Importación completada.");
  await expect(page.locator("#info")).toContainText("1 producto importado y 1 categorías nuevas");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#paymentLinkRows")).toContainText("Silpancho");
  expect(requests.find((request) => request.path.endsWith("/payment_links/import"))?.body).toMatchObject({
    products: [{ name: "Silpancho", imageUrls: ["/uploads/silpancho.png"] }],
  });
});

test("a local catalog render problem does not relabel a committed import as failed", async ({ page }) => {
  await prepareInventoryImport(page, successfulInventoryResponse);
  await page.locator("#categoryRows").evaluate((element) => element.remove());
  await page.locator("#inventoryCommit").click();

  await expect(page.locator("#inventoryImportStatus")).toHaveText("Importación completada.");
  await expect(page.locator("#info")).toContainText("Actualiza la página para ver el catálogo completo.");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#inventoryImportStatus")).not.toContainText("no se completó");
});

test("merchant can adjust each product photo focus and save the framing", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path, request }) => {
    if (path === "/uploads") return { url: "/v1/uploads/product-focus.jpg" };
    if (path === "/stores/store_1/payment_links" && request.method() === "POST") {
      return { id: "product_focus", storeId: "store_1", status: "ACTIVE", currency: "BOB", variants: [], ...request.postDataJSON() };
    }
    return undefined;
  });
  await page.locator('[data-dashboard-view="products"]').click();
  const form = page.locator("#paymentLinkForm");
  if (!(await form.isVisible())) await page.locator("#paymentLinksSection .section-toggle").click();
  await form.locator('[name="name"]').fill("Producto encuadrado");
  await form.locator('[name="amount"]').fill("45");
  await page.locator("#paymentLinkImages").setInputFiles({
    name: "producto.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("foto-producto"),
  });
  await expect(page.locator("#paymentLinkImagesPreview .gallery-frame-editor")).toHaveCount(1);
  await page.locator("#imageFocusX0").fill("64");
  await page.locator("#imageFocusY0").fill("22");
  await expect(page.locator("#paymentLinkImagesPreview img")).toHaveCSS("object-position", "64% 22%");
  await form.evaluate((element) => element.requestSubmit());
  await expect(page.locator("#info")).toContainText("creado");

  expect(requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST")?.body).toMatchObject({
    imageUrls: ["/v1/uploads/product-focus.jpg"],
    imagePositions: ["64% 22%"],
  });
});

test("AI setup sends the chosen WhatsApp mode and uploaded inspiration photos", async ({ page }) => {
  let uploadNumber = 0;
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/uploads") return { url: `/v1/uploads/ai-${++uploadNumber}.jpg` };
    if (path === "/stores/store_1/visual-proposals") {
      return {
        mode: "ai",
        proposals: [1, 2, 3].map((number) => ({
          id: `proposal_${number}`,
          title: `Propuesta ${number}`,
          rationale: "Dirección visual de prueba",
          status: "READY",
          provider: "openai:test",
          sourceAssetUrls: ["/v1/uploads/ai-1.jpg"],
          config: { checkoutMode: "whatsapp", cartButtonLabel: "Pedir por WhatsApp" },
        })),
      };
    }
    return undefined;
  });

  const assistantToggle = page.locator("#visualAssistantToggle");
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await assistantToggle.click();
  await page.locator('input[name="visualCheckoutMode"][value="whatsapp"]').check();
  await expect(page.locator("#visualWhatsappPhoneWrap")).toBeVisible();
  await page.locator("#visualWhatsappPhone").fill("+591 71234567");
  await page.locator("#visualAiImages").setInputFiles({
    name: "referencia.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("foto-de-referencia"),
  });
  await expect(page.locator("#visualAiPreviews img")).toHaveCount(1);
  await page.locator("#visualGenerate").click();
  await expect(page.locator("#visualProposals .visual-proposal")).toHaveCount(3);

  const generation = requests.find((request) => request.path === "/stores/store_1/visual-proposals");
  expect(generation?.body).toMatchObject({
    checkoutMode: "whatsapp",
    whatsappPhone: "+591 71234567",
    assetUrls: ["/v1/uploads/ai-1.jpg"],
  });
});

test("AI proposals preview in a new tab without applying and only the latest applied proposal stays in use", async ({ page }) => {
  const proposals = [
    { id: "proposal_1", title: "Primera", rationale: "Dirección uno", status: "APPLIED", appliedAt: "2026-08-13T10:00:00.000Z", config: { accentColor: "#123456", tagline: "Primera dirección" } },
    { id: "proposal_2", title: "Segunda", rationale: "Dirección dos", status: "APPLIED", appliedAt: "2026-08-13T11:00:00.000Z", config: { accentColor: "#654321", tagline: "Segunda dirección" } },
    { id: "proposal_3", title: "Tercera", rationale: "Dirección tres", status: "READY", appliedAt: null, config: { accentColor: "#abcdef", tagline: "Tercera dirección" } },
  ];
  await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/stores/store_1/visual-studio") return { proposals, versions: [] };
    return undefined;
  });

  await expect(page.locator('.visual-proposal[data-id="proposal_1"] .visual-apply-proposal')).toHaveText("Usar propuesta");
  await expect(page.locator('.visual-proposal[data-id="proposal_2"] .visual-apply-proposal')).toHaveText("Aplicada");
  await expect(page.locator('.visual-proposal[data-id="proposal_3"] .visual-apply-proposal')).toHaveText("Usar propuesta");

  await page.evaluate(() => {
    window.__proposalPreviewOpen = null;
    window.open = (url, target, features) => {
      window.__proposalPreviewOpen = { url: String(url), target, features };
      return null;
    };
  });
  const assistantToggle = page.locator("#visualAssistantToggle");
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await assistantToggle.click();
  await page.locator('.visual-proposal[data-id="proposal_1"] .visual-preview-proposal').click();

  const opened = await page.evaluate(() => window.__proposalPreviewOpen);
  const previewUrl = new URL(opened.url);
  const previewPatch = JSON.parse(new URLSearchParams(previewUrl.hash.slice(1)).get("proposal"));
  expect(previewUrl.searchParams.get("preview")).toBe("1");
  expect(previewPatch).toMatchObject({ accentColor: "#123456", tagline: "Primera dirección" });
  expect(opened).toMatchObject({ target: "_blank", features: "noopener,noreferrer" });
  await expect(page.locator("#visualProposalStatus")).toContainText("No aplicamos cambios");
});
