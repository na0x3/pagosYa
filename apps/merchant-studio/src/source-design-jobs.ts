import type { MerchantStudioApi, SourceVersion } from './api';
import { escapeHtml as escape } from './studio-ui';
import './source-design-jobs.css';

export type SourceDesignJob = { id: string; requestId: string; revision: number; page: string; productId?: string; status: string; stage: string; maxCredits: number; reservedCredits: number; observedCredits: number; repairs: number; maxRepairs: number; error: string | null; resultRevision: number | null; resumeAvailable: boolean; report: { summary: string } | null };
const stages: Record<string, string> = { CAPTURE_BASELINE: 'Preparando vistas del diseño', REVIEW_BASELINE: 'Revisando composición y legibilidad', REPAIR: 'Preparando una mejora', CAPTURE_CANDIDATE: 'Comprobando la propuesta', PROBE_CANDIDATE: 'Comprobando opciones y compra', COMPARE: 'Comparando ambos diseños', APPLY: 'Guardando la mejora' };
const outcomes: Record<string, string> = { EXPIRED: 'La evidencia de esta mejora expiró', INCONCLUSIVE: 'Revisa los recursos antes de intentar otra mejora', UNSUPPORTED: 'Este catálogo requiere una revisión manual', APPLIED: 'Mejora guardada', UNCHANGED: 'La revisión no encontró cambios importantes', RETAINED_BASELINE: 'Conservamos el diseño anterior', STALE: 'El sitio cambió durante la revisión', CANCELLED: 'Mejora cancelada', INTERRUPTED: 'La mejora se interrumpió', FAILED: 'No se completó la mejora', BUDGET_EXHAUSTED: 'Se alcanzó el límite disponible' };

