import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
  websiteRevision: 0,
  websitePublishedRevision: 0,
  websiteDraft: null,
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "clarity-marquee",
  motionExperiences: ["clarity-marquee"],
  animations: [],
  editorialGallery: [],
  links: [],
  customDomains: [],
  checkoutMode: "payment",
  contactPhone: null,
  contactEmail: null,
  contactFormEnabled: false,
  contactFormEmail: null,
  locationMapUrl: null,
  locationDescription: null,
  locationHighlight: null,
  locations: [],
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
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({
      path,
      method: request.method(),
      body: contentType.includes("application/json") ? request.postDataJSON() : undefined,
    });
    const customBody = await responseForRequest?.({ path, request });
    const customHttpStatus = customBody?.__httpStatus;
    const status = Number.isInteger(customHttpStatus) ? customHttpStatus : 200;
    let body = Number.isInteger(customHttpStatus) ? customBody.body ?? {} : customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-settings");
  await expect(page.locator("#storeNameInput")).toHaveValue(stores[0].name);
  await expect(page.locator("#onboardingDialog")).toHaveCount(0);
  return requests;
}

async function navigateDashboard(page, view) {
  const sidebar = page.locator(".dashboard-sidebar");
  // On desktop the sidebar is docked and the menu handle is hidden; only the
  // fullscreen storefront and narrow screens tuck the navigation behind it.
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await sidebar.evaluate((element) => element.classList.contains("is-store-nav-pinned")))) {
    await handle.click();
  }
  await page.locator(`.dashboard-nav-button[data-dashboard-view="${view}"]`).click();
}

async function prepareInventoryImport(page, responseForRequest) {
  const requests = await openDashboard(page, [store("store_1", "Primera")], async (args) => {
    if (args.path === "/stores/store_1/payment_links/import/normalize") {
      return {
        warnings: [],
        products: [{
          sourceRow: 2,
          name: "Silpancho",
          codigoProducto: "COM-001",
          amount: 4550,
          currency: "BOB",
          categoryName: "Comida",
          stock: null,
          description: null,
          tags: [],
          imageNames: ["silpancho.png"],
          variants: [],
          color: null,
          errors: [],
        }],
      };
    }
    return responseForRequest?.(args);
  });
  await navigateDashboard(page, "products");
  const importDisclosure = page.locator("#catalogImportDisclosure");
  if (!(await importDisclosure.evaluate((details) => details.open))) await importDisclosure.locator(":scope > summary").click();
  const importerToggle = page.locator("#inventoryImporterToggle");
  if (await importerToggle.getAttribute("aria-expanded") !== "true") await importerToggle.click();
  await page.locator("#inventoryCsvInput").setInputFiles({
    name: "productos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku;nombre;precio;categoria;imagenes\nCOM-001;Silpancho;45,50;Comida;silpancho.png"),
  });
  await page.locator("#inventoryImagesInput").setInputFiles({
    name: "silpancho.png",
    mimeType: "image/png",
    buffer: Buffer.from("imagen-de-prueba"),
  });
  await page.locator("#inventoryPrepare").click();
  await expect(page.locator("#inventoryImportStatus")).toHaveText("Archivo adaptado por IA y listo para revisar.");
  return requests;
}

test("inventory review explains a lost API connection and retries with the same selected files", async ({ page }) => {
  const requests = await prepareInventoryImport(page);
  const endpoint = "http://localhost:3001/v1/stores/store_1/payment_links/import/normalize";
  await page.route(endpoint, route => route.abort("connectionrefused"));
  await page.locator("#inventoryPrepare").click();
  await expect(page.locator("#inventoryImportStatus")).toContainText("No se pudo conectar con el servidor de pagosYa");
  await expect(page.locator("#inventoryImportStatus")).toContainText("El CSV y las fotos siguen seleccionados");
  await expect(page.locator("#inventoryImportStatus")).not.toContainText("Failed to fetch");
  await expect(page.locator("#inventoryPrepare")).toBeEnabled();
  expect(await page.locator("#inventoryCsvInput").evaluate(input => input.files[0]?.name)).toBe("productos.csv");
  expect(await page.locator("#inventoryImagesInput").evaluate(input => input.files[0]?.name)).toBe("silpancho.png");
  await page.unroute(endpoint);
  await page.locator("#inventoryPrepare").click();
  await expect(page.locator("#inventoryImportStatus")).toHaveText("Archivo adaptado por IA y listo para revisar.");
  expect(requests.some(request => request.path.endsWith("/payment_links/import"))).toBe(false);
});

const successfulInventoryResponse = ({ path }) => {
  if (path === "/stores/store_1/operations/integrations") {
    return [{ id: "integration_1", name: "Caja Café", kind: "CUSTOM_DATABASE", status: "ACTIVE" }];
  }
  if (path === "/uploads") return { url: "/v1/uploads/silpancho.png" };
  if (path === "/stores/store_1/payment_links/import") {
    return {
      categoriesCreated: [{ id: "category_food", name: "Comida" }],
      mappingsCreated: 1,
      products: [{
        id: "product_1",
        name: "Silpancho",
        codigoProducto: "COM-001",
        amount: 4550,
        currency: "BOB",
        status: "ACTIVE",
        categoryId: "category_food",
        imageUrls: ["/v1/uploads/silpancho.png"],
        tags: [],
        variants: [],
        stock: null,
      }],
    };
  }
  return undefined;
};

