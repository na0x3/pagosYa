  // Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.
  const checkoutSlots = [...document.querySelectorAll("[data-pagosya-checkout]")];
  for (const slot of checkoutSlots) slot.hidden = true;
  const checkoutPage = checkoutSlots[0] || fullCheckoutPage || document.createElement("section");
  // The runtime supplies one order review inside the active checkout surface.
  // Some authored pages also leave a sibling review slot; do not show two payment forms.
  if (fullCheckoutPage) document.querySelectorAll('[data-pagosya-cart][data-checkout-review]').forEach(slot => {
    if (slot !== checkoutPage && !checkoutPage.contains(slot)) {
      slot.hidden = true; slot.inert = true; slot.setAttribute('data-pagosya-redundant-review', '');
    }
  });
  checkoutPage.setAttribute("data-pagosya-checkout", "");
  checkoutPage.hidden = true;
  if (!fullCheckoutPage) document.body.append(checkoutPage);
  const checkoutStyle = document.createElement("style");
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
    @layer pagosya-commerce {
    [data-pagosya-checkout]:not([hidden]){display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;overscroll-behavior:contain;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font-family:inherit;padding:clamp(20px,5vw,64px)}
    [data-pagosya-checkout] *{box-sizing:border-box}
    [data-pagosya-checkout] .checkout-page__inner{max-width:1000px;margin:auto}
    [data-pagosya-checkout] .checkout-page__back{display:inline-flex;align-items:center;min-height:44px;padding:8px 0;margin:0 0 32px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-checkout] h1{margin:0 0 16px;font-size:clamp(30px,5vw,52px);line-height:1.1;font-weight:800}
    [data-pagosya-checkout] h1[tabindex="-1"]:focus:not(:focus-visible){outline:none}
    [data-pagosya-checkout] .checkout-page__intro{max-width:60ch;line-height:1.6;margin:0 0 32px}
    [data-pagosya-checkout] .checkout-page__layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:clamp(24px,5vw,64px)}
    [data-pagosya-checkout] .checkout-page__summary{padding:24px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:12px;align-self:start;background:var(--store-surface,var(--brand-surface,transparent))}
    [data-pagosya-checkout] .checkout-page__summary h2{margin:0 0 20px;font-size:22px}
    [data-pagosya-checkout] .order-items{list-style:none;padding:0;margin:0}
    [data-pagosya-checkout] .order-item{display:block;padding:16px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    [data-pagosya-checkout] .order-item>div:first-child:not(.order-item__body){display:flex;justify-content:space-between;gap:16px;line-height:1.5}
    [data-pagosya-checkout] .quantity{display:flex;align-items:center;gap:12px;margin-top:12px}
    [data-pagosya-checkout] .quantity button{width:44px;min-height:44px;background:transparent;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:50%;font:inherit;color:inherit;cursor:pointer}
    [data-pagosya-checkout] .order-field{display:grid;gap:8px;margin:20px 0;font:inherit}
    [data-pagosya-checkout] select{width:100%;min-height:44px;padding:8px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:inherit;font:inherit}
    [data-pagosya-checkout] .order-total{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:20px}
    [data-pagosya-checkout] .order-note{font-size:14px;line-height:1.6;color:inherit;opacity:.8}
    [data-pagosya-checkout] .checkout-button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:48px;padding:12px 20px;border:0;border-radius:var(--store-radius,var(--brand-radius,0px));background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,CanvasText))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,Canvas)));font:inherit;font-weight:700;cursor:pointer}
    [data-pagosya-checkout] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-checkout] [data-pagosya-status]{margin:24px 0;font-size:15px;line-height:1.6}
    @media(max-width:640px){[data-pagosya-checkout] .checkout-page__layout{grid-template-columns:1fr}[data-pagosya-checkout] .checkout-page__summary{padding:20px}}
  `;
  checkoutStyle.textContent += `
    }
    :where([data-pagosya-checkout-page]):not([hidden]){position:static;inset:auto;z-index:auto;overflow:visible;background:inherit;color:inherit}
  `;
  document.head.append(checkoutStyle);
