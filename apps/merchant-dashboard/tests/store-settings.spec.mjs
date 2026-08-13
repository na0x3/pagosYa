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
});

async function openDashboard(page, stores = [store("store_1", "Primera"), store("store_2", "Segunda")]) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3000/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    requests.push({ path, method: request.method(), body: request.postDataJSON?.() });
    let body = {};
    if (path === "/stores") body = stores;
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/payouts" || path === "/payment_intents" || path.includes("/categories") || path.includes("/payment_links")) body = [];
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/settings")) body = request.postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-appearance");
  await expect(page.locator("#storeNameInput")).toHaveValue(stores[0].name);
  if (await page.locator("dialog[open]").count()) {
    await page.getByRole("button", { name: "Explorar por mi cuenta" }).click();
  }
  const appearanceToggle = page.locator("#storeSettingsSection > .panel > .section-head .section-toggle");
  if (await appearanceToggle.getAttribute("aria-expanded") !== "true") await appearanceToggle.click();
  await expect(page.locator("#storeNameInput")).toBeVisible();
  return requests;
}

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
