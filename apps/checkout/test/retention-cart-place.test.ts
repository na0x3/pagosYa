import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// Owner 2026-11-09 (Remolino): «¿Prefieres terminar después?» sat at the very end of the cart panel, outside the padding of the
// store's cart template — flush against the edge, with a square black button. It now follows the guarantee line under «Pagar».
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

async function mount(cart: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const dom = new JSDOM(`<body><header>Remolino</header><dialog class="cart-drawer" open><div class="cart-drawer__body">${cart}</div></dialog></body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(dom);
  const w = dom.window as any;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.eval(retention);
  await w.PAGOSYA_RETENTION_MOUNT({ slug: "remolino", preview: true, data: { storeName: "Remolino", retention: { recoveryEnabled: true, popupTrigger: "none" } }, getCart: () => [{ paymentLinkId: "p1", quantity: 1 }] });
  return w.document as Document;
}

it("a store's cart template: the reminder follows the guarantee line, inside the template's own part, not at the panel's end", async () => {
  const doc = await mount(`<div data-pagosya-cart><div data-cart-panel><div data-cart-slot="lines"></div><footer class="cart-foot"><div data-cart-slot="action"><button data-checkout>Pagar</button></div><p class="cart-guarantee">30 días</p><nav data-cart-slot="policies"></nav></footer></div></div>`);
  const recovery = doc.querySelector("[data-retention-recovery]")!;
  expect(recovery.previousElementSibling?.classList.contains("cart-guarantee")).toBe(true);
  expect(recovery.parentElement?.classList.contains("cart-foot")).toBe(true);
});

it("the kit's own cart: still after the guarantee line", async () => {
  const doc = await mount(`<div data-pagosya-cart><ul class="order-items"></ul><button data-checkout>Pagar</button><p class="cart-guarantee">Compra segura</p></div>`);
  expect(doc.querySelector("[data-retention-recovery]")!.previousElementSibling?.classList.contains("cart-guarantee")).toBe(true);
});
