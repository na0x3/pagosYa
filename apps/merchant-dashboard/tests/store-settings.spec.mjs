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
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "hero-carousel",
  motionExperiences: ["hero-carousel"],
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
    localStorage.setItem("pagosya_dashboard_section_storeSettingsSection", "false");
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
  await expect(page.locator("#onboardingDialog")).toBeVisible();
  await page.evaluate(() => {
    const openDialog = document.querySelector("dialog[open]");
    if (!openDialog) return;
    const explore = document.getElementById("onboardingExplore");
    if (explore) explore.click();
    else openDialog.close();
  });
  const appearanceToggle = page.locator("#storeSettingsSection > .panel > .section-head .section-toggle");
  await expect(appearanceToggle).toHaveAttribute("aria-expanded", "true");
  if (await page.locator("#storeNameInput").isHidden()) await page.locator("#storeOptionsTab").evaluate((button) => button.click());
  await expect(page.locator("#storeNameInput")).toBeVisible();
  return requests;
}

async function addAnimation(page, type = "hero-carousel") {
  if (await page.locator("#previewExpandToggle").getAttribute("aria-pressed") === "true") {
    await page.locator("#previewExpandToggle").click();
  }
  await page.locator("#storeAnimationTypePicker").selectOption(type);
  await page.locator("#storeAnimationAdd").click();
  if (await page.locator("#previewExpandToggle").getAttribute("aria-pressed") === "true") {
    await page.locator("#previewExpandToggle").click();
  }
}

test("AI storefront sections keep their own order and background controls", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const aiStore = {
    ...store("store_1", "Tienda IA"),
    contentOrder: ["hero", "about", "products", "contact", "links"],
    contactFormEnabled: true,
    siteDocument: {
      version: 1,
      sections: [
        { id: "opening", kind: "hero", title: "Portada propia", body: "Contenido que debe conservarse", motion: "scale", mediaUrls: ["/v1/uploads/portada.webp"] },
        { id: "story", kind: "story", title: "Nuestra historia" },
        { id: "shop", kind: "catalog", title: "La colección" },
        { id: "information", kind: "contact", title: "Conversemos" },
      ],
    },
  };
  const requests = await openDashboard(page, [aiStore]);

  await expect(page.locator("#storeContentOrderList .store-content-order-row")).toHaveCount(4);
  await expect(page.locator("#storeContentOrderList")).toContainText("Portada propia");
  await expect(page.locator("#storeContentOrderList")).toContainText("La colección");

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    const send = (type, payload) => window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: { source: "pagosya-checkout", type, payload },
    }));
    const shopSelection = { section: "site-shop", field: "section", label: "La colección" };
    send("STORE_EDITOR_MOVE_SECTION", { selection: shopSelection, direction: -1 });
    send("STORE_EDITOR_SITE_FIELD", { selection: shopSelection, key: "backgroundColor", value: "#224466" });
    const selection = { section: "site-opening", field: "siteTitle", label: "título de portada" };
    for (const [key, value] of [["fontStyle", "editorial"], ["textScale", 130], ["textColor", "#fef4df"], ["textAlign", "center"]]) {
      send("STORE_EDITOR_TEXT_STYLE", { selection, key, value });
    }
    send("STORE_EDITOR_SITE_FIELD", { selection, key: "motion", value: "none" });
    send("STORE_EDITOR_SITE_FIELD", { selection, key: "layout", value: "offset" });
  });
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.contentOrder).toEqual(["site-opening", "site-shop", "site-story", "site-information"]);
  expect(write.body.sectionBackgrounds).toEqual({});
  expect(write.body.siteSections.find((section) => section.id === "shop").backgroundColor).toBe("#224466");
  expect(write.body.siteSections[0].motion).toBe("none");
  expect(write.body.siteSections[0].title).toBe("Portada propia");
  expect(write.body.siteSections[0].body).toBe("Contenido que debe conservarse");
  expect(write.body.siteSections[0].mediaUrls).toEqual(["/v1/uploads/portada.webp"]);
  expect(write.body.siteSections[0].layout).toBe("offset");
  expect(write.body.siteSections[0].titleStyle).toEqual({ fontStyle: "editorial", textScale: 130, textColor: "#fef4df", textAlign: "center" });
});

test("touching storefront chrome keeps editing on the preview and saves direct edits", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `
      <button id="nav-link" type="button">Inicio</button>
      <button id="story-section" type="button">Nuestra historia</button>
      <footer><button id="footer-copy" type="button">Pie de página</button></footer>
      <script>
        const sendSelection = (selection) => parent.postMessage({ source: "pagosya-checkout", type: "STORE_EDITOR_SELECT", payload: { selection } }, "*");
        window.addEventListener("message", (event) => parent.postMessage({ source: "preview-test", payload: event.data }, "*"));
        document.querySelector("#nav-link").onclick = () => sendSelection({ section: "navigation", field: "navigationLabel", label: "Inicio", itemIndex: 0 });
        document.querySelector("#story-section").onclick = () => sendSelection({ section: "site-story", field: "section", label: "Nuestra historia" });
        document.querySelector("#footer-copy").onclick = () => sendSelection({ section: "footer", field: "footerBrandDescription", label: "Pie de página" });
        parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
      </script>`,
  }));
  const aiStore = {
    ...store("store_1", "Tienda IA"),
    contactEmail: "hola@example.com",
    siteDocument: {
      version: 1,
      navigation: {
        layout: "split",
        items: [
          { id: "home", label: "Inicio", target: "home" },
          { id: "catalog", label: "Catálogo", target: "catalog" },
          { id: "story", label: "Our Story", target: "section", sectionId: "story" },
        ],
      },
      footer: {
        enabled: true,
        brandDescription: "Hecho con paciencia.",
        columns: [{ id: "company", title: "Company", items: [{ id: "story", label: "Our Story", href: "#site-section-story" }] }],
        copyright: "© 2026 Tienda IA",
        badge: "Hecho en Bolivia",
      },
      sections: [
        { id: "opening", kind: "hero", title: "Portada propia" },
        { id: "story", kind: "story", title: "Nuestra historia" },
        { id: "shop", kind: "catalog", title: "La colección" },
      ],
    },
  };
  const requests = await openDashboard(page, [aiStore]);
  await page.evaluate(() => {
    window.__chromePreviewMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "preview-test") window.__chromePreviewMessages.push(event.data.payload);
    });
  });
  await expect(page.locator("#previewEditorTools")).toBeHidden();
  await expect(page.locator("#previewWorkspaceSplitter")).toHaveCount(0);

  const sendFromPreview = (type, payload) => page.evaluate(({ eventType, eventPayload }) => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: "pagosya-checkout", type: eventType, payload: eventPayload },
    }));
  }, { eventType: type, eventPayload: payload });
  const navigationSelection = { section: "navigation", field: "navigationLabel", label: "Inicio", itemIndex: 0 };
  await sendFromPreview("STORE_EDITOR_SELECT", { selection: navigationSelection });
  await sendFromPreview("STORE_EDITOR_INLINE_TEXT", { selection: navigationSelection, value: "Comenzar" });
  await sendFromPreview("STORE_EDITOR_NAVIGATION_FIELD", { action: "update", index: 0, key: "target", value: "section:shop" });
  await sendFromPreview("STORE_EDITOR_NAVIGATION_FIELD", { action: "add" });

  const footerSelection = { section: "footer", field: "section", label: "Pie de página" };
  await sendFromPreview("STORE_EDITOR_SELECT", { selection: footerSelection });
  await sendFromPreview("STORE_EDITOR_FOOTER_FIELD", { selection: footerSelection, key: "brandDescription", value: "Recetas honestas, hechas en Bolivia." });
  await sendFromPreview("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-item", columnIndex: 0 });
  await sendFromPreview("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-column" });
  await expect.poll(() => page.evaluate(() => window.__chromePreviewMessages.filter((message) => message.type === "PAGOSYA_STORE_PREVIEW").length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__chromePreviewMessages
    .filter((message) => message.type === "PAGOSYA_STORE_PREVIEW")
    .every((message) => !message.previewAction && !message.previewSection))).toBe(true);

  await page.evaluate(() => { window.__chromePreviewMessages = []; });
  await page.locator("#previewEditMode").click();
  await expect.poll(() => page.evaluate(() => window.__chromePreviewMessages.some((message) =>
    message.type === "PAGOSYA_STORE_EDITOR_SELECTION" && message.editorMode === false && message.editorSelection === null,
  ))).toBe(true);
  expect(await page.evaluate(() => {
    const messages = window.__chromePreviewMessages;
    const modeIndex = messages.findIndex((message) => message.type === "PAGOSYA_STORE_EDITOR_SELECTION" && message.editorMode === false);
    const rebuildIndex = messages.findIndex((message) => message.type === "PAGOSYA_STORE_PREVIEW" && message.editorMode === false);
    return rebuildIndex === -1 || modeIndex < rebuildIndex;
  })).toBe(true);
  await page.locator("#previewEditMode").click();

  if (process.env.CAPTURE_STOREFRONT_CHROME_UI === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "../../.impeccable/storefront-chrome-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#storePreviewStage").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "../../.impeccable/storefront-chrome-mobile.png", fullPage: false });
  }

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.siteNavigationItems.map(({ label, target, sectionId }) => ({ label, target, sectionId }))).toEqual([
    { label: "Comenzar", target: "section", sectionId: "shop" },
    { label: "Catálogo", target: "catalog", sectionId: undefined },
    { label: "Our Story", target: "section", sectionId: "story" },
    { label: "Portada propia", target: "section", sectionId: "opening" },
  ]);
  expect(write.body.siteFooter.brandDescription).toBe("Recetas honestas, hechas en Bolivia.");
  expect(write.body.siteFooter.columns[0].items[0].href).toBe("#site-section-story");
  expect(write.body.siteFooter.columns[0].items[1]).toMatchObject({ label: "Nuevo enlace", href: "" });
  expect(write.body.siteFooter.columns[1]).toMatchObject({ title: "Nueva columna", items: [{ label: "Nuevo enlace", href: "" }] });
});

test("merchants can create a page, restructure the header, and configure the newsletter", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [{
    ...store("store_1", "Taller Norte"),
    siteDocument: {
      version: 1,
      navigation: {
        layout: "brand-left",
        sticky: true,
        transparent: false,
        items: [
          { id: "home", label: "Inicio", target: "home" },
          { id: "catalog", label: "Tienda", target: "catalog" },
        ],
      },
      footer: { enabled: true, columns: [] },
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "story", kind: "story", title: "Nuestra historia" },
        { id: "shop", kind: "catalog", title: "Colección" },
      ],
    },
  }]);

  const selectEditorSection = (selection) => page.evaluate((editorSelection) => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: "pagosya-checkout", type: "STORE_EDITOR_SELECT", payload: { selection: editorSelection } },
    }));
  }, selection);

  await page.locator("#previewStructureToggle").click();
  const editor = page.locator("#previewContextEditor");
  await expect(editor.getByText("Encabezado y páginas", { exact: true })).toBeVisible();
  await editor.getByLabel("Distribución").selectOption("centered");
  await editor.getByRole("button", { name: "Crear página" }).click();
  await expect(editor.locator("strong").filter({ hasText: /^Página 1$/ })).toBeVisible();
  await editor.getByLabel("Nombre", { exact: true }).fill("Historia");
  await editor.getByLabel("URL", { exact: true }).fill("historia-del-taller");
  await editor.locator(".preview-context-field").filter({ hasText: "Nuestra historia" }).locator("select").first().selectOption("page-1");

  await selectEditorSection({ section: "footer", field: "section", label: "Pie de página" });
  const newsletter = editor.locator(".preview-context-site-scene").filter({ hasText: "Boletín por correo" }).first();
  await expect(newsletter.getByText("Boletín por correo", { exact: true })).toBeVisible();
  await newsletter.getByLabel("Título", { exact: true }).fill("Cartas desde el taller");
  await newsletter.getByLabel("Descripción", { exact: true }).fill("Novedades, oficio y lanzamientos con calma.");

  if (process.env.CAPTURE_MULTIPAGE_UI === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "../../.impeccable/multipage-editor-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "../../.impeccable/multipage-editor-mobile.png", fullPage: false });
  }

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.sitePages).toEqual([{ id: "page-1", label: "Historia", slug: "historia-del-taller" }]);
  expect(write.body.siteSections.find((section) => section.id === "story").pageId).toBe("page-1");
  expect(write.body.siteNavigation).toMatchObject({ layout: "centered", sticky: true, transparent: false });
  expect(write.body.siteNavigationItems).toContainEqual(expect.objectContaining({ target: "page", pageId: "page-1" }));
  expect(write.body.siteFooter.newsletter).toMatchObject({
    enabled: true,
    title: "Cartas desde el taller",
    body: "Novedades, oficio y lanzamientos con calma.",
  });
});

