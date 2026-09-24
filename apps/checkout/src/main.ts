import { mountVerificationPage } from './verification';
import { sourceCanConfigureProduct } from './source-product-capabilities';
import { createStoreFunnel } from './store-funnel';
import { markPrivateStorePage } from './store-seo';
import '@pagosya/storefront-kit/kit/retention.js';
import {
  fetchStore,
  resolveStoreDomain
} from "./api";
import { parseReturnParams } from "./international";
import { configureParentOrigin, observeResize, postToParent } from "./postmessage";
import { readSourcePaymentPreview, bindPreviewBranding } from './source-payment-preview';
import { storePreviewExternalDestination } from "./preview-navigation";
import { state } from "./state";
import { storeEditorMode, storePreviewMode } from "./preview-mode";
import { renderInternationalReturn } from "./checkout/payment-result";
import { app } from "./ui/app";
import { sourcePaymentPreview, renderForm, enterPaymentFlow } from "./checkout/payment-form";
import { escapeHtml } from "./ui/html";
import { storefrontRouteFromLocation, productIdFromLocation } from "./storefront/routes";
import { renderOrderTracking } from "./orders/order-tracking";
import { renderDebtCollection } from "./checkout/debt-collection";
import { suppressStoreViewForMerchant } from "./storefront/merchant-views";
import { standaloneStorePreviewPatch } from "./preview-editor/patch";
import { loadCart, cartCount } from "./cart/cart";
import { renderStoreRoute, restoreCatalogScroll, restoreCatalogPosition, catalogScrollByStore } from "./storefront/navigation";
import { ICON_X } from "./ui/icons";
import { bindStoreEditorCanvas, listenForStoreEditorMessages } from "./preview-editor/bridge";
import { storefrontPages } from "./storefront/navigation";
import { renderProductPage } from "./storefront/product-page";
import { renderStore } from "./storefront/store-page";