test("merchant connects and verifies a custom storefront domain", async ({ page }) => {
  const merchantStore = store("store_1", "Tienda propia");
  let domains = [];
  let verificationAttempts = 0;
  const pendingDomain = {
    id: "domain_1",
    hostname: "www.mitienda.bo",
    status: "PENDING",
    verifiedAt: null,
    url: "https://www.mitienda.bo",
    dns: {
      verification: { type: "TXT", name: "_pagosya.www.mitienda.bo", value: "pagosya-site-verification=token_1" },
      routing: { type: "CNAME", name: "www.mitienda.bo", value: "stores.pagosya.bo" },
    },
  };
  const requests = await openDashboard(page, [merchantStore], ({ path, request }) => {
    if (path === "/stores/store_1/domains" && request.method() === "GET") return domains;
    if (path === "/stores/store_1/domains" && request.method() === "POST") {
      domains = [pendingDomain];
      return pendingDomain;
    }
    if (path === "/stores/store_1/domains/domain_1/verify") {
      verificationAttempts += 1;
      domains = [{
        ...pendingDomain,
        status: verificationAttempts === 1 ? "VERIFIED" : "ACTIVE",
        verifiedAt: "2026-08-22T12:00:00.000Z",
      }];
      return domains[0];
    }
    return undefined;
  });

  await page.getByRole("button", { name: "Mostrar dominio propio" }).click();
  await page.locator("#customDomainHostname").fill("www.mitienda.bo");
  await page.locator("#customDomainConnect").click();
  await expect(page.locator("#customDomainList")).toContainText("_pagosya.www.mitienda.bo");
  await expect(page.locator("#customDomainList")).toContainText("stores.pagosya.bo");
  await page.locator(".domain-verify").click();

  await expect(page.locator("#customDomainSummary")).toHaveText("Propiedad verificada");
  await expect(page.locator("#currentStoreLink")).toHaveValue(/\/s\/store_1$/);
  await expect(page.locator(".domain-verify")).toHaveText("Revisar enrutamiento");
  await page.locator(".domain-verify").click();

  await expect(page.locator("#customDomainSummary")).toHaveText("1 activo");
  await expect(page.locator("#currentStoreLink")).toHaveValue("https://www.mitienda.bo");
  expect(requests).toContainEqual(expect.objectContaining({
    path: "/stores/store_1/domains",
    method: "POST",
    body: { hostname: "www.mitienda.bo" },
  }));
  expect(requests).toContainEqual(expect.objectContaining({
    path: "/stores/store_1/domains/domain_1/verify",
    method: "POST",
  }));
});

test("company creates a carnet debt link from the Link de cobro section", async ({ page }) => {
  let created = false;
  const debtLink = {
    id: "debt_link_1",
    slug: "agosto2026",
    portalSlug: "portal-colegio",
    name: "Mensualidades de agosto",
    notificationEmail: "cobranzas@gmail.com",
    status: "ACTIVE",
    debts: [
      { id: "debt_1", customerName: "María Quispe", customerDocument: "7.845-123", reference: "AGO-001", status: "PAID", amount: 12550 },
      { id: "debt_2", customerName: "Juan Pérez", customerDocument: "6192044", reference: "AGO-002", status: "PENDING", amount: 8000 },
    ],
  };
  const requests = await openDashboard(page, [store("store_1", "Colegio Demo")], ({ path, request }) => {
    if (path === "/stores/store_1/debt-collection-links" && request.method() === "POST") {
      created = true;
      return debtLink;
    }
    if (path === "/stores/store_1/debt-collection-links/debt_link_1/debts" && request.method() === "POST") {
      const incoming = request.postDataJSON().debts;
      debtLink.debts.push(...incoming.map((debt, index) => ({
        id: `debt_added_${index}`,
        ...debt,
        status: "PENDING",
      })));
      return { added: incoming.length };
    }
    if (path === "/stores/store_1/debt-collection-links") return created ? [debtLink] : [];
  });

  await navigateDashboard(page, "stores");
  await expect(page.locator("#debtCollectionSection")).toBeHidden();
  await navigateDashboard(page, "charge-links");
  await expect(page.locator("#debtCollectionSection")).toBeVisible();
  if (process.env.CAPTURE_CHARGE_LINKS) {
    await expect(page.locator("#dashboardEntryLoader")).toHaveCount(0);
    await page.screenshot({ path: "../../.impeccable/charge-links-desktop.png", fullPage: false });
  }
  await page.locator("#debtCollectionName").fill("Mensualidades de agosto");
  await page.locator("#debtNotificationEmail").fill("cobranzas@gmail.com");
  await page.locator("#debtCollectionRows").fill([
    "7.845-123; María Quispe; 125,50; Mensualidad; AGO-001; maria@gmail.com",
    "6192044; Juan Pérez; 80; Cuota pendiente; AGO-002",
  ].join("\n"));
  await page.locator("#debtCollectionSubmit").click();

  await expect(page.locator("#debtCollectionStatus")).toContainText("2 deudas");
  await expect(page.getByRole("heading", { name: "Portal único de cobros" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir portal" })).toHaveAttribute("href", /\?debt=portal-colegio$/);
  await expect(page.locator(".copy-debt-portal")).toHaveCount(1);
  await expect(page.locator(".debt-collection-row").getByRole("link", { name: "Abrir" })).toHaveCount(0);
  await expect(page.locator("#debtCollectionList")).toContainText("80.00 BOB");
  const payerToggle = page.getByRole("button", { name: "Estado de las personas 1 de 2 pagaron" });
  await expect(payerToggle).toHaveAttribute("aria-expanded", "false");
  await payerToggle.click();
  await expect(payerToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".debt-payer-row.is-paid")).toContainText("María Quispe");
  await expect(page.locator(".debt-payer-row.is-paid .debt-payer-state")).toContainText("Pagó");
  await expect(page.locator(".debt-payer-row:not(.is-paid)")).toContainText("Juan Pérez");
  const payerSearch = page.getByRole("searchbox", { name: "Buscar en Mensualidades de agosto" });
  await payerSearch.fill("7845123");
  await expect(page.locator(".debt-payer-results")).toHaveText("1 persona");
  await expect(page.locator(".debt-payer-row.is-paid")).toBeVisible();
  await expect(page.locator(".debt-payer-row:not(.is-paid)")).toBeHidden();
  await expect(page.getByRole("button", { name: "Descargar PDF" })).toBeVisible();
  const createRequest = requests.find((entry) => entry.path === "/stores/store_1/debt-collection-links" && entry.method === "POST");
  expect(createRequest.body).toMatchObject({
    name: "Mensualidades de agosto",
    notificationEmail: "cobranzas@gmail.com",
    debts: [
      { customerDocument: "7845123", amount: 12550 },
      { customerDocument: "6192044", amount: 8000 },
    ],
  });

  await page.locator(".add-debts-to-collection").click();
  await expect(page.locator("#debtAppendContext")).toBeVisible();
  await expect(page.locator("#debtAppendTargetName")).toContainText("Mensualidades de agosto");
  await expect(page.locator(".debt-collection-metadata-field").first()).toBeHidden();
  await page.locator("#debtCollectionRows").fill("9900112; Lucía Flores; 95; Mensualidad; SEP-003; lucia@gmail.com; 71122334");
  await page.locator("#debtCollectionSubmit").click();

  await expect(page.locator("#debtCollectionStatus")).toContainText("1 deuda agregada");
  await expect(page.locator("#debtCollectionList")).toContainText("3 deudas");
  const appendRequest = requests.find((entry) => entry.path === "/stores/store_1/debt-collection-links/debt_link_1/debts" && entry.method === "POST");
  expect(appendRequest.body).toEqual({
    debts: [expect.objectContaining({ customerDocument: "9900112", customerName: "Lucía Flores", amount: 9500, reference: "SEP-003" })],
  });
});

test("company can create a carnet debt link from CSV instead of pasted rows", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Colegio Demo")], ({ path, request }) => {
    if (path === "/stores/store_1/debt-collection-links/import/normalize") {
      return {
        warnings: [],
        debts: [
          { customerDocument: "7845123", customerName: "María Quispe", amount: 12550, customerEmail: "maria@gmail.com", customerPhone: "71234567" },
          { customerDocument: "6192044", customerName: "Juan Pérez", amount: 8000 },
        ],
      };
    }
    if (path === "/stores/store_1/debt-collection-links" && request.method() === "POST") {
      return { id: "debt_csv", slug: "csv2026", name: "Cuotas CSV", status: "ACTIVE", debts: [] };
    }
  });

  await navigateDashboard(page, "charge-links");
  await page.locator('input[name="debtInputMode"][value="csv"]').check();
  await expect(page.locator("#debtCsvPanel")).toBeVisible();
  await expect(page.locator("#debtManualPanel")).toBeHidden();
  await page.locator("#debtCollectionName").fill("Cuotas CSV");
  await page.locator("#debtNotificationEmail").fill("cobranzas@gmail.com");
  await page.locator("#debtCsvInput").setInputFiles({
    name: "deudas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Estudiante;Saldo Bs;Identificación;Concepto;Código;Contacto",
      'María Quispe;125,50;7.845-123;Mensualidad;AGO-001;maria@gmail.com',
      'Juan Pérez;80;6192044;Cuota pendiente;AGO-002;',
    ].join("\n")),
  });
  await expect(page.locator("#debtCsvStatus")).toContainText("2 deudas adaptadas con IA");
  await page.locator("#debtCollectionSubmit").click();

  await expect(page.locator("#debtCollectionStatus")).toContainText("2 deudas");
  const createRequest = requests.find((entry) => entry.path === "/stores/store_1/debt-collection-links" && entry.method === "POST");
  expect(createRequest.body.debts).toEqual([
    { customerDocument: "7845123", customerName: "María Quispe", amount: 12550, customerEmail: "maria@gmail.com", customerPhone: "71234567" },
    { customerDocument: "6192044", customerName: "Juan Pérez", amount: 8000 },
  ]);
});

