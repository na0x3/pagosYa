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
  // The calm checkout (checkout/shell.js) draws the checkout itself; these only keep hidden mounts hidden.
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
  `;
  document.head.append(checkoutStyle);
