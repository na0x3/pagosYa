import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// A contact form the design placed in its own section stays there, assistant or not (PEPPA please 2026-10-20: a
// «Contáctanos» section stood empty while the form floated in the corner).
const commerce = readFileSync(kitPath("commerce.js"), "utf8");
const windows: JSDOM[] = [];
function runtime(body: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body>${body}</body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(dom);
  const w = dom.window as any;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_CONFIG = { slug: "peppa", data: { storeName: "PEPPA please", contactFormEnabled: true, checkoutMode: "payment", locations: [], categories: [], items: [] } };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.eval(commerce);
  return w.document;
}
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

describe("contact form placement", () => {
  it("draws the form inside a section the design built for it, without an assistant", () => {
    const doc = runtime('<main><section id="contacto"><h2>Contáctanos</h2><p>Cuéntanos qué necesitas.</p><div class="peppa-contact__form" data-pagosya-contact></div></section></main>');
    const slot = doc.querySelector("[data-pagosya-contact]")!;
    expect(slot.hasAttribute("data-contact-inline")).toBe(true);
    expect((slot.querySelector("[data-contact-panel]") as HTMLElement).hidden).toBe(false);
    expect(slot.querySelector("form textarea, form [name=message]")).toBeTruthy();
  });
  it("keeps the corner button for a bare slot dropped at the end of the page", () => {
    const doc = runtime('<main><h1>PEPPA</h1><section><h2>Las salsas</h2></section><div data-pagosya-contact></div></main>');
    const slot = doc.querySelector("[data-pagosya-contact]")!;
    expect(slot.hasAttribute("data-contact-inline")).toBe(false);
    expect(slot.querySelector("[data-contact-toggle]")).toBeTruthy();
  });
});