test("long debt collections show ten people per numbered page and paginate search results", async ({ page }) => {
  const longCollection = {
    id: "debt_long",
    slug: "long2026",
    portalSlug: "portal-long",
    name: "Mensualidades anuales",
    notificationEmail: "cobranzas@gmail.com",
    status: "ACTIVE",
    debts: Array.from({ length: 23 }, (_, index) => ({
      id: `debt_${index + 1}`,
      customerName: `Persona ${String(index + 1).padStart(2, "0")}`,
      customerDocument: String(8000000 + index),
      reference: `REF-${String(index + 1).padStart(2, "0")}`,
      status: "PENDING",
      amount: 1000 + index,
    })),
  };
  await openDashboard(page, [store("store_1", "Colegio Demo")], ({ path }) => {
    if (path === "/stores/store_1/debt-collection-links") return [longCollection];
  });

  await navigateDashboard(page, "charge-links");
  await page.getByRole("button", { name: "Estado de las personas 0 de 23 pagaron" }).click();
  const rows = page.locator(".debt-payer-row");
  await expect(rows.filter({ visible: true })).toHaveCount(10);
  await expect(page.locator(".debt-page-summary")).toHaveText("1–10 de 23");
  await expect(page.getByRole("button", { name: "Página 1", exact: true })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Página 2", exact: true }).click();
  await expect(rows.filter({ visible: true })).toHaveCount(10);
  await expect(page.locator(".debt-page-summary")).toHaveText("11–20 de 23");
  await expect(rows.filter({ visible: true }).first()).toContainText("Persona 11");

  await page.getByRole("button", { name: "Página 3", exact: true }).click();
  await expect(rows.filter({ visible: true })).toHaveCount(3);
  await expect(page.locator(".debt-page-summary")).toHaveText("21–23 de 23");

  await page.getByRole("searchbox", { name: "Buscar en Mensualidades anuales" }).fill("Persona 23");
  await expect(rows.filter({ visible: true })).toHaveCount(1);
  await expect(rows.filter({ visible: true })).toContainText("Persona 23");
  await expect(page.locator(".debt-payer-pagination")).toBeHidden();
  await expect(page.locator(".debt-payer-results")).toHaveText("1 persona");
});

test("active and archived debt payment links paginate independently", async ({ page }) => {
  const collection = (index, status) => ({
    id: `${status.toLowerCase()}_collection_${index}`,
    slug: `${status.toLowerCase()}-${index}`,
    portalSlug: "portal-paginado",
    name: `${status === "ACTIVE" ? "Cobro activo" : "Cobro archivado"} ${String(index).padStart(2, "0")}`,
    notificationEmail: "cobranzas@gmail.com",
    status,
    debts: [],
  });
  let collections = [
    ...Array.from({ length: 23 }, (_, index) => collection(index + 1, "ACTIVE")),
    ...Array.from({ length: 13 }, (_, index) => collection(index + 1, "ARCHIVED")),
  ];
  await openDashboard(page, [store("store_1", "Colegio Demo")], ({ path, request }) => {
    const restoreMatch = path.match(/^\/stores\/store_1\/debt-collection-links\/(.+)\/restore$/);
    if (restoreMatch && request.method() === "POST") {
      const restored = { ...collections.find((item) => item.id === restoreMatch[1]), status: "ACTIVE" };
      collections = collections.map((item) => item.id === restored.id ? restored : item);
      return restored;
    }
    if (path === "/stores/store_1/debt-collection-links") return collections;
  });

  await navigateDashboard(page, "charge-links");
  const active = page.locator('[data-debt-link-status="ACTIVE"]');
  const archived = page.locator('[data-debt-link-status="ARCHIVED"]');
  await expect(active.locator(".debt-collection-row")).toHaveCount(4);
  await expect(archived.locator(".debt-collection-row")).toHaveCount(4);
  await expect(active.locator(".debt-link-page-summary")).toHaveText("1–4 de 23");
  await expect(archived.locator(".debt-link-page-summary")).toHaveText("1–4 de 13");

  await active.getByRole("button", { name: "Página 2 de en el portal", exact: true }).click();
  await expect(active.locator(".debt-link-page-summary")).toHaveText("5–8 de 23");
  await expect(active.locator(".debt-collection-row").first()).toContainText("Cobro activo 05");
  await expect(archived.locator(".debt-link-page-summary")).toHaveText("1–4 de 13");

  await page.getByRole("tab", { name: /Archivados/ }).click();
  await archived.getByRole("button", { name: "Página 2 de archivados", exact: true }).click();
  await expect(archived.locator(".debt-link-page-summary")).toHaveText("5–8 de 13");
  await expect(archived.locator(".debt-collection-row")).toHaveCount(4);
  await expect(active.locator(".debt-link-page-summary")).toHaveText("5–8 de 23");

  await archived.getByRole("button", { name: "Restaurar link" }).first().click();
  await expect(page.locator("#info")).toContainText("restaurado");
  await expect(active.locator(".debt-link-group-count")).toHaveText("24 links");
  await expect(archived.locator(".debt-link-group-count")).toHaveText("12 links");
});

test("cashier creates a personalized QR payment from the Link de cobro section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await openDashboard(page, [store("store_1", "Burgeria")], ({ path, request }) => {
    if (path === "/stores/store_1/quick-qr-payments" && request.method() === "POST") {
      return {
        paymentIntentId: "pi_quick",
        status: "SUCCEEDED",
        amount: 4550,
        currency: "BOB",
        description: "Mesa 4",
        qrImageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      };
    }
  });

  await navigateDashboard(page, "charge-links");
  if (process.env.CAPTURE_CHARGE_LINKS) {
    await expect(page.locator("#dashboardEntryLoader")).toHaveCount(0);
    await page.screenshot({ path: "../../.impeccable/charge-links-mobile.png", fullPage: false });
  }
  await page.locator("#quickPaymentAmount").fill("45.50");
  await page.locator("#quickPaymentDescription").fill("Mesa 4");
  await page.locator("#quickPaymentSubmit").click();

  await expect(page.locator("#quickPaymentResult")).toBeVisible();
  await expect(page.locator("#quickPaymentResultAmount")).toHaveText("45.50 BOB");
  await expect(page.locator("#quickPaymentResultStatus")).toContainText("Pago recibido");
  await expect(page.locator("#quickPaymentQr")).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const request = requests.find((entry) => entry.path === "/stores/store_1/quick-qr-payments" && entry.method === "POST");
  expect(request.body).toEqual({ amount: 4550, description: "Mesa 4" });
});

