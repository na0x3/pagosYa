  // Spec 2026-11-09 personalizador (owner: «ese product card me gustaba mucho», approved the examples page): the Oct-27 «Marco» look —
  // the product on a big stage, its own choices beside it (colour circles, pills), price, quantity and one big button. Only the
  // product's real options, photos, prices and stock; the frame only where the section asks for it (art stores); a WhatsApp store
  // orders by WhatsApp with the choice written in. A product without options hides the section.
  (function personalizer() {
    const FRAME_GROUP = /^(marco|marcos|frame)$/;
    const SIZE_GROUP = /^(tamano|tamanos|medida|medidas|size|tallas?)$/;
    // Frame finishes the kit's swatches do not name; the Oct-27 module's four.
    const FRAME_COLOURS = { 'madera natural': '#b98a5a', madera: '#b98a5a', natural: '#b98a5a', dorado: '#b8963e', oro: '#b8963e', plateado: '#b9bcc0', plata: '#b9bcc0' };
    const fold = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    let styled = false;
    const ensureStyle = () => {
      if (styled) return;
      styled = true;
      const style = document.createElement('style');
      style.setAttribute('data-pagosya-personalizer-style', '');
      const accent = 'var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))))';
      const accentInk = 'var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))';
      style.textContent = `.pz{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,5fr);gap:clamp(20px,4vw,56px);align-items:center;color:inherit;font:inherit}
      .pz__stage{position:relative;display:grid;place-items:center;min-height:clamp(320px,42vw,520px);padding:clamp(18px,3vw,40px);border-radius:var(--es-radius,18px);background:color-mix(in srgb,${accent} 16%,transparent);overflow:hidden}
      .pz__photo{display:block;width:100%;max-width:440px;aspect-ratio:4/5;object-fit:cover;border-radius:12px;transition:opacity .25s ease}
      .pz__photo.is-swap{opacity:0}
      .pz__frame{width:52%;border:18px solid #b98a5a;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.28),inset 0 0 0 10px #fff;transition:border-color .3s ease,width .35s ease}
      .pz__frame[data-size="1"]{width:66%}.pz__frame[data-size="2"]{width:84%}
      .pz__frame .pz__photo{max-width:none;aspect-ratio:3/4;padding:10px;border-radius:0;background:#fff;box-sizing:border-box}
      .pz__main{display:grid;gap:20px;min-width:0}
      .pz__kicker{margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
      .pz__title{margin:0;font-family:var(--es-heading,inherit);font-size:clamp(26px,3.4vw,40px);line-height:1.05;text-wrap:balance}
      .pz__field{display:grid;gap:10px;margin:0;padding:0;border:0;min-width:0}
      .pz__label{padding:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      .pz__label span{margin-left:6px;font-weight:500;letter-spacing:0;text-transform:none;opacity:.75}
      .pz__swatches,.pz__chips{display:flex;flex-wrap:wrap;gap:10px}
      .pz__swatch{width:44px;height:44px;padding:0;border:3px solid transparent;border-radius:50%;background-clip:padding-box;background-size:cover;background-position:center;box-shadow:0 0 0 1px color-mix(in srgb,currentColor 28%,transparent);cursor:pointer}
      .pz__swatch[aria-pressed="true"]{box-shadow:0 0 0 2px currentColor}
      .pz__chip{min-width:52px;min-height:44px;padding:0 18px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:15px;font-weight:600;cursor:pointer}
      .pz__chip[aria-pressed="true"]{border-color:currentColor;background:currentColor}
      .pz__chip[aria-pressed="true"]>span{color:var(--store-paper,var(--brand-background,var(--paper,#fff)))}
      .pz__chip:disabled,.pz__swatch:disabled{opacity:.35;cursor:not-allowed}.pz__chip:disabled{text-decoration:line-through}
      .pz__stock{margin:-8px 0 0;min-height:1.2em;font-size:14px;font-weight:600}
      .pz__price{margin:0;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
      .pz__price del{margin-left:8px;font-size:15px;font-weight:500;opacity:.6}
      .pz__buy{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
      .pz__qty{display:inline-flex;align-items:center;border:2px solid currentColor;border-radius:999px;overflow:hidden}
      .pz__qty button{width:42px;height:48px;border:0;background:none;color:inherit;font:inherit;font-size:18px;font-weight:700;cursor:pointer}
      .pz__qty output{min-width:28px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
      .pz__btn{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 28px;border:2px solid currentColor;border-radius:999px;background:${accent};color:${accentInk};box-shadow:4px 5px 0 currentColor;font:inherit;font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
      .pz__btn:active{transform:translate(3px,4px);box-shadow:1px 1px 0 currentColor}
      .pz__btn:disabled{opacity:.5;cursor:not-allowed}
      .pz :focus-visible{outline:3px solid currentColor;outline-offset:3px}
      @media (max-width:760px){.pz{grid-template-columns:minmax(0,1fr)}.pz__stage{min-height:300px}}
      @media (prefers-reduced-motion:reduce){.pz__photo,.pz__frame,.pz__btn{transition:none}}`;
      document.head.append(style);
    };
    const usable = product => {
      const groups = optionGroups(product);
      return groups && (product.variants || []).length >= 2 ? groups : null;
    };
    const valuesOf = variant => variantValues(variant);
    function draw(host, product, groups) {
      ensureStyle();
      const frame = host.dataset.look === 'frame';
      const keys = groups.map(group => fold(group.name));
      const colourAt = colourGroupIndex(groups), frameAt = keys.findIndex(key => FRAME_GROUP.test(key)), sizeAt = keys.findIndex(key => SIZE_GROUP.test(key));
      const swatchAt = new Set([colourAt, frame ? frameAt : -1].filter(at => at >= 0));
      const swatchOf = (at, value) => swatchColor('color', value) || FRAME_COLOURS[fold(value)] || '';
      const whatsapp = store.checkoutMode === 'whatsapp' && String(store.contactPhone || '').replace(/\D/g, '');
      const first = product.variants.find(v => remaining(product, v) > 0) || product.variants[0];
      let chosen = valuesOf(first), quantity = 1;
      const current = () => product.variants.find(v => valuesOf(v).every((value, at) => value === chosen[at]));
      // Choices read in order (colour, then size): a value is open when something is left with it and the choices before it — a sold-out
      // Rosa / S closes S once Rosa is chosen, never the whole Rosa while S is.
      const fits = (at, value) => product.variants.some(v => valuesOf(v)[at] === value && valuesOf(v).every((other, i) => i >= at || other === chosen[i]) && remaining(product, v) > 0);
      const photoOf = variant => variantPhotos(variant)[0]
        || (colourAt >= 0 && product.variants.map(v => valuesOf(v)[colourAt] === chosen[colourAt] && variantPhotos(v)[0]).find(Boolean))
        || galleryImages(product)[0] || '';
      const field = (group, at) => {
        const swatches = swatchAt.has(at) && group.values.every(value => swatchOf(at, value) || product.variants.some(v => valuesOf(v)[at] === value && variantPhotos(v)[0]));
        const options = group.values.map(value => {
          if (!swatches) return `<button type="button" class="pz__chip" data-pz-group="${at}" data-pz-value="${escape(value)}"><span>${escape(value)}</span></button>`;
          const colour = swatchOf(at, value), photo = colour ? '' : product.variants.map(v => valuesOf(v)[at] === value && variantPhotos(v)[0]).find(Boolean);
          return `<button type="button" class="pz__swatch" data-pz-group="${at}" data-pz-value="${escape(value)}" aria-label="${escape(value)}" title="${escape(value)}" style="${colour ? `background-color:${colour}` : `background-image:url('${escape(photo)}')`}"></button>`;
        }).join('');
        return `<fieldset class="pz__field"><legend class="pz__label">${escape(group.name)} <span data-pz-chosen="${at}"></span></legend><div class="${swatches ? 'pz__swatches' : 'pz__chips'}">${options}</div></fieldset>`;
      };
      const picture = `<img class="pz__photo" alt="${escape(product.name)}" src="${escape(photoOf(first))}">`;
      host.innerHTML = `<div class="pz" data-look="${frame ? 'frame' : 'stage'}"><div class="pz__stage">${frame ? `<div class="pz__frame" data-size="0">${picture}</div>` : picture}</div>
        <div class="pz__main"><p class="pz__kicker">Elige ${escape(fold(groups[0].name) === 'color' ? 'tu color' : `tu ${fold(groups[0].name)}`)}</p><h3 class="pz__title">${escape(product.name)}</h3>
        ${groups.map(field).join('')}<p class="pz__stock" role="status"></p><p class="pz__price"></p>
        <div class="pz__buy">${whatsapp ? '' : '<div class="pz__qty"><button type="button" data-pz-minus aria-label="Uno menos">−</button><output>1</output><button type="button" data-pz-plus aria-label="Uno más">+</button></div>'}
        <button type="button" class="pz__btn">${whatsapp ? 'Pedir por WhatsApp' : 'Añadir al carrito'}</button></div></div></div>`;
      const photo = host.querySelector('.pz__photo'), button = host.querySelector('.pz__btn'), frameEl = host.querySelector('.pz__frame');
      const update = () => {
        const variant = current(), left = variant ? remaining(product, variant) : 0;
        host.querySelectorAll('[data-pz-group]').forEach(option => {
          const at = Number(option.dataset.pzGroup), value = option.dataset.pzValue;
          option.setAttribute('aria-pressed', String(chosen[at] === value));
          option.disabled = !fits(at, value) && chosen[at] !== value;
        });
        host.querySelectorAll('[data-pz-chosen]').forEach(label => { label.textContent = chosen[Number(label.dataset.pzChosen)] || ''; });
        const src = variant ? photoOf(variant) : '';
        if (src && photo.getAttribute('src') !== src) { photo.classList.add('is-swap'); setTimeout(() => { photo.src = src; photo.classList.remove('is-swap'); }, 180); }
        if (frameEl) {
          const finish = frameAt >= 0 ? swatchOf(frameAt, chosen[frameAt]) : '';
          frameEl.style.borderColor = finish || '#b98a5a';
          frameEl.dataset.size = String(sizeAt >= 0 ? Math.min(2, groups[sizeAt].values.indexOf(chosen[sizeAt])) : 0);
        }
        const amount = variant ? price({ ...product, amount: variant.amount }) : 0, full = variant ? variant.amount : 0;
        host.querySelector('.pz__price').innerHTML = variant ? `${money(amount, product.currency)}${amount < full ? `<del>${money(full, product.currency)}</del>` : ''}` : '';
        host.querySelector('.pz__stock').textContent = !variant || left <= 0 ? 'Agotado' : left <= 5 ? `¡Quedan ${left}!` : '';
        quantity = Math.max(1, Math.min(quantity, Math.max(1, left)));
        const output = host.querySelector('.pz__qty output');
        if (output) output.textContent = String(quantity);
        button.disabled = !variant || left <= 0;
        if (whatsapp) {
          const choice = groups.map((group, at) => `${group.name}: ${chosen[at]}`).join(' · ');
          button.dataset.waUrl = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola${store.storeName ? ` ${store.storeName}` : ''}, quiero «${product.name}» · ${choice}. ¿Está disponible?`)}`;
        } else if (variant) {
          button.setAttribute('data-add', lineKey(product.id, variant.id));
          button.dataset.quantity = String(quantity);
        }
      };
      host.addEventListener('click', event => {
        const option = event.target.closest('[data-pz-group]');
        if (option && !option.disabled) {
          const at = Number(option.dataset.pzGroup);
          chosen[at] = option.dataset.pzValue;
          // A combination that is sold out moves the other choices to one that is not.
          if (!current() || remaining(product, current()) <= 0) {
            const next = product.variants.find(v => valuesOf(v)[at] === chosen[at] && remaining(product, v) > 0) || product.variants.find(v => valuesOf(v)[at] === chosen[at]);
            if (next) chosen = valuesOf(next);
          }
          update(); return;
        }
        if (event.target.closest('[data-pz-minus]')) { quantity = Math.max(1, quantity - 1); update(); return; }
        if (event.target.closest('[data-pz-plus]')) { const variant = current(); quantity = Math.min(quantity + 1, variant ? Math.max(1, remaining(product, variant)) : 1); update(); return; }
        if (event.target.closest('.pz__btn') && whatsapp) {
          const url = button.dataset.waUrl;
          analytics('whatsapp_click');
          if (hosted) parent.postMessage({ type: 'pagosya:source-external', url }, '*'); else window.open(url, '_blank', 'noopener');
          return;
        }
        // The kit's own add path takes the click (stock, cart, notice); the line just added counts against what is left.
        if (event.target.closest('.pz__btn')) setTimeout(update, 0);
      });
      update();
    }
    const run = () => {
      let pending = false;
      document.querySelectorAll('[data-pagosya-personalizer][data-product-id]').forEach(host => {
        if (host.dataset.drawn) return;
        const product = products().find(item => String(item.id) === host.getAttribute('data-product-id'));
        if (!product && !products().length) { pending = true; return; }
        host.dataset.drawn = '1';
        const groups = product && usable(product), section = host.closest('section') || host;
        if (!groups) { section.hidden = true; return; }
        draw(host, product, groups);
      });
      return !pending;
    };
    const hosts = () => document.querySelector('[data-pagosya-personalizer]');
    if (run() && hosts()) return;
    const watch = new MutationObserver(() => { if (run() && hosts()) watch.disconnect(); });
    watch.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (!hosts()) watch.disconnect(); }, 15000);
  })();
