import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  experienceStyle: "coverflow",
  motionDuoEnabled: false,
  editorialGallery: [],
  links: [],
  checkoutMode: "payment",
  contactPhone: null,
  contactEmail: null,
  leadCaptureUrl: null,
  cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
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
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links")) body = [];
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

test("orders show buyer support details and can be searched by name", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/merchants/orders") return [{
      id: "lead_123",
      kind: "LEAD",
      storeId: "store_1",
      storeName: "Primera",
      amount: 15000,
      currency: "BOB",
      status: "LEAD_RECEIVED",
      paymentMethodType: null,
      customerName: "María Pérez",
      customerEmail: "maria@gmail.com",
      customerPhone: "+591 71234567",
      description: "Necesito entrega",
      items: [{ name: "Asesoría", quantity: 1 }],
      createdAt: "2026-08-15T12:00:00.000Z",
    }];
    return undefined;
  });

  await page.locator('[data-dashboard-view="payments"]').click();
  await expect(page.locator("#paymentRows")).toContainText("María Pérez");
  await expect(page.locator("#paymentRows")).toContainText("maria@gmail.com");
  await page.locator("#orderSearch").fill("otra persona");
  await expect(page.locator("#paymentRows")).toContainText("No encontramos pedidos");
  await page.locator("#orderSearch").fill("maría");
  await expect(page.locator("#paymentRows")).toContainText("María Pérez");
});

test("buyer support controls remain usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, [store("store_1", "Primera")], ({ path }) => path === "/merchants/orders" ? [{
    id: "pi_mobile", kind: "PAYMENT", storeId: "store_1", storeName: "Primera", amount: 5000, currency: "BOB",
    status: "SUCCEEDED", paymentMethodType: "QR", customerName: "Ana Móvil", customerEmail: "ana@gmail.com",
    customerPhone: "70000000", items: [{ name: "Producto", quantity: 1 }], createdAt: "2026-08-15T12:00:00.000Z",
  }] : undefined);
  await page.locator('[data-dashboard-view="payments"]').click();

  await expect(page.locator("#orderSearch")).toBeVisible();
  await expect(page.locator("#downloadOrdersCsv")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".table-scroll")).toHaveCSS("overflow-x", "auto");
});

