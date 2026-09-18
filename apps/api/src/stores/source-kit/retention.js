/* Optional commerce tools share the storefront's fonts, colors and controls. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.PAGOSYA_COMEBACK_RENDER = function renderComeback(el, card, options = {}) {
    if (!document.getElementById('pagosya-comeback-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-comeback-style';
      style.textContent = `
        .comeback-wrap{box-sizing:border-box;width:min(100%,420px);margin:32px auto;font:16px/1.5 system-ui,sans-serif;text-align:left}
        .comeback-wrap *{box-sizing:border-box}.comeback-wrap .comeback-heading{margin:0 0 16px;font:600 18px/1.4 system-ui,sans-serif;color:inherit}
        .comeback-card{padding:24px;border-radius:var(--comeback-radius,14px);background:var(--comeback-paper);color:var(--comeback-ink);font-family:var(--comeback-font);overflow:hidden}
        .comeback-brand{display:flex;align-items:center;gap:12px;min-height:36px}.comeback-brand strong{font-family:var(--comeback-heading-font,var(--comeback-font));font-size:24px;line-height:1.25;overflow-wrap:anywhere}.comeback-brand>img{width:44px;height:44px;object-fit:contain;background:#fff;border-radius:4px;padding:4px}
        .comeback-stamps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;list-style:none;padding:0;margin:28px 0 24px}
        .comeback-stamps li{aspect-ratio:1;display:grid;place-items:center;border-radius:50%;border:1.5px solid currentColor;background:color-mix(in srgb,var(--comeback-paper),#fff 80%);color:var(--comeback-ink);min-width:0}
        .comeback-stamps li[data-earned=false]{background:transparent;border-style:dashed}.comeback-stamps li[data-earned=false] .comeback-stamp{opacity:.25}
        .comeback-stamp{display:grid;place-items:center;width:58%;height:58%;font-weight:700;font-size:18px}.comeback-stamp svg,.comeback-stamp img{width:100%;height:100%;object-fit:contain}.comeback-stamp img{background:#fff;border-radius:50%;padding:3px}.comeback-stamps li[data-earned=true]{background:var(--comeback-ink);color:var(--comeback-paper);border-color:var(--comeback-ink)}
        .comeback-details{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0}.comeback-details dt{font-size:11px;line-height:1.4;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}.comeback-details dd{font-size:22px;line-height:1.25;margin:0;overflow-wrap:anywhere}
        .comeback-card .comeback-progress{font-size:14px;line-height:1.5;margin:20px 0 0}.comeback-card .comeback-reward{font-size:14px;line-height:1.5;margin:6px 0 0}
        .comeback-qr{width:152px;margin:28px auto 0;padding:4px 4px 8px;background:#fff;color:#241e19;border-radius:6px;text-align:center}.comeback-qr img{display:block;width:144px;height:144px}.comeback-qr figcaption{font:12px/1.4 system-ui,sans-serif;margin:0 6px}
        .comeback-card .comeback-code{display:block;font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;user-select:all;margin:16px 0 0;text-align:center}
        .comeback-wrap .comeback-note{font:14px/1.55 system-ui,sans-serif;margin:16px 0 0;color:inherit}.comeback-wrap .comeback-action{display:block;width:100%;min-height:48px;padding:12px 16px;margin:16px 0 0;background:var(--comeback-ink);color:var(--comeback-paper);border:1px solid var(--comeback-ink);border-radius:8px;font:600 14px/1.5 system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
        .comeback-wrap .comeback-action:hover{filter:brightness(.92)}.comeback-wrap .comeback-action:focus-visible{outline:3px solid currentColor;outline-offset:4px}.comeback-wrap .comeback-action:disabled{opacity:.6;cursor:wait}.comeback-wrap [role=status]:empty{display:none}
        @media(max-width:360px){.comeback-card{padding:20px}.comeback-stamps{gap:7px}.comeback-details dd{font-size:20px}}
        @media print{.comeback-wrap{display:none}}
      `;
      document.head.append(style);
    }
    const brand = card.brand || {};
    const color = (value, fallback) => /^#[a-f\d]{6}$/i.test(value || '') ? value : fallback;
    const url = value => {
      try { const parsed = new URL(value, options.apiBaseUrl || location.href); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; }
    };
    const logo = brand.logoUrl ? url(brand.logoUrl) : '';
    const cardUrl = card.cardUrl ? url(card.cardUrl) : '';
    const required = Math.max(2, Math.min(50, Number(card.visitsRequired) || 5));
    const visits = Math.max(0, Number(card.visits) || 0);
    const count = card.currentPurchaseOnly ? Math.min(required, visits) : visits % required;
    const coffee = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 4h13v3h2a4 4 0 0 1 0 8h-2.4A5 5 0 0 1 11 18H8a5 5 0 0 1-5-5V4Zm13 5v4h2a2 2 0 0 0 0-4h-2ZM2 20h19v2H2z"/></svg>';
    const bread = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18C1 15 4 9 9 5s9-4 11-1 0 8-5 12-8 5-11 2Z"/><path d="m8 8 3 3m1-6 3 3m-9 4 3 3"/></svg>';
    const stamp = logo ? `<img src="${escape(logo)}" alt="" referrerpolicy="no-referrer">` : brand.stamp === 'coffee' ? coffee : brand.stamp === 'bread' ? bread : escape((brand.name || '✓').trim().slice(0, 1).toUpperCase());
    const rewards = card.currentPurchaseOnly ? 'Por correo' : `${card.availableRewards ?? Math.floor(visits / required)} ${(card.availableRewards ?? Math.floor(visits / required)) === 1 ? 'premio' : 'premios'}`;
    el.innerHTML = `<div class="comeback-wrap">
      <h2 class="comeback-heading">Tu tarjeta Comeback</h2>
      <article class="comeback-card" aria-label="Tarjeta de ${escape(brand.name || 'tu tienda')}">
        <header class="comeback-brand">${logo ? `<img src="${escape(logo)}" alt="" referrerpolicy="no-referrer">` : ''}<strong>${escape(brand.name || 'Tu tienda')}</strong></header>
        <ol class="comeback-stamps" aria-label="${count} de ${required} sellos${card.currentPurchaseOnly ? ', solo esta compra' : ''}">${Array.from({ length: required }, (_, i) => `<li data-earned="${i < count}" aria-label="Sello ${i + 1}, ${i < count ? 'completado' : 'pendiente'}"><span class="comeback-stamp" aria-hidden="true">${stamp}</span></li>`).join('')}</ol>
        <dl class="comeback-details"><div><dt>Nombre</dt><dd>${escape(card.customerName || 'Cliente')}</dd></div><div><dt>${card.currentPurchaseOnly ? 'Tu saldo completo' : 'Premios disponibles'}</dt><dd>${escape(rewards)}</dd></div></dl>
        <p class="comeback-progress">${card.currentPurchaseOnly ? 'Esta compra cuenta para tu sello de hoy.' : `${visits} ${visits === 1 ? 'día de compras' : 'días de compras'} · ${card.code ? 'Tu premio está listo.' : `Faltan ${Math.max(0, required - visits)} para tu premio.`}`}</p>
        <p class="comeback-reward">${escape(card.rewardLabel)}</p>
        ${/^data:image\/png;base64,[a-z\d+/=]+$/i.test(card.qrImageDataUrl || '') ? `<figure class="comeback-qr"><img src="${card.qrImageDataUrl}" width="144" height="144" alt="${card.code ? 'QR para canjear el premio' : 'QR para volver a abrir tu tarjeta'}"><figcaption>${card.code ? 'Muestra tu premio' : 'Guarda tu tarjeta'}</figcaption></figure>` : ''}
        ${card.code ? `<code class="comeback-code">${escape(card.code)}</code>` : ''}
      </article>
      <p class="comeback-note">${card.currentPurchaseOnly ? 'Aquí ves solo esta compra. Abre tu tarjeta privada desde el correo para consultar todos tus sellos y premios. Un sello por día.' : 'Usa el mismo correo al comprar. Un sello por día; las compras totalmente reembolsadas no cuentan.'}</p>
      ${card.currentPurchaseOnly && options.onEmail && card.emailAvailable ? '<button type="button" class="comeback-action" data-comeback-email>Ver mi tarjeta completa por correo</button>' : ''}
      ${cardUrl ? `<a class="comeback-action" href="${escape(cardUrl)}" target="_blank" rel="noreferrer noopener">Abrir enlace para guardar</a>` : ''}
      <p class="comeback-note" role="status" aria-live="polite"></p>
    </div>`;
    const wrap = el.querySelector('.comeback-wrap');
    const safeFont = value => typeof value === 'string' && value.length <= 180 && /^[\w\s,"'-]+$/.test(value) ? value : '';
    const fontStyle = document.createElement('style');
    fontStyle.textContent = (Array.isArray(brand.fonts) ? brand.fonts : []).slice(0, 2).filter(f => f && /^[\w -]{1,80}$/.test(f.family) && typeof f.source === 'string' && f.source.length <= 800000 && /^data:font\/(?:ttf|woff2?|otf);base64,[A-Za-z0-9+/]+=*$/.test(f.source)).map(f => `@font-face{font-family:"${f.family}";src:url("${f.source}");font-weight:${/^\d{3}(?: \d{3})?$/.test(f.weight) ? f.weight : '100 900'};font-style:${f.style === 'italic' ? 'italic' : 'normal'};font-display:swap}`).join('\n');
    if (fontStyle.textContent) wrap.append(fontStyle);
    wrap.style.setProperty('--comeback-paper', color(brand.background, '#b69b88'));
    wrap.style.setProperty('--comeback-ink', color(brand.foreground, '#241e19'));
    wrap.style.setProperty('--comeback-font', safeFont(brand.bodyFont) || ({ editorial: 'Georgia,serif', classic: 'Georgia,serif', friendly: 'ui-rounded,system-ui,sans-serif', geometric: 'Century Gothic,system-ui,sans-serif' })[brand.fontStyle] || 'system-ui,sans-serif');
    if (safeFont(brand.headingFont)) wrap.style.setProperty('--comeback-heading-font', brand.headingFont);
    if (/^(?:\d|1\d|2[0-4])px$/.test(brand.radius)) wrap.style.setProperty('--comeback-radius', brand.radius);
    el.querySelectorAll('.comeback-brand img, .comeback-stamp img').forEach(img => img.addEventListener('error', () => {
      const fallback = document.createElement('span'); fallback.textContent = (brand.name || '✓').trim().slice(0, 1).toUpperCase(); img.replaceWith(fallback);
    }, { once: true }));
    el.querySelector('[data-comeback-email]')?.addEventListener('click', async event => {
      const button = event.currentTarget; const status = el.querySelector('[role=status]'); button.disabled = true; status.textContent = 'Solicitando tu tarjeta…';
      try { await options.onEmail(); status.textContent = 'Solicitamos el envío al correo de esta compra. Revisa tu bandeja y la carpeta de spam.'; }
      catch { status.textContent = 'No se pudo solicitar el envío. Intenta de nuevo.'; button.disabled = false; }
    });
  };
  function mountSignup(host, settings, config, state, api, preview, query) {
    host.className = 'pagosya-signup-host';
    if (!document.getElementById('pagosya-signup-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-signup-style';
      style.textContent = `
        .pagosya-signup-host{display:block;width:100%;font:inherit;color:inherit}.pagosya-signup-host *{box-sizing:border-box}
        .pagosya-signup-launcher{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);width:min(1100px,calc(100% - 40px));min-height:360px;margin:48px auto;overflow:hidden;border:1px solid var(--signup-ink,#26221c);border-radius:3px;background:var(--signup-paper,#f3eddf);color:var(--signup-ink,#26221c);isolation:isolate;box-shadow:0 18px 56px #0002}
        .pagosya-signup-launcher-media{position:relative;min-height:360px;overflow:hidden;background:color-mix(in srgb,var(--signup-paper),var(--signup-ink) 8%)}.pagosya-signup-launcher-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.pagosya-signup-launcher-media .signup-monogram{display:grid;place-items:center;height:100%;min-height:360px;font:clamp(80px,14vw,180px)/1 Georgia,serif;color:var(--signup-ink);opacity:.5}
        .pagosya-signup-launcher-copy{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;min-width:0;padding:clamp(30px,5vw,64px)}.pagosya-signup-launcher-copy .signup-eyebrow{margin:0 0 18px;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase;overflow-wrap:anywhere}.pagosya-signup-launcher-copy h2{margin:0 0 18px;font:400 clamp(30px,4vw,52px)/1.08 var(--signup-heading,Georgia,serif);letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere}.pagosya-signup-launcher-copy .signup-description{max-width:42ch;margin:0 0 24px;font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}.pagosya-signup-launcher-copy .signup-reopen{align-self:flex-start;min-height:46px;padding:11px 18px;border:1px solid currentColor;border-radius:var(--brand-radius,3px);background:var(--signup-ink);color:var(--signup-paper);font:700 14px/1.4 system-ui,sans-serif;cursor:pointer}.pagosya-signup-launcher-copy .signup-reopen:hover{filter:brightness(.9)}.pagosya-signup-launcher-copy .signup-reopen:disabled{opacity:.65;cursor:default;filter:none}.pagosya-signup-preview-note{margin:16px 0 0;font:12px/1.5 system-ui,sans-serif;opacity:.72}
        .pagosya-signup-dialog{position:fixed;inset:0;width:min(1000px,calc(100% - 48px));max-width:none;max-height:calc(100dvh - 48px);margin:auto;padding:0;border:0;border-radius:3px;background:var(--signup-paper,#f3eddf);color:var(--signup-ink,#26221c);font:16px/1.6 system-ui,sans-serif;overflow:auto;overscroll-behavior:contain;box-shadow:0 24px 80px #0003}
        .pagosya-signup-dialog::backdrop{background:rgb(24 22 17 / .6)}
        .pagosya-signup-layout{display:grid;grid-template-columns:1fr 1fr;min-height:580px}
        .pagosya-signup-photo{margin:0;min-height:100%;background:color-mix(in srgb,var(--signup-paper),var(--signup-ink) 6%);position:relative;overflow:hidden}.pagosya-signup-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .pagosya-signup-photo .signup-monogram{display:grid;place-items:center;height:100%;min-height:450px;font:clamp(80px,14vw,180px)/1 Georgia,serif;color:var(--signup-ink);opacity:.5}
        .pagosya-signup-copy{padding:48px 44px 36px;min-width:0}.pagosya-signup-copy .signup-eyebrow{margin:0 36px 22px 0;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase;overflow-wrap:anywhere}
        .pagosya-signup-copy h2{margin:0 0 24px;font:400 clamp(28px,3.4vw,42px)/1.18 var(--signup-heading,Georgia,serif);letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere;color:inherit}.pagosya-signup-copy h2:focus{outline:none}
        .pagosya-signup-copy .signup-description{margin:0 0 24px;font:16px/1.65 system-ui,sans-serif;color:inherit}.pagosya-signup-copy form{display:grid;gap:20px;max-width:none}.pagosya-signup-copy form[hidden]{display:none}
        .pagosya-signup-copy fieldset{padding:0;margin:0;border:0;min-width:0}.pagosya-signup-copy legend{padding:0;margin:0 0 12px;font:12px/1.5 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em}.signup-interests{display:flex;flex-wrap:wrap;gap:12px 20px}
        .signup-interests label{display:flex;align-items:center;gap:8px;font:14px/1.5 system-ui,sans-serif;cursor:pointer}.pagosya-signup-copy input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:var(--signup-ink);flex:0 0 18px}
        .pagosya-signup-copy .signup-field{display:grid;gap:2px;font:13px/1.5 system-ui,sans-serif}.pagosya-signup-copy .signup-field input{border:0;border-bottom:1px solid color-mix(in srgb,var(--signup-ink),transparent 55%);border-radius:0;background:transparent;color:inherit;font:16px/1.5 system-ui,sans-serif;min-height:40px;padding:6px 0;width:100%;min-width:0;box-shadow:none}
        .pagosya-signup-copy .signup-consent{display:flex;align-items:flex-start;gap:10px;font:12px/1.6 system-ui,sans-serif;cursor:pointer}.signup-consent input{margin-top:2px!important}
        .pagosya-signup-copy .signup-submit{justify-self:start;padding:0 0 3px;margin:0;min-height:36px;border:0;border-bottom:2px solid currentColor;border-radius:0;background:transparent;color:inherit;font:700 15px/1.5 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.signup-submit:hover{opacity:.75}.signup-submit:disabled{opacity:.55;cursor:wait}
        .pagosya-signup-dialog .signup-close{position:absolute;top:20px;right:20px;z-index:1;width:44px;height:44px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:color-mix(in srgb,var(--signup-paper),var(--signup-ink) 10%);color:var(--signup-ink);font:26px/1 system-ui,sans-serif;cursor:pointer}
        .pagosya-signup-host :focus-visible{outline:2px solid currentColor;outline-offset:5px}.pagosya-signup-copy [role=status]{font:14px/1.6 system-ui,sans-serif;margin:16px 0 0}.pagosya-signup-copy [role=status]:empty{display:none}
        @media(max-width:700px){.pagosya-signup-launcher{grid-template-columns:1fr;width:calc(100% - 24px);min-height:0;margin:32px auto}.pagosya-signup-launcher-media{min-height:220px;height:220px}.pagosya-signup-launcher-media .signup-monogram{min-height:220px;font-size:80px}.pagosya-signup-launcher-copy{padding:28px 24px 32px}.pagosya-signup-launcher-copy h2{font-size:34px}.pagosya-signup-dialog{width:calc(100% - 24px);max-height:calc(100dvh - 24px)}.pagosya-signup-layout{grid-template-columns:1fr;min-height:0}.pagosya-signup-photo{min-height:150px;height:150px}.pagosya-signup-photo .signup-monogram{min-height:150px;font-size:80px}.pagosya-signup-copy{padding:26px 24px 28px}.pagosya-signup-copy .signup-eyebrow{margin-bottom:12px}.pagosya-signup-copy h2{font-size:30px;margin-bottom:16px}.pagosya-signup-copy .signup-description{font-size:14px;margin-bottom:20px}.pagosya-signup-copy form{gap:16px}.pagosya-signup-dialog .signup-close{top:12px;right:12px}}
        @media print{.pagosya-signup-host{display:none}}
      `;
      document.head.append(style);
    }
    const visual = settings.signupVisual || {};
    const brand = visual.brand || {};
    const name = brand.name || config.data?.storeName || config.data?.name || 'Nuestra comunidad';
    const dismissedKey = `pagosya:signup-dismissed:${config.slug}`;
    const safeImage = value => { if (!value) return ''; try { const url = new URL(value, config.apiBaseUrl || location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
    const image = safeImage(visual.imageUrl || config.data?.items?.find(item => item.imageUrls?.length)?.imageUrls[0] || '');
    const interests = Array.isArray(visual.interests) ? visual.interests.slice(0, 8) : [];
    const launcherImage = image ? `<img src="${escape(image)}" alt="Selección de ${escape(name)}" referrerpolicy="no-referrer">` : `<span class="signup-monogram" aria-hidden="true">${escape(name.slice(0, 1))}</span>`;
    const launcherAction = preview ? `<button type="button" class="signup-reopen" disabled>${escape(settings.signupButton)}</button><p class="pagosya-signup-preview-note">Vista previa: el formulario se activa al publicar tu tienda.</p>` : '<button type="button" class="signup-reopen" aria-haspopup="dialog">Comunidad</button>';
    host.innerHTML = `<section class="pagosya-signup-launcher" aria-label="Comunidad">
        <figure class="pagosya-signup-launcher-media">${launcherImage}</figure>
        <div class="pagosya-signup-launcher-copy"><p class="signup-eyebrow">${escape(name)}</p><h2>${escape(settings.signupTitle)}</h2><p class="signup-description">${escape(settings.signupBody)}</p>${launcherAction}</div>
      </section>${preview ? '' : `<dialog class="pagosya-signup-dialog" aria-label="${escape(settings.signupTitle)}">
        <button type="button" class="signup-close" aria-label="Cerrar suscripción">×</button>
        <div class="pagosya-signup-layout">
          <figure class="pagosya-signup-photo">${image ? `<img src="${escape(image)}" alt="Selección de ${escape(name)}" referrerpolicy="no-referrer">` : `<span class="signup-monogram" aria-hidden="true">${escape(name.slice(0, 1))}</span>`}</figure>
          <section class="pagosya-signup-copy"><p class="signup-eyebrow">${escape(name)}</p><h2 tabindex="-1">${escape(settings.signupTitle)}</h2><p class="signup-description">${escape(settings.signupBody)}</p>
            <form>
              ${interests.length ? `<fieldset><legend>¿Qué te interesa? <span>(opcional)</span></legend><div class="signup-interests">${interests.map(interest => `<label><input type="checkbox" name="interests" value="${escape(interest)}">${escape(interest)}</label>`).join('')}</div></fieldset>` : ''}
              <label class="signup-field">Nombre (opcional)<input name="name" autocomplete="given-name" maxlength="100"></label>
              <label class="signup-field">Tu correo<input type="email" name="email" autocomplete="email" maxlength="254" required></label>
              <label class="signup-field">WhatsApp / Teléfono (opcional)<input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
              <label class="signup-consent"><input type="checkbox" name="consent" required>Quiero recibir novedades y promociones de esta tienda por correo. Puedo darme de baja cuando quiera.</label>
              <button type="submit" class="signup-submit">${escape(settings.signupButton)}</button>
            </form><p role="status" aria-live="polite"></p>
          </section>
        </div>
      </dialog>`}`;
    for (const [property, value] of [['--signup-paper', brand.background], ['--signup-ink', brand.foreground]]) if (/^#[a-f\d]{6}$/i.test(value || '')) host.style.setProperty(property, value);
    if (brand.fontStyle && !['classic', 'editorial'].includes(brand.fontStyle)) host.style.setProperty('--signup-heading', 'system-ui,sans-serif');
    if (preview) {
      host.querySelector('.pagosya-signup-launcher-media img')?.addEventListener('error', event => {
        const photo = event.currentTarget;
        photo.parentElement.innerHTML = `<span class="signup-monogram" aria-hidden="true">${escape(name.slice(0, 1))}</span>`;
      }, { once: true });
      return;
    }
    const dialog = host.querySelector('dialog');
    const remember = () => { state.signupDismissed = true; try { sessionStorage.setItem(dismissedKey, '1'); } catch {} };
    const open = () => { if (!dialog.isConnected || dialog.open || document.querySelector('dialog[open]')) return; dialog.showModal(); dialog.querySelector('h2').focus(); };
    dialog.addEventListener('close', remember);
    dialog.querySelector('.signup-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
    host.querySelector('.signup-reopen').addEventListener('click', open);
    const photo = host.querySelector('.pagosya-signup-photo img');
    photo?.addEventListener('error', () => { photo.parentElement.innerHTML = `<span class="signup-monogram" aria-hidden="true">${escape(name.slice(0, 1))}</span>`; }, { once: true });
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); const status = dialog.querySelector('[role=status]');
      if (button.disabled || !form.reportValidity()) return;
      const data = new FormData(form); button.disabled = true; status.textContent = 'Un momento…';
      try {
        await api('subscribe', { email: String(data.get('email')).trim(), consent: true,
          ...(String(data.get('name')).trim() ? { name: String(data.get('name')).trim() } : {}),
          ...(String(data.get('phone')).trim() ? { phone: String(data.get('phone')).trim() } : {}),
          ...(data.getAll('interests').length ? { interests: data.getAll('interests') } : {}) });
        remember(); state.subscribed = true; form.hidden = true; host.querySelector('.signup-reopen').hidden = true;
        status.textContent = '¡Ya formas parte de nuestra comunidad! Revisa tu correo para recibir nuestras novedades.';
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    let dismissed = state.signupDismissed;
    try { dismissed ||= sessionStorage.getItem(dismissedKey) === '1'; } catch {}
    if (state.subscribed) host.querySelector('.signup-reopen').hidden = true;
    // Never cover a receipt, private card, recovery link, or merchant preview.
    if (!dismissed && !preview && !['comeback', 'recover', 'unsubscribe'].some(key => query.has(key)) && !document.querySelector('[data-pagosya-checkout-page]')) open();
  }
  window.PAGOSYA_RETENTION_MOUNT = async function mountRetention(options) {
    const config = options || window.PAGOSYA_CONFIG || {};
    const hosted = window.PAGOSYA_HOSTED === true;
    const preview = Boolean(config.preview || config.demo || (window.PAGOSYA_PREVIEW && !hosted));
    const query = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search);
    const key = `pagosya:recovery:${config.slug}`;
    // Reuse state only when a previous mount saved it for this same store; a missing slug must not match a missing state.
    const saved = window.PAGOSYA_RETENTION_STATE;
    const state = saved && saved.slug === config.slug ? saved : { slug: config.slug, email: '', consent: false, token: '', processed: false };
    window.PAGOSYA_RETENTION_STATE = state;
    if (!state.token && !hosted && !preview) { try { state.token = sessionStorage.getItem(key) || ''; } catch {} }
    const api = async (path, body) => {
      if (preview) throw new Error('Vista previa: no se enviarán correos ni se guardarán datos.');
      const result = hosted
        ? await window.PAGOSYA_HOSTED_REQUEST('retention', { path, ...(body ? { payload: body } : {}) })
        : await fetch(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/retention${path ? '/' + path : ''}`, { method: body ? 'POST' : 'GET', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(async response => ({ ok: response.ok, body: await response.json() }));
      if (!result.ok) throw new Error(Array.isArray(result.body.message) ? result.body.message.join(' ') : result.body.message || 'No se pudo completar. Intenta de nuevo.');
      return result.body;
    };
    let settings;
    try { settings = preview ? config.data?.retention || {} : await api(''); } catch { return; }
    if (options?.isCurrent && !options.isCurrent()) return;
    if (!document.querySelector('#pagosya-retention-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-retention-style';
      style.textContent = `@layer pagosya-commerce {
        .pagosya-retention{box-sizing:border-box;width:min(1100px,calc(100% - 40px));margin:48px auto;padding:32px 0;border-top:1px solid var(--brand-border,var(--line,currentColor));font:inherit;color:inherit;background:transparent}
        .pagosya-retention h2{font-family:inherit;font-size:clamp(24px,4vw,36px);line-height:1.2;margin:0 0 16px}.pagosya-retention h3{font:inherit;font-size:20px;font-weight:700}.pagosya-retention p{line-height:1.6;max-width:65ch}
        .pagosya-retention form{display:grid;gap:12px;max-width:600px}.pagosya-retention label{display:grid;gap:8px;font:inherit}.pagosya-retention input[type=email]{box-sizing:border-box;min-width:0;width:100%;min-height:48px;padding:12px;border:1px solid var(--brand-border,var(--line,currentColor));border-radius:var(--brand-radius,0);font:inherit;background:var(--brand-background,var(--paper,Canvas));color:inherit}
        .pagosya-retention button{min-height:48px;padding:12px 20px;border:1px solid currentColor;border-radius:var(--brand-radius,0);font:inherit;font-weight:700;background:var(--brand-accent,var(--accent,var(--ink,CanvasText)));color:var(--brand-accent-foreground,var(--paper,Canvas));cursor:pointer}.pagosya-retention button:disabled{opacity:.6;cursor:wait}.pagosya-retention :focus-visible{outline:3px solid currentColor;outline-offset:4px}
        .pagosya-retention .retention-consent{display:flex;align-items:flex-start;gap:12px;line-height:1.5;font-size:14px}.pagosya-retention input[type=checkbox]{width:20px;height:20px;flex:0 0 20px;margin:2px 0;accent-color:var(--brand-accent,var(--accent,auto))}.retention-stamps{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0;list-style:none;padding:0}.retention-stamps li{display:grid;place-items:center;width:44px;height:44px;border:1px solid currentColor;border-radius:50%;font:inherit}.retention-stamps [data-earned=true]{background:var(--brand-accent,var(--accent,var(--ink,CanvasText)));color:var(--brand-accent-foreground,var(--paper,Canvas))}.retention-code{display:block;padding:16px 0;overflow-wrap:anywhere;font:inherit;font-weight:700;user-select:all}
        [data-retention-recovery]{width:auto;margin:24px 0;padding:20px 0}.pagosya-retention [role=status]:empty{display:none}
        @media(max-width:480px){.pagosya-retention{width:calc(100% - 32px);margin:32px auto;padding:24px 0}[data-retention-recovery]{width:100%;margin:20px 0}}
      }`;
      document.head.append(style);
    }
    function slot(attribute) {
      let el = document.querySelector(`[${attribute}]`);
      if (!el) { el = document.createElement('section'); el.setAttribute(attribute, ''); const footer = document.querySelector('body > footer, main > footer, .store-site-footer'); if (footer) footer.before(el); else (document.querySelector('main') || document.body).append(el); }
      el.classList.add('pagosya-retention'); return el;
    }
    function form(el, html, submit) {
      el.innerHTML = `${html}<p role="status" aria-live="polite"></p>`;
      el.querySelector('form')?.addEventListener('submit', async event => {
        event.preventDefault(); const target = event.currentTarget; if (target.dataset.busy) return;
        const data = new FormData(target); const button = target.querySelector('button'); const status = el.querySelector('[role=status]');
        target.dataset.busy = 'true'; button.disabled = true; status.textContent = 'Un momento…';
        try { status.textContent = await submit(data); }
        catch (error) { status.textContent = error.message; }
        finally { delete target.dataset.busy; button.disabled = false; }
      });
    }
    if (settings.signupEnabled) {
      document.querySelectorAll('.store-site-newsletter').forEach(el => el.hidden = true);
      mountSignup(slot('data-pagosya-subscribe'), settings, config, state, api, preview, query);
    }
    // Loyalty cards are shown after payment or when reopening a private card link.
    document.querySelectorAll('[data-pagosya-comeback]').forEach(el => { el.replaceChildren(); el.hidden = true; });
    if (settings.comebackEnabled && query.get('comeback')) {
      const el = slot('data-pagosya-comeback'); el.hidden = false;
      el.innerHTML = '<p role="status">Cargando tu tarjeta…</p>';
      try {
        const card = await api(`cards/${encodeURIComponent(query.get('comeback'))}`);
        if (options?.isCurrent && !options.isCurrent()) return;
        window.PAGOSYA_COMEBACK_RENDER(el, card, { apiBaseUrl: config.apiBaseUrl });
      } catch (error) { el.querySelector('[role=status]').textContent = error.message; }
      el.scrollIntoView({ block: 'center' });
    }
    if (query.get('unsubscribe')) {
      const el = slot('data-pagosya-unsubscribe');
      form(el, '<h2>Preferencias de correo</h2><p>Puedes dejar de recibir promociones y recordatorios de esta tienda.</p><form><button type="submit">Dejar de recibir correos</button></form>', async () => { await api(`unsubscribe/${encodeURIComponent(query.get('unsubscribe'))}`, {}); el.querySelector('form').hidden = true; return 'Tu baja quedó registrada.'; });
      el.scrollIntoView({ block: 'center' });
    }
    const getCart = () => { if (config.getCart) return config.getCart(); const detail = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail })); return detail.items.map(i => ({ paymentLinkId: i.id, ...(i.variantId ? { variantId: i.variantId } : {}), quantity: i.quantity })); };
    const saveToken = value => { if (!value) return; state.token = value; if (!hosted && !preview) { try { sessionStorage.setItem(key, value); } catch {} } };
    if (query.get('recover') && !state.processed) {
      state.processed = true;
      try {
        const saved = await api(`carts/${encodeURIComponent(query.get('recover'))}`); saveToken(query.get('recover'));
        if (config.restoreCart) config.restoreCart(saved.items);
        else document.dispatchEvent(new CustomEvent('pagosya:restore-cart', { detail: { items: saved.items.map(i => ({ id: i.paymentLinkId, ...(i.variantId ? { variantId: i.variantId } : {}), quantity: i.quantity })) } }));
        const el = slot('data-pagosya-recovered'); el.innerHTML = '<h2>Retoma tu pedido</h2><p role="status">Recuperamos tus productos disponibles. Revisa las cantidades y los precios actuales antes de pagar.</p>'; el.scrollIntoView({ block: 'center' });
      } catch (error) { const el = slot('data-pagosya-recovered'); el.innerHTML = `<p role="status">${escape(error.message)}</p>`; }
    }
    function renderRecovery() {
      if (!settings.recoveryEnabled) return;
      document.querySelectorAll('[data-pagosya-cart], [data-retention-cart-host]').forEach(panel => {
        if (panel.querySelector('[data-retention-recovery]') || !getCart().length) return;
        const el = document.createElement('section'); el.className = 'pagosya-retention'; el.setAttribute('data-retention-recovery', ''); panel.append(el);
        form(el, `<h3>¿Prefieres terminar después?</h3><form><label>Tu correo<input type="email" name="email" autocomplete="email" maxlength="254" required value="${escape(state.email)}"></label><label class="retention-consent"><input type="checkbox" name="consent" required ${state.consent ? 'checked' : ''}>Acepto recibir un recordatorio de este carrito si no termino la compra.</label><button type="submit">Guardar y recordármelo</button></form>`, async data => {
          state.email = String(data.get('email')).trim(); state.consent = true;
          const result = await api('carts', { email: state.email, consent: true, items: getCart(), ...(state.token ? { token: state.token } : {}) }); saveToken(result.token);
          return 'Carrito guardado. Te enviaremos un recordatorio si no completas la compra.';
        });
        el.querySelector('[name=email]').addEventListener('input', event => { state.email = event.target.value; });
        el.querySelector('[name=consent]').addEventListener('change', event => { state.consent = event.target.checked; });
      });
    }
    window.PAGOSYA_RETENTION_REFRESH = renderRecovery;
    renderRecovery();
  };
  if (window.PAGOSYA_CONFIG) {
    document.addEventListener('pagosya:cart-updated', () => window.PAGOSYA_RETENTION_REFRESH?.());
    void window.PAGOSYA_RETENTION_MOUNT();
  }
})();
