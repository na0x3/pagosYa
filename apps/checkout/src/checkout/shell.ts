/** The calm checkout shell on the hosted payment page — the same stylesheet and logos as the store's review
 * (packages/storefront-kit/checkout-shell). Spec: docs/superpowers/specs/2026-10-20-calm-checkout-design.md */
import shellCss from "@pagosya/storefront-kit/checkout-shell/shell.css?raw";
import logos from "@pagosya/storefront-kit/checkout-shell/logos.json";
import { assetUrl, type CheckoutSession } from "../api";
import type { DomesticMethodType } from "../state";
import { escapeHtml, formatAmount } from "../ui/html";
import { ICON_LOCK } from "../ui/icons";

type Method = { type: DomesticMethodType; label: string; logos: string[]; note: string };
const METHODS = logos.methods as Method[];
const LOGOS = logos.logos as Record<string, string>;
type Line = { name: string; variantName?: string; quantity: number; unitAmount: number; imageUrl?: string };

export function mountShellStyle() {
  if (document.querySelector("style[data-pagosya-checkout-shell]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-pagosya-checkout-shell", "");
  style.textContent = shellCss;
  document.head.append(style);
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => { const [r, g, b] = c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
/** The store accent only when it reads: text at 4.5:1 and the button at 3:1 on white; otherwise ink. */
export function shellAccent(accent: string, accentForeground: string) {
  const ok = /^#[\da-f]{6}$/i.test(accent) && /^#[\da-f]{6}$/i.test(accentForeground) && ratio(rgb(accent), rgb(accentForeground)) >= 4.5 && ratio(rgb(accent), [255, 255, 255]) >= 3;
  return ok ? { accent, ink: accentForeground } : { accent: "#1a1a1a", ink: "#ffffff" };
}
export const logoBadges = (names: string[]) => names.map(name => LOGOS[name] ? `<span class="pya-co__logo-badge">${LOGOS[name]}</span>` : "").join("");
export function trustStripHtml() {
  const names = [...new Set(METHODS.flatMap(m => m.logos))];
  return `<div class="pya-co__trust"><span class="pya-co__logos">${logoBadges(names)}</span><span>${ICON_LOCK} Pago seguro procesado por pagosYa</span></div>`;
}
/** Radio rows in the Tarjeta, QR, Tigo Money, Transferencia order; `.tab[data-type]` stays for the click wiring and tests. */
export function methodRows(selected: DomesticMethodType, allowed: DomesticMethodType[], bodyHtml: string) {
  return `<div class="pya-co__methods" role="radiogroup" aria-label="Método de pago">${METHODS.filter(m => allowed.includes(m.type)).map(m => {
    const on = m.type === selected;
    return `<div class="pya-co__method"><label class="tab${on ? " active" : ""}" data-type="${m.type}"><input type="radio" name="payMethod" value="${m.type}"${on ? " checked" : ""}><span class="pya-co__method-name">${escapeHtml(m.label)}</span><span class="pya-co__logos">${logoBadges(m.logos)}</span></label>${on ? `<div class="pya-co__method-body"><p>${escapeHtml(m.note)}</p>${bodyHtml}</div>` : ""}</div>`;
  }).join("")}</div>`;
}
export function shellSummary(session: CheckoutSession, photoUrl: string | null, linkDescription?: string | null) {
  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(meta.cart) ? meta.cart as Line[] : [];
  const firstPhoto = lines.find(l => l.imageUrl)?.imageUrl;
  const photo = photoUrl ? assetUrl(photoUrl) : firstPhoto ? assetUrl(firstPhoto) : null;
  const money = (n: number) => formatAmount(n, session.currency);
  const linesHtml = lines.length
    ? `<ul class="pya-co__lines">${lines.map(l => `<li class="pya-co__line">${l.imageUrl ? `<span class="pya-co__thumb"><img src="${escapeHtml(assetUrl(l.imageUrl) ?? "")}" alt="" loading="lazy"><b class="pya-co__qty">${l.quantity}</b></span>` : ""}<span class="pya-co__line-text"><strong>${escapeHtml(l.name)}</strong>${l.variantName ? `<small>${escapeHtml(l.variantName)}</small>` : ""}${l.imageUrl ? "" : `<small>× ${l.quantity}</small>`}</span><span class="pya-co__line-price">${money(l.unitAmount * l.quantity)}</span></li>`).join("")}</ul>`
    : `<p class="pya-co__hint description">${escapeHtml(session.description || linkDescription || "Pago a " + session.merchantName)}</p>`;
  const subtotal = typeof meta.subtotal === "number" ? meta.subtotal : null;
  const bundle = meta.bundle as { discountAmount?: number } | undefined;
  const discount = typeof meta.promoDiscountAmount === "number" ? meta.promoDiscountAmount : typeof bundle?.discountAmount === "number" ? bundle.discountAmount : 0;
  const shippingMeta = meta.shipping as { amount?: number } | undefined;
  const shipping = typeof shippingMeta?.amount === "number" ? shippingMeta.amount : null;
  const rows = [
    subtotal !== null ? `<div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div>` : "",
    discount ? `<div><dt>Descuento</dt><dd>−${money(discount)}</dd></div>` : "",
    shipping !== null ? `<div><dt>Envío</dt><dd>${shipping ? money(shipping) : "Gratis"}</dd></div>` : "",
  ].join("");
  return `<aside class="pya-co__summary" id="pya-co-summary" aria-label="Resumen del pedido"><div class="pya-co__summary-inner">${photo ? `<img class="pya-co__photo" src="${escapeHtml(photo)}" alt="">` : ""}<h2 class="pya-co__title">Tu pedido</h2>${linesHtml}<dl class="pya-co__totals">${rows}<div class="pya-co__grand order-total"><dt>Total</dt><dd><small>${escapeHtml(session.currency)}</small> <strong class="amount">${money(session.amount)}</strong></dd></div></dl></div></aside>`;
}
export function shellFrame(o: { brandHtml: string; step: "payment" | "done"; heading: string; note?: string; main: string; summary: string; total: string; backHtml?: string }) {
  const steps = ["Carrito", "Entrega", "Pago"].map((label, i) => `<li${o.step === "payment" && i === 2 ? ' aria-current="step"' : ""}>${label}</li>`).join("");
  return `<div class="pya-checkout pya-checkout--page"><header class="pya-co__bar">${o.backHtml ?? "<span></span>"}${o.brandHtml}<span class="pya-co__secure">${ICON_LOCK} Pago seguro</span></header><button type="button" class="pya-co__summary-toggle" aria-expanded="false" aria-controls="pya-co-summary" data-shell-summary><span data-shell-summary-label>Ver resumen del pedido</span><strong>${escapeHtml(o.total)}</strong></button><div class="pya-co__frame"><div class="pya-co__lead"><ol class="pya-co__steps">${steps}</ol><h1 class="payment-page-title" tabindex="-1">${escapeHtml(o.heading)}</h1>${o.note ? `<p class="pya-co__note">${escapeHtml(o.note)}</p>` : ""}</div><div class="pya-co__main">${o.main}</div>${o.summary}</div></div>`;
}
export function wireSummaryToggle(root: HTMLElement) {
  root.querySelector<HTMLButtonElement>("[data-shell-summary]")?.addEventListener("click", event => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const shell = toggle.closest<HTMLElement>(".pya-checkout")!;
    const open = !shell.hasAttribute("data-summary-open");
    shell.toggleAttribute("data-summary-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("[data-shell-summary-label]")!.textContent = open ? "Ocultar resumen del pedido" : "Ver resumen del pedido";
  });
}
