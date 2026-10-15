import type { SourceDesignJob } from './source-design-jobs';
import type { VisualFields } from './source-visual-fields';
import type { AssetLibrary, VisualReport } from './source-visual-tools';
import type { BuildProgress } from './source-build-progress';
import type { BrandState } from './brand-profile';
import { CHECKOUT_ORIGIN } from './checkout-origin';
export const SESSION_STORAGE_KEY = "pagosya_merchant_session";

const embedded = new URLSearchParams(location.search).get("embedded") === "1" && window.parent !== window;
export const API_BASE_URL: string = embedded || ["browser", "thumbnail", "library", "productGuide"].some(key => new URLSearchParams(location.search).has(key))
  ? sessionStorage.getItem("pagosya_merchant_api_base") || import.meta.env.VITE_API_BASE_URL || "/api/v1"
  : import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
export { CHECKOUT_ORIGIN };

export type SourceChatResult = { setup?: SourceSetup | null; userMessage: AgentMessage; assistantMessage: AgentMessage; revision?: SourceRevision };
export type SourceChatJob = { id: string; requestId: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'AWAITING_INPUT' | 'BLOCKED' | 'PARTIAL' | 'FAILED' | 'INTERRUPTED' | 'CANCELLED'; sequence: number; result?: SourceChatResult; error?: string; lastCommittedRevision?: number };

export type JsonRecord = Record<string, unknown>;

export interface MerchantStore {
  id: string;
  name: string;
  slug: string;
  status?: string;
  siteDocument?: unknown;
  websiteRevision?: number;
  websiteDraft?: { data: JsonRecord; links?: unknown[]; inventoryChanges?: Array<{ name: string; beforeStock: number | null; stock: number | null }> } | null;
  catalogLayout?: CatalogLayout;
  cartRecommendationsEnabled?: boolean;
  cartRecommendationProductIds?: string[];
  checkoutMode?: string;
  analyticsGa4Id?: string | null;
  analyticsGtmId?: string | null;
  analyticsMetaPixelId?: string | null;
  analyticsTiktokPixelId?: string | null;
}

/** Store columns holding a measurement ID the merchant pastes. */
export type ExtensionFieldView = { key: string; label: string; type: 'text' | 'select' | 'toggle'; help: string | null; where: string | null; placeholder: string | null; required: boolean; pattern: string | null; options: Array<{ value: string; label: string }> };
export type ExtensionView = { kind: 'extension'; id: string; name: string; category: string; categoryLabel: string; tier: 'free' | 'pro'; logo: string | null; summary: string; description: string; docsUrl: string | null; fields: ExtensionFieldView[]; secrets: Array<{ key: string; label: string; help: string | null; configured: boolean }>; installed: boolean; enabled: boolean; configured: boolean; settings: Record<string, string | boolean>; lastError: string | null; lastErrorAt: string | null; capabilities: string[]; feed: { url: string; platform: 'google' | 'meta'; steps: string[]; skipped?: { noPhoto: number; noPrice: number } } | null };
export type GuideView = { kind: 'guide'; id: string; name: string; category: string; categoryLabel: string; logo: string | null; summary: string; url: string; guide: string };

/** SIN classification of a product, needed on electronic invoices. */
export interface ProductFiscalMapping { codigoProducto?: string; actividadEconomica?: string; codigoProductoSin?: string; unidadMedida?: number }
export interface SiatCatalog<T> { total: number; entries: T[] }

export type RecommendableProduct = { id: string; name: string; status: string; recommendedProductIds?: string[] };

// Domain purchase. Amounts are integer centavos in `currency`, matching the API.
export interface DomainSearchResult { hostname: string; available: boolean; amount: number; renewalAmount: number; currency: string }
export interface DomainOrderView {
  id: string; hostname: string; status: string; amount: number; renewalAmount: number; currency: string;
  sandbox: boolean; expiresAt: string | null; contactVerified: boolean; message: string | null;
  url: string | null; checkoutUrl: string | null;
}
export interface DomainShopState { available: boolean; sandbox: boolean; tlds: string[]; orders: DomainOrderView[] }

// How the storefront arranges the product catalog — mirrors CATALOG_LAYOUTS on the API.
export type CatalogLayout = 'all' | 'sections' | 'page' | 'tabs';

export interface Collection {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  productIds: string[];
}

