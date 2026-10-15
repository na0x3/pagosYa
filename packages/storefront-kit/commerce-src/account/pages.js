  // The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.
  const ACCOUNT_GATE_PATHS = { login: '', register: '/registro', 'forgot-password': '/recuperar', 'reset-password': '/recuperar', orders: '/pedidos', addresses: '/direcciones', profile: '/perfil', subscriptions: '/suscripciones' };
  function renderAccountGateLinks() {
    const base = accountEntry();
    // Account access is a platform baseline even when an authored shell omits it.
    // Existing local account navigation and the information slot remain authoritative.
    if (base && !SHOWCASE && !document.querySelector('[data-pagosya-pages],a[data-pagosya-account],a[href="acceso-ingresar.html"],a[href="cuenta-perfil.html"]')) {
      const nav = document.createElement('nav');
      nav.className = 'pagosya-info-nav';
      nav.setAttribute('aria-label', 'Cuenta de cliente');
      const access = document.createElement('a');
      access.href = base; access.textContent = 'Mi cuenta';
      access.setAttribute('data-pagosya-account', '');
      nav.append(access);
      (document.querySelector('footer') || document.body).append(nav);
    }
    document.querySelectorAll('a[data-pagosya-account]').forEach(link => {
      const view = link.getAttribute('data-pagosya-account');
      if (!view) return;
      if (accountBridge && ACCOUNT_PAGES[view]) { link.setAttribute('href', ACCOUNT_PAGES[view]); link.removeAttribute('aria-disabled'); return; }
      if (base && Object.prototype.hasOwnProperty.call(ACCOUNT_GATE_PATHS, view)) { link.setAttribute('href', base + ACCOUNT_GATE_PATHS[view]); link.removeAttribute('aria-disabled'); return; }
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.textContent = 'Cuenta no disponible';
    });
  }
  // ---- Shopper account (spec 2026-10-08-store-built-in-account-pages): drawn here and styled by the store; the trusted
  // parent keeps the session and calls the API. Without a parent (an exported static site) the gate keeps its link.
  const ACCOUNT_PAGES = { login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html', 'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html', profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html' };
  const ACCOUNT_LAYOUTS = ['card', 'split', 'minimal', 'panel'];
  const SIGNED_IN_VIEWS = ['orders', 'addresses', 'profile', 'subscriptions'];
  const accountBridge = typeof window.PAGOSYA_ACCOUNT_REQUEST === 'function' ? window.PAGOSYA_ACCOUNT_REQUEST : null;
  const accountEntry = () => accountBridge ? ACCOUNT_PAGES.login : accountUrl();
  const accountAsk = async (action, body = {}) => { try { return await accountBridge(action, body); } catch { return { ok: false, body: { message: 'No pudimos conectar. Inténtalo de nuevo.' } }; } };
  const accountTheme = () => { const theme = config.accountTheme && typeof config.accountTheme === 'object' ? config.accountTheme : {}; return { layout: ACCOUNT_LAYOUTS.includes(theme.layout) ? theme.layout : 'card', photo: typeof theme.photo === 'string' ? theme.photo : '', css: typeof theme.css === 'string' ? theme.css : '' }; };
  const accountGo = page => { const link = document.createElement('a'); link.href = page; link.hidden = true; document.body.append(link); link.click(); link.remove(); };
  const accountInput = (name, label, type, autocomplete, value = '') => `<label data-part="field"><span data-part="label">${escape(label)}</span><input data-part="input" name="${name}" type="${type}" autocomplete="${autocomplete}" value="${escape(value)}" ${type === 'tel' ? '' : 'required'}></label>`;
  const ACCOUNT_FORMS = {
    login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y compra más rápido.', fields: [['email', 'Correo', 'email', 'email'], ['password', 'Contraseña', 'password', 'current-password']], submit: 'Ingresar', action: 'login', links: [['register', '¿No tienes cuenta? Crea una'], ['forgot-password', '¿Olvidaste tu contraseña?']] },
    register: { title: 'Crea tu cuenta', lead: 'Sigue tus pedidos y guarda tus direcciones.', fields: [['name', 'Nombre', 'text', 'name'], ['email', 'Correo', 'email', 'email'], ['password', 'Contraseña (8 caracteres o más)', 'password', 'new-password']], submit: 'Crear cuenta', action: 'register', links: [['login', 'Ya tengo una cuenta']] },
    'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace para elegir una nueva.', fields: [['email', 'Correo', 'email', 'email']], submit: 'Enviar enlace', action: 'forgot', links: [['login', 'Volver a ingresar']] },
    'reset-password': { title: 'Elige una contraseña nueva', lead: 'Usa 8 caracteres o más.', fields: [['password', 'Contraseña nueva', 'password', 'new-password']], submit: 'Guardar contraseña', action: 'reset', links: [['login', 'Volver a ingresar']] },
  };
  const ACCOUNT_ORDER_STATUS = { AWAITING_PAYMENT: 'Esperando pago', PAID: 'Pagado', PREPARING: 'Preparando', READY_FOR_PICKUP: 'Listo para retirar', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELED: 'Cancelado', REFUNDED: 'Reembolsado' };
  const ACCOUNT_SUBSCRIPTION_STATUS = { ACTIVE: 'Activa', PAUSED: 'Pausada', CANCELED: 'Cancelada' };
  const ACCOUNT_CADENCE = { WEEKLY: 'cada semana', BIWEEKLY: 'cada dos semanas', MONTHLY: 'cada mes' };
  const accountDay = iso => { try { return iso ? new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { return ''; } };
  // Unlayered on purpose: the store's own generic rules (h1, input) must not undo the form; YAPI's theme comes after and wins.
  const ACCOUNT_CSS = `
[data-account-gate] [data-part=account]{--acc-bg:var(--account-background,var(--ui-paper,#fff));--acc-ink:var(--account-foreground,var(--ui-ink,#111));--acc-accent:var(--account-accent,var(--ui-accent,#111));--acc-radius:var(--account-radius,var(--ui-radius-control,10px));display:grid;gap:var(--ui-s5,24px);color:var(--acc-ink)}
[data-account-gate] [data-part=card]{display:grid;gap:var(--ui-s3,12px)}
[data-account-gate] [data-layout=card] [data-part=card]{width:100%;max-width:440px;margin-inline:auto;box-sizing:border-box;padding:clamp(24px,4vw,40px);background:var(--ui-surface,var(--acc-bg));border:1px solid var(--ui-line,#0002);border-radius:calc(var(--acc-radius) * 1.6)}
[data-account-gate] [data-layout=split]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}
[data-account-gate] [data-layout=split] [data-part=media]{margin:0}
[data-account-gate] [data-layout=split] [data-part=media] img{display:block;width:100%;height:100%;min-height:320px;object-fit:cover;border-radius:var(--ui-radius-media,12px)}
[data-account-gate] [data-layout=minimal] [data-part=card]{max-width:560px}
[data-account-gate] [data-layout=panel]{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
[data-account-gate] [data-part=title]{margin:0;font-family:var(--ui-display-font,var(--store-heading-font,inherit));font-size:clamp(28px,3vw,40px);line-height:1.1}
[data-account-gate] [data-part=lead]{margin:0;opacity:.8}
[data-account-gate] [data-part=form]{display:grid;gap:var(--ui-s4,16px)}
[data-account-gate] [data-part=field]{display:grid;gap:6px}
[data-account-gate] [data-part=label]{font-size:.85em;font-weight:600}
[data-account-gate] [data-part=input]{box-sizing:border-box;width:100%;min-height:48px;padding:0 14px;border:1px solid var(--ui-line,#0003);border-radius:var(--acc-radius);background:var(--acc-bg);color:var(--acc-ink);font:inherit}
[data-account-gate] [data-part=submit]{min-height:48px;font:inherit;font-weight:700;cursor:pointer}
:root:not([data-dna-fields]) [data-account-gate] [data-part=submit]{background:var(--acc-accent);color:var(--ui-on-accent,#fff);border-radius:var(--acc-radius);border:0}
[data-account-gate] [data-part=link]{color:inherit;text-decoration:underline;text-underline-offset:3px;background:none;border:0;padding:0;font:inherit;cursor:pointer;justify-self:start}
[data-account-gate] [data-part=error]:empty{display:none}
[data-account-gate] [data-part=error]{margin:0;color:#b42318;font-weight:600}
[data-account-gate] [data-part=notice]{margin:0;padding:10px 12px;border-radius:var(--acc-radius);background:color-mix(in srgb,var(--acc-accent) 10%,transparent)}
[data-account-gate] [data-part=nav]{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
[data-account-gate] [data-part=nav-item][aria-current=page]{font-weight:700;text-decoration:underline}
[data-account-gate] [data-part=list]{display:grid;gap:12px;margin:0;padding:0;list-style:none}
[data-account-gate] :is([data-part=order],[data-part=address]){display:grid;gap:4px;padding:14px 16px;border:1px solid var(--ui-line,#0002);border-radius:var(--acc-radius)}
[data-account-gate] [data-part=danger]{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--ui-line,#0002)}
@media (max-width:720px){[data-account-gate] :is([data-layout=split],[data-layout=panel]){grid-template-columns:1fr}[data-account-gate] [data-layout=split] [data-part=media] img{min-height:0;max-height:220px}}
`;
  function accountFrame(slot, inner) {
    const { layout, photo } = accountTheme();
    const media = layout === 'split' && photo ? `<figure data-part="media"><img src="${escape(photo)}" alt=""></figure>` : '';
    slot.innerHTML = `<section data-part="account" data-layout="${layout}">${media}<div data-part="card">${preview ? '<p data-part="notice">Vista previa · No se crean cuentas</p>' : ''}${inner}</div></section>`;
  }
  // A submitted form keeps what the shopper typed and shows the API's message in its error part.
  function accountSubmit(form, action, done) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const error = form.querySelector('[data-part=error]'); if (error) error.textContent = '';
      const button = form.querySelector('[data-part=submit]'); if (button) button.disabled = true;
      const result = await accountAsk(action, Object.fromEntries(new FormData(form)));
      if (button) button.disabled = false;
      if (!result.ok) { if (error) error.textContent = result.body?.message || 'No pudimos completar la operación.'; return; }
      done(result);
    });
  }
  function accountForm(slot, view, { notice = '', after = '' } = {}) {
    const form = ACCOUNT_FORMS[view];
    accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="lead">${escape(form.lead)}</p>${notice ? `<p data-part="notice">${escape(notice)}</p>` : ''}<form data-part="form" novalidate>${form.fields.map(field => accountInput(...field)).join('')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">${escape(form.submit)}</button></form>${form.links.map(([target, label]) => `<a data-part="link" href="${ACCOUNT_PAGES[target]}">${escape(label)}</a>`).join('')}`);
    accountSubmit(slot.querySelector('form'), form.action, result => {
      if (form.action === 'login') accountGo(after || ACCOUNT_PAGES.orders);
      else if (form.action === 'reset') accountForm(slot, 'login', { notice: 'Tu contraseña quedó guardada. Ya puedes ingresar.' });
      else accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="notice">${escape(result.body?.message || 'Listo. Revisa tu correo.')}</p><a data-part="link" href="${ACCOUNT_PAGES.login}">Ir a ingresar</a>`);
    });
  }
  const ACCOUNT_NAV = [['orders', 'Pedidos'], ['subscriptions', 'Suscripciones'], ['addresses', 'Direcciones'], ['profile', 'Perfil']];
  const ACCOUNT_TITLES = { orders: 'Mis pedidos', subscriptions: 'Mis suscripciones', addresses: 'Mis direcciones', profile: 'Mi perfil' };
  const ADDRESS_FIELDS = [['label', 'Nombre de la dirección', 'text', 'off'], ['recipient', 'Quién recibe', 'text', 'name'], ['phone', 'Teléfono', 'tel', 'tel'], ['department', 'Departamento', 'text', 'address-level1'], ['city', 'Ciudad', 'text', 'address-level2'], ['street', 'Dirección', 'text', 'street-address'], ['references', 'Referencias', 'text', 'off']];
  function accountBody(view, data) {
    const list = Array.isArray(data) ? data : [];
    if (view === 'orders') return list.length ? `<ul data-part="list">${list.map(order => `<li data-part="order"><strong>Pedido del ${escape(accountDay(order.createdAt))}</strong><span data-part="order-status">${escape(ACCOUNT_ORDER_STATUS[order.status] || order.status || '')}</span><span>${escape(money(Number(order.amount) || 0, order.currency || 'BOB'))}</span><span data-part="hint">${escape((Array.isArray(order.items) ? order.items : []).map(item => `${item.quantity || 1} × ${item.name || ''}`).join(', '))}</span></li>`).join('')}</ul>` : '<p data-part="empty">Todavía no tienes pedidos.</p>';
    if (view === 'subscriptions') return list.length ? `<ul data-part="list">${list.map(item => `<li data-part="order"><strong>${escape(item.itemName || 'Suscripción')}</strong><span data-part="order-status">${escape(ACCOUNT_SUBSCRIPTION_STATUS[item.status] || item.status || '')}</span><span data-part="hint">${escape([item.quantity ? `${item.quantity} ×` : '', ACCOUNT_CADENCE[item.cadence] || '', item.nextBillingAt ? `próxima: ${accountDay(item.nextBillingAt)}` : ''].filter(Boolean).join(' '))}</span></li>`).join('')}</ul>` : '<p data-part="empty">No tienes suscripciones.</p>';
    if (view === 'addresses') {
      const addresses = Array.isArray(data?.addresses) ? data.addresses : [];
      return `${addresses.length ? `<ul data-part="list">${addresses.map((address, index) => `<li data-part="address"><strong>${escape(address.label || 'Dirección')}</strong><span>${escape([address.street, address.city, address.department].filter(Boolean).join(', '))}</span><span data-part="hint">${escape([address.recipient, address.phone].filter(Boolean).join(' · '))}</span><button data-part="link" type="button" data-account-remove="${index}">Quitar</button></li>`).join('')}</ul>` : '<p data-part="empty">Todavía no guardaste direcciones.</p>'}<form data-part="form" data-account-address novalidate><h2 data-part="lead">Agregar una dirección</h2>${ADDRESS_FIELDS.map(field => accountInput(...field)).join('')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">Guardar dirección</button></form>`;
    }
    const me = data && typeof data === 'object' ? data : {};
    return `<form data-part="form" data-account-profile novalidate>${accountInput('name', 'Nombre', 'text', 'name', me.name || '')}${accountInput('phone', 'Teléfono', 'tel', 'tel', me.phone || '')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">Guardar cambios</button></form><button data-part="link" type="button" data-account-export>Descargar mis datos</button><form data-part="danger" data-account-delete novalidate><strong>Eliminar mi cuenta</strong><span data-part="hint">Borra tus datos personales. Tus pedidos quedan con la tienda.</span>${accountInput('password', 'Tu contraseña', 'password', 'current-password')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="outline" type="submit">Eliminar mi cuenta</button></form>`;
  }
  async function accountSignedIn(slot, view, name) {
    const result = await accountAsk(view === 'profile' || view === 'addresses' ? 'me' : view);
    if (!result.ok && result.body?.status === 401) { accountForm(slot, 'login', { notice: 'Tu sesión terminó. Vuelve a ingresar.', after: ACCOUNT_PAGES[view] }); return; }
    const nav = `<nav data-part="nav" aria-label="Mi cuenta">${ACCOUNT_NAV.map(([key, label]) => `<a data-part="nav-item" href="${ACCOUNT_PAGES[key]}"${key === view ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}<button data-part="link" type="button" data-account-logout>Salir</button></nav>`;
    const body = result.ok ? accountBody(view, result.body) : `<p data-part="error" role="alert">${escape(result.body?.message || 'No pudimos cargar tu cuenta.')}</p>`;
    accountFrame(slot, `${nav}<h1 data-part="title">${escape(ACCOUNT_TITLES[view])}</h1>${name ? `<p data-part="lead">Hola, ${escape(name)}</p>` : ''}${body}`);
    slot.querySelector('[data-account-logout]')?.addEventListener('click', async () => { await accountAsk('logout'); accountGo(ACCOUNT_PAGES.login); });
    const profile = slot.querySelector('[data-account-profile]');
    if (profile) accountSubmit(profile, 'update-me', () => accountSignedIn(slot, view, name));
    slot.querySelector('[data-account-export]')?.addEventListener('click', () => void accountAsk('export'));
    const remove = slot.querySelector('[data-account-delete]');
    if (remove) accountSubmit(remove, 'delete', () => accountGo(ACCOUNT_PAGES.login));
    const saved = Array.isArray(result.body?.addresses) ? result.body.addresses : [];
    const address = slot.querySelector('[data-account-address]');
    if (address) address.addEventListener('submit', async event => {
      event.preventDefault();
      const entry = Object.fromEntries(new FormData(address));
      const outcome = await accountAsk('addresses', { addresses: [...saved, entry] });
      if (!outcome.ok) { address.querySelector('[data-part=error]').textContent = outcome.body?.message || 'No pudimos guardar la dirección.'; return; }
      accountSignedIn(slot, view, name);
    });
    slot.querySelectorAll('[data-account-remove]').forEach(button => button.addEventListener('click', async () => {
      const index = Number(button.getAttribute('data-account-remove'));
      await accountAsk('addresses', { addresses: saved.filter((_, at) => at !== index) });
      accountSignedIn(slot, view, name);
    }));
  }
  let accountDrawn = false;
  async function renderAccountViews() {
    const gates = [...document.querySelectorAll('[data-account-gate]')];
    if (!gates.length || accountDrawn) return;
    accountDrawn = true;
    const kit = document.createElement('style'); kit.dataset.pagosyaKit = 'account'; kit.textContent = ACCOUNT_CSS; document.head.append(kit);
    const theme = accountTheme();
    // Defence in depth: the API sanitized this CSS (account-theme.ts); this only refuses what the sanitizer never emits.
    if (theme.css && theme.css.length <= 8000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|!\s*important/i.test(theme.css)) {
      const style = document.createElement('style'); style.dataset.pagosyaKit = 'account-theme'; style.textContent = theme.css; document.head.append(style);
    }
    const state = await accountAsk('state');
    const signedIn = state.ok && state.body?.signedIn === true;
    for (const gate of gates) {
      const view = gate.getAttribute('data-account-gate');
      const slot = gate.querySelector('.ui-container') || gate;
      if (SIGNED_IN_VIEWS.includes(view)) { if (signedIn) await accountSignedIn(slot, view, state.body.name); else accountForm(slot, 'login', { after: ACCOUNT_PAGES[view] }); }
      else if (view === 'login' && signedIn && !preview) accountGo(ACCOUNT_PAGES.orders);
      else if (ACCOUNT_FORMS[view]) accountForm(slot, view, view === 'login' && state.body?.verified === true ? { notice: 'Tu correo quedó confirmado. Ya puedes ingresar.' } : view === 'login' && state.body?.verified === false ? { notice: 'El enlace de verificación no es válido o ya se usó.' } : {});
    }
  }
  function renderAccountGates() {
    renderAccountGateLinks();
    if (accountBridge) void renderAccountViews();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('[data-pagosya-account]');
    // Only the account app on the checkout origin is outside the store; the store's own account pages navigate as usual.
    if (link && hosted && /^https?:/i.test(link.getAttribute('href') || '')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:source-external', url: link.href }, '*'); }
  });
