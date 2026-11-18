import { expect, test } from "@playwright/test";

const submission = (screening, extra = {}) => ({
  id: "kyc_1", targetLevel: 1, legalName: "Eric Badege", taxId: null, legalRepName: "Eric Badege", legalRepDocumentId: "7654321", payoutBankAccount: "BNB 4012345678 — Eric Badege",
  ciFrontDocId: null, ciBackDocId: null, selfieDocId: null, createdAt: "2026-11-18T15:00:00.000Z", isPep: false, pepRole: null,
  merchant: { id: "m_1", name: "Tienda Uno", email: "t@example.com", settlementMode: "AGGREGATOR", level: 0 },
  payoutAccounts: [], screenings: screening ? [screening] : [], ...extra,
});
const possible = { id: "scr_1", status: "POSSIBLE_MATCH", matches: [{ source: "UN", primaryName: "ERIC BADEGE", listedName: "ERIC BADEGE", birthDates: ["1971"], nationalities: ["Democratic Republic of the Congo"], programs: ["DRC"], score: 1 }] };

async function openOps(page, pending, onRequest) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_session", "opss_test");
  });
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (await onRequest?.(route, path, request)) return;
    const json = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/internal/ops_users/me") return json({ id: "o1", name: "Ana", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" });
    if (path === "/v1/merchants/kyc/pending") return json(pending());
    if (path === "/internal/sanctions") return json({ required: true, lists: [{ source: "UN", importedAt: "2026-11-18T09:00:00.000Z", entries: 1007 }, { source: "OFAC", importedAt: "2026-11-18T09:00:00.000Z", entries: 17653 }] });
    if (path === "/internal/delivery_failures") return json({ payouts: { exhausted: [], retrying: [] }, invoices: { exhausted: [], retrying: [] }, webhookEvents: { exhausted: [], retrying: [] } });
    return json([]);
  });
  await page.goto("/");
}

test("a possible sanctions match shows the listed person and is decided with a reason", async ({ page }) => {
  let resolved = null;
  let current = submission(possible);
  await openOps(page, () => [current], async (route, path, request) => {
    if (path !== "/internal/sanctions/screenings/scr_1/resolve") return false;
    resolved = request.postDataJSON();
    current = submission({ ...possible, status: "DISMISSED", resolutionNote: resolved.note });
    await route.fulfill({ contentType: "application/json", body: "{}" });
    return true;
  });
  const cell = page.locator('#rows tr[data-id="kyc_1"] .screening-cell');
  await expect(page.locator("#sanctionsStatus")).toContainText("UN");
  await expect(page.locator("#sanctionsImport")).toBeVisible();
  await expect(cell).toContainText("Posible coincidencia");
  await expect(cell).toContainText("ERIC BADEGE");
  await expect(cell).toContainText("1971");
  await cell.getByRole("button", { name: "Es otra persona" }).click();
  await expect(page.locator("#error")).toContainText("Explica la decisión");
  expect(resolved).toBeNull();
  await cell.locator(".screening-note").fill("CI boliviano, nacido en 1994, no es la persona listada");
  await cell.getByRole("button", { name: "Es otra persona" }).click();
  await expect(cell).toContainText("Descartada");
  expect(resolved).toEqual({ decision: "DISMISSED", note: "CI boliviano, nacido en 1994, no es la persona listada" });
});

test("approving a declared PEP sends the enhanced-review note", async ({ page }) => {
  let review = null;
  await openOps(page, () => [submission({ id: "scr_2", status: "CLEAR", matches: [] }, { isPep: true, pepRole: "Concejal" })], async (route, path, request) => {
    if (path !== "/v1/merchants/kyc/kyc_1/review") return false;
    review = request.postDataJSON();
    await route.fulfill({ contentType: "application/json", body: "{}" });
    return true;
  });
  const row = page.locator('#rows tr[data-id="kyc_1"]');
  await expect(row.locator(".screening-cell")).toContainText("Sin coincidencias");
  await expect(row.locator(".screening-cell")).toContainText("PEP: Concejal");
  page.on("dialog", (dialog) => dialog.type() === "prompt" ? dialog.accept("Cargo verificado; ingresos de su tienda") : dialog.accept());
  await row.getByRole("button", { name: /Aprobar/ }).click();
  await expect.poll(() => review).toEqual({ decision: "APPROVED", note: "Cargo verificado; ingresos de su tienda" });
});
