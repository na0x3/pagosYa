import { expect, test } from "@playwright/test";

// Crecer › Asistente with a mocked API.
const store = { id: "store_1", merchantId: "m1", slug: "casa-luz", name: "Casa Luz", status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" };
const XSS = '<img src=x onerror="window.__xss=1">';
const baseView = () => ({ settings: { enabled: false, name: null, avatarUrl: null, greeting: null, formality: "tu", notes: "" }, usage: { used: 12, cap: 300, previewUsed: 0, previewCap: 50 }, platformEnabled: true, publishedDesign: true, coupons: [{ id: "k1", code: XSS, label: "10% de descuento", showInAssistant: false }] });
let view, sent, promoSent, testSent, putError, answered;

async function open(page) {
  view = baseView(); sent = []; promoSent = []; testSent = []; putError = null; answered = false;
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "assistant-test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    const method = route.request().method();
    const json = () => JSON.parse(route.request().postData());
    let body = [], status = 200;
    if (path === "/stores") body = [store];
    else if (path === "/stores/store_1/assistant" && method === "GET") body = view;
    else if (path === "/stores/store_1/assistant" && method === "PUT") {
      if (putError) { status = 400; body = { message: putError }; }
      else { sent.push(json()); view = { ...view, settings: { ...view.settings, ...sent.at(-1) } }; body = view; }
    }
    else if (path === "/stores/store_1/assistant/test") {
      testSent.push(json());
      view = { ...view, usage: { ...view.usage, previewUsed: view.usage.previewUsed + 1 } };
      body = { conversationId: "t1", reply: { text: XSS, blocks: [{ type: "products", items: [{ name: "Café", price: "Bs 20,00", inStock: true }] }] } };
    }
    else if (path === "/stores/store_1/promo-codes/k1") { promoSent.push(json()); body = {}; }
    else if (path === "/stores/store_1/assistant/conversations") body = { conversations: [{ id: "c1", startedAt: new Date().toISOString(), firstQuestion: "Hola", buyerMessages: 2, addedToCart: true, handedOff: false }] };
    else if (path === "/stores/store_1/assistant/conversations/c1") body = { id: "c1", startedAt: new Date().toISOString(), messages: [{ role: "buyer", text: XSS }, { role: "assistant", text: "¡Hola!" }] };
    else if (path === "/stores/store_1/assistant/unanswered") body = { questions: answered ? [] : [{ id: "u1", question: XSS, count: 3, lastAskedAt: new Date().toISOString() }] };
    else if (path === "/stores/store_1/assistant/unanswered/u1") {
      if (answered) { status = 409; body = { message: "Esta pregunta ya fue atendida." }; }
      else {
        sent.push(json());
        // Like the API: a taught answer is appended to the saved notes.
        if (json().action === "teach") { const line = `Pregunta: ${XSS}\nRespuesta: ${json().answer}`; view = { ...view, settings: { ...view.settings, notes: view.settings.notes ? `${view.settings.notes}\n\n${line}` : line } }; }
        body = view;
      }
    }
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
}

async function goToAssistant(page) {
  await page.locator('[data-nav-group="crecer"] > summary').click();
  await page.locator('[data-dashboard-view="assistant"]').click();
  await expect(page.locator("#workspaceTitle")).toHaveText("Asistente");
  await expect(page.locator("#assistantRoot")).toContainText("12 de 300 conversaciones este mes");
}

test("Crecer › Asistente switches on, teaches an answer, and keeps hostile text as text", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await goToAssistant(page);
  await page.getByLabel("Activar asistente").check();
  await expect.poll(() => sent[0]).toEqual({ enabled: true });
  await page.locator("[data-assistant-answer]").fill("Sí, con NIT.");
  await page.getByRole("button", { name: "Enseñar respuesta" }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ action: "teach", answer: "Sí, con NIT." });
  await page.locator('[data-assistant-open="c1"]').click();
  await expect(page.locator(".assistant-thread")).toContainText("¡Hola!");
  await expect(page.locator(".assistant-thread")).toContainText("<img");
  await expect(page.locator("#assistantRoot img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a refused save shows the server message and the switch stays off", async ({ page }) => {
  await open(page);
  await goToAssistant(page);
  putError = "Tu política de privacidad es demasiado larga para activar el asistente.";
  await page.getByLabel("Activar asistente").check();
  await expect(page.locator(".assistant-status")).toHaveText(putError);
  await expect(page.getByLabel("Activar asistente")).not.toBeChecked();
});

test("a store without a published design explains it and cannot switch on", async ({ page }) => {
  await open(page);
  view = { ...view, publishedDesign: false };
  await goToAssistant(page);
  await expect(page.locator(".assistant-note")).toContainText("diseño publicado");
  await expect(page.getByLabel("Activar asistente")).toBeDisabled();
});

test("unsaved edits and the test chat survive other actions; coupons and usage update", async ({ page }) => {
  await open(page);
  await goToAssistant(page);
  await page.getByLabel("Lo que el asistente debe saber").fill("Enviamos los lunes.");
  await page.locator('[data-assistant-field="name"]').fill("Lucía");
  await page.getByLabel(/puede ofrecer/i).check();
  await expect.poll(() => promoSent.at(-1)).toEqual({ showInAssistant: true });
  await expect(page.locator(".assistant-status")).toHaveText("Cupones actualizados.");
  await expect(page.getByLabel("Lo que el asistente debe saber")).toHaveValue("Enviamos los lunes.");
  await expect(page.locator('[data-assistant-field="name"]')).toHaveValue("Lucía");

  await expect(page.locator("#assistantRoot")).toContainText("0 de 50 pruebas este mes");
  await page.getByLabel("Pregunta de prueba").fill("¿Tienen café?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator("[data-assistant-test-log]")).toContainText("Café · Bs 20,00");
  await expect(page.locator("#assistantRoot")).toContainText("1 de 50 pruebas este mes");
  await page.getByLabel("Pregunta de prueba").fill("¿Y té?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator("#assistantRoot")).toContainText("2 de 50 pruebas este mes");
  expect(testSent).toEqual([{ message: "¿Tienen café?" }, { conversationId: "t1", message: "¿Y té?" }]);

  await page.locator('[data-assistant-open="c1"]').click();
  await expect(page.locator(".assistant-thread")).toContainText("¡Hola!");
  await expect(page.locator("[data-assistant-test-log]")).toContainText("¿Tienen café?");
  await expect(page.locator("[data-assistant-test-log]")).toContainText("Café · Bs 20,00");
  await expect(page.getByLabel("Lo que el asistente debe saber")).toHaveValue("Enviamos los lunes.");

  await page.getByRole("button", { name: "Guardar notas" }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ notes: "Enviamos los lunes." });
  await expect(page.locator('[data-assistant-field="name"]')).toHaveValue("Lucía");
  await expect(page.locator("#assistantRoot img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("an already-answered question reloads the list", async ({ page }) => {
  await open(page);
  await goToAssistant(page);
  answered = true;
  await page.locator("[data-assistant-answer]").fill("Sí.");
  await page.getByRole("button", { name: "Enseñar respuesta" }).click();
  await expect(page.locator(".assistant-status")).toHaveText("Esta pregunta ya fue atendida.");
  await expect(page.locator("#assistantRoot")).toContainText("Todavía no hay preguntas sin respuesta.");
});

test("teaching an answer keeps unsaved notes and adds the taught line to them", async ({ page }) => {
  await open(page);
  await goToAssistant(page);
  const notes = page.getByLabel("Lo que el asistente debe saber");
  await notes.fill("Enviamos los lunes.");
  await page.locator("[data-assistant-answer]").fill("Sí, con NIT.");
  await page.getByRole("button", { name: "Enseñar respuesta" }).click();
  await expect(page.locator(".assistant-status")).toHaveText("Respuesta agregada a las notas.");
  await expect(notes).toHaveValue(`Enviamos los lunes.\n\nPregunta: ${XSS}\nRespuesta: Sí, con NIT.`);
  await page.getByRole("button", { name: "Guardar notas" }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ notes: `Enviamos los lunes.\n\nPregunta: ${XSS}\nRespuesta: Sí, con NIT.` });
});

test("teaching an answer with no unsaved notes shows the saved notes from the server", async ({ page }) => {
  await open(page);
  view.settings.notes = "Tostamos los martes.";
  await goToAssistant(page);
  await page.locator("[data-assistant-answer]").fill("Sí, con NIT.");
  await page.getByRole("button", { name: "Enseñar respuesta" }).click();
  await expect(page.getByLabel("Lo que el asistente debe saber")).toHaveValue(`Tostamos los martes.\n\nPregunta: ${XSS}\nRespuesta: Sí, con NIT.`);
});
