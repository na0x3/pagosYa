import { expect, test } from "@playwright/test";

// Crecer › Asistente with a mocked API.
const store = { id: "store_1", merchantId: "m1", slug: "casa-luz", name: "Casa Luz", status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" };
let view = { settings: { enabled: false, name: null, avatarUrl: null, greeting: null, formality: "tu", notes: "" }, usage: { used: 12, cap: 300, previewUsed: 0, previewCap: 50 }, platformEnabled: true, publishedDesign: true, coupons: [] };
const sent = [];

async function open(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "assistant-test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    const method = route.request().method();
    let body = [];
    if (path === "/stores") body = [store];
    else if (path === "/stores/store_1/assistant" && method === "GET") body = view;
    else if (path === "/stores/store_1/assistant" && method === "PUT") { sent.push(JSON.parse(route.request().postData())); view = { ...view, settings: { ...view.settings, ...sent.at(-1) } }; body = view; }
    else if (path === "/stores/store_1/assistant/conversations") body = { conversations: [{ id: "c1", startedAt: new Date().toISOString(), firstQuestion: '<img src=x onerror="window.__xss=1">', buyerMessages: 2, addedToCart: true, handedOff: false }] };
    else if (path === "/stores/store_1/assistant/conversations/c1") body = { id: "c1", startedAt: new Date().toISOString(), messages: [{ role: "buyer", text: "hola" }, { role: "assistant", text: "¡Hola!" }] };
    else if (path === "/stores/store_1/assistant/unanswered") body = { questions: [{ id: "u1", question: "dan factura", count: 3, lastAskedAt: new Date().toISOString() }] };
    else if (path === "/stores/store_1/assistant/unanswered/u1") { sent.push(JSON.parse(route.request().postData())); body = view; }
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
}

test("Crecer › Asistente switches on, teaches an answer, and keeps hostile text as text", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.locator('[data-nav-group="crecer"] > summary').click();
  await page.locator('[data-dashboard-view="assistant"]').click();
  await expect(page.locator("#workspaceTitle")).toHaveText("Asistente");
  await expect(page.locator("#assistantRoot")).toContainText("12 de 300 conversaciones este mes");
  await page.getByLabel("Activar asistente").check();
  await expect.poll(() => sent[0]).toEqual({ enabled: true });
  await page.getByLabel("Respuesta para dan factura").fill("Sí, con NIT.");
  await page.getByRole("button", { name: "Enseñar respuesta" }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ action: "teach", answer: "Sí, con NIT." });
  await expect(page.locator("#assistantRoot img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await page.locator('[data-assistant-open="c1"]').click();
  await expect(page.locator(".assistant-thread")).toContainText("¡Hola!");
  expect(errors).toEqual([]);
});