export interface AgentMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  proposalId?: string | null;
  metadata?: JsonRecord | null;
  createdAt: string;
}

export interface VisualProposal {
  id: string;
  title: string;
  rationale?: string | null;
  status: string;
  config: JsonRecord;
  baseWebsiteRevision?: number | null;
  createdAt: string;
  appliedAt?: string | null;
}

export interface VisualVersion {
  id: string;
  label: string;
  source?: string;
  createdAt: string;
}

export interface ClarificationOption {
  id: string;
  label: string;
  value: string;
}

export interface Clarification {
  id: string;
  prompt: string;
  options: ClarificationOption[];
}

export interface SourceSetup {
  sitePurpose?: 'shop' | 'service' | 'portfolio' | 'editorial';
  step: 'conversation' | 'logo' | 'brand' | 'audience' | 'business' | 'products' | 'delivery' | 'review';
  prompt: string;
  options: Array<{ label: string; value: string; action?: 'generate' | 'restart' }>;
}
export interface ConversationResponse {
  setup?: SourceSetup | null;
  messages: AgentMessage[];
}

export interface VisualStudioResponse {
  proposals: VisualProposal[];
  versions: VisualVersion[];
  lockedSectionIds: string[];
}

export interface SendAgentResponse {
  userMessage: AgentMessage;
  assistantMessage: AgentMessage;
  proposal?: VisualProposal | null;
  proposals?: VisualProposal[];
  needsClarification?: boolean;
  question?: Clarification;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: { email: string };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class MerchantStudioApi {
  constructor(private token = "") {}

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    if (!response.ok) {
      let message = `La solicitud falló (${response.status}).`;
      try {
        const body = await response.json() as { message?: string | string[] };
        message = Array.isArray(body.message) ? body.message.join(" ") : body.message || message;
      } catch {
        // Keep the status-based fallback when the server did not return JSON.
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  login(email: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>("/dashboard/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  logout(): Promise<{ success: boolean }> {
    return this.request("/dashboard/logout", { method: "POST" });
  }

  listStores(): Promise<MerchantStore[]> {
    return this.request("/stores");
  }

  businessWorkspace(storeId: string, path = '', method = 'GET', body?: unknown): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/email-workspace${path}`, {method,...(body === undefined ? {} : {body:JSON.stringify(body)})}); }
  integrationConnections(storeId: string): Promise<any[]> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/integrations`); }
  extensions(storeId: string): Promise<{ extensions: ExtensionView[]; guides: GuideView[] }> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions`); }
  saveExtension(storeId: string, id: string, body: { settings: Record<string, string | boolean>; secrets: Record<string, string> }): Promise<ExtensionView> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }); }
  toggleExtension(storeId: string, id: string, enabled: boolean): Promise<ExtensionView> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); }
  removeExtension(storeId: string, id: string): Promise<{ removed: true }> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  integrationMappings(storeId: string, connectionId: string): Promise<{ products: Array<{ id: string; name: string; stock: number | null; variants: Array<{ id: string; name: string; stock: number | null }> }>; mappings: Array<{ id: string; paymentLinkId: string; variantId: string | null; externalSku: string }> }> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/integrations/${encodeURIComponent(connectionId)}/mappings`); }
  saveIntegrationMapping(storeId: string, connectionId: string, input: { paymentLinkId: string; variantId?: string; externalSku: string }): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/integrations/${encodeURIComponent(connectionId)}/mappings`, { method: 'POST', body: JSON.stringify(input) }); }
  deleteIntegrationMapping(storeId: string, connectionId: string, mappingId: string): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/integrations/${encodeURIComponent(connectionId)}/mappings/${encodeURIComponent(mappingId)}`, { method: 'DELETE' }); }
  createIntegrationConnection(storeId: string, input: {kind:string;name:string}): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/integrations`, {method:'POST',body:JSON.stringify(input)}); }
  retention(storeId: string): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/retention`); }
  writeRetention(storeId: string, path: string, method: string, body: Record<string, any>): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/retention${path ? '/' + path : ''}`, { method, body: JSON.stringify(body) }); }
  commercePlatform(storeId: string): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/commerce`); }
  writeCommercePlatform(storeId: string, path: string, method: string, body: Record<string, unknown>): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/commerce/${path}`, { method, body: JSON.stringify(body) }); }
  uploadDigitalFile(storeId: string, productId: string, body: FormData): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/commerce/products/${encodeURIComponent(productId)}/files`, { method: 'POST', body }); }
  commerceContent(storeId: string): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/commerce-content`); }
  commerceContentReviews(storeId: string, query: { status?: string; before?: string } = {}): Promise<any> {
    const params = new URLSearchParams(); if (query.status) params.set('status', query.status); if (query.before) params.set('before', query.before);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/stores/${encodeURIComponent(storeId)}/commerce-content/reviews${suffix}`);
  }
  writeCommerceContent(storeId: string, path: string, method: string, body: Record<string, any>): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/commerce-content/${path}`, { method, body: JSON.stringify(body) }); }
  shippingSettings(storeId: string): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping`); }
  saveShippingSettings(storeId: string, input: { enabled: boolean; pickupEnabled: boolean; carriersEnabled?: boolean; prepMinutes?: number }): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping`, { method: 'POST', body: JSON.stringify(input) }); }
  createShippingRate(storeId: string, input: Record<string, any>): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/delivery/zones`, { method: 'POST', body: JSON.stringify(input) }); }
  toggleShippingRate(storeId: string, rateId: string, active: boolean): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping/rates/${encodeURIComponent(rateId)}`, { method: 'PATCH', body: JSON.stringify({ active }) }); }
  /** Accepts a bare weight (legacy callers) or the full parcel profile; omitted profile fields stay unchanged. */
  saveShippingWeight(storeId: string, productId: string, input: number | null | { weightGrams: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; fragile?: boolean; noStack?: boolean }): Promise<any> {
    const body = typeof input === 'object' && input !== null ? input : { weightGrams: input };
    return this.request(`/stores/${encodeURIComponent(storeId)}/shipping/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  // Buying a domain and connecting it to this store. Every route reports itself
  // unavailable until the operator supplies registrar and hosting credentials.
  domainShop(storeId: string): Promise<DomainShopState> { return this.request(`/stores/${encodeURIComponent(storeId)}/domain-shop`); }
  searchDomains(storeId: string, query: string): Promise<DomainSearchResult[]> { return this.request(`/stores/${encodeURIComponent(storeId)}/domain-shop/search`, { method: 'POST', body: JSON.stringify({ query }) }); }
  quoteDomain(storeId: string, hostname: string): Promise<DomainOrderView> { return this.request(`/stores/${encodeURIComponent(storeId)}/domain-shop/quotes`, { method: 'POST', body: JSON.stringify({ hostname }) }); }
  checkoutDomain(storeId: string, input: { quoteId: string; registrant: Record<string, string>; accepted: boolean }): Promise<DomainOrderView> { return this.request(`/stores/${encodeURIComponent(storeId)}/domain-shop/checkout`, { method: 'POST', body: JSON.stringify(input) }); }
  cancelDomainOrder(storeId: string, orderId: string): Promise<{ success: boolean }> { return this.request(`/stores/${encodeURIComponent(storeId)}/domain-shop/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' }); }
  // All of the store's products, active or archived — unlike sourceCatalog's
  // storefront-facing item list, this must include archived ones so a
  // collection never silently loses an archived member when saved.
  products(storeId: string): Promise<RecommendableProduct[]> { return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links`); }
  saveCartRecommendations(storeId: string, enabled: boolean, productIds: string[]): Promise<MerchantStore> { return this.request(`/stores/${encodeURIComponent(storeId)}`, { method: 'PATCH', body: JSON.stringify({ cartRecommendationsEnabled: enabled, cartRecommendationProductIds: productIds }) }); }
  saveProductRecommendations(storeId: string, productId: string, productIds: string[]): Promise<{ id: string }> { return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ recommendedProductIds: productIds }) }); }
  collections(storeId: string): Promise<Collection[]> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections`); }
  createCollection(storeId: string, name: string): Promise<Collection> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections`, { method: 'POST', body: JSON.stringify({ name }) }); }
  renameCollection(storeId: string, id: string, name: string): Promise<Collection> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }); }
  deleteCollection(storeId: string, id: string): Promise<{ success: boolean }> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  setCollectionProducts(storeId: string, id: string, paymentLinkIds: string[]): Promise<Collection> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections/${encodeURIComponent(id)}/products`, { method: 'PUT', body: JSON.stringify({ paymentLinkIds }) }); }
  reorderCollections(storeId: string, ids: string[]): Promise<Collection[]> { return this.request(`/stores/${encodeURIComponent(storeId)}/collections/order`, { method: 'PUT', body: JSON.stringify({ collectionIds: ids }) }); }
  // Reuses the store-update endpoint other Studio settings already write through — no dedicated route for catalogLayout.
  /** An empty string clears the ID; the API rejects anything that is not that provider's shape. */
  saveCatalogLayout(storeId: string, layout: CatalogLayout): Promise<MerchantStore> { return this.request(`/stores/${encodeURIComponent(storeId)}`, { method: 'PATCH', body: JSON.stringify({ catalogLayout: layout }) }); }
  brandProfile(storeId: string): Promise<BrandState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/brand`);
  }
  brandHistory(storeId: string): Promise<Array<BrandState & { createdAt: string }>> { return this.request(`/stores/${encodeURIComponent(storeId)}/brand/history`); }
  restoreBrand(storeId: string, revision: number, targetRevision: number): Promise<BrandState> { return this.request(`/stores/${encodeURIComponent(storeId)}/brand/restore`, { method: 'POST', body: JSON.stringify({ revision, targetRevision }) }); }
  saveBrandProfile(storeId: string, state: BrandState): Promise<BrandState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/brand`, { method: 'PUT', body: JSON.stringify({ revision: state.revision, ...state.data }) });
  }
  analyzeBrandProfile(storeId: string, input: { revision: number; text: string; websiteUrl?: string; assetUrls: string[] }): Promise<BrandState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/brand/analyze`, { method: 'POST', body: JSON.stringify(input) });
  }
  latestSourceVisualReview(storeId: string, revision: number, page: string): Promise<VisualReport | null> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/visual-review?revision=${revision}&page=${encodeURIComponent(page)}`);
  }
  sourceAssets(storeId: string, revision: number): Promise<AssetLibrary> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assets?revision=${revision}`);
  }
  saveSourceAssetRoles(storeId: string, revision: number, assets: Array<{ path: string; role: string; description: string }>): Promise<SourceVersion> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assets`, { method: 'PATCH', body: JSON.stringify({ revision, assets }) });
  }
  reviewSourceVisuals(storeId: string, body: { revision: number; page: string; model?: SourceGenerationSettings['model']; maxCredits: number }): Promise<VisualReport> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/visual-review`, { method: 'POST', body: JSON.stringify(body) });
  }
  latestSourceDesignJob(storeId: string): Promise<{ enabled: boolean; job: SourceDesignJob | null }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/design-jobs`);
  }
  startSourceDesignJob(storeId: string, body: { requestId: string; revision: number; page: string; productId?: string; maxCredits: number; maxRepairs: number }): Promise<SourceDesignJob> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/design-jobs`, { method: 'POST', body: JSON.stringify(body) });
  }
  cancelSourceDesignJob(storeId: string, id: string): Promise<SourceDesignJob> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/design-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
  }
  resumeSourceDesignJob(storeId: string, id: string): Promise<SourceDesignJob> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/design-jobs/${encodeURIComponent(id)}/resume`, { method: 'POST', body: '{}' });
  }
  /** SIN classification applies only to stores that charge with pagosYa and already have a CUIS. */
  async productFiscalReady(storeId: string): Promise<boolean> {
    const [stores, profile] = await Promise.all([this.listStores(), this.request<{ cuis?: string | null } | null>("/merchants/invoicing_profile")]);
    const store = stores.find((candidate) => candidate.id === storeId);
    return Boolean(store && (store.checkoutMode || "payment") === "payment" && profile?.cuis);
  }

  siatActivities(): Promise<SiatCatalog<{ codigoCaeb: string; descripcion: string }>> {
    return this.request("/siat/catalogs/activities?limit=500");
  }

  siatUnits(): Promise<SiatCatalog<{ codigoClasificador: number; descripcion: string }>> {
    return this.request("/siat/catalogs/units?limit=500");
  }

  siatProducts(activityCode: string, query = ""): Promise<SiatCatalog<{ codigoProducto: number | string; descripcionProducto: string }>> {
    const params = new URLSearchParams({ activityCode, limit: "300" });
    if (query) params.set("q", query);
    return this.request(`/siat/catalogs/products?${params}`);
  }

  sourceCatalog(storeId: string): Promise<JsonRecord> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/catalog`);
  }

  /** Rewrites YAPI's own long-page sections for one product; the merchant's edits stay. */
  regenerateProductPage(storeId: string, productId: string): Promise<{ highlights: import('./product-highlight-icons').ProductHighlightInput[]; contentBlocks: import('./product-content-blocks-editor').ContentBlockInput[] }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/page/regenerate`, { method: 'POST' });
  }

  suggestProductHighlights(storeId: string, input: { name: string; description?: string | null; specifications?: Array<{ label: string; value: string }>; tags?: string[] }): Promise<{ highlights: Array<{ icon: string; label: string; detail?: string }> }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/product-highlights/suggestions`, { method: 'POST', body: JSON.stringify(input) });
  }

  createProduct(storeId: string, input: { name: string; description: string | null; contentBlocks?: import('./product-content-blocks-editor').ContentBlockInput[]; specifications?: Array<{ label: string; value: string }>; highlights?: Array<{ icon: string; label: string; detail?: string }>; badge?: string | null; amount: number; currency: string; stock: number | null; imageUrls: string[]; fulfillmentType?: 'PHYSICAL' | 'MEMBERSHIP'; membershipPeriods?: Array<{ months: number; amount: number }>; variants?: Array<{name: string; amount: number; stock?: number | null; options?: Array<{name: string; value: string}>; imageUrl?: string | null; imageUrls?: string[] | null}>; extras?: Array<{ id?: string; name: string; amount: number; groupName?: string; freeAllowance?: number; pickCount?: number; productId?: string }> } & ProductFiscalMapping): Promise<{ id: string; name: string }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links`, { method: 'POST', body: JSON.stringify(input) });
  }

  createProductScene(storeId: string, input: { imageUrl: string; productName: string; description?: string | null; setting: 'auto' | 'studio' | 'lifestyle' | 'natural' | 'editorial'; note?: string | null; aspect?: 'square' | 'portrait' | 'landscape' }): Promise<{ url: string; parentUrl: string; kind: 'AI_DERIVED' }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/product-scenes`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateProduct(storeId: string, productId: string, input: Partial<Parameters<MerchantStudioApi['createProduct']>[1]>): Promise<{ id: string; name: string }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  sourceConversation(storeId: string): Promise<ConversationResponse> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/conversation`);
  }

  async sendSourceMessage(storeId: string, instruction: string, assetUrls: string[], revision: number, setupStep?: string, setupAction?: string, generation?: SourceGenerationSettings, browserReview?: string[], requestId?: string, templateId?: string, directionId?: string, selection?: { sectionId: string }, currentPage?: string, onAccepted?: (job: SourceChatJob) => void, options?: { resumeDraft?: boolean; stylePick?: { generationId: string; index?: number; auto?: boolean } }): Promise<SourceChatResult> {
    const job = await this.request<SourceChatJob>(`/stores/${encodeURIComponent(storeId)}/source-project/chat-jobs`, { method: "POST", body: JSON.stringify({ instruction, assetUrls, revision, setupStep, setupAction, ...generation, ...(browserReview?.length ? { browserReview } : {}), ...(requestId ? { requestId } : {}), ...(templateId ? { templateId } : {}), ...(directionId ? { directionId } : {}), ...(selection ? { selection } : {}), ...(currentPage ? { currentPage } : {}), ...(options?.resumeDraft ? { resumeDraft: true } : {}), ...(options?.stylePick ? { stylePick: options.stylePick } : {}) }) });
    onAccepted?.(job);
    return this.waitSourceChatJob(storeId, job);
  }

  styleProposal(storeId: string): Promise<{ proposal: import('./source-style-pick').StyleProposalView | null }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/style-proposal`);
  }
  /** Stops YAPI's background polish (spec 2026-10-12), when the merchant starts editing. */
  cancelSourceReview(storeId: string): Promise<{ cancelled: boolean }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/review/cancel`, { method: 'POST', body: '{}' });
  }

  latestSourceChatJob(storeId: string): Promise<{ job: SourceChatJob | null }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/chat-jobs`);
  }
  cancelSourceChatJob(storeId: string, id: string): Promise<SourceChatJob> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/chat-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  }
  async waitSourceChatJob(storeId: string, initial: SourceChatJob): Promise<SourceChatResult> {
    let job = initial;
    let consecutiveErrors = 0;
    while (job.status === 'QUEUED' || job.status === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        job = await this.request<SourceChatJob>(`/stores/${encodeURIComponent(storeId)}/source-project/chat-jobs/${encodeURIComponent(job.id)}`);
        consecutiveErrors = 0;
      } catch (error) {
        if (++consecutiveErrors >= 15 || error instanceof ApiError && [401, 403, 404].includes(error.status)) throw error;
      }
    }
    if (['COMPLETED', 'AWAITING_INPUT'].includes(job.status) && job.result) return job.result;
    if (job.result?.assistantMessage?.content) throw new Error(job.result.assistantMessage.content);
    throw new Error(job.error || 'El pedido se interrumpió. Tu diseño se conserva.');
  }

  /** The agent's latest clean draft while it builds; files only when newer than `since`. */
  sourceDraftPreview(storeId: string, since?: number, signal?: AbortSignal): Promise<{ at: number | null; interrupted?: boolean; files?: Array<{ path: string; content: string; encoding?: string }>; retry?: SourceDraftRetry }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/draft-preview${since !== undefined ? `?since=${since}` : ''}`, { signal });
  }

  sourceProgress(storeId: string, requestId: string, signal?: AbortSignal): Promise<{ progress: BuildProgress | null }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/progress?requestId=${encodeURIComponent(requestId)}`, { signal });
  }

  estimateSource(storeId: string, body: SourceGenerationSettings & { revision: number; instruction: string; assetUrls: string[]; selection?: { sectionId: string } }): Promise<SourceGenerationEstimate> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/estimate`, { method: 'POST', body: JSON.stringify(body) });
  }

  sourceUsage(storeId: string): Promise<{ runs: SourceGenerationRun[]; aiUsage?: Array<{ stage: string; model: string; status: string; usage: { providerMicroUsd?: number | null } | null }> }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/usage`);
  }

  sourceVisibility(storeId: string, published: boolean, publicationVersion: number): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/visibility`, { method: 'POST', body: JSON.stringify({ published, publicationVersion }) });
  }
  setSourceContactForm(storeId: string, revision: number, enabled: boolean): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/contact-form`, { method: 'PATCH', body: JSON.stringify({ revision, enabled }) });
  }
  recordSourceChecks(storeId: string, revision: number, result: { passed: boolean; findings: import('./source-checks').SourceCheck[] }, signal?: AbortSignal): Promise<JsonRecord> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${revision}/checks`, { method: 'POST', body: JSON.stringify(result), signal });
  }
  assumedFacts(storeId: string, revision: number): Promise<{ revision: number; facts: import('./source-assumed-facts').AssumedFactView[] }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assumed-facts?revision=${revision}`);
  }
  confirmAssumedFact(storeId: string, id: string, revision: number): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assumed-facts/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify({ revision }) });
  }
  editAssumedFact(storeId: string, id: string, revision: number, text: string): Promise<SourceRevision & { replaced: number; unwrapped: string[] }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assumed-facts/${encodeURIComponent(id)}/edit`, { method: 'POST', body: JSON.stringify({ revision, text }) });
  }
  removeAssumedFact(storeId: string, id: string, revision: number): Promise<{ revision: number; label: string; removed: boolean }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/assumed-facts/${encodeURIComponent(id)}/remove`, { method: 'POST', body: JSON.stringify({ revision }) });
  }
  publishSource(storeId: string, revision: number, publicationVersion: number): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/publish`, { method: 'POST', body: JSON.stringify({ revision, publicationVersion }) });
  }
  startSourceTest(storeId: string, revision: number, publicationVersion: number): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/experiments`, { method: 'POST', body: JSON.stringify({ revision, publicationVersion }) });
  }
  finishSourceTest(storeId: string, experimentId: string, publicationVersion: number, apply: boolean): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/experiments/finish`, { method: 'POST', body: JSON.stringify({ experimentId, publicationVersion, apply }) });
  }
  sourceAlternative(storeId: string, body: SourceGenerationSettings & { revision: number; instruction: string; selection?: { sectionId: string } }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/alternative`, { method: 'POST', body: JSON.stringify(body) });
  }
  sourceState(storeId: string, before?: number): Promise<SourceState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project${before ? `?before=${before}` : ""}`);
  }

  addStandardPages(storeId: string, revision: number): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/standard-pages`, { method: 'POST', body: JSON.stringify({ revision }) });
  }

  setSourceMotion(storeId: string, revision: number, motion: SourceMotionMode, scrollFeel?: SourceScrollFeel): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/motion`, { method: 'PATCH', body: JSON.stringify({ revision, motion, scrollFeel }) });
  }

  editSourceFile(storeId: string, revision: number, path: string, content: string): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/file`, { method: "PATCH", body: JSON.stringify({ revision, path, content }) });
  }

  sourceVisualFields(storeId: string, revision: number): Promise<VisualFields> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/visual-fields?revision=${revision}`);
  }

  editSourceVisual(storeId: string, input: { revision: number; fieldId: string; value: string }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/visual-edit`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  sourceVersion(storeId: string, revision: number): Promise<SourceVersion> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${revision}`);
  }

  generateSource(storeId: string, body: { revision: number; brief: import("@pagosya/storefront-preview").SourceSnapshot["brief"]; instruction: string; assetUrls: string[]; motion?: SourceMotionMode; scrollFeel?: SourceScrollFeel; selection?: { sectionId: string } }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/generate`, { method: "POST", body: JSON.stringify(body) });
  }

  restoreSource(storeId: string, target: number, revision: number): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${target}/restore`, { method: "POST", body: JSON.stringify({ revision }) });
  }

  listTemplates(): Promise<import("./source-templates").TemplateSummary[]> {
    return this.request(`/store-templates`);
  }

  /** The template as designed, on its demo shop: Plantillas › Ver. */
  templateDemo(templateId: string): Promise<import("@pagosya/storefront-preview").SourceSnapshot> {
    return this.request(`/store-templates/${encodeURIComponent(templateId)}/demo`);
  }

  templatePreview(storeId: string, templateId: string): Promise<import("@pagosya/storefront-preview").SourceSnapshot> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/templates/${encodeURIComponent(templateId)}/preview`);
  }

  applyTemplate(storeId: string, templateId: string, revision: number): Promise<SourceRevision & { adapted?: boolean }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/templates/${encodeURIComponent(templateId)}`, { method: "POST", body: JSON.stringify({ revision }) });
  }

  saveSource(storeId: string, body: { revision: number; label: string; brief: import("@pagosya/storefront-preview").SourceSnapshot["brief"]; files: import("@pagosya/storefront-preview").SourceFile[] }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project`, { method: "PUT", body: JSON.stringify(body) });
  }

  getSketch(storeId: string): Promise<{ revision: number; sketch: unknown; photos: string[]; fonts: string[]; stale?: boolean }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch`);
  }
  addSketchPhoto(storeId: string, body: { revision: number; url: string }): Promise<{ revision: number; path: string; photos: string[] }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch/photos`, { method: "POST", body: JSON.stringify(body) });
  }
  sketchIcons(storeId: string, query: string): Promise<Array<{ name: string; svg: string }>> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch/icons?q=${encodeURIComponent(query.slice(0, 60))}`);
  }
  putSketch(storeId: string, body: { revision: number; sketch: unknown }): Promise<{ revision: number; sketch: unknown }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch`, { method: "PUT", body: JSON.stringify(body) });
  }
  regenerateSketch(storeId: string, body: { revision: number; designSeed?: string; sectionId?: string }): Promise<{ revision: number; sketch: unknown }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch/regenerate`, { method: "POST", body: JSON.stringify(body) });
  }
  /** "Generar sitio": the boceto becomes the site, for good. */
  buildSketch(storeId: string, body: { revision: number }): Promise<{ revision: number }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/sketch/build`, { method: "POST", body: JSON.stringify(body) });
  }
  async exportSource(storeId: string, revision: number): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/stores/${encodeURIComponent(storeId)}/source-project/versions/${revision}/export`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new ApiError("No se pudo descargar esta revisión.", response.status);
    return response.blob();
  }

  conversation(storeId: string): Promise<ConversationResponse> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/agent-conversation`);
  }

  visualStudio(storeId: string): Promise<VisualStudioResponse> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/visual-studio`);
  }

  upload(file: File): Promise<{ url: string; assetId: string }> {
    const body = new FormData();
    body.append("file", file);
    return this.request("/uploads", { method: "POST", body });
  }

  sendMessage(storeId: string, instruction: string, assetUrls: string[], proposalId?: string, revision = 0): Promise<SendAgentResponse> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/agent-conversation/messages`, {
      method: "POST",
      body: JSON.stringify({ instruction, assetUrls, revision, ...(proposalId ? { proposalId } : {}) }),
    });
  }

  applyProposal(storeId: string, proposalId: string, revision: number): Promise<MerchantStore> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/visual-proposals/${encodeURIComponent(proposalId)}/apply`, { method: "POST", body: JSON.stringify({ revision }) });
  }

  publishDraft(storeId: string, revision: number): Promise<MerchantStore> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/website-draft/publish`, { method: "POST", body: JSON.stringify({ revision }) });
  }

  dismissProposal(storeId: string, proposalId: string): Promise<VisualProposal> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/visual-proposals/${encodeURIComponent(proposalId)}/dismiss`, { method: "POST" });
  }

  restoreVersion(storeId: string, versionId: string, revision: number): Promise<MerchantStore> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/visual-versions/${encodeURIComponent(versionId)}/restore`, { method: "POST", body: JSON.stringify({ revision }) });
  }
}

