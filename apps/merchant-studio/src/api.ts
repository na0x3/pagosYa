export const SESSION_STORAGE_KEY = "pagosya_merchant_session";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
export const CHECKOUT_ORIGIN: string = import.meta.env.VITE_CHECKOUT_ORIGIN ?? "http://localhost:5174";

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

export interface ConversationResponse {
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

  sourceState(storeId: string, before?: number): Promise<SourceState> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project${before ? `?before=${before}` : ""}`);
  }

  editSourceFile(storeId: string, revision: number, path: string, content: string): Promise<SourceRevision> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/file`, { method: "PATCH", body: JSON.stringify({ revision, path, content }) });
  }

  sourceVersion(storeId: string, revision: number): Promise<SourceVersion> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/versions/${revision}`);
  }

  generateSource(storeId: string, body: { revision: number; brief: import("./source-preview").SourceSnapshot["brief"]; instruction: string; assetUrls: string[] }): Promise<SourceRevision> {
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
export interface SourceState { revision: number; versions: SourceRevision[]; nextBefore: number | null }
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
