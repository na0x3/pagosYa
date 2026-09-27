import type { SourceProjectFileDto } from '../dto/save-source-project.dto';

const TTL_MS = 15 * 60_000;

/**
 * The agent's latest compiled draft per store, so Studio can show the store appearing while YAPI builds (sub-project 3
 * of docs/superpowers/specs/2026-09-26-yapi-agent-design.md). In memory only: a draft is never saved, one generation
 * runs per store at a time, and a restart simply shows the saved store again.
 */
export class AgentDraftPreviews {
  private readonly drafts = new Map<string, { at: number; files: SourceProjectFileDto[] }>();
  constructor(private readonly now: () => number = Date.now) {}
  set(storeId: string, files: SourceProjectFileDto[]) {
    // Two updates in the same millisecond still count as new for a viewer holding the first.
    const previous = this.drafts.get(storeId)?.at;
    this.drafts.set(storeId, { at: previous === undefined ? this.now() : Math.max(this.now(), previous + 1), files });
  }
  /** The draft when it is newer than `since`; otherwise only its timestamp (or null when there is none). */
  get(storeId: string, since?: number): { at: number | null; files?: SourceProjectFileDto[] } {
    const draft = this.drafts.get(storeId);
    if (!draft || this.now() - draft.at > TTL_MS) { this.drafts.delete(storeId); return { at: null }; }
    return since !== undefined && draft.at <= since ? { at: draft.at } : { at: draft.at, files: draft.files };
  }
  clear(storeId: string) { this.drafts.delete(storeId); }
}

export const agentDraftPreviews = new AgentDraftPreviews();