test("the storefront owns the editing canvas without an upper options workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<main style="min-height:1200px;background:#f3ede2;padding:32px">
      <button id="touch-text" type="button">Texto de historia</button>
      <button id="touch-animation" type="button">Animación de apertura</button>
    </main>
    <script>
      const select = (selection) => parent.postMessage({ source: "pagosya-checkout", type: "STORE_EDITOR_SELECT", payload: { selection } }, "*");
      document.querySelector("#touch-text").onclick = () => select({ section: "site-story", field: "siteTitle", label: "Texto de historia" });
      document.querySelector("#touch-animation").onclick = () => select({ section: "animation-opening", field: "section", label: "Animación de apertura", animationId: "opening" });
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  await openDashboard(page, [{
    ...store("store_1", "Tienda seleccionable"),
    animations: [{ id: "opening", name: "Animación de apertura", type: "text-reveal-block", title: "Hola", subtitle: "Mundo", media: [] }],
    contentOrder: ["site-opening", "site-story", "animation-opening", "site-shop"],
    siteDocument: {
      version: 1,
      navigation: { layout: "split" },
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "story", kind: "story", title: "Texto de historia", body: "Historia" },
        { id: "shop", kind: "catalog", title: "Catálogo" },
      ],
    },
  }]);

  const tools = page.locator("#previewEditorTools");
  const preview = page.locator("#storePreviewFrame").contentFrame();
  await expect(page.locator("#previewWorkspaceSplitter")).toHaveCount(0);
  await expect(tools).toBeHidden();
  await expect(tools).toHaveAttribute("aria-hidden", "true");

  await preview.locator("#touch-text").click();
  await expect(tools).toBeHidden();

  await preview.locator("#touch-animation").click();
  await expect(tools).toBeHidden();
  const stageBox = await page.locator("#storePreviewStage").boundingBox();
  expect(stageBox?.height).toBeGreaterThan(760);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#storePreviewStage").scrollIntoViewIfNeeded();
  await preview.locator("#touch-text").click();
  await expect(tools).toBeHidden();
});

test("Tu tienda fills the viewport and reveals dashboard sections from the edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<main style="min-height:1400px;background:#efe8dc">Tienda completa</main><script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [store("store_1", "Tienda inmersiva")]);

  const fullscreen = page.locator("#previewFullscreenToggle");
  await fullscreen.click();
  await expect(page.locator("body")).toHaveClass(/store-preview-fullscreen/);
  await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator(".store-preview-panel").evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return [Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.width), Math.round(bounds.height)];
  })).toEqual([0, 0, 1440, 900]);
  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_SELECT",
        payload: { selection: { section: "navigation", field: "section", label: "Navegación superior" } },
      },
    }));
  });
  await expect.poll(() => page.locator(".store-preview-panel").evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return {
      parent: panel.parentElement?.tagName,
      rect: [Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.width), Math.round(bounds.height)],
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  })).toEqual({ parent: "BODY", rect: [0, 0, 1440, 900], bodyOverflow: "hidden" });
  if (process.env.CAPTURE_FULLSCREEN_UI === "1") {
    await page.waitForTimeout(220);
    await page.screenshot({ path: "../../.impeccable/store-fullscreen-desktop.png", fullPage: false });
  }

  const navHandle = page.locator("#storeFullscreenNavHandle");
  await expect(navHandle).toBeVisible();
  await navHandle.hover();
  await expect.poll(() => page.locator(".dashboard-sidebar").evaluate((sidebar) => Math.round(sidebar.getBoundingClientRect().x))).toBe(0);
  if (process.env.CAPTURE_FULLSCREEN_UI === "1") {
    await page.screenshot({ path: "../../.impeccable/store-fullscreen-navigation.png", fullPage: false });
  }
  await page.locator('.dashboard-nav-button[data-dashboard-view="products"]').click();
  await expect(page.locator("body")).not.toHaveClass(/store-preview-fullscreen/);
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "products");

  await page.locator('.dashboard-nav-button[data-dashboard-view="appearance"]').click();
  await fullscreen.click();
  if (process.env.CAPTURE_FULLSCREEN_UI === "1") {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(220);
    await page.screenshot({ path: "../../.impeccable/store-fullscreen-mobile.png", fullPage: false });
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/store-preview-fullscreen/);
  await expect(fullscreen).toBeFocused();
});

test("merchants can lock a section for regeneration and save a content-free recipe", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const siteDocument = {
    version: 1,
    artDirection: "editorial-house",
    sections: [
      { id: "opening", kind: "hero", title: "Portada propia", mediaUrls: [] },
      { id: "story", kind: "story", title: "Historia propia", mediaUrls: [] },
      { id: "shop", kind: "catalog", title: "La colección", mediaUrls: [] },
    ],
    theme: { productLayout: "editorial" },
    navigation: { layout: "split" },
  };
  const proposal = {
    id: "proposal_1",
    title: "Casa editorial",
    rationale: "Una composición editorial construida alrededor de la colección.",
    provider: "local-curated",
    status: "READY",
    config: { backgroundColor: "#f8fafc", accentColor: "#7a351f", fontStyle: "editorial", checkoutMode: "payment", siteDocument },
    sourceAssetUrls: [],
  };
  const aiStore = { ...store("store_1", "Tienda IA"), siteDocument };
  const requests = await openDashboard(page, [aiStore], ({ path, request }) => {
    if (path === "/stores/store_1/visual-studio") return { proposals: [proposal], versions: [], templates: [] };
    if (path === "/stores/store_1/visual-proposals" && request.method() === "POST") return {
      proposals: [proposal, { ...proposal, id: "proposal_2", title: "Atelier" }, { ...proposal, id: "proposal_3", title: "Estudio" }],
      mode: "local",
      engine: { closestSimilarities: [0.42, 0.31, 0.38], comparedAgainst: 9 },
    };
    if (path === "/stores/store_1/visual-proposals/proposal_1/template" && request.method() === "POST") {
      return { id: "template_1", name: "Editorial reusable", recipe: { version: 1 } };
    }
  });

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: "pagosya-checkout", type: "STORE_EDITOR_SECTION_LOCK", payload: { selection: { section: "site-story", field: "section", label: "Historia propia" }, locked: true } },
    }));
  });
  await expect.poll(() => requests.find((entry) => entry.path === "/stores/store_1/visual-section-locks")?.body?.sectionIds).toEqual(["story"]);
  await expect(page.locator("#previewEditorTools")).toBeHidden();
  if (process.env.CAPTURE_STOREFRONT_RECIPE_UI === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "../../.impeccable/storefront-lock-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#storePreviewStage").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "../../.impeccable/storefront-lock-mobile.png", fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await page.locator("#previewAiCreate").click();
  await page.locator("#visualStartOver").click();
  await page.locator("#visualGenerate").click();
  await expect.poll(() => requests.find((entry) => entry.path === "/stores/store_1/visual-proposals" && entry.method === "POST")?.body?.lockedSectionIds).toEqual(["story"]);
  await expect(page.locator("#visualStep3")).toBeVisible();
  await expect(page.locator("#visualProposalStatus")).toContainText("coincidencia más cercana fue 42%");
  await page.evaluate(() => document.querySelector("dialog[open]")?.close());
  if (process.env.CAPTURE_STOREFRONT_RECIPE_UI === "1") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "../../.impeccable/storefront-recipes-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#visualProposalStatus").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "../../.impeccable/storefront-recipes-mobile.png", fullPage: false });
  }

  page.once("dialog", (dialog) => dialog.accept("Editorial reusable"));
  await page.locator(".visual-save-template").first().click();
  await expect(page.locator("#visualProposalStatus")).toContainText("sin copiar productos, fotos ni textos");
  expect(requests.find((entry) => entry.path.endsWith("/proposal_1/template"))?.body).toEqual({ name: "Editorial reusable" });
});

test("saving bounds legacy AI section copy to the API limits", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const section = (id, kind, overrides = {}) => ({
    id,
    kind,
    layout: "split",
    width: "wide",
    align: "left",
    motion: "none",
    title: `${kind} title`,
    body: "",
    ctaLabel: "",
    backgroundColor: "#f8fafc",
    textColor: "#171717",
    mediaUrls: [],
    items: [],
    ...overrides,
  });
  const overlongSectionTitle = `Colección ${"✨".repeat(130)}`;
  const overlongItemTitle = `Escena ${"👟".repeat(110)}`;
  const requests = await openDashboard(page, [{
    ...store("store_1", "Tienda con texto heredado"),
    contentOrder: ["site-opening", "site-shop", "site-information"],
    siteDocument: {
      version: 1,
      sections: [
        section("opening", "hero", {
          title: overlongSectionTitle,
          items: [{ title: overlongItemTitle, body: "Texto de escena", mediaUrl: null }],
        }),
        section("shop", "catalog"),
        section("information", "contact"),
      ],
    },
  }]);

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(Array.from(write.body.siteSections[0].title)).toHaveLength(120);
  expect(Array.from(write.body.siteSections[0].items[0].title)).toHaveLength(100);
  expect(write.body.siteSections[0].title).toBe(Array.from(overlongSectionTitle.trim()).slice(0, 120).join(""));
  expect(write.body.siteSections[0].items[0].title).toBe(Array.from(overlongItemTitle.trim()).slice(0, 100).join(""));
});

test("merchant customizes a category banner and informational labels", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const category = { id: "category_1", name: "Calzado", bannerUrl: null, highlights: [] };
  const requests = await openDashboard(page, [store("store_1", "Zapateca")], async ({ path, request }) => {
    if (path === "/stores/store_1/categories" && request.method() === "GET") return [category];
    if (path === "/uploads" && request.method() === "POST") {
      return { url: "/v1/uploads/11111111-1111-4111-8111-111111111111.webp" };
    }
    if (path === "/stores/store_1/categories/category_1" && request.method() === "PATCH") {
      Object.assign(category, request.postDataJSON());
      return { ...category };
    }
    return undefined;
  });
  await page.route("http://localhost:3001/v1/uploads/11111111-1111-4111-8111-111111111111.webp", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));

  await page.evaluate(() => setDashboardView("categories"));
  await page.locator("#categoriesSection .section-toggle").click();
  const row = page.locator('.category-order-row[data-id="category_1"]');
  await row.locator("summary").click();
  await row.locator('[data-category-banner-input="category_1"]').setInputFiles({
    name: "calzado.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("category-banner"),
  });
  await expect(page.locator("#info")).toContainText("Portada de");
  await expect(row.locator(".category-banner-preview img")).toHaveAttribute("src", /11111111-1111-4111-8111-111111111111\.webp$/);

  await row.locator(".category-highlight-input").nth(0).fill("Envío rápido");
  await row.locator(".category-highlight-input").nth(1).fill("Compra segura");
  await row.getByRole("button", { name: "Guardar mensajes" }).click();
  await expect(page.locator("#info")).toContainText("Mensajes de");

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "portada-directa.png", { type: "image/png" });
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_IMAGE",
        payload: { selection: { section: "products", field: "categoryBanner", label: "portada de Calzado", itemId: "category_1" }, file },
      },
    }));
  });
  await expect.poll(() => requests.filter((entry) => entry.path === "/stores/store_1/categories/category_1" && entry.method === "PATCH").length).toBe(3);

  const categoryWrites = requests.filter((entry) => entry.path === "/stores/store_1/categories/category_1" && entry.method === "PATCH");
  expect(categoryWrites).toHaveLength(3);
  expect(categoryWrites[0].body).toEqual({ bannerUrl: "/v1/uploads/11111111-1111-4111-8111-111111111111.webp" });
  expect(categoryWrites[1].body).toEqual({ highlights: ["Envío rápido", "Compra segura"] });
  expect(categoryWrites[2].body).toEqual({ bannerUrl: "/v1/uploads/11111111-1111-4111-8111-111111111111.webp" });
});

test("AI signature text becomes a normal editable animation and saves through the animation model", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const aiStore = {
    ...store("store_1", "Tienda IA tipográfica"),
    contentOrder: ["site-opening", "site-shop", "site-information"],
    siteDocument: {
      version: 1,
      theme: { textColor: "#f4ead7", surfaceColor: "#171612" },
      experience: {
        type: "text-rotate",
        placement: "after-catalog",
        title: "Vestidos|Abrigos",
        body: "Encuentra tu próximo favorito",
        mediaUrls: [],
      },
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "shop", kind: "catalog", title: "Colección" },
        { id: "information", kind: "links", title: "Síguenos" },
      ],
    },
  };
  const requests = await openDashboard(page, [aiStore]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await page.locator("#storeAnimationTextTab").click();

  const signature = page.locator('.animation-card[data-animation-id="ai-signature-experience"]');
  await expect(signature).toBeVisible();
  await signature.locator(".animation-card-toggle").click();
  await expect(signature.locator('[data-animation-field="title"]')).toHaveValue("Vestidos|Abrigos");
  await expect(signature.locator('[data-animation-field="subtitle"]')).toHaveValue("Encuentra tu próximo favorito");
  await signature.locator('[data-animation-field="title"]').fill("Blusas|Pantalones");
  await signature.locator('[data-animation-field="subtitle"]').fill("Hecho para acompañarte");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toContainEqual(expect.objectContaining({
    id: "ai-signature-experience",
    type: "text-rotate",
    title: "Blusas|Pantalones",
    subtitle: "Hecho para acompañarte",
  }));
  expect(write.body.contentOrder).toEqual(["site-opening", "site-shop", "animation-ai-signature-experience", "site-information"]);
});