/** Restores server-side work after refresh; no paid request is made by polling. */
export function createSourceDesignJobs(api: MerchantStudioApi) {
  let epoch = 0, timer: ReturnType<typeof setTimeout> | undefined, store = '', job: SourceDesignJob | null = null, enabled = false, busy = false, error = '', open = false, limit = 150, productId = '';
  let notified = '';
  return function mount(host: HTMLElement, options: { storeId: string; version: SourceVersion; page: string; locked: boolean; historical: boolean; saved: () => Promise<void> }) {
    let pollSequence = 0;
    const token = ++epoch; if (timer) clearTimeout(timer);
    if (store !== options.storeId) { store = options.storeId; job = null; enabled = false; error = ''; open = false; productId = ''; notified = ''; }
    const current = () => token === epoch && host.isConnected;
    const configText = options.version.snapshot.files.find(f => f.path === 'config.js')?.content;
    let config: any = {}; try { config = JSON.parse(configText?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] || '{}'); } catch {}
    const products: Array<{ id: string; name: string }> = config.data?.items || [];
    const needsProduct = options.page === config.productPage || /data-pagosya-product-page/.test(options.version.snapshot.files.find(f => f.path === options.page)?.content || '');
    if (!products.some(p => p.id === productId)) productId = products[0]?.id || '';
    const active = () => job && ['QUEUED', 'RUNNING'].includes(job.status);
    function draw() {
      if (!current()) return;
      if (!enabled && !job) { host.replaceChildren(); return; }
      const focused = host.contains(document.activeElement) ? [...(document.activeElement?.attributes || [])].find(a => a.name.startsWith('data-design-'))?.name : undefined;
      const locked = busy || options.locked || options.historical;
      host.innerHTML = `<div class="source-design-job"><button type="button" data-design-open aria-expanded="${open}">${active() ? 'Mejora en curso' : 'Mejorar diseño'}</button>${open ? `<section aria-label="Mejora del diseño"><h3>Una mejora comprobada</h3><p>Revisa esta página en escritorio y móvil. Guarda una propuesta solo si mejora el diseño y supera las comprobaciones de compra.</p>${job ? `<p role="status"><strong>${escape(outcomes[job.status] || stages[job.stage] || 'Preparando…')}</strong></p><p>${escape(job.report?.summary || '')}</p><p class="source-design-job__cost">${job.observedCredits.toFixed(1)} créditos observados · ${job.reservedCredits.toFixed(1)} usados o reservados de ${job.maxCredits}</p>${job.error ? `<p role="alert">${escape(job.error)}</p>` : ''}${active() ? '<p>Puedes cerrar esta página; el trabajo queda guardado.</p>' : ''}` : ''}${error ? `<p role="alert">${escape(error)}</p>` : ''}${active() ? `<button type="button" data-design-cancel ${busy ? 'disabled' : ''}>Cancelar mejora</button>` : `<label>Límite estimado de créditos<input data-design-limit type="number" min="1" max="500" step="1" value="${limit}" ${locked ? 'disabled' : ''}></label>${needsProduct ? `<label>Producto<select data-design-product ${locked ? 'disabled' : ''}>${products.map(p => `<option value="${escape(p.id)}" ${p.id === productId ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></label>` : ''}<div class="source-design-job__actions"><button type="button" data-design-start ${locked || !enabled || needsProduct && !productId ? 'disabled' : ''}>Revisar y mejorar</button>${job?.resumeAvailable ? `<button type="button" data-design-resume ${locked || !enabled ? 'disabled' : ''}>Continuar trabajo</button>` : ''}</div>`}<small>El costo depende del uso de IA. No publica cambios. Si una llamada se interrumpe, conserva su reserva.</small></section>` : ''}</div>`;
      if (focused) (host.querySelector<HTMLElement>(`[${focused}]:not(:disabled)`) || host.querySelector<HTMLElement>('[data-design-open]'))?.focus();
      host.onkeydown = event => { if (event.key === 'Escape' && open) { open = false; draw(); host.querySelector<HTMLElement>('[data-design-open]')?.focus(); } };
      host.querySelector('[data-design-open]')?.addEventListener('click', () => { open = !open; draw(); });
      host.querySelector<HTMLInputElement>('[data-design-limit]')?.addEventListener('input', event => { limit = Number((event.target as HTMLInputElement).value); });
      host.querySelector<HTMLSelectElement>('[data-design-product]')?.addEventListener('change', event => { productId = (event.target as HTMLSelectElement).value; });
      host.querySelector('[data-design-start]')?.addEventListener('click', () => void execute(() => api.startSourceDesignJob(store, { requestId: crypto.randomUUID(), revision: options.version.revision, page: options.page, ...(needsProduct ? { productId } : {}), maxCredits: limit, maxRepairs: 1 })));
      host.querySelector('[data-design-cancel]')?.addEventListener('click', () => void execute(() => api.cancelSourceDesignJob(store, job!.id)));
      host.querySelector('[data-design-resume]')?.addEventListener('click', () => void execute(() => api.resumeSourceDesignJob(store, job!.id)));
    }
    async function execute(action: () => Promise<SourceDesignJob>) {
      if (busy) return; pollSequence++; busy = true; error = ''; draw();
      try { const result = await action(); if (current()) { job = result; open = true; } }
      catch (e) { if (current()) error = e instanceof Error ? e.message : 'No se pudo iniciar la mejora.'; }
      finally { busy = false; if (current()) { draw(); void poll(); } }
    }
    function schedule() { if (timer) clearTimeout(timer); if (current() && active()) timer = setTimeout(() => void poll(), 2500); }
    async function poll() {
      const sequence = ++pollSequence;
      try {
        const result = await api.latestSourceDesignJob(options.storeId); if (!current() || sequence !== pollSequence) return;
        const changed = Boolean(error) || enabled !== (result.enabled === true) || JSON.stringify(job) !== JSON.stringify(result.job || null);
        error = ''; enabled = result.enabled === true; job = result.job || null; if (changed) draw();
        if (!options.historical && job?.status === 'APPLIED' && job.id !== notified && job.resultRevision && job.resultRevision > options.version.revision) { const appliedId = job.id; await options.saved(); notified = appliedId; return; }
      } catch (e) { if (current() && sequence === pollSequence && enabled) { error = e instanceof Error ? e.message : 'No se pudo actualizar el estado.'; draw(); } }
      schedule();
    }
    draw(); void poll();
  };
}
