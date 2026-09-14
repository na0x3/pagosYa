(() => {
  'use strict';
  const root = document.documentElement;
  try { const theme = sessionStorage.getItem('hilar-theme'); if (!root.dataset.theme && ['light','dark'].includes(theme)) root.dataset.theme = theme; } catch {}
  const updateThemeLabel = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    document.querySelectorAll('.theme-toggle').forEach(button => button.setAttribute('aria-label', dark ? 'Activar tema claro' : 'Activar tema oscuro'));
  };
  document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    updateThemeLabel();
    try { sessionStorage.setItem('hilar-theme', root.dataset.theme); } catch {}
  }));
  updateThemeLabel();
  const guide = `<div class="hilar-product-guide"><details><summary>Guía de tallas <span aria-hidden="true">+</span></summary><p>Mide una prenda extendida en plano. Elige el ancho y largo que prefieras.</p><table><caption>Medidas de ejemplo para esta colección, en cm.</caption><thead><tr><th scope="col">Talla</th><th scope="col">Ancho</th><th scope="col">Largo</th></tr></thead><tbody>${[['XS',46,60],['S',49,62],['M',52,64],['L',55,66],['XL',58,68]].map(row => `<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}</tbody></table><p>Corte Relajado: 4 cm más de ancho y 2 cm más de largo. El precio incluye un adicional de Bs 30.</p></details><details><summary>Composición y cuidados <span aria-hidden="true">+</span></summary><p>70% lana y 30% algodón. Lava a mano con agua fría, seca en plano y guarda doblado. No retuerzas la prenda.</p></details></div>`;
  function enhance() {
    document.querySelectorAll('.order-item:not([data-hilar-ready])').forEach(row => {
      row.dataset.hilarReady = 'true';
      const key = row.querySelector('[data-add]')?.getAttribute('data-add');
      let id = key, variantId;
      try { if (key?.startsWith('[')) [id, variantId] = JSON.parse(key); } catch {}
      const product = window.PAGOSYA_CONFIG?.data?.items?.find(item => item.id === id);
      const variant = product?.variants?.find(item => item.id === variantId);
      const url = variant?.imageUrl || product?.imageUrls?.[0];
      if (url) { const photo = document.createElement('img'); photo.className = 'bag-photo'; photo.src = url; photo.alt = product.name; photo.width = 80; photo.height = 100; row.prepend(photo); row.classList.add('has-photo'); }
    });
    document.querySelectorAll('.checkout-page__inner:not([data-hilar-ready])').forEach(panel => {
      panel.dataset.hilarReady = 'true';
      const heading = panel.querySelector('h1');
      if (heading?.textContent === 'Revisa tu pedido') heading.textContent = 'Tu bolsa.';
      const intro = panel.querySelector('.checkout-page__intro');
      if (intro) intro.textContent = 'Revisa tus tallas, colores y cantidades. Ya casi son tuyos.';
    });
    document.querySelectorAll('.product-card[data-no-image]:not([data-hilar-ready])').forEach(card => {
      card.dataset.hilarReady = 'true';
      const colors = card.querySelector('.card-colors');
      if (colors) { colors.removeAttribute('aria-label'); colors.textContent = 'Un detalle más para regalar. Una caja por prenda.'; }
      const buy = card.querySelector('[data-product-add]');
      if (buy) buy.textContent = 'Añadir caja';
    });
    document.querySelectorAll('[data-product-option="0"]').forEach(button => {
      const text = button.textContent.trim().toLowerCase();
      if (['avena','vino'].includes(text) && button.dataset.hilarColor !== text) button.dataset.hilarColor = text;
    });
    document.querySelectorAll('.product-detail__copy:has(.product-detail__options):not([data-hilar-ready])').forEach(copy => {
      copy.dataset.hilarReady = 'true'; copy.insertAdjacentHTML('beforeend', guide);
      const buy = copy.querySelector('.product-detail__buy'); if (buy) buy.textContent = 'Añadir a la bolsa';
    });
  }
  let queued = false;
  const observer = new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; enhance(); }); });
  observer.observe(document.body, {childList:true, subtree:true});
  enhance();
})();