test("AI signature pictures are editable and Zoom Parallax is no longer offered", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const aiStore = {
    ...store("store_1", "Tienda IA visual"),
    contentOrder: ["site-opening", "site-shop", "site-information"],
    siteDocument: {
      version: 1,
      theme: { textColor: "#fffaf2", surfaceColor: "#111111" },
      experience: {
        type: "frame-sequence",
        placement: "after-catalog",
        title: "Mundo visual",
        body: "Dos escenas editables",
        mediaUrls: ["/uploads/ai-one.webp", "/uploads/ai-two.webp"],
      },
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "shop", kind: "catalog", title: "Colección" },
        { id: "information", kind: "links", title: "Síguenos" },
      ],
    },
  };
  const requests = await openDashboard(page, [aiStore]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await page.locator("#storeAnimationVisualTab").click();

  const signature = page.locator('.animation-card[data-animation-id="ai-signature-experience"]');
  await expect(signature).toBeVisible();
  await signature.locator(".animation-card-toggle").click();
  await expect(signature.locator(".animation-media-row")).toHaveCount(2);
  await expect(page.locator('#storeAnimationTypePicker option[value="zoom-parallax"]')).toHaveCount(0);
  await signature.locator(".animation-media-row").nth(1).getByRole("button", { name: "Quitar" }).click();
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  const savedSignature = write.body.animations.find((animation) => animation.id === "ai-signature-experience");
  expect(savedSignature.media).toHaveLength(1);
  expect(savedSignature.media[0].imageUrl).toBe("/uploads/ai-one.webp");
  expect(write.body.motionExperiences).not.toContain("zoom-parallax");
});

test("AI gallery pictures keep their exact selection on the live preview", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const aiStore = {
    ...store("store_1", "Tienda IA editable"),
    contentOrder: ["site-opening", "site-shop", "site-visual-world", "site-information"],
    siteDocument: {
      version: 1,
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "shop", kind: "catalog", title: "La colección" },
        { id: "visual-world", kind: "gallery", title: "La marca en imágenes", mediaUrls: ["/uploads/gallery-one.webp", "/uploads/gallery-two.webp"] },
        { id: "information", kind: "contact", title: "Conversemos" },
      ],
    },
  };
  await openDashboard(page, [aiStore]);

  await expect(page.locator(".editorial-gallery-row")).toHaveCount(2);
  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: {
      selection: {
        section: "site-visual-world",
        field: "editorialMedia",
        label: "imagen 2 de La marca en imágenes",
        itemIndex: 1,
      },
    },
  }, "*"));

  await expect(page.locator("#previewSelectedSection")).toHaveText("La marca en imágenes");
  await expect(page.locator("#previewContextEditor")).toContainText("imagen 2 de La marca en imágenes");
  await expect(page.locator("#previewEditorTools")).toBeHidden();
});

test("named site blocks edit and reorder through the storefront inspector", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const section = (id, kind, title) => ({
    id, kind, title, body: "", ctaLabel: "", layout: "split", width: "wide", align: "left", motion: "none",
    family: "editorial", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [], blocks: [],
  });
  const story = {
    ...section("brand-story", "story", "Nuestra historia"),
    blocks: [
      { id: "heading", kind: "heading", slot: "heading", role: "primary", text: "Nuestra historia", mediaUrl: null, children: [] },
      { id: "body", kind: "text", slot: "body", role: "supporting", text: "Texto original", mediaUrl: null, children: [] },
    ],
  };
  const requests = await openDashboard(page, [{
    ...store("store_1", "Tienda por bloques"),
    contentOrder: ["site-opening", "site-brand-story", "site-shop", "site-information"],
    siteDocument: { version: 1, sections: [section("opening", "hero", "Portada"), story, section("shop", "catalog", "Tienda"), section("information", "contact", "Contacto")] },
  }]);
  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "site-brand-story", field: "siteBlockText", label: "texto de historia", itemId: "body" } },
  }, "*"));

  await page.getByLabel("Dirección base de la tienda").selectOption("graphic-market");
  await expect(page.locator("#previewContextEditor")).toContainText("Escala póster");

  await page.locator("#previewContextEditor").getByRole("button", { name: "Mover antes", includeHidden: true }).evaluate((button) => button.click());
  const blockInput = page.locator("#previewContextEditor").getByLabel("Contenido del texto");
  await expect(blockInput).toHaveValue("Texto original");
  await blockInput.evaluate((input) => {
    input.value = "Texto ordenado como bloque";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#previewContextEditor").getByLabel("Familia visual").evaluate((select) => {
    select.value = "cinematic";
    select.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.filter((request) => request.method === "PUT" && request.path === "/stores/store_1/settings").at(-1);
  expect(write.body.siteArtDirection).toBe("graphic-market");
  const savedStory = write.body.siteSections.find((entry) => entry.id === "brand-story");
  expect(write.body.siteSections.find((entry) => entry.id === "opening")).toMatchObject({ family: "product-led", layout: "offset" });
  expect(savedStory.blocks.map((block) => block.id)).toEqual(["body", "heading"]);
  expect(savedStory.blocks[0].text).toBe("Texto ordenado como bloque");
  expect(savedStory.family).toBe("cinematic");
  expect(savedStory.layout).toBe("rail");
});

test("gallery photos keep product links without restoring the removed preview rail", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>
      addEventListener("message", (event) => {
        if (event.data?.type !== "PAGOSYA_STORE_PREVIEW") return;
        document.body.dataset.previewAction = event.data.previewAction || "";
        document.body.dataset.previewProduct = event.data.previewProduct?.id || "";
      });
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  const products = [
    { id: "product_1", name: "Zapatilla retro", amount: 42000, currency: "BOB", status: "ACTIVE", categoryId: null, stock: 10, tags: [], variants: [], extras: [], imageUrls: ["/uploads/retro.webp"], imagePositions: ["50% 50%"] },
    { id: "product_2", name: "Bolso urbano", amount: 26000, currency: "BOB", status: "ACTIVE", categoryId: null, stock: 4, tags: [], variants: [], extras: [], imageUrls: ["/uploads/bolso.webp"], imagePositions: ["50% 50%"] },
  ];
  const requests = await openDashboard(page, [{
    ...store("store_1", "Tienda enlazada"),
    editorialGallery: [{ imageUrl: "/uploads/retro.webp", title: "El favorito" }],
  }], ({ path }) => path === "/stores/store_1/payment_links" ? products : undefined);

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "gallery", field: "editorialMedia", label: "imagen editorial 1", itemIndex: 0 } },
  }, "*"));
  await expect(page.locator("#previewEditorTools")).toBeHidden();
  const productSelect = page.locator(".editorial-gallery-row .editorial-product-link").first();
  await productSelect.evaluate((select) => {
    select.value = "product_2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const settingsWrite = requests.filter((request) => request.method === "PUT" && request.path.endsWith("/settings")).at(-1);
  expect(settingsWrite.body.editorialGallery[0]).toEqual(expect.objectContaining({
    imageUrl: "/uploads/retro.webp",
    productId: "product_2",
  }));
});

test("the storefront marquesina opens text, movement, typography, effects, speed, and color controls", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [{
    ...store("store_1", "Tienda con marquesina"),
    announcement: "Envíos hoy • Pedidos hasta las 18:00",
    announcementMode: "static",
    announcementSpeed: 18,
    announcementColor: "#ffffff",
    announcementFont: "editorial",
    announcementEffect: "wave",
  }]);

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "announcement", field: "announcementText", label: "marquesina superior" } },
  }, "*"));

  const editor = page.locator("#previewContextEditor");
  await expect(page.locator("#previewSelectedSection")).toHaveText("Marquesina");
  await expect(editor.getByLabel("Texto de la marquesina")).toHaveValue("Envíos hoy • Pedidos hasta las 18:00");
  await expect(editor.getByLabel("Movimiento")).toHaveValue("static");
  await expect(editor.getByLabel("Color de fondo")).toHaveValue("#ffffff");
  await expect(editor.getByLabel("Tipografía")).toHaveValue("editorial");
  await expect(editor.getByLabel("Letras animadas")).toHaveValue("wave");
  await expect(editor.getByLabel("Duración de una vuelta")).toHaveCount(0);

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_ANNOUNCEMENT_STYLE",
    payload: {
      selection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      key: "announcementMode",
      value: "marquee",
    },
  }, "*"));
  await expect(editor.getByLabel("Duración de una vuelta")).toHaveValue("18");
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INLINE_TEXT",
    payload: {
      selection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      value: "Hamburguesas listas • Pedidos abiertos",
    },
  }, "*"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_ANNOUNCEMENT_STYLE",
    payload: {
      selection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      key: "announcementEffect",
      value: "sparkle",
    },
  }, "*"));
  await expect(page.locator("#storeAnnouncementInput")).toHaveValue("Hamburguesas listas • Pedidos abiertos");
  await expect(page.locator("#storeAnnouncementEffect")).toHaveValue("sparkle");

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_ANNOUNCEMENT_STYLE",
    payload: {
      selection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      key: "announcementSize",
      value: "large",
    },
  }, "*"));
  await expect(page.locator("#storeAnnouncementSize")).toHaveValue("large");

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_ANNOUNCEMENT_STYLE",
    payload: {
      selection: { section: "announcement", field: "announcementText", label: "marquesina superior" },
      key: "announcementColor",
      value: "#224466",
    },
  }, "*"));
  await expect(page.locator("#storeAnnouncementColor")).toHaveValue("#224466");
});

async function openYapi(page) {
  const restore = page.locator("#assistantRestore");
  if (await restore.isVisible()) await restore.click();
  else if (await page.locator("#assistantPanel").isHidden()) await page.locator("#assistantObject").click();
  await expect(page.locator("#assistantPanel")).toBeVisible();
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

test("merchant open-store links open the clean published storefront", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Tienda propia")]);

  const sharedUrl = new URL(await page.locator("#currentStoreLink").inputValue());
  expect(sharedUrl.pathname).toBe("/s/store_1");
  expect(sharedUrl.searchParams.has("link")).toBe(false);
  expect(sharedUrl.searchParams.has("owner")).toBe(false);
  expect(sharedUrl.searchParams.has("preview")).toBe(false);

  const rowOwnerUrl = new URL(await page.locator('.store-row[data-id="store_1"] .store-row-open').getAttribute("href"));
  expect(rowOwnerUrl.search).toBe("");
  const previewOwnerUrl = new URL(await page.locator("#previewOpen").getAttribute("href"));
  expect(previewOwnerUrl.search).toBe("");
});

test("touching non-editable preview space clears the mirrored editor selection", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [store("store_1", "Selección descartable")]);

  const sendPreviewSelection = (selection) => page.evaluate((payload) => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: "pagosya-checkout", type: "STORE_EDITOR_SELECT", payload: { selection: payload } },
    }));
  }, selection);

  await sendPreviewSelection({ section: "brand", field: "storeName", label: "nombre de la tienda" });
  await expect(page.locator("#previewContextEditor")).not.toHaveClass(/is-idle/);
  await sendPreviewSelection(null);
  await expect(page.locator("#previewContextEditor")).toHaveClass(/is-idle/);
  await expect(page.locator("#previewSelectionStatus")).toContainText("Ningún elemento seleccionado");
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
  await sliderMedia.first().getByRole("button", { name: "Bajar" }).click();
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
  await expect(page.locator("#previewSelectedSection")).toContainText("Slider principal");
  await expect(page.locator("#previewSelectionStatus")).toContainText("Completa sus opciones directamente");
  const contentLabels = await page.locator(".store-content-order-row .store-content-order-copy strong").allTextContents();
  expect(contentLabels.indexOf("Slider principal")).toBe(contentLabels.indexOf("Redes y enlaces") - 1);
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
    motionExperience: "hero-carousel",
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
  expect(new URL(initialSrc).searchParams.get("preview")).toBe("1");
  expect(new URL(initialSrc).searchParams.get("editor")).toBe("1");
  expect(new URLSearchParams(new URL(initialSrc).hash.slice(1)).get("parent_origin")).toBe("http://127.0.0.1:4323");
  await name.fill("");
  await name.pressSequentially("Suave", { delay: 20 });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Suave");
  await expect(page.locator("#storePreviewFrame")).toHaveAttribute("src", initialSrc);
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.patch?.storeName === "Suave"))).toBe(false);
  await name.press("Tab");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewSection === "brand" && message.patch?.storeName === "Suave"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  const migratedSlider = page.locator(".animation-card").filter({ hasText: "Slider principal" }).last();
  await migratedSlider.locator(".animation-card-toggle").click();
  await migratedSlider.locator('[data-animation-media-field="title"]').nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.type === "PAGOSYA_STORE_EDITOR_SELECTION" && message.editorSelection?.section === "animation-legacy-main-slider" && message.editorSelection?.itemIndex === 1))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Mensaje y contacto" }).click();
  await page.getByRole("button", { name: "Mostrar Textos y secciones de la tienda" }).click();
  await page.locator("#storeCatalogTitle").fill("Selección nueva");
  await page.locator("#storeCatalogTitle").press("Tab");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewSection === "products" && message.patch?.catalogTitle === "Selección nueva"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Contenido y orden" }).click();
  await page.locator("#editorialTitle1").fill("Segunda historia editada");
  await page.locator("#editorialTitle1").press("Tab");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "editorial-item" && message.previewTargetIndex === 1 && message.previewTargetKind === "text"))).toBe(true);
  await page.locator('.editorial-gallery-row[data-index="1"] .editorial-card-preview').click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "editorial-item" && message.previewTargetIndex === 1 && message.previewTargetKind === "media"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Cómo termina el pedido" }).click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "cart"))).toBe(true);

  await page.getByRole("button", { name: "Mostrar Estilo" }).click();
  await page.locator("#storeCartButtonLabel").fill("Finalizar pedido");
  await page.locator("#storeCartButtonLabel").evaluate((input) => input.blur());
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "cart" && message.patch?.cartButtonLabel === "Finalizar pedido"))).toBe(true);
});

