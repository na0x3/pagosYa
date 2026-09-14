import { MerchantStudioApi } from './api';
import { escapeHtml as esc } from './studio-ui';
import { preserveDialogForms } from './dialog-form-state';
import { renderComebackPreview } from './comeback-preview';
import type { SourceSnapshot } from './source-preview';
import './brand-profile.css';
import './retention.css';

export async function openRetention(api: MerchantStudioApi, storeId: string, onChanged?: () => void, embedded?: {host:HTMLElement;view:string}) {
  let previewSnapshot: SourceSnapshot | undefined;
  let previewError = '';
  let previewLoading = false;
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog retention-dialog'; dialog.setAttribute('aria-label', 'Comeback y correos');
  let state: any; let busy = false; let dirty = false; let message = ''; let failed = false; let view = embedded?.view || 'program'; let selected: string | null = null;
  (embedded?.host || document.body).append(dialog); dialog.innerHTML = '<p role="status">Cargando Comeback y correos…</p>'; if (embedded) {dialog.setAttribute('open','');dialog.classList.add('retention-embedded');} else dialog.showModal();
  if (embedded) (window as Window & {pagosyaStudioCanLeave?:()=>boolean}).pagosyaStudioCanLeave = () => !busy && (!dirty || confirm('Hay cambios sin guardar. ¿Descartarlos?'));
  dialog.addEventListener('input', () => { dirty = true; });
  dialog.addEventListener('close', () => dialog.remove()); dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  const toggle = (key: string, label: string, enabled: boolean) => `<label class="retention-toggle"><input type="checkbox" name="${key}" ${enabled ? 'checked' : ''}>${label}</label>`;
  try { state = await api.retention(storeId); render(); if (view === 'program') void loadPreview(); } catch (e) { dialog.innerHTML = `<p role="alert">${esc(e instanceof Error ? e.message : 'No se pudo cargar.')}</p><button>Cerrar</button>`; dialog.querySelector('button')!.onclick = () => dialog.close(); }
  async function run(task: () => Promise<void>) {
    if (busy) return; const restore = preserveDialogForms(dialog); busy = true; failed = false;
    dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>('input,button,textarea,select').forEach(el => el.disabled = true);
    try { await task(); dirty = false; state = await api.retention(storeId); }
    catch (e) { failed = true; message = e instanceof Error ? e.message : 'No se pudo completar.'; if ((e as {status?:number})?.status === 409) { try { state = await api.retention(storeId); message += ' Se actualizó la versión guardada y conservamos tus cambios. Revísalos antes de volver a guardar.'; } catch { message += ' No se pudo actualizar la versión. Reintenta cuando vuelva la conexión.'; } } }
    finally { busy = false; render(); if (failed) { restore(); updatePreview(); } }
  }

  async function loadPreview() {
    if (previewLoading) return;
    previewLoading = true; previewError = ''; updatePreview();
    try {
      const source = await api.sourceState(storeId);
      const revision = source.publication?.revision || source.revision;
      if (!revision) { previewError = 'Crea el diseño de tu tienda para ver aquí la tarjeta con tu marca.'; return; }
      previewSnapshot = (await api.sourceVersion(storeId, revision)).snapshot;
    } catch { previewError = 'No se pudo cargar el diseño de la tarjeta.'; }
    finally { previewLoading = false; updatePreview(); }
  }
  function updatePreview() {
    const host = dialog.querySelector<HTMLElement>('[data-comeback-preview]');
    if (!host) return;
    if (!previewSnapshot) {
      host.innerHTML = `<p role="status">${esc(previewError || 'Cargando la tarjeta de tu tienda…')}</p>${previewError ? '<button type="button" data-retry-preview>Volver a cargar</button>' : ''}`;
      host.querySelector('[data-retry-preview]')?.addEventListener('click', () => void loadPreview());
      return;
    }
    const form = dialog.querySelector<HTMLFormElement>('[data-settings]')!;
    const values = new FormData(form);
    renderComebackPreview(host, previewSnapshot, {
      visitsRequired: Math.min(50, Math.max(2, Number(values.get('visitsRequired')) || 5)),
      rewardLabel: String(values.get('rewardLabel') || 'Tu premio por volver'),
    });
  }

  function render() {
    const s = state.settings;
    const campaign = state.campaigns.find((c: any) => c.id === selected);
    const headings: Record<string, [string, string]> = {
      program: ['Comeback Card', 'Diseña el premio que hará volver a tus clientes.'],
      campaigns: ['Campañas', 'Crea y revisa los correos que enviarás a tu comunidad.'],
      customers: ['Clientes y canjes', 'Conoce a tus suscriptores y entrega los premios de Comeback.'],
    };
    const [title, description] = headings[view];
    dialog.setAttribute('aria-label', title);
    const summary = view === 'program' ? [[state.cards, 'tarjetas creadas'], [s.visitsRequired, 'compras por premio']]
      : view === 'campaigns' ? [[state.campaigns.length, 'campañas recientes'], [state.subscriberCount, 'destinatarios activos']]
      : [[state.subscriberCount, 'suscriptores activos'], [state.cards, 'tarjetas Comeback']];
    dialog.innerHTML = `<header><div><p class="retention-eyebrow">${view === 'program' ? 'Fidelización' : view === 'campaigns' ? 'Email marketing' : 'Tu comunidad'}</p><h2>${title}</h2><p>${description}</p></div><button type="button" data-close>Cerrar</button></header>
      <div class="retention-summary">${summary.map(([value, label]) => `<span><strong>${value}</strong>${label}</span>`).join('')}</div>
      ${view === 'campaigns' && !state.emailConfigured ? '<p class="retention-notice">Configura el servicio de correo para enviar campañas. Ya puedes preparar y guardar tus borradores.</p>' : ''}
      ${embedded ? '' : `<nav class="retention-nav" aria-label="Herramientas de clientes">${[['program', 'Comeback Card'], ['campaigns', 'Campañas'], ['customers', 'Clientes y canjes']].map(([key, label]) => `<button type="button" data-view="${key}" aria-pressed="${view === key}">${label}</button>`).join('')}</nav>`}
      <p role="${failed ? 'alert' : 'status'}" class="retention-message">${esc(message)}</p>
      ${view === 'program' ? `<form data-settings>
        <div class="retention-card-layout"><section class="retention-section"><h3>Tarjeta Comeback</h3>${toggle('comebackEnabled', 'Activar tarjeta digital', s.comebackEnabled)}
        <p>La tarjeta aparece automáticamente después de pagar, con el nombre, logo y colores de tu tienda. Un sello por día con una compra pagada. Al completar la tarjeta, el cliente muestra su código y tú entregas el premio. Los pagos de prueba y las compras totalmente reembolsadas no cuentan.</p>
        <div class="brand-fields"><label>Compras en días distintos<input type="number" name="visitsRequired" min="2" max="50" required value="${s.visitsRequired}"></label><label>Premio que entregarás<input name="rewardLabel" maxlength="160" required value="${esc(s.rewardLabel)}"></label><label>Zona horaria de las compras<input name="timezone" required value="${esc(s.timezone)}" ${s.revision ? 'readonly' : ''}></label></div><p>Las compras cuentan desde la creación del programa. Usa el mismo correo para la tarjeta y al pagar. Cambiar la meta actualiza los premios todavía sin canjear.</p></section><aside class="retention-card-preview"><div class="retention-preview-heading"><strong>Vista previa</strong><span>Datos de ejemplo</span></div><div data-comeback-preview></div><p class="retention-preview-caption">El logo y los colores vienen del diseño de tu tienda. Los cambios de premio y meta se muestran aquí antes de guardar.</p></aside></div>
        <section class="retention-section"><h3>02 / Tu comunidad</h3>${toggle('signupEnabled', 'Mostrar formulario de suscripción', s.signupEnabled)}
        <p>Se abre como una ventana con una foto de tus productos y los colores de tu tienda. Puede llamarse “Club de beneficios”, “Acceso anticipado” o lo que tenga sentido para tu negocio. Solo anuncia descuentos que hayas configurado.</p>
        <div class="brand-fields"><label>Título<input name="signupTitle" required maxlength="100" value="${esc(s.signupTitle)}"></label><label>Descripción<textarea name="signupBody" maxlength="500">${esc(s.signupBody)}</textarea></label><label>Texto del botón<input name="signupButton" required maxlength="60" value="${esc(s.signupButton)}"></label></div>
        ${toggle('welcomeEnabled', 'Enviar correo de bienvenida al suscribirse', s.welcomeEnabled)}<div class="brand-fields"><label>Asunto de bienvenida<input name="welcomeSubject" required maxlength="160" value="${esc(s.welcomeSubject)}"></label><label>Mensaje de bienvenida<textarea name="welcomeBody" required rows="4" maxlength="5000">${esc(s.welcomeBody)}</textarea></label></div><p>Puedes usar {{store}} para incluir el nombre del negocio. Todos los correos comerciales incluyen un enlace para darse de baja.</p></section>
        <section class="retention-section"><h3>03 / Recuperar carritos</h3>${toggle('recoveryEnabled', 'Ofrecer un recordatorio por correo', s.recoveryEnabled)}<p>El cliente deja su correo y acepta recibir un recordatorio. Recupera los productos guardados con un enlace; si ya pagó, el correo se cancela.</p><label>Horas de espera<input type="number" name="recoveryHours" required min="1" max="168" value="${s.recoveryHours}"></label><p>Se envía un solo recordatorio por carrito, con un máximo de uno por cliente cada siete días. No lo suscribe a campañas.</p></section>
        <section class="retention-section"><h3>04 / Reseñas después de la entrega</h3>${toggle('reviewRequestsEnabled', 'Pedir una reseña 24 horas después de entregar', s.reviewRequestsEnabled)}<p>Se envía un solo correo por pedido entregado, con un enlace privado para reseñar los productos comprados. Las reseñas quedan pendientes de moderación y nunca se publican automáticamente.</p></section>
        <button class="button--publish" type="submit">Guardar configuración</button>
      </form>` : view === 'campaigns' ? `<section><h3>Un correo para tu comunidad</h3><p>Escribe el mensaje, guárdalo y revisa el borrador antes de enviarlo a los suscriptores activos.</p>
        <form data-campaign><div class="brand-fields"><label>Asunto<input name="subject" required maxlength="160"></label><label>Mensaje<textarea name="body" rows="6" required maxlength="10000"></textarea></label></div><button type="submit">Guardar borrador</button></form>
        <div class="retention-section"><h3>Campañas recientes</h3>${state.campaigns.length ? state.campaigns.map((c: any) => `<div class="retention-row"><div><strong>${esc(c.subject)}</strong><p>${c.queuedAt ? `En cola · ${c._count.deliveries} destinatarios` : 'Borrador'}</p></div><button type="button" data-campaign-id="${esc(c.id)}">Revisar</button></div>`).join('') : '<p>Tus borradores aparecerán aquí.</p>'}</div>
        ${campaign ? `<section class="retention-preview" aria-label="Vista previa del correo"><h3>${esc(campaign.subject)}</h3><p class="retention-body">${esc(campaign.body)}</p><p>Se añadirá el enlace para darse de baja.</p>${campaign.queuedAt ? '<p>Esta campaña ya fue puesta en cola.</p>' : `<p>Destinatarios: los ${state.subscriberCount} suscriptores activos al momento del envío.</p><button class="button--publish" type="button" data-send="${esc(campaign.id)}" ${!state.subscriberCount || !state.emailConfigured ? 'disabled' : ''}>Enviar a los suscriptores</button>`}</section>` : ''}
        <section class="retention-section"><h3>Estado de los correos</h3><p>${state.deliveries.map((d: any) => `${esc(({ PENDING: 'En espera', SENDING: 'Enviando', SENT: 'Enviados', FAILED: 'Fallidos', CANCELED: 'Cancelados' } as any)[d.status] || d.status)}: ${d._count}`).join(' · ') || 'Todavía no hay envíos.'}</p>${state.failedDeliveries?.length ? `<div class="retention-notice"><strong>Requieren atención</strong>${state.failedDeliveries.map((d: any) => `<div class="retention-row"><span><strong>${esc(({ CAMPAIGN: 'Campaña', WELCOME: 'Bienvenida', RECOVERY: 'Carrito', REVIEW_REQUEST: 'Reseña', CARD: 'Tarjeta' } as any)[d.kind] || d.kind)}</strong><br>${esc(d.lastError || 'El envío agotó sus reintentos.')}</span><small>${d.attempts} intentos · ${new Date(d.createdAt).toLocaleDateString('es-BO')}</small></div>`).join('')}</div>` : ''}<button type="button" data-refresh>Actualizar estado</button></section></section>` : `<section><h3>Canjear un premio</h3><p>Introduce el código de la tarjeta del cliente cuando entregues su regalo. Cada código se usa una sola vez.</p><form data-redeem class="brand-fields"><label>Código Comeback<input name="code" required maxlength="100" autocomplete="off" spellcheck="false"></label><button type="submit">Registrar entrega del premio</button></form>
        <div class="retention-section"><h3>Suscriptores</h3><p>${state.subscriberCount} activos. Se muestran los 50 más recientes.</p>${state.subscribers.map((s: any) => `<div class="retention-row"><span>${s.name ? `<strong>${esc(s.name)}</strong><br>` : ""}${esc(s.email)}${s.phone ? `<br>${esc(s.phone)}` : ""}${s.interests?.length ? `<br>${s.interests.map(esc).join(" · ")}` : ""}</span><time>${new Date(s.createdAt).toLocaleDateString('es-BO')}</time></div>`).join('') || '<p>Activa el formulario de suscripción para empezar a reunir tu comunidad.</p>'}</div></section>`}`;
    dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => dialog.close();
    dialog.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => { if (busy || dirty && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return; dirty = false; view = button.dataset.view!; message = ''; render(); if (view === 'program' && !previewSnapshot) void loadPreview(); });
    updatePreview();
    dialog.querySelector('[data-settings]')?.addEventListener('input', updatePreview);
    dialog.querySelector('[data-settings]')?.addEventListener('submit', e => {
      e.preventDefault(); const form = new FormData(e.target as HTMLFormElement); const data: Record<string, any> = { revision: s.revision };
      for (const key of ['comebackEnabled', 'signupEnabled', 'welcomeEnabled', 'recoveryEnabled', 'reviewRequestsEnabled']) data[key] = form.has(key);
      for (const key of ['visitsRequired', 'recoveryHours']) data[key] = Number(form.get(key));
      for (const key of ['rewardLabel', 'timezone', 'signupTitle', 'signupBody', 'signupButton', 'welcomeSubject', 'welcomeBody']) data[key] = String(form.get(key) || '').trim();
      void run(async () => { await api.writeRetention(storeId, '', 'PUT', data); onChanged?.(); message = 'Configuración guardada. Las secciones activadas aparecen en la tienda.'; });
    });
    dialog.querySelector('[data-campaign]')?.addEventListener('submit', e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.target as HTMLFormElement)); void run(async () => { const draft = await api.writeRetention(storeId, 'campaigns', 'POST', values); selected = draft.id; message = 'Borrador guardado. Revisa el mensaje antes de enviarlo.'; }); });
    dialog.querySelectorAll<HTMLButtonElement>('[data-campaign-id]').forEach(button => button.onclick = () => { const restore = preserveDialogForms(dialog); selected = button.dataset.campaignId!; render(); restore(); dialog.querySelector('.retention-preview')?.scrollIntoView({ block: 'nearest' }); });
    dialog.querySelector<HTMLButtonElement>('[data-send]')?.addEventListener('click', () => void run(async () => { const result = await api.writeRetention(storeId, `campaigns/${encodeURIComponent(selected!)}/send`, 'POST', {}); message = `Campaña en cola para ${result.queued} suscriptores.`; }));
    dialog.querySelector('[data-redeem]')?.addEventListener('submit', e => { e.preventDefault(); const form = new FormData(e.target as HTMLFormElement); void run(async () => { const result = await api.writeRetention(storeId, 'redeem', 'POST', { code: String(form.get('code')).trim() }); message = `Premio canjeado: ${result.rewardLabel}.`; }); });
    dialog.querySelector('[data-refresh]')?.addEventListener('click', () => void run(async () => { message = 'Estado actualizado.'; }));
  }
}
