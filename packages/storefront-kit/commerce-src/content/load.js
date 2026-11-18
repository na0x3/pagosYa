  async function load() {
    render();
    if (preview || config.demo || hosted) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      const saved = cartItems();
      store = pickupFacts(await response.json()); ready = true; category = "all"; renderPolicyLinks();
      restoreCart(saved);
      render(); message("");
    } catch (error) { ready = false; renderInfoPages(true); render(); message(error.message); }
  }
  // Real reviews only: a verified purchase, or the merchant's entry of a real customer's words with where it came from.
  function reviewMarkup(review) {
    const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0)));
    const source = review.source === 'MERCHANT' ? `Reseña de cliente${review.sourceNote ? ` · ${escape(review.sourceNote)}` : ''}` : 'Compra verificada';
    return `<article class="pagosya-review"><p class="pagosya-review__stars" role="img" aria-label="${rating} de 5">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</p><blockquote class="pagosya-review__body"><p>${escape(review.body)}</p></blockquote><p class="pagosya-review__by"><strong>${escape(review.displayName)}</strong> · <span class="pagosya-review__source">${source}</span></p></article>`;
  }
  // The store's published articles; the editor preview draws them from config.data (owner 2026-10-25: BOXY's blog showed
  // only a placeholder line while editing).
  // A list a reader can scan: the title as a heading, date and author small, the summary, then the links (owner 2026-10-25:
  // BOXY's feed was bare text, titles the size of the dates). Zero-specificity rules, so a design's own blog styles win.
  const ensureBlogStyle = () => {
    if (document.getElementById('pagosya-blog-style')) return;
    const style = document.createElement('style'); style.id = 'pagosya-blog-style';
    style.textContent = ':where([data-pagosya-blog]:has(.pagosya-article)){display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:8px 32px}'
      + ':where(.pagosya-article){display:flex;flex-direction:column;gap:10px;padding:20px 0;border-top:1px solid color-mix(in srgb,currentColor 20%,transparent)}'
      + ':where(.pagosya-article__title){margin:0;font:400 clamp(1.2rem,1.8vw,1.5rem)/1.25 var(--store-heading-font,inherit);letter-spacing:-.01em;text-wrap:balance}'
      + ':where(.pagosya-article__meta){margin:0;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;opacity:.62}'
      + ':where(.pagosya-article__excerpt){margin:0;line-height:1.55;opacity:.85}'
      + ':where(.pagosya-article__links){display:flex;flex-wrap:wrap;gap:16px;margin:4px 0 0;font-size:.9rem}'
      + ':where(.pagosya-article__links a,.pagosya-article__more summary){color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}'
      + ':where(.pagosya-article__more) p{margin:10px 0 0;line-height:1.6}';
    document.head.append(style);
  };
  const blogMarkup = articles => { ensureBlogStyle(); return articles.map(article => `<article class="pagosya-article" id="articulo-${escape(article.slug)}"><h2 class="pagosya-article__title">${escape(article.title)}</h2><p class="pagosya-article__meta">${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p>${article.excerpt ? `<p class="pagosya-article__excerpt">${escape(article.excerpt)}</p>` : ''}<details class="pagosya-article__more"><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details><p class="pagosya-article__links"><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>'; };
  /* Owner 2026-11-13 («discounts everything like full kits»): the store's real packs as cards — the products' photos, what is inside,
   * the saving and, for a fixed pack whose products are all simple and in stock, one button that adds the whole pack (data-bundle-add). */
  function packsMarkup(bundles) {
    return (Array.isArray(bundles) ? bundles : []).map(bundle => {
      const entries = (Array.isArray(bundle.items) ? bundle.items : []).map(item => ({ p: products().find(candidate => candidate.id === item?.productId), quantity: Math.max(1, Number(item?.quantity) || 1) }));
      if (!entries.length || entries.some(entry => !entry.p)) return '';
      const photos = entries.map(entry => (Array.isArray(entry.p.imageUrls) ? entry.p.imageUrls[0] : '') || entry.p.imageUrl || '').filter(Boolean).slice(0, 3);
      const percent = Math.max(0, Math.min(100, Number(bundle.discountPercent) || 0));
      const inside = bundle.kind === 'FIXED' ? entries.map(entry => `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${escape(entry.p.name)}`).join(' + ')
        : `${bundle.kind === 'BOGO' ? 'Lleva 2' : `Combina ${Math.max(2, Number(bundle.minimumQuantity) || 2)} o más`} entre ${entries.map(entry => escape(entry.p.name)).join(', ')}`;
      const save = bundle.kind === 'BOGO' ? 'El de menor precio es gratis' : percent ? `Ahorras ${percent}%` : '';
      const addable = bundle.kind === 'FIXED' && entries.every(entry => !entry.p.variants?.length && !entry.p.extras?.length);
      return `<article class="pym-pack">${photos.length ? `<div class="pym-pack__photos" data-count="${photos.length}">${photos.map(src => `<img src="${escape(src)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <div class="pym-pack__body">${bundle.label ? `<p class="pym-pack__label">${escape(bundle.label)}</p>` : ''}<h3 class="pym-pack__name">${escape(bundle.name)}</h3>
        <p class="pym-pack__inside">${inside}</p>${save ? `<p class="pym-pack__save">${escape(save)}</p>` : ''}
        ${addable ? `<button type="button" class="pym-pack__add" data-bundle-add="${escape(bundle.id)}">Agregar el pack</button>` : '<p class="pym-pack__note">El descuento se aplica solo al pagar.</p>'}</div></article>`;
    }).join('');
  }
  /* Owner 2026-11-13 (ways to pay, «payments are the core»): what the store's checkout really takes, from its checkout mode — online
   * payment (pagosYa: QR, card, Tigo Money, transfer), an order by WhatsApp, or payment agreed with the store. Never a method it lacks. */
  function payWaysMarkup(mode) {
    const ways = mode === 'payment'
      ? [['QR', 'Escanea con la app de tu banco'], ['Tarjeta', 'Visa, Mastercard o American Express'], ['Tigo Money', 'Desde tu billetera'], ['Transferencia', 'Desde tu banco']]
      : mode === 'whatsapp' ? [['WhatsApp', 'Confirmas tu pedido y acuerdas el pago con la tienda']] : [['Con la tienda', 'Acuerdas el pago al confirmar tu pedido']];
    return `<ul class="pym-pay">${ways.map(([name, note]) => `<li><strong>${escape(name)}</strong><span>${escape(note)}</span></li>`).join('')}</ul>`
      + (mode === 'payment' ? '<p class="pym-pay__note">Pago seguro procesado por pagosYa.</p>' : '');
  }
  async function loadCommerceContent() {
    document.querySelectorAll('[data-pagosya-payways]').forEach(slot => { slot.innerHTML = payWaysMarkup(config.data?.checkoutMode || 'payment'); });
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length && !fullProductPage) return;
    if (preview || config.demo) {
      slots.forEach(slot => {
        // Reviews cannot load here; the preview shows what a store without reviews shows, no placeholder line (2026-10-19).
        if (slot.hasAttribute('data-pagosya-reviews') && !fullProductPage) {
          slot.hidden = true;
          const section = slot.closest('[data-pagosya-reviews-section]');
          if (section) section.hidden = true;
          return;
        }
        if (slot.hasAttribute('data-pagosya-blog') && Array.isArray(config.data?.articles)) { slot.innerHTML = blogMarkup(config.data.articles); return; }
        // Packs (owner 2026-11-13): the store's packs are in its config, so the preview shows them as the store will.
        if (slot.hasAttribute('data-pagosya-bundles') && Array.isArray(config.data?.bundles)) { slot.innerHTML = packsMarkup(config.data.bundles) || '<p>No hay paquetes activos.</p>'; return; }
        // The product page's own reviews block (the store's design wrote it) shows the two labelled examples the platform's block
        // shows in the preview, never a placeholder line (owner 2026-11-15, Oh Belly r19: «El contenido publicado… aparecerá aquí»).
        // A published demo store has no reviews to show: its block stays hidden.
        if (slot.hasAttribute('data-pagosya-reviews')) {
          if (preview) { slot.innerHTML = [{ rating: 5, displayName: 'Ejemplo', body: 'Así se verá una reseña verificada de tus clientes después de su compra.' }, { rating: 5, displayName: 'Ejemplo', body: 'Las reseñas reales llegan solas: pagosYa se las pide a quien ya recibió su pedido.' }].map(reviewMarkup).join(''); return; }
          slot.hidden = true;
          const section = slot.closest('[data-pagosya-reviews-section]');
          if (section) section.hidden = true;
          return;
        }
        slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.';
      });
      return;
    }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      commerceData = data; decorateProductReviews();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = blogMarkup(data.articles);
        if (slot.hasAttribute('data-pagosya-reviews')) {
          const reviews = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id);
          slot.innerHTML = reviews.map(reviewMarkup).join('') || (fullProductPage && !embeddedProductId ? '<p>Todavía no hay reseñas publicadas.</p>' : '');
          // Away from the product page a store without reviews shows no empty reviews section (spec 2026-10-18).
          const section = slot.closest('[data-pagosya-reviews-section]');
          // A product shown whole on the home (one-product stores, 2026-11-02) hides its reviews until it has some.
          slot.hidden = !reviews.length && (!fullProductPage || Boolean(embeddedProductId));
          if (section) section.hidden = slot.hidden;
          if (slot.hasAttribute('data-pagosya-carousel')) mountCarousel(slot);
        }
        if (slot.hasAttribute('data-pagosya-bundles')) slot.innerHTML = packsMarkup(data.bundles) || '<p>No hay paquetes activos.</p>';
      });
    } catch { slots.forEach(slot => { slot.textContent = 'No pudimos cargar esta sección. Recarga la página para intentar de nuevo.'; }); }
  }
  document.querySelectorAll('[data-pagosya-review-form]').forEach(slot => {
    slot.innerHTML = `<form><h2>Comparte tu experiencia</h2><label class="order-field">Código de seguimiento del pedido<input name="trackingToken" required maxlength="250" autocomplete="off"></label><label class="order-field">Producto<select name="productId">${products().map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><label class="order-field">Nombre público<input name="displayName" required maxlength="80"></label><label class="order-field">Calificación<select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} de 5</option>`).join('')}</select></label><label class="order-field">Tu reseña<textarea name="body" required minlength="3" maxlength="2000"></textarea></label><p>Tu nombre y reseña podrán publicarse después de la revisión del comercio.</p><button type="submit">Enviar reseña</button><p role="status"></p></form>`;
    secureFields(slot.querySelector('form'), ['trackingToken', 'displayName', 'rating', 'body'], 'Tu reseña se escribe en un formulario seguro de pagosYa.');
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.target; const status = form.querySelector('[role=status]'); const button = form.querySelector('button');
      if (preview || config.demo) { status.textContent = 'Prueba completada. No se envió ninguna reseña.'; return; }
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form)); values.rating = Number(values.rating);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content/reviews`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || 'No se pudo enviar la reseña.');
        status.textContent = 'Reseña recibida. Está pendiente de revisión.'; form.reset();
      } catch (error) { status.textContent = error.message || 'No se pudo enviar la reseña.'; }
      finally { button.disabled = false; }
    });
  });