test("preview clicks edit the exact element without opening a second editor", async ({ page }) => {
  if (!process.env.CAPTURE_VISUAL_EDITOR) {
    await page.route("http://localhost:5175/**", (route) => route.fulfill({
      contentType: "text/html",
      body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
    }));
  }
  const fulfillPreviewImage = (route) => route.fulfill({
    contentType: "image/svg+xml",
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#d62828"/></svg>`,
  });
  await page.route("http://localhost:3001/uploads/**", fulfillPreviewImage);
  const previewUploadPrefix = process.env.CAPTURE_VISUAL_EDITOR ? "/v1/uploads" : "/uploads";
  const editableStore = {
    ...store("store_1", "Tienda editable"),
    heroSlides: [{ imageUrl: `${previewUploadPrefix}/hero-red.webp`, title: "Temporada roja", body: "Una historia", ctaLabel: "Ver" }],
    contentOrder: ["hero", "animation-opening", "products", "links"],
    animations: [{
      id: "opening",
      name: "Apertura",
      type: "story-scroll",
      media: [
        { imageUrl: `${previewUploadPrefix}/hero-red.webp`, title: "", caption: "", body: "" },
        { imageUrl: `${previewUploadPrefix}/product-one.webp`, title: "Segunda imagen", caption: "Continuación", body: "Segunda escena" },
      ],
    }],
    siteDocument: {
      version: 1,
      theme: {},
      navigation: { items: [] },
      sections: [
        { id: "opening", kind: "hero", title: "Portada" },
        { id: "shop", kind: "catalog", title: "La colección" },
      ],
    },
  };
  const requests = await openDashboard(page, [editableStore], ({ path }) => {
    if (path === "/stores/store_1/payment_links") {
      return [
        { id: "product_1", name: "Vaso Terracota", status: "ACTIVE", imageUrls: [`${previewUploadPrefix}/product-one.webp`], tags: ["Nuevo"], description: "Torno manual y esmalte mate." },
        { id: "product_2", name: "Jarra Obsidiana", status: "ACTIVE", imageUrls: [`${previewUploadPrefix}/product-two.webp`], tags: [], description: "Una silueta firme para la mesa." },
      ];
    }
    if (!process.env.CAPTURE_VISUAL_EDITOR || path !== "/stores/public/store_1/store") return undefined;
    return {
      storeId: "store_1",
      storeName: editableStore.name,
      tagline: "Objetos cotidianos, hechos con intención.",
      logoUrl: null,
      bannerUrl: `${previewUploadPrefix}/hero-red.webp`,
      backgroundColor: "#f7f2e8",
      backgroundMode: "solid",
      backgroundGradientStart: "#f7f2e8",
      backgroundGradientEnd: "#f7f2e8",
      backgroundGradientAngle: 0,
      backgroundImageUrl: null,
      contactPhone: null,
      contactEmail: "hola@taller.local",
      contactFormEnabled: true,
      contactTitle: "Hablemos de tu próxima pieza",
      contactSubtitle: "Cuéntanos qué imaginas y respondemos personalmente.",
      aboutText: "Una colección pequeña de piezas honestas, hechas para acompañar todos los días.",
      aboutTitle: "Hecho despacio. Vivido a diario.",
      aboutSubtitle: "Materiales nobles y manos locales.",
      aboutImageUrl: null,
      catalogTitle: "La colección",
      catalogSubtitle: "Series cortas, ninguna pieza de más.",
      galleryTitle: "En el taller",
      gallerySubtitle: "El proceso también forma parte del objeto.",
      linksTitle: "Sigue el proceso",
      locationMapUrl: null,
      locationDescription: null,
      locationHighlight: null,
      accentColor: "#d62828",
      fontStyle: "editorial",
      buttonStyle: "square",
      boardTexture: "kraft",
      announcement: "Envíos a toda Bolivia · piezas limitadas",
      announcementMode: "static",
      announcementSpeed: 16,
      announcementSize: "small",
      announcementColor: "#171717",
      promotionEnabled: false,
      promotionImageUrl: null,
      promotionTitle: null,
      promotionBody: null,
      promotionCtaLabel: null,
      promotionCtaUrl: null,
      heroSlides: editableStore.heroSlides,
      contentOrder: editableStore.contentOrder,
      sectionBackgrounds: {},
      layoutStyle: "editorial",
      experienceStyle: "editorial-grid",
      motionDuoEnabled: false,
      motionExperience: "circle-reveal",
      motionExperiences: ["circle-reveal"],
      animations: editableStore.animations,
      editorialGallery: [],
      buttonVariant: "solid",
      buttonMotion: "lift",
      cartButtonLabel: "Ver selección",
      checkoutMode: "payment",
      leadCaptureUrl: null,
      cartRecommendationsEnabled: true,
      cartRecommendationProductIds: [],
      showLowStockToCustomers: false,
      links: [{ id: "link_1", label: "Instagram", url: "https://instagram.com/taller" }],
      categories: [{ id: "category_1", name: "Colección" }],
      items: [
        { id: "product_1", categoryId: "category_1", name: "Vaso Terracota", description: "Torno manual y esmalte mate.", imageUrls: [`${previewUploadPrefix}/product-one.webp`], tags: ["Nuevo"], stock: 8, color: "#d62828", variants: [], extras: [], amount: 12500, currency: "BOB", discountPercent: null, discountStartsAt: null, discountEndsAt: null, soldCount: 12 },
        { id: "product_2", categoryId: "category_1", name: "Jarra Obsidiana", description: "Una silueta firme para la mesa.", imageUrls: [`${previewUploadPrefix}/product-two.webp`], tags: [], stock: 4, color: "#171717", variants: [], extras: [], amount: 24000, currency: "BOB", discountPercent: null, discountStartsAt: null, discountEndsAt: null, soldCount: 7 },
      ],
    };
  });
  if (process.env.CAPTURE_VISUAL_EDITOR) await page.route("http://localhost:3001/v1/uploads/**", fulfillPreviewImage);

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  expect(previewFrame).toBeTruthy();
  await page.evaluate(() => {
    window.__appearanceClassMutations = 0;
    const appearance = document.querySelector('[data-dashboard-page="appearance"]');
    window.__appearanceClassObserver = new MutationObserver((records) => {
      window.__appearanceClassMutations += records.filter((record) => record.attributeName === "class").length;
    });
    window.__appearanceClassObserver.observe(appearance, { attributes: true, attributeFilter: ["class"] });
  });
  await previewFrame.evaluate(() => {
    window.__dashboardSelectionMessages = [];
    addEventListener("message", (event) => {
      if (event.data?.type === "PAGOSYA_STORE_EDITOR_SELECTION") window.__dashboardSelectionMessages.push(event.data);
    });
  });
  const selectInPreview = (selection) => previewFrame.evaluate((payload) => {
    parent.postMessage({ source: "pagosya-checkout", type: "STORE_EDITOR_SELECT", payload: { selection: payload } }, "*");
  }, selection);

  if (!process.env.CAPTURE_VISUAL_EDITOR) {
    await previewFrame.evaluate(() => parent.postMessage({
      source: "pagosya-checkout",
      type: "STORE_EDITOR_INLINE_TEXT",
      payload: {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        value: "Tienda desde el lienzo",
      },
    }, "*"));
    await expect(page.locator("#storeNameInput")).toHaveValue("Tienda desde el lienzo");

    await previewFrame.evaluate(() => parent.postMessage({
      source: "pagosya-checkout",
      type: "STORE_EDITOR_ANIMATION_FIELD",
      payload: {
        selection: { section: "animation-opening", field: "subtitle", label: "descripción visible", animationId: "opening" },
        key: "subtitle",
        value: "Una historia editada en la tienda",
      },
    }, "*"));
    await expect(page.locator('.animation-card[data-animation-id="opening"] [data-animation-field="subtitle"]')).toHaveValue("Una historia editada en la tienda");

    await previewFrame.evaluate(() => parent.postMessage({
      source: "pagosya-checkout",
      type: "STORE_EDITOR_INSERT_SECTION",
      payload: { choice: "footer", insertAfter: "links" },
    }, "*"));
    await expect(page.locator("#previewEditorTools")).toBeHidden();
    await expect(page.locator("#storeStudio")).toHaveClass(/is-preview-expanded/);

    await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
    await expect(page.locator("#info")).toContainText("guardados");
    const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
    expect(write.body.name).toBe("Tienda desde el lienzo");
    expect(write.body.animations[0].subtitle).toBe("Una historia editada en la tienda");
    expect(write.body.siteFooter.enabled).toBe(true);
    return;
  }

  await selectInPreview({ section: "brand", field: "storeName", label: "nombre de la tienda" });
  await expect.poll(() => previewFrame.evaluate(() => window.__dashboardSelectionMessages.some((message) =>
    message.editorSelection?.section === "brand" && message.reveal === false,
  ))).toBe(true);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__appearanceClassMutations)).toBe(0);
  const inlineStoreName = page.locator("#previewContextEditor input[type='text']").first();
  await expect(inlineStoreName).toBeVisible();
  await expect(inlineStoreName).toHaveValue("Tienda editable");
  await expect(inlineStoreName).not.toBeFocused();
  await inlineStoreName.fill("Tienda desde el lienzo");
  await expect(page.locator("#storeNameInput")).toHaveValue("Tienda desde el lienzo");
  await expect(page.locator("#previewSelectionStatus")).toContainText("nombre de la tienda");

  await selectInPreview({ section: "products", field: "section", label: "sección catálogo" });
  await expect(page.locator("#previewSelectedSection")).toHaveText("Catálogo");
  await page.locator("#previewSectionColorEnabled").check();
  await page.locator("#previewSectionColor").evaluate((input) => {
    input.value = "#d62828";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#previewSectionPosition").selectOption("0");

  await selectInPreview({ section: "animation-opening", field: "subtitle", label: "descripción visible", animationId: "opening" });
  await expect(page.locator("#previewContextEditor")).toContainText("Subtítulo general");
  await expect(page.locator("#previewContextEditor").getByLabel("Subtítulo general")).toBeVisible();
  await expect(page.locator("#previewContextEditor").getByLabel("Posición horizontal")).toHaveCount(0);
  await expect(page.locator("#previewContextEditor").getByLabel("Posición vertical")).toHaveCount(0);
  await expect(page.locator("#previewContextEditor").getByLabel("Color del texto")).toBeVisible();
  await expect(page.locator("#previewContextEditor").getByLabel("Fondo de la animación")).toBeVisible();
  await page.locator("#previewContextEditor").getByRole("button", { name: "Insertar título general" }).click();
  await expect(page.locator('.animation-card[data-animation-id="opening"] [data-animation-field="title"]')).toHaveValue("Escribe aquí tu título");
  await expect(page.locator("#previewUndo")).toBeEnabled();
  await page.locator("#previewUndo").click();
  await expect(page.locator('.animation-card[data-animation-id="opening"] [data-animation-field="title"]')).toHaveValue("");
  await page.locator("#previewContextEditor").getByRole("button", { name: "Editar imagen 1" }).click();
  await page.locator("#previewContextEditor").getByRole("button", { name: "Insertar título en escena 1" }).click();
  await expect(page.locator('#animation-0-media-0-title')).toHaveValue("Escribe aquí tu título");
  await page.locator("#previewContextEditor").getByRole("button", { name: "Insertar subtítulo en escena 1" }).click();
  await expect(page.locator('#animation-0-media-0-caption')).toHaveValue("Escribe aquí tu subtítulo");
  await page.locator("#previewContextEditor").getByRole("button", { name: "Copiar texto" }).click();

  await expect(page.locator("#previewContextEditor").getByRole("button", { name: "Editar imagen 1" })).toBeVisible();
  await page.locator("#previewContextEditor").getByRole("button", { name: "Editar imagen 2" }).click();
  await expect(page.locator("#previewContextEditor").getByRole("button", { name: "Editar imagen 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#previewContextEditor").getByRole("textbox", { name: "Título (opcional)", exact: true })).toHaveValue("Segunda imagen");
  await page.locator("#previewContextEditor").getByRole("button", { name: "Pegar texto aquí" }).click();
  await expect(page.locator("#previewContextEditor").getByRole("textbox", { name: "Título (opcional)", exact: true })).toHaveValue("Escribe aquí tu título");
  await expect(page.locator("#previewContextEditor").getByRole("textbox", { name: "Subtítulo (opcional)", exact: true })).toHaveValue("Escribe aquí tu subtítulo");
  await expect(page.locator("#previewContextEditor")).toContainText("Reemplazar imagen 2 con");
  await page.locator("#previewContextEditor").getByRole("button", { name: /Reemplazar imagen 2 por Jarra Obsidiana/ }).click();
  const openingMedia = page.locator('.animation-card[data-animation-id="opening"] .animation-media-row img');
  await expect(openingMedia.nth(0)).toHaveAttribute("src", /hero-red\.webp$/);
  await expect(openingMedia.nth(1)).toHaveAttribute("src", /product-two\.webp$/);
  await expect(page.locator('#animation-0-media-1-title')).toHaveValue("Escribe aquí tu título");
  await expect(page.locator('#animation-0-media-1-caption')).toHaveValue("Escribe aquí tu subtítulo");

  const animationCountBeforeAdd = await page.locator(".animation-card").count();
  await page.locator("#previewAddSection").selectOption("animation:story-scroll");
  await expect(page.locator(".animation-card")).toHaveCount(animationCountBeforeAdd + 1);
  const createdAnimationId = await page.locator(".animation-card").last().getAttribute("data-animation-id");
  const sectionOrderAfterAdd = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(sectionOrderAfterAdd.indexOf(`animation-${createdAnimationId}`)).toBe(sectionOrderAfterAdd.indexOf("animation-opening") + 1);

  await selectInPreview({ section: `animation-${createdAnimationId}`, field: "section", label: "animación nueva", animationId: createdAnimationId });
  await page.locator("#previewAddSection").selectOption("about");
  const sectionOrderAfterMove = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(sectionOrderAfterMove.indexOf("about")).toBe(sectionOrderAfterMove.indexOf(`animation-${createdAnimationId}`) + 1);

  await selectInPreview({ section: "brand", field: "storeName", label: "nombre de la tienda" });
  const paletteSwatch = page.locator("#storeImagePaletteSwatches [data-palette-color]").first();
  await expect(paletteSwatch).toBeVisible();
  const paletteColor = await paletteSwatch.getAttribute("data-palette-color");
  await paletteSwatch.click();
  await expect(page.locator("#storeAccentColor")).toHaveValue(paletteColor);
  await expect(page.locator("#storeAccentToggle")).toBeChecked();
  if (process.env.CAPTURE_VISUAL_EDITOR) {
    if (await page.locator("#assistantClose").isVisible()) await page.locator("#assistantClose").click();
    await selectInPreview({ section: "animation-opening", field: "subtitle", label: "descripción visible", animationId: "opening" });
    await page.locator("#previewContextEditor").getByLabel("Título general", { exact: true }).fill("Una historia a tu manera");
    await page.locator("#previewContextEditor").getByLabel("Alineación").selectOption("right");
    await page.locator("#previewContextEditor").getByLabel("Fondo de la animación").evaluate((input) => {
      input.value = "#24114f";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const checkoutFrame = page.locator("#storePreviewFrame").contentFrame();
    const openingSection = checkoutFrame.locator('[data-animation-id="opening"]');
    const openingCopy = openingSection.locator("[data-animation-copy]").first();
    await expect(openingCopy).toHaveClass(/store-animation-layout-selected/);
    await openingCopy.evaluate((copy) => {
      const bounds = (copy.offsetParent || copy).getBoundingClientRect();
      const copyBounds = copy.getBoundingClientRect();
      const pointer = (target, type, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 41,
        pointerType: "touch",
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      }));
      pointer(copy, "pointerdown", copyBounds.left + copyBounds.width / 2, copyBounds.top + copyBounds.height / 2, 1);
      pointer(window, "pointermove", bounds.left + bounds.width * 0.72, bounds.top + bounds.height * 0.38, 1);
      pointer(window, "pointerup", bounds.left + bounds.width * 0.72, bounds.top + bounds.height * 0.38, 0);
    });
    const openingCard = page.locator('.animation-card[data-animation-id="opening"]');
    await expect(openingCopy).toHaveAttribute("data-animation-text-x", "72");
    await expect(openingCopy).toHaveAttribute("data-animation-text-y", "38");
    const widthBefore = Number(await openingCopy.getAttribute("data-animation-text-width-percent"));
    await page.locator("#previewContextEditor").getByLabel("Ancho preciso").evaluate((input) => {
      input.value = String(Math.min(Number(input.max), Number(input.value) + 12));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(async () => Number(await openingCopy.getAttribute("data-animation-text-width-percent"))).toBeGreaterThan(widthBefore);
    const scaleBefore = Number(await openingCopy.getAttribute("data-animation-text-scale"));
    await page.locator("#previewContextEditor").getByLabel("Tamaño preciso").evaluate((input) => {
      input.value = String(Math.min(Number(input.max), Number(input.value) + 20));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(async () => Number(await openingCopy.getAttribute("data-animation-text-scale"))).toBeGreaterThan(scaleBefore);
    const draggedAnimationText = openingSection.locator('[data-animation-copy] [data-store-editor-inline="text"]').first();
    await draggedAnimationText.click();
    await expect(draggedAnimationText).toHaveAttribute("contenteditable", "plaintext-only");
    await draggedAnimationText.fill("Texto editable después de moverlo");
    await draggedAnimationText.press("Enter");
    await expect(draggedAnimationText).not.toHaveAttribute("contenteditable", "plaintext-only");
    await expect(openingCopy).toHaveAttribute("data-animation-copy-custom-layout", "");
    await expect(openingSection).toHaveAttribute("data-animation-text-align", "right");
    await expect(openingCopy).toHaveCSS("--animation-text-x", "72%");
    await expect(openingCopy).toHaveCSS("--animation-text-y", "38%");
    await expect.poll(async () => {
      const sectionBox = await openingSection.boundingBox();
      const copyBox = await openingSection.locator("[data-animation-copy]").first().boundingBox();
      return Boolean(sectionBox && copyBox && copyBox.x >= sectionBox.x && copyBox.x + copyBox.width <= sectionBox.x + sectionBox.width);
    }).toBe(true);
    await expect(page.locator("#storePreviewStage")).not.toHaveClass(/is-loading|is-error/);
    await page.evaluate(() => {
      if (!document.getElementById("storeStudio")?.classList.contains("is-preview-expanded")) {
        document.getElementById("previewExpandToggle")?.click();
      }
    });
    await page.locator(".store-preview-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "../../.impeccable/store-animation-layout.png", fullPage: false });
    await page.screenshot({ path: "../../.impeccable/store-editor-desktop.png", fullPage: false });
    const inlineTitle = previewFrame.locator(".store-title");
    await inlineTitle.dblclick();
    await expect(inlineTitle).toHaveAttribute("contenteditable", "plaintext-only");
    await inlineTitle.fill("Tienda guardada al salir");
    await page.screenshot({ path: "../../.impeccable/store-editor-inline.png", fullPage: false });
    await page.locator("#previewSelectedSection").click();
    await expect(page.locator("#storeNameInput")).toHaveValue("Tienda guardada al salir");
    await page.locator("#storeNameInput").evaluate((input) => {
      input.value = "Tienda desde el lienzo";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  await page.locator("#previewEditMode").evaluate((button) => button.click());
  await expect(page.locator("#previewEditMode")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#previewSelectionStatus")).toContainText("Navegación normal");

  const previewPanel = page.locator(".store-preview-panel");
  await previewPanel.scrollIntoViewIfNeeded();
  await expect(page.locator("#storeStudio")).toHaveClass(/is-preview-expanded/);
  await expect(page.locator("#storeSettingsForm")).toBeHidden();
  await expect(previewPanel).toBeVisible();
  await page.locator("#previewExpandToggle").evaluate((button) => button.click());
  await expect(page.locator("#storeSettingsForm")).toBeVisible();

  await page.locator("#previewAddSection").selectOption("contact");
  await expect(page.locator("#storeContactFormEnabled")).toBeChecked();

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.sectionBackgrounds).toEqual({ products: "#d62828" });
  expect(write.body.name).toBe("Tienda desde el lienzo");
  expect(write.body.contentOrder.indexOf("products")).toBeLessThan(write.body.contentOrder.indexOf("hero"));
  expect(write.body.animations).toHaveLength(animationCountBeforeAdd + 1);
  expect(write.body.animations[0].media.map((media) => media.imageUrl)).toEqual([`${previewUploadPrefix}/hero-red.webp`, `${previewUploadPrefix}/product-two.webp`]);
  await page.evaluate(() => {
    if (!document.getElementById("storeStudio").classList.contains("is-preview-expanded")) document.getElementById("previewExpandToggle").click();
  });
  await expect(page.locator("#storeStudio")).toHaveClass(/is-preview-expanded/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.getElementById("storePreviewStage")?.getBoundingClientRect();
    const tools = document.getElementById("previewEditorTools")?.getBoundingClientRect();
    return Boolean(canvas && tools && canvas.top < tools.top);
  })).toBe(true);
  if (process.env.CAPTURE_VISUAL_EDITOR) {
    await page.screenshot({ path: "../../.impeccable/store-editor-mobile.png", fullPage: false });
  }
});

test("preview section controls delete, restore, and insert at exact gaps", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const scrollMedia = Array.from({ length: 8 }, (_, index) => ({ imageUrl: `/uploads/expand-${index + 1}.webp`, title: `Expansión ${index + 1}` }));
  const requests = await openDashboard(page, [{
    ...store("store_1", "Composición directa"),
    animations: [
      { id: "expand", name: "Expansión", type: "scroll-expansion", media: scrollMedia },
      { id: "gallery", name: "Galería móvil", type: "hero-carousel", media: [
        { imageUrl: "/uploads/one.webp", title: "Uno" },
        { imageUrl: "/uploads/two.webp", title: "Dos" },
        { imageUrl: "/uploads/three.webp", title: "Tres" },
      ] },
    ],
    contentOrder: ["hero", "animation-expand", "animation-gallery", "products", "about", "gallery", "links"],
  }]);

  const expansionCard = page.locator('.animation-card[data-animation-id="expand"]');
  await expect(expansionCard.locator(".animation-media-row")).toHaveCount(2);
  await expect(expansionCard.locator(".animation-media-count")).toHaveText("2 / 2");
  await expect(expansionCard).toContainText("Usa exactamente 2 fotos");

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_DELETE_ANIMATION",
    payload: { animationId: "gallery" },
  }, "*"));
  await expect(page.locator('.animation-card[data-animation-id="gallery"]')).toHaveCount(0);
  await page.locator("#previewUndo").click();
  await expect(page.locator('.animation-card[data-animation-id="gallery"]')).toHaveCount(1);
  await expect(page.locator("#previewEditorTools")).toBeHidden();

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INSERT_SECTION",
    payload: { choice: "animation:text-reveal-block", insertAfter: "__start__" },
  }, "*"));
  let directOrder = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(directOrder[0]).toMatch(/^animation-/);
  const directTextAnimation = directOrder[0];
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INSERT_SECTION",
    payload: { choice: "gallery", insertAfter: "hero" },
  }, "*"));
  directOrder = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(directOrder.indexOf("gallery")).toBe(directOrder.indexOf("hero") + 1);

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const directWrite = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(directWrite.body.contentOrder[0]).toBe(directTextAnimation);
  expect(directWrite.body.animations.find((animation) => animation.id === "expand").media).toHaveLength(2);
  expect(directWrite.body.animations.find((animation) => animation.id === "gallery").media.map((media) => media.imageUrl)).toEqual([
    "/uploads/one.webp", "/uploads/two.webp", "/uploads/three.webp",
  ]);
  return;

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "animation-gallery", field: "media", label: "imagen 1 de la animación", animationId: "gallery", itemIndex: 0 } },
  }, "*"));
  const slots = page.locator('#previewContextEditor .preview-context-slot[data-animation-media-index]');
  await expect(slots).toHaveCount(3);
  await slots.nth(2).scrollIntoViewIfNeeded();
  const secondBox = await slots.nth(1).boundingBox();
  const thirdBox = await slots.nth(2).boundingBox();
  expect(secondBox).toBeTruthy();
  expect(thirdBox).toBeTruthy();
  await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width * 0.2, secondBox.y + secondBox.height / 2, { steps: 5 });
  await expect(page.locator("#previewContextEditor .preview-context-slot.is-dragging")).toHaveCount(1);
  await expect(page.locator("#previewContextEditor .preview-context-slot.is-drop-before")).toHaveCount(1);
  await page.mouse.up();
  const galleryImages = page.locator('.animation-card[data-animation-id="gallery"] .animation-media-row img');
  await expect(galleryImages.nth(0)).toHaveAttribute("src", /one\.webp$/);
  await expect(galleryImages.nth(1)).toHaveAttribute("src", /three\.webp$/);
  await expect(galleryImages.nth(2)).toHaveAttribute("src", /two\.webp$/);
  await expect(page.locator("#previewSelectionStatus")).toContainText("Imagen movida a la posición 2");

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_DELETE_ANIMATION",
    payload: { animationId: "gallery" },
  }, "*"));
  await expect(page.locator('.animation-card[data-animation-id="gallery"]')).toHaveCount(0);
  await expect(page.locator("#previewSelectionStatus")).toContainText("Animación eliminada");
  await page.locator("#previewUndo").click();
  await expect(page.locator('.animation-card[data-animation-id="gallery"]')).toHaveCount(1);
  await expect(page.locator('.animation-card[data-animation-id="gallery"] .animation-media-row img').nth(1)).toHaveAttribute("src", /three\.webp$/);

  await expect(page.locator('#previewAddSection optgroup[label="Animaciones visuales"]')).toHaveCount(1);
  await expect(page.locator('#previewAddSection optgroup[label="Animaciones de texto"]')).toHaveCount(1);
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INSERT_SECTION",
    payload: { choice: "animation:text-reveal-block", insertAfter: "__start__" },
  }, "*"));
  let order = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(order[0]).toMatch(/^animation-/);
  const insertedTextAnimation = order[0];
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INSERT_SECTION",
    payload: { choice: "gallery", insertAfter: "hero" },
  }, "*"));
  order = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(order.indexOf("gallery")).toBe(order.indexOf("hero") + 1);
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_INSERT_SECTION",
    payload: { choice: "about", insertAfter: "location" },
  }, "*"));
  order = await page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  expect(order.at(-1)).toBe("about");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.contentOrder[0]).toBe(insertedTextAnimation);
  expect(write.body.animations.find((animation) => animation.id === "expand").media).toHaveLength(2);
  expect(write.body.animations.find((animation) => animation.id === "gallery").media.map((media) => media.imageUrl)).toEqual([
    "/uploads/one.webp", "/uploads/three.webp", "/uploads/two.webp",
  ]);
});

