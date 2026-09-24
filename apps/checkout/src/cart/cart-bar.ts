/** The sticky cart summary bar under the catalog. */
import { Store } from "../api";
import { app } from "../ui/app";
import { cartCount, cartTotal } from "./cart";
import { formatAmount } from "../ui/html";


export function updateCartBar(store: Store, currency: string): void {
  const summary = app.querySelector<HTMLElement>(".cart-summary");
  const payButton = app.querySelector<HTMLButtonElement>("#cart-pay");
  if (summary) {
    summary.textContent = `${cartCount()} ${cartCount() === 1 ? "producto" : "productos"} - ${formatAmount(cartTotal(store.items), currency)}`;
  }
  if (payButton) {
    payButton.disabled = cartCount() === 0;
    payButton.textContent = store.cartButtonLabel && store.cartButtonLabel !== "Ir a pagar"
      ? store.cartButtonLabel
      : `Ver carrito · ${cartCount()}`;
  }
  const cartBar = app.querySelector<HTMLElement>(".cart-bar");
  if (cartBar) cartBar.hidden = cartCount() === 0;
  const headerCart = app.querySelector<HTMLButtonElement>(".store-header-cart");
  const headerCount = headerCart?.querySelector<HTMLElement>(".store-header-cart-count");
  const count = cartCount();
  if (headerCart) {
    headerCart.disabled = count === 0;
    headerCart.setAttribute("aria-label", `Abrir carrito, ${count} ${count === 1 ? "producto" : "productos"}`);
  }
  if (headerCount) {
    headerCount.textContent = String(count);
    headerCount.hidden = count === 0;
  }
}
