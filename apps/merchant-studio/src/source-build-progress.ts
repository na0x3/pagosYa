import { escapeHtml as escape } from './studio-ui';
export type BuildProgress = { status: 'running' | 'completed' | 'failed'; startedAt: number; updatedAt: number; steps: Array<{ stage: string; label: string; startedAt: number; finishedAt?: number; status: 'running' | 'completed' | 'failed'; details?: Array<{ label: string; thumbnail?: string }> }> };

const SHOT = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
/** YAPI's own steps inside a stage: paths, counts and screenshots of its draft — never code or reasoning. */
function renderDetails(details: unknown): string {
  if (!Array.isArray(details) || !details.length) return '';
  return `<ul class="build-details">${details.filter(detail => detail && typeof detail.label === 'string').slice(-60).map(detail => `<li>${escape(detail.label)}${typeof detail.thumbnail === 'string' && SHOT.test(detail.thumbnail) ? `<img class="build-shot" alt="" src="${detail.thumbnail}">` : ''}</li>`).join('')}</ul>`;
}

export function renderBuildProgress(value: unknown, live = false): string {
  const progress = value as BuildProgress | undefined;
  if (!progress || !Array.isArray(progress.steps) || !progress.steps.length) return '';
  const steps = progress.steps.filter(step => step && typeof step.label === 'string').slice(0, 20);
  const current = steps.at(-1);
  const elapsed = Math.max(0, Math.round(((live && progress.status === 'running' ? Date.now() : progress.updatedAt) - progress.startedAt) / 1000));
  const duration = Number.isFinite(elapsed) ? ` · ${elapsed} s` : '';
  const summary = progress.status === 'running' ? current?.label || 'Trabajando' : progress.status === 'failed' ? 'Trabajo interrumpido' : 'Trabajo completado';
  return `<details class="source-build-progress" ${live ? 'open' : ''}><summary><span class="build-state ${progress.status === 'running' ? 'is-running' : ''}" aria-hidden="true">${progress.status === 'failed' ? '!' : progress.status === 'running' ? '' : '✓'}</span>${escape(summary)}<span class="build-duration">${escape(duration)}</span></summary><ol>${steps.map(step => `<li><span class="build-state ${step.status === 'running' ? 'is-running' : ''}" aria-hidden="true">${step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : ''}</span><span>${escape(step.label)}<small>${step.status === 'running' ? 'En curso' : step.status === 'failed' ? 'No completado' : 'Completado'}</small>${renderDetails(step.details)}</span></li>`).join('')}</ol></details>`;
}
