/** The request a preserved draft was built from, as the Studio resends it with resumeDraft ("Guardar borrador"). Read from
 * the run's chat job, which only the store's owner can reach; anything malformed is left out rather than guessed. */
export type SourceDraftRetry = {
  text: string;
  assetUrls: string[];
  currentPage: string;
  setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo';
  selection?: { sectionId: string; at?: number; page?: string; area?: unknown };
  viewing?: { page: string; at?: number; sectionId?: string };
  templateId?: string;
  directionId?: string;
};

const SETUP_ACTIONS = ['generate', 'restart', 'quick', 'product-photo'] as const;
const ID = /^[a-z0-9-]{1,40}$/;
// Spec 2026-11-05 point-at: a template address and what the merchant was looking at come back too (the DTO re-checks a resent area).
const POINT_PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];
const pointAt = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 40;

export function sourceDraftRetry(input: unknown): SourceDraftRetry | undefined {
  const job = input && typeof input === 'object' ? input as Record<string, any> : null;
  if (!job || typeof job.instruction !== 'string' || !job.instruction.trim()) return undefined;
  // DooBoo 2026-10-28: a draft that a «Guardar borrador» resend already tried to finish is not offered again; every visit
  // (and every new message) resent the same request, which failed the same check each time.
  if (job.resumeDraft === true) return undefined;
  const sectionId = job.selection?.sectionId;
  return {
    text: job.instruction,
    assetUrls: Array.isArray(job.assetUrls) ? job.assetUrls.filter((url: unknown): url is string => typeof url === 'string').slice(0, 24) : [],
    currentPage: typeof job.currentPage === 'string' && job.currentPage ? job.currentPage : 'index.html',
    ...(SETUP_ACTIONS.includes(job.setupAction) ? { setupAction: job.setupAction } : {}),
    ...(typeof sectionId === 'string' && sectionId ? { selection: { sectionId,
      ...(pointAt(job.selection.at) && POINT_PAGES.includes(job.selection.page) ? { at: job.selection.at, page: job.selection.page } : {}),
      ...(job.selection.area && typeof job.selection.area === 'object' ? { area: job.selection.area } : {}) } } : {}),
    ...(job.viewing && POINT_PAGES.includes(job.viewing.page) ? { viewing: { page: job.viewing.page, ...(pointAt(job.viewing.at) ? { at: job.viewing.at } : {}),
      ...(typeof job.viewing.sectionId === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(job.viewing.sectionId) ? { sectionId: job.viewing.sectionId } : {}) } } : {}),
    ...(typeof job.templateId === 'string' && ID.test(job.templateId) ? { templateId: job.templateId } : {}),
    ...(typeof job.directionId === 'string' && ID.test(job.directionId) ? { directionId: job.directionId } : {}),
  };
}
