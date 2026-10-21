/* Spec 2026-10-20 Plantillas fill §6: in the Studio preview, a double-click turns a text into an editable one in place.
 * Enter or leaving the text saves (the Studio writes it to the store), Escape restores. Product names and prices belong
 * to Productos, so a double-click there asks the Studio to open that product. Never on a published store. */
(function () {
  var TEXT = 'h1,h2,h3,h4,h5,h6,p,span,strong,em,small,a,button,li,label,figcaption,blockquote,dt,dd,summary,b,i';
  var editing = null, last = null;
  var clean = function (text) { return (text || '').replace(/\s+/g, ' ').trim(); };
  var textOnly = function (element) { return Array.prototype.every.call(element.childNodes, function (node) { return node.nodeType === 3; }) && clean(element.textContent); };
  var off = function () { var root = document.documentElement; return root.hasAttribute('data-boceto-on') || Boolean(document.querySelector('[data-pagosya-edit-overlay]')); };
  var productOf = function (element) {
    // Any words on a kit product card are that product's (name, description, price); buttons keep their own job.
    var holder = element.closest('[data-product-field],.menu-item__name,.menu-item__price,[data-pagosya-product-page] [data-part="title"],[data-pagosya-product-page] .product-detail__price')
      || (!element.closest('button,.menu-add') && element.closest('.menu-item') && element.closest('.menu-item__copy,.menu-item__price'));
    if (!holder) return null;
    var card = holder.closest('.menu-item,[data-pagosya-product],[data-product-id]');
    var id = card && (card.getAttribute('data-product-id') || (card.querySelector('[data-product]') || {}).getAttribute && card.querySelector('[data-product]').getAttribute('data-product'));
    if (!id && card) { var link = card.querySelector('a[href*="?c="]'); if (link) id = new URL(link.getAttribute('href'), location.href).searchParams.get('c'); }
    if (!id) { var buy = document.querySelector('[data-pagosya-product-page] [data-add]'); if (buy && holder.closest('[data-pagosya-product-page]')) id = buy.getAttribute('data-add'); }
    var field = holder.matches('[data-product-field="price"],.menu-item__price,.product-detail__price') || holder.closest('[data-product-field="price"]') ? 'price' : 'name';
    return { productId: id || '', field: field };
  };
  function start(element) {
    if (editing) stop(false);
    editing = { element: element, original: element.textContent || '' };
    element.setAttribute('data-inline-editing', '');
    element.setAttribute('contenteditable', 'plaintext-only');
    if (element.contentEditable !== 'plaintext-only') element.setAttribute('contenteditable', 'true');
    element.focus();
    try { document.execCommand('selectAll', false, null); } catch (error) { /* a nicety */ }
  }
  function stop(commit) {
    if (!editing) return;
    var element = editing.element, original = editing.original; editing = null;
    element.removeAttribute('contenteditable'); element.removeAttribute('data-inline-editing');
    var before = clean(original), after = clean(element.textContent);
    if (!commit) { element.textContent = original; return; }
    if (!after || after === before || after.length > 1000) { element.textContent = original; return; }
    element.textContent = after;
    last = { element: element, original: original };
    parent.postMessage({ type: 'pagosya:inline-text', before: before, after: after }, '*');
  }
  var style = document.createElement('style');
  style.textContent = '[data-inline-editing]{outline:2px solid #735da5!important;outline-offset:3px!important;cursor:text!important;-webkit-user-select:text!important;user-select:text!important}';
  (document.head || document.documentElement).appendChild(style);
  document.addEventListener('dblclick', function (event) {
    if (off()) return;
    var target = event.target instanceof Element ? event.target : null;
    // A card's «Ver detalle» link lies over the whole card: the words the merchant aimed at are underneath it.
    if (target && target.matches('a.menu-item__details') && document.elementsFromPoint) {
      var under = document.elementsFromPoint(event.clientX, event.clientY).filter(function (el) { return el !== target && target.closest('.menu-item') && target.closest('.menu-item').contains(el) && el !== target.closest('.menu-item'); })[0];
      if (under) target = under;
    }
    if (!target || target.closest('form,input,textarea,select,[data-pagosya-cart],.cart-drawer,[data-pagosya-checkout-page],[data-inline-editing]')) return;
    var product = productOf(target);
    if (product) { event.preventDefault(); event.stopImmediatePropagation(); parent.postMessage({ type: 'pagosya:inline-product', productId: product.productId, field: product.field }, '*'); return; }
    var element = target.closest(TEXT);
    while (element && !textOnly(element)) element = null;
    if (!element) return;
    event.preventDefault(); event.stopImmediatePropagation();
    start(element);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (!editing) return;
    if (event.key === 'Escape') { event.preventDefault(); stop(false); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); stop(true); }
  }, true);
  document.addEventListener('focusout', function (event) { if (editing && event.target === editing.element) stop(true); }, true);
  // A link or button being edited must not navigate or submit.
  document.addEventListener('click', function (event) { if (editing && event.target instanceof Element && editing.element.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  // A link's first click would navigate before the second click makes a double-click (live check 2026-10-21: a product
  // name on a card opened its page). A single click on a link waits a moment; a second click cancels it. On window, so it
  // runs before the preview's own navigation, which listens on the document.
  var pending = null, replaying = false;
  window.addEventListener('click', function (event) {
    if (replaying || editing || off() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.closest('form,[data-pagosya-cart],.cart-drawer,[data-pagosya-checkout-page]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (pending) { clearTimeout(pending); pending = null; return; }
    pending = setTimeout(function () { pending = null; replaying = true; try { link.click(); } finally { replaying = false; } }, 300);
  }, true);
  window.addEventListener('message', function (event) {
    if (event.source !== parent || !event.data || event.data.type !== 'pagosya:inline-text-revert' || !last) return;
    last.element.textContent = last.original; last = null;
  });
})();