test("appearance and links save once to the captured store", async ({ page }) => {
  const requests = await openDashboard(page);
  await page.locator("#storeNameInput").fill("Nombre guardado");
  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await page.locator("#storeExperienceStyle").selectOption("story-scroller");
  await page.locator("#storeMotionDuoEnabled").check();
  await page.getByRole("button", { name: "Mostrar Estilo" }).click();
  await page.locator("#storeBackgroundColor").fill("#fef3c7");
  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click({ force: true });
  await expect(page.locator("#storeCartRecommendations")).toBeChecked();
  await page.locator("#storeCartRecommendations").uncheck();
  await page.locator("#storeShowLowStock").check();
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const writes = requests.filter((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/stores/store_1/settings");
  expect(writes[0].body).toMatchObject({
    name: "Nombre guardado",
    backgroundColor: "#fef3c7",
    experienceStyle: "story-scroller",
    motionDuoEnabled: true,
    cartRecommendationsEnabled: false,
    showLowStockToCustomers: true,
    links: [],
  });
  expect(writes[0].body).not.toHaveProperty("backgroundMode");
  expect(writes[0].body).not.toHaveProperty("backgroundGradientStart");
  expect(requests.some((request) => request.path.endsWith("/links"))).toBe(false);
});

test("merchant chooses which existing pictures appear in the editorial gallery", async ({ page }) => {
  const editorialStore = {
    ...store("store_1", "Zapateca"),
    bannerUrl: "/uploads/banner.webp",
    editorialGallery: [{
      imageUrl: "/uploads/banner.webp",
      title: "Ritmo clásico",
      caption: "Detalles de siempre",
      body: "Una historia guardada.",
      boxColor: "#f4ead7",
    }],
  };
  const requests = await openDashboard(page, [editorialStore], ({ path }) => {
    if (path === "/stores/store_1/payment_links") {
      return [{
        id: "product_1", name: "Zapatilla retro", amount: 42000, currency: "BOB", status: "ACTIVE",
        categoryId: null, stock: 10, tags: [], variants: [], extras: [],
        imageUrls: ["/uploads/zapato-crema.webp", "/uploads/zapato-verde.webp"],
        imagePositions: ["42% 50%", "68% 44%"],
      }];
    }
    return undefined;
  });

  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  const addGreenShoe = page.getByRole("checkbox", { name: "Mostrar Zapatilla retro · foto 2 en fotos editoriales" });
  await expect(addGreenShoe).toBeVisible();
  await expect(page.locator("#storeEditorialPhotoCount")).toHaveText("1 de 8 seleccionada");
  await addGreenShoe.check();

  await expect(page.locator("#storeEditorialPhotoCount")).toHaveText("2 de 8 seleccionadas");
  await expect(page.locator(".editorial-gallery-row")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Dejar de mostrar Banner de la tienda en fotos editoriales" }).uncheck();
  await expect(page.locator("#storeEditorialPhotoCount")).toHaveText("1 de 8 seleccionada");

  await page.getByRole("checkbox", { name: "Mostrar Banner de la tienda en fotos editoriales" }).check();
  await expect(page.locator(".editorial-title").last()).toHaveValue("Ritmo clásico");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const settingsWrite = requests.filter((request) => request.method === "PUT" && request.path.endsWith("/settings")).at(-1);
  expect(settingsWrite.body.editorialGallery).toEqual([
    expect.objectContaining({ imageUrl: "/uploads/zapato-verde.webp" }),
    expect.objectContaining({ imageUrl: "/uploads/banner.webp", title: "Ritmo clásico" }),
  ]);
});

test("merchant chooses the exact products shown as cart recommendations", async ({ page }) => {
  const products = [
    { id: "product_1", name: "Café de altura edición completa", status: "ACTIVE", amount: 4500, currency: "BOB", imageUrls: ["/uploads/cafe.webp"], tags: [], variants: [], extras: [], stock: null },
    { id: "product_2", name: "Taza artesanal", status: "ACTIVE", amount: 7000, currency: "BOB", imageUrls: [], tags: [], variants: [], extras: [], stock: null },
  ];
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) =>
    path === "/stores/store_1/payment_links" ? products : undefined,
  );
  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click();
  await expect(page.locator('.store-recommendation-option input[value="product_1"]')).toBeAttached();
  await expect(page.locator('.store-recommendation-option input[value="product_1"]')).toHaveAttribute("aria-label", "Recomendar Café de altura edición completa");
  await expect(page.locator('.store-recommendation-option:has(input[value="product_1"]) .store-recommendation-name')).toHaveCount(0);
  await expect(page.locator('.store-recommendation-option:has(input[value="product_1"]) img')).toHaveAttribute("src", /cafe\.webp$/);
  await expect(page.locator('.store-recommendation-option:has(input[value="product_1"]) img')).toHaveCSS("object-fit", "contain");
  await expect(page.locator('.store-recommendation-option:has(input[value="product_1"])')).toHaveCSS("width", "50px");
  await expect(page.locator('.store-recommendation-option:has(input[value="product_1"])')).toHaveCSS("height", "50px");
  await page.locator('.store-recommendation-option input[value="product_2"]').check();
  await expect(page.locator("#storeRecommendationCount")).toHaveText("1 seleccionado");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(write.body).toMatchObject({
    cartRecommendationsEnabled: true,
    cartRecommendationProductIds: ["product_2"],
  });
});

test("Yapi saves a store sales goal and shows revenue progress", async ({ page }) => {
  const goalStore = store("store_1", "Cafetería");
  const requests = await openDashboard(page, [goalStore], ({ path, request }) => {
    if (path === "/merchants/finances") {
      return { totalRevenue: 250000, paymentCount: 5, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    }
    if (path === "/stores/store_1" && request.method() === "PATCH") {
      return { ...goalStore, ...request.postDataJSON() };
    }
    return undefined;
  });

  await expect(page.locator("#assistantGoalView")).toBeHidden();
  await page.getByRole("tab", { name: "Meta" }).click();
  await expect(page.locator("#assistantGoalView")).toBeVisible();
  await page.locator("#assistantGoalLabel").fill("Meta de agosto");
  await page.locator("#assistantGoalAmount").fill("5000");
  await page.locator("#assistantGoalForm").evaluate((form) => form.requestSubmit());

  await expect(page.locator("#assistantGoalPercent")).toHaveText("50%");
  await expect(page.locator("#assistantGoalSummary")).toContainText("Meta de agosto");
  await expect(page.locator("#assistantGoalTrack")).toHaveAttribute("aria-valuenow", "50");
  const write = requests.find((entry) => entry.path === "/stores/store_1" && entry.method === "PATCH");
  expect(write.body).toEqual({ salesGoalLabel: "Meta de agosto", salesGoalAmount: 500000 });
});

test("WhatsApp asks for its destination number beside the selected mode", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")]);
  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click();
  const whatsappMode = page.locator('input[name="storeCheckoutMode"][value="whatsapp"]');
  await whatsappMode.check();
  await expect(page.locator("#storeWhatsappPhoneWrap")).toBeVisible();
  await expect(page.locator("#storeContactPhoneInput")).toHaveAttribute("required", "");
  await page.locator("#storeContactPhoneInput").fill("+591 71234567");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((entry) => entry.method === "PUT" && entry.path.endsWith("/settings"));
  expect(write.body).toMatchObject({ checkoutMode: "whatsapp", contactPhone: "+591 71234567" });
});

test("a lead-only store hides NIT features until integrated payments are enabled", async ({ page }) => {
  const leadStore = {
    ...store("store_1", "Estudio de interiores"),
    checkoutMode: "external",
    leadCaptureUrl: "https://estudio.example/agenda",
  };
  const requests = await openDashboard(page, [leadStore], ({ path, request }) => {
    if (path === "/stores/store_1/settings" && request.method() === "PUT") {
      Object.assign(leadStore, request.postDataJSON());
      return leadStore;
    }
    return undefined;
  });

  await expect(page.locator('input[name="storeCheckoutMode"][value="external"]')).toBeChecked();
  await expect(page.locator("#storeLeadUrl")).toHaveValue("https://estudio.example/agenda");
  await page.locator('[data-dashboard-view="compliance"]').click();
  await page.locator("#kycSection .section-toggle").click();
  await page.locator("#invoicingSection .section-toggle").click();
  await expect(page.locator("#kycModeNotice")).toBeVisible();
  await expect(page.locator("#invoicingModeNotice")).toBeVisible();
  await expect(page.locator("#kycForm")).toBeHidden();
  await expect(page.locator("#invoicingForm")).toBeHidden();

  await page.locator('[data-dashboard-view="appearance"]').click();
  await page.locator('input[name="storeCheckoutMode"][value="payment"]').evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());

  await expect(page).toHaveURL(/#dashboard-compliance$/);
  await expect(page.locator("#invoicingForm")).toBeVisible();
  await expect(page.locator("#info")).toContainText("registra tu NIT");
  const settingsWrite = requests.find((entry) => entry.path === "/stores/store_1/settings" && entry.method === "PUT");
  expect(settingsWrite.body).toMatchObject({ checkoutMode: "payment", leadCaptureUrl: null });
});

test("Yapi opens by default without taking focus from the dashboard", async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator("#assistantPanel")).toBeVisible();
  await expect(page.locator("#assistantObject")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#assistantClose")).not.toBeFocused();
});

