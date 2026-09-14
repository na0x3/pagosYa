import { MerchantStudioApi, SESSION_STORAGE_KEY, type SourceState, type SourceGenerationSettings } from './api';
import { externalIntegrations } from './integration-catalog';
import { inheritResourceTheme } from './source-resource-theme';
import { escapeHtml as esc } from './studio-ui';
import { openRetention } from './retention';
import { openCommercePlatform } from './commerce-platform';
import { openShippingSettings } from './shipping-settings';
import { openBrandProfile } from './brand-profile';
import { openCommerceContent } from './commerce-content';
import { checkSourceWebsite, sourceChecksBlockPublishing } from './source-checks';
import './source-library.css';
import './source-business-workspace.css';
const icons: Record<string, string> = { mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>', gift: '<path d="M3 8h18v5H3zM5 13v8h14v-8M12 8v13"/><path d="M12 8S5 8 6 4s6 4 6 4 7 0 6-4-6 4-6 4"/>', box: '<path d="m3 6 9-4 9 4v12l-9 4-9-4zM3 6l9 4 9-4M12 10v12"/>', link: '<path d="M9 15 15 9M7 14l-2 2a4 4 0 0 0 6 6l3-3M10 5l3-3a4 4 0 0 1 6 6l-2 2"/>', star: '<path d="m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z"/>', palette: '<circle cx="12" cy="12" r="9"/><path d="M8 8h.01M15 7h.01M6 13h.01M12 16h5"/>' };
const icon = (name: string) => `<span class="business-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.mail}</svg></span>`;
const money = (amount: number, currency: string) => new Intl.NumberFormat('es-BO', { style: 'currency', currency }).format(amount / 100);
export async function mountBusinessWorkspace(app: HTMLDivElement) {
    inheritResourceTheme();
    document.body.className = 'store-resource-body business-workspace-body';
    const params = new URLSearchParams(location.search), storeId = params.get('store') || '', kind = params.get('library'), tab = params.get('tab') || 'templates';
    const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
    let busy = false, dirty = false, message = '';
    let recoverConflict: (() => Promise<void>) | undefined;
    const send = (data: object) => window.parent.postMessage({ ...data, storeId }, location.origin);
    const canLeave = () => !busy && !document.querySelector('dialog[open]:not(.retention-embedded)') && (!dirty || confirm('Hay cambios sin guardar. ¿Descartarlos?'));
    (window as Window & {
        pagosyaStudioCanLeave?: () => boolean;
    }).pagosyaStudioCanLeave = canLeave;
    const observer = new ResizeObserver(() => send({ type: 'pagosya:resource-height', height: app.scrollHeight + 28 }));
    observer.observe(app);
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    const status = () => { const target = app.querySelector<HTMLElement>('[data-business-status]'); if (target)
        target.textContent = message; };
    async function run(task: () => Promise<void>, redraw: () => void | Promise<void>) {
        if (busy)
            return;
        busy = true;
        message = 'Guardando…';
        status();
        const controls = [...app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea')];
        const previous = controls.map(el => el.disabled);
        controls.forEach(el => el.disabled = true);
        try {
            await task();
            message = 'Cambios guardados.';
            await redraw();
        }
        catch (error) {
            message = error instanceof Error ? error.message : 'No se pudo completar. Tus datos siguen aquí.';
            if ((error as {
                status?: number;
            })?.status === 409 && recoverConflict) {
                try {
                    await recoverConflict();
                    message += ' Se actualizó la versión guardada y conservamos tu borrador. Revisa tus cambios antes de volver a guardar.';
                }
                catch {
                    message += ' No se pudo cargar la versión actual. Inténtalo cuando se restablezca la conexión.';
                }
            }
        }
        finally {
            busy = false;
            controls.forEach((el, i) => { if (el.isConnected)
                el.disabled = previous[i]; });
            status();
        }
    }
    app.innerHTML = '<p role="status">Cargando las herramientas de tu tienda…</p>';
    try {
        if (kind === 'marketing' && ['program', 'campaigns', 'customers'].includes(tab)) {
            app.replaceChildren();
            await openRetention(api, storeId, () => { }, { host: app, view: tab });
            return;
        }
        if (kind === 'marketing') {
            let state = await api.businessWorkspace(storeId), editing: string | null = null;
            recoverConflict = async () => { state = await api.businessWorkspace(storeId); if (tab === 'domain' && state.domain) {
                dirty = false;
                renderMail();
            } };
            const reload = async () => { state = await api.businessWorkspace(storeId); renderMail(); };
            function renderMail() {
                app.innerHTML = `<header class="business-heading"><div><strong>${esc(state.storeName)}</strong><p>Mensajes que acompañan cada compra.</p></div><span class="business-badge ${state.emailConfigured ? 'is-ready' : ''}">${state.emailConfigured ? 'Proveedor configurado' : 'Envío sin configurar'}</span></header><p data-business-status role="status">${esc(message)}</p><div data-mail-body></div>`;
                const host = app.querySelector<HTMLElement>('[data-mail-body]')!;
                if (tab === 'templates' || tab === 'flows') {
                    if (editing) {
                        const item = state.templates.find((row: any) => row.id === editing);
                        host.innerHTML = `<button type="button" data-mail-back>← Todas las plantillas</button><form class="business-edit" data-template-form><header>${icon('mail')}<div><h2>${esc(item.name)}</h2><p>${esc(item.trigger)}</p></div></header><label class="business-switch"><input type="checkbox" name="enabled" ${item.enabled ? 'checked' : ''} ${!item.supported ? 'disabled' : ''}>Activar este correo</label>${!item.supported ? `<p class="business-note">${esc(item.trigger)}. Puedes preparar el mensaje; el envío aún no está disponible.</p>` : ''}<label>Asunto<input name="subject" value="${esc(item.subject)}" maxlength="160" required></label><label>Mensaje<textarea name="body" rows="7" maxlength="5000" required>${esc(item.body)}</textarea></label><p class="business-help">Variables: {{store}}${['WELCOME', 'RECOVERY', 'REVIEW_REQUEST'].includes(item.id) ? '' : ' · {{customer}} · {{order}} · {{amount}}'}. Los enlaces necesarios se conservan en los correos de recuperación y reseñas.</p><div class="business-actions"><button class="business-primary" type="submit">Guardar plantilla</button><button type="button" data-preview-email>Vista previa</button></div><article class="email-preview" data-email-preview hidden></article></form>`;
                        host.querySelector('[data-mail-back]')!.addEventListener('click', () => { if (canLeave()) {
                            dirty = false;
                            editing = null;
                            renderMail();
                        } });
                        const form = host.querySelector<HTMLFormElement>('form')!;
                        form.addEventListener('input', () => { dirty = true; });
                        form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); void run(async () => { await api.businessWorkspace(storeId, `/templates/${item.id}`, 'PUT', { revision: state.revision, enabled: item.supported && data.has('enabled'), subject: data.get('subject'), body: data.get('body') }); dirty = false; }, reload); });
                        host.querySelector('[data-preview-email]')!.addEventListener('click', () => { const data = new FormData(form), preview = host.querySelector<HTMLElement>('[data-email-preview]')!; const text = (value: unknown) => String(value).replace(/\{\{store\}\}/g, () => state.storeName).replace(/\{\{customer\}\}/g, 'María').replace(/\{\{order\}\}/g, 'PEDIDO-123').replace(/\{\{amount\}\}/g, 'Bs 180,00'); preview.innerHTML = `<small>Ejemplo · no se enviará</small><h3>${esc(text(data.get('subject')))}</h3><p>${esc(text(data.get('body')))}</p>`; preview.hidden = false; });
                    }
                    else {
                        host.innerHTML = `<div class="email-groups ${tab === 'flows' ? 'is-flows' : ''}">${[['transactional', 'Correos transaccionales', 'Acompaña los momentos de cada pedido.'], ['marketing', 'Comunidad y recuperación', 'Invita a tus clientes a volver.']].map(([group, title, description]) => `<section><h2>${title} <span>${state.templates.filter((item: any) => item.group === group).length}</span></h2><p>${description}</p><div>${state.templates.filter((item: any) => item.group === group).map((item: any) => `<button type="button" class="email-template-row" data-template="${item.id}">${icon(item.id === 'GIFT_CARD' ? 'gift' : 'mail')}<span><strong>${esc(item.name)}</strong><small>${esc(item.trigger)}${item.delayHours ? ` · ${item.delayHours} h` : ''}</small>${tab === 'templates' ? `<small>Asunto: ${esc(item.subject)}</small>` : ''}</span><span class="business-badge ${item.enabled && state.emailConfigured ? 'is-ready' : ''}">${!item.supported ? 'Por conectar' : item.enabled ? state.emailConfigured ? 'Activo' : 'Preparado' : 'Desactivado'}</span><span aria-hidden="true">›</span></button>`).join('')}</div></section>`).join('')}</div>`;
                        host.querySelectorAll<HTMLButtonElement>('[data-template]').forEach(button => button.onclick = () => { editing = button.dataset.template!; renderMail(); });
                    }
                }
                else if (tab === 'staff') {
                    host.innerHTML = `<form data-staff-form class="business-edit"><header>${icon('mail')}<div><h2>Notificaciones al equipo</h2><p>Elige quién recibe novedades de esta tienda. Estos destinatarios no obtienen acceso al panel.</p></div></header><label class="business-switch"><input type="checkbox" name="enabled" ${state.staff.enabled ? 'checked' : ''}>Activar notificaciones</label><div data-recipients></div><button type="button" data-add-recipient>+ Añadir destinatario</button><p class="business-help">El resumen semanal se prepara los lunes desde las 08:00, en la zona horaria de la tienda.</p><button class="business-primary" type="submit">Guardar destinatarios</button></form>`;
                    const recipients = structuredClone(state.staff.recipients) as Array<{
                        email: string;
                        events: string[];
                    }>;
                    const draw = () => { host.querySelector('[data-recipients]')!.innerHTML = recipients.map((row, i) => `<fieldset class="staff-recipient"><label>Correo<input type="email" data-recipient-email="${i}" value="${esc(row.email)}" required maxlength="254" placeholder="equipo@tutienda.com"></label><div>${[['NEW_ORDER', 'Nuevo pedido'], ['REFUND', 'Reembolso'], ['WEEKLY', 'Resumen semanal']].map(([key, label]) => `<label class="business-switch"><input type="checkbox" data-recipient-event="${i}" value="${key}" ${row.events.includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div><button type="button" data-remove-recipient="${i}">Quitar</button></fieldset>`).join('') || '<p class="business-empty">Todavía no añadiste destinatarios.</p>'; };
                    draw();
                    host.addEventListener('input', event => { dirty = true; const input = event.target as HTMLInputElement; if (input.dataset.recipientEmail)
                        recipients[Number(input.dataset.recipientEmail)].email = input.value; if (input.dataset.recipientEvent) {
                        const row = recipients[Number(input.dataset.recipientEvent)];
                        row.events = input.checked ? [...row.events, input.value] : row.events.filter(key => key !== input.value);
                    } });
                    host.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove-recipient]'); if (button) {
                        recipients.splice(Number(button.dataset.removeRecipient), 1);
                        dirty = true;
                        draw();
                    } });
                    host.querySelector('[data-add-recipient]')!.addEventListener('click', () => { if (recipients.length < 20) {
                        recipients.push({ email: '', events: ['NEW_ORDER'] });
                        dirty = true;
                        draw();
                    } });
                    host.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); void run(async () => { await api.businessWorkspace(storeId, '/staff', 'PUT', { revision: state.revision, enabled: (host.querySelector('[name=enabled]') as HTMLInputElement).checked, recipients }); dirty = false; }, reload); });
                }
                else if (tab === 'domain') {
                    host.innerHTML = `<section class="domain-layout"><div>${icon('link')}<h2>Envía desde tu dominio</h2><p>Usa un remitente reconocible, como notificaciones@tutienda.com.</p><p>Conecta tu dominio y verifica sus registros DNS para poder usarlo como remitente.</p>${!state.emailConfigured ? '<p class="business-note">El proveedor de correo aún no está configurado. La conexión estará disponible cuando el servicio de envíos esté listo.</p>' : ''}</div><div>${state.domain ? `<h3>${esc(state.domain.senderName)}</h3><p>notificaciones@${esc(state.domain.name)}</p><span class="business-badge ${state.domain.status === 'verified' ? 'is-ready' : ''}">${esc(state.domain.status)}</span><div class="business-table-scroll"><table><thead><tr><th>Tipo</th><th>Nombre</th><th>Valor</th><th>TTL</th><th>Prioridad</th><th>Estado</th></tr></thead><tbody>${state.domain.records.map((record: any) => `<tr><td>${esc(record.type)}</td><td>${esc(record.name)}</td><td><code>${esc(record.value)}</code></td><td>${esc(record.ttl || 'Auto')}</td><td>${esc(record.priority ?? '—')}</td><td>${esc(record.status)}</td></tr>`).join('')}</tbody></table></div><button type="button" data-domain-verify ${!state.emailConfigured ? 'disabled' : ''}>Verificar registros DNS</button>` : `<form data-domain-form class="business-edit"><label>Dominio<input name="name" placeholder="tutienda.com" required maxlength="253" pattern="[a-z0-9.-]+\\.[a-z]{2,}"></label><label>Nombre del remitente<input name="senderName" value="${esc(state.storeName)}" required maxlength="80"></label><button class="business-primary" type="submit" ${!state.emailConfigured ? 'disabled' : ''}>Conectar dominio</button></form>`}</div></section>`;
                    host.querySelector('form')?.addEventListener('input', () => { dirty = true; });
                    host.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target as HTMLFormElement)); void run(async () => { await api.businessWorkspace(storeId, '/domain', 'POST', { ...data, name: String(data.name).trim().toLowerCase(), senderName: String(data.senderName).trim(), revision: state.revision }); dirty = false; }, reload); });
                    host.querySelector('[data-domain-verify]')?.addEventListener('click', () => void run(async () => { await api.businessWorkspace(storeId, '/domain/verify', 'POST', { revision: state.revision }); }, reload));
                }
                else if (tab === 'logs') {
                    const rows = state.logs.items;
                    host.innerHTML = `<div class="business-heading"><h2>Historial de envíos</h2><button type="button" data-reload-logs>Actualizar</button></div><div class="business-table-scroll"><table><thead><tr><th>Fecha</th><th>Destinatario</th><th>Asunto</th><th>Estado</th><th>Intentos</th></tr></thead><tbody>${rows.map((row: any) => `<tr><td>${esc(new Date(row.createdAt).toLocaleString('es-BO'))}</td><td>${esc(row.email)}</td><td>${esc(row.subject)}${row.lastError ? `<small>${esc(row.lastError)}</small>` : ''}</td><td>${esc(({ PENDING: 'En cola', SENDING: 'Enviando', SENT: 'Aceptado por el proveedor', FAILED: 'Fallido', CANCELED: 'Cancelado' } as any)[row.status] || row.status)}</td><td>${row.attempts}</td></tr>`).join('')}</tbody></table></div>${!rows.length ? '<p class="business-empty">Los correos de esta tienda aparecerán aquí cuando se preparen sus primeros envíos.</p>' : ''}${state.logs.nextBefore ? '<button type="button" data-more-logs>Cargar más</button>' : ''}`;
                    host.querySelector('[data-reload-logs]')!.addEventListener('click', () => void run(async () => { }, reload));
                    host.querySelector('[data-more-logs]')?.addEventListener('click', () => void run(async () => { const next = await api.businessWorkspace(storeId, `/logs?before=${encodeURIComponent(state.logs.nextBefore)}`); state.logs = { items: [...rows, ...next.items], nextBefore: next.nextBefore }; }, renderMail));
                }
            }
            renderMail();
            return;
        }
        if (kind === 'integrations') {
            const [retention, source] = await Promise.all([api.retention(storeId), api.sourceState(storeId)]);
            let connections = await api.integrationConnections(storeId), search = '', category = '', installed = false, issued: any = null, connectionDraft = { name: '', kind: 'CUSTOM_DATABASE' };
            type Integration = { id: string; name: string; category: string; description: string; connected?: boolean; icon?: string; logo?: string; url?: string; guide?: string; setup?: string; view?: string; open?: () => unknown; action?: () => Promise<void> };
            let selectedIntegration: Integration | undefined;
            const catalog: Integration[] = [
                ...externalIntegrations,
                { id: 'contact', name: 'Formulario de contacto', category: 'Atención al cliente', icon: 'mail', description: 'Recibe consultas desde tu tienda.', connected: Boolean(source.publication?.contactFormEnabled), action: async () => { await api.setSourceContactForm(storeId, source.revision, !source.publication?.contactFormEnabled); Object.assign(source, await api.sourceState(storeId)); } },
                { id: 'comeback', name: 'Tarjeta Comeback', category: 'Marketing', icon: 'gift', description: 'Recompensa a los clientes que vuelven a comprar.', connected: retention.settings.comebackEnabled, view: 'marketing' },
                { id: 'email', name: 'Correos y campañas', category: 'Marketing', icon: 'mail', description: 'Bienvenida, recuperación de carritos y campañas.', connected: retention.emailConfigured, view: 'marketing' },
                { id: 'reviews', name: 'Reseñas de productos', category: 'Atención al cliente', icon: 'star', description: 'Modera reseñas de compras verificadas.', open: () => openCommerceContent(api, storeId) },
                { id: 'shipping', name: 'Envíos y retiro', category: 'Envíos', icon: 'box', description: 'Zonas, métodos de envío y retiro en tienda.', open: () => openShippingSettings(api, storeId) },
                { id: 'gift', name: 'Tarjetas de regalo y saldos', category: 'Ventas', icon: 'gift', description: 'Emite y administra códigos de saldo de tu tienda.', open: () => openCommercePlatform(api, storeId, 'credits') },
                { id: 'digital', name: 'Archivos digitales', category: 'Ventas', icon: 'box', description: 'Entrega descargas a quienes completan su compra.', open: () => openCommercePlatform(api, storeId, 'digital') },
                { id: 'brand', name: 'Identidad de marca', category: 'Diseño', icon: 'palette', description: 'Tu logo, colores y datos de marca en un solo lugar.', open: () => openBrandProfile(api, storeId) },
                { id: 'redirects', name: 'Redirecciones y artículos', category: 'Diseño', icon: 'link', description: 'Conserva las direcciones de tus artículos y su contenido.', open: () => openCommercePlatform(api, storeId, 'redirects') },
            ];
            function drawIntegrations() {
                const filtered = catalog.filter(item => (!category || item.category === category) && (!installed || item.connected) && `${item.name} ${item.description}`.toLocaleLowerCase().includes(search));
                app.innerHTML = `<header class="business-heading"><div><h2>Herramientas para hacer crecer tu tienda</h2><p>Publicidad, analítica y funciones de PagosYa en un solo lugar.</p></div></header>${selectedIntegration ? `<section class="business-edit integration-detail" aria-label="${esc(selectedIntegration.name)}"><header><span class="integration-logo"><img src="${import.meta.env.BASE_URL}integrations/${selectedIntegration.logo}.svg" alt="${esc(selectedIntegration.name)}" width="32" height="32"></span><div><h2>${esc(selectedIntegration.name)}</h2><p>Servicio externo · Sin conectar a esta tienda</p></div><button type="button" data-close-integration aria-label="Cerrar detalles">Cerrar</button></header><p>${esc(selectedIntegration.setup || '')}</p><p class="business-help">Este acceso abre la plataforma oficial. La conexión de cuentas y la instalación de etiquetas todavía no están disponibles desde PagosYa.</p><div class="business-actions"><a class="integration-link" href="${esc(selectedIntegration.url || '')}" target="_blank" rel="noopener noreferrer">Abrir ${esc(selectedIntegration.name)} ↗</a><a class="integration-link" href="${esc(selectedIntegration.guide || '')}" target="_blank" rel="noopener noreferrer">Ver guía oficial ↗</a></div></section>` : ''}<div class="integration-tools"><label>Buscar integraciones<input type="search" data-search-integration value="${esc(search)}" placeholder="Nombre o descripción"></label><label>Categoría<select data-integration-category><option value="">Todas</option>${[...new Set(catalog.map(item => item.category))].map(value => `<option ${category === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="business-switch"><input type="checkbox" data-only-connected ${installed ? 'checked' : ''}>Configuradas</label></div><p data-business-status role="status">${esc(message)}</p><div class="integrations-grid">${filtered.map(item => `<article class="integration-card"><header>${`<span class="integration-logo ${item.logo ? '' : 'is-pagosya'}"><img src="${import.meta.env.BASE_URL}${item.logo ? `integrations/${item.logo}.svg` : 'logo-mark.png'}" alt="${item.logo ? esc(item.name) : 'PagosYa'}" width="32" height="32" loading="lazy"></span>`}<span class="business-badge ${item.connected ? 'is-ready' : ''}">${item.url ? 'Externa' : item.connected ? 'Configurada' : 'Incluida'}</span></header><h2>${esc(item.name)}</h2><small>${esc(item.category)} · ${item.url ? 'Servicio externo' : 'Por PagosYa'}</small><p>${esc(item.description)}</p><button type="button" data-open-integration="${item.id}">${item.url ? 'Ver conexión' : item.id === 'contact' ? item.connected ? 'Desactivar' : 'Activar' : 'Configurar'} ↗</button></article>`).join('') || '<p class="business-empty">No hay integraciones para este filtro.</p>'}</div><section class="business-edit"><h2>Conexiones de inventario</h2><p>Conecta tu sistema mediante la API de sincronización. Una conexión se muestra como sincronizada después de recibir datos.</p>${connections.map(item => `<article class="connection-row"><div><strong>${esc(item.name)}</strong><small>${esc(item.kind)} · ${item.lastSyncAt ? `Última sincronización: ${esc(new Date(item.lastSyncAt).toLocaleString('es-BO'))}` : 'Pendiente de la primera sincronización'}</small></div><span class="business-badge ${item.lastSyncAt ? 'is-ready' : ''}">${item.lastSyncAt ? 'Sincronizada' : 'Creada'}</span></article>`).join('') || '<p>Aún no tienes conexiones.</p>'}<form data-connection-form><div class="business-fields"><label>Nombre<input name="name" maxlength="80" required value="${esc(connectionDraft.name)}" placeholder="Inventario de mi tienda"></label><label>Sistema<select name="kind"><option value="CUSTOM_DATABASE">Base de datos propia</option><option value="SHOPIFY">Shopify mediante API</option><option value="WOOCOMMERCE">WooCommerce mediante API</option><option value="POS">Punto de venta</option><option value="ACCOUNTING">Contabilidad</option><option value="OTHER">Otro sistema</option></select></label></div><button class="business-primary" type="submit">Crear conexión</button></form>${issued ? `<section class="business-note"><strong>Conexión creada</strong><p>Guarda esta clave. Solo se muestra ahora.</p><label>ID<input readonly value="${esc(issued.id)}"></label><label>Clave de sincronización<input readonly value="${esc(issued.secret)}"></label></section>` : ''}</section>`;
                app.querySelector('[data-close-integration]')?.addEventListener('click', () => { const id = selectedIntegration?.id; selectedIntegration = undefined; drawIntegrations(); const trigger = app.querySelector<HTMLElement>(`[data-open-integration="${id}"]`); trigger?.scrollIntoView({ block: 'center' }); trigger?.focus({ preventScroll: true }); });
                const searchEl = app.querySelector<HTMLInputElement>('[data-search-integration]')!;
                searchEl.addEventListener('input', () => { const position = searchEl.selectionStart; search = searchEl.value.toLocaleLowerCase(); drawIntegrations(); const input = app.querySelector<HTMLInputElement>('[data-search-integration]')!; input.focus(); input.setSelectionRange(position, position); });
                app.querySelector('[data-integration-category]')!.addEventListener('change', event => { category = (event.target as HTMLSelectElement).value; drawIntegrations(); });
                app.querySelector('[data-only-connected]')!.addEventListener('change', event => { installed = (event.target as HTMLInputElement).checked; drawIntegrations(); });
                app.querySelectorAll<HTMLButtonElement>('[data-open-integration]').forEach(button => button.onclick = () => { const item = catalog.find(item => item.id === button.dataset.openIntegration)!; if (item.url) { selectedIntegration = item; drawIntegrations(); app.querySelector('.integration-detail')?.scrollIntoView({ block: 'center' }); app.querySelector<HTMLElement>('[data-close-integration]')?.focus({ preventScroll: true }); } else if (item.view)
                    send({ type: 'pagosya:workspace', view: item.view, tab: item.id === 'comeback' ? 'program' : 'templates' });
                else if (item.open)
                    void item.open();
                else if (item.action)
                    void run(item.action, () => { item.connected = Boolean(source.publication?.contactFormEnabled); drawIntegrations(); }); });
                const form = app.querySelector<HTMLFormElement>('[data-connection-form]')!;
                form.elements.namedItem('kind') && ((form.elements.namedItem('kind') as HTMLSelectElement).value = connectionDraft.kind);
                form.addEventListener('input', () => { dirty = true; const data = new FormData(form); connectionDraft = { name: String(data.get('name')), kind: String(data.get('kind')) }; });
                form.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(form); void run(async () => { issued = await api.createIntegrationConnection(storeId, { kind: String(data.get('kind')), name: String(data.get('name')) }); connections = await api.integrationConnections(storeId); connectionDraft = { name: '', kind: 'CUSTOM_DATABASE' }; dirty = false; }, drawIntegrations); });
            }
            recoverConflict = async () => { Object.assign(source, await api.sourceState(storeId)); catalog.find(item => item.id === 'contact')!.connected = Boolean(source.publication?.contactFormEnabled); drawIntegrations(); };
            drawIntegrations();
            return;
        }
        if (kind === 'experiments') {
            let state: SourceState = await api.sourceState(storeId), candidate = state.revision, olderBusy = false;
            const draft = { instruction: 'Mejora la claridad de compra conservando la identidad de la marca.', model: 'auto', maxCredits: '50' };
            async function load() { state = await api.sourceState(storeId); drawExperiments(); }
            const preview = (revision: number | null | undefined, label: string) => revision ? `<div class="experiment-preview"><iframe title="${label}" src="/studio/?thumbnail=1&embedded=1&store=${encodeURIComponent(storeId)}&revision=${revision}" loading="lazy" tabindex="-1"></iframe></div>` : '<div class="experiment-empty">Tu diseño aparecerá aquí.</div>';
            function drawExperiments() {
                const publication = state.publication, experiment = publication?.experiment, running = experiment?.status === 'RUNNING', published = publication?.revision;
                const a = running ? experiment.variants.find(row => row.variant === 'A')?.revision : published, b = running ? experiment.variants.find(row => row.variant === 'B')?.revision : candidate;
                app.innerHTML = `<header class="business-heading"><div><span class="business-eyebrow">DOS DISEÑOS, UNA TIENDA</span><h2>Deja que las compras te orienten.</h2><p>Compara diseños con los mismos productos, precios e inventario.</p></div><span class="business-badge ${running ? 'is-ready' : ''}">${running ? 'Prueba en curso' : experiment ? 'Prueba finalizada' : 'Lista para preparar'}</span></header><p data-business-status role="status">${esc(message)}</p><div class="experiment-designs"><article><header><strong>A · Diseño publicado</strong><span>${running ? '50% de las visitas' : 'Diseño actual'}</span></header>${preview(a, 'Diseño A')}</article><article><header><strong>B · Alternativa</strong><span>${running ? '50% de las visitas' : 'Cambios para comparar'}</span></header>${preview(b, 'Diseño B')}</article></div>${!published ? '<p class="business-note">Publica el primer diseño de tu tienda para empezar a comparar alternativas.</p>' : ''}${!running ? `<section class="experiment-setup"><div class="business-edit"><h3>1. Prepara una alternativa con YAPI</h3><form data-alternative><label>Qué quieres mejorar<textarea name="instruction" rows="3" maxlength="2000" required>${esc(draft.instruction)}</textarea></label><div class="business-fields"><label>Modelo<select name="model"><option value="auto">Auto · OpenAI</option><option value="gpt-5.6-luna">Luna</option><option value="gpt-5.6-terra">Terra</option><option value="gpt-5.6-sol">Sol</option></select></label><label>Límite de créditos<input name="maxCredits" type="number" min="1" max="500" value="${esc(draft.maxCredits)}" required></label></div><p class="business-help">Crear una alternativa usa créditos. El resultado se guarda como borrador para que lo revises.</p><button class="business-primary" type="submit" ${!published ? 'disabled' : ''}>Crear alternativa con YAPI</button></form></div><div class="business-edit"><h3>2. Elige qué diseño probar</h3><label>Diseño B<select data-experiment-candidate>${state.versions.map(row => `<option value="${row.revision}" ${candidate === row.revision ? 'selected' : ''}>${esc(row.label)} · revisión ${row.revision}${row.revision === published ? ' · publicada' : ''}</option>`).join('')}</select></label>${state.nextBefore ? '<button type="button" data-older-versions>Cargar diseños anteriores</button>' : ''}<p>Revisa ambas vistas. Al iniciar, cada visitante nuevo verá A o B durante la prueba.</p><button class="business-primary" data-start-experiment ${!published || !candidate || candidate === published || publication?.active === false ? 'disabled' : ''}>Comprobar e iniciar prueba</button></div></section>` : ''}${experiment ? `<section class="experiment-results"><header class="business-heading"><h2>Resultados de compras reales</h2><button data-refresh-experiment>Actualizar resultados</button></header><div class="business-table-scroll"><table><thead><tr><th>Versión</th><th>Visitantes</th><th>Compradores</th><th>Conversión</th><th>Ventas netas</th></tr></thead><tbody>${experiment.variants.map(row => `<tr><th>${row.variant}</th><td>${row.visitors}</td><td>${row.buyers}</td><td>${(row.conversionRate * 100).toFixed(1)}%</td><td>${row.revenue.map(value => esc(money(value.amount, value.currency))).join(' · ') || 'Sin ventas'}</td></tr>`).join('')}</tbody></table></div><p>${esc(experiment.evidence.reason)}</p>${running ? `<div class="business-actions"><button class="business-primary" data-apply-winner ${!experiment.evidence.winner ? 'disabled' : ''}>Aplicar ganador${experiment.evidence.winner ? ' ' + esc(experiment.evidence.winner) : ''}</button><button data-stop-experiment>Detener y conservar A</button></div>` : ''}</section>` : ''}<p class="business-help">Se necesitan al menos 7 días y suficientes compras para identificar un ganador. Las visitas del editor y los pagos de prueba no cuentan. Aplicar el ganador conserva el catálogo y cambia el diseño que ven los visitantes.</p>`;
                app.querySelector('[data-experiment-candidate]')?.addEventListener('change', event => { candidate = Number((event.target as HTMLSelectElement).value); drawExperiments(); });
                app.querySelector('[data-older-versions]')?.addEventListener('click', () => { if (olderBusy || !state.nextBefore)
                    return; olderBusy = true; void run(async () => { const next = await api.sourceState(storeId, state.nextBefore!); state.versions.push(...next.versions); state.nextBefore = next.nextBefore; }, drawExperiments).finally(() => { olderBusy = false; }); });
                const alternative = app.querySelector<HTMLFormElement>('[data-alternative]');
                if (alternative) {
                    (alternative.elements.namedItem('model') as HTMLSelectElement).value = draft.model;
                    alternative.addEventListener('input', () => { dirty = true; const values = new FormData(alternative); draft.instruction = String(values.get('instruction')); draft.model = String(values.get('model')); draft.maxCredits = String(values.get('maxCredits')); });
                }
                app.querySelector('[data-alternative]')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.target as HTMLFormElement); void run(async () => { message = 'YAPI está preparando la alternativa…'; status(); const saved = await api.sourceAlternative(storeId, { revision: state.revision, instruction: String(data.get('instruction')), model: String(data.get('model')) as SourceGenerationSettings['model'], maxCredits: Number(data.get('maxCredits')) }); candidate = saved.revision; dirty = false; }, load); });
                app.querySelector('[data-start-experiment]')?.addEventListener('click', () => void run(async () => { message = 'Comprobando el diseño antes de iniciar…'; status(); const version = await api.sourceVersion(storeId, candidate), checks = await checkSourceWebsite(version.snapshot); if (sourceChecksBlockPublishing(checks))
                    throw Error('El diseño tiene comprobaciones pendientes. Corrígelo en Diseñar sitio antes de iniciar la prueba.'); await api.startSourceTest(storeId, candidate, publication?.version || 0); send({ type: 'pagosya:source-publication-changed' }); }, load));
                app.querySelector('[data-refresh-experiment]')?.addEventListener('click', () => void run(async () => { }, load));
                const finish = (apply: boolean) => { if (!experiment)
                    return; void run(async () => { await api.finishSourceTest(storeId, experiment.id, publication!.version, apply); send({ type: 'pagosya:source-publication-changed' }); }, load); };
                app.querySelector('[data-apply-winner]')?.addEventListener('click', () => finish(true));
                app.querySelector('[data-stop-experiment]')?.addEventListener('click', () => finish(false));
            }
            recoverConflict = load;
            drawExperiments();
            return;
        }
    }
    catch (error) {
        app.innerHTML = `<p role="alert">${esc(error instanceof Error ? error.message : 'No se pudo abrir esta sección.')}</p><button type="button" data-business-retry>Volver a intentar</button>`;
        app.querySelector('button')!.onclick = () => { observer.disconnect(); void mountBusinessWorkspace(app); };
    }
}
