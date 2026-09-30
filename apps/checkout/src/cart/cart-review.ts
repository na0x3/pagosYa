/** What the cart review dialog shows: line items, recommendations, fulfillment choice, and button labels. */
import { parseCartItemKey, pickedExtras } from "../cart-state";
import { Store, assetUrl, StoreLocation } from "../api";
import { state } from "../state";
import { subscriptionUnitAmount } from "./subscription-choice";
import { cart, itemExtras, selectedUnitAmount, productStockLimit, itemVariants, optionStock } from "./cart";
import { productImagePosition } from "../storefront/catalog";
import { publicStoreLocations, locationCanFulfillCart } from "../storefront/locations";


export function cartActionLabel(store: Store, freeOrder = false): string {
  if (freeOrder) return "Confirmar pedido gratis";
  if (store.cartButtonLabel && store.cartButtonLabel !== "Ir a pagar") return store.cartButtonLabel;
  if (store.checkoutMode === "whatsapp") return "Enviar pedido por WhatsApp";
  if (store.checkoutMode === "external") return "Enviar mis datos";
  return "Continuar al pago";
}

export function cartModeNote(store: Store, freeOrder = false): string {
  if (freeOrder) return "Este pedido no tiene costo. Deja tus datos para que la tienda reciba la selección y pueda confirmártela.";
  if (store.checkoutMode === "whatsapp") return "Revisa el detalle. Al continuar, abriremos WhatsApp con el pedido listo para enviar.";
  if (store.checkoutMode === "external") return "Revisa tu selección y deja tu correo para que la tienda pueda contactarte. pagosYa no procesará un cobro.";
  return "Revisa productos, opciones y cantidades antes de abrir el pago seguro.";
}

export function cartLineEntries(store: Store) {
  return [...cart.entries()].flatMap(([key, quantity]) => {
    const selected = parseCartItemKey(key);
    const product = store.items.find((item) => item.id === selected.paymentLinkId);
    if (!product) return [];
    const variant = product.variants.find((candidate) => candidate.id === selected.variantId);
    const extras = pickedExtras(itemExtras(product), selected.extraIds);
    const cadence = selected.cadence;
    return [{ key, product, variant, extras, quantity, cadence, unitAmount: cadence ? subscriptionUnitAmount(product, variant, extras, cadence) : selectedUnitAmount(product, variant, extras) }];
  });
}

export function cartRecommendationEntries(store: Store) {
  if (store.cartRecommendationsEnabled === false) return [];
  const selectedProductIds = new Set(store.cartRecommendationProductIds || []);
  if (selectedProductIds.size === 0) return [];
  const cartProductIds = new Set([...cart.keys()].map((key) => parseCartItemKey(key).paymentLinkId));
  return [...store.items]
    .filter((product) => {
      if (!selectedProductIds.has(product.id) || cartProductIds.has(product.id) || productStockLimit(product) === 0 || !assetUrl(product.imageUrls[0] || null)) return false;
      const variants = itemVariants(product);
      return variants.length === 0 || variants.some((variant) => optionStock(product, variant) !== 0);
    })
    .sort((a, b) => (store.cartRecommendationProductIds || []).indexOf(a.id) - (store.cartRecommendationProductIds || []).indexOf(b.id))
    .slice(0, 12)
    .map((product) => {
      const variant = itemVariants(product).find((candidate) => optionStock(product, candidate) !== 0);
      return {
        product,
        variant,
        unitAmount: variant?.amount ?? product.amount,
        image: assetUrl(product.imageUrls[0] || null)!,
        imagePosition: productImagePosition(product, 0),
      };
    });
}

export function cartFulfillmentState(store: Store, lines = cartLineEntries(store)) {
  const locations = (lines.length && lines.every(line => line.product.fulfillmentType === 'DIGITAL') ? [] : publicStoreLocations(store)).map(location => ({ ...location, pickupEnabled: location.pickupEnabled && (!store.shippingEnabled || store.shippingPickupEnabled !== false) })).filter((location) => location.pickupEnabled || location.deliveryEnabled);
  if (!locations.length) return { locations, method: null, selectedLocation: null, available: [] as StoreLocation[] };
  const methods = (["pickup", "delivery"] as const).filter((method) =>
    locations.some((location) => method === "pickup" ? location.pickupEnabled : location.deliveryEnabled),
  );
  if (!state.selectedFulfillmentMethod || !methods.includes(state.selectedFulfillmentMethod)) state.selectedFulfillmentMethod = methods[0] || null;
  const available = state.selectedFulfillmentMethod
    ? locations.filter((location) =>
        (state.selectedFulfillmentMethod === "pickup" ? location.pickupEnabled : location.deliveryEnabled) && locationCanFulfillCart(location, lines),
      )
    : [];
  if (!available.some((location) => location.id === state.selectedFulfillmentLocationId)) {
    state.selectedFulfillmentLocationId = available[0]?.id || null;
  }
  return {
    locations,
    method: state.selectedFulfillmentMethod,
    selectedLocation: available.find((location) => location.id === state.selectedFulfillmentLocationId) || null,
    available,
  };
}