test("Yapi calculates an honest 100% setup and explains digital invoicing", async ({ page }) => {
  const readyStore = {
    ...store("store_1", "Lista para vender"),
    logoUrl: "/uploads/logo.webp",
    bannerUrl: "/uploads/banner.webp",
    aboutImageUrl: "/uploads/about.webp",
    promotionImageUrl: "/uploads/promo.webp",
    heroSlides: [{ imageUrl: "/uploads/hero-detail.webp", title: "Detalle" }],
    contactEmail: "soporte@tienda.bo",
  };
  await openDashboard(page, [readyStore], ({ path }) => {
    if (path === "/merchants/invoicing_profile") {
      return { id: "invoice_1", nit: "123456", razonSocial: "Lista SRL", sucursal: 0, puntoVenta: 0, cuis: "CUIS-1" };
    }
    if (path === "/stores/store_1/payment_links") {
      return [{
        id: "product_1", name: "Café", amount: 2500, currency: "BOB", status: "ACTIVE", stock: 20,
        imageUrls: ["/uploads/cafe.webp"], imagePositions: ["50% 50%"], tags: [], variants: [], categoryId: null,
        codigoProducto: "CAFE-1", actividadEconomica: "56101", codigoProductoSin: "99100", unidadMedida: 58,
      }];
    }
    return undefined;
  });

  await expect(page.locator("#assistantSetupPercent")).toHaveText("100%");
  await expect(page.locator("#assistantSetupTrack")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator("#assistantSetupList .is-complete")).toHaveCount(7);

  await page.locator("#assistantAgentTab").click();
  await page.locator("#assistantChatInput").fill("¿Cómo funciona el CUFD y la facturación digital?");
  await page.locator("#assistantChatForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#assistantChatLog")).toContainText("CUFD se genera o renueva al emitir facturas");
});

