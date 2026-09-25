/**
 * Mutable page state shared by the checkout and storefront modules. ES modules
 * cannot reassign an imported binding, so every value that changes after load
 * lives on `state` and is read and written as `state.<name>`.
 */
import { PaymentMethodType } from "@pagosya/shared-types";
import type { InternationalMethods, Store } from "./api";
import type { createStoreFunnel } from "./store-funnel";
import type { createStoreAnalytics } from "./store-analytics";
import { storeEditorMode, type StorePreviewEditorSelection } from "./preview-mode";

export interface LinkHeader {
  storeName: string;
  description: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

export type DomesticMethodType = Exclude<PaymentMethodType, PaymentMethodType.LOCAL_METHOD>;

export const state = {
  activeStoreFunnel: null as ReturnType<typeof createStoreFunnel> | null,
  funnelCartCount: 0 as number,
  /** G1 analytics for a published store shown by the legacy catalog, sharing the funnel session. */
  activeStoreAnalytics: null as ReturnType<typeof createStoreAnalytics> | null,
  analyticsCartQuantities: new Map<string, number>(),
  selectedType: PaymentMethodType.CARD as DomesticMethodType,
  internationalMode: false as boolean,
  internationalCountry: "" as string,
  internationalMethods: null as InternationalMethods | null,
  internationalMethodId: "" as string,
  internationalError: null as string | null,
  // Opened synchronously (still inside the submit click's user-activation
  // window) before dLocal even returns a redirect URL, so Safari's popup
  // blocker doesn't see it as script-initiated after an await. Pointed at the
  // real URL once confirmPaymentIntent resolves; closed on every outcome that
  // doesn't end up needing it.
  pendingIntlPopup: null as Window | null,
  linkHeader: null as LinkHeader | null,
  activeOrderTrackingToken: null as string | null,
  orderTrackingPoll: null as number | null,
  orderTrackingVisibilityHandler: null as (() => void) | null,
  selectedFulfillmentMethod: null as "pickup" | "delivery" | null,
  selectedFulfillmentLocationId: null as string | null,
  appliedPromo: null as { storeId: string; code: string; discountType: "PERCENT" | "FIXED"; discountValue: number } | null,
  // renderStore() re-runs on every qty +/- click (full re-render, not a patch)
  // — the staggered entrance animation should only ever play once, on the
  // real first paint, not replay/flash on every cart interaction.
  hasStoreAnimatedIn: false as boolean,
  activePromotionCleanup: null as (() => void) | null,
  activeAnnouncementCleanup: null as (() => void) | null,
  activeHeroCleanup: null as (() => void) | null,
  activeStoreExperienceCleanup: null as (() => void) | null,
  activeDiscountCleanup: null as (() => void) | null,
  // Search/category filter state for large catalogs — lives outside
  // renderStoreGrid() so typing/clicking doesn't need to touch (and thus
  // never loses focus on) the toolbar that renders these controls.
  searchQuery: "" as string,
  // "ALL" shows everything; "null" (string) is the sentinel for the
  // uncategorized/"Otros" bucket, since categoryId itself is `string | null`
  // and dataset attributes can only hold strings.
  selectedCategoryId: "ALL" as string,
  selectedCollectionId: "ALL" as string,
  activeCatalogStoreId: null as string | null,
  // "featured" keeps the merchant's own catalog order (createdAt); the others
  // re-sort within each category section, never across section boundaries.
  sortMode: "featured" as "featured" | "price-asc" | "price-desc" | "popular",
  // Tracked so a failed/canceled payment screen can offer a real way back
  // instead of a dead end — the cart itself is already cleared by the time a
  // customer reaches the payment form (see checkoutCart's cart.clear() call),
  // so "back to store" means the plain store link, not cart restoration.
  currentStoreSlug: null as string | null,
  activeCustomDomainSlug: null as string | null,
  currentDebtSlug: null as string | null,
  checkoutPublishableKey: null as string | null,
  activePreviewStore: null as { slug: string; store: Store } | null,
  previewReadyAnnounced: false as boolean,
  activePreviewRenderedStore: null as Store | null,
  activePreviewRenderSignature: "" as string,
  activePreviewRenderedView: "store" as string,
  storePreviewEditorEnabled: storeEditorMode as boolean,
  storePreviewLockedSectionIds: new Set<string>() as Set<string>,
  storePreviewEditorHover: null as HTMLElement | null,
  storePreviewEditorSelection: null as StorePreviewEditorSelection | null,
  storePreviewInlineEditorTarget: null as HTMLElement | null,
  storePreviewInlineEditorFinish: null as ((commit: boolean) => void) | null,
  storePreviewPendingInlineTextCommit: null as { selection: StorePreviewEditorSelection; value: string } | null,
  storePreviewEditorClickTimer: null as number | null,
  storePreviewEditorSuppressNextClick: false as boolean,
  activeStoreRoute: null as { slug: string; store: Store } | null,
  fulfillmentSessionId: '' as string,
};
