/** Spec 2026-10-12 faster generation: YAPI polishes a new store after showing it; Studio says so and picks up the result. */
export const REVIEW_POLL_MS = 4000;
export const REVIEW_NOTE = 'YAPI está puliendo tu tienda…';
export type ReviewPollAction = 'reload' | 'stop' | 'cancel' | 'wait';

export function reviewNoteMarkup(pending: boolean): string {
  return pending ? `<p class="source-review-note" role="status" data-review-note>${REVIEW_NOTE}</p>` : '';
}

/** One poll of the store state while a review is pending. `editing`: the merchant has unsaved work or a request running.
 *  The polished version is never loaded over unsaved work, and a review the merchant is editing past is cancelled. */
export function reviewPollAction(input: { shownRevision: number; next: { revision: number; reviewPending?: boolean }; editing: boolean }): ReviewPollAction {
  if (input.next.revision !== input.shownRevision) return input.editing ? 'wait' : 'reload';
  if (!input.next.reviewPending) return 'stop';
  return input.editing ? 'cancel' : 'wait';
}
