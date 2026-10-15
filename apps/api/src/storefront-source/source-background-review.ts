/**
 * YAPI's self-review after the store is shown (spec 2026-10-12 faster generation, part 2). The review is a
 * StoreSourceGeneration row of its own: status REVIEWING while it runs (no activeStoreId, so it never blocks a new request),
 * a heartbeat Studio's reviewPending reads, and COMPLETED, DISCARDED, FAILED or CANCELLED once it ends. The status column has a
 * CHECK constraint: these statuses are allowed by migration 20261014220000_source_review_statuses (spec 2026-10-14 store
 * controls, part 1; before it every review row insert failed).
 */
import { pendingFactsNote } from './store-voice';
export const SOURCE_REVIEW_STATUS = 'REVIEWING';
export const SOURCE_REVIEW_LABEL = 'Revisión de YAPI';
/** A review whose process stopped beating this long ago (an API restart) is gone: Studio stops waiting for it. */
export const SOURCE_REVIEW_STALE_MS = 5 * 60_000;
export const SOURCE_REVIEW_HEARTBEAT_MS = 15_000;

/** The review result no longer fits revision N (header covers, or it was cancelled while saving): N stays, silently. */
export class SourceReviewDiscarded extends Error {}
/** The review's row left REVIEWING before the save: a new request or another process cancelled it. */
export class SourceReviewCancelled extends Error {}

/** A review still polishing the store's current revision, with a fresh heartbeat. */
export function reviewPendingWhere(storeId: string, revision: number, now = Date.now()) {
  return { storeId, status: SOURCE_REVIEW_STATUS, baseRevision: revision, heartbeatAt: { gt: new Date(now - SOURCE_REVIEW_STALE_MS) } };
}

/** The chat line posted with revision N+1: the review's own notes (short Spanish sentences), else its version name. */
export function reviewMessage(notes: string[], label: string, pending = 0): string {
  const said = notes.map(note => note.trim()).filter(Boolean).slice(0, 6).join(' ');
  // Spec 2026-10-14 store voice: the facts YAPI assumed, still waiting for the merchant, are named in the same message.
  return `Pulí tu tienda: ${said || `«${label}».`}${pending ? ` ${pendingFactsNote(pending)}` : ''}`;
}

/** One background review per store in this process; a new one, or cancel, aborts the one before. */
export class SourceReviewRegistry {
  private readonly running = new Map<string, { controller: AbortController; done: Promise<void> }>();

  start(storeId: string, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    this.running.get(storeId)?.controller.abort();
    const controller = new AbortController();
    // `work` starts synchronously, so a cancel right after start reaches a review that is already listening.
    const done = (async () => { await work(controller.signal); })().catch(() => undefined)
      .finally(() => { if (this.running.get(storeId)?.controller === controller) this.running.delete(storeId); });
    this.running.set(storeId, { controller, done });
    return done;
  }

  cancel(storeId: string): boolean {
    const entry = this.running.get(storeId);
    entry?.controller.abort();
    return Boolean(entry);
  }

  settled(storeId: string): Promise<void> {
    return this.running.get(storeId)?.done ?? Promise.resolve();
  }
}