test("touching an animation exposes undoable movement directly on the preview", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [{
    ...store("store_1", "Orden directo"),
    animations: [
      { id: "first", name: "Primera animación", type: "text-reveal-block", title: "Primera", subtitle: "Texto", media: [] },
      { id: "second", name: "Segunda animación", type: "text-layers", title: "Segunda", subtitle: "Texto", media: [] },
    ],
    contentOrder: ["hero", "animation-first", "products", "animation-second", "about", "gallery", "links"],
  }]);

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "animation-first", field: "section", label: "Primera animación", animationId: "first" } },
  }, "*"));

  await expect(page.locator("#previewEditorTools")).toBeHidden();
  const orderKeys = () => page.locator("#storeContentOrderList [data-reorder-key]").evaluateAll((rows) => rows.map((row) => row.dataset.reorderKey));
  const before = await orderKeys();
  const beforeIndex = before.indexOf("animation-first");

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_MOVE_SECTION",
    payload: { selection: { section: "animation-first", animationId: "first" }, direction: 1 },
  }, "*"));
  let after = await orderKeys();
  expect(after.indexOf("animation-first")).toBe(beforeIndex + 1);
  await expect(page.locator("#previewSelectionStatus")).toContainText(`posición ${beforeIndex + 2}`);

  await page.locator("#previewUndo").click();
  after = await orderKeys();
  expect(after.indexOf("animation-first")).toBe(beforeIndex);

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_MOVE_SECTION",
    payload: { selection: { section: "animation-first", animationId: "first" }, direction: -1 },
  }, "*"));
  after = await orderKeys();
  expect(after.indexOf("animation-first")).toBe(beforeIndex - 1);

  await page.locator("#previewUndo").click();
  after = await orderKeys();
  expect(after.indexOf("animation-first")).toBe(beforeIndex);
  await expect(page.locator("#previewSelectionStatus")).toContainText("Cambio deshecho");
});