test("merchant can mark an active product as sold out from the catalog", async ({ page }) => {
  let product = {
    id: "product_1",
    storeId: "store_1",
    name: "Pan brioche",
    description: "Suave y ligeramente dulce.",
    amount: 2800,
    currency: "BOB",
    status: "ACTIVE",
    categoryId: null,
    imageUrls: [],
    imagePositions: [],
    tags: [],
    variants: [],
    extras: [],
    stock: 7,
    color: null,
    soldCount: 0,
  };
  const requests = await openDashboard(page, [store("store_1", "Cafece")], ({ path, request }) => {
    if (path === "/stores/store_1/payment_links" && request.method() === "GET") return [product];
    if (path === "/stores/store_1/payment_links/product_1" && request.method() === "PATCH") {
      product = { ...product, ...request.postDataJSON() };
      return product;
    }
    return undefined;
  });

  await navigateDashboard(page, "products");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Marcar agotado" }).click();

  await expect(page.locator("#info")).toContainText('Producto "Pan brioche" marcado como agotado.');
  await expect(page.locator('[data-payment-link-id="product_1"] .badge.SOLD_OUT')).toHaveText("Agotado");
  await expect(page.getByRole("button", { name: "Marcar agotado" })).toHaveCount(0);
  const write = requests.find((entry) => entry.path === "/stores/store_1/payment_links/product_1" && entry.method === "PATCH");
  expect(write.body).toEqual({ stock: 0 });
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

  await navigateDashboard(page, "payments");
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
  await navigateDashboard(page, "payments");

  await expect(page.locator("#orderSearch")).toBeVisible();
  await expect(page.locator("#downloadOrdersCsv")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".table-scroll")).toHaveCSS("overflow-x", "auto");
});

test("merchant creates and disables a shareable promo code", async ({ page }) => {
  let codes = [];
  const requests = await openDashboard(page, [store("store_1", "Café Norte")], ({ path, request }) => {
    if (path === "/stores/store_1/promo-codes" && request.method() === "GET") return codes;
    if (path === "/stores/store_1/promo-codes" && request.method() === "POST") {
      const body = request.postDataJSON();
      const created = { id: "promo_1", ...body, code: body.code, isActive: true, createdAt: "2026-08-22T12:00:00.000Z" };
      codes = [created];
      return created;
    }
    if (path === "/stores/store_1/promo-codes/promo_1" && request.method() === "PATCH") {
      codes = [{ ...codes[0], isActive: request.postDataJSON().isActive }];
      return codes[0];
    }
    return undefined;
  });
  await navigateDashboard(page, "marketing");
  await page.locator('[data-marketing-tab="promotions"]').click();
  await page.locator("#promoCodeInput").fill("verano20");
  await page.locator("#promoCodeValue").fill("20");
  await page.locator("#promoCodeSubmit").click();

  await expect(page.locator("#promoCodeList")).toContainText("VERANO20");
  await expect(page.locator("#promoCodeList")).toContainText("20% de descuento");
  await page.getByRole("button", { name: "Desactivar" }).click();
  await expect(page.locator("#promoCodeList")).toContainText("Desactivado");
  expect(requests).toContainEqual(expect.objectContaining({
    path: "/stores/store_1/promo-codes",
    method: "POST",
    body: { code: "VERANO20", discountType: "PERCENT", discountValue: 20 },
  }));
});

