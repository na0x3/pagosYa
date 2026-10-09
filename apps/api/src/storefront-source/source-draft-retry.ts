/** The request a preserved draft was built from, as the Studio resends it with resumeDraft ("Guardar borrador"). Read from
 * the run's chat job, which only the store's owner can reach; anything malformed is left out rather than guessed. */
export type SourceDraftRetry = {
  text: string;
  assetUrls: string[];
  currentPage: string;
  setupAction?: 'generate' | 'restart' | 'quick' | 'product-photo';
  selection?: { sectionId: string };
  templateId?: string;
  directionId?: string;
};

const SETUP_ACTIONS = ['generate', 'restart', 'quick', 'product-photo'] as const;
const ID = /^[a-z0-9-]{1,40}$/;

export function sourceDraftRetry(input: unknown): SourceDraftRetry | undefined {
  const job = input && typeof input === 'object' ? input as Record<string, any> : null;
  if (!job || typeof job.instruction !== 'string' || !job.instruction.trim()) return undefined;
  const sectionId = job.selection?.sectionId;
  return {
    text: job.instruction,
    assetUrls: Array.isArray(job.assetUrls) ? job.assetUrls.filter((url: unknown): url is string => typeof url === 'string').slice(0, 24) : [],
    currentPage: typeof job.currentPage === 'string' && job.currentPage ? job.currentPage : 'index.html',
    ...(SETUP_ACTIONS.includes(job.setupAction) ? { setupAction: job.setupAction } : {}),
    ...(typeof sectionId === 'string' && sectionId ? { selection: { sectionId } } : {}),
    ...(typeof job.templateId === 'string' && ID.test(job.templateId) ? { templateId: job.templateId } : {}),
    ...(typeof job.directionId === 'string' && ID.test(job.directionId) ? { directionId: job.directionId } : {}),
  };
}