test("inline storefront edits update the real form and upload replacement images", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [store("store_1", "Tienda editable")], ({ path }) => {
    if (path === "/uploads") return { url: "/uploads/banner-directo.webp" };
    return undefined;
  });

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_TEXT",
        payload: {
          selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
          value: "Tienda escrita en la página",
        },
      },
    }));
  });
  await expect(page.locator("#storeNameInput")).toHaveValue("Tienda escrita en la página");
  await expect(page.locator("#storeSaveStatus")).toContainText("Cambios sin guardar");

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "banner.png", { type: "image/png" });
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_IMAGE",
        payload: {
          selection: { section: "hero", field: "storeBanner", label: "imagen de portada" },
          file,
        },
      },
    }));
  });
  await expect(page.locator("#storeBannerPreview")).toHaveAttribute("src", /banner-directo\.webp$/);

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.name).toBe("Tienda escrita en la página");
  expect(write.body.bannerUrl).toBe("/uploads/banner-directo.webp");
});

test("the preview canvas adds, styles, copies, pastes text and accepts MP4 animation media", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const animatedStore = {
    ...store("store_1", "Lienzo directo"),
    animations: [{
      id: "opening",
      name: "Apertura",
      type: "hero-carousel",
      title: "Título original",
      media: [{ imageUrl: "/uploads/original.webp", title: "Escena" }],
    }],
    contentOrder: ["hero", "animation-opening", "products", "links"],
  };
  let uploadCount = 0;
  const requests = await openDashboard(page, [animatedStore], ({ path, request }) => {
    if (path === "/uploads" && request.method() === "POST") return { url: uploadCount++ === 0 ? "/uploads/apertura.mp4" : "/uploads/segunda.webp" };
    return undefined;
  });
  const sendEditorMessage = (type, payload) => page.evaluate(({ type, payload }) => {
    const frame = document.getElementById("storePreviewFrame");
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: { source: "pagosya-checkout", type, payload },
    }));
  }, { type, payload });
  const sectionSelection = { section: "animation-opening", field: "section", label: "Apertura", animationId: "opening" };

  await sendEditorMessage("STORE_EDITOR_ADD_TEXT", { selection: sectionSelection, role: "title" });
  const textSelection = { section: "animation-opening", field: "textBlock", label: "título adicional", animationId: "opening", itemId: "text-1" };
  await sendEditorMessage("STORE_EDITOR_INLINE_TEXT", { selection: textSelection, value: "Segundo título" });
  await sendEditorMessage("STORE_EDITOR_TEXT_STYLE", { selection: textSelection, key: "fontStyle", value: "editorial" });
  await sendEditorMessage("STORE_EDITOR_TEXT_STYLE", { selection: textSelection, key: "textColor", value: "#224466" });
  await sendEditorMessage("STORE_EDITOR_TEXT_STYLE", { selection: textSelection, key: "textScale", value: 130 });
  await sendEditorMessage("STORE_EDITOR_ANIMATION_FIELD", { selection: sectionSelection, key: "title", value: "Título desde la ventana pequeña" });
  await sendEditorMessage("STORE_EDITOR_ANIMATION_FIELD", { selection: sectionSelection, key: "buttonLabel", value: "Ver productos" });
  await sendEditorMessage("STORE_EDITOR_COPY_TEXT", { selection: textSelection });
  await sendEditorMessage("STORE_EDITOR_PASTE_TEXT", { selection: textSelection });

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const file = new File([new Uint8Array([0, 0, 0, 24])], "apertura.mp4", { type: "video/mp4" });
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_IMAGE",
        payload: {
          selection: { section: "animation-opening", field: "media", label: "video de apertura", animationId: "opening", itemIndex: 0 },
          file,
        },
      },
    }));
  });
  await expect.poll(() => requests.some((entry) => entry.path === "/uploads" && entry.method === "POST")).toBe(true);
  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const file = new File([new Uint8Array([82, 73, 70, 70])], "segunda.webp", { type: "image/webp" });
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: new URL(frame.src).origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_IMAGE",
        payload: {
          selection: { section: "animation-opening", field: "mediaAdd", label: "segundo medio", animationId: "opening", itemIndex: 1 },
          file,
        },
      },
    }));
  });
  await expect.poll(() => requests.filter((entry) => entry.path === "/uploads" && entry.method === "POST").length).toBe(2);

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.findLast((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations[0].media[0].imageUrl).toBe("/uploads/apertura.mp4");
  expect(write.body.animations[0].media[1].imageUrl).toBe("/uploads/segunda.webp");
  expect(write.body.animations[0].title).toBe("Título desde la ventana pequeña");
  expect(write.body.animations[0].buttonLabel).toBe("Ver productos");
  expect(write.body.animations[0].textBlocks).toHaveLength(2);
  expect(write.body.animations[0].textBlocks[0]).toEqual(expect.objectContaining({
    text: "Segundo título",
    fontStyle: "editorial",
    textColor: "#224466",
    textScale: 130,
  }));
  expect(write.body.animations[0].textBlocks[1]).toEqual(expect.objectContaining({ text: "Segundo título" }));
});

test("dragged animation text layout updates the editor and persists on save", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>
      window.addEventListener("message", (event) => parent.postMessage({ source: "preview-test", payload: event.data }, "*"));
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  const animatedStore = {
    ...store("store_1", "Movimiento directo"),
    animations: [{ id: "opening", name: "Apertura", type: "clarity-marquee", buttonLabel: "Ver colección", media: [] }],
    contentOrder: ["hero", "animation-opening", "products", "about", "gallery", "links"],
  };
  const requests = await openDashboard(page, [animatedStore]);
  await page.evaluate(() => {
    window.__previewTestMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "preview-test") window.__previewTestMessages.push(event.data.payload);
    });
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__previewTestMessages = []; });

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_ANIMATION_LAYOUT",
        payload: {
          selection: { section: "animation-opening", field: "layout", label: "posición y tamaño del texto", animationId: "opening" },
          textPositionX: 67,
          textPositionY: 34,
          textScale: 146,
          textWidthPercent: 73,
        },
      },
    }));
  });

  const card = page.locator('.animation-card[data-animation-id="opening"]');
  await expect(card.locator('[data-animation-field="textPositionX"]')).toHaveCount(0);
  await expect(card.locator('[data-animation-field="textPositionY"]')).toHaveCount(0);
  await expect(card.locator('[data-animation-field="textScale"]')).toHaveValue("146");
  await expect(card.locator('[data-animation-field="textWidthPercent"]')).toHaveValue("73");
  await expect(page.locator("#previewSelectionStatus")).toContainText("Texto ajustado directamente");
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.type === "PAGOSYA_STORE_PREVIEW"))).toBe(false);
  await expect(page.locator("#previewUndo")).toBeEnabled();
  await expect(page.locator("#previewUndo")).toHaveAttribute("aria-label", /mover o redimensionar el texto/i);
  await page.locator("#previewUndo").click();
  await expect(page.locator("#previewSelectionStatus")).toContainText("Cambio deshecho");

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_ANIMATION_LAYOUT",
        payload: {
          selection: { section: "animation-opening", field: "layout", label: "posición y tamaño del texto", animationId: "opening" },
          textPositionX: 67,
          textPositionY: 34,
          textScale: 146,
          textWidthPercent: 73,
        },
      },
    }));
  });

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_ANIMATION_BUTTON_LAYOUT",
        payload: {
          selection: { section: "animation-opening", field: "buttonLayout", label: "posición del botón", animationId: "opening" },
          buttonPositionX: 42,
          buttonPositionY: 78,
        },
      },
    }));
  });
  await expect(page.locator("#previewSelectionStatus")).toContainText("Botón movido");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations[0]).toEqual(expect.objectContaining({
    id: "opening",
    textPositionX: 67,
    textPositionY: 34,
    textScale: 146,
    textWidthPercent: 73,
    buttonLabel: "Ver colección",
    buttonPositionX: 42,
    buttonPositionY: 78,
  }));
});

