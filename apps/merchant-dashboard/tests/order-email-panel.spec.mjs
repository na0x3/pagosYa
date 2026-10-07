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

/** The store's own receipt, as the generator would have authored it: tables and inline styles. */
const AUTHORED_EMAIL = `<!doctype html><html><body style="margin:0;background:#f6f3ee">
  <table width="100%" style="background:#f6f3ee"><tr><td align="center">
    <table width="600" style="background:#ffffff;font-family:Georgia,serif;color:#2b2b2b">
      <tr><td style="padding:24px"><h1 style="margin:0;font-size:22px">Café Illimani</h1></td></tr>
      <tr><td style="padding:0 24px"><p>Hola Ana, gracias por tu compra.</p></td></tr>
      <tr><td style="padding:0 24px"><p>Orden: pi_SYNTH001</p></td></tr>
      <tr><td style="padding:0 24px 24px"><p><strong>Total: Bs 150,00</strong></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const PREVIEW_PATH = "/stores/store_1/source-project/order-email/preview";
const SEND_PATH = "/stores/store_1/source-project/order-email/test-send";

async function openDashboard(page, stores, responseForRequest) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = { ...request.postDataJSON(), websiteRevision: request.postDataJSON().revision + 1 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(stores[0].name);
  return requests;
}

async function navigateDashboard(page, view) {
  const sidebar = page.locator(".dashboard-sidebar");
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await sidebar.evaluate((element) => element.classList.contains("is-store-nav-pinned")))) await handle.click();
  const link = page.locator(`.dashboard-nav-button[data-dashboard-view="${view}"]`);
  await link.evaluate((element) => element.closest("details.dashboard-nav-group")?.setAttribute("open", ""));
  await link.click();
}

/**
 * Mail clients cannot be driven in CI, so this is the practical substitute the design spec
 * names: the merchant's real browser, the real server.mjs, both widths rendered. It also
 * proves the lazy import of /src/order-email-panel.mjs resolves — server.mjs keeps an
 * explicit /src/* allowlist, and a module missing from it 404s only in real use.
 */
test("the store-settings page renders the buyer's email at phone and desktop width", async ({ page }) => {
  let previews = 0;
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")], ({ path }) => {
    if (path === PREVIEW_PATH) {
      previews += 1;
      return { html: AUTHORED_EMAIL, repairs: ["logo: not an https url, dropped"] };
    }
    return undefined;
  });

  await navigateDashboard(page, "store-settings");
  // The preview lives on Ajustes' Correos tab.
  await page.getByRole("tab", { name: "Correos" }).click();

  const panel = page.locator(".order-email-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("h3")).toHaveText("Correo de confirmación");

  const frames = panel.locator(".order-email-frame iframe");
  await expect(frames).toHaveCount(2);
  await expect(frames.nth(0)).toHaveAttribute("width", "390");
  await expect(frames.nth(1)).toHaveAttribute("width", "640");

  // The store's own typography and total survive into the rendered frame.
  for (const index of [0, 1]) {
    const body = frames.nth(index).contentFrame().locator("body");
    await expect(body).toContainText("Café Illimani");
    await expect(body).toContainText("Orden: pi_SYNTH001");
    await expect(body).toContainText("Total: Bs 150,00");
  }

  // A closed sandbox is what makes rendering a store's authored HTML here safe.
  await expect(frames.nth(0)).toHaveAttribute("sandbox", "");

  await expect(panel.locator(".order-email-repairs summary")).toContainText("(1)");
  expect(previews).toBe(1);
  expect(requests.some((r) => r.path === PREVIEW_PATH)).toBe(true);
});

/**
 * A merchant reading this on their own phone has a content column of about 250px. An iframe held
 * to that by max-width does not scale the email down, it re-lays it out at 250px — so the frame
 * captioned "Teléfono · 390px" would be showing line breaks no buyer will ever see. The frames
 * keep their real width and the strip scrolls instead.
 */
test("on a phone the frames still render at the width their captions claim", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, [store("store_1", "Café Illimani")], ({ path }) =>
    path === PREVIEW_PATH ? { html: AUTHORED_EMAIL, repairs: [] } : undefined,
  );

  await navigateDashboard(page, "store-settings");
  // The preview lives on Ajustes' Correos tab.
  await page.getByRole("tab", { name: "Correos" }).click();
  const panel = page.locator(".order-email-panel");
  const frames = panel.locator(".order-email-frame iframe");
  await expect(frames).toHaveCount(2);

  for (const [index, width] of [[0, 390], [1, 640]]) {
    expect(Math.round((await frames.nth(index).boundingBox()).width)).toBe(width);
    // The document inside laid out at that width, not at the column's.
    const inner = await frames.nth(index).contentFrame().locator("body").evaluate(() => document.documentElement.clientWidth);
    expect(inner).toBeGreaterThan(width - 4);
  }

  // The strip scrolls; the page itself must not.
  const strip = panel.locator(".order-email-frames");
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the merchant can send themselves a copy, and the panel never supplies the address", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")], ({ path }) => {
    if (path === PREVIEW_PATH) return { html: AUTHORED_EMAIL, repairs: [] };
    if (path === SEND_PATH) return { sent: true };
    return undefined;
  });

  await navigateDashboard(page, "store-settings");
  // The preview lives on Ajustes' Correos tab.
  await page.getByRole("tab", { name: "Correos" }).click();
  const panel = page.locator(".order-email-panel");
  await expect(panel.locator(".order-email-frame iframe")).toHaveCount(2);

  await panel.locator("[data-order-email-test]").click();
  await expect(panel.locator(".order-email-status")).toContainText("Te enviamos una prueba");

  const send = requests.find((r) => r.path === SEND_PATH);
  expect(send.method).toBe("POST");
  // The server reads the address off the session; a body carrying one would be a way out.
  // An empty POST body parses as null, so the assertion is that no address rode along.
  expect(send.body ?? null).toBeNull();
});

test("a failed preview says so instead of showing an empty frame", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")]);
  // Registered after the catch-all, so Playwright matches this more recent route first.
  await page.route(`http://localhost:3001/v1${PREVIEW_PATH}`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "No pudimos preparar la vista previa." }) }),
  );

  await navigateDashboard(page, "store-settings");
  // The preview lives on Ajustes' Correos tab.
  await page.getByRole("tab", { name: "Correos" }).click();
  const panel = page.locator(".order-email-panel");
  await expect(panel.locator(".order-email-status")).toContainText("No pudimos preparar la vista previa");
  await expect(panel.locator(".order-email-frame iframe")).toHaveCount(0);
});
