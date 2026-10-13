import { describe, expect, it } from 'vitest';
import { REVIEW_NOTE, REVIEW_POLL_MS, reviewNoteMarkup, reviewPollAction } from './source-review-note';

describe('YAPI polishing note (spec 2026-10-12)', () => {
  it('says YAPI is polishing only while a review is pending, and polls every 4 s', () => {
    expect(REVIEW_POLL_MS).toBe(4000);
    expect(reviewNoteMarkup(true)).toBe(`<p class="source-review-note" role="status" data-review-note>${REVIEW_NOTE}</p>`);
    expect(REVIEW_NOTE).toBe('YAPI está puliendo tu tienda…');
    expect(reviewNoteMarkup(false)).toBe('');
  });
  it('reloads when the polished version lands, and stops quietly when the review ended without one', () => {
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 5, reviewPending: false }, editing: false })).toBe('reload');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: false }, editing: false })).toBe('stop');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: true }, editing: false })).toBe('wait');
  });
  it('cancels while editing and never reloads over unsaved work', () => {
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: true }, editing: true })).toBe('cancel');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 5, reviewPending: false }, editing: true })).toBe('wait');
  });
});