test("finance dashboard shows monthly projection and strongest sales weekday", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Cafetería")], ({ path }) => {
    if (path === "/merchants/finances") {
      return {
        totalRevenue: 180000,
        paymentCount: 9,
        unattributedRevenue: 0,
        unattributedPaymentCount: 0,
        inventoryValue: 50000,
        totalStoreViews: 120,
        topProducts: [],
        revenueByPaymentMethod: [],
        monthlyProjection: { monthToDateRevenue: 120000, projectedRevenue: 300000, elapsedDays: 12, daysInMonth: 31 },
        salesByWeekday: [
          { weekday: 1, name: "Lunes", amount: 25000, paymentCount: 2 },
          { weekday: 2, name: "Martes", amount: 64000, paymentCount: 5 },
          { weekday: 3, name: "Miércoles", amount: 0, paymentCount: 0 },
          { weekday: 4, name: "Jueves", amount: 12000, paymentCount: 1 },
          { weekday: 5, name: "Viernes", amount: 9000, paymentCount: 1 },
          { weekday: 6, name: "Sábado", amount: 0, paymentCount: 0 },
          { weekday: 0, name: "Domingo", amount: 0, paymentCount: 0 },
        ],
        bestSalesDay: { weekday: 2, name: "Martes", amount: 64000, paymentCount: 5 },
        currency: "BOB",
      };
    }
    return undefined;
  });

  await expect(page.locator("#financeProjectedRevenue")).toHaveText("3000.00 BOB");
  await expect(page.locator("#financeMonthToDateRevenue")).toHaveText("Acumulado: 1200.00 BOB");
  await expect(page.locator("#financeProjectionTrack")).toHaveAttribute("aria-valuenow", "40");
  await expect(page.locator("#financeBestDay")).toHaveText("Martes · 5 ventas");
  await expect(page.locator("#financeWeekdayBars .finance-weekday")).toHaveCount(7);
  await expect(page.locator("#financeWeekdayBars .finance-weekday.is-best strong")).toHaveText("Mar");
});

test("merchant explores the horizontal world with rewards and selectable characters", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Cafetería")], ({ path }) => {
    if (path === "/merchants/finances") {
      return {
        totalRevenue: 180000,
        paymentCount: 9,
        unattributedRevenue: 0,
        unattributedPaymentCount: 0,
        inventoryValue: 50000,
        totalStoreViews: 120,
        topProducts: [],
        revenueByPaymentMethod: [],
        monthlyProjection: {},
        salesByWeekday: [],
        currency: "BOB",
      };
    }
    return undefined;
  });

  await navigateDashboard(page, "progress");
  await expect(page.locator("#gamificationXpTotal")).toHaveText("690 XP");
  await expect(page.locator("#gamificationLevelTitle")).toHaveText("Suricata");
  await expect(page.locator("#gamificationStars .is-earned")).toHaveCount(3);
  await expect(page.locator("#adventureLevelNodes [data-world-stage-index]")).toHaveCount(16);
  await expect(page.locator("#adventureLevelNodes .is-completed")).toHaveCount(4);
  await expect(page.locator("#adventureLevelNodes .is-current")).toHaveCount(1);
  await expect(page.locator("#adventureLevelNodes .is-earned")).toHaveCount(3);
  await expect(page.locator("#adventureLevelNodes .is-locked")).toHaveCount(8);
  await expect(page.locator("#adventureCurrentLevel")).toHaveText("Nivel 4 · Suri");
  await expect(page.locator("#gamificationRunnerPicker [data-journey-companion]")).toHaveCount(4);
  await expect(page.locator("#adventurePlayerFace img")).toHaveAttribute("src", "/assets/profile-4.png");
  await expect.poll(() => page.locator("#adventurePlayerFace img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect.poll(() => page.locator("#adventureLevelNodes .is-current img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator("#journeyRouteProgress")).not.toHaveCSS("stroke-dasharray", "none");
  await expect(page.locator("#adventurePlayer")).not.toHaveCSS("transform", "none");
  const initialWorldScroll = await page.locator("#journeyViewport").evaluate((element) => element.scrollLeft);
  await page.locator('[data-journey-scroll="1"]').click();
  await expect.poll(() => page.locator("#journeyViewport").evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialWorldScroll);
  const worldSizing = await page.locator("#journeyViewport").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(worldSizing.scrollWidth).toBeGreaterThan(worldSizing.clientWidth * 2);
  await page.locator("#journeyViewport").evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
  const finalStageVisible = await page.locator('[data-world-stage-index="15"]').evaluate((node) => {
    const viewport = node.closest("#journeyViewport").getBoundingClientRect();
    const stage = node.getBoundingClientRect();
    return stage.left >= viewport.left && stage.right <= viewport.right;
  });
  expect(finalStageVisible).toBe(true);
  await page.locator("#journeySoundToggle").click();
  await expect(page.locator("#journeySoundToggle")).toHaveAttribute("aria-pressed", "true");
  const sample = await page.evaluate(() => window.getProgressState(575, window.ADVENTURE_LEVELS));
  expect(sample.currentLevel.id).toBe(4);
  expect(sample.completedLevels).toHaveLength(3);
  expect(sample.lockedLevels).toHaveLength(4);
  expect(sample.xpUntilNext).toBe(125);
  expect(await page.locator("#journeyViewport").evaluate((element) => Number.isFinite(element.scrollLeft))).toBe(true);
  await page.locator('[data-journey-companion="1"]').first().click();
  await expect(page.locator("#adventurePlayerFace img")).toHaveAttribute("src", "/assets/profile-2.png");
  await page.evaluate(() => window.renderAnimalAdventure(715, { animate: true, delta: 25, commerce: { sales: 9, visits: 120, dailyLoginStars: 0 } }));
  await expect(page.locator("#adventureCurrentLevel")).toHaveText("Nivel 5 · Pico");
  await expect(page.locator("#adventurePlayerFace img")).toHaveAttribute("src", "/assets/profile-2.png");
  await expect(page.locator("#adventureXpToast")).toContainText("+25 XP");
  await expect(page.locator("#adventureLevelUpTitle")).toHaveText("Nivel 5 — Loro vaquero");
  if (process.env.CAPTURE_ADVENTURE) {
    await page.waitForTimeout(1250);
    await page.evaluate(() => {
      document.getElementById("gamificationToast").hidden = true;
      document.getElementById("adventureXpToast").hidden = true;
      document.getElementById("adventureLevelUp").hidden = true;
    });
    await page.locator("#animalAdventure").screenshot({ path: "../../.impeccable/animal-adventure-desktop.png" });
    await page.locator(".gamification-hero").screenshot({ path: "../../.impeccable/animal-adventure-progress-summary.png" });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mobileMapBounds = await page.locator("#animalAdventure").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: Math.round(rect.left), right: Math.round(rect.right) };
  });
  expect(mobileMapBounds.left).toBeGreaterThanOrEqual(-6);
  expect(mobileMapBounds.right).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.CAPTURE_ADVENTURE) {
    await page.locator("#animalAdventure").screenshot({ path: "../../.impeccable/animal-adventure-mobile.png" });
  }
});

