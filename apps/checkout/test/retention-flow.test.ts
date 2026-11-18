import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";
import { withoutPersonalFields } from "../src/trusted-form";

// Popups 2.0 part 1 (spec 2026-11-18 §7): the runtime plays a YAPI-written design — offer → pick → capture → reveal → land with the
// code in the cart and the chosen product opened.
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
const ID = "cdesign000000000000000001";
const steps = {
  o: '<div><button data-close aria-label="Cerrar">×</button><h2>15% para ti</h2><button data-next>Quiero</button></div>',
  p: '<div><button data-close aria-label="Cerrar">×</button><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b><i data-slot="price"></i></li></ul></div>',
  c: '<div><button data-close aria-label="Cerrar">×</button><input data-field="whatsapp"><button data-submit>Enviar</button><p data-slot="error"></p></div>',
  r: '<div><button data-close aria-label="Cerrar">×</button><strong data-slot="code"></strong><button data-next>Ir</button></div>',
};
const flow = [{ id: "o", kind: "offer" }, { id: "p", kind: "pick", products: ["p1", "p2", "p3"] }, { id: "c", kind: "capture" }, { id: "r", kind: "reveal" }, { id: "l", kind: "land", to: "product" }];
const design = { id: ID, flow, steps, css: ".x{color:red}", launcher: null, capture: "whatsapp", percent: 15 };
const items = [
  { id: "p1", name: "Habanero", price: 4500, imageUrls: ["https://cdn.test/a.jpg"] },
  { id: "p2", name: "Serrano", price: 4000, imageUrls: ["https://cdn.test/b.jpg"] },
  { id: "p3", name: "Viejo", price: 1, active: false, imageUrls: ["https://cdn.test/c.jpg"] },
];

