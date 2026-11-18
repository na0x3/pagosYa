/* Optional commerce tools share the storefront's fonts, colors and controls. */
(() => {
  'use strict';
  // Published stores: personal fields are typed in pagosYa's secure form outside the design, not here.
  function secureFields(form) {
    if (window.PAGOSYA_HOSTED !== true || !form) return;
    form.querySelectorAll('input[name=email],input[name=name],input[name=phone],input[name=consent]').forEach(input => input.closest('label')?.remove());
    if (!form.querySelector('.pagosya-secure-note')) form.querySelector('[type=submit]')?.insertAdjacentHTML('beforebegin', '<p class="pagosya-secure-note">Tus datos se piden en un formulario seguro de pagosYa.</p>');
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.PAGOSYA_COMEBACK_RENDER = function renderComeback(el, card, options = {}) {
    if (!document.getElementById('pagosya-comeback-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-comeback-style';
      style.textContent = `
        .comeback-wrap{box-sizing:border-box;width:min(100%,400px);margin:32px auto;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;color:inherit}
        .comeback-wrap *{box-sizing:border-box}.comeback-wrap .comeback-heading{margin:0 0 14px;font:600 17px/1.35 system-ui,-apple-system,sans-serif;letter-spacing:-.01em;color:inherit}
        .comeback-card{position:relative;isolation:isolate;padding:22px 22px 18px;border-radius:var(--comeback-radius,22px);background:var(--comeback-paper);color:var(--comeback-ink);font-family:var(--comeback-font);overflow:hidden;box-shadow:0 1px 0 rgb(255 255 255 / .18) inset,0 18px 40px -18px rgb(0 0 0 / .45),0 2px 6px rgb(0 0 0 / .08)}
        .comeback-card::before{content:"";position:absolute;inset:-40% -20% auto auto;z-index:-1;width:70%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--comeback-ink) 14%,transparent),transparent 70%)}
        .comeback-brand{display:flex;align-items:center;gap:10px;min-height:32px}.comeback-brand strong{flex:1;min-width:0;font-family:var(--comeback-heading-font,var(--comeback-font));font-size:19px;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
        .comeback-brand>img{width:34px;height:34px;object-fit:contain;background:#fff;border-radius:9px;padding:3px}
        .comeback-kind{flex:none;padding:4px 9px;border-radius:999px;border:1px solid color-mix(in srgb,var(--comeback-ink) 35%,transparent);font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}
        .comeback-count{display:flex;align-items:baseline;gap:8px;margin:22px 0 12px}.comeback-count strong{font:700 44px/1 system-ui,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.comeback-count span{font-size:14px;opacity:.8}
        .comeback-stamps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;list-style:none;padding:0;margin:0}
        .comeback-stamps li{aspect-ratio:1;display:grid;place-items:center;border-radius:50%;border:1.5px dashed color-mix(in srgb,var(--comeback-ink) 45%,transparent);color:var(--comeback-ink);min-width:0;transition:transform .3s}
        .comeback-stamps li[data-earned=false] .comeback-stamp{opacity:.28}
        .comeback-stamps li[data-earned=true]{border:0;background:var(--comeback-ink);color:var(--comeback-paper);box-shadow:0 4px 10px -4px rgb(0 0 0 / .45)}
        .comeback-stamps li[data-latest]{animation:comeback-stamp .6s cubic-bezier(.2,1.4,.4,1) .25s both}
        @keyframes comeback-stamp{from{transform:scale(1.6) rotate(-12deg);opacity:0}}
        .comeback-stamp{display:grid;place-items:center;width:52%;height:52%;font-weight:700;font-size:16px}.comeback-stamp svg,.comeback-stamp img{width:100%;height:100%;object-fit:contain}.comeback-stamp img{background:#fff;border-radius:50%;padding:3px}
        .comeback-meter{height:6px;margin:16px 0 0;border-radius:999px;background:color-mix(in srgb,var(--comeback-ink) 16%,transparent);overflow:hidden}.comeback-meter span{display:block;height:100%;border-radius:inherit;background:var(--comeback-ink);transform-origin:left;animation:comeback-meter .8s cubic-bezier(.2,.8,.2,1) .2s both}
        @keyframes comeback-meter{from{transform:scaleX(0)}}
        .comeback-card .comeback-progress{font-size:13px;line-height:1.5;margin:8px 0 0;opacity:.85}
        .comeback-prize{display:flex;align-items:center;gap:12px;margin:16px 0 0;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--comeback-ink) 10%,transparent)}
        .comeback-prize svg{flex:none;width:22px;height:22px}.comeback-prize small{display:block;font:600 10px/1.3 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;opacity:.7}
        .comeback-card .comeback-reward{font-size:15px;font-weight:600;line-height:1.35;margin:2px 0 0;overflow-wrap:anywhere}
        .comeback-foot{display:flex;justify-content:space-between;gap:12px;margin:16px 0 0;padding:12px 0 0;border-top:1px solid color-mix(in srgb,var(--comeback-ink) 18%,transparent);font-size:13px}.comeback-foot span:last-child{opacity:.75;text-align:right}
        .comeback-qr{width:152px;margin:20px auto 0;padding:4px 4px 8px;background:#fff;color:#241e19;border-radius:12px;text-align:center}.comeback-qr img{display:block;width:144px;height:144px}.comeback-qr figcaption{font:12px/1.4 system-ui,sans-serif;margin:0 6px}
        .comeback-card .comeback-code{display:block;font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere;user-select:all;margin:14px 0 0;text-align:center}
        .comeback-wrap .comeback-note{font:13px/1.55 system-ui,sans-serif;margin:14px 0 0;color:inherit;opacity:.75}.comeback-wrap .comeback-action{display:block;width:100%;min-height:46px;padding:12px 16px;margin:14px 0 0;background:var(--comeback-ink);color:var(--comeback-paper);border:0;border-radius:12px;font:600 14px/1.5 system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
        .comeback-wrap .comeback-action:hover{filter:brightness(.92)}.comeback-wrap .comeback-action:focus-visible{outline:3px solid currentColor;outline-offset:4px}.comeback-wrap .comeback-action:disabled{opacity:.6;cursor:wait}.comeback-wrap [role=status]:empty{display:none}
        @media(prefers-reduced-motion:reduce){.comeback-stamps li,.comeback-meter span{animation:none!important}}
        @media(max-width:360px){.comeback-card{padding:18px}.comeback-stamps{gap:6px}.comeback-count strong{font-size:38px}}
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
    const available = card.availableRewards ?? Math.floor(visits / required);
    const rewards = card.currentPurchaseOnly ? 'Premios por correo' : `${available} ${available === 1 ? 'premio listo' : 'premios listos'}`;
    const remaining = Math.max(0, required - count);
    const gift = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z"/></svg>';
    el.innerHTML = `<div class="comeback-wrap">
      ${options.heading === false ? '' : `<h2 class="comeback-heading">${escape(options.heading || 'Tu tarjeta Comeback')}</h2>`}
      <article class="comeback-card" aria-label="Tarjeta de ${escape(brand.name || 'tu tienda')}">
        <header class="comeback-brand">${logo ? `<img src="${escape(logo)}" alt="" referrerpolicy="no-referrer">` : ''}<strong>${escape(brand.name || 'Tu tienda')}</strong><span class="comeback-kind">Comeback</span></header>
        <p class="comeback-count"><strong>${count}</strong><span>de ${required} sellos${card.currentPurchaseOnly ? ' · esta compra' : ''}</span></p>
        <ol class="comeback-stamps" aria-label="${count} de ${required} sellos${card.currentPurchaseOnly ? ', solo esta compra' : ''}">${Array.from({ length: required }, (_, i) => `<li data-earned="${i < count}"${i === count - 1 ? ' data-latest' : ''} aria-label="Sello ${i + 1}, ${i < count ? 'completado' : 'pendiente'}"><span class="comeback-stamp" aria-hidden="true">${stamp}</span></li>`).join('')}</ol>
        <div class="comeback-meter" aria-hidden="true"><span></span></div>
        <p class="comeback-progress">${card.code ? '¡Tu premio está listo!' : card.currentPurchaseOnly ? `Esta compra suma tu sello de hoy. Te ${remaining === 1 ? 'falta 1 compra' : `faltan ${remaining} compras`} para tu premio.` : `${visits} ${visits === 1 ? 'día de compras' : 'días de compras'} · ${remaining === 1 ? 'Falta 1' : `Faltan ${remaining}`} para tu premio.`}</p>
        <div class="comeback-prize">${gift}<div><small>Tu premio</small><p class="comeback-reward">${escape(card.rewardLabel)}</p></div></div>
        <footer class="comeback-foot"><span>${escape(card.customerName || 'Cliente')}</span><span>${escape(rewards)}</span></footer>
        ${/^data:image\/png;base64,[a-z\d+/=]+$/i.test(card.qrImageDataUrl || '') ? `<figure class="comeback-qr"><img src="${card.qrImageDataUrl}" width="144" height="144" alt="${card.code ? 'QR para canjear el premio' : 'QR para volver a abrir tu tarjeta'}"><figcaption>${card.code ? 'Muestra tu premio' : 'Guarda tu tarjeta'}</figcaption></figure>` : ''}
        ${card.code ? `<code class="comeback-code">${escape(card.code)}</code>` : ''}
      </article>
      <p class="comeback-note">${card.currentPurchaseOnly ? 'Aquí ves solo esta compra. Abre tu tarjeta privada desde el correo para consultar todos tus sellos y premios. Un sello por día.' : 'Usa el mismo correo al comprar. Un sello por día; las compras totalmente reembolsadas no cuentan.'}</p>
      ${card.currentPurchaseOnly && options.onEmail && card.emailAvailable ? '<button type="button" class="comeback-action" data-comeback-email>Ver mi tarjeta completa por correo</button>' : ''}
      ${cardUrl ? `<a class="comeback-action" href="${escape(cardUrl)}" target="_blank" rel="noreferrer noopener">Abrir enlace para guardar</a>` : ''}
      <p class="comeback-note" role="status" aria-live="polite"></p>
    </div>`;
    const wrap = el.querySelector('.comeback-wrap');
    wrap.querySelector('.comeback-meter span').style.width = `${Math.round(count / required * 100)}%`;
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
  // Spec 2026-11-09 popup looks: six built looks; a store keeps only the id (the API picks one for every store). Colours come from the
  // signup host (--signup-paper/-ink/-accent, from the store's own tokens); text never sits on the photo and never under 12px.
  const K = '[data-popup-kit] ';
  const LOOK_TYPE = `${K}pya-title{font:400 clamp(34px,4vw,46px)/1.05 var(--signup-heading);letter-spacing:-.02em;margin:12px 0 10px}${K}pya-text{font-size:16px;line-height:1.55;margin:0 0 22px}${K}.kick{display:block;font:600 12px/1.4 var(--signup-body);letter-spacing:.18em;text-transform:uppercase;color:var(--signup-ink)}${K}pya-code{font-size:13px;margin-top:12px}`;
  const LOOK_WORDS = '<span class="kick">{name}</span><pya-title></pya-title><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code>';
  const POPUP_LOOKS = {
    clasica: { html: `<div class="lk lk-clasica"><pya-photo></pya-photo><div class="p">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-clasica{display:grid;grid-template-columns:1fr 1fr;min-height:540px}${K}.lk-clasica .p{padding:56px 48px 44px;background:var(--signup-paper)}@media(max-width:700px){${K}.lk-clasica{grid-template-columns:1fr;min-height:0}${K}.lk-clasica pya-photo{height:190px}${K}.lk-clasica .p{padding:24px}}` },
    portada: { html: `<div class="lk lk-portada"><pya-photo></pya-photo><div class="p">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-portada pya-photo{height:300px}${K}.lk-portada .p{padding:40px 72px 44px;text-align:center;background:var(--signup-paper)}${K}.lk-portada pya-title{font-family:var(--signup-body);font-weight:800;text-transform:uppercase;letter-spacing:-.03em}${K}.lk-portada pya-text{max-width:520px;margin-left:auto;margin-right:auto}${K}.lk-portada pya-form{max-width:560px;margin:0 auto;text-align:left}@media(max-width:700px){${K}.lk-portada pya-photo{height:200px}${K}.lk-portada .p{padding:24px}}` },
    cartel: { html: `<div class="lk lk-cartel"><pya-photo></pya-photo><div class="card">${LOOK_WORDS}</div></div>`,
      css: `${K}.lk-cartel{position:relative;min-height:600px;display:flex;align-items:center;justify-content:flex-end;padding:40px}${K}.lk-cartel>pya-photo{position:absolute;inset:0}${K}.lk-cartel .card{position:relative;width:440px;max-width:100%;background:var(--signup-paper);padding:36px;box-shadow:0 20px 60px #0004}@media(max-width:700px){${K}.lk-cartel{display:block;padding:0;min-height:0}${K}.lk-cartel>pya-photo{position:relative;height:200px}${K}.lk-cartel .card{width:auto;box-shadow:none;padding:24px}}` },
    postal: { html: `<div class="lk lk-postal"><div class="frame"><div class="ph"><pya-photo></pya-photo><span class="stamp" aria-hidden="true">{initial}</span></div><div class="p"><span class="kick">Carta de {name}</span><pya-title></pya-title><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code></div></div></div>`,
      css: `${K}.lk-postal{padding:16px;background:var(--signup-paper)}${K}.lk-postal .frame{border:2px solid var(--signup-accent);display:grid;grid-template-columns:1fr 1.15fr;min-height:520px}${K}.lk-postal .ph{position:relative;padding:16px;border-right:1px dashed var(--signup-accent)}${K}.lk-postal .ph pya-photo{height:100%;min-height:300px}${K}.lk-postal .stamp{position:absolute;top:28px;right:28px;width:64px;height:64px;border:3px double var(--signup-accent);background:var(--signup-paper);display:grid;place-items:center;font:700 28px/1 var(--signup-heading);color:var(--signup-ink)}${K}.lk-postal .p{padding:40px 40px 32px}${K}.lk-postal pya-title{font-style:italic}@media(max-width:700px){${K}.lk-postal{padding:10px}${K}.lk-postal .frame{grid-template-columns:1fr;min-height:0}${K}.lk-postal .ph{border-right:0;border-bottom:1px dashed var(--signup-accent)}${K}.lk-postal .ph pya-photo{min-height:170px;height:170px}${K}.lk-postal .p{padding:22px}}` },
    revista: { html: `<div class="lk lk-revista"><div class="top"><div><span class="kick">{name}</span><pya-title></pya-title></div><pya-photo></pya-photo></div><div class="p"><pya-text></pya-text><pya-form></pya-form><pya-code></pya-code></div></div>`,
      css: `${K}.lk-revista .top{display:grid;grid-template-columns:1.3fr 1fr;gap:32px;align-items:end;padding:48px 56px 0;background:var(--signup-ink);color:var(--signup-paper)}${K}.lk-revista .top .kick{color:inherit}${K}.lk-revista .top pya-title{font-size:clamp(40px,5.5vw,64px);margin:12px 0 40px;color:inherit}${K}.lk-revista .top pya-photo{height:300px;border-radius:200px 200px 0 0}${K}.lk-revista .p{padding:32px 56px 40px;background:var(--signup-paper)}@media(max-width:700px){${K}.lk-revista .top{grid-template-columns:1fr;padding:28px 22px 0;gap:0}${K}.lk-revista .top pya-title{margin:10px 0 18px}${K}.lk-revista .top pya-photo{height:180px}${K}.lk-revista .p{padding:22px}}` },
    etiqueta: { html: `<div class="lk lk-etiqueta"><pya-photo></pya-photo>${LOOK_WORDS}</div>`,
      css: `${K}.lk-etiqueta{padding:52px 80px 44px;text-align:center;background:var(--signup-paper)}${K}.lk-etiqueta>pya-photo{width:220px;height:220px;min-height:0;border-radius:50%;margin:0 auto 22px;box-shadow:0 0 0 6px var(--signup-paper),0 0 0 8px var(--signup-accent)}${K}.lk-etiqueta pya-text{max-width:520px;margin-left:auto;margin-right:auto}${K}.lk-etiqueta pya-form{max-width:540px;margin:0 auto;text-align:left}@media(max-width:700px){${K}.lk-etiqueta{padding:28px 22px}${K}.lk-etiqueta>pya-photo{width:160px;height:160px}}` },
  };
  // Spec 2026-11-09 popup games: rasca y gana and ruleta in the popup's form slot. Everyone wins; the server draws and signs the
  // prize (demo stores and the Studio preview draw locally and never send); the code only comes with the claim.
  const GAMES = ['scratch', 'wheel'];
  const shortPrize = label => String(label).split(' de ')[0];
  function wheelSvg(slices) {
    const n = slices.length; const step = 360 / n;
    const point = deg => { const r = (deg - 90) * Math.PI / 180; return `${(Math.cos(r) * 96).toFixed(2)} ${(Math.sin(r) * 96).toFixed(2)}`; };
    return `<svg viewBox="-100 -100 200 200" aria-hidden="true">${slices.map((label, i) => {
      const a = i * step; const dark = i % 2 === 0;
      return `<path d="M0 0 L${point(a)} A96 96 0 ${step > 180 ? 1 : 0} 1 ${point(a + step)} Z" style="fill:${dark ? 'var(--signup-ink)' : 'var(--signup-paper)'};stroke:var(--signup-accent);stroke-width:2"/>`
        + `<text transform="rotate(${a + step / 2}) translate(0 -60)" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="700" style="fill:${dark ? 'var(--signup-paper)' : 'var(--signup-ink)'}">${escape(shortPrize(label))}</text>`;
    }).join('')}<circle r="14" style="fill:var(--signup-accent);stroke:var(--signup-ink);stroke-width:2"/></svg>`;
  }
  // Spec 2026-11-10 rasca y elige (owner: the bakeme.pages.dev flow for every store): the card has the business's shape, painted in the
  // store's colours; scratching strokes from the last point, so a quick swipe clears a whole stripe.
  const SHAPES = ['cookie', 'can', 'bottle', 'cup', 'flower', 'garment', 'box', 'bag'];
  const SHAPE_RATIO = { cookie: 1.35, can: 1.05, bottle: 1.05, cup: 1.25, flower: 1.15, garment: 1.1, box: 1.3, bag: 1.15, card: 1.6 };
  const seeded = n => { let state = n; return () => (state = (state * 9301 + 49297) % 233280) / 233280; };
  function shapePath(ctx, shape, w, h) {
    const u = w / 100, v = h / 100;
    ctx.beginPath();
    if (shape === 'cookie') {
      const rnd = seeded(7);
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, k = 1 + (rnd() - 0.5) * 0.05; const x = w / 2 + Math.cos(a) * w * .47 * k, y = h / 2 + Math.sin(a) * h * .45 * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    } else if (shape === 'can' || shape === 'card') {
      const x = shape === 'can' ? 27 * u : 2 * u, y = shape === 'can' ? 4 * v : 3 * v, cw = shape === 'can' ? 46 * u : 96 * u, ch = shape === 'can' ? 92 * v : 94 * v, r = Math.min(cw, ch) * .16;
      ctx.moveTo(x + r, y); ctx.arcTo(x + cw, y, x + cw, y + ch, r); ctx.arcTo(x + cw, y + ch, x, y + ch, r); ctx.arcTo(x, y + ch, x, y, r); ctx.arcTo(x, y, x + cw, y, r);
    } else if (shape === 'bottle') {
      ctx.moveTo(43 * u, 3 * v); ctx.lineTo(57 * u, 3 * v); ctx.lineTo(57 * u, 22 * v); ctx.quadraticCurveTo(70 * u, 28 * v, 70 * u, 40 * v); ctx.lineTo(70 * u, 90 * v);
      ctx.quadraticCurveTo(70 * u, 97 * v, 63 * u, 97 * v); ctx.lineTo(37 * u, 97 * v); ctx.quadraticCurveTo(30 * u, 97 * v, 30 * u, 90 * v); ctx.lineTo(30 * u, 40 * v); ctx.quadraticCurveTo(30 * u, 28 * v, 43 * u, 22 * v);
    } else if (shape === 'cup') {
      ctx.moveTo(14 * u, 12 * v); ctx.lineTo(74 * u, 12 * v); ctx.lineTo(66 * u, 92 * v); ctx.quadraticCurveTo(65 * u, 96 * v, 60 * u, 96 * v); ctx.lineTo(28 * u, 96 * v); ctx.quadraticCurveTo(23 * u, 96 * v, 22 * u, 92 * v);
      ctx.moveTo(72 * u, 30 * v); ctx.arc(76 * u, 46 * v, 16 * Math.min(u, v), -Math.PI / 2, Math.PI / 2);
    } else if (shape === 'flower') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, r = Math.min(w, h) * .2; const x = w / 2 + Math.cos(a) * r * 1.15, y = h / 2 + Math.sin(a) * r * 1.15; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    } else if (shape === 'garment') {
      ctx.moveTo(38 * u, 8 * v); ctx.quadraticCurveTo(50 * u, 0, 62 * u, 8 * v); ctx.lineTo(66 * u, 16 * v); ctx.lineTo(84 * u, 22 * v); ctx.lineTo(96 * u, 70 * v); ctx.lineTo(84 * u, 74 * v); ctx.lineTo(76 * u, 44 * v);
      ctx.lineTo(76 * u, 96 * v); ctx.lineTo(24 * u, 96 * v); ctx.lineTo(24 * u, 44 * v); ctx.lineTo(16 * u, 74 * v); ctx.lineTo(4 * u, 70 * v); ctx.lineTo(16 * u, 22 * v); ctx.lineTo(34 * u, 16 * v);
    } else if (shape === 'box') {
      ctx.rect(10 * u, 30 * v, 80 * u, 64 * v); ctx.rect(5 * u, 14 * v, 90 * u, 18 * v);
    } else {
      ctx.moveTo(14 * u, 30 * v); ctx.lineTo(86 * u, 30 * v); ctx.lineTo(90 * u, 96 * v); ctx.lineTo(10 * u, 96 * v);
    }
    ctx.closePath();
  }
  // CSS colour and font values (var(), color-mix) resolved on the page, so the canvas paints what the popup shows.
  function popupPaint(el) {
    const probe = document.createElement('span'); probe.style.display = 'none'; el.append(probe);
    const read = (property, value) => { probe.style[property] = value; return getComputedStyle(probe)[property]; };
    const paint = { ink: read('color', 'var(--signup-ink,#222)'), paper: read('color', 'var(--signup-paper,#fff)'), accent: read('color', 'var(--signup-accent,#c58b3c)'), head: read('fontFamily', 'var(--signup-heading,system-ui)') || 'system-ui, sans-serif' };
    probe.remove(); return paint;
  }
  function paintShape(canvas, shape, paint, label) {
    const ctx = canvas.getContext && canvas.getContext('2d'); if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h); ctx.save(); shapePath(ctx, shape, w, h);
    if (shape === 'cookie') {
      const g = ctx.createRadialGradient(w * .45, h * .4, w * .05, w / 2, h / 2, w * .55); g.addColorStop(0, '#f0c48f'); g.addColorStop(1, '#d99a5b'); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      const rnd = seeded(13); ctx.fillStyle = paint.ink;
      for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, w * (.012 + rnd() * .016), w * (.009 + rnd() * .011), rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (shape === 'can') {
      const g = ctx.createLinearGradient(w * .27, 0, w * .73, 0); g.addColorStop(0, '#d9d9d9'); g.addColorStop(.35, '#ffffff'); g.addColorStop(1, '#bdbdbd'); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      ctx.fillStyle = paint.accent; ctx.fillRect(0, h * .3, w, h * .4);
    } else if (shape === 'garment') {
      ctx.fillStyle = paint.ink; ctx.fill(); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(2, w * .006);
      ctx.beginPath(); ctx.moveTo(w * .46, h * .2); ctx.lineTo(w * .45, h * .34); ctx.moveTo(w * .54, h * .2); ctx.lineTo(w * .55, h * .34); ctx.rect(w * .34, h * .62, w * .32, h * .18); ctx.stroke();
    } else if (shape === 'box') {
      ctx.fillStyle = paint.accent; ctx.fill(); ctx.clip(); ctx.fillStyle = paint.ink; ctx.fillRect(w * .46, 0, w * .08, h); ctx.fillRect(0, h * .5, w, h * .06);
    } else if (shape === 'cup' || shape === 'bottle') {
      ctx.fillStyle = paint.accent; ctx.fill(); ctx.clip(); ctx.fillStyle = paint.paper; ctx.fillRect(0, h * .42, w, h * .22);
    } else if (shape === 'flower') {
      ctx.fillStyle = paint.accent; ctx.fill(); ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * .16, 0, Math.PI * 2); ctx.fillStyle = paint.ink; ctx.fill();
    } else {
      ctx.fillStyle = paint.accent; ctx.fill();
      if (shape === 'bag') { ctx.lineWidth = w * .03; ctx.strokeStyle = paint.ink; ctx.beginPath(); ctx.arc(w * .35, h * .3, w * .1, Math.PI, 0); ctx.moveTo(w * .75, h * .3); ctx.arc(w * .65, h * .3, w * .1, 0, Math.PI, true); ctx.stroke(); }
    }
    ctx.restore();
    if (!label) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${Math.round(w * (shape === 'can' || shape === 'bottle' ? .075 : .09))}px ${paint.head}`;
    ctx.lineJoin = 'round'; ctx.lineWidth = w * .016; ctx.strokeStyle = shape === 'cookie' || shape === 'can' ? paint.paper : paint.ink; ctx.fillStyle = shape === 'cookie' || shape === 'can' ? paint.ink : paint.paper;
    const lines = shape === 'can' || shape === 'bottle' || shape === 'cup' ? label.split(' ') : [label];
    lines.forEach((line, at) => { const y = h / 2 + (at - (lines.length - 1) / 2) * w * .09; ctx.strokeText(line, w / 2, y); ctx.fillText(line, w / 2, y); });
    ctx.restore();
  }
  function popupInterests(settings) {
    const saved = settings.popupInterests;
    if (saved && Array.isArray(saved.answers) && saved.answers.length >= 2) return { text: String(saved.text || '¿Qué te interesa?'), answers: saved.answers.map(a => ({ label: String(a && a.label != null ? a.label : a), icon: String((a && a.icon) || '') })).slice(0, 6) };
    if (saved === null) return null;
    const old = settings.popupQuestion;
    return old && Array.isArray(old.answers) && old.answers.length >= 2 ? { text: String(old.text || ''), answers: old.answers.map(label => ({ label: String(label), icon: '' })) } : null;
  }
  // The favourite tiles: the store's products with a photo (not sold out, never a membership); with fewer than three, the photographed
  // option values of a product (a one-soda store chooses its flavour); fewer than three in all → no step.
  function favouriteTiles(items, photoUrl, byOption) {
    const list = Array.isArray(items) ? items.filter(p => p && p.id && p.name) : [];
    const firstPhoto = value => photoUrl((Array.isArray(value.imageUrls) && value.imageUrls[0]) || value.imageUrl || '');
    const products = list.filter(p => p.fulfillmentType !== 'MEMBERSHIP' && !(typeof p.stock === 'number' && p.stock <= 0) && firstPhoto(p));
    // Live Oh Belly 2026-11-10: asked for the favourite flavour, the shopper sees the flavours, not the packs and the poster.
    const options = () => { for (const p of list) {
      const seen = new Set();
      const values = (Array.isArray(p.variants) ? p.variants : []).filter(v => v && !(typeof v.stock === 'number' && v.stock <= 0) && firstPhoto(v)).map(v => ({ value: String((v.options && v.options[0] && v.options[0].value) || v.name || ''), photo: firstPhoto(v) }))
        .filter(v => v.value && !seen.has(v.value) && seen.add(v.value));
      if (values.length >= 3) return values.slice(0, 6).map(v => ({ id: `${p.id}:${v.value}`, label: v.value, photo: v.photo }));
    } return []; };
    if (byOption) { const values = options(); if (values.length) return values; }
    if (products.length >= 3) return products.slice(0, 6).map(p => ({ id: String(p.id), label: String(p.name), photo: firstPhoto(p) }));
    return options();
  }
  function mountGame(dialog, { game, settings, formHtml, api, demo, remember, slug, items, photoUrl }) {
    const box = dialog.querySelector('.pagosya-game');
    const slices = settings.popupGameSlices.slice(0, 6).map(String);
    const shape = game === 'scratch' ? (SHAPES.includes(settings.popupShape) ? settings.popupShape : 'card') : '';
    const interests = popupInterests(settings);
    const favouriteText = settings.popupFavourite && typeof settings.popupFavourite.text === 'string' ? settings.popupFavourite.text : '¿Cuál es tu favorito?';
    // A merchant who removed the favourite question (popupFavourite null) gets no favourite step (final review M5).
    const tiles = settings.popupFavourite === null ? [] : favouriteTiles(items, photoUrl || (value => value), /sabor/i.test(favouriteText.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    const contact = settings.popupContact === 'email' ? 'email' : 'whatsapp';
    const hostedPage = window.PAGOSYA_HOSTED === true;
    const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const set = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {} };
    const gameKey = `pagosya:game:${slug}`, tabKey = `pagosya:game-tab:${slug}`, offKey = `pagosya:game-tab-off:${slug}`, doneKey = `pagosya:game-done:${slug}`;
    // One play per device: a drawn prize is kept 30 minutes and shown again, never drawn anew.
    let saved = null; try { saved = JSON.parse(get(gameKey) || 'null'); } catch {}
    if (!saved || !(saved.exp > Date.now()) || !saved.prize) saved = null;
    let revealed = false, chosen = [], favourite = null;
    const draw = async () => {
      if (saved) return saved;
      const local = () => { const at = Math.floor(Math.random() * slices.length); return { prize: { label: slices[at] }, gameToken: '', at }; };
      const result = demo || !api ? local() : await api('play', {});
      saved = { prize: result.prize, gameToken: result.gameToken || '', exp: Date.now() + 1_800_000 };
      set(gameKey, JSON.stringify(saved));
      return saved;
    };
    const say = text => { const status = box.querySelector('[role=status]'); if (status) status.textContent = text; };
    const reveal = () => { if (revealed) return; revealed = true; render('reveal'); };
    const claimed = () => { set(doneKey, '1'); set(tabKey, null); document.querySelector('.pagosya-game-tab')?.remove(); };
    const steps = at => `<div class="game-steps" aria-hidden="true">${[1, 2, 3].map(i => `<i${i <= at ? ' class="on"' : ''}></i>`).join('')}</div>`;
    const afterClaim = () => render(interests ? 'interests' : tiles.length >= 3 ? 'favourite' : 'contact');
    const afterInterests = () => render(tiles.length >= 3 ? 'favourite' : 'contact');
    // The favourite: remembered on this device (the parent page keeps it on a published store), and the store page takes the shopper to it.
    const goFavourite = () => {
      if (!favourite) { dialog.close(); return; }
      set(`pagosya:fav:${slug}`, favourite.id);
      if (hostedPage) { try { parent.postMessage({ type: 'pagosya:favourite', id: favourite.id }, '*'); } catch {} }
      document.dispatchEvent(new CustomEvent('pagosya:favourite', { detail: { id: favourite.id, go: true } }));
      dialog.close();
    };
    const paintScratch = () => {
      const canvas = box.querySelector('canvas'); const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      paintShape(canvas, shape, popupPaint(dialog), 'RASCA AQUÍ');
      const w = canvas.width, h = canvas.height;
      const opaque = () => { const data = ctx.getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < data.length; i += 32) if (data[i] > 40) n++; return n; };
      const start = opaque() || 1;
      let moves = 0, last = null, started = false;
      const at = event => { const r = canvas.getBoundingClientRect(); return [(event.clientX - r.left) * w / r.width, (event.clientY - r.top) * h / r.height]; };
      const check = () => { if (saved && !revealed && 1 - opaque() / start >= 0.45) reveal(); };
      const scratch = async event => {
        if (revealed) return;
        if (!started) { started = true; try { await draw(); box.querySelector('.game-prize').textContent = saved.prize.label; } catch (error) { say(error.message); } }
        const [x, y] = at(event);
        ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w * (shape === 'can' || shape === 'bottle' ? .17 : .12);
        ctx.beginPath(); ctx.moveTo(...(last || [x + .1, y])); ctx.lineTo(x, y); ctx.stroke(); last = [x, y];
        if (++moves % 3 === 0) check();
      };
      canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture?.(event.pointerId); last = null; scratch(event); });
      // Owner 2026-11-09 («scratching does nothing»): a mouse scratches just by moving over the card; touch and pen while pressed.
      canvas.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' || event.buttons || event.pointerType === 'touch') scratch(event); });
      canvas.addEventListener('pointerup', () => { last = null; check(); });
      canvas.addEventListener('pointerleave', () => { last = null; });
    };
    const spin = () => {
      const wheel = box.querySelector('.game-wheel svg');
      const at = Math.max(0, slices.indexOf(saved.prize.label));
      const turn = 1800 + 360 - (at + 0.5) * (360 / slices.length);
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { reveal(); return; }
      wheel.style.transition = 'transform 4s cubic-bezier(.17,.67,.2,1)';
      wheel.addEventListener('transitionend', reveal, { once: true });
      setTimeout(reveal, 4600);
      requestAnimationFrame(() => { wheel.style.transform = `rotate(${turn}deg)`; });
    };
    const contactForm = () => {
      const button = favourite ? `Suscribirme y ver ${escape(favourite.label)}` : escape(settings.signupButton || 'Recibir mi código');
      if (contact === 'email') return formHtml.replace(/(<button type="submit" class="signup-submit">)[^<]*/, `$1${button}`);
      return `<form><div class="signup-row"><label class="signup-field">Tu WhatsApp<input type="tel" name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="7xx xxxxx" required></label><button type="submit" class="signup-submit">${button}</button></div>
              <label class="signup-consent"><input type="checkbox" name="consent" required>Quiero recibir novedades y promociones de esta tienda por WhatsApp. Puedo pedir que dejen de escribirme cuando quiera.</label>
            </form><p role="status" aria-live="polite"></p>`;
    };
    const submit = async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]');
      if (button.disabled || !form.reportValidity()) return;
      const data = new FormData(form); button.disabled = true; say('Un momento…');
      const done = code => {
        remember(); claimed(); form.hidden = true;
        say(code ? '¡Listo! Este es tu código de descuento:' : 'Prueba completada: en tu tienda aquí llega tu código.');
        const status = box.querySelector('[role=status]');
        if (code) status.insertAdjacentHTML('afterend', `<p class="signup-code"><strong>${escape(code)}</strong> <button type="button" data-copy>Copiar</button></p>`);
        if (favourite) (box.querySelector('.signup-code') || status).insertAdjacentHTML('afterend', `<button type="button" class="signup-submit" data-game-action="go">Ver ${escape(favourite.label)}</button>`);
        box.querySelector('.game-skip[data-game-action=nothanks]')?.remove();
        const copy = box.querySelector('.signup-code [data-copy]');
        copy?.addEventListener('click', async () => { try { await navigator.clipboard?.writeText(code); copy.textContent = 'Copiado'; } catch {} });
      };
      if (demo) { done(''); return; }
      try {
        const contactValue = contact === 'email' ? { email: String(data.get('email') ?? '').trim() || undefined } : { phone: String(data.get('phone') ?? '').trim() || undefined };
        const result = await api('subscribe', { ...contactValue, consent: true, source: 'popup', ...(saved?.gameToken ? { gameToken: saved.gameToken } : {}),
          ...(chosen.length ? { answers: chosen } : {}), ...(favourite ? { favourite: favourite.id } : {}), ...(hostedPage ? { contact } : {}) });
        if (result?.code) done(result.code);
        else { remember(); claimed(); form.hidden = true; say(result?.message || '¡Ya formas parte de nuestra comunidad!'); if (favourite) box.querySelector('[role=status]').insertAdjacentHTML('afterend', `<button type="button" class="signup-submit" data-game-action="go">Ver ${escape(favourite.label)}</button>`); }
      } catch (error) { say(error.message); button.disabled = false; }
    };
    function render(step) {
      box.setAttribute('data-game-step', step);
      if (step === 'play') {
        const ratio = SHAPE_RATIO[shape] || 1.6;
        box.innerHTML = (game === 'scratch'
          ? `<div class="game-scratch" data-game-play data-shape="${shape}" style="--ratio:${ratio}"><p class="game-prize"></p><canvas width="560" height="${Math.round(560 / ratio)}" aria-hidden="true"></canvas></div><button type="button" class="game-skip" data-game-action="play">Revelar sin rascar</button>`
          : `<div class="game-wheel" data-game-play>${wheelSvg(slices)}<span class="game-pointer" aria-hidden="true"></span></div><button type="button" class="signup-submit" data-game-action="play">Girar</button>`)
          + '<p class="game-status" role="status" aria-live="polite"></p>';
        if (game === 'scratch') paintScratch();
      } else if (step === 'reveal') {
        box.innerHTML = `<p class="game-won" role="status">¡Ganaste <strong>${escape(saved.prize.label)}</strong>!</p><button type="button" class="signup-submit" data-game-action="claim">Reclamar</button>`;
      } else if (step === 'interests') {
        box.innerHTML = `${steps(1)}<p class="game-question">${escape(interests.text)}</p><p class="game-hint">Puedes elegir varias.</p>
          <div class="game-answers">${interests.answers.map((answer, at) => `<button type="button" class="game-answer game-interest" aria-pressed="false" data-game-interest="${at}">${answer.icon ? `<span aria-hidden="true">${escape(answer.icon)}</span> ` : ''}${escape(answer.label)}</button>`).join('')}</div>
          <button type="button" class="signup-submit" data-game-action="next" disabled>Siguiente</button><button type="button" class="game-skip" data-game-action="skip">Saltar</button>`;
      } else if (step === 'favourite') {
        box.innerHTML = `${steps(2)}${chosen.length ? `<p class="game-chip">${escape(chosen.join(' · '))}</p>` : ''}<p class="game-question">${escape(favouriteText)}</p>
          <div class="game-tiles">${tiles.map((tile, at) => `<button type="button" class="game-tile" data-game-tile="${at}"><img src="${escape(tile.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${escape(tile.label)}</span></button>`).join('')}</div>
          <button type="button" class="game-skip" data-game-action="skipfav">Saltar</button>`;
      } else {
        box.innerHTML = `${interests || tiles.length >= 3 ? steps(3) : ''}${favourite ? `<p class="game-chip">Tu favorito: ${escape(favourite.label)}</p>` : ''}<p class="game-won">Tu premio: <strong>${escape(saved.prize.label)}</strong></p>${contactForm()}
          ${favourite ? `<button type="button" class="game-skip" data-game-action="nothanks">No, gracias: solo ver ${escape(favourite.label)}</button>` : ''}`;
        secureFields(box.querySelector('form'));
        box.querySelector('form').addEventListener('submit', submit);
      }
    }
    box.addEventListener('click', async event => {
      const interest = event.target.closest('[data-game-interest]');
      if (interest) {
        interest.setAttribute('aria-pressed', String(interest.getAttribute('aria-pressed') !== 'true'));
        chosen = [...box.querySelectorAll('[data-game-interest][aria-pressed="true"]')].map(b => interests.answers[Number(b.dataset.gameInterest)].label);
        box.querySelector('[data-game-action=next]').disabled = !chosen.length;
        return;
      }
      const tile = event.target.closest('[data-game-tile]');
      if (tile) { favourite = tiles[Number(tile.dataset.gameTile)]; render('contact'); return; }
      const target = event.target.closest('[data-game-action]');
      if (!target) return;
      const action = target.getAttribute('data-game-action');
      if (action === 'play') {
        target.disabled = true;
        try { await draw(); } catch (error) { target.disabled = false; say(error.message); return; }
        if (game === 'scratch') reveal(); else spin();
      } else if (action === 'claim') afterClaim();
      else if (action === 'next') afterInterests();
      else if (action === 'skip') { chosen = []; afterInterests(); }
      else if (action === 'skipfav') { favourite = null; render('contact'); }
      else if (action === 'nothanks' || action === 'go') goFavourite();
    });
    // The corner tab: closed without claiming, «Rasca y gana» (with the card's shape) stays on later pages (hidden 30 days by ×).
    const showTab = () => {
      const off = Number(get(offKey));
      if (get(doneKey) || (off && Date.now() - off < 30 * 86_400_000) || document.querySelector('.pagosya-game-tab') || document.querySelector('[data-pagosya-checkout-page], .pya-checkout:not([hidden])')) return;
      const tab = document.createElement('div'); tab.className = 'pagosya-game-tab';
      tab.innerHTML = `<button type="button" data-game-tab>${shape && shape !== 'card' ? '<canvas class="game-tab-shape" width="80" height="80" aria-hidden="true"></canvas>Rasca y gana' : 'Prueba tu suerte'}</button><button type="button" data-game-tab-off aria-label="Ocultar">×</button>`;
      tab.querySelector('[data-game-tab]').addEventListener('click', () => { tab.remove(); if (!dialog.open && !document.querySelector('dialog[open]')) dialog.showModal(); });
      tab.querySelector('[data-game-tab-off]').addEventListener('click', () => { set(offKey, String(Date.now())); tab.remove(); });
      document.body.append(tab);
      const icon = tab.querySelector('canvas'); if (icon) paintShape(icon, shape, popupPaint(dialog), '');
    };
    dialog.addEventListener('close', () => { if (!get(doneKey)) { set(tabKey, '1'); showTab(); } });
    if (get(tabKey)) showTab();
    render(saved ? 'reveal' : 'play');
    if (saved) revealed = true;
  }

  // Popups 2.0 (spec 2026-11-18 §7): a YAPI-written design — its own markup per step and its own scoped sheet — played here. YAPI
  // never writes script: the steps carry data-* hooks and this runtime does the logic (products, contact, code, cart, landing).
  function mountFlow(dialog, design, { api, demo, remember, slug, items, startAt, apiBaseUrl }) {
    const hostedPage = Boolean(window.PAGOSYA_HOSTED);
    // Photos YAPI wrote as /v1/uploads/… live on the API (a published store's frame resolves paths against another origin).
    const apiOrigin = String(apiBaseUrl || '').replace(/\/v1\/?$/, '');
    const upload = value => apiOrigin && /^\/v1\/uploads\//.test(value) ? `${apiOrigin}${value}` : value;
    const sheet = document.createElement('style');
    sheet.textContent = String(design.css || '').replace(/url\(\s*(["']?)(\/v1\/uploads\/[^"')\s]+)\1\s*\)/g, (_, quote, path) => `url(${quote}${upload(path)}${quote})`);
    const root = document.createElement('div'); root.setAttribute('data-pya-popup', String(design.id || ''));
    const steps = (Array.isArray(design.flow) ? design.flow : []).filter(step => step && step.kind);
    const land = steps.find(step => step.kind === 'land');
    const product = id => (items || []).find(item => item && item.id === id && item.active !== false && item.archived !== true);
    const live = step => step.kind === 'pick' ? (step.products || []).filter(product).length >= 2
      : step.kind === 'quiz' ? (step.questions || []).some(question => (question.answers || []).some(answer => (answer.products || []).some(product))) : true;
    const shown = steps.filter(step => step.kind !== 'land' && typeof design.steps?.[step.id] === 'string' && live(step));
    // A design with no step this page can play (malformed, or every product gone) leaves the classic popup in place.
    if (!shown.length || !shown.some(step => step.kind === 'capture')) return false;
    dialog.classList.add('pagosya-flow');
    dialog.replaceChildren(sheet, root);
    const memory = { answers: [], favourite: '', code: '', busy: false };
    let at = Math.max(0, shown.findIndex(step => step.id === startAt));
    const money = value => typeof value === 'number' ? `Bs ${(value / 100).toLocaleString('es-BO', { minimumFractionDigits: value % 100 ? 2 : 0 })}` : String(value ?? '');
    let applied = false;
    const applyCode = () => {
      if (applied || !memory.code) return; applied = true;
      if (hostedPage) { try { parent.postMessage({ type: 'pagosya:apply-promo', code: memory.code }, '*'); } catch {} }
      document.dispatchEvent(new CustomEvent('pagosya:apply-promo', { detail: { code: memory.code } }));
    };
    const finish = () => {
      applyCode();
      if (land && memory.favourite) {
        try { localStorage.setItem(`pagosya:fav:${slug}`, memory.favourite); } catch {}
        if (hostedPage) { try { parent.postMessage({ type: 'pagosya:favourite', id: memory.favourite }, '*'); } catch {} }
        document.dispatchEvent(new CustomEvent('pagosya:favourite', { detail: { id: memory.favourite, go: land.to !== 'scroll' } }));
      }
      dialog.close();
    };
    const next = () => { if (at + 1 < shown.length) { at += 1; draw(); } else finish(); };
    const back = () => { if (at > 0) { at -= 1; draw(); } };
    function draw() {
      const step = shown[at];
      if (!step) { dialog.close(); return; }
      root.innerHTML = design.steps[step.id];
      // Decoration may burst past the edges (Fishwife-style); it is never read aloud nor in the way of a tap.
      root.querySelectorAll('[data-art]').forEach(el => el.setAttribute('aria-hidden', 'true'));
      root.querySelectorAll('img[src], source[srcset], img[srcset]').forEach(img => {
        if (img.hasAttribute('src')) img.setAttribute('src', upload(img.getAttribute('src')));
        if (img.hasAttribute('srcset')) img.setAttribute('srcset', img.getAttribute('srcset').split(',').map(part => { const [url, ...rest] = part.trim().split(/\s+/); return [upload(url), ...rest].join(' '); }).join(', '));
      });
      root.setAttribute('data-step', step.kind);
      root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { remember(); if (memory.code) applyCode(); dialog.close(); }));
      root.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click', back));
      root.querySelectorAll('[data-next]').forEach(el => el.addEventListener('click', next));
      if (step.kind === 'pick') {
        const tile = root.querySelector('[data-tile]');
        if (tile) {
          for (const id of (step.products || []).filter(product)) {
            const item = product(id), copy = tile.cloneNode(true);
            const photo = copy.querySelector('[data-slot=photo]');
            if (photo) { photo.setAttribute('src', (item.imageUrls || []).find(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) || ''); photo.setAttribute('alt', item.name || ''); }
            const nameSlot = copy.querySelector('[data-slot=name]'); if (nameSlot) nameSlot.textContent = item.name || '';
            const priceSlot = copy.querySelector('[data-slot=price]'); if (priceSlot) priceSlot.textContent = money(item.price);
            copy.setAttribute('tabindex', '0'); copy.setAttribute('role', 'button');
            const choose = () => { memory.favourite = id; next(); };
            copy.addEventListener('click', choose);
            copy.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
            tile.before(copy);
          }
          tile.remove();
        }
      }
      if (step.kind === 'quiz') {
        const questions = Array.isArray(step.questions) ? step.questions : [];
        let q = 0, pool = null;
        const template = root.querySelector('[data-choice]'), label = root.querySelector('[data-question]');
        const marker = document.createComment('choices');
        const choice = template ? template.cloneNode(true) : null;
        if (template) template.replaceWith(marker);
        const ask = () => {
          const question = questions[q];
          if (!question || !choice || !label) { next(); return; }
          label.textContent = question.text || '';
          root.querySelectorAll('[data-choice-copy]').forEach(el => el.remove());
          for (const answer of question.answers || []) {
            const copy = choice.cloneNode(true); copy.setAttribute('data-choice-copy', answer.id || '');
            const words = copy.querySelector('[data-slot=answer]') || Array.from(copy.querySelectorAll('*')).find(el => Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim())) || copy;
            if (words === copy && copy.children.length) { const text = Array.from(copy.childNodes).find(node => node.nodeType === 3 && node.textContent.trim()); if (text) text.textContent = answer.text || ''; else copy.prepend(document.createTextNode(answer.text || '')); }
            else words.textContent = answer.text || '';
            copy.hidden = false;
            copy.addEventListener('click', () => {
              memory.answers.push(answer.text || '');
              const found = (answer.products || []).filter(product);
              pool = pool ? pool.filter(id => found.includes(id)) : found;
              if (!pool.length) pool = found;
              memory.favourite = pool[0] || memory.favourite;
              q += 1; if (q < questions.length) ask(); else next();
            });
            marker.before(copy);
          }
        };
        ask();
      }
      if (step.kind === 'capture') {
        const field = root.querySelector('[data-field]'), submit = root.querySelector('[data-submit]'), error = root.querySelector('[data-slot=error]');
        const say = text => { if (error) error.textContent = text; else { let line = root.querySelector('.pagosya-flow-error'); if (!line) { line = document.createElement('p'); line.className = 'pagosya-flow-error'; line.setAttribute('role', 'status'); root.append(line); } line.textContent = text; } };
        const email = design.capture === 'email';
        root.querySelectorAll('[data-slot=contact]').forEach(el => { el.textContent = email ? 'tu correo' : 'tu WhatsApp'; });
        if (field) {
          field.setAttribute('type', email ? 'email' : 'tel'); field.setAttribute('autocomplete', email ? 'email' : 'tel'); field.setAttribute('inputmode', email ? 'email' : 'tel');
          field.setAttribute('placeholder', email ? 'tu@correo.com' : 'Tu número de WhatsApp'); field.setAttribute('aria-label', email ? 'Tu correo' : 'Tu WhatsApp');
        }
        const send = async () => {
          if (memory.busy) return;
          const value = String(field?.value || '').trim();
          if (design.capture === 'email' ? !/^\S+@\S+\.\S+$/.test(value) : value.replace(/\D/g, '').length < 8) { say(design.capture === 'email' ? 'Escribe tu correo.' : 'Escribe tu WhatsApp con 8 números.'); return; }
          memory.busy = true; if (submit) submit.disabled = true;
          try {
            const body = { ...(design.capture === 'email' ? { email: value } : { phone: value }), contact: design.capture === 'email' ? 'email' : 'whatsapp', consent: true, source: 'popup', popupDesignId: design.id, answers: memory.answers, favourite: memory.favourite || undefined };
            const answer = demo ? { code: 'POPDEMO10' } : await api('subscribe', body);
            memory.code = answer?.code || '';
            remember();
            next();
          } catch (failure) { say(failure?.message || 'No se pudo completar. Intenta de nuevo.'); }
          finally { memory.busy = false; if (submit) submit.disabled = false; }
        };
        submit?.addEventListener('click', event => { event.preventDefault(); void send(); });
        field?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void send(); } });
        // The consent is the platform's, never the design's words.
        const consent = document.createElement('small'); consent.className = 'pagosya-flow-consent';
        consent.textContent = design.capture === 'email' ? 'Al enviar aceptas recibir novedades de esta tienda por correo; puedes darte de baja cuando quieras.' : 'Al enviar aceptas que esta tienda te escriba por WhatsApp; puedes pedir que no lo haga cuando quieras.';
        (submit?.parentElement || root).append(consent);
      }
      if (step.kind === 'reveal') {
        root.querySelectorAll('[data-slot=code]').forEach(el => { el.textContent = memory.code; });
        root.querySelectorAll('[data-slot=percent]').forEach(el => { el.textContent = `${design.percent}%`; });
      }
      (root.querySelector('[data-next],[data-field],[data-tile],[data-choice-copy],button') || root).focus?.();
    }
    // YAPI's launcher: a small tab in a corner after the shopper closes without the code; it opens the popup again from the start.
    const preview = Boolean(dialog.closest('[data-pagosya-popup-preview]'));
    dialog.addEventListener('close', () => {
      if (preview || memory.code || typeof design.launcher !== 'string' || !design.launcher.trim() || document.querySelector('[data-pya-launcher]')) return;
      const holder = document.createElement('div'); holder.setAttribute('data-pya-launcher', '');
      holder.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000';
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', 'Abrir la oferta');
      button.style.cssText = 'all:unset;cursor:pointer;display:block';
      const scope = document.createElement('span'); scope.style.display = 'block'; scope.setAttribute('data-pya-popup', String(design.id || ''));
      scope.innerHTML = design.launcher;
      button.append(scope); holder.append(button);
      button.addEventListener('click', () => { holder.remove(); at = 0; draw(); if (!dialog.open) dialog.showModal(); });
      document.body.append(holder);
    });
    draw();
    return true;
  }

  function mountSignup(host, settings, config, state, api, preview, query, demo = false) {
    host.className = 'pagosya-signup-host';
    if (!document.getElementById('pagosya-signup-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-signup-style';
      style.textContent = `
        .pagosya-signup-host{--signup-paper:var(--store-background,#f3eddf);--signup-ink:var(--store-foreground,#26221c);--signup-accent:var(--store-accent,var(--signup-ink));--signup-accent-ink:var(--store-accent-foreground,var(--signup-paper));--signup-heading:var(--store-heading-font,Georgia,serif);--signup-body:var(--store-body-font,system-ui,sans-serif);--signup-radius:min(var(--store-radius,3px),24px);display:block;width:100%;font:inherit;color:inherit}.pagosya-signup-host *{box-sizing:border-box}
        .pagosya-signup-dialog{position:fixed;inset:0;width:min(1000px,calc(100% - 48px));max-width:none;max-height:calc(100dvh - 48px);margin:auto;padding:0;border:0;border-radius:var(--signup-radius);background:var(--signup-paper,#f3eddf);color:var(--signup-ink,#26221c);font:16px/1.6 var(--signup-body);overflow:auto;overscroll-behavior:contain;box-shadow:0 24px 80px #0003}
        .pagosya-signup-dialog::backdrop{background:rgb(24 22 17 / .6)}
        .pagosya-signup-dialog.pagosya-flow{width:100%;max-width:100%;height:100%;max-height:100%;margin:0;padding:12px;box-sizing:border-box;border:0;background:transparent;box-shadow:none;overflow:auto;border-radius:0}.pagosya-signup-dialog.pagosya-flow[open]{display:flex;overflow-x:hidden}.pagosya-flow [data-art]{pointer-events:none;user-select:none}.pagosya-flow>[data-pya-popup]{margin:auto;max-width:100%;flex:0 1 auto}:where(.pagosya-flow>[data-pya-popup]){width:100%}.pagosya-signup-dialog.pagosya-flow>[data-pya-popup]>*{margin-left:auto;margin-right:auto}.pagosya-flow-consent{display:block;margin-top:8px;font:12px/1.5 var(--signup-body);opacity:.8}
        .pagosya-signup-layout{display:grid;grid-template-columns:1fr 1fr;min-height:580px}
        .pagosya-signup-photo{margin:0;min-height:100%;background:color-mix(in srgb,var(--signup-paper),var(--signup-accent) 22%);position:relative;overflow:hidden}.pagosya-signup-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .pagosya-signup-photo .signup-monogram{display:grid;place-items:center;height:100%;min-height:450px;font:clamp(80px,14vw,180px)/1 var(--signup-heading);color:var(--signup-accent);opacity:.85}
        .pagosya-signup-copy{padding:48px 44px 36px;min-width:0}.pagosya-signup-copy .signup-eyebrow{margin:0 36px 22px 0;font:600 11px/1.5 var(--signup-body);letter-spacing:.17em;text-transform:uppercase;overflow-wrap:anywhere;color:var(--signup-accent)}
        .pagosya-signup-copy h2{margin:0 0 24px;font:400 clamp(28px,3.4vw,42px)/1.18 var(--signup-heading);letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere;color:inherit}.pagosya-signup-copy h2:focus{outline:none}
        .pagosya-signup-copy .signup-description{margin:0 0 24px;font:16px/1.65 var(--signup-body);color:inherit}.pagosya-signup-copy form{display:grid;gap:20px;max-width:none}.pagosya-signup-copy form[hidden]{display:none}
        .pagosya-signup-copy fieldset{padding:0;margin:0;border:0;min-width:0}.pagosya-signup-copy legend{padding:0;margin:0 0 12px;font:12px/1.5 var(--signup-body);text-transform:uppercase;letter-spacing:.08em}.signup-interests{display:flex;flex-wrap:wrap;gap:12px 20px}
        .signup-interests label{display:flex;align-items:center;gap:8px;font:14px/1.5 var(--signup-body);cursor:pointer}.pagosya-signup-copy input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:var(--signup-ink);flex:0 0 18px}
        .pagosya-signup-copy .signup-field{display:grid;gap:2px;font:13px/1.5 var(--signup-body)}.pagosya-signup-copy .signup-field{gap:6px}.pagosya-signup-copy .signup-field input{border:1.5px solid color-mix(in srgb,var(--signup-ink),transparent 45%);border-radius:min(var(--store-radius,3px),14px);background:color-mix(in srgb,var(--signup-paper),#fff 45%);color:inherit;font:16px/1.5 var(--signup-body);min-height:46px;padding:10px 14px;width:100%;min-width:0;box-shadow:none}
        .pagosya-signup-copy .signup-consent{display:flex;align-items:flex-start;gap:10px;font:12px/1.6 var(--signup-body);cursor:pointer}.signup-consent input{margin-top:2px!important}
        .pagosya-signup-copy .signup-submit{justify-self:start;padding:0 28px;margin:0;min-height:48px;border:0;border-radius:var(--store-radius,3px);background:var(--signup-accent);color:var(--signup-accent-ink);font:700 15px/1.5 var(--signup-body);letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.signup-submit:hover{filter:brightness(.92)}.pagosya-signup-copy .signup-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.pagosya-signup-copy .signup-row .signup-submit{justify-self:stretch}.signup-row .pagosya-secure-note{grid-column:1/-1}.pagosya-game{display:grid;gap:14px;justify-items:center;text-align:center}.pagosya-game .signup-submit{justify-self:center}.game-scratch,.game-wheel{position:relative;width:min(320px,100%);min-height:180px}.game-scratch canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:12px;touch-action:none;cursor:pointer}.game-prize{display:grid;place-items:center;height:180px;margin:0;font:700 22px/1.2 var(--signup-heading)}.game-wheel svg{display:block;width:100%;height:auto;aspect-ratio:1}.game-pointer{position:absolute;top:-4px;left:50%;translate:-50% 0;border:12px solid transparent;border-top:20px solid var(--signup-ink)}.pagosya-signup-copy .pagosya-game .game-won{margin:0;font:400 28px/1.25 var(--signup-heading)}.pagosya-game .game-won strong{font-weight:700}.game-question{margin:0;font:600 18px/1.3 var(--signup-body)}.game-answers{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.game-answer{min-height:44px;padding:0 16px;border:1.5px solid var(--signup-ink);border-radius:999px;background:transparent;color:inherit;font:600 14px var(--signup-body);cursor:pointer}.game-skip{background:none;border:0;color:inherit;text-decoration:underline;font:13px var(--signup-body);cursor:pointer}.game-status:empty{display:none}.game-scratch{width:min(300px,100%);aspect-ratio:var(--ratio,1.6);min-height:170px}.game-scratch .game-prize{position:absolute;inset:10%;height:auto;display:grid;place-items:center;border-radius:16px;background:var(--signup-accent);color:var(--signup-paper);text-align:center;padding:8px}.game-scratch[data-shape=cookie] .game-prize,.game-scratch[data-shape=flower] .game-prize{border-radius:50%}.game-scratch[data-shape=can] .game-prize{inset:8% 29%}.game-scratch[data-shape=bottle] .game-prize{inset:30% 32% 6%}.game-scratch[data-shape=cup] .game-prize{inset:16% 30% 8% 18%}.game-scratch[data-shape=garment] .game-prize{inset:22% 27% 6%}.game-scratch[data-shape=flower] .game-prize{inset:22%}.game-scratch[data-shape=bag] .game-prize{inset:34% 18% 6%}.game-scratch[data-shape=box] .game-prize{inset:34% 13% 8%}.game-steps{display:flex;gap:6px;justify-content:center}.game-steps i{width:22px;height:5px;border-radius:9px;background:color-mix(in srgb,var(--signup-ink) 18%,transparent)}.game-steps i.on{background:var(--signup-ink)}.game-hint{margin:-6px 0 0;font:13px var(--signup-body);opacity:.75}.game-interest[aria-pressed=true]{background:var(--signup-ink);color:var(--signup-paper)}.game-chip{margin:0;padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--signup-accent) 18%,var(--signup-paper));font:700 13px/1.2 var(--signup-body);text-transform:uppercase;letter-spacing:.06em}.game-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%}.game-tile{display:grid;gap:6px;padding:6px 6px 8px;border:2px solid transparent;border-radius:14px;background:color-mix(in srgb,var(--signup-accent) 14%,var(--signup-paper));color:inherit;font:700 13px/1.2 var(--signup-body);cursor:pointer}.game-tile:hover,.game-tile:focus-visible{border-color:var(--signup-ink)}.game-tile img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block}.pagosya-game-tab [data-game-tab]{display:inline-flex;align-items:center;gap:8px}.game-tab-shape{width:32px;height:32px}@media(max-width:480px){.game-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}.pagosya-game-tab{position:fixed;left:16px;bottom:16px;z-index:40;display:flex;align-items:stretch;background:var(--store-foreground,#111);color:var(--store-background,#fff);border-radius:4px;box-shadow:0 8px 24px #0003}.pagosya-game-tab button{background:none;border:0;color:inherit;font:700 13px/1 var(--store-body-font,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;padding:0 14px;min-height:44px;cursor:pointer}@media(max-width:480px){.pagosya-signup-copy .signup-row{grid-template-columns:1fr}}.signup-submit:disabled{opacity:.55;cursor:wait}
        .pagosya-signup-dialog .signup-close{position:absolute;top:20px;right:20px;z-index:20;width:44px;height:44px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;background:color-mix(in srgb,var(--signup-paper),var(--signup-ink) 10%);color:var(--signup-ink);font:26px/1 system-ui,sans-serif;cursor:pointer}
        .pagosya-signup-host :focus-visible{outline:2px solid currentColor;outline-offset:5px}.pagosya-signup-copy [role=status]{font:14px/1.6 var(--signup-body);margin:16px 0 0}.pagosya-signup-copy [role=status]:empty{display:none}
        @media(max-width:700px){.pagosya-signup-dialog{inset:auto 0 0 0;width:100%;max-height:85dvh;margin:0;border-radius:20px 20px 0 0}.pagosya-signup-layout{grid-template-columns:1fr;min-height:0}}
        @media(max-width:700px) and (prefers-reduced-motion:no-preference){.pagosya-signup-dialog[open]{animation:pagosya-sheet-up .28s cubic-bezier(.32,.72,0,1)}}@keyframes pagosya-sheet-up{from{transform:translateY(100%)}to{transform:none}}
        .signup-code{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0 0}.signup-code strong{padding:4px 10px;border:1px dashed currentColor;border-radius:6px;letter-spacing:.08em}.signup-code button{min-height:36px;padding:0 12px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
        @media(max-width:700px){.pagosya-signup-dialog{width:calc(100% - 24px);max-height:calc(100dvh - 24px)}.pagosya-signup-layout{grid-template-columns:1fr;min-height:0}.pagosya-signup-photo{min-height:150px;height:150px}.pagosya-signup-photo .signup-monogram{min-height:150px;font-size:80px}.pagosya-signup-copy{padding:26px 24px 28px}.pagosya-signup-copy .signup-eyebrow{margin-bottom:12px}.pagosya-signup-copy h2{font-size:30px;margin-bottom:16px}.pagosya-signup-copy .signup-description{font-size:14px;margin-bottom:20px}.pagosya-signup-copy form{gap:16px}.pagosya-signup-dialog .signup-close{top:12px;right:12px}}
        @media print{.pagosya-signup-host{display:none}}
      `;
      document.head.append(style);
    }
    const visual = settings.signupVisual || {};
    const brand = visual.brand || {};
    const name = brand.name || config.data?.storeName || config.data?.name || 'Nuestra comunidad';
    const dismissedKey = `pagosya:signup-dismissed:${config.slug}`;
    const safeImage = (value, base = config.apiBaseUrl || location.href) => { if (!value) return ''; try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
    const itemImage = config.data?.items?.flatMap(item => item.imageUrls || []).find(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) || '';
    // A demo's paths sit beside its scripts; the page URL may drop its trailing slash, so it is no base for them.
    const demoBase = document.querySelector('script[src*="commerce.js"],script[src*="retention.js"]')?.src || location.href;
    const image = safeImage(visual.imageUrl) || safeImage(itemImage, demo ? demoBase : undefined);
    // Spec 2026-11-09 popup looks: the store's look (an id the API sends for every store) drawn around the platform slots; an unknown
    // id or no photo draws the built-in layout below.
    const lookId = typeof settings.popupLook === 'string' && Object.hasOwn(POPUP_LOOKS, settings.popupLook) ? settings.popupLook : '';
    // The chosen photo is an upload path on the API (the Studio proxies the API under its own base); else the built-in photo.
    const uploadPhoto = value => /^\/v1\/uploads\//.test(String(value || '')) && config.apiBaseUrl ? `${String(config.apiBaseUrl).replace(/\/v1\/?$/, '')}${value}` : value;
    const lookImage = lookId ? safeImage(uploadPhoto(settings.popupPhoto), location.href) || image : '';
    const monogram = `<span class="signup-monogram" aria-hidden="true">${escape(name.slice(0, 1))}</span>`;
    // The short form (spec 2026-11-09): email + button on one row, consent under it.
    const formHtml = `<form><div class="signup-row"><label class="signup-field">Tu correo<input type="email" name="email" autocomplete="email" maxlength="254" required></label><button type="submit" class="signup-submit">${escape(settings.signupButton)}</button></div>
              <label class="signup-consent"><input type="checkbox" name="consent" required>Quiero recibir novedades y promociones de esta tienda por correo. Puedo darme de baja cuando quiera.</label>
            </form><p role="status" aria-live="polite"></p>`;
    // Spec 2026-11-09 popup games: a game takes the form's place (its own steps draw the short form at the end).
    const game = GAMES.includes(settings.popupGame) && Array.isArray(settings.popupGameSlices) && settings.popupGameSlices.length >= 2 ? settings.popupGame : '';
    const slotForm = game ? '<div class="pagosya-game" data-game-step="play"></div>' : formHtml;
    const kitLayout = (() => {
      if (!lookId || !lookImage) return '';
      const template = document.createElement('template');
      template.innerHTML = POPUP_LOOKS[lookId].html.replaceAll('{name}', escape(name)).replaceAll('{initial}', escape(name.slice(0, 1).toUpperCase()));
      const fill = { photo: `<img src="${escape(lookImage)}" alt="${escape(name)}" referrerpolicy="no-referrer">`, title: `<h2 tabindex="-1">${escape(settings.signupTitle)}</h2>`,
        text: `<p class="signup-description">${escape(settings.signupBody)}</p>`, form: `<div class="pagosya-signup-copy pagosya-signup-copy--kit">${slotForm}</div>`,
        code: settings.popupHasCode ? '<p class="signup-code-note">Al suscribirte te llega tu código de bienvenida.</p>' : '' };
      for (const [slot, inner] of Object.entries(fill)) template.content.querySelectorAll(`pya-${slot}`).forEach(el => { el.innerHTML = inner; });
      const box = document.createElement('div'); box.className = 'pagosya-signup-kit'; box.setAttribute('data-popup-kit', ''); box.setAttribute('data-popup-look', lookId); box.append(template.content);
      return box.outerHTML;
    })();
    let kitStyle = document.getElementById('pagosya-popup-kit-style');
    if (kitLayout) {
      if (!kitStyle) { kitStyle = document.createElement('style'); kitStyle.id = 'pagosya-popup-kit-style'; document.head.append(kitStyle); }
      kitStyle.textContent = `[data-popup-kit]{display:block;min-width:0;color:var(--signup-ink);font:16px/1.6 var(--signup-body)}[data-popup-kit] :is(pya-photo,pya-title,pya-text,pya-form,pya-code){display:block;min-width:0}
[data-popup-kit] pya-photo{position:relative;overflow:hidden;min-height:160px;background:color-mix(in srgb,var(--signup-paper),var(--signup-accent) 22%)}[data-popup-kit] pya-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
[data-popup-kit] pya-photo .signup-monogram{display:grid;place-items:center;height:100%;min-height:160px;font:80px/1 var(--signup-heading);color:var(--signup-accent)}
[data-popup-kit] h2{margin:0;font:inherit;color:inherit}[data-popup-kit] h2:focus{outline:none}[data-popup-kit] .signup-description{margin:0}.pagosya-signup-copy--kit{padding:0}
${LOOK_TYPE}${POPUP_LOOKS[lookId].css}
[data-popup-kit]>*{width:auto!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
@media (prefers-reduced-motion:reduce){[data-popup-kit],[data-popup-kit] *{animation:none!important;transition:none!important}}`;
    } else kitStyle?.remove();
    // Only the popup: the in-page Comunidad block is gone (owner 2026-10-24); a design may still draw its own opener.
    host.innerHTML = `${preview && !demo ? '' : `<dialog class="pagosya-signup-dialog" aria-label="${escape(settings.signupTitle)}">
        <button type="button" class="signup-close" aria-label="Cerrar suscripción">×</button>
        ${kitLayout || `<div class="pagosya-signup-layout">
          <figure class="pagosya-signup-photo">${image ? `<img src="${escape(image)}" alt="Selección de ${escape(name)}" referrerpolicy="no-referrer">` : monogram}</figure>
          <section class="pagosya-signup-copy"><p class="signup-eyebrow">${escape(name)}</p><h2 tabindex="-1">${escape(settings.signupTitle)}</h2><p class="signup-description">${escape(settings.signupBody)}</p>
            ${slotForm}
          </section>
        </div>`}
      </dialog>`}`;
    // The page's own store tokens win; the API's brand colours and font style fill in for a page without them.
    for (const [property, token, value] of [['--signup-paper', '--store-background', brand.background], ['--signup-ink', '--store-foreground', brand.foreground]]) if (/^#[a-f\d]{6}$/i.test(value || '')) host.style.setProperty(property, `var(${token},${value})`);
    if (brand.fontStyle && !['classic', 'editorial'].includes(brand.fontStyle)) host.style.setProperty('--signup-heading', 'var(--store-heading-font,system-ui,sans-serif)');
    if (preview && !demo) return null;
    const dialog = host.querySelector('dialog');
    // Closed or answered, the popup stays away 30 days for this visitor and store (plan 2026-10-20-store-popup).
    const popupKey = `pagosya:popup:${config.slug}`;
    const remember = () => { state.signupDismissed = true; try { sessionStorage.setItem(dismissedKey, '1'); } catch {} try { localStorage.setItem(popupKey, String(Date.now())); } catch {} };
    // The cookie question comes first (live 2026-11-18: its banner covered the popup): open once the shopper has answered it.
    // On a published store the banner is on the outer page, which says whether its question is still open and when it is answered.
    const privacy = window.PAGOSYA_PRIVACY;
    const waitingForCookies = () => !demo && (window.PAGOSYA_HOSTED ? window.PAGOSYA_COOKIES_PENDING === true
      : typeof privacy?.choice === 'function' && privacy.choice(config.slug) === null && Boolean(document.querySelector('[data-pagosya-privacy][data-notice]')));
    let waiting = false;
    // An answer before the popup's own delay just clears the way; one while it waits opens it.
    const answered = () => { window.PAGOSYA_COOKIES_PENDING = false; if (!waiting) return; waiting = false; setTimeout(open, 800); };
    window.addEventListener('pagosya:privacy-change', answered);
    window.addEventListener('message', event => { if (event.source === window.parent && event.data?.type === 'pagosya:cookies-answered') answered(); });
    const open = () => {
      if (waitingForCookies()) { waiting = true; return; }
      if (!dialog.isConnected || dialog.open || document.querySelector('dialog[open]')) return; dialog.showModal(); (dialog.querySelector('h2') || dialog.querySelector('[data-pya-popup] button, [data-pya-popup] [tabindex]'))?.focus(); };
    dialog.addEventListener('close', remember);
    // Popups 2.0: a LIVE YAPI design takes the dialog; timing and the 30-day memory stay the same.
    const flow = settings.popupDesign && typeof settings.popupDesign === 'object' && settings.popupDesign.steps
      ? mountFlow(dialog, settings.popupDesign, { api, demo, remember, slug: config.slug, items: config.data && config.data.items, startAt: settings.popupDesignStartAt, apiBaseUrl: config.apiBaseUrl }) : false;
    dialog.querySelector('.signup-close')?.addEventListener('click', () => dialog.close());
    if (flow) dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
    const photo = host.querySelector('.pagosya-signup-photo img, pya-photo img');
    photo?.addEventListener('error', () => { photo.parentElement.innerHTML = monogram; }, { once: true });
    if (flow) { /* the design draws its own steps */ }
    else if (game) mountGame(dialog, { game, settings, formHtml, api, demo, remember, slug: config.slug, items: config.data && config.data.items, photoUrl: value => safeImage(uploadPhoto(value), location.href) });
    else secureFields(dialog.querySelector('form'));
    dialog.querySelector('form')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type=submit]'); const status = dialog.querySelector('[role=status]');
      if (button.disabled || !form.reportValidity()) return;
      const data = new FormData(form); button.disabled = true; status.textContent = 'Un momento…';
      // A demo store shows the whole popup but never sends: no network, no code.
      if (demo) { remember(); form.hidden = true; status.textContent = 'Prueba completada: en tu tienda aquí llega el correo de bienvenida.'; return; }
      try {
        const result = await api('subscribe', { email: String(data.get('email') ?? '').trim() || undefined, consent: true, source: 'popup',
          ...(String(data.get('name') ?? '').trim() ? { name: String(data.get('name')).trim() } : {}),
          ...(String(data.get('phone') ?? '').trim() ? { phone: String(data.get('phone')).trim() } : {}),
          ...(data.getAll('interests').length ? { interests: data.getAll('interests') } : {}) });
        remember(); state.subscribed = true; form.hidden = true;
        status.textContent = '¡Ya formas parte de nuestra comunidad! Revisa tu correo para recibir nuestras novedades.';
        if (result?.code) {
          status.insertAdjacentHTML('afterend', `<p class="signup-code">Tu código de bienvenida: <strong>${escape(result.code)}</strong> <button type="button" data-copy>Copiar</button></p>`);
          const copy = dialog.querySelector('.signup-code [data-copy]');
          copy.addEventListener('click', async () => { try { await navigator.clipboard?.writeText(result.code); copy.textContent = 'Copiado'; } catch { const range = document.createRange(); range.selectNodeContents(copy.previousElementSibling); getSelection()?.removeAllRanges(); getSelection()?.addRange(range); } });
        }
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    let dismissed = state.signupDismissed;
    try { dismissed ||= sessionStorage.getItem(dismissedKey) === '1'; } catch {}
    // Never cover a receipt, private card, recovery link, or merchant preview.
    // The popup waits for its moment (plan 2026-10-20-store-popup): on arrival, after a delay, on exit intent (pointer
    // devices only) or both; never over a checkout, another dialog, a receipt or recovery link, or the Studio preview.
    let seen = 0; try { seen = Number(localStorage.getItem(popupKey)) || 0; } catch {}
    const blocked = () => dismissed || (seen && Date.now() - seen < 30 * 86_400_000) || (preview && !demo) || ['comeback', 'recover', 'unsubscribe'].some(key => query.has(key)) || document.querySelector('[data-pagosya-checkout-page], .pya-checkout:not([hidden]), dialog[open]');
    const show = () => { if (!blocked()) open(); };
    const trigger = ['load', 'delay', 'exit', 'both'].includes(settings.popupTrigger) ? settings.popupTrigger : 'load';
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (trigger === 'load') show();
    if (trigger === 'delay' || trigger === 'both') setTimeout(show, Math.min(60, Math.max(0, Number(settings.popupDelaySeconds ?? 8))) * 1000);
    if ((trigger === 'exit' || trigger === 'both') && !touch) {
      const onExit = event => { if (event.relatedTarget || event.clientY > 0) return; document.removeEventListener('mouseout', onExit); show(); };
      document.addEventListener('mouseout', onExit);
    }
    return open;
  }
  window.PAGOSYA_RETENTION_MOUNT = async function mountRetention(options) {
    const config = options || window.PAGOSYA_CONFIG || {};
    const hosted = window.PAGOSYA_HOSTED === true;
    const preview = Boolean(config.preview || config.demo || (window.PAGOSYA_PREVIEW && !hosted));
    // A showcase demo store shows the popup (signup faked); the Studio editor never does. «Ver en navegador» shows it once
    // on its first page, faked the same way (window.PAGOSYA_POPUP_DEMO).
    const demo = (Boolean(config.demo) && !config.preview) || Boolean(window.PAGOSYA_POPUP_DEMO);
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
        [data-pagosya-subscribe-block][hidden],[data-pagosya-subscribe-open][hidden]{display:none!important}[data-retention-recovery]{width:auto;margin:24px 0;padding:20px 0}.pagosya-retention [role=status]:empty{display:none}
        @media(max-width:480px){.pagosya-retention{width:calc(100% - 32px);margin:32px auto;padding:24px 0}[data-retention-recovery]{width:100%;margin:20px 0}}
      }
      :where(.pagosya-retention) input:where([type=email]),:where(.pagosya-retention) button{border:revert-layer;border-radius:revert-layer;padding:revert-layer;background:revert-layer;color:revert-layer}`;
      // The last rule sits outside the layer: a store's unlayered CSS reset (Tailwind preflight) beat the layered field and
      // button above (PEPPA please 2026-10-20); as weak as the reset, it hands them back to the layer, a store class still wins.
      document.head.append(style);
    }
    function slot(attribute) {
      let el = document.querySelector(`[${attribute}]`);
      // A checkout page's <main> can be the calm checkout itself: a band there would sit inside the order (owner 2026-10-22).
      if (!el) { el = document.createElement('section'); el.setAttribute(attribute, ''); const footer = document.querySelector('body > footer, main > footer, .store-site-footer'); const main = document.querySelector('main'); if (footer && !footer.closest('[data-pagosya-checkout],[data-pagosya-checkout-page],.pya-checkout')) footer.before(el); else (main && !main.closest('[data-pagosya-checkout],[data-pagosya-checkout-page],.pya-checkout') ? main : document.body).append(el); }
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
    // The design may draw its own signup entry (a footer block, a banner): a real button with
    // data-pagosya-subscribe-open, optionally inside a data-pagosya-subscribe-block wrapper. The
    // email is still typed in pagosYa's form, never in the design.
    const openers = [...document.querySelectorAll('[data-pagosya-subscribe-open]')];
    const block = el => el.closest('[data-pagosya-subscribe-block]') || el;
    let openSignup = null;
    if (settings.signupEnabled) {
      document.querySelectorAll('.store-site-newsletter').forEach(el => el.hidden = true);
      openSignup = mountSignup(slot('data-pagosya-subscribe'), settings, config, state, api, preview, query, demo);
    }
    // The editor preview keeps the drawn block visible so the merchant sees the design before turning subscriptions on.
    openers.forEach(el => { block(el).hidden = !settings.signupEnabled && !preview; });
    const subscribeFromDesign = async el => {
      const status = block(el).querySelector('[role=status]') || document.querySelector('[data-pagosya-status]');
      const say = text => { if (status) status.textContent = text; };
      if (preview && !(demo && openSignup)) return say('Vista previa: el formulario de suscripción se activa al publicar tu tienda.');
      if (!hosted) return openSignup?.();
      if (el.disabled) return;
      el.disabled = true; say('Un momento…');
      try {
        // The trusted parent asks for the email and consent and merges them into this request.
        await api('subscribe', { consent: true });
        state.subscribed = true; state.signupDismissed = true;
        say('¡Listo! Ya estás suscrito. Revisa tu correo para recibir nuestras novedades.');
      } catch (error) { say(error.message); }
      finally { el.disabled = false; }
    };
    openers.forEach(el => {
      // Remounts after navigation rebind the latest settings without stacking listeners.
      if (!el.pagosyaSubscribe) el.addEventListener('click', event => { event.preventDefault(); el.pagosyaSubscribe(); });
      el.pagosyaSubscribe = () => subscribeFromDesign(el);
    });
    // An email field in the page itself, e.g. a footer (owner 2026-10-25, BOXY: «directly in the page»). The kit draws it, so
    // the email is still typed in pagosYa's form; on a published store pagosYa's secure dialog opens with it filled in.
    document.querySelectorAll('[data-pagosya-subscribe-inline]').forEach(el => {
      el.hidden = !settings.signupEnabled && !preview;
      if (el.hidden || el.querySelector('.pagosya-inline-signup')) return;
      if (!document.getElementById('pagosya-inline-signup-style')) {
        const style = document.createElement('style'); style.id = 'pagosya-inline-signup-style';
        style.textContent = ':where(.pagosya-inline-signup){display:grid;gap:10px;max-width:460px;color:inherit;font:inherit}'
          + ':where(.pagosya-inline-signup__row){display:flex;align-items:stretch;border-bottom:1px solid currentColor}'
          + ':where(.pagosya-inline-signup__row input){flex:1;min-width:0;min-height:48px;padding:0 4px;border:0;background:transparent;color:inherit;font:inherit;font-size:16px}'
          + ':where(.pagosya-inline-signup__row input)::placeholder{color:inherit;opacity:.6}'
          + ':where(.pagosya-inline-signup__row input:focus-visible){outline:2px solid currentColor;outline-offset:2px}'
          + ':where(.pagosya-inline-signup__row button){min-height:48px;padding:0 4px 0 16px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;white-space:nowrap}'
          + ':where(.pagosya-inline-signup__consent){display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;opacity:.8;cursor:pointer}'
          + ':where(.pagosya-inline-signup__consent input){width:16px;height:16px;margin:2px 0 0;flex:0 0 16px;accent-color:currentColor}'
          + ':where(.pagosya-inline-signup [role=status]){margin:0;font-size:13px}:where(.pagosya-inline-signup [role=status]:empty){display:none}'
          + '.pagosya-inline-signup__label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
        document.head.append(style);
      }
      const id = `pagosya-inline-email-${Math.random().toString(36).slice(2, 8)}`;
      el.innerHTML = `<form class="pagosya-inline-signup" novalidate><label class="pagosya-inline-signup__label" for="${id}">Tu correo</label><div class="pagosya-inline-signup__row"><input id="${id}" type="email" name="email" autocomplete="email" maxlength="254" placeholder="tu@correo.com" required><button type="submit">${escape(settings.signupButton || 'Suscribirme')}</button></div>${hosted ? '' : '<label class="pagosya-inline-signup__consent"><input type="checkbox" name="consent" required>Quiero recibir novedades por correo. Puedo darme de baja cuando quiera.</label>'}<p role="status" aria-live="polite"></p></form>`;
      const formEl = el.querySelector('form'), status = el.querySelector('[role=status]'), button = formEl.querySelector('button');
      formEl.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        const email = String(new FormData(formEl).get('email') ?? '').trim();
        if (!formEl.querySelector('input[name=email]').checkValidity() || !email) { status.textContent = 'Escribe un correo válido.'; return; }
        if (!hosted && !formEl.querySelector('input[name=consent]').checked) { status.textContent = 'Marca la casilla para recibir novedades.'; return; }
        if (preview && !demo) { status.textContent = 'Vista previa: la suscripción se activa al publicar tu tienda.'; return; }
        if (demo) { formEl.querySelector('.pagosya-inline-signup__row').hidden = true; status.textContent = 'Prueba completada: en tu tienda aquí llega el correo de bienvenida.'; return; }
        button.disabled = true; status.textContent = 'Un momento…';
        try {
          // Published: pagosYa's secure dialog opens with this email filled in and asks for consent there.
          const result = await api('subscribe', hosted ? { consent: true, email } : { email, consent: true });
          state.subscribed = true; state.signupDismissed = true;
          formEl.querySelector('.pagosya-inline-signup__row').hidden = true;
          formEl.querySelector('.pagosya-inline-signup__consent')?.remove();
          status.textContent = result?.code ? `¡Listo! Tu código de bienvenida: ${result.code}` : '¡Listo! Revisa tu correo para recibir nuestras novedades.';
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
      });
    });
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
        else document.dispatchEvent(new CustomEvent('pagosya:restore-cart', { detail: { items: saved.items.map(i => ({ id: i.paymentLinkId, ...(i.variantId ? { variantId: i.variantId } : {}), ...(Array.isArray(i.extraIds) && i.extraIds.length ? { extraIds: i.extraIds } : {}), ...(i.subscriptionCadence ? { subscriptionCadence: i.subscriptionCadence } : {}), quantity: i.quantity })) } }));
        const el = slot('data-pagosya-recovered'); el.innerHTML = '<h2>Retoma tu pedido</h2><p role="status">Recuperamos tus productos disponibles. Revisa las cantidades y los precios actuales antes de pagar.</p>'; el.scrollIntoView({ block: 'center' });
      } catch (error) { const el = slot('data-pagosya-recovered'); el.innerHTML = `<p role="status">${escape(error.message)}</p>`; }
    }
    function renderRecovery() {
      if (!settings.recoveryEnabled) return;
      document.querySelectorAll('[data-pagosya-cart], [data-retention-cart-host]').forEach(panel => {
        if (panel.querySelector('[data-retention-recovery]') || !getCart().length) return;
        // In the calm checkout the reminder belongs in the order column, under the pay button, not after the whole shell.
        const el = document.createElement('section'); el.className = 'pagosya-retention'; el.setAttribute('data-retention-recovery', '');
        // Owner 2026-11-09 (Remolino): in the cart it follows the guarantee line under «Pagar», inside the store's cart template —
        // at the panel's end it sat outside the template's padding, flush against the edge.
        const guarantee = panel.querySelector('.cart-guarantee');
        if (guarantee) guarantee.after(el); else (panel.querySelector(':scope > .pya-co__main') || panel).append(el);
        form(el, `<h3>¿Prefieres terminar después?</h3><form><label class="retention-email"><span class="retention-label">Tu correo</span><input type="email" name="email" autocomplete="email" maxlength="254" required placeholder="tu@gmail.com" value="${escape(state.email)}"></label><label class="retention-consent"><input type="checkbox" name="consent" required ${state.consent ? 'checked' : ''}>Acepto recibir un recordatorio de este carrito si no termino la compra.</label><button type="submit">Guardar y recordármelo</button></form>`, async data => {
          state.email = String(data.get('email') ?? state.email ?? '').trim(); state.consent = true;
          const result = await api('carts', { email: state.email || undefined, consent: true, items: getCart(), ...(state.token ? { token: state.token } : {}) }); saveToken(result.token);
          // One reminder a week per email: a later save is refused, never claimed.
          if (result.saved === false) return 'Ya te enviamos un recordatorio de esta tienda esta semana, así que no programamos otro.';
          return 'Carrito guardado. Te enviaremos un recordatorio si no completas la compra.';
        });
        secureFields(el.querySelector('form'));
        el.querySelector('[name=email]')?.addEventListener('input', event => { state.email = event.target.value; });
        el.querySelector('[name=consent]')?.addEventListener('change', event => { state.consent = event.target.checked; });
      });
    }
    window.PAGOSYA_RETENTION_REFRESH = renderRecovery;
    renderRecovery();
  };
  // «Ver ventana de suscripción» (spec 2026-11-08): the Studio opens the popup at once, drawn as on the store, faked like a demo store
  // (never sends). It opens over the Studio's own dialogs, so it never waits for the store's timing rules.
  window.PAGOSYA_POPUP_PREVIEW = function previewPopup(settings, config, stepId) {
    if (stepId) settings = { ...(settings || {}), popupDesignStartAt: stepId };
    document.querySelector('[data-pagosya-popup-preview]')?.remove();
    const host = document.createElement('section'); host.setAttribute('data-pagosya-popup-preview', ''); document.body.append(host);
    const previewConfig = { ...config, slug: `studio-preview-${config?.slug || 'tienda'}` };
    mountSignup(host, settings || {}, previewConfig, { signupDismissed: false }, async () => { throw new Error('Vista previa: no se envía.'); }, false, new URLSearchParams(), true);
    const dialog = host.querySelector('dialog');
    if (!dialog) { host.remove(); return; }
    dialog.addEventListener('close', () => host.remove());
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector('h2') || dialog.querySelector('button'))?.focus();
  };
  if (window.PAGOSYA_CONFIG) {
    document.addEventListener('pagosya:cart-updated', () => window.PAGOSYA_RETENTION_REFRESH?.());
    void window.PAGOSYA_RETENTION_MOUNT();
  }
})();