test("Yapi reports low stock, saves notes, and stays anchored to the page", async ({ page }) => {
  const sparseStore = { ...store("store_1", "Tienda breve"), logoUrl: "/uploads/logo.webp" };
  await openDashboard(page, [sparseStore], ({ path }) => {
    if (path === "/stores/store_1/payment_links") {
      return [{
        id: "low_1", name: "Matcha", amount: 2500, currency: "BOB", status: "ACTIVE", stock: 3,
        imageUrls: ["/uploads/matcha.webp"], imagePositions: ["50% 50%"], tags: [], variants: [], categoryId: null,
      }];
    }
    return undefined;
  });

  await expect(page.locator("#assistantAlerts")).toContainText("Matcha: 3 disponibles");
  await expect(page.locator("#assistantAlerts")).toContainText("6 imágenes recomendadas");
  await expect(page.locator("#assistantNotificationBadge")).toHaveText("2");

  await page.locator("#assistantNotesTab").click();
  await page.locator("#assistantNoteInput").fill("Reponer matcha el viernes");
  await page.locator("#assistantNoteForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#assistantNoteList")).toContainText("Reponer matcha el viernes");

  await page.locator("#assistantClose").click();
  const beforeTop = await page.locator("#assistantDock").evaluate((element) => element.getBoundingClientRect().top);
  await page.evaluate(() => window.scrollTo(0, 500));
  const afterTop = await page.locator("#assistantDock").evaluate((element) => element.getBoundingClientRect().top);
  expect(afterTop).toBeLessThan(beforeTop - 300);

  await page.evaluate(() => {
    const dock = document.getElementById("assistantDock");
    dock.style.top = `${window.scrollY + 80}px`;
  });
  const scrollBeforeHide = await page.evaluate(() => window.scrollY);
  await page.locator("#assistantHide").evaluate((button) => button.click());
  await expect(page.locator("#assistantDock")).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeHide);
});

