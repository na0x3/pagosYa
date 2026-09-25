import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Crecimiento (G2) with a mocked API: a rich payment store, a brand-new store, and a WhatsApp store, at 390 and 1280.
const SHOTS = new URL("../../../tmp/growth-shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const baseStore = {
  id: "store_1", merchantId: "merchant_1", slug: "casa-luz", name: "Casa Luz", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135, heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false, motionExperience: "clarity-marquee",
  motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [], checkoutMode: "payment", contactPhone: null, contactEmail: null,
  contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null, locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null,
  cartRecommendationsEnabled: true, cartRecommendationProductIds: [], showLowStockToCustomers: false, publishedSourceRevision: 3, sourcePublicationPaused: false, publicVisibility: true,
};
const products = [
  { id: "p1", name: "Lámpara Nube", description: "Tejida a mano", amount: 25000, currency: "BOB", stock: 2, imageUrls: [], variants: [], status: "ACTIVE", tags: [] },
  { id: "p2", name: "Mesa Roble", description: "Madera maciza", amount: 90000, currency: "BOB", stock: 8, imageUrls: ["/v1/uploads/m.png"], variants: [], status: "ACTIVE", tags: [] },
];
const days = (n, to = "2026-09-25") => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${to}T00:00:00Z`) - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
const wave = (n, base, amp) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + amp * Math.sin(i / 2.3) + (i % 5))));
const insight = (id, severity, kind, payload, title, evidence, extra = {}) => ({ id, rule: id.split(":")[0], severity, title, evidence, why: ["Se marca con reglas fijas sobre tus números.", "Cuenta solo las visitas que aceptaron la analítica; los datos se actualizan cada 15 minutos."], impact: null, action: { kind, label: extra.label || "Hacerlo ahora", payload }, weight: 1, ...extra });

function overview({ mode = "payment", n = 30, empty = false } = {}) {
  const list = days(n);
  const whatsapp = mode === "whatsapp";
  const current = empty ? list.map(() => 0) : wave(n, 38, 14);
  const previous = empty ? list.map(() => 0) : wave(n, 30, 10).reverse();
  return {
    period: { days: n, from: list[0], to: list[n - 1], previousFrom: "2026-07-28", previousTo: "2026-08-26" },
    checkoutMode: mode, store: { name: "Casa Luz", published: !empty, paused: false, hidden: false, verified: true }, paidOrders: empty ? 0 : 12, truncated: false,
    kpis: empty ? [
      { id: "visits", label: "Visitas", value: 0, previous: 0, delta: null, format: "count", detail: null, note: null },
    ] : [
      { id: "visits", label: "Visitas", value: 1240, previous: 1051, delta: 18, format: "count", detail: null, note: null },
      { id: "productViews", label: "Vieron productos", value: 612, previous: 590, delta: 3.7, format: "count", detail: null, note: null },
      { id: "addToCart", label: "Añadieron al carrito", value: 88, previous: 97, delta: -9.3, format: "count", detail: null, note: null },
      { id: "checkouts", label: "Pedidos iniciados", value: 41, previous: 0, delta: null, format: "count", detail: null, note: null },
      whatsapp ? { id: "outcome", label: "Pedidos por WhatsApp", value: 19, previous: 15, delta: 26.7, format: "count", detail: null, note: null }
        : { id: "outcome", label: "Ventas pagadas", value: 12, previous: 9, delta: 33.3, format: "count", detail: "Bs 3.450,00 netos", note: null },
      { id: "conversion", label: "Conversión", value: whatsapp ? 1.5 : 1, previous: 0.9, delta: 0.1, format: "percent", detail: null, note: null },
    ],
    funnel: [
      { id: "visits", label: "Visitas", sessions: 1240, share: 100, dropOff: null },
      { id: "views", label: "Vieron un producto", sessions: 612, share: 49.4, dropOff: 50.6 },
      { id: "adds", label: "Añadieron al carrito", sessions: 88, share: 7.1, dropOff: 85.6 },
      { id: "checkout", label: "Iniciaron el pedido", sessions: 41, share: 3.3, dropOff: 53.4 },
      { id: "outcome", label: whatsapp ? "Pidieron por WhatsApp" : "Pagaron", sessions: whatsapp ? 19 : 12, share: 1, dropOff: 70.7 },
    ],
    traffic: { days: list, current, previous },
    checkout: {
      steps: whatsapp ? [
        { step: "cart_open", label: "Abrieron el carrito", optional: false, sessions: 70, dropOff: null },
        { step: "review", label: "Vieron el resumen", optional: false, sessions: 41, dropOff: 41.4 },
        { step: "delivery", label: "Eligieron la entrega", optional: true, sessions: 20, dropOff: 51.2 },
        { step: "pay_click", label: "Tocaron «Pedir por WhatsApp»", optional: false, sessions: 30, dropOff: 26.8 },
        { step: "whatsapp", label: "Abrieron WhatsApp", optional: false, sessions: 19, dropOff: 36.7 },
      ] : [
        { step: "cart_open", label: "Abrieron el carrito", optional: false, sessions: 70, dropOff: null },
        { step: "review", label: "Vieron el resumen", optional: false, sessions: 41, dropOff: 41.4 },
        { step: "delivery", label: "Eligieron la entrega", optional: true, sessions: 20, dropOff: 51.2 },
        { step: "pay_click", label: "Tocaron «Pagar»", optional: false, sessions: 30, dropOff: 26.8 },
        { step: "contact", label: "Abrieron el formulario seguro", optional: false, sessions: 26, dropOff: 13.3 },
        { step: "payment", label: "Llegaron al pago", optional: false, sessions: 14, dropOff: 46.2 },
      ],
      series: [
        { id: "cart_open", label: "Abrieron el carrito", values: empty ? list.map(() => 0) : wave(n, 3, 2) },
        whatsapp ? { id: "whatsapp_click", label: "Pedidos por WhatsApp", values: empty ? list.map(() => 0) : wave(n, 1, 1) } : { id: "pay_click", label: "Tocaron «Pagar»", values: empty ? list.map(() => 0) : wave(n, 1, 1) },
      ],
    },
    ctas: empty ? [] : [
      { target: "hero-cta", label: "Botón principal (portada)", clicks: 320, sessions: 280 },
      { target: "nav-cart", label: "Carrito (menú)", clicks: 140, sessions: 96 },
      { target: "whatsapp", label: "WhatsApp", clicks: 44, sessions: 40 },
    ],
    products: empty ? { top: [], bottom: [] } : {
      top: [
        { productId: "p1", name: "Lámpara Nube", views: 310, adds: 4, addRate: 1.3, sold: 6, stock: 2, active: true },
        { productId: "p2", name: "Mesa Roble", views: 190, adds: 40, addRate: 21.1, sold: 5, stock: 8, active: true },
      ],
      bottom: [{ productId: "p3", name: "Silla Andina con un nombre larguísimo para ver cómo se corta", views: 0, adds: 0, addRate: null, sold: 0, stock: 0, active: true }],
    },
    devices: empty ? [{ device: "mobile", label: "Celular", sessions: 0, share: 0, addRate: null }, { device: "desktop", label: "Computadora", sessions: 0, share: 0, addRate: null }]
      : [{ device: "mobile", label: "Celular", sessions: 930, share: 75, addRate: 4.1 }, { device: "desktop", label: "Computadora", sessions: 310, share: 25, addRate: 12.3 }],
    referrers: empty ? [] : [
      { host: "instagram.com", label: "instagram.com", sessions: 520, share: 41.9 },
      { host: "direct", label: "Directo (sin enlace de origen)", sessions: 410, share: 33.1 },
      { host: "<b>evil</b>.example", label: "<b>evil</b>.example", sessions: 12, share: 1 },
    ],
    weekly: { from: "2026-09-19", to: "2026-09-25", text: empty ? "Esta semana todavía no hubo visitas medidas ni ventas. Comparte el enlace de tu tienda para empezar." : whatsapp
      ? "Esta semana (19–25 sep): 310 visitas (+12 % frente a la anterior), 24 sesiones con carrito (−4 % frente a la anterior) y 6 pedidos por WhatsApp (la semana anterior: 4)."
      : "Esta semana (19–25 sep): 310 visitas (+12 % frente a la anterior), 24 sesiones con carrito (−4 % frente a la anterior) y 4 ventas pagadas por Bs 1.150,00 (la semana anterior: 3). Lo más vendido: «Lámpara Nube» (3)." },
    hasData: !empty,
    insights: empty ? [
      insight("unpublished", "high", "settings", { view: "workspace" }, "Publica tu tienda para empezar a recibir visitas", "Tu tienda todavía no tiene un diseño publicado: nadie puede verla ni comprar.", { label: "Abrir el diseñador y publicar" }),
      insight("weak-photos", "medium", "product", { productId: "p1", step: "photos" }, "«Lámpara Nube» no tiene fotos", "«Lámpara Nube» no tiene ninguna foto. Es lo primero que mira quien compra.", { label: "Agregar fotos a «Lámpara Nube»" }),
    ] : [
      insight("checkout-drop:review", "high", "yapi", { instruction: "Mejora el carrito de mi tienda para que más clientes continúen. No cambies precios ni productos." }, "Muchos abren el carrito y no continúan", "De 70 sesiones que abrieron el carrito, 29 no llegaron al resumen del pedido (41,4 %) en los últimos 30 días.", { label: "Mejorar el carrito con YAPI" }),
      insight("low-stock:p1", "medium", "stock", { productId: "p1" }, "Quedan 2 de «Lámpara Nube»", "Vendiste 6 unidades de «Lámpara Nube» en los últimos 30 días y quedan 2.", { label: "Reponer stock", impact: "Estimación: al ritmo de este periodo, se agota en unos 10 días." }),
      insight("views-no-adds:p1", "medium", "product", { productId: "p1", step: "photos" }, "«Lámpara Nube» se mira mucho pero casi no se añade", "310 sesiones vieron «Lámpara Nube» en los últimos 30 días y solo 4 lo añadieron al carrito (1,3 %).", { label: "Mejorar las fotos de «Lámpara Nube»", impact: "Estimación: si «Lámpara Nube» llegara al promedio de tu tienda (7,1 %), serían unas 18 sesiones más con el producto en el carrito, con las mismas visitas." }),
      insight("referrer-surge:instagram.com", "low", "promo", { code: "INSTAGRAM" }, "Llegan más visitas desde instagram.com", "520 visitas llegaron desde instagram.com en los últimos 30 días, frente a 200 en los 30 días anteriores.", { label: "Crear un código para esas visitas" }),
      insight("missing-policies", "low", "settings", { view: "store-settings", section: "policies" }, "Escribe tu política de cambios y devoluciones", "Falta la política de cambios y devoluciones. Se muestra junto al botón de compra y da confianza para comprar.", { label: "Escribir mis políticas" }),
    ],
    moreInsights: empty ? 0 : 2, hiddenInsights: empty ? 0 : 1,
    freshness: "Las visitas y los clics se actualizan cada 15 minutos y solo cuentan a quienes aceptaron la analítica.",
  };
}

const STUDIO_STUB = `<!doctype html><meta charset="utf-8"><script>
  const params = new URLSearchParams(location.search); const store = params.get("store");
  parent.__studio = parent.__studio || [];
  addEventListener("message", (event) => {
    parent.__studio.push(event.data);
    if (event.data?.type === "pagosya:studio-action") parent.postMessage({ type: "pagosya:studio-action-received", storeId: store }, location.origin);
  });
  if (params.has("productGuide")) parent.postMessage({ type: "pagosya:product-guide-ready", storeId: store }, location.origin);
  else if (params.has("source")) parent.postMessage({ type: "pagosya:studio-ready", storeId: store }, location.origin);
