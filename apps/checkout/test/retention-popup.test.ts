import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// The signup popup (plan 2026-10-20-store-popup): it waits for its moment, remembers the visitor for 30 days, sits as
// a bottom sheet on phones and shows the welcome code a popup signup earns.
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
const DAY = 86_400_000;
type Opts = { settings?: Record<string, unknown>; touch?: boolean; body?: string; search?: string; demo?: boolean; preview?: boolean; stored?: number; subscribe?: Record<string, unknown>; items?: unknown[] };

async function mount(o: Opts = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body><main><h1>PEPPA</h1></main>${o.body || ""}<footer></footer></body>`, { runScripts: "outside-only", virtualConsole, url: `https://tienda.test/${o.search || ""}` });
  windows.push(dom);
  const w = dom.window as any;
  let now = 1_800_000_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  w.setTimeout = (fn: () => void, ms = 0) => { timers.push({ at: now + ms, fn }); return timers.length; };
  w.clearTimeout = () => {};
  w.Date.now = () => now;
  const advance = (ms: number) => { now += ms; for (const t of timers.splice(0)) { if (t.at <= now) t.fn(); else timers.push(t); } };
  w.matchMedia = (q: string) => ({ matches: q.includes("coarse") ? Boolean(o.touch) : false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  if (o.stored !== undefined) w.localStorage.setItem("pagosya:popup:peppa", String(o.stored));
  const settings = { signupEnabled: true, signupTitle: "Get hotter news", signupBody: "Picante nuevo", signupButton: "Suscribirme", popupTrigger: "both", popupDelaySeconds: 8, popupHasCode: false, ...o.settings };
  const fetch = vi.fn(async (_url: string, init?: any) => ({ ok: true, json: async () => (init?.method === "POST" ? (o.subscribe || { subscribed: true }) : settings) }));
  w.fetch = fetch;
  w.eval(retention);
  const config = { slug: "peppa", apiBaseUrl: "https://api.test/v1", ...(o.demo ? { demo: true, data: { storeName: "PEPPA please", retention: settings, ...(o.items ? { items: o.items } : {}) } } : {}), ...(o.preview ? { preview: true, data: { retention: settings } } : {}) };
  await w.PAGOSYA_RETENTION_MOUNT(config);
  const dialog = () => w.document.querySelector("dialog.pagosya-signup-dialog");
  return { w, advance, dialog, fetch, now: () => now };
}
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe("when the popup opens", () => {
  it("waits for its delay", async () => {
    const { advance, dialog } = await mount({ settings: { popupTrigger: "delay", popupDelaySeconds: 8 } });
    advance(7_900); expect(dialog().open).toBeFalsy();
    advance(100); expect(dialog().open).toBe(true);
  });
  it("opens on exit intent with a pointer, never on a touch screen", async () => {
    const desk = await mount({ settings: { popupTrigger: "exit" } });
    desk.w.document.dispatchEvent(new desk.w.MouseEvent("mouseout", { clientY: 0, relatedTarget: null }));
    expect(desk.dialog().open).toBe(true);
    const phone = await mount({ settings: { popupTrigger: "exit" }, touch: true });
    phone.w.document.dispatchEvent(new phone.w.MouseEvent("mouseout", { clientY: 0, relatedTarget: null }));
    phone.advance(60_000);
    expect(phone.dialog().open).toBeFalsy();
  });
  it("uses only the delay for both triggers on a touch screen", async () => {
    const { advance, dialog } = await mount({ touch: true });
    advance(8_000); expect(dialog().open).toBe(true);
  });
});

describe("the popup remembers", () => {
  it("does not come back within 30 days of being closed", async () => {
    const first = await mount({ settings: { popupTrigger: "load" } });
    expect(first.dialog().open).toBe(true);
    first.dialog().close();
    expect(Number(first.w.localStorage.getItem("pagosya:popup:peppa"))).toBe(first.now());
    const again = await mount({ settings: { popupTrigger: "load" }, stored: first.now() - 29 * DAY });
    expect(again.dialog().open).toBeFalsy();
    const later = await mount({ settings: { popupTrigger: "load" }, stored: first.now() - 31 * DAY });
    expect(later.dialog().open).toBe(true);
  });
  it("never opens over a checkout, another dialog or an unsubscribe link", async () => {
    for (const o of [{ body: '<section class="pya-checkout"></section>' }, { body: "<dialog open></dialog>" }, { search: "?unsubscribe=abc" }, { body: "<section data-pagosya-checkout-page></section>" }]) {
      const { advance, dialog } = await mount({ settings: { popupTrigger: "delay", popupDelaySeconds: 1 }, ...o });
      advance(2_000);
      expect(dialog()?.open, JSON.stringify(o)).toBeFalsy();
    }
  });
});

describe("signing up from the popup", () => {
  it("asks for the welcome code and shows it with a copy button", async () => {
    const { w, dialog, fetch } = await mount({ settings: { popupTrigger: "load", popupHasCode: true }, subscribe: { subscribed: true, code: "PEPPA10" } });
    const form = dialog().querySelector("form");
    form.querySelector("[name=email]").value = "ana@example.com";
    form.querySelector("[name=consent]").checked = true;
    form.dispatchEvent(new w.Event("submit", { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    const body = JSON.parse(fetch.mock.calls.find(c => c[1]?.method === "POST")![1].body);
    expect(body).toMatchObject({ email: "ana@example.com", consent: true, source: "popup" });
    expect(dialog().querySelector(".signup-code strong")?.textContent).toBe("PEPPA10");
    expect(dialog().querySelector(".signup-code [data-copy]")).toBeTruthy();
  });
});

describe("demo and preview", () => {
  it("demo stores show the popup and fake the signup without the network", async () => {
    const { w, advance, dialog, fetch } = await mount({ demo: true });
    advance(8_000); expect(dialog().open).toBe(true);
    const form = dialog().querySelector("form");
    form.querySelector("[name=email]").value = "ana@example.com";
    form.querySelector("[name=consent]").checked = true;
    form.dispatchEvent(new w.Event("submit", { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(dialog().querySelector("[role=status]").textContent).toContain("Prueba completada");
  });
  it("the Studio preview never opens it", async () => {
    const { advance, dialog } = await mount({ preview: true });
    advance(60_000);
    expect(dialog()?.open).toBeFalsy();
  });
});

// PEPPA please 2026-10-20: the popup showed a blank photo, line-less fields and the kit's cream-and-Georgia look.
describe("the popup wears the store", () => {
  it("never leaves its colours undefined, and takes the store's own tokens first", () => {
    // Without a default an unset --signup-ink voided every border and tint built on it (the fields lost their lines).
    expect(retention).toMatch(/\.pagosya-signup-host\{--signup-paper:var\(--store-background,#[0-9a-f]+\);--signup-ink:var\(--store-foreground,#[0-9a-f]+\)/);
    expect(retention).toContain("--signup-accent:var(--store-accent,");
    expect(retention).toContain("--signup-heading:var(--store-heading-font,");
  });
  it("lets the page's tokens beat the API's brand colours", async () => {
    const { w } = await mount({ settings: { signupVisual: { brand: { background: "#ffffff", foreground: "#000000" } } } });
    const host = w.document.querySelector(".pagosya-signup-host");
    expect(host.style.getPropertyValue("--signup-paper")).toBe("var(--store-background,#ffffff)");
    expect(host.style.getPropertyValue("--signup-ink")).toBe("var(--store-foreground,#000000)");
  });
  it("finds a demo's product photo beside its scripts, skipping videos", async () => {
    const { dialog } = await mount({ demo: true, search: "tiendas/peppa", body: '<script src="/tiendas/peppa/commerce.js"></script>', items: [{ imageUrls: ["assets/clip.mp4", "assets/bottle.jpg"] }] });
    expect(dialog().querySelector(".pagosya-signup-photo img").getAttribute("src")).toBe("https://tienda.test/tiendas/peppa/assets/bottle.jpg");
  });
});