test("merchant uploads and saves a promotion image", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/uploads") return { url: "/v1/uploads/promotion.webp" };
    return undefined;
  });
  const messageSection = page.locator(".store-message-editor");
  const toggle = messageSection.locator(".editor-section-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#storePromotionEnabled").check();
  await page.locator("#storePromotionImageInput").setInputFiles({
    name: "promocion.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("imagen-promocional"),
  });
  await expect(page.locator("#storePromotionImagePreview")).toHaveAttribute("src", /promotion\.webp/);
  await page.locator("#storePromotionTitle").fill("Solo por esta semana");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(write.body).toMatchObject({
    promotionEnabled: true,
    promotionImageUrl: "/v1/uploads/promotion.webp",
    promotionTitle: "Solo por esta semana",
  });
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
  const framingBounds = await page.locator("#paymentLinkImagesPreview .gallery-thumb").boundingBox();
  await page.locator("#paymentLinkImagesPreview .gallery-thumb").dispatchEvent("click", {
    clientX: framingBounds.x + framingBounds.width * 0.8,
    clientY: framingBounds.y + framingBounds.height * 0.3,
  });
  await expect(page.locator("#paymentLinkImagesPreview img")).toHaveCSS("object-position", "80% 30%");
  await form.evaluate((element) => element.requestSubmit());
  await expect(page.locator("#info")).toContainText("creado");

  expect(requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST")?.body).toMatchObject({
    imageUrls: ["/v1/uploads/product-focus.jpg"],
    imagePositions: ["80% 30%"],
  });
});

test("merchant can add and reorder multiple product photos", async ({ page }) => {
  let uploadIndex = 0;
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path, request }) => {
    if (path === "/uploads") return { url: `/v1/uploads/product-${++uploadIndex}.jpg` };
    if (path === "/stores/store_1/payment_links" && request.method() === "POST") {
      return { id: "product_gallery", storeId: "store_1", status: "ACTIVE", currency: "BOB", variants: [], ...request.postDataJSON() };
    }
    return undefined;
  });
  await page.locator('[data-dashboard-view="products"]').click();
  const form = page.locator("#paymentLinkForm");
  if (!(await form.isVisible())) await page.locator("#paymentLinksSection .section-toggle").click();
  await form.locator('[name="name"]').fill("Galería móvil");
  await form.locator('[name="amount"]').fill("60");
  await page.locator("#paymentLinkImages").setInputFiles([
    { name: "frente.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto-frente") },
    { name: "detalle.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto-detalle") },
  ]);
  await expect(page.locator("#paymentLinkImagesPreview .gallery-frame-editor")).toHaveCount(2);
  await page.locator('.gallery-frame-editor[data-index="0"] .gallery-move-right').click();
  await form.evaluate((element) => element.requestSubmit());
  await expect(page.locator("#info")).toContainText("creado");

  expect(requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST")?.body.imageUrls).toEqual([
    "/v1/uploads/product-2.jpg",
    "/v1/uploads/product-1.jpg",
  ]);
});

test("merchant can save a zero-priced product and grouped free extras", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path, request }) => {
    if (path === "/stores/store_1/payment_links" && request.method() === "POST") {
      return { id: "product_extras", storeId: "store_1", status: "ACTIVE", currency: "BOB", variants: [], ...request.postDataJSON() };
    }
    return undefined;
  });
  await page.locator('[data-dashboard-view="products"]').click();
  const form = page.locator("#paymentLinkForm");
  if (!(await form.isVisible())) await page.locator("#paymentLinksSection .section-toggle").click();
  await form.locator('[name="name"]').fill("Pizza");
  await form.locator('[name="amount"]').fill("0");
  await page.locator("#paymentLinkExtraAdd").click();
  await page.locator(".extra-name").fill("Queso extra");
  await page.locator(".extra-amount").fill("5.50");
  await page.locator(".extra-required").check();
  await page.locator(".product-extra-advanced summary").click();
  await page.locator(".extra-group-name").fill("Guarniciones");
  await page.locator(".extra-free-allowance").fill("2");
  await page.locator(".extra-inventory-name").fill("Queso cottage");
  await page.locator(".extra-stock").fill("24");
  await form.evaluate((element) => element.requestSubmit());
  await expect(page.locator("#info")).toContainText("creado");

  const productWrite = requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST")?.body;
  expect(productWrite.amount).toBe(0);
  expect(productWrite.extras).toEqual([
    { name: "Queso extra", amount: 550, required: true, groupName: "Guarniciones", freeAllowance: 2, inventoryName: "Queso cottage", stock: 24 },
  ]);
});

