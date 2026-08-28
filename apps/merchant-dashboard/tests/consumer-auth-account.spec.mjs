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

test("consumer sees reusable Face Entry status and can delete only the biometric identity", async ({ page }) => {
  const requests = [];
  let deleted = false;
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    let body = {};
    if (path === "/consumer/dashboard") body = dashboard;
    else if (path === "/events/consumer/face-entry" && request.method() === "GET") {
      body = deleted
        ? { registered: false, status: "NOT_ENROLLED", requiresEnrollment: true }
        : { registered: true, status: "ACTIVE", registeredSince: "2026-06-12T12:00:00.000Z", eventsUsed: 3, requiresEnrollment: false };
    } else if (path === "/events/consumer/face-entry" && request.method() === "DELETE") {
      deleted = true;
      body = { status: "COMPLETED" };
    } else if (path === "/stores/public") body = { stores: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/consumer-face-entry-origin");
  await page.evaluate(() => localStorage.setItem("pagosya_consumer_session", "consumer_face_entry"));
  const html = await readFile(new URL("../../consumer-dashboard/index.html", import.meta.url), "utf8");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.locator("#marketPrimaryAction").click();

  await expect(page.locator("#faceEntryBadge")).toHaveText("Registrado");
  await expect(page.locator("#faceEntryPanel")).toContainText("Eventos utilizados");
  await expect(page.locator("#faceEntryPanel")).toContainText("3");
  await page.locator("#deleteFaceEntryButton").click();
  await expect(page.locator("#deleteFaceEntryDialog")).toContainText("Tus pagos y comprobantes");
  await expect(page.locator("#deleteFaceEntryDialog")).toContainText("Tus entradas y asignaciones históricas");
  await expect(page.locator("#confirmDeleteFaceEntry")).toBeDisabled();
  await page.locator("#deleteFaceEntryConfirmation").fill("ELIMINAR FACE ENTRY");
  await page.locator("#confirmDeleteFaceEntry").click();

  await expect(page.locator("#faceEntryBadge")).toHaveText("No registrado");
  expect(requests).toContainEqual({
    path: "/events/consumer/face-entry",
    method: "DELETE",
    body: { reason: "CUSTOMER_REQUESTED_FROM_ACCOUNT" },
  });
  expect(await page.evaluate(() => localStorage.getItem("pagosya_consumer_session"))).toBe("consumer_face_entry");
});