test("a newly earned companion speaks before its server acknowledgement", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Cafetería")], ({ path }) => {
    if (path === "/dashboard/progress-celebrations") {
      return { newlyUnlockedLevels: [3], lastCelebratedLevel: 2, currentLevel: 3 };
    }
    if (path === "/dashboard/progress-celebrations/acknowledge") {
      return { acknowledgedLevel: 3 };
    }
    return undefined;
  });

  await expect(page.locator("#birdUnlockDialog")).toBeVisible();
  await expect(page.locator("#birdUnlockTitle")).toHaveText("¡Suri llegó!");
  await expect(page.locator("#birdUnlockSpeech")).toContainText("Cafetería va muy bien");
  await expect.poll(() => requests.filter((entry) => entry.path === "/dashboard/progress-celebrations/acknowledge").length).toBe(1);
  expect(requests.find((entry) => entry.path === "/dashboard/progress-celebrations")?.body).toEqual({ storeId: "store_1" });
  expect(requests.find((entry) => entry.path === "/dashboard/progress-celebrations/acknowledge")?.body).toEqual({ storeId: "store_1", level: 3 });
});

test("an achievement earned while away unlocks on the next online session", async ({ page }) => {
  let sales = 0;
  await openDashboard(page, [store("store_1", "Cafetería")], ({ path }) => {
    if (path === "/merchants/finances") {
      return {
        totalRevenue: sales * 10000,
        paymentCount: sales,
        unattributedRevenue: 0,
        unattributedPaymentCount: 0,
        inventoryValue: 0,
        totalStoreViews: 0,
        topProducts: [],
        revenueByPaymentMethod: [],
        monthlyProjection: {},
        salesByWeekday: [],
        currency: "BOB",
      };
    }
    return undefined;
  });

  sales = 1;
  await page.reload();
  await expect(page.locator("#gamificationToast")).toBeVisible();
  await expect(page.locator("#gamificationToastTitle")).toHaveText("¡Logro desbloqueado!");
  await expect(page.locator("#gamificationToastMessage")).toContainText("Primera venta");
  await expect(page.locator('[data-achievement-id="first-sale"]')).toHaveClass(/is-unlocking/);
  await page.locator("#gamificationToastClose").click();
  await expect.poll(() => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("first-sale")))).toBe(true);
});

test("daily login awards one star and announces it in the gamification UI", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Cafetería")], ({ path }) => {
    if (path === "/dashboard/daily-login-reward") {
      return { awarded: true, totalStars: 4, awardedAt: "2026-08-20T14:00:00.000Z", nextRewardAt: "2026-08-21T04:00:00.000Z" };
    }
    return undefined;
  });

  await expect(page.locator("#gamificationToast")).toBeVisible();
  await expect(page.locator("#gamificationToastTitle")).toHaveText("¡Ganaste 1 estrella!");
  await expect(page.locator("#gamificationToastMessage")).toContainText("Ya tienes 4 estrellas de constancia");
  await navigateDashboard(page, "progress");
  await expect(page.locator("#gamificationDailyStars")).toHaveText("4 estrellas");
  await expect(page.locator("#gamificationDailySource")).toHaveText("Ganaste 1 hoy · vuelve mañana");
});

test("CSV and picture import reports the committed result as successful", async ({ page }) => {
  const requests = await prepareInventoryImport(page, successfulInventoryResponse);
  expect(requests.find((request) => request.path.endsWith("/payment_links/import/normalize"))?.body).toMatchObject({
    imageFileNames: ["silpancho.png"],
  });
  await page.locator("#inventoryConnection").selectOption("integration_1");
  if (process.env.PAGOSYA_VISUAL_QA === "1") {
    await page.locator("#inventoryImporter").screenshot({ path: "../../.impeccable/inventory-import-sku-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#inventoryImporter").screenshot({ path: "../../.impeccable/inventory-import-sku-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await page.locator("#inventoryCommit").click();

  await expect(page.locator("#inventoryImportStatus")).toHaveText("Importación completada.");
  await expect(page.locator("#onboardingDialog")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "products");
  await expect(page.locator("#info")).toContainText("1 producto importado y 1 categorías nuevas");
  await expect(page.locator("#info")).toContainText("1 SKU conectado");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#paymentLinkRows")).toContainText("Silpancho");
  expect(requests.find((request) => request.path.endsWith("/payment_links/import"))?.body).toMatchObject({
    integrationConnectionId: "integration_1",
    products: [{ name: "Silpancho", codigoProducto: "COM-001", imageUrls: ["/v1/uploads/silpancho.png"] }],
  });
});

test("merchant can drop a headerless TSV and loosely named SKU photo for AI review", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")], ({ path }) => {
    if (path === "/stores/store_1/payment_links/import/normalize") {
      return {
        warnings: [],
        products: [{
          sourceRow: 1,
          name: "Té verde",
          codigoProducto: "TE-01",
          amount: 1250,
          currency: "BOB",
          categoryName: "Bebidas",
          stock: 8,
          description: null,
          tags: [],
          imageNames: [],
          variants: [],
          color: null,
          errors: [],
        }],
      };
    }
    return undefined;
  });
  await navigateDashboard(page, "products");
  const importDisclosure = page.locator("#catalogImportDisclosure");
  if (!(await importDisclosure.evaluate((details) => details.open))) await importDisclosure.locator(":scope > summary").click();
  const importerToggle = page.locator("#inventoryImporterToggle");
  if (await importerToggle.getAttribute("aria-expanded") !== "true") await importerToggle.click();
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["Té verde\t12,50\t8\tTE-01"], "catalogo.tsv", { type: "text/tab-separated-values" }));
    transfer.items.add(new File(["foto"], "TE-01-detalle.webp", { type: "image/webp" }));
    return transfer;
  });
  await page.locator("#inventoryDropzone").dispatchEvent("drop", { dataTransfer });
  await expect(page.locator("#inventoryFileSummary")).toContainText("catalogo.tsv");
  await expect(page.locator("#inventoryFileSummary")).toContainText("1 foto seleccionada");
  await page.locator("#inventoryPrepare").click();
  await expect(page.locator("#inventoryImportStatus")).toHaveText("Archivo adaptado por IA y listo para revisar.");
  await expect(page.locator("#inventoryReviewRows .inventory-photo-count")).toHaveText("1");
  expect(requests.find((request) => request.path.endsWith("/payment_links/import/normalize"))?.body).toMatchObject({
    csv: "Té verde\t12,50\t8\tTE-01",
    imageFileNames: ["TE-01-detalle.webp"],
  });
});