async function main() {
  const verificationRoute = /^\/verificar\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  if (verificationRoute) {
    let slug = '';
    try { slug = decodeURIComponent(verificationRoute); } catch {}
    await mountVerificationPage(slug, app);
    return;
  }
  const intlReturn = parseReturnParams(window.location.search);
  if (intlReturn) {
    await renderInternationalReturn(intlReturn.paymentIntentId);
    observeResize(app);
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  configureParentOrigin(fragmentParams.get("parent_origin"));
  if (sourcePaymentPreview) {
    document.body.classList.add('payment-page');
    try {
      const previewSession = readSourcePaymentPreview(window.location.hash);
      renderForm(previewSession, '');
      bindPreviewBranding(previewSession, () => { if (app.querySelector('#payment-form')) renderForm(previewSession, ''); });
      const startAtTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      startAtTop();
      if (document.readyState === 'complete') requestAnimationFrame(startAtTop);
      else window.addEventListener('load', startAtTop, { once: true });
      postToParent('CHECKOUT_READY', {});
      observeResize(app);
    } catch (error) { app.innerHTML = `<div class="status failed">${escapeHtml((error as Error).message)}</div>`; }
    return;
  }
  const retainedCheckout = (window.history.state as {
    pagosYaCheckout?: { clientSecret?: string; publishableKey?: string | null };
  } | null)?.pagosYaCheckout;
  const storefrontRoute = storefrontRouteFromLocation();
  // Canonical public links use /s/:slug. The original ?link=:slug form stays
  // valid indefinitely so existing QR codes, messages, and embeds never break.
  let linkSlug = storefrontRoute.slug ?? params.get("link");
  const debtSlug = params.get("debt");
  const trackingMatch = window.location.pathname.match(/^\/track\/([^/]+)\/?$/);
  let trackingToken: string | null = null;
  try {
    trackingToken = trackingMatch?.[1] ? decodeURIComponent(trackingMatch[1]) : null;
  } catch {
    trackingToken = null;
  }
  const clientSecret = fragmentParams.get("client_secret") ?? params.get("client_secret") ?? retainedCheckout?.clientSecret ?? null;
  state.checkoutPublishableKey =
    fragmentParams.get("publishable_key") ?? params.get("publishable_key") ?? retainedCheckout?.publishableKey ?? null;

  // Bearer credentials belong in the fragment only long enough for this page
  // to read them. Remove both modern fragment and legacy query forms before
  // any navigation, referrer, screenshot, or client-side error report can
  // capture them; history state keeps same-tab refresh/back behavior working.
  if (clientSecret) {
    markPrivateStorePage();
    params.delete("client_secret");
    params.delete("publishable_key");
    fragmentParams.delete("client_secret");
    fragmentParams.delete("publishable_key");
    fragmentParams.delete("parent_origin");
    const cleanQuery = params.toString();
    const cleanFragment = fragmentParams.toString();
    window.history.replaceState(
      {
        ...(window.history.state ?? {}),
        pagosYaCheckout: { clientSecret, publishableKey: state.checkoutPublishableKey },
      },
      "",
      `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${cleanFragment ? `#${cleanFragment}` : ""}`,
    );
  }

  if (trackingToken) {
    await renderOrderTracking(trackingToken);
    observeResize(app);
    return;
  }

  // A verified merchant domain opens the same existing Store at its root.
  // Hostname resolution is only attempted for clean storefront paths so the
  // checkout, debt portal, marketplace, and legacy links keep their behavior.
  if (!linkSlug && !debtSlug && !clientSecret && (/^\/$/.test(window.location.pathname) || /^\/productos\/?$/.test(window.location.pathname) || /^\/(?:p|c)\/[^/]+\/?$/.test(window.location.pathname))) {
    try {
      const resolved = await resolveStoreDomain(window.location.hostname);
      state.activeCustomDomainSlug = resolved.slug;
      linkSlug = resolved.slug;
    } catch {
      // The normal hosted checkout origin is not a custom domain. Preserve its
      // existing missing-parameter state instead of surfacing a resolution 404.
    }
  }

  // Keep the originating storefront available even when a payment page is
  // restored directly with both values in the URL.
  if (linkSlug) state.currentStoreSlug = linkSlug;
  if (debtSlug) state.currentDebtSlug = debtSlug;
  if (debtSlug && !clientSecret) {
    await renderDebtCollection(debtSlug);
    observeResize(app);
    return;
  }

  // Payment Links (no-code path): the URL carries a link slug instead of an
  // already-created client_secret. Any of a merchant's link slugs opens their
  // whole catalog (Store) — a customer buying several things adds them all
  // to one Cart and pays once, instead of needing a separate QR per item.
  if (linkSlug && !clientSecret) {
    try {
      const store = await fetchStore(linkSlug, { preview: suppressStoreViewForMerchant(linkSlug) });
      const proposalPatch = standaloneStorePreviewPatch();
      const renderedStore = proposalPatch ? { ...store, ...proposalPatch } : store;
      const routedProduct = renderedStore.items.find(item => item.id === productIdFromLocation());
      // Keep supported product choices in the merchant’s authored storefront.
      const needsOptionsForm = Boolean(routedProduct && !sourceCanConfigureProduct(routedProduct));
      if (renderedStore.publishedSourceRevision && !proposalPatch && !needsOptionsForm) {
        const { mountPublishedSource } = await import('./source-storefront');
        if (await mountPublishedSource(app, linkSlug, renderedStore, enterPaymentFlow, params.get('source_owner') === '1' || suppressStoreViewForMerchant(linkSlug))) return;
      }
      state.activeStoreFunnel = renderedStore.publishedSourceRevision ? createStoreFunnel(linkSlug, params.get('source_owner') === '1' || suppressStoreViewForMerchant(linkSlug)) : null;
      state.activeStoreFunnel?.track('visit');
      loadCart(renderedStore);
      state.funnelCartCount = cartCount();
      renderStoreRoute(linkSlug, renderedStore);
      restoreCatalogScroll(0);
      observeResize(app);
    } catch (err) {
      // The API's message is already a complete, customer-facing Spanish
      // sentence for the realistic failure here (store deleted/archived) —
      // no need to wrap or prefix it, that just produces a redundant phrase.
      app.innerHTML = `<div class="status failed">${ICON_X}<span>${escapeHtml((err as Error).message)}</span></div>`;
    }
    return;
  }

  if (!clientSecret) {
    app.innerHTML = `<div class="status failed">Falta client_secret, link o debt en la URL.</div>`;
    return;
  }

  await enterPaymentFlow(clientSecret);
}
document.addEventListener("visibilitychange", () => document.body.classList.toggle("motion-paused", document.hidden));
if (storePreviewMode) {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // Some embedded browsers expose scrollRestoration as read-only. The
    // explicit reset below still keeps a newly loaded preview at its top.
  }
  const resetPreviewScroll = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  resetPreviewScroll();
  window.addEventListener("pageshow", resetPreviewScroll, { once: true });
}

if (storePreviewMode) {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    const destination = storePreviewExternalDestination(anchor.getAttribute("href"), window.location.href);
    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    postToParent("STORE_PREVIEW_EXTERNAL_LINK", {
      url: destination.url,
      label: (anchor.textContent || anchor.getAttribute("aria-label") || "Abrir enlace").trim().slice(0, 120),
    });
  }, true);
  window.addEventListener("wheel", (event) => {
    if (!event.deltaY) return;
    const scrollingElement = document.scrollingElement;
    if (!scrollingElement) return;
    const atTop = scrollingElement.scrollTop <= 1;
    const atBottom = scrollingElement.scrollTop + window.innerHeight >= scrollingElement.scrollHeight - 1;
    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
      postToParent("STORE_PREVIEW_SCROLL_BOUNDARY", { deltaY: event.deltaY });
    }
  }, { passive: true });
}
if (storeEditorMode) bindStoreEditorCanvas();
if (storeEditorMode) listenForStoreEditorMessages();

if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
window.onpopstate = (event) => {
  if (!state.activeStoreRoute) return;
  renderStoreRoute(state.activeStoreRoute.slug, state.activeStoreRoute.store);
  if (productIdFromLocation()) {
    restoreCatalogScroll(0);
    return;
  }
  restoreCatalogPosition(state.activeStoreRoute.slug, {
    scrollY: catalogScrollByStore.get(state.activeStoreRoute.slug) ?? event.state?.catalogScrollY,
    productId: event.state?.catalogProductId,
    productViewportTop: event.state?.catalogProductViewportTop,
  });
};

Object.assign(storefrontPages, { renderStore, renderProductPage });
main();
