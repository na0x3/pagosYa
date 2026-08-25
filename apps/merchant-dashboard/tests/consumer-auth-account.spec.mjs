import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const dashboard = {
  profile: { name: "Ana Pérez", carnetMasked: "••8899", email: "ana@gmail.com" },
  summary: { purchases: 0, activeInstitutions: 0, pendingObligations: 0, pendingAmount: 0 },
  affiliations: [],
  affiliationOffers: [],
  orders: [],
  payments: [],
};

test("consumer can use Google and then delete access with retained-evidence disclosure", async ({ page }) => {
  const requests = [];
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.google={accounts:{id:{initialize(options){window.googleCallback=options.callback},renderButton(element){const button=document.createElement('button');button.type='button';button.textContent='Continuar con Google';button.id='fakeConsumerGoogle';button.onclick=()=>window.googleCallback({credential:'consumer-google-token'});element.appendChild(button)}}}};`,
  }));
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    let body = {};
    if (path === "/auth/google") body = { enabled: true, clientId: "google-client-id.apps.googleusercontent.com" };
    else if (path === "/stores/public") body = { stores: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } };
    else if (path === "/consumer/google") body = { token: "consumer_google" };
    else if (path === "/consumer/dashboard") body = dashboard;
    else if (path === "/consumer/account") body = { deactivated: true };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/consumer-test-origin");
  const html = await readFile(new URL("../../consumer-dashboard/index.html", import.meta.url), "utf8");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.locator("#marketPrimaryAction").click();
  await page.locator("#googleCarnet").fill("77-8899");
  await page.locator("#fakeConsumerGoogle").click();

  await expect(page.locator("#marketNavName")).toHaveText("Ana Pérez");
  expect(requests).toContainEqual({
    path: "/consumer/google",
    method: "POST",
    body: { credential: "consumer-google-token", carnet: "77-8899" },
  });
  expect(await page.evaluate(() => localStorage.getItem("pagosya_consumer_session"))).toBe("consumer_google");

  await page.locator("#marketPrimaryAction").click();
  await page.locator("#deleteAccountButton").click();
  await expect(page.locator("#deleteAccountDialog")).toContainText("Pedidos y cambios de entrega");
  await expect(page.locator("#confirmDeleteAccount")).toBeDisabled();
  await page.locator("#deleteAccountConfirmation").fill("ELIMINAR");
  await page.locator("#confirmDeleteAccount").click();

  await expect(page.locator("#marketplacePage")).toBeVisible();
  expect(requests).toContainEqual({ path: "/consumer/account", method: "DELETE", body: { confirmation: "ELIMINAR" } });
  expect(await page.evaluate(() => localStorage.getItem("pagosya_consumer_session"))).toBeNull();
});