test("active and archived payment links paginate independently in colored groups", async ({ page }) => {
  const paymentLink = (index, status) => ({
    id: `${status.toLowerCase()}_${index}`,
    storeId: "store_1",
    name: `${status === "ACTIVE" ? "Activo" : "Archivado"} ${String(index).padStart(2, "0")}`,
    amount: 2500 + index,
    currency: "BOB",
    status,
    imageUrls: [],
    imagePositions: [],
    tags: [],
    variants: [],
    stock: null,
  });
  let links = [
    ...Array.from({ length: 23 }, (_, index) => paymentLink(index + 1, "ACTIVE")),
    ...Array.from({ length: 13 }, (_, index) => paymentLink(index + 1, "ARCHIVED")),
  ];
  await openDashboard(page, [store("store_1", "Catálogo largo")], ({ path, request }) => {
    const restoreMatch = path.match(/^\/stores\/store_1\/payment_links\/(.+)\/restore$/);
    if (restoreMatch && request.method() === "POST") {
      const restored = { ...links.find((item) => item.id === restoreMatch[1]), status: "ACTIVE" };
      links = links.map((item) => item.id === restored.id ? restored : item);
      return restored;
    }
    if (path === "/stores/store_1/payment_links") return links;
    return undefined;
  });
  await navigateDashboard(page, "products");

  const active = page.locator('[data-payment-link-status="ACTIVE"]');
  const archived = page.locator('[data-payment-link-status="ARCHIVED"]');
  await expect(active).toHaveClass(/is-active/);
  await expect(archived).toHaveClass(/is-archived/);
  await expect(active.locator("tbody tr")).toHaveCount(10);
  await expect(archived.locator("tbody tr")).toHaveCount(10);
  await expect(active.locator(".payment-link-page-summary")).toHaveText("1–10 de 23");
  await expect(archived.locator(".payment-link-page-summary")).toHaveText("1–10 de 13");
  await expect(page.locator("#paymentLinkSearchSummary")).toContainText("los anteriores continúan en las páginas siguientes");

  await page.locator("#paymentLinkSearch").fill("Activo 23");
  await expect(active.locator("tbody tr")).toHaveCount(1);
  await expect(active.locator("tbody tr")).toContainText("Activo 23");
  await expect(active.locator(".payment-link-group-count")).toHaveText("1 de 23 productos");
  await expect(page.locator("#paymentLinkSearchSummary")).toHaveText("1 de 36 productos coinciden con tu búsqueda.");
  await page.locator("#paymentLinkSearchClear").click();
  await expect(active.locator("tbody tr")).toHaveCount(10);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#paymentLinkRows")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await active.getByRole("button", { name: "Página 2 de productos activos", exact: true }).click();
  await expect(active.locator(".payment-link-page-summary")).toHaveText("11–20 de 23");
  await expect(active.locator("tbody tr").first()).toContainText("Activo 11");
  await expect(archived.locator(".payment-link-page-summary")).toHaveText("1–10 de 13");

  await archived.getByRole("button", { name: "Página 2 de productos archivados", exact: true }).click();
  await expect(archived.locator(".payment-link-page-summary")).toHaveText("11–13 de 13");
  await expect(archived.locator("tbody tr")).toHaveCount(3);
  await expect(active.locator(".payment-link-page-summary")).toHaveText("11–20 de 23");

  await archived.getByRole("button", { name: "Restaurar" }).first().click();
  await expect(page.locator("#info")).toContainText("restaurado");
  await expect(active.locator(".payment-link-group-count")).toHaveText("24 productos");
  await expect(archived.locator(".payment-link-group-count")).toHaveText("12 productos");
});

test("a local catalog render problem does not relabel a committed import as failed", async ({ page }) => {
  await prepareInventoryImport(page, successfulInventoryResponse);
  await page.locator("#categoryRows").evaluate((element) => element.remove());
  await page.locator("#inventoryCommit").click();

  await expect(page.locator("#inventoryImportStatus")).toHaveText("Importación completada.");
  await expect(page.locator("#onboardingDialog")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "products");
  await expect(page.locator("#info")).toContainText("Actualiza la página para ver el catálogo completo.");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#inventoryImportStatus")).not.toContainText("no se completó");
});

test("empty catalog opens the importer without the retired setup wizard", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Primera")]);
  await navigateDashboard(page, "products");
  await page.locator("#emptyCatalogImport").click();
  await expect(page.locator("#inventoryImporterToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#inventoryCsvInput")).toBeFocused();
  await expect(page.locator("#onboardingDialog")).toHaveCount(0);
});



// The store settings page saves straight to the store: PATCH /stores/:id plus PUT /links.
function settingsResponder(stores, products = []) {
  return ({ path, request }) => {
    const target = stores.find((candidate) => path === `/stores/${candidate.id}`);
    if (target && request.method() === "PATCH") return Object.assign(target, request.postDataJSON());
    const linked = stores.find((candidate) => path === `/stores/${candidate.id}/links`);
    if (linked && request.method() === "PUT") {
      linked.links = request.postDataJSON().links.map((link, index) => ({ id: `link_${index}`, ...link }));
      return linked.links;
    }
    if (path === "/stores/store_1/payment_links" && request.method() === "GET") return products;
    return undefined;
  };
}

