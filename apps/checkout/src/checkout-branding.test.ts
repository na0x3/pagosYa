import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { applyCheckoutBranding, rememberStoreDna } from "./checkout-branding";

const branding = { name: "Marca", background: "#fffaf0", surface: "#f4efe6", foreground: "#1d1b18", accent: "#b4441f", accentForeground: "#ffffff", radius: "8px", bodyFont: "system-ui", headingFont: "Georgia", fonts: [] };

describe("order confirmation takes the store's DNA", () => {
  afterEach(() => { rememberStoreDna(null); applyCheckoutBranding(document.createElement("div"), null); });
  it("sets the button form and radius on a branded checkout", () => {
    rememberStoreDna({ version: 1, button: "stamp", radius: "pill", cart: "sheet" });
    applyCheckoutBranding(document.createElement("div"), branding as never);
    expect([document.body.dataset.dnaButton, document.body.dataset.dnaRadius]).toEqual(["stamp", "pill"]);
  });
  it("ignores unknown values and clears everything on an unbranded checkout", () => {
    rememberStoreDna({ button: "sparkle", radius: "round" });
    applyCheckoutBranding(document.createElement("div"), branding as never);
    expect([document.body.dataset.dnaButton, document.body.dataset.dnaRadius]).toEqual([undefined, "round"]);
    applyCheckoutBranding(document.createElement("div"), null);
    expect([document.body.dataset.dnaButton, document.body.dataset.dnaRadius]).toEqual([undefined, undefined]);
  });
  it("adds nothing without a remembered DNA", () => {
    applyCheckoutBranding(document.createElement("div"), branding as never);
    expect(document.body.hasAttribute("data-dna-button")).toBe(false);
  });
});

describe("confirmation DNA styles", () => {
  const css = readFileSync(`${process.cwd()}/src/checkout-branding.css`, "utf8");
  it("define every button form and radius for the success panel only", () => {
    // The form tokens (--checkout-dna-btn-*) reference var(--checkout-accent)/var(--checkout-foreground), which are only
    // ever set on #app (checkout-branding.ts sets them via app.style.setProperty, never on body): declaring the tokens on
    // body alone made them resolve invalid there, so #app button.primary inherited nothing (see finding 1).
    for (const form of ["pill", "block", "underline", "tag", "stamp", "outline", "ghost", "split"]) expect(css).toContain(`body.store-branded-checkout[data-dna-button=${form}] #app{`);
    for (const radius of ["none", "soft", "round", "pill"]) expect(css).toContain(`body.store-branded-checkout[data-dna-radius=${radius}]{`);
    expect(css).toMatch(/\[data-dna-button\] #app \.payment-success-panel \.receipt-action\{/);
    expect(css).not.toMatch(/data-dna-[^{]*payment-printer/);
  });
  it("keep the pay button filled and full size in the open forms", () => {
    const fill = css.match(/body\.store-branded-checkout:is\(([^)]*)\) #app button\.primary\{([^}]*)\}/);
    for (const form of ["underline", "ghost", "outline", "stamp"]) expect(fill?.[1]).toContain(`[data-dna-button=${form}]`);
    expect(fill?.[2]).toContain("--checkout-dna-btn-bg:var(--checkout-accent)");
    expect(fill?.[2]).toContain("--checkout-dna-btn-fg:var(--checkout-accent-foreground)");
    const dna = css.match(/body\.store-branded-checkout\[data-dna-button\] #app button\.primary\{([^}]*)\}/)?.[1] ?? "";
    expect(dna).not.toMatch(/min-height|(^|;)height|padding/);
  });
  it("keep a visible, unclipped focus ring on every DNA button: foreground ring on a background halo", () => {
    const ring = css.match(/body\.store-branded-checkout\[data-dna-button\] #app :is\(button\.primary,\.payment-success-panel \.receipt-action\):focus-visible\{([^}]*)\}/)?.[1] ?? "";
    expect(ring).toContain("clip-path:none");
    expect(ring).toMatch(/outline:3px solid var\(--checkout-foreground\)/);
    expect(ring).toMatch(/box-shadow:0 0 0 2px var\(--checkout-background\)/);
    // A shadow list with `none` in it is invalid: the empty shadow token must be a real (transparent) shadow.
    expect(css).not.toMatch(/--checkout-dna-btn-shadow,none/);
  });
});

describe("identity button forms (T2b)", () => {
  const css = readFileSync(`${process.cwd()}/src/checkout-branding.css`, "utf8");
  afterEach(() => { rememberStoreDna(null); applyCheckoutBranding(document.createElement("div"), null); });
  it("carries the four new forms onto a branded checkout", () => {
    for (const form of ["sticker", "ticket", "bubbly", "brutal"]) {
      rememberStoreDna({ version: 1, button: form });
      applyCheckoutBranding(document.createElement("div"), branding as never);
      expect(document.body.dataset.dnaButton).toBe(form);
    }
  });
  it("fill the pay button with the accent pair, and drop the ticket notches on focus", () => {
    for (const form of ["sticker", "ticket", "bubbly", "brutal"]) {
      const rule = css.match(new RegExp(`body\\.store-branded-checkout\\[data-dna-button=${form}\\] #app\\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule).toContain("--checkout-dna-btn-bg:var(--checkout-accent)");
      expect(rule).toContain("--checkout-dna-btn-fg:var(--checkout-accent-foreground)");
    }
    expect(css).toContain("body.store-branded-checkout[data-dna-button=ticket] #app :is(button.primary,.payment-success-panel .receipt-action):focus-visible{-webkit-mask:none;mask:none}");
  });
});
