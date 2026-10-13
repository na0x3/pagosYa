import { expect, test } from "@playwright/test";

// Crecer › Carritos abandonados with a mocked API.
const store = { id: "store_1", merchantId: "m1", slug: "casa-luz", name: "Casa Luz", status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" };
const STORE_URL = "http://localhost:5174/s/casa-luz";
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const carts = () => [
  { key: "email:ana@example.com", source: "payment", name: "Ana Rojas", email: "ana@example.com", phone: "70000001", items: [{ name: "Café", variant: null, quantity: 2 }], total: 2000, currency: "BOB", leftAt: hoursAgo(3), reminder: "none", recoverUrl: null, storeUrl: STORE_URL },
  { key: "email:bruno@example.com", source: "saved", name: null, email: "bruno@example.com", phone: null, items: [{ name: "Té", variant: "Grande", quantity: 1 }], total: 1500, currency: "BOB", leftAt: hoursAgo(5), reminder: "scheduled", recoverUrl: `${STORE_URL}?recover=abc`, storeUrl: STORE_URL },
  { key: "phone:70000003", source: "payment", name: '<img src=x onerror="window.__xss=1">', email: null, phone: "+591 70000003", items: [{ name: "Café", variant: null, quantity: 1 }], total: 1000, currency: "BOB", leftAt: hoursAgo(26), reminder: "sent", recoverUrl: `${STORE_URL}?recover=def`, storeUrl: STORE_URL },
  { key: "email:eva@example.com", source: "saved", name: "Eva", email: "eva@example.com", phone: null, items: [{ name: "Café", variant: null, quantity: 3 }], total: 3000, currency: "BOB", leftAt: hoursAgo(30), reminder: "none", recoverUrl: `${STORE_URL}?recover=ghi`, storeUrl: STORE_URL },
];

async function open(page, answer) {
  const asked = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "carts-test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    let body = [];
    if (path === "/stores") body = [store];
    else if (path === "/stores/store_1/abandoned-carts") { asked.push(url.searchParams.get("days")); body = answer(Number(url.searchParams.get("days"))); }
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
  return asked;
}

test("Crecer › Carritos abandonados lists who left, with reminders and follow-up links; a hostile name stays text", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const asked = await open(page, (days) => ({ anonymousSessions: days === 30 ? 12 : 4, carts: carts() }));
  await page.locator('[data-nav-group="crecer"] > summary').click();
  await page.locator('[data-dashboard-view="abandoned-carts"]').click();
  await expect(page.locator("#workspaceTitle")).toHaveText("Carritos abandonados");
  await expect(page.locator(".carts-anonymous")).toHaveText("4 visitas dejaron su carrito sin dejar contacto");
  const rows = page.locator(".carts-row");
  await expect(rows).toHaveCount(4);
  for (const text of ["Ana Rojas", "Café ×2", "Bs 20,00", "hace 3 h", "Generó el QR / pulsó Pagar"]) await expect(rows.nth(0)).toContainText(text);
  await expect(rows.nth(0)).not.toContainText("Recordatorio");
  for (const text of ["bruno@example.com", "Té (Grande) ×1", "Guardó su carrito", "Recordatorio programado"]) await expect(rows.nth(1)).toContainText(text);
  for (const text of ["<img", "hace 1 día", "Recordatorio enviado"]) await expect(rows.nth(2)).toContainText(text);
  await expect(rows.nth(3)).toContainText("Sin recordatorio");
  await expect(page.locator(".carts-row img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  const whatsapp = await rows.nth(0).getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/59170000001\?text=/);
  expect(decodeURIComponent(whatsapp.split("?text=")[1])).toBe(`Hola Ana, vimos que dejaste Café ×2 en Casa Luz. ¿Te ayudamos a terminar tu compra? ${STORE_URL}`);
  await expect(rows.nth(1).getByRole("link", { name: "Escribir por WhatsApp" })).toHaveCount(0);
  const mail = await rows.nth(1).getByRole("link", { name: "Escribir por correo" }).getAttribute("href");
  expect(mail.startsWith("mailto:bruno@example.com?subject=")).toBe(true);
  expect(decodeURIComponent(mail)).toContain(`${STORE_URL}?recover=abc`);
  expect(decodeURIComponent((await rows.nth(2).getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href")).split("?text=")[1])).toMatch(/^Hola <img/);

  await page.getByRole("button", { name: "30 días" }).click();
  await expect(page.locator(".carts-anonymous")).toHaveText("12 visitas dejaron su carrito sin dejar contacto");
  expect(asked[0]).toBe("7");
  expect(asked.at(-1)).toBe("30");
  expect(errors).toEqual([]);
});

test("with no contactable carts it says so and still counts anonymous sessions", async ({ page }) => {
  await open(page, () => ({ anonymousSessions: 1, carts: [] }));
  await page.evaluate(() => window.setDashboardView("abandoned-carts"));
  await expect(page.locator(".carts-empty")).toHaveText("Todavía no hay carritos abandonados con contacto.");
  await expect(page.locator(".carts-anonymous")).toHaveText("1 visita dejó su carrito sin dejar contacto");
});