test("store settings save straight to the store and its links", async ({ page }) => {
  const stores = [store("store_1", "Primera")];
  const requests = await openDashboard(page, stores, settingsResponder(stores));
  await page.locator("#storeNameInput").fill("Café Norte");
  await page.locator("#storeTaglineInput").fill("Tostado en La Paz");
  await page.locator("#storeContactEmailInput").fill("hola@cafenorte.bo");
  await page.locator("#storeShowLowStock").check();
  await page.getByLabel("Cambios y devoluciones (opcional)").fill("Cambios dentro de 7 días.");
  await page.locator("#storePublicVisibility").check();
  await page.getByRole("button", { name: "+ Agregar enlace" }).click();
  await page.getByLabel("Texto del enlace 1").fill("Instagram");
  await page.getByLabel("URL del enlace 1").fill("https://instagram.com/cafenorte");
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(page.locator("#info")).toHaveText("Datos de la tienda guardados.");
  const patch = requests.find((entry) => entry.path === "/stores/store_1" && entry.method === "PATCH");
  expect(patch.body).toMatchObject({ name: "Café Norte", tagline: "Tostado en La Paz", contactEmail: "hola@cafenorte.bo", showLowStockToCustomers: true, checkoutMode: "payment", leadCaptureUrl: null });
  expect(patch.body.publicVisibility).toBe(true);
  expect(patch.body.policies).toEqual({ returns: "Cambios dentro de 7 días.", delivery: null, privacy: null, terms: null });
  // Untouched locations are not re-sent, so saving cannot overwrite stock that sales changed meanwhile.
  expect(patch.body).not.toHaveProperty("locations");
  const links = requests.find((entry) => entry.path === "/stores/store_1/links" && entry.method === "PUT");
  expect(links.body).toEqual({ links: [{ label: "Instagram", url: "https://instagram.com/cafenorte" }] });
  await expect(page.locator("#storeNameInput")).toHaveValue("Café Norte");
  await expect(page.locator("#sidebarStorePicker option")).toHaveText(["Café Norte"]);
});

test("WhatsApp orders need a destination number before the store is saved", async ({ page }) => {
  const stores = [store("store_1", "Primera")];
  const requests = await openDashboard(page, stores, settingsResponder(stores));
  await page.getByRole("radio", { name: /Recibir por WhatsApp/ }).check();
  await expect(page.locator("#storeContactPhoneInput")).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator(".store-settings-error")).toHaveText("Escribe un número de WhatsApp válido, con 7 a 15 dígitos.");
  await expect(page.locator("#storeContactPhoneInput")).toBeFocused();
  expect(requests.some((entry) => entry.method === "PATCH")).toBe(false);

  await page.locator("#storeContactPhoneInput").fill("+591 71234567");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#info")).toHaveText("Datos de la tienda guardados.");
  expect(requests.find((entry) => entry.method === "PATCH").body).toMatchObject({ checkoutMode: "whatsapp", contactPhone: "+591 71234567" });
});

test("a location map must be an embeddable Google Maps or OpenStreetMap URL", async ({ page }) => {
  const stores = [store("store_1", "Primera")];
  const products = [{ id: "product_1", storeId: "store_1", name: "Pan brioche", amount: 2800, currency: "BOB", status: "ACTIVE", stock: 7, imageUrls: [], tags: [], variants: [], extras: [] }];
  const requests = await openDashboard(page, stores, settingsResponder(stores, products));
  await page.getByRole("button", { name: "Agregar ubicación" }).click();
  const map = page.getByLabel("Mapa para insertar (opcional)");
  await map.fill("https://evil.example/maps/embed");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(map).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".store-settings-error")).toContainText("Pega el código de inserción de Google Maps u OpenStreetMap");
  expect(requests.some((entry) => entry.method === "PATCH")).toBe(false);

  await map.fill('<iframe src="https://www.google.com/maps/embed?pb=!1m18&amp;hl=es"></iframe>');
  await expect(map).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.locator("#info")).toHaveText("Datos de la tienda guardados.");
  const [location] = requests.find((entry) => entry.method === "PATCH").body.locations;
  expect(location).toMatchObject({ name: "Ubicación 1", mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18&hl=es", pickupEnabled: true });
  // The first location starts with the product's whole stock, so adding it changes nothing.
  expect(location.inventory).toEqual([{ paymentLinkId: "product_1", stock: 7 }]);
});

test("a lead-only store hides NIT features until integrated payments are enabled", async ({ page }) => {
  const leadStore = { ...store("store_1", "Estudio de interiores"), checkoutMode: "external", leadCaptureUrl: "https://estudio.example/agenda" };
  const requests = await openDashboard(page, [leadStore], settingsResponder([leadStore]));
  await expect(page.getByRole("radio", { name: /Captar interesados/ })).toBeChecked();
  await navigateDashboard(page, "compliance");
  await page.locator("#kycSection .section-toggle").click();
  await page.locator("#invoicingSection .section-toggle").click();
  await expect(page.locator("#kycModeNotice")).toBeVisible();
  await expect(page.locator("#invoicingModeNotice")).toBeVisible();
  await expect(page.locator("#kycForm")).toBeHidden();
  await expect(page.locator("#invoicingForm")).toBeHidden();

  await navigateDashboard(page, "settings");
  await page.getByRole("radio", { name: /Cobrar con pagosYa/ }).check();
  await expect(page.locator(".store-conversion-note")).toHaveText("Al guardar, abriremos Facturación para pedir KYC y NIT antes de aceptar pagos.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(page).toHaveURL(/#dashboard-compliance$/);
  await expect(page.locator("#invoicingForm")).toBeVisible();
  await expect(page.locator("#info")).toContainText("registra tu NIT");
  await expect(page.locator('#invoicingForm input[name="nit"]')).toBeFocused();
  expect(requests.find((entry) => entry.method === "PATCH").body).toMatchObject({ checkoutMode: "payment", leadCaptureUrl: null });
});
