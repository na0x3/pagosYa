/* Edit mode of the Studio preview (visual selection editor). Injected into the sandboxed preview page, never into a published
 * site. It does nothing until the Studio sends { type: 'pagosya:source-edit-mode', on: true }. While on, it outlines the section
 * or platform-owned part under the pointer, and a click selects it (posting pagosya:source-select to the Studio) instead of
 * following links or pressing buttons. Escape clears the selection. */
(function () {
  var MOUNTS = '[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-product-page],[data-pagosya-checkout-page],[data-pagosya-contact],[data-pagosya-subscribe-block]';
  var SECTION_ID = /^[a-z][a-z0-9-]{0,47}$/;
  var on = false, overlay = null, tab = null, selected = '', hovered = null, frame = 0;

  function labelOf(section) {
    var heading = section.querySelector('h1,h2,h3,h4,h5,h6');
    var text = heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (text) return text.slice(0, 40);
    var words = section.id.replace(/-/g, ' ');
    return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40);
  }
  /** The section (a direct child of <main> with a literal id) or platform-owned part that contains a node. */
  function targetOf(node) {
    if (!node || !node.closest) return null;
    var mount = node.closest(MOUNTS);
    if (mount) return { kind: 'platform', element: mount, id: '', label: 'Lo administra pagosYa' };
    var main = document.querySelector('main');
    if (!main) return null;
    var element = node;
    while (element && element.parentElement !== main) element = element.parentElement;
    if (!element || !element.id || !SECTION_ID.test(element.id)) return null;
    return { kind: 'section', element: element, id: element.id, label: labelOf(element) };
  }
  function selectedElement() { return selected ? document.getElementById(selected) : null; }

  function draw() {
    frame = 0;
    if (!on || !overlay) return;
    var target = hovered || selectedElement();
    if (!target) { overlay.style.display = 'none'; return; }
    var rect = target.getBoundingClientRect();
    var current = selected && target.id === selected;
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;display:block;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:2px solid #18181b;outline:2px solid #ffffff;border-radius:6px;background:' + (current ? 'rgba(24,24,27,.06)' : 'transparent');
    var info = targetOf(target);
    tab.textContent = info ? info.label : '';
    tab.style.cssText = 'position:absolute;left:-2px;top:-26px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px;border-radius:6px;background:#18181b;color:#fff;font:600 12px/1.4 system-ui,sans-serif;pointer-events:none';
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(draw); }

  function post(target, text) {
    var message = { type: 'pagosya:source-select', kind: target.kind, sectionId: target.id, label: target.label };
    if (text) message.text = text;
    parent.postMessage(message, '*');
  }
  function onMove(event) { var target = targetOf(event.target); hovered = target ? target.element : null; schedule(); }
  function onClick(event) {
    // Editing must not follow links, press buttons or add to the cart: the click only selects.
    event.preventDefault(); event.stopPropagation();
    var target = targetOf(event.target);
    if (!target) return;
    var own = event.target.children && event.target.children.length === 0 ? (event.target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    selected = target.kind === 'section' ? target.id : '';
    post(target, own);
    schedule();
  }
  function onKey(event) {
    if (event.key !== 'Escape') return;
    selected = '';
    post({ kind: 'section', id: '', label: '' }, '');
    schedule();
  }

  function turnOn(selectedId) {
    selected = selectedId;
    if (on) { schedule(); return; }
    on = true;
    overlay = document.createElement('div'); overlay.setAttribute('data-pagosya-edit-overlay', '');
    overlay.setAttribute('aria-hidden', 'true');
    // Never interactive, from the first instant: it only outlines, it must not catch a single pointer event.
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;display:none';
    tab = document.createElement('span'); overlay.appendChild(tab);
    document.body.appendChild(overlay);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
  }
  function turnOff() {
    if (!on) return;
    on = false; hovered = null; selected = '';
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; tab = null;
  }

  window.addEventListener('message', function (event) {
    // Only the Studio (the parent window) may switch edit mode.
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.type !== 'pagosya:source-edit-mode') return;
    if (data.on === true) turnOn(typeof data.selectedId === 'string' && SECTION_ID.test(data.selectedId) ? data.selectedId : ''); else turnOff();
  });
})();
