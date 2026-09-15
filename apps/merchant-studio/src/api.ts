import type { SourceDesignJob } from './source-design-jobs';
import type { AssetLibrary, VisualReport } from './source-visual-tools';
import type { BuildProgress } from './source-build-progress';
import type { BrandState } from './brand-profile';
export const SESSION_STORAGE_KEY = "pagosya_merchant_session";

const embedded = new URLSearchParams(location.search).get("embedded") === "1" && window.parent !== window;
export const API_BASE_URL: string = embedded || ["browser", "thumbnail", "library", "productGuide"].some(key => new URLSearchParams(location.search).has(key))
  ? sessionStorage.getItem("pagosya_merchant_api_base") || import.meta.env.VITE_API_BASE_URL || "/api/v1"
  : import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
function configuredCheckoutOrigin(): string {
  if (import.meta.env.VITE_CHECKOUT_ORIGIN) return import.meta.env.VITE_CHECKOUT_ORIGIN;
  // Embedded Studio and its browser preview share the dashboard's connection settings.
  try {
    const saved = sessionStorage.getItem('pagosya_checkout_origin');
    if (saved) return saved;
  } catch { /* Storage may be unavailable in a restricted preview. */ }
  return 'http://localhost:5175'; // Port used by the repository's pnpm dev stack.
}
export const CHECKOUT_ORIGIN: string = configuredCheckoutOrigin();

export type JsonRecord = Record<string, unknown>;

export interface MerchantStore {
  id: string;
  name: string;
  slug: string;
  status?: string;
  siteDocument?: unknown;
  websiteRevision?: number;
  websiteDraft?: { data: JsonRecord; links?: unknown[]; inventoryChanges?: Array<{ name: string; beforeStock: number | null; stock: number | null }> } | null;
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
  saveShippingSettings(storeId: string, input: { enabled: boolean; pickupEnabled: boolean }): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping`, { method: 'POST', body: JSON.stringify(input) }); }
  createShippingRate(storeId: string, input: Record<string, any>): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/operations/delivery/zones`, { method: 'POST', body: JSON.stringify(input) }); }
  toggleShippingRate(storeId: string, rateId: string, active: boolean): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping/rates/${encodeURIComponent(rateId)}`, { method: 'PATCH', body: JSON.stringify({ active }) }); }
  saveShippingWeight(storeId: string, productId: string, weightGrams: number | null): Promise<any> { return this.request(`/stores/${encodeURIComponent(storeId)}/shipping/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ weightGrams }) }); }
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
  sourceCatalog(storeId: string): Promise<JsonRecord> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/catalog`);
  }

  createProduct(storeId: string, input: { name: string; description: string | null; specifications?: Array<{ label: string; value: string }>; amount: number; currency: string; stock: number | null; imageUrls: string[]; variants?: Array<{name: string; amount: number; stock?: number | null; options?: Array<{name: string; value: string}>; imageUrl?: string | null}> }): Promise<{ id: string; name: string }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateProduct(storeId: string, productId: string, input: Partial<Parameters<MerchantStudioApi['createProduct']>[1]>): Promise<{ id: string; name: string }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/payment_links/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  sourceConversation(storeId: string): Promise<ConversationResponse> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/conversation`);
  }

  sendSourceMessage(storeId: string, instruction: string, assetUrls: string[], revision: number, setupStep?: string, setupAction?: string, generation?: SourceGenerationSettings, browserReview?: string[], requestId?: string): Promise<{ setup?: SourceSetup | null; userMessage: AgentMessage; assistantMessage: AgentMessage; revision?: SourceRevision }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/messages`, { method: "POST", body: JSON.stringify({ instruction, assetUrls, revision, setupStep, setupAction, ...generation, ...(browserReview?.length ? { browserReview } : {}), ...(requestId ? { requestId } : {}) }) });
  }

  sourceProgress(storeId: string, requestId: string, signal?: AbortSignal): Promise<{ progress: BuildProgress | null }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/progress?requestId=${encodeURIComponent(requestId)}`, { signal });
  }

  estimateSource(storeId: string, body: SourceGenerationSettings & { revision: number; instruction: string; assetUrls: string[] }): Promise<SourceGenerationEstimate> {
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
  publishSource(storeId: string, revision: number, publicationVersion: number): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/publish`, { method: 'POST', body: JSON.stringify({ revision, publicationVersion }) });
  }
  startSourceTest(storeId: string, revision: number, publicationVersion: number): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/experiments`, { method: 'POST', body: JSON.stringify({ revision, publicationVersion }) });
  }
  finishSourceTest(storeId: string, experimentId: string, publicationVersion: number, apply: boolean): Promise<SourcePublication> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/experiments/finish`, { method: 'POST', body: JSON.stringify({ experimentId, publicationVersion, apply }) });
  }
  sourceAlternative(storeId: string, body: SourceGenerationSettings & { revision: number; instruction: string }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/alternative`, { method: 'POST', body: JSON.stringify(body) });
  }
  sourceState(storeId: string, before?: number): Promise<SourceState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project${before ? `?before=${before}` : ""}`);
  }

  setSourceMotion(storeId: string, revision: number, motion: SourceMotionMode): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/motion`, { method: 'PATCH', body: JSON.stringify({ revision, motion }) });
  }

  editSourceFile(storeId: string, revision: number, path: string, content: string): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/file`, { method: "PATCH", body: JSON.stringify({ revision, path, content }) });
  }

  sourceVersion(storeId: string, revision: number): Promise<SourceVersion> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${revision}`);
  }

  generateSource(storeId: string, body: { revision: number; brief: import("./source-preview").SourceSnapshot["brief"]; instruction: string; assetUrls: string[]; motion?: SourceMotionMode }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/generate`, { method: "POST", body: JSON.stringify(body) });
  }

  restoreSource(storeId: string, target: number, revision: number): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${target}/restore`, { method: "POST", body: JSON.stringify({ revision }) });
  }

  saveSource(storeId: string, body: { revision: number; label: string; brief: import("./source-preview").SourceSnapshot["brief"]; files: import("./source-preview").SourceFile[] }): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project`, { method: "PUT", body: JSON.stringify(body) });
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
export interface SourceState { publication?: SourcePublication; revision: number; versions: SourceRevision[]; nextBefore: number | null }
export interface SourceVersion extends SourceRevision { snapshot: import("./source-preview").SourceSnapshot }

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

export type SourceModelChoice = 'auto' | 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol' | 'deepseek-v4-flash' | 'deepseek-v4-pro' | 'deepseek-v4-flash-vision-exp';
export type SourceMotionMode = 'auto' | 'off' | 'subtle' | 'expressive';
export type SourceGenerationSettings = { model: SourceModelChoice; maxCredits: number; motion?: SourceMotionMode };
export type SourceGenerationEstimate = { model: string; reason: string; maxCredits: number; estimate: { minCredits: number; maxCredits: number } };
export type SourceGenerationRun = { id: string; model: string; status: string; credits: number; maxCredits: number; durationMs: number | null; revision: number | null; createdAt: string };
