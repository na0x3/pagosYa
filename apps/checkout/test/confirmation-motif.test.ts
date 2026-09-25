import { afterEach, beforeAll, expect, it } from "vitest";

/** Sub-project 3: the order confirmation shows the store's confirmation motif (a DNA drawing the API sanitised), verified
 * again here against the kit's allow-list, decorative, and animated only when motion is allowed. */
const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12l5 5L20 6"/></svg>';
const order = (id: string) => ({ id, amount: 12345, currency: "bob", metadata: { cart: [] } }) as never;
let renderSuccess: (order: never, preview?: boolean) => void;
let rememberConfirmationMotif: (value: unknown) => void;
const reduce = (on: boolean) => { window.matchMedia = ((query: string) => ({ matches: /reduce/.test(query) ? on : false, addEventListener() {}, removeEventListener() {} })) as never; };
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  ({ renderSuccess } = await import("../src/checkout/payment-result"));
  ({ rememberConfirmationMotif } = await import("../src/checkout-motif"));
});
afterEach(() => rememberConfirmationMotif(null));
const motif = () => document.querySelector(".payment-success-panel .payment-success-motif");

it("renders the store's confirmation motif above the receipt, hidden from assistive tech, and plays it", async () => {
  reduce(false);
  rememberConfirmationMotif({ behavior: "draw", svg: DRAWING });
  renderSuccess(order("pi_motif"), true);
  const slot = motif();
  expect(slot).not.toBeNull();
  expect(slot!.getAttribute("aria-hidden")).toBe("true");
  expect(slot!.querySelector("svg path")).not.toBeNull();
  expect(slot!.nextElementSibling?.classList.contains("status")).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(slot!.hasAttribute("data-motif-play")).toBe(true);
});

it("renders the confirmation as before when the store has no motif", () => {
  rememberConfirmationMotif(null);
  renderSuccess(order("pi_plain"), true);
  expect(document.querySelector(".payment-success-panel")).not.toBeNull();
  expect(motif()).toBeNull();
});

it("never inserts markup that fails the allow-list, or an unknown behaviour", () => {
  for (const value of [
    { behavior: "draw", svg: DRAWING.replace("<path", "<script>window.pwned=1</script><path") },
    { behavior: "draw", svg: DRAWING.replace("<path", '<foreignObject><img src="x" onerror="window.pwned=1"/></foreignObject><path') },
    { behavior: "draw", svg: DRAWING.replace('stroke="currentColor"', 'stroke="url(https://evil.test/a)"') },
    { behavior: "explode", svg: DRAWING },
    { behavior: "draw", svg: "<img src=x onerror=window.pwned=1>" },
  ]) {
    rememberConfirmationMotif(value);
    renderSuccess(order("pi_hostile"), true);
    expect(motif()).toBeNull();
    expect(document.querySelector("#app script, #app foreignObject")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  }
});

it("does not play when the store turned motion off, and plays for every other mode", async () => {
  reduce(false);
  rememberConfirmationMotif({ behavior: "draw", svg: DRAWING, motion: "off" });
  renderSuccess(order("pi_still"), true);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(motif()).not.toBeNull();
  expect(motif()!.hasAttribute("data-motif-play")).toBe(false);
  rememberConfirmationMotif({ behavior: "draw", svg: DRAWING, motion: "subtle" });
  renderSuccess(order("pi_subtle"), true);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(motif()!.hasAttribute("data-motif-play")).toBe(true);
});

it("prefixes and scopes the drawing's ids, so an id in the drawing never shadows a checkout id such as #preview-back", () => {
  rememberConfirmationMotif({ behavior: "draw", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"/></defs><path id="preview-back" d="M4 12l5 5L20 6" stroke="url(#g)"/></svg>' });
  renderSuccess(order("pi_ids"), true);
  expect(document.querySelector("#preview-back")?.tagName).toBe("BUTTON");
  const ids = Array.from(motif()!.querySelectorAll("[id]")).map(el => el.id);
  expect(ids).toHaveLength(2);
  expect(ids.every(id => id.startsWith("pym-"))).toBe(true);
  const ref = motif()!.querySelector("path")!.getAttribute("stroke")!.match(/^url\(#(.+)\)$/)![1];
  expect(motif()!.querySelector(`[id="${ref}"]`)?.localName).toBe("linearGradient");
});

it("does not play with reduced motion", async () => {
  reduce(true);
  rememberConfirmationMotif({ behavior: "glow", svg: DRAWING });
  renderSuccess(order("pi_reduced"), true);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(motif()).not.toBeNull();
  expect(motif()!.hasAttribute("data-motif-play")).toBe(false);
});
