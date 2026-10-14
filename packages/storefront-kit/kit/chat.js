(() => {
  'use strict';
  // Store assistant bubble (spec 2026-10-13-store-assistant-design). Light DOM on purpose: the kit's
  // document-level [data-add] and [data-cart-open] handlers must see these buttons.
  if (window.PAGOSYA_ASSISTANT) return;
  const config = window.PAGOSYA_CONFIG || {};
  const hosted = window.PAGOSYA_HOSTED === true;
  const studio = !hosted && (window.PAGOSYA_PREVIEW === true || config.demo === true);
  const storageKey = 'pagosya:assistant:' + (config.slug || 'store');
  let settings = null, store = null, root = null, conversationId = null, busy = false, added = false, lastMessage = '', hintTimer = 0;

  const read = () => { try { return sessionStorage.getItem(storageKey); } catch (e) { return null; } };
  const write = value => { try { sessionStorage.setItem(storageKey, value); } catch (e) { /* sandboxed frames have no storage */ } };
  const h = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const button = (className, text, attrs) => { const el = h('button', className, text); el.type = 'button'; Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k])); return el; };
  const apiBase = () => String(config.apiBaseUrl || '').replace(/\/$/, '');
  const asset = path => {
    if (!path) return null;
    const match = String(path).match(/\/v1\/uploads\/([A-Za-z0-9._-]+)$/);
    return match ? apiBase() + '/uploads/' + match[1] : null;
  };
  const pageName = () => window.PAGOSYA_PREVIEW_PAGE || location.pathname.split('/').pop() || 'index.html';
  const currentProduct = () => { const detail = {}; document.dispatchEvent(new CustomEvent('pagosya:current-product', { detail })); return detail.id ? detail : null; };
  const cartCount = () => { const detail = {}; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail })); return Array.isArray(detail.items) ? detail.items.length : 0; };
  const whatsappUrl = summary => {
    const digits = String((store && store.contactPhone) || '').replace(/\D/g, '');
    return digits ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.' + (summary ? ' ' + summary : '')) : null;
  };
  // A reply may only point at the store's own WhatsApp number.
  const ownWhatsapp = url => {
    const own = String((store && store.contactPhone) || '').replace(/\D/g, '');
    const match = typeof url === 'string' ? url.match(/^https:\/\/wa\.me\/(\d+)(\?|$)/) : null;
    return match && own && match[1] === own ? url : null;
  };
  const openExternal = url => { if (hosted) parent.postMessage({ type: 'pagosya:source-external', url: url }, '*'); else window.open(url, '_blank', 'noopener'); };

  const CSS = '@layer pagosya-assistant-base{'
    + '[data-pagosya-assistant]{position:fixed;right:24px;bottom:calc(24px + var(--pya-lift,0px));z-index:1000;color:var(--kit-ink,var(--ink,#20211d));font-family:var(--store-body-font,var(--brand-body-font,inherit))}'
    + '.pya-launcher{width:56px;height:56px;border-radius:999px;border:0;padding:0;overflow:hidden;display:grid;place-items:center;cursor:pointer;background:var(--kit-accent,var(--accent,#20211d));color:var(--kit-on-accent,var(--paper,#fff));box-shadow:0 8px 24px rgba(0,0,0,.18)}'
    + '.pya-launcher img,.pya-avatar{width:100%;height:100%;object-fit:cover}'
    + '.pya-hint{position:absolute;right:64px;bottom:12px;margin:0;white-space:nowrap;padding:8px 12px;border-radius:999px;font-size:14px;background:var(--kit-paper,var(--paper,#fff));border:1px solid var(--kit-line,rgba(0,0,0,.12));box-shadow:0 4px 14px rgba(0,0,0,.1)}'
    + '.pya-panel{position:absolute;right:0;bottom:68px;width:380px;height:min(600px,calc(100vh - 120px));display:flex;flex-direction:column;overflow:hidden;background:var(--kit-paper,var(--paper,#fff));border:1px solid var(--kit-line,rgba(0,0,0,.12));border-radius:var(--kit-radius-panel,16px);box-shadow:0 18px 48px rgba(0,0,0,.2)}'
    + '.pya-panel[hidden],.pya-hint[hidden]{display:none}'
    + '.pya-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--kit-line,rgba(0,0,0,.1))}'
    + '.pya-head .pya-face{width:36px;height:36px;border-radius:999px;overflow:hidden;flex:none;display:grid;place-items:center;background:var(--kit-accent,#20211d);color:var(--kit-on-accent,#fff)}'
    + '.pya-head div{display:grid;flex:1;min-width:0}.pya-head strong{font-family:var(--store-heading-font,var(--brand-heading-font,inherit))}.pya-head span{font-size:12px;opacity:.7}'
    + '.pya-close{width:44px;height:44px;border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer}'
    + '.pya-log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}'
    + '.pya-msg{max-width:85%;margin:0;padding:9px 12px;border-radius:14px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}'
    + '.pya-msg.is-buyer{align-self:flex-end;background:var(--kit-accent,#20211d);color:var(--kit-on-accent,#fff)}'
    + '.pya-msg.is-bot{align-self:flex-start;background:var(--kit-surface,rgba(0,0,0,.05))}'
    + '.pya-typing{align-self:flex-start;margin:0;font-size:13px;opacity:.7}'
    + '.pya-card{display:flex;gap:10px;padding:8px;border:1px solid var(--kit-line,rgba(0,0,0,.12));border-radius:var(--kit-radius,12px)}'
    + '.pya-card img{width:64px;height:64px;object-fit:cover;flex:none;border-radius:var(--kit-radius,8px)}'
    + '.pya-card>div{display:grid;gap:4px;min-width:0}.pya-card s{opacity:.6}.pya-out{font-size:13px;opacity:.7}'
    + '.pya-row{display:flex;gap:8px;flex-wrap:wrap}'
    + '.pya-panel .pya-btn{min-height:44px;padding:8px 14px;border-radius:var(--kit-radius,999px);border:1px solid var(--kit-line,rgba(0,0,0,.18));background:transparent;color:inherit;font:inherit;cursor:pointer}'
    + '.pya-panel .pya-primary{background:var(--kit-accent,#20211d);color:var(--kit-on-accent,#fff);border-color:transparent}'
    + '.pya-suggestions{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 10px}'
    + '.pya-form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--kit-line,rgba(0,0,0,.1))}'
    + '.pya-form textarea,.pya-lead input,.pya-lead textarea{flex:1;resize:none;min-height:44px;max-height:120px;padding:10px;font:inherit;color:inherit;background:transparent;border:1px solid var(--kit-line,rgba(0,0,0,.18));border-radius:var(--kit-radius,12px)}'
    + '.pya-lead{display:grid;gap:8px}.pya-lead label{display:grid;gap:4px;font-size:13px}'
    + '.pya-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 14px 12px;font-size:12px}.pya-foot small{opacity:.65}'
    + '.pya-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
    + '@media (max-width:560px){[data-pagosya-assistant]{right:16px;bottom:calc(16px + var(--pya-lift,0px))}.pya-panel{position:fixed;inset:0;width:auto;height:auto;border-radius:0}}'
    + '@media (prefers-reduced-motion:no-preference){.pya-panel:not([hidden]){animation:pya-in .18s var(--kit-ease,ease-out)}@keyframes pya-in{from{opacity:0;transform:translateY(8px)}}}'
    + '}';

  const ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>';
  function face(className) {
    const wrap = h('span', className);
    const src = asset(settings.avatarUrl);
    if (src) { const img = h('img', 'pya-avatar'); img.src = src; img.alt = ''; wrap.append(img); } else wrap.innerHTML = ICON;
    return wrap;
  }

  const log = () => root.querySelector('.pya-log');
  const scroll = () => { const el = log(); el.scrollTop = el.scrollHeight; };
  function say(text, who) { const el = h('p', 'pya-msg ' + (who === 'buyer' ? 'is-buyer' : 'is-bot'), text); log().append(el); scroll(); return el; }

  function card(item) {
    const el = h('article', 'pya-card');
    const src = asset(item.image);
    if (src) { const img = h('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; el.append(img); }
    const body = h('div');
    body.append(h('strong', null, item.name));
    const price = h('span', 'pya-price');
    if (item.originalPrice) price.append(h('s', null, item.originalPrice), ' ');
    price.append(item.price);
    body.append(price);
    if (!item.inStock) body.append(h('span', 'pya-out', 'Agotado'));
    const row = h('div', 'pya-row');
    row.append(button('pya-btn', 'Ver', { 'data-assistant-product': item.id }));
    if (item.addKey && item.inStock) row.append(button('pya-btn pya-primary', 'Agregar', { 'data-add': item.addKey }));
    body.append(row);
    el.append(body);
    return el;
  }

  function handoff(block) {
    const row = h('div', 'pya-row');
    const url = ownWhatsapp(block && block.whatsappUrl) || whatsappUrl(block && block.summary);
    if (url) { const b = button('pya-btn pya-primary', 'Escribir por WhatsApp', { 'data-assistant-whatsapp': '' }); b.dataset.url = url; row.append(b); }
    else row.append(button('pya-btn pya-primary', 'Dejar un mensaje', { 'data-assistant-message': '' }));
    log().append(row); scroll();
  }

  function render(reply) {
    say(reply.text, 'bot');
    (reply.blocks || []).forEach(block => {
      if (block.type === 'products') block.items.forEach(item => log().append(card(item)));
      else if (block.type === 'add_to_cart') { const row = h('div', 'pya-row'); row.append(button('pya-btn pya-primary', 'Agregar ' + block.label + ' · ' + block.price, { 'data-add': block.addKey })); log().append(row); }
      else if (block.type === 'handoff') handoff(block);
    });
    scroll();
  }

  function showCheckout() {
    const foot = root.querySelector('.pya-foot'), existing = foot.querySelector('[data-cart-open]');
    const count = cartCount();
    if (count && !existing) foot.prepend(button('pya-btn pya-primary', 'Ir a pagar', { 'data-cart-open': '' }));
    if (!count && existing) existing.remove();
  }

  async function request(body) {
    if (hosted) { const result = await window.PAGOSYA_HOSTED_REQUEST('assistant', body); return { ok: result.ok, json: result.body || {} }; }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (controller) controller.abort(); }, 30000);
    try {
      const response = await fetch(apiBase() + '/stores/public/' + encodeURIComponent(config.slug) + '/assistant/chat', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller ? controller.signal : undefined });
      return { ok: response.ok, json: await response.json().catch(() => ({})) };
    } finally { clearTimeout(timer); }
  }

  async function send(message, retried) {
    const submit = root.querySelector('.pya-form button[type=submit]');
    if (busy || !message) return;
    if (studio) { say(message, 'buyer'); say('Vista previa: el asistente responde en tu tienda publicada.', 'bot'); return; }
    busy = true; submit.disabled = true; lastMessage = message;
    if (!retried) say(message, 'buyer');
    const typing = h('p', 'pya-typing', 'Escribiendo…'); log().append(typing); scroll();
    const product = currentProduct();
    const body = { message: message, pagePath: pageName() };
    if (conversationId) body.conversationId = conversationId;
    if (product) body.productId = product.id;
    if (added) body.addedToCart = true;
    let retry = false, result = null;
    try {
      try { result = await request(body); } catch (error) { result = null; }
      typing.remove();
      if (!result) {
        // Hosted stores never re-send: the parent allows one in-flight assistant request.
        if (!hosted && !retried) retry = true;
        else {
          say('Se cortó la conexión.', 'bot');
          const row = h('div', 'pya-row'); row.append(button('pya-btn', 'Reintentar', { 'data-assistant-retry': '' })); log().append(row);
        }
      } else {
        try {
          const json = result.json || {};
          if (json.conversationId) { conversationId = json.conversationId; write(conversationId); }
          if (result.ok && json.reply) { added = false; render(json.reply); }
          else if (result.ok && json.fallback) { say('Ahora no puedo responder. Escríbele a la tienda 👉', 'bot'); handoff(null); }
          else say(json.message || 'No se pudo enviar. Inténtalo otra vez.', 'bot');
        } catch (error) { say('No pude mostrar la respuesta.', 'bot'); }
      }
    } finally { busy = false; submit.disabled = false; }
    if (retry) await send(message, true);
  }

  function messageForm() {
    if (hosted) {
      const trigger = root.querySelector('[data-assistant-handoff],[data-assistant-message]');
      if (trigger) trigger.disabled = true;
      Promise.resolve().then(() => window.PAGOSYA_HOSTED_REQUEST('lead', { items: [], origin: 'assistant' }))
        .then(r => say(r.ok ? 'Mensaje enviado. La tienda te contactará.' : (r.body && r.body.message) || 'No se pudo enviar.', 'bot'),
          () => say('No se pudo enviar. Inténtalo otra vez.', 'bot'))
        .then(() => { if (trigger) trigger.disabled = false; });
      return;
    }
    const form = h('form', 'pya-lead');
    [['name', 'Tu nombre', 'text'], ['email', 'Tu correo', 'email'], ['phone', 'Tu teléfono (opcional)', 'tel'], ['message', 'Tu mensaje', 'textarea']].forEach(f => {
      const label = h('label', null, f[1]);
      const input = f[2] === 'textarea' ? h('textarea') : h('input');
      if (f[2] !== 'textarea') input.type = f[2];
      input.name = f[0]; input.required = f[0] !== 'phone';
      if (f[0] === 'message') input.value = lastMessage;
      label.append(input); form.append(label);
    });
    const submit = h('button', 'pya-btn pya-primary', 'Enviar'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true;
      const data = new FormData(form);
      try {
        const response = await fetch(apiBase() + '/stores/public/' + encodeURIComponent(config.slug) + '/leads', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], origin: 'assistant', name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), phone: String(data.get('phone')).trim() || undefined, message: String(data.get('message')).trim() }) });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.submitted) throw new Error(Array.isArray(json.message) ? json.message.join(' ') : json.message || 'No se pudo enviar.');
        form.replaceWith(h('p', 'pya-msg is-bot', 'Mensaje enviado. La tienda te contactará.'));
      } catch (error) { submit.disabled = false; say(error.message, 'bot'); }
    });
    log().append(form); scroll();
  }

  function setOpen(open) {
    const panel = root.querySelector('.pya-panel'), toggle = root.querySelector('[data-assistant-toggle]');
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    root.querySelector('.pya-hint').hidden = true; clearTimeout(hintTimer);
    if (open) {
      if (!log().childElementCount) {
        say(settings.greeting, 'bot');
        const list = root.querySelector('.pya-suggestions'); list.textContent = '';
        const product = currentProduct();
        (product ? ['¿Me cuentas más de ' + product.name + '?'] : []).concat(settings.suggestions || []).slice(0, 3)
          .forEach(text => list.append(button('pya-btn', text, { 'data-assistant-suggestion': '' })));
      }
      showCheckout();
      root.querySelector('.pya-form textarea').focus();
    } else toggle.focus();
  }

  function liftAboveStickyBar() {
    const bar = document.querySelector('[data-product-sticky]');
    if (!bar) return;
    const apply = () => root.style.setProperty('--pya-lift', bar.hidden ? '0px' : Math.ceil(bar.getBoundingClientRect().height) + 'px');
    new MutationObserver(apply).observe(bar, { attributes: true, attributeFilter: ['hidden'] }); apply();
  }

  function mount(data) {
    store = data || store;
    settings = store && store.assistant;
    if (!settings || root) return;
    if (!document.getElementById('pagosya-assistant-style')) { const style = h('style'); style.id = 'pagosya-assistant-style'; style.textContent = CSS; document.head.append(style); }
    conversationId = read();
    root = h('section'); root.setAttribute('data-pagosya-assistant', ''); root.setAttribute('aria-label', 'Asistente de la tienda');
    const storeName = store.storeName || 'la tienda';
    const toggle = button('pya-launcher', undefined, { 'data-assistant-toggle': '', 'aria-expanded': 'false', 'aria-controls': 'pya-panel', 'aria-label': 'Abrir asistente de ' + storeName });
    toggle.append(face(''));
    const hint = h('p', 'pya-hint', '¿Dudas sobre este producto?'); hint.hidden = true;
    const panel = h('div', 'pya-panel'); panel.id = 'pya-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'pya-title');
    const head = h('div', 'pya-head'); head.append(face('pya-face'));
    const titles = h('div'); const title = h('strong', null, settings.name); title.id = 'pya-title'; titles.append(title, h('span', null, 'Asistente de ' + storeName));
    head.append(titles, button('pya-close', '×', { 'data-assistant-close': '', 'aria-label': 'Cerrar asistente' }));
    const logEl = h('div', 'pya-log'); logEl.setAttribute('role', 'log'); logEl.setAttribute('aria-live', 'polite');
    const form = h('form', 'pya-form');
    const label = h('label', 'pya-sr', 'Tu pregunta'); label.setAttribute('for', 'pya-input');
    const input = h('textarea'); input.id = 'pya-input'; input.rows = 1; input.maxLength = 500; input.placeholder = 'Escribe tu pregunta…';
    const submit = h('button', 'pya-btn pya-primary', 'Enviar'); submit.type = 'submit';
    form.append(label, input, submit);
    const foot = h('div', 'pya-foot'); foot.append(button('pya-btn', 'Hablar con la tienda', { 'data-assistant-handoff': '' }), h('small', null, 'Asistente automático · puede equivocarse'));
    panel.append(head, logEl, h('div', 'pya-suggestions'), form, foot);
    root.append(hint, panel, toggle);
    document.body.append(root);

    form.addEventListener('submit', event => { event.preventDefault(); const text = input.value.trim().slice(0, 500); input.value = ''; send(text, false); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.dispatchEvent(new Event('submit', { cancelable: true })); } });
    root.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-assistant-toggle')) setOpen(panel.hidden);
      else if (target.hasAttribute('data-assistant-close')) setOpen(false);
      else if (target.hasAttribute('data-assistant-suggestion')) send(target.textContent, false);
      else if (target.hasAttribute('data-assistant-product')) document.dispatchEvent(new CustomEvent('pagosya:open-product', { detail: { id: target.getAttribute('data-assistant-product') } }));
      else if (target.hasAttribute('data-assistant-whatsapp')) openExternal(target.dataset.url);
      else if (target.hasAttribute('data-assistant-message')) messageForm();
      else if (target.hasAttribute('data-assistant-handoff')) { const url = settings.handoff === 'whatsapp' ? whatsappUrl('') : null; if (url) openExternal(url); else messageForm(); }
      else if (target.hasAttribute('data-assistant-retry')) { target.parentNode.remove(); send(lastMessage, true); }
      else if (target.hasAttribute('data-add')) { added = true; setTimeout(showCheckout, 0); }
    });
    root.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = [].slice.call(panel.querySelectorAll('button:not([disabled]),textarea,input,a[href]'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('pagosya:cart-updated', () => { if (!panel.hidden) showCheckout(); });
    document.addEventListener('click', event => { if (event.target.closest && event.target.closest('[data-pagosya-contact-open]')) { event.preventDefault(); setOpen(true); } });
    liftAboveStickyBar();
    if (currentProduct() && !read() && !studio) {
      hintTimer = setTimeout(() => { if (panel.hidden) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 6000); } }, 8000);
    }
  }

  window.PAGOSYA_ASSISTANT = { mount: mount, open: () => setOpen(true), render: reply => render(reply) };
  if (config.data) mount(config.data);
  document.addEventListener('pagosya:ready', event => mount(event.detail && event.detail.store));
})();
