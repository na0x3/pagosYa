  // Sold out means no units for the product or for any of its combinations; a shopper cannot choose options that cannot be bought.
  const soldOut = p => limit(p) === 0 || (Array.isArray(p.variants) && p.variants.length > 0 && p.variants.every(v => limit(v) === 0));
  /* Card preview (DNA): how a catalog card previews the product before it is opened. Each falls back to a
   * still card when its data is missing (one photo, fewer than two variant photos, or a full product page). */
  const cardMode = () => hasDna ? document.documentElement.getAttribute('data-dna-card') : null;
  function cardSwatches(p) {
    const seen = new Set(), list = [];
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      const url = variantPhotos(v)[0];
      if (!url || seen.has(url) || typeof v.name !== 'string' || !v.name.trim()) continue;
      seen.add(url);
      // The colour option's own value travels to the product page (owner 2026-10-25: a picked colour opened another one).
      const colourValue = (Array.isArray(v.options) ? v.options : []).find(o => typeof o?.name === 'string' && /^colou?r$/i.test(o.name.trim()) && typeof o.value === 'string')?.value;
      list.push({ url, name: v.name, ...(colourValue ? { value: colourValue } : {}), color: (Array.isArray(v.options) ? v.options : []).map(o => typeof o?.name === 'string' && typeof o?.value === 'string' ? swatchColor(o.name, o.value) : '').find(Boolean) || '' });
      if (list.length === 4) break;
    }
    return list.length > 1 ? list : [];
  }
  function cardPreview(p, image) {
    const mode = cardMode();
    if (!image || !mode) return {};
    if (mode === 'second-photo') { const alt = galleryImages(p).find(url => url !== image); return alt ? { alt } : {}; }
    if (mode === 'swatch-swap') { const swatches = cardSwatches(p); return swatches.length ? { swatches } : {}; }
    if (mode === 'quick-look' && !fullProductPage) return { chip: true };
    return {};
  }
  // The second photo is fetched only when the shopper reaches the card (pointer, focus or touch): see loadCardAlt.
  const CARD_SIZES = '(max-width: 820px) 50vw, 25vw';
  const cardAltMarkup = url => `<img class="menu-item__image-alt" data-src="${escape(url)}"${responsiveSrcset(url) ? ` data-srcset="${escape(responsiveSrcset(url))}" data-sizes="${CARD_SIZES}"` : ''} alt="" aria-hidden="true" decoding="async">`;
  // Swatch thumbnails are 22px: the smallest rendition is enough.
  const cardSwatchMarkup = (p, swatches) => `<div class="menu-item__swatches" role="group" aria-label="Variantes de ${escape(p.name)}">${swatches.map(s => `<button type="button" data-card-swatch="${escape(s.url)}"${s.value ? ` data-card-colour="${escape(s.value)}"` : ''} aria-label="Ver ${escape(s.name)}" aria-pressed="false"><span${s.color ? ` style="--swatch:${escape(s.color)}"` : ''}>${s.color ? '' : `<img src="${escape(s.url)}"${responsiveAttrs(s.url, '22px')} alt="" loading="lazy" decoding="async">`}</span></button>`).join('')}</div>`;
  // A sale's old price sits inside the price element, so an authored card layout gains no new item to place. The space before
  // it lets it drop to its own line on a narrow card instead of running into the add button.
  const cardOriginalMarkup = p => !isMembership(p) && price(p) < p.amount ? ` <del class="menu-item__original" aria-label="Precio anterior">${money(p.amount, p.currency)}</del>` : '';
  const cardChipMarkup = p =>`<button type="button" class="menu-item__quick-look" data-product="${escape(p.id)}" aria-label="Vista rápida de ${escape(p.name)}">Vista rápida</button>`;
  function customProductCard(p, image, complex) {
    const template = document.querySelector('template[data-pagosya-product-template]');
    if (!template || !template.content) return null;
    // React's client renderer appends <template> children to the element, not to its content fragment.
    const source = template.content.children.length ? template.content : template;
    const root = source.firstElementChild?.cloneNode(true);
    const field = name => root?.querySelector(`[data-product-field="${name}"]`);
    const detail = root?.querySelector('a[data-product-link]');
    const buy = root?.querySelector('button[data-product-add]');
    if (source.children.length !== 1 || !root || !field('name') || !field('price') || !detail || !buy) {
      document.documentElement.dataset.productTemplateInvalid = 'true';
      return null;
    }
    root.classList.add('menu-item');
    root.dataset.customProduct = '';
    root.dataset.productId = p.id;
    const fill = (name, value, className) => {
      const node = field(name);
      if (!node) return;
      node.textContent = value; node.classList.add(className);
      if (name === 'description' || name === 'options') node.hidden = !value;
    };
    const groups = optionGroups(p);
    const plural = { color: 'colores', tamaño: 'tamaños', talla: 'tallas', capacidad: 'capacidades', sabor: 'sabores', peso: 'pesos', presentación: 'presentaciones' };
    fill('options', groups ? groups.map(g => plural[g.name.toLowerCase()] ? `${g.values.length} ${plural[g.name.toLowerCase()]}` : `${g.name}: ${g.values.length}`).join(' · ') : '', 'menu-item__options');
    fill('name', p.name, 'menu-item__name');
    fill('price', isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency), 'menu-item__price');
    // Showcase commerce: optional fields an authored card may place; each is hidden when there is nothing true to say.
    const parts = cardInsides(p);
    const set = (name, html, empty) => { const node = field(name); if (!node) return; node.innerHTML = html; node.hidden = empty; };
    set('eyebrow', escape(parts.eyebrow), !parts.eyebrow);
    set('points', parts.points.map(t => `<li>${escape(t)}</li>`).join(''), !parts.points.length);
    set('chips', chipsHtml(parts), !parts.chips.length);
    set('deal', escape(parts.deal), !parts.deal);
    set('save', escape(parts.save), !parts.save);
    field('price').insertAdjacentHTML('beforeend', cardOriginalMarkup(p));
    fill('description', p.description && p.description.trim() !== p.name.trim() ? p.description : '', 'menu-item__description');
    const photo = field('image');
    if (photo) {
      if (photo.tagName !== 'IMG') { document.documentElement.dataset.productTemplateInvalid = 'true'; return null; }
      photo.hidden = !image;
      if (image) { const set = responsiveSrcset(image); if (set) { photo.srcset = set; photo.sizes = '(max-width: 820px) 50vw, 33vw'; } photo.src = image; photo.alt = p.name; photo.loading = 'lazy'; photo.decoding = 'async'; photo.style.objectPosition = imagePosition(p, image); }
      else photo.removeAttribute('src');
      photo.classList.add('menu-item__image');
      // A product without a photo: its frame carries the name's first letter, so a template can draw a tile, not a grey box.
      if (image) photo.parentElement?.removeAttribute('data-product-initial');
      else photo.parentElement?.setAttribute('data-product-initial', (p.name || '').trim().charAt(0).toLocaleUpperCase('es'));
    }
    const badgeText = productBadge(p), badgeField = field('badge');
    if (badgeField) { badgeField.textContent = badgeText; badgeField.hidden = !badgeText; }
    else if (photo && image && badgeText) {
      photo.insertAdjacentHTML('afterend', badgeMarkup(p, 'menu-item__badge'));
      const holder = photo.parentElement;
      if (holder && getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    }
    root.querySelectorAll('a[data-product-link]').forEach(detail => {
      detail.setAttribute('aria-label', `Ver detalle de ${p.name}`);
      // An image-only link with no image should not leave an empty focus target.
      if (!image && detail.querySelector('img') && !detail.textContent.trim() && !detail.querySelector('svg,canvas')) detail.hidden = true;
      if (config.productPage) detail.href = pageHref(config.productPage, '?id=' + encodeURIComponent(p.id));
      else {
        const button = document.createElement('button');
        for (const attr of [...detail.attributes]) if (attr.name !== 'href') button.setAttribute(attr.name, attr.value);
        button.type = 'button'; button.dataset.product = p.id; button.innerHTML = detail.innerHTML;
        detail.replaceWith(button);
      }
    });
    const cardExtras = cardPreview(p, image);
    // Re-read the photo: an image link may have been rebuilt as a button above.
    if (cardExtras.alt) root.querySelector('.menu-item__image')?.insertAdjacentHTML('afterend', cardAltMarkup(cardExtras.alt));
    if (cardExtras.swatches) {
      const after = field('price');
      if (after && !after.closest('a,button')) after.insertAdjacentHTML('afterend', cardSwatchMarkup(p, cardExtras.swatches)); else root.insertAdjacentHTML('beforeend', cardSwatchMarkup(p, cardExtras.swatches));
    }
    if (cardExtras.chip) {
      // The chip belongs to the photo: right after it, outside any link or button that wraps it.
      let anchor = root.querySelector('.menu-item__image');
      for (let el = anchor?.parentElement; el && el !== root; el = el.parentElement) if (el.matches('a,button')) anchor = el;
      if (anchor) anchor.insertAdjacentHTML('afterend', cardChipMarkup(p)); else root.insertAdjacentHTML('beforeend', cardChipMarkup(p));
    }
    root.toggleAttribute('data-no-image', !image);
    root.querySelectorAll('[data-product-media]').forEach(media => { media.hidden = !image; });
    // Hiding an empty photo must not remove the only route to product details.
    if (!image && ![...root.querySelectorAll('[data-product-link]')].some(link => !link.closest('[hidden]'))) {
      const link = document.createElement(config.productPage ? 'a' : 'button');
      link.dataset.productLink = '';
      link.setAttribute('aria-label', `Ver detalle de ${p.name}`);
      if (config.productPage) link.href = pageHref(config.productPage, '?id=' + encodeURIComponent(p.id));
      else { link.type = 'button'; link.dataset.product = p.id; }
      const name = field('name');
      if (!name.closest('a,button,[hidden]')) { link.textContent = p.name; name.replaceChildren(link); }
      else { link.textContent = 'Ver detalle'; root.append(link); }
    }
    buy.classList.add('menu-add'); buy.type = 'button';
    // A round icon button (Esencial's «+») keeps its icon: «Elegir opciones» or «Agotado» squeezed into a 44 px circle spilled out
    // of it (Gramiyaa 2026-10-26). The aria-label carries the words; the product page opens the same way.
    const iconOnly = !buy.textContent.trim() && !!buy.querySelector('svg,img');
    const face = text => { if (!iconOnly) buy.textContent = text; };
    if (isMembership(p)) {
      buy.dataset.product = p.id; buy.disabled = false; face('Hacerme miembro');
      buy.setAttribute('aria-label', `Hacerme miembro de ${p.name}`);
    } else {
    buy.dataset.add = p.id; buy.disabled = !ready || soldOut(p) || complex;
    buy.setAttribute('aria-label', `${complex ? 'Elegir opciones de' : 'Añadir'} ${p.name}`);
    if (soldOut(p)) { face('Agotado'); if (iconOnly) buy.setAttribute('aria-label', `${p.name} agotado`); root.dataset.soldOut = 'true'; }
    else if (complex && (optionGroups(p) || boxGroup(p))) {
      delete buy.dataset.add; buy.dataset.product = p.id; buy.disabled = false;
      face('Elegir opciones');
    }
    else if (complex) {
      face('Elegir opciones');
      if (!preview && !config.demo) {
        const link = document.createElement('a');
        for (const attr of [...buy.attributes]) if (!['disabled', 'type', 'data-add'].includes(attr.name)) link.setAttribute(attr.name, attr.value);
        link.href = safeUrl(hostedProduct(p.id));
        if (iconOnly) link.append(...buy.childNodes); else link.textContent = 'Elegir opciones';
        buy.replaceWith(link);
      }
    }
    }
    return root.outerHTML;
  }
  // The price sits beside .menu-item__copy, not inside it, so a store that pads only the copy leaves the price on the
  // card edge (night run 2026-10-11). Line its start up with the product name; a price laid out elsewhere is left alone.
  function alignCardPrices() {
    document.querySelectorAll('.menu-item').forEach(card => {
      const name = card.querySelector('.menu-item__copy h3'), price = card.querySelector('.menu-item__price');
      if (!name || !price) return;
      price.style.marginInlineStart = '';
      const gap = name.getBoundingClientRect().left - price.getBoundingClientRect().left;
      const card0 = card.getBoundingClientRect().left;
      // Only a price flush with the card edge, inside the name's padding: never a price placed on the right or below a photo column.
      if (gap > 2 && gap < 64 && price.getBoundingClientRect().left - card0 < 4) price.style.marginInlineStart = `${(parseFloat(getComputedStyle(price).marginInlineStart) || 0) + gap}px`;
    });
  }
  // A photo bled to the card edges with negative margins, capped by a reset's img{max-width:100%}, stops short of the
  // right edge (night run 2026-10-11): release the cap so it reaches both edges. A photo without a bleed is left alone.
  function fitCardPhotos() {
    document.querySelectorAll('.menu-item img.menu-item__image').forEach(img => {
      if (img.style.maxWidth === 'none' || parseFloat(getComputedStyle(img).marginLeft) >= 0) return;
      const card = img.closest('.menu-item').getBoundingClientRect(), box = img.getBoundingClientRect();
      if (box.width && (card.right - box.right) - (box.left - card.left) > 6) img.style.maxWidth = 'none';
    });
  }
  // The card's add button is an icon-only "+". A store that decorates it with a symbol of its own (a split "+" cell drawn
  // with ::after) drew it for a word label, so give it one instead of showing "+ | +".
  function labelDecoratedAddButtons() {
    document.querySelectorAll('.menu-add[data-add]').forEach(button => {
      if ((button.textContent || '').trim() || !button.querySelector('svg')) return;
      if (['::before', '::after'].some(pseudo => /^["'].*\S.*["']$/.test(getComputedStyle(button, pseudo).content))) button.textContent = 'Añadir';
    });
  }
  function fitCards() { labelDecoratedAddButtons(); fitCardPhotos(); alignCardPrices(); }
  if (typeof addEventListener === 'function') addEventListener('resize', () => fitCards(), { passive: true });
  const BAG_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></svg>';
  // ---- Fashion card (spec 2026-10-21 fashion look, the John Smedley card) ----
  // A tinted photo panel with one tag, the name and price on one row, «N colores», colour bars on hover. No add
  // button: clothing needs a size first, so the whole card opens the product.
  const COLOUR_GROUP = /^(colou?r|colores|tono)$/;
  const SIZE_GROUP = /^(tallas?|size|medida)$/;
  const groupKey = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const colourGroupIndex = groups => (groups || []).findIndex(group => COLOUR_GROUP.test(groupKey(group.name)));
  const sizeGroupIndex = groups => (groups || []).findIndex(group => SIZE_GROUP.test(groupKey(group.name)));
  const fashionCards = () => config.showcase?.cards === 'fashion';
  function fashionColours(p) {
    const groups = optionGroups(p), index = colourGroupIndex(groups);
    if (index < 0) return [];
    const alt = galleryImages(p)[1] || '';
    return groups[index].values.map(value => {
      const own = (p.variants || []).find(v => variantValues(v)[index] === value && variantPhotos(v)[0]);
      return { value, color: swatchColor(groups[index].name, value), photo: own ? variantPhotos(own)[0] : alt };
    });
  }
  function fashionCardMarkup(p, image) {
    // Only a tag rides on the photo (owner 2026-10-21): sold out, the merchant's badge, best seller, the sale or «Nuevo» — never a
    // descriptive phrase.
    const colours = fashionColours(p), tag = limit(p) === 0 ? 'Agotado' : productBadge(p);
    const line = colours.length > 1 ? `${colours.length} colores` : colours[0]?.value || '';
    const bars = colours.filter(colour => colour.color && colour.photo);
    const details = config.productPage
      ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>`
      : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`;
    const photo = image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, '(max-width: 820px) 50vw, 33vw')} alt="${escape(p.name)}" loading="lazy" decoding="async" />` : '';
    const barsHtml = bars.length > 1 ? `<div class="menu-item__bars">${bars.map(bar => `<button type="button" data-card-swatch="${escape(bar.photo)}" data-card-colour="${escape(bar.value)}" aria-label="Ver en ${escape(bar.value)}" aria-pressed="false" style="--swatch:${escape(bar.color)}"></button>`).join('')}</div>` : '';
    const priceText = isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency);
    return `<article class="menu-item" data-product-id="${escape(p.id)}" data-anatomy="fashion">${details}<div class="menu-item__panel">${photo}${tag ? `<p class="menu-item__tag">${escape(tag)}</p>` : ''}${barsHtml}</div><div class="menu-item__row"><h3 class="menu-item__name">${escape(p.name)}</h3><p class="menu-item__price">${escape(priceText)}${cardOriginalMarkup(p)}</p></div>${line ? `<p class="menu-item__colors">${escape(line)}</p>` : ''}</article>`;
  }
  // Hovering a bar shows that colour's photo; leaving the card brings the first photo back.
  document.addEventListener('pointerover', event => {
    const bar = event.target.closest?.('[data-anatomy=fashion] [data-card-swatch]');
    const card = bar?.closest('.menu-item'), photo = card?.querySelector('.menu-item__image');
    if (!photo) return;
    if (!photo.dataset.firstSrc) photo.dataset.firstSrc = photo.getAttribute('src') || '';
    photo.removeAttribute('srcset'); photo.src = bar.dataset.cardSwatch;
    if (!card.hasAttribute('data-bars-watched')) {
      card.setAttribute('data-bars-watched', '');
      card.addEventListener('pointerleave', () => { if (photo.dataset.firstSrc) photo.src = photo.dataset.firstSrc; card.removeAttribute('data-bars-watched'); }, { once: true });
    }
  });
  // The default catalog card. Custom templates (customProductCard) take priority when the store authored one.
  function productCard(p) {
    const image = galleryImages(p)[0];
    const complex = p.variants?.length || p.extras?.length;
    // Fashion look: the fashion card wins over an authored card template — a YAPI-edited home keeps the template it had, and a
    // fashion store still shows the fashion card everywhere (live check 2026-10-21, NOA VARGAS revision 5).
    if (fashionCards()) return fashionCardMarkup(p, image);
    const custom = customProductCard(p, image, complex);
    if (custom) return custom;
    const cardExtras = cardPreview(p, image);
    // Atelier stores (2026-10-19, the Amboras card): the add button says what it does, with a bag, across the card.
    const atelier = productPageStyle() === 'atelier';
    // Showcase commerce: richer insides; showcase and split cards say «Agregar» across the card.
    const inside = cardInsidesMarkup(p), wide = ['showcase', 'split'].includes(config.showcase?.cards);
    const addFace = atelier || wide ? `${BAG_ICON}<span>Agregar</span>` : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    return `<article class="menu-item" data-product-id="${escape(p.id)}"${atelier ? ' data-anatomy="atelier"' : ''}>${config.productPage ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>` : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`}${image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, "(max-width: 820px) 50vw, 25vw")} alt="${escape(p.name)}" loading="lazy" decoding="async" />${badgeMarkup(p, 'menu-item__badge')}` : ""}${cardExtras.alt ? cardAltMarkup(cardExtras.alt) : ''}${cardExtras.chip ? cardChipMarkup(p) : ''}<div class="menu-item__copy">${inside.eyebrow}<h3>${escape(p.name)}</h3>${p.description && p.description.trim() !== p.name.trim() ? `<p>${escape(p.description)}</p>` : ""}${inside.points}${cardExtras.swatches ? '' : inside.chips}${inside.deal}${soldOut(p) ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}${cardOriginalMarkup(p)}</strong>${inside.save}${cardExtras.swatches ? cardSwatchMarkup(p, cardExtras.swatches) : ''}${isMembership(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Hacerme miembro de ${escape(p.name)}">Hacerme miembro</button>` : soldOut(p) && complex ? `<button class="menu-add" type="button" disabled aria-label="${escape(p.name)} agotado">Agotado</button>` : complex ? optionGroups(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Elegir opciones de ${escape(p.name)}">Elegir opciones</button>` : preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}>${addFace}</button>`}</article>`;
  }
  // A catalog without its own layout whose photos fill each card becomes a photo grid, not a stack of full-width cards.
  function structureCatalog(el) {
    // Grid autodetection only makes sense for the mount's own flat list: `sections` cards sit
    // inside .catalog-group__items and already get their grid unconditionally from CSS.
    const ownCards = [...el.querySelectorAll(':scope > .menu-item:not([data-custom-product])')];
    const card = ownCards[0], photo = card?.querySelector('.menu-item__image');
    if (photo && !el.hasAttribute('data-pagosya-grid') && getComputedStyle(el).display === 'block' && photo.getBoundingClientRect().width >= card.getBoundingClientRect().width * 0.6) el.setAttribute('data-pagosya-grid', '');
    // Photo zoom (spec 2026-10-21): every card with a photo gets its «Ampliar foto» button.
    decorateZoomButtons(el);
    // Contrast correction must reach every card, including ones nested inside `sections` groups.
    readableText(el);
  }