</script>`;

async function openGrowth(page, { mode = "payment", empty = false, width = 1280 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  const calls = [];
  const state = { answer: (n) => overview({ mode, n, empty }) };
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
    try { localStorage.removeItem("pagosya_growth_days"); } catch {}
  });
  await page.route("**/studio/**", (route) => route.fulfill({ contentType: "text/html", body: STUDIO_STUB }));
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.includes("/growth/")) calls.push({ method: request.method(), path, search: url.search, body: request.postData() });
    if (path === "/stores/store_1/growth/overview") return json(state.answer(Number(url.searchParams.get("days") || 30)));
    if (path.startsWith("/stores/store_1/growth/insights")) return json({ ok: true });
    if (path === "/dashboard/daily-login-reward") return json({ awarded: false, totalStars: 1, wheelAvailable: false });
    if (path === "/dashboard/rewards") return json({});
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z" });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    if (path === "/stores") return json([{ ...baseStore, checkoutMode: mode, publishedSourceRevision: empty ? null : 3 }]);
    if (path === "/stores/store_1/payment_links") return json(products);
    if (path === "/stores/store_1/proposals/summary") return json({ counts: { all: 0, draft: 0, open: 0, changes: 0, accepted: 0, closed: 0 }, totals: [] });
    if (path === "/stores/store_1/cobros/summary") return json({ counts: { all: 0, open: 0, overdue: 0, paid: 0, draft: 0 }, totals: [] });
    if (path === "/stores/store_1/documents") return json([]);
    if (path.endsWith("/visual-studio")) return json({ proposals: [], versions: [] });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "NOT_CONFIGURED" });
    if (path === "/merchants/balance") return json({ payableBalance: 0, currency: "BOB", balances: [] });
    if (path === "/merchants/international_payments") return json({ status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains") || path.includes("/growth/inbox")) return json(path.includes("/growth/inbox") ? { items: [], unread: 0, nextBefore: null } : []);
    return json({});
  });
  await page.goto("/#dashboard-growth");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#workspaceTitle")).toHaveText("Crecimiento");
  return { calls, state };
}
const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

test.describe("Crecimiento", () => {
  test("a rich store at 1280: KPIs with deltas, the plan of action, funnel, charts with tables, and hosts as text", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openGrowth(page);
    const nav = page.locator('#dashboardNav > [data-dashboard-view]');
    await expect(nav.nth(0)).toHaveText("Resumen");
    await expect(nav.nth(1)).toHaveText("Crecimiento");
    await expect(nav.nth(1)).toHaveAttribute("aria-current", "page");
    const root = page.locator("#growthRoot");
    await expect(root.locator('[data-kpi="visits"]')).toContainText(/1\.?240/);
    await expect(root.locator('[data-kpi="visits"] .growth-delta')).toContainText("+18 %");
    await expect(root.locator('[data-kpi="addToCart"] .growth-delta')).toHaveClass(/is-down/);
    await expect(root.locator('[data-kpi="checkouts"] .growth-delta')).toContainText("Nuevo");
    await expect(root.locator('[data-kpi="outcome"]')).toContainText("Bs 3.450,00 netos");
    await expect(root.locator('[data-kpi="conversion"] .growth-delta')).toContainText("+0,1 pts");
    await expect(root.getByRole("heading", { name: "Tu semana" })).toBeVisible();
    await expect(root.locator(".growth-insight")).toHaveCount(5);
    await expect(root.locator(".growth-insight").first()).toContainText("Urgente");
    await expect(root.getByText("Estimación: al ritmo de este periodo, se agota en unos 10 días.")).toBeVisible();
    await expect(root.getByRole("button", { name: "Mostrar ocultas (1)" })).toBeVisible();
    await expect(root.locator(".growth-funnel li")).toHaveCount(5);
    const chart = root.getByRole("img", { name: /Este periodo y Periodo anterior/ });
    await expect(chart).toBeVisible();
    await page.screenshot({ path: `${SHOTS}rich-1280.png`, fullPage: true });
    await root.locator('[aria-labelledby="growthTrafficTitle"] summary').click();
    await expect(root.locator('[aria-labelledby="growthTrafficTitle"] table tbody tr')).toHaveCount(30);
    const refs = root.locator('[aria-labelledby="growthReferrersTitle"]');
    await expect(refs).toContainText("<b>evil</b>.example");
    await expect(refs.locator("b")).toHaveCount(0);
    await expect(refs.locator("a")).toHaveCount(0);
    await expect(root.locator('[aria-labelledby="growthCheckoutTitle"]')).toContainText("Llegaron al pago");
    await noOverflow(page);
    expect(errors).toEqual([]);
  });

  test("a rich store at 390 fits the phone", async ({ page }) => {
    await openGrowth(page, { width: 390 });
    await expect(page.locator("#growthRoot .growth-insight")).toHaveCount(5);
    await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}rich-390.png`, fullPage: true });
  });

  test("the period selector asks for 7 and 90 days", async ({ page }) => {
    const { calls } = await openGrowth(page);
    await page.getByRole("button", { name: "7 días", exact: true }).click();
    await expect(page.getByRole("button", { name: "7 días", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-labelledby="growthTrafficTitle"] table tbody tr')).toHaveCount(7);
    await page.getByRole("button", { name: "90 días", exact: true }).click();
    await expect(page.locator('[aria-labelledby="growthTrafficTitle"] table tbody tr')).toHaveCount(90);
    expect(calls.filter((call) => call.path.endsWith("/overview")).map((call) => call.search)).toEqual(["?days=30", "?days=7", "?days=90"]);
  });

  test("the YAPI button fills the composer in Diseñar sitio and sends nothing", async ({ page }) => {
    await openGrowth(page);
    await page.getByRole("button", { name: "Mejorar el carrito con YAPI" }).click();
    await expect(page.locator("#workspaceTitle")).toHaveText("Mi tienda");
    await expect.poll(() => page.evaluate(() => (window.__studio || []).find((m) => m.type === "pagosya:studio-action") || null)).toMatchObject({
      type: "pagosya:studio-action", action: "compose", origin: "growth", storeId: "store_1", text: "Mejora el carrito de mi tienda para que más clientes continúen. No cambies precios ni productos.",
    });
  });

  test("product and stock buttons open the product guide at the right step", async ({ page }) => {
    await openGrowth(page);
    await page.getByRole("button", { name: "Reponer stock" }).click();
    await expect(page.locator("#workspaceTitle")).toHaveText("Productos");
    await expect.poll(() => page.evaluate(() => (window.__studio || []).filter((m) => m.type === "pagosya:product-guide-edit").map((m) => [m.product.id, m.step]))).toEqual([["p1", "stock"]]);
    await page.goto("/#dashboard-growth");
    await page.getByRole("button", { name: "Mejorar las fotos de «Lámpara Nube»" }).click();
    await expect.poll(() => page.evaluate(() => (window.__studio || []).filter((m) => m.type === "pagosya:product-guide-edit").map((m) => [m.product.id, m.step]))).toEqual([["p1", "stock"], ["p1", "photos"]]);
  });

  test("promo, settings and inbox buttons land on the right screen, prefilled", async ({ page }) => {
    await openGrowth(page);
    await page.getByRole("button", { name: "Crear un código para esas visitas" }).click();
    await expect(page.locator("#promoCodeInput")).toHaveValue("INSTAGRAM");
    await page.goto("/#dashboard-growth");
    await page.getByRole("button", { name: "Escribir mis políticas" }).click();
    await expect(page.locator("#workspaceTitle")).toHaveText("Ajustes de la tienda");
    await expect(page.locator("#storeSettingsPoliciesTitle")).toBeInViewport();
  });

  test("the proposal button opens Propuestas' composer with the brief", async ({ page }) => {
    const { state } = await openGrowth(page);
    state.answer = (n) => ({ ...overview({ n }), insights: [insight("leads-to-proposal", "low", "proposal", { prompt: "Propuesta para un cliente que escribió a Casa Luz pidiendo información." }, "Convierte tus consultas en propuestas", "Recibiste 4 consultas en los últimos 30 días.", { label: "Crear una propuesta" })] });
    await page.getByRole("button", { name: "30 días", exact: true }).click();
    await page.getByRole("button", { name: "7 días", exact: true }).click();
    await page.getByRole("button", { name: "Crear una propuesta" }).click();
    await expect(page.locator("#workspaceTitle")).toHaveText("Propuestas");
    await expect(page.locator("#proposalBrief")).toHaveValue("Propuesta para un cliente que escribió a Casa Luz pidiendo información.");
  });

  test("snooze, dismiss, undo and restore talk to the API", async ({ page }) => {
    const { calls } = await openGrowth(page);
    const first = page.locator("#growthRoot .growth-insight").first();
    await first.getByRole("button", { name: /Recordar en 7 días/ }).click();
    await expect(page.locator("#growthRoot .growth-undo")).toContainText("Te la recordamos en 7 días.");
    await page.locator("#growthRoot").getByRole("button", { name: "Deshacer" }).click();
    await page.locator("#growthRoot .growth-insight").nth(1).getByRole("button", { name: /^Ocultar/ }).click();
    await page.locator("#growthRoot").getByRole("button", { name: /Mostrar ocultas/ }).click();
    await expect.poll(() => calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path, call.body])).toEqual([
      ["PUT", "/stores/store_1/growth/insights/checkout-drop%3Areview", JSON.stringify({ action: "snooze" })],
      ["PUT", "/stores/store_1/growth/insights/checkout-drop%3Areview", JSON.stringify({ action: "restore" })],
      ["PUT", "/stores/store_1/growth/insights/low-stock%3Ap1", JSON.stringify({ action: "dismiss" })],
      ["DELETE", "/stores/store_1/growth/insights", null],
    ]);
  });

  for (const width of [390, 1280]) {
    test(`a new store at ${width} learns what will appear and how to get visits`, async ({ page }) => {
      await openGrowth(page, { empty: true, width });
      const root = page.locator("#growthRoot");
      await expect(root.getByRole("heading", { name: "Aquí verás cómo crece tu tienda" })).toBeVisible();
      await expect(root.getByRole("button", { name: "Abrir el diseñador", exact: true })).toBeVisible();
      await expect(root.locator(".growth-share code")).toContainText("/s/casa-luz");
      await expect(root.getByRole("link", { name: "Compartir por WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
      await expect(root.locator(".growth-insight")).toHaveCount(2);
      await expect(root.locator(".growth-kpis")).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: `${SHOTS}empty-${width}.png`, fullPage: true });
    });
  }

  test("a WhatsApp store reads about WhatsApp orders, not payments", async ({ page }) => {
    await openGrowth(page, { mode: "whatsapp", width: 390 });
    const root = page.locator("#growthRoot");
    await expect(root.locator('[data-kpi="outcome"]')).toContainText("Pedidos por WhatsApp");
    await expect(root.getByRole("heading", { name: "Clics en el pedido" })).toBeVisible();
    await expect(root.locator('[aria-labelledby="growthCheckoutTitle"]')).not.toContainText(/pag(o|ar)/i);
    await page.screenshot({ path: `${SHOTS}whatsapp-390.png`, fullPage: true });
  });
});