test("editing slider text keeps the selected slide pinned without rebuilding the preview", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>
      window.addEventListener("message", (event) => parent.postMessage({ source: "preview-test", payload: event.data }, "*"));
      parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");
    </script>`,
  }));
  await openDashboard(page, [{
    ...store("store_1", "Slider estable"),
    animations: [{
      id: "slider",
      name: "Slider",
      type: "hero-carousel",
      media: [
        { imageUrl: "/uploads/slide-1.webp", title: "Primera escena", caption: "Primera bajada" },
        { imageUrl: "/uploads/slide-2.webp", title: "Segunda escena", caption: "Segunda bajada" },
      ],
    }, {
      id: "second-animation",
      name: "Segunda animación",
      type: "hero-carousel",
      media: [
        { imageUrl: "/uploads/second-1.webp", title: "Otra primera" },
        { imageUrl: "/uploads/second-2.webp", title: "Otra segunda" },
      ],
    }],
    contentOrder: ["hero", "animation-slider", "animation-second-animation", "products", "about", "gallery", "links"],
  }]);
  await page.evaluate(() => {
    window.__previewTestMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data?.source === "preview-test") window.__previewTestMessages.push(event.data.payload);
    });
  });
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await page.locator('.animation-card[data-animation-id="slider"] .animation-card-toggle').click();
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__previewTestMessages = []; });

  await page.locator('#storeNameInput').focus();
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.type === "PAGOSYA_STORE_PREVIEW"))).toBe(false);

  await page.locator('#animation-0-media-0-title').fill("Primera escena actualizada");
  await page.locator('#animation-0-media-0-title').press("Tab");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) =>
    message.type === "PAGOSYA_STORE_EDITOR_TEXT_UPDATE"
      && message.selection?.animationId === "slider"
      && message.selection?.itemIndex === 0
      && message.value === "Primera escena actualizada",
  ))).toBe(true);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.type === "PAGOSYA_STORE_PREVIEW"))).toBe(false);

  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "animation-second-animation", field: "media", label: "imagen 2 de la animación", animationId: "second-animation", itemIndex: 1 } },
  }, "*"));
  await expect(page.locator("#previewContextEditor")).toContainText("imagen 2 de la animación");
  await expect(page.locator("#previewContextEditor").getByLabel("Título (opcional)", { exact: true })).toHaveValue("Otra segunda");

  await previewFrame.evaluate(() => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: { selection: { section: "animation-slider", field: "media", label: "imagen 1 de la animación", animationId: "slider", itemIndex: 0 } },
  }, "*"));
  await expect(page.locator("#previewContextEditor").getByLabel("Título (opcional)", { exact: true })).toHaveValue("Primera escena actualizada");

  await page.evaluate(() => { window.__previewTestMessages = []; });
  await page.locator('#animation-0-text-scale').evaluate((input) => {
    input.value = "127";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) =>
    message.type === "PAGOSYA_STORE_EDITOR_STYLE_UPDATE"
      && message.animationId === "slider"
      && message.key === "textScale"
      && message.value === 127,
  ))).toBe(true);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.type === "PAGOSYA_STORE_PREVIEW"))).toBe(false);
});

test("selecting a later animation switches categories and keeps all of its text editable", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [{
    ...store("store_1", "Animaciones editables"),
    animations: [{
      id: "visual-first",
      name: "Primera visual",
      type: "hero-carousel",
      media: [
        { imageUrl: "/uploads/one.webp", title: "Primera escena" },
        { imageUrl: "/uploads/two.webp", title: "Segunda escena" },
      ],
    }, {
      id: "text-second",
      name: "Segunda de texto",
      type: "text-reveal-block",
      title: "Texto original",
      subtitle: "Subtítulo original",
      media: [],
    }],
    contentOrder: ["hero", "animation-visual-first", "animation-text-second", "products", "about", "gallery", "links"],
  }]);

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_SELECT",
        payload: {
          selection: {
            section: "animation-text-second",
            field: "animationTitle",
            label: "título general de la segunda animación",
            animationId: "text-second",
          },
        },
      },
    }));
  });

  await expect(page.locator("#storeAnimationTextTab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('.animation-card[data-animation-id="text-second"]')).toBeAttached();
  await expect(page.locator("#previewContextEditor").getByLabel("Título general", { exact: true })).toHaveValue("Texto original");

  await page.evaluate(() => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_INLINE_TEXT",
        payload: {
          selection: {
            section: "animation-text-second",
            field: "animationTitle",
            label: "título general de la segunda animación",
            animationId: "text-second",
          },
          value: "Ahora sí acepta espacios",
        },
      },
    }));
  });

  await expect(page.locator('[data-animation-id="text-second"] [data-animation-field="title"]')).toHaveValue("Ahora sí acepta espacios");
  await expect(page.locator("#previewContextEditor").getByLabel("Título general", { exact: true })).toHaveValue("Ahora sí acepta espacios");

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations[1]).toEqual(expect.objectContaining({
    id: "text-second",
    title: "Ahora sí acepta espacios",
  }));
});

test("generated scrolling stories expose copy, composition and motion and persist edits", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const section = (id, kind, overrides = {}) => ({
    id, kind, layout: "split", width: "wide", align: "left", motion: "none",
    title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
    ...overrides,
  });
  const siteDocument = {
    version: 1,
    direction: "Quemado editorial",
    theme: {
      pageBackground: "#f5f2ea", textColor: "#171717", accentColor: "#9b3527", secondaryColor: "#dfb7a8",
      surfaceColor: "#fffaf2", mutedColor: "#6b625e", borderColor: "#c9b9b0", headingFont: "editorial", bodyFont: "grotesk",
      radius: 4, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "cinematic",
    },
    navigation: { layout: "brand-left", sticky: false, transparent: false, logoTreatment: "wordmark" },
    motion: { intensity: "cinematic" },
    merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "lookbook", showDescriptions: true },
    experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
    sections: [
      section("opening", "hero"),
      section("brand-story", "story", {
        layout: "stacked", width: "full", motion: "story-scroll", title: "Detrás de QUEMADO2",
        items: [
          { title: "Primera escena", body: "Texto original", mediaUrl: "/v1/uploads/one.webp" },
          { title: "Segunda escena", body: "Otro texto", mediaUrl: "/v1/uploads/two.webp" },
        ],
        mediaUrls: ["/v1/uploads/one.webp", "/v1/uploads/two.webp"],
      }),
      section("shop", "catalog"),
      section("information", "contact"),
    ],
  };
  const requests = await openDashboard(page, [{
    ...store("store_1", "QUEMADO2"),
    siteDocument,
    contentOrder: ["site-opening", "site-brand-story", "site-shop", "site-information"],
  }]);

  const sendPreviewEvent = (type, payload) => page.evaluate(({ type, payload }) => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type,
        payload,
      },
    }));
  }, { type, payload });

  const storySelection = { section: "site-brand-story", field: "section", label: "Detrás de QUEMADO2" };
  await sendPreviewEvent("STORE_EDITOR_SITE_FIELD", { selection: storySelection, key: "title", value: "Detrás de QUEMADO2 actualizado" });
  await sendPreviewEvent("STORE_EDITOR_SITE_FIELD", { selection: storySelection, key: "motion", value: "parallax" });
  await sendPreviewEvent("STORE_EDITOR_SITE_FIELD", {
    selection: { ...storySelection, field: "itemTitle", itemIndex: 1, label: "Segunda escena" },
    key: "title",
    value: "Segunda escena con espacios",
  });
  await sendPreviewEvent("STORE_EDITOR_INSERT_SECTION", { choice: "about", insertAfter: "site-brand-story" });
  await expect(page.locator("#previewEditorTools")).toBeHidden();

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  const savedStory = write.body.siteSections.find((candidate) => candidate.id === "brand-story");
  expect(savedStory).toEqual(expect.objectContaining({
    title: "Detrás de QUEMADO2 actualizado",
    motion: "parallax",
  }));
  expect(savedStory.items[1].title).toBe("Segunda escena con espacios");
  const addedStory = write.body.siteSections.find((candidate) => candidate.id !== "brand-story" && candidate.kind === "story");
  expect(addedStory).toEqual(expect.objectContaining({ title: "Nueva historia", motion: "reveal" }));
  expect(write.body.contentOrder).toContain(`site-${addedStory.id}`);
});

test("changing animation type completes its minimum media instead of removing it from preview", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const products = Array.from({ length: 4 }, (_, index) => ({
    id: `product_${index + 1}`,
    name: `Producto ${index + 1}`,
    status: "ACTIVE",
    imageUrls: [`/v1/uploads/product-${index + 1}.webp`],
    tags: [],
    description: "",
  }));
  await openDashboard(page, [store("store_1", "Movimiento")], ({ path }) =>
    path === "/stores/store_1/payment_links" ? products : undefined,
  );
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page, "hero-carousel");

  const sources = page.locator("input[data-animation-source]");
  await sources.nth(0).check({ force: true });
  await sources.nth(1).check({ force: true });
  await expect(page.locator(".animation-media-row")).toHaveCount(2);

  const animationId = await page.locator(".animation-card").getAttribute("data-animation-id");
  const previewFrame = page.frames().find((frame) => frame.url().startsWith("http://localhost:5175/"));
  await previewFrame.evaluate((selectedAnimationId) => parent.postMessage({
    source: "pagosya-checkout",
    type: "STORE_EDITOR_SELECT",
    payload: {
      selection: {
        section: `animation-${selectedAnimationId}`,
        field: "media",
        label: "imagen 1 de la animación",
        animationId: selectedAnimationId,
        itemIndex: 0,
      },
    },
  }, "*"), animationId);
  await expect(page.locator("#previewEditorTools")).toBeHidden();
  await page.locator("#previewExpandToggle").click();
  await page.locator('[data-animation-field="type"]').selectOption("hero-gallery-scroll");
  await expect(page.locator(".animation-media-row")).toHaveCount(3);
  await expect(page.locator("#previewSelectionStatus")).toContainText("agregamos 1 foto disponible");
  await expect(page.locator("input[data-animation-source]:checked")).toHaveCount(3);
  await expect(page.locator(".animation-media-count")).toHaveText("3 / 8");
});

test("merchant can save a showcase animation and never sees the retired 3D gallery", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const requests = await openDashboard(page, [store("store_1", "Movimiento")]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page);
  const type = page.locator('[data-animation-field="type"]');
  await expect(type.locator("option")).toHaveCount(17);
  await expect(type.locator('option[value="coverflow-carousel"]')).toHaveCount(0);
  await expect(type.locator('option[value="3d-gallery"]')).toHaveCount(0);
  await type.selectOption("frame-sequence");
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.find((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toEqual([expect.objectContaining({ type: "frame-sequence" })]);
  expect(write.body.motionExperiences).toEqual(["frame-sequence"]);
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
  await expect(page.getByLabel("Tarjeta de producto dentro de la animación (opcional)")).toHaveValue("product_1");
  await expect(page.locator(".animation-product-field")).toContainText("irá directamente al producto");
  await expect(page.locator(".animation-text-only-note")).toContainText("Helado amarillo tropical");

  await page.locator('[data-animation-field="type"]').selectOption("circle-reveal");
  await expect(page.locator(".animation-media-count")).toHaveText("1 / 1");
  await page.locator(".animation-source").nth(1).click();
  await expect(page.locator(".animation-media-row")).toHaveCount(1);

  await page.locator('[data-animation-field="type"]').selectOption("clarity-marquee");
  await expect(page.locator('[data-animation-field="textPositionX"]')).toHaveCount(0);
  await expect(page.locator('[data-animation-field="textPositionY"]')).toHaveCount(0);
  await page.locator('[data-animation-field="textAlign"]').selectOption("right");
  await page.locator('[data-animation-field="textScale"]').evaluate((input) => {
    input.value = "143";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-animation-field="textWidthPercent"]').evaluate((input) => {
    input.value = "74";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-animation-field="textColor"]').evaluate((input) => {
    input.value = "#fff4d6";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-animation-field="backgroundColor"]').evaluate((input) => {
    input.value = "#26170d";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");

  const write = requests.findLast((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations).toEqual([expect.objectContaining({
    type: "clarity-marquee",
    productId: "product_1",
    textScale: 143,
    textWidthPercent: 74,
    textAlign: "right",
    textColor: "#fff4d6",
    backgroundColor: "#26170d",
    media: [],
  })]);
});

test("groups existing and new text effects in the Text animation category", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [store("store_1", "Texto")]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await page.getByRole("tab", { name: "Texto animado" }).click();

  const picker = page.locator("#storeAnimationTypePicker");
  await expect(picker.locator("option")).toHaveCount(7);
  await expect(picker.locator('option[value="clarity-marquee"]')).toHaveCount(1);
  await expect(picker.locator('option[value="layered-text"]')).toHaveCount(1);
  await expect(picker.locator('option[value="text-rotate"]')).toHaveCount(1);
  await expect(picker.locator('option[value="text-glitch"]')).toHaveCount(1);
  await expect(picker.locator('option[value="text-reveal-block"]')).toHaveCount(1);
  await expect(picker.locator('option[value="text-along-path"]')).toHaveCount(1);
  await expect(picker.locator('option[value="coverflow-carousel"]')).toHaveCount(0);

  await picker.selectOption("text-glitch");
  await page.locator("#storeAnimationAdd").click();
  await expect(page.locator('[data-animation-field="type"]')).toHaveValue("text-glitch");
  await expect(page.locator(".animation-text-only-note")).toContainText("No necesitas seleccionar fotos");
});

test("retired video-pill animation is absent from every animation picker", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  await openDashboard(page, [store("store_1", "Movimiento")]);
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();

  await expect(page.locator('#storeAnimationTypePicker option[value="video-pill"]')).toHaveCount(0);
});

test("choosing a product photo replaces the last animation image when all slots are full", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<script>parent.postMessage({ source: "pagosya-checkout", type: "CHECKOUT_READY" }, "*");</script>`,
  }));
  const products = Array.from({ length: 9 }, (_, index) => ({
    id: `product_${index + 1}`,
    name: `Producto ${index + 1}`,
    status: "ACTIVE",
    imageUrls: [`/v1/uploads/product-${index + 1}.webp`],
    tags: [],
    description: "",
  }));
  const requests = await openDashboard(page, [store("store_1", "Fotos de producto")], ({ path }) =>
    path === "/stores/store_1/payment_links" ? products : undefined,
  );
  await page.getByRole("button", { name: "Mostrar Animaciones" }).click();
  await addAnimation(page, "hero-carousel");

  const choices = page.locator("input[data-animation-source]");
  await expect(choices).toHaveCount(9);
  for (let index = 0; index < 8; index += 1) await choices.nth(index).check({ force: true });
  await expect(page.locator("input[data-animation-source]:checked")).toHaveCount(8);
  await expect(choices.nth(8)).toBeEnabled();
  await choices.nth(8).check({ force: true });
  await expect(choices.nth(8)).toBeChecked();
  await expect(choices.nth(7)).not.toBeChecked();

  await page.locator("#storeSettingsForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#info")).toContainText("guardados");
  const write = requests.findLast((request) => request.method === "PUT" && request.path === "/stores/store_1/settings");
  expect(write.body.animations[0].media).toHaveLength(8);
  expect(write.body.animations[0].media.map((media) => media.imageUrl)).toContain("/v1/uploads/product-9.webp");
  expect(write.body.animations[0].media.map((media) => media.imageUrl)).not.toContain("/v1/uploads/product-8.webp");
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
  await expect(page.locator("#productPreviewMount #previewEditorTools")).toBeHidden();
  const productWorkspace = await page.evaluate(() => {
    const form = document.getElementById("paymentLinkForm")?.getBoundingClientRect();
    const preview = document.getElementById("storePreviewStage")?.getBoundingClientRect();
    return { formWidth: form?.width || 0, previewWidth: preview?.width || 0, previewHeight: preview?.height || 0 };
  });
  expect(productWorkspace.previewWidth).toBeGreaterThan(productWorkspace.formWidth);
  expect(productWorkspace.previewHeight).toBeGreaterThan(500);
  await page.locator('.edit-link[data-id="product_1"]').click();
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "product" && message.previewProduct?.id === "product_1"))).toBe(true);

  await page.waitForTimeout(500);
  const dashboardScroll = await page.evaluate(() => window.scrollY);
  const description = page.locator('#paymentLinkForm [name="description"]');
  await description.fill("Miga aireada y mantequilla dorada.");
  await expect(description).toBeFocused();
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.__previewTestMessages.some((message) => message.previewProduct?.description === "Miga aireada y mantequilla dorada."))).toBe(false);
  await description.press("Tab");
  await expect.poll(() => page.evaluate(() => window.__previewTestMessages.some((message) => message.previewAction === "product" && message.previewProduct?.description === "Miga aireada y mantequilla dorada."))).toBe(true);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - dashboardScroll)).toBeLessThanOrEqual(40);
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

  await page.locator('[data-dashboard-view="products"]').click();
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

  const locationId = await page.locator(".store-location-editor-card").getAttribute("data-location-id");
  await page.evaluate(({ locationId }) => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_LOCATION_MAP",
        payload: { locationId, mapEmbedUrl: '<iframe src="https://www.google.com/maps/embed?pb=direct&amp;z=16"></iframe>' },
      },
    }));
  }, { locationId });
  await expect(mapInput).toHaveValue("https://www.google.com/maps/embed?pb=direct&z=16");
  await expect(page.locator("#previewSelectionStatus")).toContainText("Mapa insertado");

  await page.evaluate(({ locationId }) => {
    const frame = document.getElementById("storePreviewFrame");
    const origin = new URL(frame.src).origin;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin,
      data: {
        source: "pagosya-checkout",
        type: "STORE_EDITOR_DELETE_LOCATION",
        payload: { locationId },
      },
    }));
  }, { locationId });
  await expect(page.locator(".store-location-editor-card")).toHaveCount(0);
  await expect(page.locator("#previewSelectionStatus")).toContainText("Ubicación eliminada");
  await page.locator("#previewUndo").click();
  await expect(page.locator(".store-location-editor-card")).toHaveCount(1);
  await expect(page.locator('[data-location-field="mapEmbedUrl"]')).toHaveValue("https://www.google.com/maps/embed?pb=direct&z=16");
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
  await animationCards.nth(0).locator('[data-animation-field="subtitle"]').fill("Piezas elegidas para esta temporada.");
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
    experienceStyle: "editorial-grid",
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
  expect(writes[0].body.animations[0]).toMatchObject({ name: "Portada editorial", type: "hero-carousel", subtitle: "Piezas elegidas para esta temporada." });
  expect(writes[0].body.animations[0]).not.toHaveProperty("title");
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
  await page.locator("#productAdvancedOptions > summary").click();
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
  await openYapi(page);

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

