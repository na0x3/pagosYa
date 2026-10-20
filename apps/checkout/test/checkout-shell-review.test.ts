import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// The one calm checkout (spec 2026-10-20) inside a store: the kit's order review, test payment and confirmation.
const commerce = readFileSync(kitPath("commerce.js"), "utf8");
const windows: JSDOM[] = [];
const product = (over: Record<string, unknown> = {}) => ({ id: "honey", name: "Irupana Honey", amount: 14400, currency: "BOB", stock: 9, imageUrls: ["https://cdn.test/honey.jpg"], variants: [], extras: [], ...over });
const baseStore = (over: Record<string, unknown> = {}) => ({ storeName: "Tostadero Yungas", logoUrl: "/v1/uploads/logo.png", bannerUrl: "/v1/uploads/banner.jpg", checkoutMode: "payment", locations: [], categories: [], items: [product()], ...over });

function runtime(store = baseStore(), body = '<header><a href="index.html">Inicio</a></header><main><h1>Tienda</h1></main>') {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body>${body}</body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(dom);
  const w = dom.window as any;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [{ id: "honey", quantity: 1 }];
  w.PAGOSYA_CONFIG = { slug: "tostadero", data: store, apiBaseUrl: "https://api.test/v1" };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(commerce);
  return w;
}
function openReview(w: any) { w.location.hash = "checkout"; w.dispatchEvent(new w.HashChangeEvent("hashchange")); return w.document.querySelector(".pya-checkout"); }
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe("kit order review — shell frame", () => {
  it("draws the shell with the store's logo and name, the steps and the review heading", () => {
    const root = openReview(runtime());
    expect(root).toBeTruthy();
    expect(root.querySelector(".pya-co__bar .pya-co__name").textContent).toBe("Tostadero Yungas");
    expect(root.querySelector(".pya-co__bar .pya-co__logo").getAttribute("src")).toBe("https://api.test/v1/uploads/logo.png");
    expect([...root.querySelectorAll(".pya-co__steps li")].map((li: any) => li.textContent)).toEqual(["Carrito", "Entrega", "Pago"]);
    expect(root.querySelector('.pya-co__steps [aria-current="step"]').textContent).toBe("Entrega");
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("Revisa tu pedido");
    expect(root.querySelector(".pya-co__lead [data-pagosya-status]")).toBeTruthy();
  });
  it("leaves out the logo image when the store has none", () => {
    expect(openReview(runtime(baseStore({ logoUrl: null }))).querySelector(".pya-co__bar img")).toBeNull();
  });
  it("ignores a store's checkout and review templates", () => {
    const templates = '<template data-pagosya-checkout-template><div class="caja"><div data-checkout-slot="heading"></div><div data-checkout-slot="review"></div></div></template><template data-pagosya-review-template><div class="revision"><div data-review-slot="summary"></div><section data-review-slot="fields"></section></div></template>';
    const root = openReview(runtime(baseStore(), `<main><h1>Tienda</h1></main>${templates}`));
    expect(root.querySelector(".caja, .revision, [data-review-root]")).toBeNull();
    expect(root.querySelector(".pya-co__lead h1").textContent).toBe("Revisa tu pedido");
  });
  it("covers an authored checkout page and takes its surroundings out of the tab order", () => {
    const w = runtime(baseStore(), '<header><a href="index.html" id="authored">Tostadero</a></header><main><aside id="aside"><img src="x.jpg"><h2>Tu pedido en Tostadero Yungas</h2></aside><section data-pagosya-checkout-page></section></main>');
    const root = w.document.querySelector("[data-pagosya-checkout-page]");
    expect(root.hidden).toBe(false);
    expect(root.classList.contains("pya-checkout")).toBe(true);
    expect(w.document.querySelector("header").inert).toBe(true);
    expect(w.document.querySelector("#aside").inert).toBe(true);
  });
});

describe("kit order review — content", () => {
  it("puts the business photo, the lines with a quantity badge and the totals in the summary", () => {
    const summary = openReview(runtime()).querySelector(".pya-co__summary");
    expect(summary.querySelector(".pya-co__photo").getAttribute("src")).toBe("https://api.test/v1/uploads/banner.jpg");
    const line = summary.querySelector(".pya-co__line");
    expect(line.querySelector(".pya-co__qty").textContent).toBe("1");
    expect(line.querySelector(".pya-co__line-text strong").textContent).toBe("Irupana Honey");
    expect(line.querySelector("[data-add]")).toBeTruthy();
    expect(summary.querySelector(".order-total strong").textContent).toContain("144");
  });
  it("falls back to the first line photo, and shows no photo box without either", () => {
    expect(openReview(runtime(baseStore({ bannerUrl: null }))).querySelector(".pya-co__photo").getAttribute("src")).toBe("https://cdn.test/honey.jpg");
    const bare = openReview(runtime(baseStore({ bannerUrl: null, logoUrl: null, items: [product({ imageUrls: [] })] })));
    expect(bare.querySelector(".pya-co__photo")).toBeNull();
    expect(bare.querySelector(".pya-co__thumb")).toBeNull();
  });
  it("previews the payment methods with their logos and adds the total to the pay button", () => {
    const root = openReview(runtime());
    expect([...root.querySelectorAll(".pya-co__methods--preview .pya-co__method-name")].map((n: any) => n.textContent)).toEqual(["Tarjeta", "QR", "Tigo Money", "Transferencia"]);
    expect(root.querySelector('.pya-co__logos [aria-label="Visa"]')).toBeTruthy();
    const pay = root.querySelector(".pya-co__main [data-pay]");
    expect(pay.classList.contains("pya-co__pay")).toBe(true);
    expect(pay.querySelector(".pya-co__pay-total").getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector(".pya-co__main .pya-co__trust")).toBeTruthy();
  });
  it("hides the payment preview for WhatsApp stores", () => {
    expect(openReview(runtime(baseStore({ checkoutMode: "whatsapp" }))).querySelector(".pya-co__methods--preview")).toBeNull();
  });
  it("drives the hidden delivery select from the radio cards", () => {
    const root = openReview(runtime(baseStore({ shippingEnabled: true, shippingPickupEnabled: true })));
    const select = root.querySelector("select[name=method]");
    expect(select.closest(".pya-co__mirrored")).toBeTruthy();
    const radios = [...root.querySelectorAll('.pya-co__choices input[type=radio]')] as any[];
    expect(radios.map(r => r.value)).toEqual([...select.options].map((o: any) => o.value));
    radios.find(r => r.value === "pickup").click();
    expect(select.value).toBe("pickup");
    radios.find(r => r.value === "delivery").click();
    expect(select.value).toBe("delivery");
  });
  it("mirrors the live total into the pay button and the phone summary bar", async () => {
    const root = openReview(runtime());
    root.querySelector(".order-total strong").textContent = "Bs 159,00";
    await new Promise(r => setTimeout(r, 0));
    expect(root.querySelector("[data-shell-total]").textContent).toBe("Bs 159,00");
    expect(root.querySelector(".pya-co__pay-total").textContent).toBe("· Bs 159,00");
  });
});
