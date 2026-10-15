  async function load() {
    render();
    if (preview || config.demo || hosted) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      const saved = cartItems();
      store = await response.json(); ready = true; category = "all"; renderPolicyLinks();
      restoreCart(saved);
      render(); message("");
    } catch (error) { ready = false; renderInfoPages(true); render(); message(error.message); }
  }
  async function loadCommerceContent() {
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length && !fullProductPage) return;
    if (preview || config.demo) { slots.forEach(slot => { slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.'; }); return; }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      commerceData = data; decorateProductReviews();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = data.articles.map(article => `<article id="articulo-${escape(article.slug)}"><h2>${escape(article.title)}</h2><p>${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p><p>${escape(article.excerpt)}</p><p><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p><details><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>';
        if (slot.hasAttribute('data-pagosya-reviews')) slot.innerHTML = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id).map(review => `<article><strong>${escape(review.displayName)}</strong><p>${review.rating} de 5 · Compra verificada</p><p>${escape(review.body)}</p></article>`).join('') || '<p>Todavía no hay reseñas publicadas.</p>';
        if (slot.hasAttribute('data-pagosya-bundles')) slot.innerHTML = data.bundles.map(bundle => `<article><h3>${escape(bundle.name)}</h3><p>${bundle.kind === 'BOGO' ? 'Lleva dos; el de menor precio es gratis.' : `${bundle.discountPercent}% de descuento ${bundle.kind === 'FIXED' ? 'al completar el paquete' : 'desde ' + bundle.minimumQuantity + ' unidades'}.`}</p><ul>${bundle.items.map(item => `<li>${escape(products().find(p => p.id === item.productId)?.name || 'Producto del paquete')}${bundle.kind === 'FIXED' ? ' × ' + item.quantity : ''}</li>`).join('')}</ul><p>Añade los productos al carrito. La mejor oferta se aplica automáticamente al pagar; no se acumula con otros códigos.</p></article>`).join('') || '<p>No hay paquetes activos.</p>';
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
