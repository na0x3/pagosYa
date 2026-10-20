import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { DOMESTIC_METHOD_TYPES } from "../src/checkout/payment-form";

const require = createRequire(import.meta.url);
const logos = require("@pagosya/storefront-kit/checkout-shell/logos.json");
const css = readFileSync(require.resolve("@pagosya/storefront-kit/checkout-shell/shell.css"), "utf8");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{[^{}]*\{[^{}]*\}[^{}]*\{[^{}]*\}\s*\}/g, "").replace(/@media[^{]+\{/g, "");
const selectors = body.match(/[^{}]+(?=\{)/g)!.map(s => s.trim()).filter(Boolean);
// Splits a selector list on its own commas, not those inside :is(…).
const topLevel = (selector: string) => { const parts: string[] = []; let depth = 0, start = 0; [...selector].forEach((c, i) => { if (c === "(") depth++; else if (c === ")") depth--; else if (c === "," && !depth) { parts.push(selector.slice(start, i)); start = i + 1; } }); return [...parts, selector.slice(start)]; };

describe("checkout shell assets", () => {
  it("lists exactly the domestic methods the payment page offers", () => {
    expect(logos.methods.map((m: { type: string }) => m.type).sort()).toEqual([...DOMESTIC_METHOD_TYPES].sort());
    expect(logos.methods.map((m: { label: string }) => m.label)).toEqual(["Tarjeta", "QR", "Tigo Money", "Transferencia"]);
  });
  it("has an accessible SVG for every logo a method names", () => {
    for (const method of logos.methods) for (const name of method.logos) {
      expect(logos.logos[name], name).toMatch(/^<svg [^>]*role="img"[^>]*aria-label="[^"]+"/);
    }
  });
  it("scopes every rule under .pya-checkout and keeps the fixed palette", () => {
    for (const selector of selectors) for (const part of topLevel(selector)) expect(part.trim(), selector).toMatch(/^\.pya-checkout/);
    for (const colour of ["#f7f7f7", "#ececec", "#1a1a1a", "#6b6b6b", "#d9d9d9"]) expect(css).toContain(colour);
  });
});
