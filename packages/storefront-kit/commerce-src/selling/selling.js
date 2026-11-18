  /* «La tienda que vende sola» (spec 2026-11-16): small selling switches the API hands each visitor in PAGOSYA_CONFIG.selling —
   * a section order, the best seller first, the buy word and the sticky buy bar — and the products they looked at last time
   * (PAGOSYA_CONFIG.recent). Nothing here rebuilds the design: React owns main, so sections move by CSS order (main becomes a
   * column) and the kit's own rows are appended to main and placed right after the hero by order. */
  const SELLING = config.selling && typeof config.selling === 'object' && !Array.isArray(config.selling) ? config.selling : {};
  const SELLING_WORDS = ['Agregar', 'Comprar ahora', 'Lo quiero'];
  const SELLING_PAGE = typeof window.PAGOSYA_PREVIEW_PAGE === 'string' ? window.PAGOSYA_PREVIEW_PAGE : 'index.html';
  const SELLING_BUY_TEXT = /^(agregar|añadir)(\s+(al carrito|a la bolsa|a la canasta))?$/i;
  const sellingBest = () => typeof SELLING.best === 'string' ? products().find(item => item.id === SELLING.best && limit(item) > 0) || null : null;
  const sellingOrder = () => Array.isArray(SELLING.order) ? SELLING.order.map(value => /^s(\d{1,2})$/.exec(String(value))?.[1]).filter(Boolean).map(Number) : [];
  const sellingRecent = () => {
    const ids = Array.isArray(config.recent) ? config.recent.filter(id => typeof id === 'string').slice(0, 8) : [];
    const items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(Boolean).slice(0, 4);
    return items.length >= 2 ? items : [];
  };
  const sellingPhoto = item => safeUrl((item.imageUrls || [])[0]);
  const sellingHref = item => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  function sellingStyle() {
    if (document.getElementById('pya-selling-style')) return;
    const style = document.createElement('style');
    style.id = 'pya-selling-style';
    style.textContent = `main[data-pya-selling]{display:flex;flex-direction:column}
.pya-best-badge{position:absolute;top:10px;left:10px;z-index:2;padding:4px 10px;border-radius:999px;background:var(--es-accent,#111);color:var(--es-paper,#fff);font:600 12px/1.3 inherit;letter-spacing:.02em;pointer-events:none}
.menu-item:has(.pya-best-badge){position:relative}
.pya-best-feature,.pya-recent{width:100%;max-width:1200px;margin:0 auto;padding:48px clamp(16px,4vw,32px);box-sizing:border-box;color:var(--es-ink,inherit)}
.pya-best-feature__inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(20px,4vw,48px);align-items:center;padding:clamp(16px,3vw,28px);border-radius:20px;background:color-mix(in srgb,var(--es-accent,#888) 8%,var(--es-paper,#fff))}
.pya-best-feature img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;display:block}
.pya-best-feature__tag{display:inline-block;margin:0 0 10px;padding:4px 12px;border-radius:999px;background:var(--es-accent,#111);color:var(--es-paper,#fff);font-size:13px;font-weight:600}
.pya-best-feature h2{margin:0 0 8px;font-size:clamp(26px,3.4vw,40px);line-height:1.1}
.pya-best-feature__price{margin:0 0 20px;font-size:18px;opacity:.85}
.pya-best-feature__actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.pya-best-feature__actions a{color:inherit;text-underline-offset:4px}
.pya-recent h2{margin:0 0 18px;font-size:clamp(20px,2.4vw,28px)}
.pya-recent ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
.pya-recent a{display:grid;gap:8px;color:inherit;text-decoration:none}
.pya-recent img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;display:block}
.pya-recent span{font-size:15px;line-height:1.3}
@media (max-width:640px){.pya-best-feature__inner{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function sellingFeature(item) {
    const section = document.createElement('section');
    section.className = 'pya-best-feature'; section.setAttribute('data-pya-selling-extra', ''); section.setAttribute('aria-label', 'Más vendido');
    const photo = sellingPhoto(item);
    const buy = optionGroups(item) ? `<a class="menu-add" href="${escape(sellingHref(item))}">Elegir</a>` : `<button type="button" class="menu-add" data-add="${escape(lineKey(item.id))}" data-quantity="1">Agregar</button>`;
    section.innerHTML = `<div class="pya-best-feature__inner">${photo ? `<img src="${escape(photo)}" alt="" loading="lazy">` : '<div></div>'}<div><p class="pya-best-feature__tag">Más vendido</p><h2>${escape(item.name)}</h2><p class="pya-best-feature__price">${escape(money(price(item), item.currency))}</p><div class="pya-best-feature__actions">${buy}<a href="${escape(sellingHref(item))}">Ver producto</a></div></div></div>`;
    return section;
  }
  function sellingRecentRow(items) {
    const section = document.createElement('section');
    section.className = 'pya-recent'; section.setAttribute('data-pya-selling-extra', ''); section.setAttribute('aria-label', 'Seguir viendo');
    section.innerHTML = `<h2>Seguir viendo</h2><ul>${items.map(item => `<li><a href="${escape(sellingHref(item))}">${sellingPhoto(item) ? `<img src="${escape(sellingPhoto(item))}" alt="" loading="lazy">` : ''}<span>${escape(item.name)}</span><span>${escape(money(price(item), item.currency))}</span></a></li>`).join('')}</ul>`;
    return section;
  }
  let sellingExtras = null;
  /** Section order and the kit's rows after the hero; run again whenever React adds to main. */
  function applySellingHome() {
    if (SELLING_PAGE !== 'index.html') return;
    const main = document.querySelector('main');
    if (!main || !main.children.length) return;
    if (!sellingExtras) {
      const best = sellingBest(), recent = sellingRecent();
      sellingExtras = [...(best ? [sellingFeature(best)] : []), ...(recent.length ? [sellingRecentRow(recent)] : [])];
    }
    const order = sellingOrder();
    if (!order.length && !sellingExtras.length) return;
    // A design that already lays main out as a grid or flex keeps its own layout; only a plain column of blocks is rearranged.
    if (!main.hasAttribute('data-pya-selling') && getComputedStyle(main).display !== 'block') return;
    sellingStyle();
    main.setAttribute('data-pya-selling', '');
    const kids = [...main.children].filter(el => !el.hasAttribute('data-pya-selling-extra'));
    kids.forEach((el, index) => { if (!el.dataset.pagosyaS) el.dataset.pagosyaS = String(index); });
    const fixed = el => el.dataset.pagosyaS === '0' || el.matches('[data-pagosya-catalog]') || !!el.querySelector('[data-pagosya-catalog]');
    const movable = kids.filter(el => !fixed(el));
    const sequence = [...new Set([...order.map(number => movable.find(el => Number(el.dataset.pagosyaS) === number)).filter(Boolean), ...movable])];
    let next = 0;
    kids.forEach((el, index) => { (fixed(el) ? el : sequence[next++]).style.order = String((index + 1) * 2); });
    for (const extra of sellingExtras) { extra.style.order = '3'; if (extra.parentElement !== main) main.appendChild(extra); }
  }
  /** The best seller first in every product row the kit drew, with its badge. */
  function applySellingBest() {
    const best = sellingBest();
    if (!best) return;
    document.querySelectorAll('[data-pagosya-catalog] .menu-item').forEach(card => {
      if (cardProductId(card) !== best.id) return;
      if (!card.querySelector('.pya-best-badge')) card.insertAdjacentHTML('afterbegin', '<span class="pya-best-badge">Más vendido</span>');
      if (card.parentElement && card.parentElement.firstElementChild !== card) card.parentElement.prepend(card);
    });
  }
  /** The chosen buy word on buttons that say «Agregar» or «Añadir» (the kit's and the design's own). */
  function applySellingWord() {
    const word = SELLING_WORDS.includes(SELLING.buyWord) ? SELLING.buyWord : '';
    if (!word || word === 'Agregar') return;
    document.querySelectorAll('[data-add], .product-detail__buy, [data-product-jump]').forEach(button => {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue.trim();
        if (text && SELLING_BUY_TEXT.test(text)) node.nodeValue = node.nodeValue.replace(text, word);
      }
    });
  }
  let sellingTimer = 0;
  function applySelling() {
    clearTimeout(sellingTimer); sellingTimer = 0;
    try { applySellingHome(); applySellingBest(); applySellingWord(); } catch { /* selling switches never stop the store */ }
  }
  const sellingActive = () => sellingOrder().length || SELLING.best || SELLING.buyWord || (Array.isArray(config.recent) && config.recent.length);
  if (sellingActive()) {
    const later = () => { if (!sellingTimer) sellingTimer = setTimeout(applySelling, 30); };
    new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('pagosya:ready', later);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySelling, { once: true }); else applySelling();
  }