test("AI setup sends the chosen WhatsApp mode and uploaded inspiration photos", async ({ page }) => {
  let uploadNumber = 0;
  let finishGeneration;
  const generationGate = new Promise((resolve) => { finishGeneration = resolve; });
  const requests = await openDashboard(page, [store("store_1", "Primera")], async ({ path }) => {
    if (path === "/uploads") return { url: `/v1/uploads/ai-${++uploadNumber}.jpg` };
    if (path === "/stores/store_1/visual-proposals") {
      await generationGate;
      return {
        mode: "ai",
        proposals: [1, 2, 3].map((number) => ({
          id: `proposal_${number}`,
          title: `Propuesta ${number}`,
          rationale: "Dirección visual de prueba",
          status: "READY",
          provider: "openai:test",
          sourceAssetUrls: ["/v1/uploads/ai-1.jpg"],
          config: { checkoutMode: "whatsapp", cartButtonLabel: "Pedir por WhatsApp", experienceStyle: ["coverflow", "diagonal-marquee", "story-scroller"][number - 1] },
        })),
      };
    }
    return undefined;
  });

  const assistantToggle = page.locator("#visualAssistantToggle");
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await assistantToggle.click();
  await expect(page.locator(".font-choice")).toHaveCount(4);
  await expect(page.locator(".font-preview-editorial small")).toHaveCSS("font-family", /Georgia/);
  await page.locator('input[name="visualFontStyle"][value="editorial"]').check();
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
  const generationLoader = page.locator("#visualGenerationLoader");
  await expect(generationLoader).toBeVisible();
  await expect(generationLoader).toHaveAttribute("data-phase", "composing");
  await expect(page.locator("#visualLoaderTitle")).toHaveText("Creando tres direcciones completas");
  await expect(page.locator("[data-loader-card]")).toHaveCount(4);
  await expect(page.locator("body")).toHaveClass(/is-generating-visual/);
  finishGeneration();
  await expect(generationLoader).toHaveAttribute("data-phase", "finishing");
  await expect(page.locator("#visualLoaderTitle")).toHaveText("Afinando los últimos detalles");
  await expect(page.locator("#visualProposals .visual-proposal")).toHaveCount(3);
  await expect(page.locator("#visualProposals")).toContainText("Coverflow 3D");
  await expect(page.locator("#visualProposals")).toContainText("Galería diagonal");
  await expect(page.locator("#visualProposals")).toContainText("Relato interactivo");
  await expect(generationLoader).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/is-generating-visual/);

  const generation = requests.find((request) => request.path === "/stores/store_1/visual-proposals");
  expect(generation?.body).toMatchObject({
    fontStyle: "editorial",
    checkoutMode: "whatsapp",
    whatsappPhone: "+591 71234567",
    assetUrls: ["/v1/uploads/ai-1.jpg"],
  });
});

test("AI proposals preview in a new tab without applying and only the latest applied proposal stays in use", async ({ page }) => {
  const proposals = [
    { id: "proposal_1", title: "Primera", rationale: "Dirección uno", status: "APPLIED", appliedAt: "2026-08-13T10:00:00.000Z", config: { accentColor: "#123456", tagline: "Primera dirección", motionDuoEnabled: true } },
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
  expect(previewPatch.motionDuoEnabled).toBe(true);
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).toContainText("Story Scroll");
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).toContainText("Zoom Parallax");
  expect(opened).toMatchObject({ target: "_blank", features: "noopener,noreferrer" });
  await expect(page.locator("#visualProposalStatus")).toContainText("No aplicamos cambios");
});
