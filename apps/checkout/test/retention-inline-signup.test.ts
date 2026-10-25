import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// Owner 2026-10-25 (BOXY): the footer's email entry opened a form; the email should be typed right in the page. The kit draws
// the field into data-pagosya-subscribe-inline; on a published store pagosYa's secure dialog opens with it filled in.
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });
const settings = { signupEnabled: true, signupTitle: "Primero en saber", signupBody: "Lotes nuevos", signupButton: "Suscribirme", popupTrigger: "none", recoveryEnabled: false };

async function mount(options: { hosted?: boolean; enabled?: boolean } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body><main><h1>BOXY</h1></main><footer><div data-pagosya-subscribe-inline></div></footer></body>`, { runScripts: "outside-only", virtualConsole, url: "https://boxy.test/" });
  windows.push(dom);
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (options.hosted) {
    w.PAGOSYA_HOSTED = true;
    w.PAGOSYA_HOSTED_REQUEST = vi.fn(async (action: string, body: any) => body.path === "" ? { ok: true, body: { ...settings, signupEnabled: options.enabled ?? true } } : { ok: true, body: {} });
  } else {
    w.fetch = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).endsWith("/retention") ? { ...settings, signupEnabled: options.enabled ?? true } : { code: "BOXY10" }) }));
  }
  w.eval(retention);
  await w.PAGOSYA_RETENTION_MOUNT({ slug: "boxy", apiBaseUrl: "https://api.test/v1", data: { storeName: "BOXY" } });
  return w;
}
const submit = (w: any) => w.document.querySelector(".pagosya-inline-signup").dispatchEvent(new w.Event("submit", { cancelable: true }));

it("draws an email field with its button and consent in the page", async () => {
  const w = await mount();
  const form = w.document.querySelector("[data-pagosya-subscribe-inline] .pagosya-inline-signup");
  expect(form.querySelector("input[type=email][name=email]")).not.toBeNull();
  expect(form.querySelector("button[type=submit]").textContent).toBe("Suscribirme");
  expect(form.querySelector("input[type=checkbox][name=consent]")).not.toBeNull();
});

it("subscribes the typed email once consent is given", async () => {
  const w = await mount();
  const doc = w.document;
  doc.querySelector(".pagosya-inline-signup input[name=email]").value = "ana@correo.bo";
  submit(w);
  expect(doc.querySelector(".pagosya-inline-signup [role=status]").textContent).toContain("casilla");
  doc.querySelector(".pagosya-inline-signup input[name=consent]").checked = true;
  submit(w);
  await vi.waitFor(() => expect(doc.querySelector(".pagosya-inline-signup [role=status]").textContent).toContain("BOXY10"));
  const call = w.fetch.mock.calls.find(([url]: [string]) => String(url).endsWith("/retention/subscribe"));
  expect(JSON.parse(call[1].body)).toEqual({ email: "ana@correo.bo", consent: true });
});

it("on a published store hands the typed email to pagosYa's secure dialog", async () => {
  const w = await mount({ hosted: true });
  const doc = w.document;
  expect(doc.querySelector(".pagosya-inline-signup input[name=consent]")).toBeNull();
  doc.querySelector(".pagosya-inline-signup input[name=email]").value = "ana@correo.bo";
  submit(w);
  await vi.waitFor(() => expect(w.PAGOSYA_HOSTED_REQUEST).toHaveBeenCalledWith("retention", { path: "subscribe", payload: { consent: true, email: "ana@correo.bo" } }));
});

it("stays hidden while signup is off", async () => {
  const w = await mount({ enabled: false });
  expect(w.document.querySelector("[data-pagosya-subscribe-inline]").hidden).toBe(true);
});
