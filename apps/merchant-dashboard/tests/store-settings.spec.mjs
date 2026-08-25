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
  motionExperience: "coverflow-carousel",
  motionExperiences: ["coverflow-carousel"],
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
      else if (path.endsWith("/settings")) body = request.postDataJSON();
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-appearance");
  await expect(page.locator("#storeNameInput")).toHaveValue(stores[0].name);
  await page.evaluate(() => {
    const openDialog = document.querySelector("dialog[open]");
    if (!openDialog) return;
    const explore = document.getElementById("onboardingExplore");
    if (explore) explore.click();
    else openDialog.close();
  });
  const appearanceToggle = page.locator("#storeSettingsSection > .panel > .section-head .section-toggle");
  if (await appearanceToggle.getAttribute("aria-expanded") !== "true") await appearanceToggle.evaluate((button) => button.click());
  await expect(page.locator("#storeNameInput")).toBeVisible();
  return requests;
}

async function addAnimation(page, type = "coverflow-carousel") {
  await page.locator("#storeAnimationTypePicker").selectOption(type);
  await page.locator("#storeAnimationAdd").click({ force: true });
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
  await page.locator('[data-dashboard-view="products"]').click();
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

const successfulInventoryResponse = ({ path }) => {
  if (path === "/stores/store_1/operations/integrations") {
    return [{ id: "integration_1", name: "Caja Café", kind: "CUSTOM_DATABASE", status: "ACTIVE" }];
  }
  if (path === "/uploads") return { url: "/uploads/silpancho.png" };
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
        imageUrls: ["/uploads/silpancho.png"],
        tags: [],
        variants: [],
        stock: null,
      }],
    };
  }
  return undefined;
};

test("merchant open-store links do not count as external visits", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Tienda propia")]);

  const sharedUrl = new URL(await page.locator("#currentStoreLink").inputValue());
  expect(sharedUrl.pathname).toBe("/s/store_1");
  expect(sharedUrl.searchParams.has("link")).toBe(false);
  expect(sharedUrl.searchParams.has("owner")).toBe(false);
  expect(sharedUrl.searchParams.has("preview")).toBe(false);

  const rowOwnerUrl = new URL(await page.locator('.store-row[data-id="store_1"] .store-row-open').getAttribute("href"));
  expect(rowOwnerUrl.searchParams.get("owner")).toBe("1");
  const previewOwnerUrl = new URL(await page.locator("#previewOpen").getAttribute("href"));
  expect(previewOwnerUrl.searchParams.get("owner")).toBe("1");
});

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