test("Yapi stays available without covering the appearance editor", async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator("#assistantPanel")).toBeHidden();
  await expect(page.locator("#assistantObject")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#assistantRestore")).toBeVisible();
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
  await openYapi(page);

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
  await openYapi(page);

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
  await page.locator("#previewAiCreate").click();
  await expect(page.locator(".store-preview-panel > #visualOnboarding")).toBeVisible();
  await expect(page.locator("#storePreviewStage")).toBeVisible();
  const aiPageWidth = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(aiPageWidth.content).toBeLessThanOrEqual(aiPageWidth.viewport);
  const aiButtonBox = await page.locator("#previewAiCreate").boundingBox();
  expect(aiButtonBox?.height).toBeGreaterThanOrEqual(44);
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
  await page.locator("#productAdvancedOptions > summary").click();
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
  await expect(page.locator("#info")).toContainText("1 producto importado y 1 categorías nuevas");
  await expect(page.locator("#info")).toContainText("1 SKU conectado");
  await expect(page.locator("#error")).toBeEmpty();
  await expect(page.locator("#paymentLinkRows")).toContainText("Silpancho");
  expect(requests.find((request) => request.path.endsWith("/payment_links/import"))?.body).toMatchObject({
    integrationConnectionId: "integration_1",
    products: [{ name: "Silpancho", codigoProducto: "COM-001", imageUrls: ["/uploads/silpancho.png"] }],
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
  await page.locator('[data-dashboard-view="products"]').click();
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
  if (process.env.PAGOSYA_VISUAL_QA === "1") {
    await form.screenshot({ path: "../../.impeccable/product-create-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await form.screenshot({ path: "../../.impeccable/product-create-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await form.locator('[name="name"]').fill("Pizza");
  await form.locator('[name="amount"]').fill("0");
  await page.locator("#productAdvancedOptions > summary").click();
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

test("AI creation hides technical design choices while advanced editing keeps curated typography", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Primera")]);
  const assistantToggle = page.locator("#visualAssistantToggle");
  await expect(page.locator("#previewAiCreate")).toBeVisible();
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await page.locator("#previewAiCreate").click();
  await expect(assistantToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".store-preview-panel > #visualOnboarding")).toBeVisible();
  await expect(page.getByText("Deja que la IA componga tu tienda completa", { exact: true })).toHaveCount(0);
  await expect(page.locator("#previewAiCreate")).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator("#visualCreativeBrief")).toBeVisible();
  await expect(page.locator(".visual-creative-brief")).toContainText("Historia y Contacto como pestañas");
  await expect(page.locator(".font-choice")).toHaveCount(0);
  await expect(page.locator('input[name="visualAnnouncementMarquee"]')).toHaveCount(0);
  await expect(page.locator('input[name="visualMotionExperience"]')).toHaveCount(0);
  await expect(page.getByText("Precisa", { exact: true })).toHaveCount(0);
  await expect(page.locator("#storeFontStyle option")).toHaveCount(8);
  await expect(page.locator('#storeFontStyle option[value="artisan"]')).toHaveText("Artesanal: humana y de taller");
  await expect(page.locator('#storeFontStyle option[value="condensed"]')).toHaveText("Condensada: gráfica y directa");
  await expect(page.locator('#storeFontStyle option[value="luxury"]')).toHaveText("Alta moda: contraste y elegancia");
  await expect(page.locator('#storeFontStyle option[value="mono"]')).toHaveCount(0);
});

test("AI setup sends the chosen WhatsApp mode and uploaded inspiration photos", async ({ page }) => {
  let uploadNumber = 0;
  let finishGeneration;
  const generationGate = new Promise((resolve) => { finishGeneration = resolve; });
  const generatedSiteDocument = {
    version: 1,
    pages: [{ id: "story-page", label: "Nuestra historia", slug: "nuestra-historia" }],
    navigation: {
      layout: "brand-left",
      items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        { id: "nav-story-page", label: "Nuestra historia", target: "page", pageId: "story-page" },
      ],
    },
    sections: [
      { id: "opening", kind: "hero", title: "Portada IA", pageId: "" },
      { id: "shop", kind: "catalog", title: "La tienda", pageId: "" },
      { id: "story", kind: "story", title: "Nuestra historia", pageId: "story-page" },
    ],
  };
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
          config: {
            checkoutMode: "whatsapp",
            cartButtonLabel: "Pedir por WhatsApp",
            experienceStyle: ["editorial-grid", "story-scroller", "editorial-grid"][number - 1],
            siteDocument: generatedSiteDocument,
          },
        })),
      };
    }
    return undefined;
  });

  const assistantToggle = page.locator("#visualAssistantToggle");
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await page.locator("#previewAiCreate").click();
  await expect(page.locator("#visualCreativeBrief")).toBeVisible();
  await expect(page.locator(".font-choice")).toHaveCount(0);
  await expect(page.locator('input[name="visualAnnouncementMarquee"]')).toHaveCount(0);
  await expect(page.locator('input[name="visualMotionExperience"]')).toHaveCount(0);
  await page.locator('input[name="visualCheckoutMode"][value="whatsapp"]').check();
  await expect(page.locator("#visualWhatsappPhoneWrap")).toBeVisible();
  await page.locator("#visualWhatsappPhone").fill("+591 71234567");
  await page.locator("#visualBusinessCategory").fill("Café de especialidad");
  await page.locator("#visualCreativeBrief").fill("Como una revista gastronómica contemporánea: fotos grandes, ritmo sereno y nada genérico.");
  await page.locator('input[name="visualArtDirection"][value="cinematic-atelier"]').check();
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
  await expect(page.locator("#visualProposals")).toContainText("2 páginas");
  await expect(page.locator("#visualProposals")).toContainText("3 secciones propias");
  await expect(page.locator("#visualProposals")).not.toContainText("Coverflow 3D");
  await expect(page.locator("#visualProposals")).not.toContainText("Galería diagonal");
  await expect(generationLoader).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/is-generating-visual/);
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).toHaveClass(/is-previewing/);
  await expect(page.locator("#previewLiveStatus")).toHaveText("Borrador IA");
  const proposalPreviewUrl = new URL(await page.locator("#storePreviewFrame").getAttribute("src"));
  const proposalPreviewPatch = JSON.parse(new URLSearchParams(proposalPreviewUrl.hash.slice(1)).get("proposal"));
  expect(proposalPreviewPatch.siteDocument.pages).toEqual(generatedSiteDocument.pages);
  expect(proposalPreviewPatch.siteDocument.navigation.items).toContainEqual(expect.objectContaining({
    target: "page",
    pageId: "story-page",
  }));

  const generation = requests.find((request) => request.path === "/stores/store_1/visual-proposals");
  expect(generation?.body).toMatchObject({
    checkoutMode: "whatsapp",
    whatsappPhone: "+591 71234567",
    businessCategory: "Café de especialidad",
    creativeBrief: "Como una revista gastronómica contemporánea: fotos grandes, ritmo sereno y nada genérico.",
    artDirection: "cinematic-atelier",
    assetUrls: Array.from({ length: 9 }, (_, index) => `/v1/uploads/ai-${index + 1}.jpg`),
  });
  expect(generation?.body).not.toHaveProperty("fontStyle");
  expect(generation?.body).not.toHaveProperty("announcementMarqueeEnabled");
  expect(generation?.body).not.toHaveProperty("motionExperiences");
});

test("AI proposals toggle inside Tu tienda without applying and only the latest applied proposal stays in use", async ({ page }) => {
  await page.route("http://localhost:5175/**", (route) => {
    const aiOption = new URL(route.request().url()).searchParams.get("ai_option") || "";
    return route.fulfill({
      contentType: "text/html",
      // The native iframe load fallback must reveal a rendered proposal even
      // when Checkout's one-shot readiness message is missed.
      body: `<body data-ai-option="${aiOption}"></body>`,
    });
  });
  const proposals = [
    { id: "proposal_1", title: "Primera", rationale: "Dirección uno", status: "APPLIED", appliedAt: "2026-08-13T10:00:00.000Z", config: { accentColor: "#123456", tagline: "Primera dirección", motionDuoEnabled: true } },
    { id: "proposal_2", title: "Segunda", rationale: "Dirección dos", status: "APPLIED", appliedAt: "2026-08-13T11:00:00.000Z", config: { accentColor: "#654321", tagline: "Segunda dirección" } },
    {
      id: "proposal_3",
      title: "Tercera",
      rationale: "Dirección tres",
      status: "READY",
      appliedAt: null,
      config: {
        accentColor: "#abcdef",
        tagline: "Tercera dirección",
        bannerUrl: null,
        aboutImageUrl: null,
        promotionEnabled: false,
        promotionImageUrl: null,
        motionDuoEnabled: false,
        motionExperience: "hero-carousel",
        motionExperiences: [],
        animations: [],
        contentOrder: ["hero", "about", "products", "gallery", "links"],
      },
    },
  ];
  const liveStore = {
    ...store("store_1", "Primera"),
    bannerUrl: "/v1/uploads/old-banner.jpg",
    aboutImageUrl: "/v1/uploads/old-about.jpg",
    promotionEnabled: true,
    promotionImageUrl: "/v1/uploads/old-promotion.jpg",
    motionDuoEnabled: true,
    motionExperiences: ["scroll-expansion"],
    animations: [{ id: "old-animation", type: "scroll-expansion", media: [] }],
  };
  await openDashboard(page, [liveStore], ({ path }) => {
    if (path === "/stores/store_1/visual-studio") return { proposals, versions: [] };
    return undefined;
  });

  await expect(page.locator('.visual-proposal[data-id="proposal_1"] .visual-apply-proposal')).toHaveText("Usar y editar");
  await expect(page.locator('.visual-proposal[data-id="proposal_2"] .visual-apply-proposal')).toHaveText("Aplicada");
  await expect(page.locator('.visual-proposal[data-id="proposal_3"] .visual-apply-proposal')).toHaveText("Usar y editar");

  await page.evaluate(() => {
    window.__proposalPreviewOpen = null;
    window.open = (url, target, features) => {
      window.__proposalPreviewOpen = { url: String(url), target, features };
      return null;
    };
  });
  const assistantToggle = page.locator("#visualAssistantToggle");
  if (await assistantToggle.getAttribute("aria-expanded") !== "true") await page.locator("#previewAiCreate").click();
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).toHaveClass(/is-previewing/);
  await page.locator('.visual-proposal[data-id="proposal_3"] .visual-preview-proposal').click();
  await expect(page.locator('.visual-proposal[data-id="proposal_3"]')).toHaveClass(/is-previewing/);
  await expect(page.locator('.visual-proposal[data-id="proposal_1"]')).not.toHaveClass(/is-previewing/);

  const previewUrl = new URL(await page.locator("#storePreviewFrame").getAttribute("src"));
  const previewPatch = JSON.parse(new URLSearchParams(previewUrl.hash.slice(1)).get("proposal"));
  expect(previewUrl.searchParams.get("preview")).toBe("1");
  expect(previewUrl.searchParams.get("editor")).toBe("0");
  expect(previewUrl.searchParams.get("ai_option")).toBe("proposal_3");
  expect(previewPatch).toMatchObject({
    accentColor: "#abcdef",
    tagline: "Tercera dirección",
    bannerUrl: null,
    aboutImageUrl: null,
    promotionEnabled: false,
    promotionImageUrl: null,
    motionDuoEnabled: false,
    motionExperience: "hero-carousel",
    motionExperiences: [],
    animations: [],
  });
  expect(previewPatch.contentOrder).not.toContain("animation-old-animation");
  expect(JSON.stringify(previewPatch)).not.toContain("old-animation");
  await expect(page.locator("#storePreviewFrame").contentFrame().locator("body")).toHaveAttribute("data-ai-option", "proposal_3");
  await expect(page.locator("#storePreviewStage")).toHaveClass(/is-ready/);
  expect(await page.evaluate(() => window.__proposalPreviewOpen)).toBeNull();
  await expect(page.locator("#visualProposalStatus")).toContainText("Mostrando “Tercera” en Tu tienda");
});
