import { escapeHtml as escape } from './studio-ui';
export type BuildProgress = { status: 'running' | 'completed' | 'failed'; startedAt: number; updatedAt: number; steps: Array<{ stage: string; label: string; startedAt: number; finishedAt?: number; status: 'running' | 'completed' | 'failed'; details?: Array<{ label: string; thumbnail?: string }> }> };

const SHOT = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
/** YAPI's own steps inside a stage: paths, counts and screenshots of its draft — never code or reasoning. */
const EDIT = /^(?:Editó|Escribió) (.+)$/;
function renderDetail(detail: { label: string; thumbnail?: unknown }) {
  return `<li>${escape(detail.label)}${typeof detail.thumbnail === 'string' && SHOT.test(detail.thumbnail) ? `<img class="build-shot" alt="" src="${detail.thumbnail}">` : ''}</li>`;
}
function renderDetails(details: unknown): string {
  if (!Array.isArray(details) || !details.length) return '';
  const rows = details.filter(detail => detail && typeof detail.label === 'string').slice(-60) as Array<{ label: string; thumbnail?: unknown }>;
  // Consecutive file edits read as one step, "Editó 3 archivos", that opens to the list.
  const groups: Array<{ label: string; thumbnail?: unknown } | Array<{ label: string }>> = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (EDIT.test(row.label) && Array.isArray(last)) last.push(row);
    else groups.push(EDIT.test(row.label) ? [row] : row);
  }
  return `<ul class="build-details">${groups.map(group => {
    if (!Array.isArray(group)) return renderDetail(group);
    if (group.length === 1) return renderDetail(group[0]);
    const files = new Set(group.map(row => row.label.match(EDIT)![1])).size;
    return `<li><details class="build-edits"><summary>Editó ${files} ${files === 1 ? 'archivo' : 'archivos'}</summary><ul>${group.map(renderDetail).join('')}</ul></details></li>`;
  }).join('')}</ul>`;
}

export function renderBuildProgress(value: unknown, live = false, outcome?: 'reply' | 'saved'): string {
  const progress = value as BuildProgress | undefined;
  if (!progress || !Array.isArray(progress.steps) || !progress.steps.length) return '';
  const steps = progress.steps.filter(step => step && typeof step.label === 'string').slice(0, 20);
  const current = steps.at(-1);
  const elapsed = Math.max(0, Math.round(((live && progress.status === 'running' ? Date.now() : progress.updatedAt) - progress.startedAt) / 1000));
  const duration = Number.isFinite(elapsed) ? ` · ${elapsed} s` : '';
  const summary = progress.status === 'running' ? current?.label || 'Trabajando' : progress.status === 'failed' ? 'Trabajo interrumpido' : outcome === 'reply' ? 'Respuesta preparada' : 'Trabajo completado';
  return `<details class="source-build-progress" ${live ? 'open' : ''}><summary><span class="build-state ${progress.status === 'running' ? 'is-running' : ''}" aria-hidden="true">${progress.status === 'failed' ? '!' : progress.status === 'running' ? '' : '✓'}</span>${escape(summary)}<span class="build-duration">${escape(duration)}</span></summary><ol>${steps.map(step => `<li><span class="build-state ${step.status === 'running' ? 'is-running' : ''}" aria-hidden="true">${step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : ''}</span><span>${escape(step.label)}<small>${step.status === 'running' ? 'En curso' : step.status === 'failed' ? 'No completado' : 'Completado'}</small>${renderDetails(step.details)}</span></li>`).join('')}</ol></details>`;
}