test("appearance options collapse into remembered disclosures", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Tienda compacta")]);

  const domainToggle = page.getByRole("button", { name: "Mostrar dominio propio" });
  await expect(domainToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#customDomainStudioBody")).toBeHidden();
  await domainToggle.click();
  await expect(page.locator("#customDomainStudioBody")).toBeVisible();

  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  const copyToggle = page.getByRole("button", { name: "Mostrar Textos y secciones de la tienda" });
  await expect(copyToggle).toHaveAttribute("aria-expanded", "false");
  await copyToggle.click();
  await expect(page.locator("#storeCatalogTitle")).toBeVisible();

  await page.getByRole("button", { name: "Mostrar Animaciones" }).click({ force: true });
  await addAnimation(page);
  await addAnimation(page, "story-scroll");
  const animationCards = page.locator(".animation-card");
  await expect(animationCards.nth(0).locator(".animation-card-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(animationCards.nth(1).locator(".animation-card-toggle")).toHaveAttribute("aria-expanded", "true");
  await animationCards.nth(1).locator(".animation-card-toggle").click();
  await expect(animationCards.nth(1).locator(".animation-card-body")).toBeHidden();

  await page.reload();
  await expect(page.locator("#storeNameInput")).toHaveValue("Tienda compacta");
  await expect(page.locator("#customDomainToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#customDomainStudioBody")).toBeVisible();
});

test("legacy sliders migrate into optional draggable animations", async ({ page }) => {
  const requests = await openDashboard(page, [{
    ...store("store_1", "Tienda ordenable"),
    heroSlides: [
      { imageUrl: "/uploads/hero-one.webp", title: "Primera portada" },
      { imageUrl: "/uploads/hero-two.webp", title: "Segunda portada" },
    ],
    editorialGallery: [
      { imageUrl: "/uploads/story-one.webp", title: "Primera historia", caption: "", body: "" },
      { imageUrl: "/uploads/story-two.webp", title: "Segunda historia", caption: "", body: "" },
      { imageUrl: "/uploads/story-three.webp", title: "Tercera historia", caption: "", body: "" },
    ],
  }]);

  const shell = page.locator(".dashboard-shell");
  const workspaceWidth = await page.locator("#dashboardWorkspace").evaluate((element) => element.getBoundingClientRect().width);
  await page.locator("#dashboardSidebarToggle").click();
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(page.locator("#dashboardSidebarToggle")).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.locator("#dashboardWorkspace").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(workspaceWidth);

  await expect(page.getByText("Experiencia visual después del catálogo", { exact: true })).toHaveCount(0);
  await expect(page.locator("#storeExperienceStyle")).toBeHidden();
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await expect(page.locator(".store-animations-editor .hero-slides-editor")).toHaveCount(0);
  await expect(page.locator("#storeAnimationTypePicker")).toHaveValue("");
  await expect(page.locator("#storeAnimationAdd")).toBeDisabled();
  const sliderCard = page.locator(".animation-card").first();
  await expect(page.locator(".animation-card")).toHaveCount(1);
  await sliderCard.locator(".animation-card-toggle").click();
  await expect(sliderCard.locator('[data-animation-field="name"]')).toHaveValue("Slider principal");
  await expect(sliderCard.locator('[data-animation-field="type"]')).toHaveValue("hero-carousel");
  const sliderMedia = sliderCard.locator(".animation-media-row");
  await expect(sliderMedia).toHaveCount(2);
  await sliderMedia.first().locator(".reorder-handle").press("End");
  await expect(sliderMedia.first().locator('[data-animation-media-field="title"]')).toHaveValue("Segunda portada");

  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await expect(page.locator(".store-content-order-row").nth(-2)).toContainText("Contáctanos");
  await expect(page.locator(".store-content-order-row").last()).toContainText("Ubicación");
  const editorialHandles = page.locator(".editorial-gallery-row .reorder-handle");
  await editorialHandles.first().press("End");
  await expect(page.locator("#editorialTitle0")).toHaveValue("Segunda historia");

  const sliderOrderRow = page.locator(".store-content-order-row", { hasText: "Slider principal" });
  await sliderOrderRow.locator(".reorder-handle").press("End");
  await expect(page.locator(".store-content-order-row").last()).toContainText("Slider principal");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.findLast((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(write.body.heroSlides).toEqual([]);
  expect(write.body.editorialGallery.map((image) => image.title)).toEqual(["Segunda historia", "Tercera historia", "Primera historia"]);
  expect(write.body.animations).toEqual([expect.objectContaining({ name: "Slider principal", type: "hero-carousel" })]);
  expect(write.body.animations[0].media.map((image) => image.title)).toEqual(["Segunda portada", "Primera portada"]);
  expect(write.body.contentOrder.at(-1)).toBe(`animation-${write.body.animations[0].id}`);
});

test("a new store starts without animations and only adds the selected type", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Tienda quieta")]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();

  await expect(page.locator(".animation-card")).toHaveCount(0);
  await expect(page.locator("#storeAnimationAdd")).toBeDisabled();
  await page.locator("#storeAnimationTypePicker").selectOption("hero-carousel");
  await expect(page.locator("#storeAnimationAdd")).toBeEnabled();
  await page.locator("#storeAnimationAdd").click({ force: true });

  await expect(page.locator(".animation-card")).toHaveCount(1);
  await expect(page.locator('[data-animation-field="type"]')).toHaveValue("hero-carousel");
  await expect(page.locator(".animation-media-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await expect(page.locator(".store-content-order-row").first()).toContainText("Slider principal");
  await expect(page.locator("#storeAnimationTypePicker")).toHaveValue("");
  await expect(page.locator("#storeAnimationAdd")).toBeDisabled();
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

  await page.locator('[data-dashboard-view="stores"]').click();
  await expect(page.locator("#debtCollectionSection")).toBeHidden();
  await page.locator('[data-dashboard-view="charge-links"]').click();
  await expect(page.locator("#debtCollectionSection")).toBeVisible();
  if (process.env.CAPTURE_CHARGE_LINKS) {
    await expect(page.locator("#dashboardEntryLoader")).toBeHidden();
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

  await page.locator('[data-dashboard-view="charge-links"]').click();
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

  await page.locator('[data-dashboard-view="charge-links"]').click();
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

  await page.locator('[data-dashboard-view="charge-links"]').click();
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

  await page.locator('[data-dashboard-view="charge-links"]').click();
  if (process.env.CAPTURE_CHARGE_LINKS) {
    await expect(page.locator("#dashboardEntryLoader")).toBeHidden();
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

test("typing keeps focus, preserves the iframe, and identifies the edited preview section", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>
      window.addEventListener("message", (event) => parent.postMessage({ source: "preview-test", payload: event.data }, "*"));
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  await openDashboard(page, [{
    ...store("store_1", "Primera"),
    motionDuoEnabled: true,
    motionExperience: "coverflow-carousel",
    heroSlides: [
      { imageUrl: "/uploads/hero-1.webp", title: "Primera portada" },
      { imageUrl: "/uploads/hero-2.webp", title: "Segunda portada" },
    ],
    editorialGallery: [
      { imageUrl: "/uploads/story-1.webp", title: "Primera historia", caption: "Inicio", body: "Texto uno" },
      { imageUrl: "/uploads/story-2.webp", title: "Segunda historia", caption: "Cierre", body: "Texto dos" },
    ],
  }]);
  await page.evaluate(() => {
    window.__previewTestMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "preview-test") window.__previewTestMessages.push(event.data.payload);
    });
  });
  const name = page.locator("#storeNameInput");
  const initialSrc = await page.locator("#storePreviewFrame").getAttribute("src");
  expect(new URLSearchParams(new URL(initialSrc).hash.slice(1)).get("parent_origin")).toBe("http://127.0.0.1:4323");
  await name.fill("");
  await name.pressSequentially("Suave", { delay: 20 });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Suave");
  await expect(page.locator("#storePreviewFrame")).toHaveAttribute("src", initialSrc);
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewSection === "brand" && message.patch?.storeName === "Suave"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  const migratedSlider = page.locator(".animation-card").filter({ hasText: "Slider principal" }).last();
  await migratedSlider.locator(".animation-card-toggle").click();
  await migratedSlider.locator('[data-animation-media-field="title"]').nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewSection === "animation-legacy-main-slider" && message.previewAction === "motion"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  await page.getByRole("button", { name: "Mostrar Textos y secciones de la tienda" }).click();
  await page.locator("#storeCatalogTitle").fill("Selección nueva");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewSection === "products" && message.patch?.catalogTitle === "Selección nueva"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await page.locator("#editorialTitle1").fill("Segunda historia editada");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "editorial-item" && message.previewTargetIndex === 1 && message.previewTargetKind === "text"))).toBe(true);
  await page.locator('.editorial-gallery-row[data-index="1"] .editorial-card-preview').click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "editorial-item" && message.previewTargetIndex === 1 && message.previewTargetKind === "media"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "cart"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Estilo" }).click();
  await page.locator("#storeCartButtonLabel").fill("Finalizar pedido");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "cart" && message.patch?.cartButtonLabel === "Finalizar pedido"))).toBe(true);
});