async function mount(o: { items?: unknown[]; subscribe?: (body: any) => { ok: boolean; body: any }; hosted?: boolean; parent?: boolean; design?: Record<string, unknown>; privacy?: unknown } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body><main><h1>Calima</h1></main></body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(dom);
  const w = dom.window as any;
  const timers: Array<() => void> = [];
  w.setTimeout = (fn: () => void) => { timers.push(fn); return timers.length; };
  w.clearTimeout = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  const settings = { signupEnabled: true, popupTrigger: "load", popupDelaySeconds: 0, popupDesign: { ...design, ...(o.design ?? {}) } };
  const posts: any[] = [];
  const reply = (path: string, body: any) => { if (!body) return { ok: true, body: settings }; posts.push(body); return o.subscribe ? o.subscribe(body) : { ok: true, body: { subscribed: true, code: "POPABC234" } }; };
  w.fetch = vi.fn(async (url: string, init?: any) => { const r = reply(url, init?.body ? JSON.parse(init.body) : null); return { ok: r.ok, json: async () => r.body }; });
  if (o.hosted) { w.PAGOSYA_HOSTED = true; w.PAGOSYA_HOSTED_REQUEST = async (_kind: string, req: any) => reply(req.path, req.payload); }
  // The real parent page: personal fields are stripped, and its own form asks for WhatsApp only when the frame says so.
  if (o.parent) { w.PAGOSYA_HOSTED = true; w.PAGOSYA_HOSTED_REQUEST = async (_kind: string, req: any) => {
    if (!req.payload) return reply(req.path, null);
    const stripped = withoutPersonalFields("retention", { path: req.path, payload: req.payload }).payload as any;
    if (stripped.contact !== "whatsapp") return { ok: false, body: { message: "Esta tienda pide tu WhatsApp." } };
    return reply(req.path, { ...stripped, phone: "71234567", consent: true });
  }; }
  const events: string[] = [];
  w.document.addEventListener("pagosya:apply-promo", (e: any) => events.push(`promo:${e.detail.code}`));
  w.document.addEventListener("pagosya:favourite", (e: any) => events.push(`fav:${e.detail.id}:${e.detail.go}`));
  const messages: any[] = [];
  w.postMessage = (data: any) => messages.push(data);
  if (o.privacy) w.PAGOSYA_PRIVACY = o.privacy;
  w.eval(retention);
  await w.PAGOSYA_RETENTION_MOUNT({ slug: "calima", apiBaseUrl: "https://api.test/v1", data: { items: o.items ?? items } });
  for (const fn of timers.splice(0)) fn();
  const root = () => w.document.querySelector(`[data-pya-popup="${ID}"]`);
  const click = (selector: string) => root().querySelector(selector).click();
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  return { w, root, click, posts, events, messages, flush, timers };
}
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe("a YAPI popup design", () => {
  it("opens its first step inside the design root, with the design's CSS", async () => {
    const { root, w } = await mount();
    expect(root()).not.toBeNull();
    expect(root().textContent).toContain("15% para ti");
    expect([...w.document.querySelectorAll("style")].some((s: any) => s.textContent.includes(".x{color:red}"))).toBe(true);
  });

  it("fills one tile per active product and skips the pick step with fewer than 2", async () => {
    const a = await mount();
    a.click("[data-next]");
    const tiles = a.root().querySelectorAll("[data-tile]");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].querySelector("[data-slot=name]").textContent).toBe("Habanero");
    expect(tiles[0].querySelector("[data-slot=photo]").getAttribute("src")).toBe("https://cdn.test/a.jpg");
    const b = await mount({ items: [items[0]] });
    b.click("[data-next]");
    expect(b.root().querySelector("[data-field]")).not.toBeNull();
  });

  it("sends the contact once with the choice, keeps the step on an error, then reveals the code and lands", async () => {
    let fail = true;
    const m = await mount({ subscribe: () => (fail ? { ok: false, body: { message: "Escribe tu WhatsApp con 8 números." } } : { ok: true, body: { subscribed: true, code: "POPABC234" } }) });
    m.click("[data-next]");
    m.root().querySelector("[data-tile]").click();
    m.root().querySelector("[data-field]").value = "71234567";
    m.click("[data-submit]"); m.click("[data-submit]");
    await m.flush(); await m.flush();
    expect(m.posts).toEqual([{ phone: "71234567", contact: "whatsapp", consent: true, source: "popup", popupDesignId: ID, answers: [], favourite: "p1" }]);
    expect(m.root().querySelector("[data-slot=error]").textContent).toContain("8 números");
    fail = false;
    m.click("[data-submit]");
    await m.flush(); await m.flush();
    expect(m.root().querySelector("[data-slot=code]").textContent).toBe("POPABC234");
    m.click("[data-next]");
    expect(m.events).toEqual(["promo:POPABC234", "fav:p1:true"]);
    expect(m.w.document.querySelector("dialog").open).toBe(false);
  });

  it("on a hosted page tells the parent about the code before the favourite", async () => {
    const m = await mount({ hosted: true });
    m.click("[data-next]");
    m.root().querySelector("[data-tile]").click();
    m.root().querySelector("[data-field]").value = "71234567";
    m.click("[data-submit]");
    await m.flush(); await m.flush();
    m.click("[data-next]");
    expect(m.messages.map(msg => msg.type)).toEqual(["pagosya:apply-promo", "pagosya:favourite"]);
  });

  it("the Studio preview opens any step directly", async () => {
    const { w } = await mount();
    w.document.querySelector("dialog").close();
    w.PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: design }, { slug: "calima", data: { items } }, "c");
    expect(w.document.querySelector("[data-pagosya-popup-preview] [data-field]")).not.toBeNull();
  });

  // Final review 2026-11-18 (C1): on a published store the parent page strips the number and asks for it itself.
  it("on a published store the parent page asks for WhatsApp and the code comes back", async () => {
    const { click, root, posts, w, flush } = await mount({ parent: true });
    click("[data-next]"); click("[data-tile]");
    root().querySelector("[data-field]").value = "71234567";
    click("[data-submit]"); await flush(); await flush();
    expect(posts).toHaveLength(1);
    expect(root().querySelector("[data-slot=code]")?.textContent).toBe("POPABC234");
    void w;
  });
  // Final review (I7): a shopper who closes the reveal still gets the code in the cart.
  it("puts the code in the cart when the shopper closes after it was given", async () => {
    const { click, root, events, flush } = await mount();
    click("[data-next]"); click("[data-tile]");
    root().querySelector("[data-field]").value = "71234567";
    click("[data-submit]"); await flush(); await flush();
    click("[data-close]");
    expect(events).toEqual(["promo:POPABC234"]);
  });
  it("skips a quiz whose products were all archived", async () => {
    const quiz = '<div><button data-close aria-label="Cerrar">×</button><p data-question></p><button data-choice>x</button></div>';
    const { root } = await mount({ design: { flow: [{ id: "q", kind: "quiz", questions: [{ id: "a", text: "¿Picante?", answers: [{ id: "s", text: "Sí", products: ["p3"] }] }] }, { id: "c", kind: "capture" }, { id: "r", kind: "reveal" }], steps: { ...steps, q: quiz } } });
    expect(root().querySelector("[data-field]")).not.toBeNull();
  });
  // Final review (I5): photos YAPI wrote as /v1/uploads/… load from the API, in the steps and in the sheet.
  it("points the design's upload photos at the API", async () => {
    const { root, w } = await mount({ design: { steps: { ...steps, o: '<div><button data-close aria-label="Cerrar">×</button><img src="/v1/uploads/a.jpg" srcset="/v1/uploads/a.jpg 1x, /v1/uploads/b.jpg 2x" alt=""><button data-next>Quiero</button></div>' }, css: '.x{background:url("/v1/uploads/b.jpg")}' } });
    expect(root().querySelector("img").getAttribute("src")).toBe("https://api.test/v1/uploads/a.jpg");
    expect(root().querySelector("img").getAttribute("srcset")).toBe("https://api.test/v1/uploads/a.jpg 1x, https://api.test/v1/uploads/b.jpg 2x");
    expect(w.document.querySelector("dialog style").textContent).toContain('url("https://api.test/v1/uploads/b.jpg")');
  });
  // Owner 2026-11-18 «fix the small things» (final review minors).
  it("names the contact the store asks for, even after it changed in the settings", async () => {
    const c = '<div><button data-close aria-label="Cerrar">×</button><p>Déjanos <span data-slot="contact"></span></p><input data-field placeholder="71234567"><button data-submit>Enviar</button></div>';
    const { root, click } = await mount({ design: { capture: "email", steps: { ...steps, c } } });
    click("[data-next]"); click("[data-tile]");
    expect(root().querySelector("[data-slot=contact]").textContent).toBe("tu correo");
    expect(root().querySelector("[data-field]").getAttribute("type")).toBe("email");
    expect(root().querySelector("[data-field]").getAttribute("placeholder")).toBe("tu@correo.com");
  });
  it("falls back to the classic popup when the design has no step it can play", async () => {
    const { w } = await mount({ design: { steps: {} } });
    expect(w.document.querySelector("[data-pya-popup]")).toBeNull();
    expect(w.document.querySelector("dialog .signup-close")).not.toBeNull();
  });
  it("keeps YAPI's data-choice on every answer and drops the template", async () => {
    const quiz = '<div><button data-close aria-label="Cerrar">×</button><p data-question></p><button data-choice class="ans">x</button></div>';
    const { root } = await mount({ design: { flow: [{ id: "q", kind: "quiz", questions: [{ id: "a", text: "¿Picante?", answers: [{ id: "s", text: "Sí", products: ["p1"] }, { id: "n", text: "No", products: ["p2"] }] }] }, { id: "c", kind: "capture" }, { id: "r", kind: "reveal" }], steps: { ...steps, q: quiz } } });
    expect(Array.from(root().querySelectorAll("[data-choice]")).map((el: any) => el.textContent)).toEqual(["Sí", "No"]);
  });
  it("shows YAPI's launcher tab after the shopper closes, and it opens the popup again", async () => {
    const { w, click } = await mount({ design: { launcher: '<span class="tab">¿15% para ti?</span>' } });
    click("[data-close]");
    const tab = w.document.querySelector(`[data-pya-launcher] [data-pya-popup="${ID}"]`);
    expect(tab?.textContent).toContain("¿15% para ti?");
    (w.document.querySelector("[data-pya-launcher] button") as any).click();
    expect(w.document.querySelector("dialog").open).toBe(true);
    expect(w.document.querySelector("[data-pya-launcher]")).toBeNull();
  });
  // Live 2026-11-18 (Remolino, owner «its all buggy»): the cookie banner sat over the popup; answers lost YAPI's layout.
  it("waits for the cookie answer before opening", async () => {
    let answered: boolean | null = null;
    const { w, timers } = await mount({ privacy: { choice: () => answered } });
    expect(w.document.querySelector("dialog").open).toBe(false);
    answered = true;
    w.dispatchEvent(new w.CustomEvent("pagosya:privacy-change", { detail: { slug: "calima", analytics: true } }));
    for (const fn of timers.splice(0)) fn();
    expect(w.document.querySelector("dialog").open).toBe(true);
  });
  it("writes each answer into YAPI's answer slot, keeping the rest of its button", async () => {
    const quiz = '<div><button data-close aria-label="Cerrar">×</button><p data-question></p><button data-choice class="ans"><span data-slot="answer">x</span><i class="ico">→</i></button></div>';
    const { root } = await mount({ design: { flow: [{ id: "q", kind: "quiz", questions: [{ id: "a", text: "¿Picante?", answers: [{ id: "s", text: "Batidos todos los días", products: ["p1"] }, { id: "n", text: "No", products: ["p2"] }] }] }, { id: "c", kind: "capture" }, { id: "r", kind: "reveal" }], steps: { ...steps, q: quiz } } });
    const first = root().querySelector("[data-choice]");
    expect(first.querySelector("[data-slot=answer]").textContent).toBe("Batidos todos los días");
    expect(first.querySelector(".ico")?.textContent).toBe("→");
  });
  it("without a slot, replaces the template's own words and keeps its icon", async () => {
    const quiz = '<div><button data-close aria-label="Cerrar">×</button><p data-question></p><button data-choice><span class="t">Respuesta</span><i class="ico">→</i></button></div>';
    const { root } = await mount({ design: { flow: [{ id: "q", kind: "quiz", questions: [{ id: "a", text: "¿Picante?", answers: [{ id: "s", text: "Sí", products: ["p1"] }] }] }, { id: "c", kind: "capture" }, { id: "r", kind: "reveal" }], steps: { ...steps, q: quiz } } });
    const first = root().querySelector("[data-choice]");
    expect(first.querySelector(".t").textContent).toBe("Sí");
    expect(first.querySelector(".ico")?.textContent).toBe("→");
  });
});

