import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// Owner 2026-10-22: on Esencial's checkout page the <main> is the calm checkout itself. The cart reminder sat after the
// whole shell, unstyled and flush left, and the signup band (no footer to sit before) was appended inside the checkout.
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

async function mount() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body><header>Remolino</header><main class="es-page pya-checkout" data-pagosya-checkout><div data-pagosya-cart data-checkout-review class="checkout-review"><div class="pya-co__main"><button class="pya-co__pay">Continuar al pago de prueba</button></div><aside class="pya-co__summary"></aside></div></main></body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/checkout.html" });
  windows.push(dom);
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.eval(retention);
  const settings = { signupEnabled: true, signupTitle: "Únete al remolino", signupBody: "Recetas", signupButton: "Quiero mis recetas", popupTrigger: "none", recoveryEnabled: true };
  await w.PAGOSYA_RETENTION_MOUNT({ slug: "remolino", preview: true, data: { storeName: "Remolino", retention: settings }, getCart: () => [{ paymentLinkId: "p1", quantity: 1 }] });
  return w.document as Document;
}

it("puts the cart reminder in the checkout's main column and keeps the signup band out of the checkout", async () => {
  const doc = await mount();
  const recovery = doc.querySelector("[data-retention-recovery]");
  expect(recovery?.parentElement?.classList.contains("pya-co__main")).toBe(true);
  const signup = doc.querySelector("[data-pagosya-subscribe]");
  expect(signup).not.toBeNull();
  expect(signup!.closest("[data-pagosya-checkout]")).toBeNull();
});