test("merchant can save every showcase animation type from the real appearance editor", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [store("store_1", "Movimiento")]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page);
  const type = page.locator('[data-animation-field="type"]');
  await expect(type.locator("option")).toHaveCount(16);
  await type.selectOption("3d-gallery");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toEqual([expect.objectContaining({ type: "3d-gallery" })]);
  expect(write.body.motionExperiences).toEqual(["3d-gallery"]);
});

test("text-only animations skip photos and animations can feature one product", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const products = [
    { id: "product_1", name: "Helado amarillo tropical de temporada", status: "ACTIVE", imageUrls: ["/v1/uploads/tropical.webp"], tags: ["Frutal"], description: "Fresco y frutal." },
    { id: "product_2", name: "Helado de chocolate con nombre especialmente largo", status: "ACTIVE", imageUrls: ["/v1/uploads/chocolate.webp"], tags: [], description: "Cacao intenso." },
  ];
  const requests = await openDashboard(page, [store("store_1", "Movimiento")], ({ path }) =>
    path === "/stores/store_1/payment_links" ? products : undefined,
  );
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page);

  await page.locator('[data-animation-field="type"]').selectOption("clarity-marquee");
  await expect(page.locator(".animation-text-only-note")).toContainText("No necesitas seleccionar fotos");
  await expect(page.locator("[data-animation-source]")).toHaveCount(0);
  await page.locator('[data-animation-field="productId"]').selectOption("product_1");
  await expect(page.locator(".animation-text-only-note")).toContainText("Helado amarillo tropical");

  await page.locator('[data-animation-field="type"]').selectOption("video-pill");
  await expect(page.locator(".animation-media-count")).toHaveText("1 / 1");
  await page.locator(".animation-source").nth(1).click();
  await expect(page.locator(".animation-media-row")).toHaveCount(1);

  await page.locator('[data-animation-field="type"]').selectOption("clarity-marquee");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.findLast((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toEqual([expect.objectContaining({ type: "clarity-marquee", productId: "product_1", media: [] })]);
});

