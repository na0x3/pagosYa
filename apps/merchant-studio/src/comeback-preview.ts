import { sourceComebackBranding } from '@pagosya/shared-types';
import { API_BASE_URL } from './api';
import type { SourceSnapshot } from './source-preview';
import '../../api/src/stores/source-kit/retention.js';

/** A visual sample only: no customer credentials, rewards or email requests. */
export function showComebackPreview(snapshot: SourceSnapshot) {
  const dialog = document.createElement('dialog');
  dialog.className = 'comeback-preview-dialog';
  dialog.setAttribute('aria-label', 'Vista previa de la tarjeta Comeback');
  dialog.innerHTML = '<header><strong>Vista previa · Datos de ejemplo</strong><button type="button" autofocus>Cerrar</button></header><div data-card></div><p class="comeback-preview-status"></p>';
  const previousFocus = document.activeElement;
  const close = () => { dialog.close(); dialog.remove(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  dialog.querySelector('button')!.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog);
  renderComebackPreview(dialog.querySelector('[data-card]')!, snapshot);
  dialog.querySelector('.comeback-preview-status')!.textContent = 'Así se verá la tarjeta de tus clientes. Los sellos de esta vista son de ejemplo.';
  dialog.showModal();
}

/** Shared with the Comeback settings page; draft changes never register visits. */
export function renderComebackPreview(host: HTMLElement, snapshot: SourceSnapshot, overrides: { visitsRequired?: number; rewardLabel?: string } = {}) {
  const match = snapshot.files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  let store: Record<string, any> = {};
  try { store = match ? JSON.parse(match[1]).data || {} : {}; } catch { /* Use the neutral sample identity. */ }
  const settings = store.retention || {};
  const brand = sourceComebackBranding({ ...store, name: store.storeName || store.name || 'Tu tienda' }, snapshot);
  (window as any).PAGOSYA_COMEBACK_RENDER(host, {
    brand, customerName: 'Cliente de ejemplo', visits: 1,
    visitsRequired: overrides.visitsRequired ?? settings.visitsRequired ?? 5, availableRewards: 0,
    rewardLabel: overrides.rewardLabel ?? settings.rewardLabel ?? 'Tu premio por volver',
  }, { apiBaseUrl: API_BASE_URL });
}
