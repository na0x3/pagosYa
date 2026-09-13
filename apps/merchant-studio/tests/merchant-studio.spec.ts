import { expect, test } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const uploads = [
  path.join(projectRoot, "apps/matcho-showcase/public/matcho/hero.png"),
  path.join(projectRoot, "apps/matcho-showcase/public/matcho/gallery-1.jpg"),
  path.join(projectRoot, "apps/matcho-showcase/public/matcho/gallery-2.png"),
];

test("one selection fills all three image slots and checkout requires approval", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Cambios preparados" })).toBeVisible();

  await page.locator("[data-image-input]").setInputFiles(uploads);
  await expect(page.getByText("3 de 3 imágenes listas", { exact: true })).toBeVisible();
  await expect(page.locator(".batch-thumb.is-ready")).toHaveCount(3);
  await expect(page.locator(".hero-showcase img")).toHaveCount(3);

  await page.getByRole("button", { name: /Paleta de marca/ }).click();
  await expect(page.getByText("Tokens de tema de la tienda")).toBeVisible();
  await page.getByRole("button", { name: /Productos destacados/ }).click();
  await expect(page.getByText("Colección destacada")).toBeVisible();

  await page.locator("[data-page-select]").selectOption("checkout");
  await expect(page.getByText("El checkout afecta la conversión.")).toBeVisible();
  await page.getByRole("button", { name: /Publicar 4 cambios/ }).click();
  await expect(page.getByText("Revisa y aprueba el cambio de checkout antes de publicar.")).toBeVisible();

  await page.getByRole("button", { name: "Aprobar selección" }).click();
  await page.getByRole("button", { name: /Publicar 4 cambios/ }).click();
  await expect(page.getByText("4 cambios publicados.")).toBeVisible();
  await expect(pageErrors).toEqual([]);
});

test("connected mode signs in, uploads one three-image batch, reviews, and publishes", async ({ page }) => {
  const pageErrors: string[] = [];
  let uploadCount = 0;
  let proposalReady = false;
  let applied = false;
  let published = false;
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const store = { id: "store_1", name: "Savia", slug: "savia", status: "ACTIVE", websiteRevision: 0, websiteDraft: null as null | { data: Record<string, unknown> }, siteDocument: { version: 1, sections: [] } };
  const proposal = {
    id: "proposal_1",
    title: "Portada editorial",
    rationale: "Más jerarquía visual con el catálogo intacto.",
    status: "READY",
    baseWebsiteRevision: 0,
    config: { backgroundColor: "#f8f0de", accentColor: "#173e24" },
    createdAt: new Date().toISOString(),
  };
  const assistant = {
    id: "message_assistant",
    role: "ASSISTANT",
    content: "Preparé una variante privada. Nada fue aplicado ni publicado.",
    proposalId: proposal.id,
    metadata: { changedAreas: ["portada", "paleta"], preservedAreas: ["productos", "precios", "checkout"] },
    createdAt: new Date().toISOString(),
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = url.pathname.replace("/api/v1", "");
    const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (pathName === "/dashboard/login") return route.fulfill({ status: 200, headers, json: { token: "dash_test", expiresAt: new Date(Date.now() + 60_000).toISOString(), user: { email: "owner@savia.bo" } } });
    if (pathName === "/stores" && request.method() === "GET") return route.fulfill({ status: 200, headers, json: [store] });
    if (pathName.endsWith("/agent-conversation") && request.method() === "GET") return route.fulfill({ status: 200, headers, json: { thread: null, messages: proposalReady ? [assistant] : [] } });
    if (pathName.endsWith("/visual-studio") && request.method() === "GET") return route.fulfill({ status: 200, headers, json: { proposals: proposalReady ? [{ ...proposal, status: applied ? "APPLIED" : "READY" }] : [], versions: applied ? [{ id: "version_1", label: "Antes de Portada editorial", createdAt: new Date().toISOString() }] : [], lockedSectionIds: [] } });
    if (pathName === "/uploads" && request.method() === "POST") {
      uploadCount += 1;
      return route.fulfill({ status: 201, headers, json: { url: `/v1/uploads/file-${uploadCount}.png`, assetId: `asset_${uploadCount}` } });
    }
    if (pathName.endsWith("/agent-conversation/messages") && request.method() === "POST") {
      proposalReady = true;
      const data = request.postDataJSON() as { instruction: string; assetUrls: string[] };
      return route.fulfill({ status: 201, headers, json: { userMessage: { id: "message_user", role: "USER", content: data.instruction, metadata: { assetUrls: data.assetUrls }, createdAt: new Date().toISOString() }, assistantMessage: assistant, proposal, proposals: [proposal] } });
    }
    if (pathName.endsWith("/visual-proposals/proposal_1/apply") && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ revision: 0 });
      applied = true;
      store.websiteRevision = 1;
      store.websiteDraft = { data: proposal.config };
      return route.fulfill({ status: 201, headers, json: store });
    }
    if (pathName.endsWith("/website-draft/publish")) {
      expect(request.postDataJSON()).toEqual({ revision: 1 });
      published = true;
      store.websiteRevision = 2;
      store.websiteDraft = null;
      return route.fulfill({ status: 201, headers, json: store });
    }
    if (pathName === "/dashboard/logout") return route.fulfill({ status: 200, headers, json: { success: true } });
    return route.fulfill({ status: 404, headers, json: { message: `Unhandled ${request.method()} ${pathName}` } });
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Store preview</title><main>Store preview</main>" }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entrar a Merchant Studio" })).toBeVisible();
  await page.getByLabel("Correo").fill("owner@savia.bo");
  await page.getByLabel("Contraseña").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Entrar al Studio" }).click();
  await expect(page.getByText("Documento real conectado")).toBeVisible();

  await page.locator("[data-image-input]").setInputFiles(uploads);
  await expect(page.getByText("3 de 3 imágenes listas", { exact: true })).toBeVisible();
  await page.getByLabel("Indicación para YAPI").fill("Usa estas tres imágenes en la portada y hazla más editorial.");
  await page.getByRole("button", { name: "Enviar a YAPI" }).click();
  await expect(page.getByRole("heading", { name: "Portada editorial" })).toBeVisible();
  expect(uploadCount).toBe(3);
  await page.screenshot({ path: path.join(projectRoot, ".impeccable/merchant-studio-connected.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(projectRoot, ".impeccable/merchant-studio-connected-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: /Revisar checkout/ }).click();
  await expect(page.locator("[data-page-select]")).toHaveValue("checkout");
  await page.getByRole("button", { name: "Aprobar borrador" }).click();
  await page.getByRole("button", { name: "Usar en borrador" }).click();
  await expect(page.getByText("Borrador guardado en privado. Revísalo y pulsa Publicar.")).toBeVisible();
  expect(published).toBe(false);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText("Tienda publicada.", { exact: true })).toBeVisible();
  expect(published).toBe(true);
  expect(applied).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("captures the approved A+C desktop and mobile surfaces", async ({ browser }) => {
  const desktop = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await desktop.goto("/?demo=1");
  await desktop.screenshot({ path: path.join(projectRoot, ".impeccable/merchant-studio-desktop.png"), fullPage: true });
  await desktop.locator("[data-page-select]").selectOption("checkout");
  await desktop.screenshot({ path: path.join(projectRoot, ".impeccable/merchant-studio-checkout-desktop.png"), fullPage: true });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto("/?demo=1");
  await mobile.screenshot({ path: path.join(projectRoot, ".impeccable/merchant-studio-mobile.png"), fullPage: true });
  await mobile.close();
});