test("merchant can upload a video directly to Video que se abre", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [store("store_1", "Movimiento")], ({ path }) => {
    if (path === "/uploads") return { url: "/v1/uploads/opening.mp4" };
  });
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page, "video-pill");
  const card = page.locator(".animation-card").last();

  await expect(card.locator(".animation-video-upload")).toContainText("MP4 o WEBM de hasta 20 MB");
  await card.locator(".animation-video-input").setInputFiles({
    name: "still.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-video"),
  });
  await expect(card.locator(".animation-video-upload-status")).toContainText("Usa MP4 o WEBM");
  expect(requests.filter((request) => request.path === "/uploads")).toHaveLength(0);

  await card.locator(".animation-video-input").setInputFiles({
    name: "opening.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fake-video"),
  });
  await expect(card.locator(".animation-media-row video")).toHaveAttribute("src", /opening\.mp4$/);
  await expect(card.locator(".animation-card-identity")).toContainText("1 video");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.findLast((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toEqual([
    expect.objectContaining({
      type: "video-pill",
      media: [expect.objectContaining({ imageUrl: "/v1/uploads/opening.mp4" })],
    }),
  ]);
});

test("editing a saved product moves the shared preview into its product detail", async ({ page }) => {
  const product = {
    id: "product_1",
    storeId: "store_1",
    name: "Pan brioche",
    description: "Suave y ligeramente dulce.",
    amount: 2800,
    currency: "BOB",
    status: "ACTIVE",
    categoryId: null,
    imageUrls: ["/uploads/brioche.webp"],
    imagePositions: ["50% 50%"],
    tags: [],
    variants: [],
    extras: [],
    stock: null,
    color: null,
    soldCount: 0,
  };
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>
      window.addEventListener("message", (event) => parent.postMessage({ source: "preview-test", payload: event.data }, "*"));
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  await openDashboard(page, [store("store_1", "Cafece")], ({ path }) => {
    if (path === "/stores/store_1/payment_links") return [product];
  });
  await page.evaluate(() => {
    window.__previewTestMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "preview-test") window.__previewTestMessages.push(event.data.payload);
    });
  });

  await page.locator('[data-dashboard-view="products"]').click();
  await expect(page.locator("#productPreviewMount .store-preview-panel")).toBeVisible();
  await page.locator('.edit-link[data-id="product_1"]').click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "product" && message.previewProduct?.id === "product_1"))).toBe(true);

  await page.waitForTimeout(500);
  const dashboardScroll = await page.evaluate(() => window.scrollY);
  const description = page.locator('#paymentLinkForm [name="description"]');
  await description.fill("Miga aireada y mantequilla dorada.");
  await expect(description).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "product" && message.previewProduct?.description === "Miga aireada y mantequilla dorada."))).toBe(true);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - dashboardScroll)).toBeLessThanOrEqual(40);
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

test("location editor explains an unsafe map without saving it", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Primera")]);
  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  await page.getByRole("button", { name: "Mostrar Ubicaciones e inventario" }).click();
  await page.locator("#storeLocationAdd").click();
  const mapInput = page.locator('[data-location-field="mapEmbedUrl"]');
  await mapInput.fill("https://tracking.invalid/embed");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());

  await expect(mapInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".store-location-editor-card .field-validation-error")).toContainText("Google Maps u OpenStreetMap");
  expect(requests.some((request) => request.method === "PUT" && request.path.endsWith("/settings"))).toBe(false);

  await mapInput.fill("https://www.google.com/maps/embed?pb=trusted");
  await expect(mapInput).not.toHaveAttribute("aria-invalid");
  await expect(page.locator(".store-location-editor-card .field-validation-error")).toBeHidden();
});

