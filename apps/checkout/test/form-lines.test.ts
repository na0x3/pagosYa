import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kitPath } from "@pagosya/storefront-kit";

// A store's CSS reset (Tailwind preflight: *{border-width:0}, input{padding:0}, button{background:transparent}) is unlayered,
// so it beat the kit's layered form styles: the contact fields had no line and «Enviar consulta» no fill (PEPPA please
// 2026-10-20). Each form keeps an unlayered floor, as weak as the reset, that hands those properties back to the kit's layers.
const commerce = readFileSync(kitPath("commerce.js"), "utf8");
const retention = readFileSync(kitPath("retention.js"), "utf8");
const windows: JSDOM[] = [];
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); });

function dom(body: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => { if (!error.message.includes("Could not parse CSS stylesheet")) throw error; });
  const d = new JSDOM(`<body>${body}<footer></footer></body>`, { runScripts: "outside-only", virtualConsole, url: "https://tienda.test/" });
  windows.push(d);
  const w = d.window as any;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  return w;
}

/** The rules of a stylesheet that sit outside every @layer block, as [selector, declarations]. */
function unlayeredRules(css: string): Array<[string, string]> {
  let flat = "", depth = 0, layer = -1;
  for (let i = 0; i < css.length; i++) {
    if (layer < 0 && css.startsWith("@layer", i) && /^@layer[^;{]*\{/.test(css.slice(i, i + 200))) { layer = depth; i = css.indexOf("{", i); depth++; continue; }
    const c = css[i];
    if (c === "{") depth++;
    if (c === "}") { depth--; if (layer >= 0 && depth === layer) { layer = -1; continue; } }
    if (layer < 0) flat += c;
  }
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1].trim(), m[2]]);
}

function floorFor(el: Element, rules: Array<[string, string]>) {
  return rules.filter(([selector]) => { try { return el.matches(selector); } catch { return false; } }).map(([selector, body]) => ({ selector, body }));
}

/** A selector list split on its top-level commas (not the ones inside :is() or :where()). */
const topLevel = (list: string) => { const parts = [""]; let depth = 0; for (const c of list) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && !depth) parts.push(""); else parts[parts.length - 1] += c; } return parts; };

const RESET_BEATEN = ["border:revert-layer", "padding:revert-layer", "background:revert-layer"];

describe("form fields keep their lines under a store's CSS reset", () => {
  it("contact form: fields and the send button get an unlayered floor no stronger than the reset", () => {
    const w = dom('<main><section id="contacto"><h2>Contáctanos</h2><div class="peppa-contact__form" data-pagosya-contact></div></section></main>');
    w.PAGOSYA_PREVIEW = true;
    w.PAGOSYA_CONFIG = { slug: "peppa", data: { storeName: "PEPPA please", contactFormEnabled: true, checkoutMode: "payment", locations: [], categories: [], items: [] } };
    w.eval(commerce);
    const doc = w.document as Document;
    const css = [...doc.querySelectorAll("style")].map(s => s.textContent || "").find(t => t.includes("@layer pagosya-contact-base {"))!;
    const rules = unlayeredRules(css);
    for (const el of [doc.querySelector("[data-pagosya-contact] input[name]")!, doc.querySelector("[data-pagosya-contact] textarea")!, doc.querySelector('[data-pagosya-contact] form>button[type="submit"]')!]) {
      const floor = floorFor(el, rules);
      expect(floor.length, el.outerHTML.slice(0, 60)).toBeGreaterThan(0);
      for (const decl of RESET_BEATEN) expect(floor.some(r => r.body.replace(/\s/g, "").includes(decl))).toBe(true);
      // As weak as the reset's own `input` / `button`: a store rule with a class still restyles the field.
      for (const r of floor) expect(topLevel(r.selector).every(part => /^(:where\([^)]*\)\s*>?\s*)*(:is\((input|textarea|input,textarea)\)|input|textarea|button)(:where\([^)]*\))?$/.test(part.trim())), r.selector).toBe(true);
    }
  });

  it("signup block: the email field and its button get the same floor", async () => {
    const w = dom('<main><h1>PEPPA</h1></main>');
    w.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ signupEnabled: true, signupTitle: "Novedades", signupButton: "Suscribirme" }) }));
    w.eval(retention);
    await w.PAGOSYA_RETENTION_MOUNT({ slug: "peppa", apiBaseUrl: "https://api.test/v1" });
    const doc = w.document as Document;
    const css = doc.querySelector("#pagosya-retention-style")!.textContent || "";
    const section = doc.createElement("section"); section.className = "pagosya-retention";
    section.innerHTML = '<form><input type="email" name="email"><button type="submit">Suscribirme</button></form>';
    doc.body.append(section);
    const rules = unlayeredRules(css);
    for (const el of [section.querySelector("input")!, section.querySelector("button")!]) {
      const floor = floorFor(el, rules);
      expect(floor.length, el.outerHTML).toBeGreaterThan(0);
      for (const decl of RESET_BEATEN) expect(floor.some(r => r.body.replace(/\s/g, "").includes(decl))).toBe(true);
    }
  });
});
