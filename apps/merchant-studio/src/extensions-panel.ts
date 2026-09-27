import type { ExtensionView, GuideView } from './api';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const logo = (name: string | null, alt: string, base: string) => `<span class="integration-logo ${name ? '' : 'is-pagosya'}"><img src="${esc(base)}${name ? `integrations/${esc(name)}.svg` : 'logo-mark.png'}" alt="${esc(name ? alt : 'PagosYa')}" width="32" height="32" loading="lazy"></span>`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function extensionBadges(view: ExtensionView): Array<{ label: string; tone: 'ready' | 'pro' | 'error' | 'plain' }> {
  const badges: Array<{ label: string; tone: 'ready' | 'pro' | 'error' | 'plain' }> = [view.tier === 'pro' ? { label: 'Pro · gratis por ahora', tone: 'pro' } : { label: 'Gratis', tone: 'plain' }];
  if (view.installed && !view.enabled) badges.push({ label: 'Pausada', tone: 'plain' });
  else if (view.installed && view.lastError) badges.push({ label: 'Con error', tone: 'error' });
  else if (view.installed && view.configured) badges.push({ label: 'Configurada', tone: 'ready' });
  return badges;
}
const toneClass = { ready: 'is-ready', pro: 'is-pro', error: 'is-error', plain: '' } as const;
const badgeHtml = (view: ExtensionView) => extensionBadges(view).map(badge => `<span class="business-badge ${toneClass[badge.tone]}">${esc(badge.label)}</span>`).join('');

export function extensionCard(view: ExtensionView, base: string) {
  return `<article class="integration-card"><header>${logo(view.logo, view.name, base)}<span class="integration-badges">${badgeHtml(view)}</span></header><h2>${esc(view.name)}</h2><small>${esc(view.categoryLabel)} · Extensión</small><p>${esc(view.summary)}</p><button type="button" data-open-extension="${esc(view.id)}">${view.installed ? 'Editar' : 'Configurar'}</button></article>`;
}

export function guideCard(guide: GuideView, base: string) {
  return `<article class="integration-card is-guide"><header>${logo(guide.logo, guide.name, base)}<span class="business-badge">Guía</span></header><h2>${esc(guide.name)}</h2><small>${esc(guide.categoryLabel)} · Servicio externo</small><p>${esc(guide.summary)}</p><div class="business-actions"><a class="integration-link" href="${esc(guide.url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a><a class="integration-link" href="${esc(guide.guide)}" target="_blank" rel="noopener noreferrer">Guía oficial ↗</a></div></article>`;
}

function fieldHtml(view: ExtensionView, field: ExtensionView['fields'][number]) {
  const value = view.settings[field.key];
  const hint = [field.where, field.help].filter(Boolean).map(text => `<small class="business-help">${esc(text)}</small>`).join('');
  if (field.type === 'toggle') return `<label class="business-switch"><input type="checkbox" name="setting:${esc(field.key)}" ${value === true ? 'checked' : ''}>${esc(field.label)}</label>${hint}`;
  if (field.type === 'select') return `<label>${esc(field.label)}<select name="setting:${esc(field.key)}" ${field.required ? 'required' : ''}><option value="">Elige una opción</option>${field.options.map(option => `<option value="${esc(option.value)}" ${value === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>${hint}`;
  return `<label>${esc(field.label)}<input name="setting:${esc(field.key)}" value="${esc(typeof value === 'string' ? value : '')}" placeholder="${esc(field.placeholder ?? '')}" ${field.pattern ? `pattern="${esc(field.pattern)}"` : ''} ${field.required ? 'required' : ''} spellcheck="false" autocomplete="off" maxlength="200"></label>${hint}`;
}

export function extensionDetail(view: ExtensionView, base: string) {
  const secrets = view.secrets.map(secret => `<label>${esc(secret.label)}<input type="password" name="secret:${esc(secret.key)}" placeholder="${secret.configured ? 'Escribe para reemplazar' : ''}" autocomplete="off" spellcheck="false"></label>${secret.configured ? '<small class="business-help">Configurado ✓</small>' : ''}${secret.help ? `<small class="business-help">${esc(secret.help)}</small>` : ''}`).join('');
  const skipped = view.feed?.skipped;
  const feed = view.feed ? `<section class="integration-feed"><h3>Dirección de tu catálogo</h3><div class="integration-feed-url"><input readonly value="${esc(view.feed.url)}" aria-label="Dirección de tu catálogo"><button type="button" data-copy-feed="${esc(view.feed.url)}">Copiar</button></div><ol>${view.feed.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>${skipped?.noPhoto ? `<p class="business-help">${plural(skipped.noPhoto, 'producto sin foto no aparece', 'productos sin foto no aparecen')} en el catálogo.</p>` : ''}${skipped?.noPrice ? `<p class="business-help">${plural(skipped.noPrice, 'producto sin precio no aparece', 'productos sin precio no aparecen')} en el catálogo.</p>` : ''}</section>` : '';
  const error = view.lastError ? `<p class="integration-report is-error" role="alert">${esc(view.lastError)}</p>` : '';
  const primary = view.installed ? 'Guardar' : view.fields.length || view.secrets.length ? 'Guardar y activar' : 'Activar';
  const actions = `<div class="business-actions"><button class="business-primary" type="submit">${primary}</button>${view.installed ? `<button type="button" data-toggle-extension>${view.enabled ? 'Pausar' : 'Reanudar'}</button><button type="button" data-remove-extension>Quitar</button>` : ''}</div>`;
  return `<section class="business-edit integration-detail" aria-label="${esc(view.name)}"><header>${logo(view.logo, view.name, base)}<div><h2>${esc(view.name)}</h2><p>${badgeHtml(view)}</p></div><button type="button" data-close-integration aria-label="Cerrar detalles">Cerrar</button></header><p>${esc(view.description)}</p>${error}<form class="integration-connect" data-extension-form>${view.fields.map(field => fieldHtml(view, field)).join('')}${secrets}${actions}</form>${feed}${view.docsUrl ? `<div class="business-actions"><a class="integration-link" href="${esc(view.docsUrl)}" target="_blank" rel="noopener noreferrer">Ver guía oficial ↗</a></div>` : ''}</section>`;
}

export function readExtensionForm(form: HTMLFormElement, view: ExtensionView) {
  const settings: Record<string, string | boolean> = {}, secrets: Record<string, string> = {};
  for (const field of view.fields) {
    const input = form.elements.namedItem(`setting:${field.key}`) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) continue;
    if (field.type === 'toggle') settings[field.key] = (input as HTMLInputElement).checked;
    else if (input.value.trim()) settings[field.key] = input.value.trim();
  }
  for (const secret of view.secrets) {
    const input = form.elements.namedItem(`secret:${secret.key}`) as HTMLInputElement | null;
    if (input) secrets[secret.key] = input.value.trim();
  }
  return { settings, secrets };
}