test("appearance and links save once to the captured store", async ({ page }) => {
  const requests = await openDashboard(page, [{
    ...store("store_1", "Primera"),
    editorialGallery: [
      { imageUrl: "/uploads/story-1.webp", title: "Origen", caption: "Primera escena", body: "Texto uno" },
      { imageUrl: "/uploads/story-2.webp", title: "Proceso", caption: "Segunda escena", body: "Texto dos" },
      { imageUrl: "/uploads/story-3.webp", title: "Resultado", caption: "Tercera escena", body: "Texto tres" },
    ],
  }]);
  await page.locator("#storeNameInput").fill("Nombre guardado");
  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page);
  await addAnimation(page, "story-scroll");
  const animationCards = page.locator(".animation-card");
  await animationCards.nth(0).locator(".animation-card-toggle").click();
  await animationCards.nth(0).locator('[data-animation-field="name"]').fill("Portada editorial");
  await animationCards.nth(0).locator('[data-animation-field="type"]').selectOption("hero-carousel");
  await animationCards.nth(0).locator('[data-animation-field="title"]').fill("Colección principal");
  for (let sourceIndex = 0; sourceIndex < 3; sourceIndex += 1) {
    await animationCards.nth(0).locator(`[data-animation-source="${sourceIndex}"]`).click({ force: true });
  }
  await animationCards.nth(1).locator(".animation-card-toggle").click();
  await animationCards.nth(1).locator('[data-animation-field="name"]').fill("Historia final");
  await animationCards.nth(1).locator('[data-animation-field="type"]').selectOption("story-scroll");
  await animationCards.nth(1).locator('[data-animation-source="0"]').click({ force: true });
  await animationCards.nth(1).locator('[data-animation-source="1"]').click({ force: true });
  await animationCards.nth(1).locator('[data-animation-media-field="body"]').first().fill("Un capítulo independiente para esta animación.");
  await expect(page.locator("#storeContentOrderList")).toContainText("Portada editorial");
  await expect(page.locator("#storeContentOrderList")).toContainText("Historia final");
  await page.getByRole("button", { name: "Mostrar Estilo" }).click();
  await page.locator("#storeBackgroundColor").fill("#fef3c7");
  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click({ force: true });
  await expect(page.locator("#storeCartRecommendations")).toBeChecked();
  await page.locator("#storeCartRecommendations").uncheck();
  await page.locator("#storeShowLowStock").check();
  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  await page.getByRole("button", { name: "Mostrar Atención al cliente" }).click();
  await page.locator("#storeContactFormEnabled").check();
  await expect(page.locator("#storeContactFormEmail")).toBeEnabled();
  await page.locator("#storeContactFormEmail").fill("dueno@gmail.com");
  await page.getByRole("button", { name: "Mostrar Ubicaciones e inventario" }).click();
  await page.locator("#storeLocationAdd").click();
  await page.locator('[data-location-field="name"]').fill("Sucursal Centro");
  await page.locator('[data-location-field="mapEmbedUrl"]').fill('<iframe src="https://www.google.com/maps/embed?pb=trusted&amp;output=embed"></iframe>');
  await page.locator('[data-location-field="highlight"]').fill("A media cuadra de la plaza");
  await page.locator('[data-location-field="description"]').fill("Atendemos de lunes a sábado.");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const writes = requests.filter((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe("/stores/store_1/settings");
  expect(writes[0].body).toMatchObject({
    name: "Nombre guardado",
    backgroundColor: "#fef3c7",
    experienceStyle: "coverflow",
    motionDuoEnabled: true,
    motionExperience: "hero-carousel",
    motionExperiences: ["hero-carousel", "story-scroll"],
    cartRecommendationsEnabled: false,
    showLowStockToCustomers: true,
    contactFormEnabled: true,
    contactFormEmail: "dueno@gmail.com",
    locationMapUrl: "https://www.google.com/maps/embed?pb=trusted&output=embed",
    locationHighlight: "A media cuadra de la plaza",
    locationDescription: "Atendemos de lunes a sábado.",
    links: [],
  });
  expect(writes[0].body.locations).toEqual([
    expect.objectContaining({
      name: "Sucursal Centro",
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=trusted&output=embed",
      highlight: "A media cuadra de la plaza",
      description: "Atendemos de lunes a sábado.",
      pickupEnabled: true,
      deliveryEnabled: false,
      openingHours: expect.arrayContaining([
        expect.objectContaining({ day: 1, open: "09:00", close: "18:00", closed: false }),
      ]),
    }),
  ]);
  expect(writes[0].body.contentOrder).toContain("contact");
  expect(writes[0].body.animations).toHaveLength(2);
  expect(writes[0].body.animations[0]).toMatchObject({ name: "Portada editorial", type: "hero-carousel", title: "Colección principal" });
  expect(writes[0].body.animations[0].media).toHaveLength(3);
  expect(writes[0].body.animations[1]).toMatchObject({ name: "Historia final", type: "story-scroll" });
  expect(writes[0].body.animations[1].media).toHaveLength(2);
  expect(writes[0].body.animations[1].media[0].body).toBe("Un capítulo independiente para esta animación.");
  expect(writes[0].body.contentOrder).toContain(`animation-${writes[0].body.animations[0].id}`);
  expect(writes[0].body.contentOrder).toContain(`animation-${writes[0].body.animations[1].id}`);
  expect(writes[0].body).not.toHaveProperty("backgroundMode");
  expect(writes[0].body).not.toHaveProperty("backgroundGradientStart");
  expect(requests.some((request) => request.path.endsWith("/links"))).toBe(false);
});

test("merchant can edit a migrated slider as a normal animation", async ({ page }) => {
  const sliderStore = {
    ...store("store_1", "Quemado"),
    heroSlides: [{ imageUrl: "/uploads/original.webp", title: "Cada caja es una obra" }],
  };
  const requests = await openDashboard(page, [sliderStore]);

  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  const card = page.locator(".animation-card");
  await card.locator(".animation-card-toggle").click();
  await card.locator('[data-animation-media-field="title"]').fill("Portada renovada");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(write.body.heroSlides).toEqual([]);
  expect(write.body.animations).toEqual([expect.objectContaining({ type: "hero-carousel", name: "Slider principal" })]);
  expect(write.body.animations[0].media[0]).toMatchObject({ imageUrl: "/uploads/original.webp", title: "Portada renovada" });
});

test("merchant links slider animations and promotion buttons to products from the store catalog", async ({ page }) => {
  const linkedStore = {
    ...store("store_1", "Café Norte"),
    promotionEnabled: true,
    promotionCtaUrl: "http://localhost:5175/?link=store_1&product=product_press",
    heroSlides: [{ imageUrl: "/uploads/hero.webp", title: "El favorito de la casa", ctaLabel: "Ver producto", ctaUrl: "http://localhost:5175/?link=store_1&product=product_coffee" }],
  };
  const products = [
    { id: "product_coffee", name: "Café Geisha", amount: 8500, currency: "BOB", status: "ACTIVE", stock: 12, tags: [], variants: [], imageUrls: ["/uploads/coffee.webp"] },
    { id: "product_press", name: "Prensa francesa", amount: 16000, currency: "BOB", status: "ACTIVE", stock: 4, tags: [], variants: [], imageUrls: [] },
  ];
  const requests = await openDashboard(page, [linkedStore], ({ path }) => {
    if (path === "/stores/store_1/payment_links") return products;
    return undefined;
  });

  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await page.locator(".animation-card-toggle").click();
  const animationProduct = page.locator('[data-animation-field="productId"]');
  await expect(animationProduct).toContainText("Café Geisha");
  await animationProduct.selectOption("product_coffee");
  await expect(animationProduct).toHaveValue("product_coffee");

  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  await page.getByRole("button", { name: "Mostrar Promoción emergente" }).click();
  await expect(page.locator("#storePromotionProduct")).toContainText("Prensa francesa");
  await expect(page.locator("#storePromotionProduct")).toHaveValue("product_press");
  await page.locator("#storePromotionProduct").selectOption("product_press");
  const promotionUrl = new URL(await page.locator("#storePromotionCtaUrl").inputValue());
  expect(promotionUrl.pathname).toBe("/s/store_1/p/product_press");
  expect(promotionUrl.searchParams.has("link")).toBe(false);

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path.endsWith("/settings"));
  expect(write.body.heroSlides).toEqual([]);
  expect(write.body.animations[0]).toMatchObject({ type: "hero-carousel", productId: "product_coffee" });
  expect(new URL(write.body.promotionCtaUrl).pathname).toBe("/s/store_1/p/product_press");
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
  await page.locator('[data-dashboard-view="products"]').click();
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

test("merchant schedules a timed product discount", async ({ page }) => {
  const discountStartsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  const discountEndsAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const requests = await openDashboard(page, [store("store_1", "Café Norte")], ({ path, request }) => {
    if (path === "/stores/store_1/payment_links" && request.method() === "POST") {
      return { id: "product_sale", status: "ACTIVE", currency: "BOB", stock: null, variants: [], extras: [], imageUrls: [], tags: [], ...request.postDataJSON() };
    }
    return undefined;
  });

  await page.locator('[data-dashboard-view="products"]').click();
  await page.locator('#paymentLinkForm [name="name"]').fill("Café Geisha");
  await page.locator('#paymentLinkForm [name="amount"]').fill("100");
  await page.locator("#paymentLinkDiscountToggle").check();
  await page.locator("#paymentLinkDiscountPercent").fill("25");
  await page.locator("#paymentLinkDiscountStartsAt").fill(discountStartsAt);
  await page.locator("#paymentLinkDiscountEndsAt").fill(discountEndsAt);
  await page.locator("#paymentLinkSubmit").click();
  await expect(page.locator("#info")).toContainText("creado");

  const write = requests.find((request) => request.method === "POST" && request.path === "/stores/store_1/payment_links");
  expect(write.body.discountPercent).toBe(25);
  expect(Date.parse(write.body.discountStartsAt)).toBeLessThan(Date.parse(write.body.discountEndsAt));
  expect(write.body.discountEndsAt).toMatch(/Z$/);
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

  await page.locator('.dashboard-nav-button[data-dashboard-view="progress"]').click();
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
  await page.locator('.dashboard-nav-button[data-dashboard-view="progress"]').click();
  await expect(page.locator("#gamificationDailyStars")).toHaveText("4 estrellas");
  await expect(page.locator("#gamificationDailySource")).toHaveText("Ganaste 1 hoy · vuelve mañana");
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
  await page.getByRole("button", { name: "Mostrar Promoción emergente" }).click();
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
  await page.locator("#inventoryConnection").selectOption("integration_1");
  if (process.env.PAGOSYA_VISUAL_QA === "1") {
    await page.locator("#inventoryImporter").screenshot({ path: "../../.impeccable/inventory-import-sku-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#inventoryImporter").screenshot({ path: "../../.impeccable/inventory-import-sku-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await page.locator("#inventoryCommit").click();

  await expect(page.locator("#inventoryImportStatus")).toHaveText("Importación completada.");
  await expect(page.locator("#info")).toContainText("1 producto importado y 1 categorías nuevas");
  await expect(page.locator("#info")).toContainText("1 SKU conectado");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#paymentLinkRows")).toContainText("Silpancho");
  expect(requests.find((request) => request.path.endsWith("/payment_links/import"))?.body).toMatchObject({
    integrationConnectionId: "integration_1",
    products: [{ name: "Silpancho", codigoProducto: "COM-001", imageUrls: ["/uploads/silpancho.png"] }],
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
  await page.locator('[data-dashboard-view="products"]').click();

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
  await expect.poll(async () => page.locator("#paymentLinkImagesPreview img").evaluate((image) => getComputedStyle(image).objectPosition)).toMatch(/^80% (30|31)%$/);
  await form.evaluate((element) => element.requestSubmit());
  await expect(page.locator("#info")).toContainText("creado");

  const createBody = requests.find((request) => request.path === "/stores/store_1/payment_links" && request.method === "POST")?.body;
  expect(createBody).toMatchObject({ imageUrls: ["/v1/uploads/product-focus.jpg"] });
  expect(createBody.imagePositions[0]).toMatch(/^80% (30|31)%$/);
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

test("AI onboarding keeps prior photo batches and lets the merchant remove each draft", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Primera")]);
  await page.locator("#aiSetupLaunch").click();
  await page.locator("#onboardingStartAi").click();
  await page.locator("#onboardingSkipCsv").click();
  await page.locator("#onboardingCategory").fill("Cerámica artesanal");

  await page.locator("#onboardingAiImages").setInputFiles([
    { name: "taller-1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("taller-1") },
    { name: "taller-2.jpg", mimeType: "image/jpeg", buffer: Buffer.from("taller-2") },
  ]);
  await expect(page.locator("#onboardingAiPreviews img")).toHaveCount(2);
  await page.locator("#onboardingAiImages").setInputFiles([
    { name: "taller-3.jpg", mimeType: "image/jpeg", buffer: Buffer.from("taller-3") },
    { name: "taller-4.jpg", mimeType: "image/jpeg", buffer: Buffer.from("taller-4") },
  ]);

  await expect(page.locator("#onboardingAiPreviews img")).toHaveCount(4);
  await expect(page.locator("#onboardingAiFileStatus")).toContainText("4 fotos listas");
  await expect(page.locator("#onboardingCategory")).toHaveValue("Cerámica artesanal");
  await page.getByRole("button", { name: "Quitar taller-2.jpg" }).click();
  await expect(page.locator("#onboardingAiPreviews img")).toHaveCount(3);
  await expect(page.locator("#onboardingAiPreviews img").nth(1)).toHaveAttribute("alt", "taller-3.jpg");
  await expect(page.locator("#onboardingDialog")).toBeVisible();
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
  await expect(page.locator('input[name="visualAnnouncementMarquee"]')).toHaveCount(2);
  await expect(page.locator('input[name="visualMotionExperience"]')).toHaveCount(16);
  await expect(page.locator('input[name="visualMotionExperience"]:checked')).toHaveCount(0);
  await page.locator('input[name="visualAnnouncementMarquee"][value="false"]').check();
  await page.locator('input[name="visualMotionExperience"][value="hero-carousel"]').check();
  await page.locator('input[name="visualMotionExperience"][value="hero-gallery-scroll"]').check();
  await page.locator('input[name="visualMotionExperience"][value="stagger-testimonials"]').check();
  await page.locator('input[name="visualCheckoutMode"][value="whatsapp"]').check();
  await expect(page.locator("#visualWhatsappPhoneWrap")).toBeVisible();
  await page.locator("#visualWhatsappPhone").fill("+591 71234567");
  await page.locator("#visualBusinessCategory").fill("Café de especialidad");
  await page.locator("#visualAiImages").setInputFiles([
    { name: "referencia-1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto-de-referencia-1") },
    { name: "referencia-2.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto-de-referencia-2") },
  ]);
  await expect(page.locator("#visualAiPreviews img")).toHaveCount(2);
  await page.locator("#visualAiImages").setInputFiles(Array.from({ length: 8 }, (_, index) => ({
    name: `referencia-${index + 3}.jpg`,
    mimeType: "image/jpeg",
    buffer: Buffer.from(`foto-de-referencia-${index + 3}`),
  })));
  await expect(page.locator("#visualAiPreviews img")).toHaveCount(10);
  await expect(page.locator("#visualSourceStatus")).toContainText("10 fotos listas");
  await expect(page.locator("#visualBusinessCategory")).toHaveValue("Café de especialidad");
  await page.getByRole("button", { name: "Quitar referencia-2.jpg" }).click();
  await expect(page.locator("#visualAiPreviews img")).toHaveCount(9);
  await expect(page.locator("#visualAiPreviews img").nth(0)).toHaveAttribute("alt", "referencia-1.jpg");
  await expect(page.locator("#visualAiPreviews img").nth(1)).toHaveAttribute("alt", "referencia-3.jpg");
  await expect(page.locator("#visualSourceStatus")).toContainText("9 fotos listas");
  await page.locator("#visualAiImages").setInputFiles({
    name: "referencia-no-valida.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("gif-no-admitido"),
  });
  await expect(page.locator("#visualAiPreviews img")).toHaveCount(9);
  await expect(page.locator("#visualSourceStatus")).toContainText("Tus 9 fotos anteriores siguen listas");
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
    announcementMarqueeEnabled: false,
    motionExperience: "hero-carousel",
    motionExperiences: ["hero-carousel", "hero-gallery-scroll", "stagger-testimonials"],
    checkoutMode: "whatsapp",
    whatsappPhone: "+591 71234567",
    businessCategory: "Café de especialidad",
    assetUrls: Array.from({ length: 9 }, (_, index) => `/v1/uploads/ai-${index + 1}.jpg`),
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
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).toContainText("Coverflow");
  expect(opened).toMatchObject({ target: "_blank", features: "noopener,noreferrer" });
  await expect(page.locator("#visualProposalStatus")).toContainText("No aplicamos cambios");
});