export interface SourceRevision { revision: number; label: string; digest: string; restoredFrom: number | null; createdAt: string }
export interface SourcePublication {
  payments?: 'live' | 'test' | 'contact';
  contactFormEnabled?: boolean; revision: number | null; version: number; publishedAt: string | null; active: boolean; slug: string;
  experiment: null | { id: string; status: string; startedAt: string; controlRevision: number; variantRevision: number; winner: string | null; evidence: { winner: string | null; reason: string }; variants: Array<{ variant: string; revision: number; visitors: number; buyers: number; paidOrders: number; conversionRate: number; revenue: Array<{ currency: string; amount: number }> }> };
}
export interface SourceState { publication?: SourcePublication; revision: number; versions: SourceRevision[]; nextBefore: number | null; /** YAPI is polishing this revision in the background (spec 2026-10-12). */ reviewPending?: boolean }
export interface SourceVersion extends SourceRevision { snapshot: import("@pagosya/storefront-preview").SourceSnapshot }

export function proposalPreviewUrl(store: MerchantStore, proposal?: VisualProposal | null): string {
  const url = new URL(`/s/${encodeURIComponent(store.slug)}`, CHECKOUT_ORIGIN);
  url.searchParams.set("preview", "1");
  url.searchParams.set("editor", "0");
  const hash = new URLSearchParams({ parent_origin: window.location.origin });
  const previewDraft = { ...store.websiteDraft?.data };
  delete previewDraft.contactFormEmail;
  delete previewDraft.salesGoalAmount;
  delete previewDraft.salesGoalLabel;
  if (proposal) {
    url.searchParams.set("ai_option", proposal.id);
    hash.set("proposal", JSON.stringify({ ...previewDraft, ...proposal.config }));
  }
  if (!proposal && store.websiteDraft) hash.set("proposal", JSON.stringify(previewDraft));
  url.hash = hash.toString();
  return url.toString();
}

export type SourceModelChoice = 'auto' | 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol' | 'claude-haiku-4-5-20251001' | 'claude-sonnet-5' | 'claude-opus-5-5';
export type SourceMotionMode = 'auto' | 'off' | 'subtle' | 'expressive';
export type SourceScrollFeel = 'native' | 'soft' | 'cinematic';
export type SourceGenerationSettings = { model: SourceModelChoice; maxCredits: number; motion?: SourceMotionMode; scrollFeel?: SourceScrollFeel; sitePurpose?: 'shop' | 'service' | 'portfolio' | 'editorial' };
export type SourceGenerationEstimate = { billingMode?: 'usage' | 'chatgpt-plan'; model: string; reason: string; maxCredits: number; estimate: { minCredits: number; maxCredits: number } };
export type SourceGenerationRun = { id: string; model: string; status: string; credits: number; maxCredits: number; durationMs: number | null; revision: number | null; createdAt: string };

/** The request a preserved draft was built from (API: source-draft-retry.ts); resent with resumeDraft to finish and save it. */
export type SourceDraftRetry = { text: string; assetUrls: string[]; currentPage: string; setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo'; selection?: { sectionId: string }; templateId?: string; directionId?: string };
