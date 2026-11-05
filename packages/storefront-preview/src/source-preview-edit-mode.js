/* Edit mode of the Studio preview (visual selection editor). Injected into the sandboxed preview page, never into a published
 * site. It does nothing until the Studio sends { type: 'pagosya:source-edit-mode', on: true }. While on, it outlines the section
 * or platform-owned part under the pointer, and a click selects it (posting pagosya:source-select to the Studio) instead of
 * following links or pressing buttons. Escape clears the selection. */
(function () {
  var MOUNTS = '[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-product-page],[data-pagosya-checkout-page],[data-pagosya-contact],[data-pagosya-subscribe-block]';
  var SECTION_ID = /^[a-z][a-z0-9-]{0,47}$/;
  var on = false, overlay = null, tab = null, selected = '', hovered = null, frame = 0;
  var press = null, drawing = false, swallowClick = false, loop = null;

  var PAGES = ['home', 'product', 'about', 'contact', 'faq', 'shipping'];

  function labelOf(section, id) {
    var heading = section.querySelector('h1,h2,h3,h4,h5,h6');
    var text = heading ? (heading.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (text) return text.slice(0, 40);
    var words = String(id || section.id || '').replace(/-/g, ' ');
    return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40);
  }
  /** Template sections (spec 2026-11-05 point-at): a [data-lb] child of a [data-lb-home] / [data-lb-product] container, addressed
   *  by page and by the number the quick edit uses (its lb-N id; its position among the [data-lb] children otherwise). */
  function addressOf(element, box) {
    var named = /^lb-(\d{1,2})$/.exec(element.id || '');
    var siblings = Array.prototype.filter.call(box.children, function (child) { return child.hasAttribute('data-lb'); });
    var at = named ? Number(named[1]) : siblings.indexOf(element);
    var page = box.getAttribute('data-lb-page') || (box.hasAttribute('data-lb-product') ? 'product' : 'home');
    if (PAGES.indexOf(page) < 0 || at < 0 || at > 40) return null;
    var id = SECTION_ID.test(element.id || '') ? element.id : 'lb-' + at;
    return { kind: 'section', element: element, id: id, label: labelOf(element, id), at: at, page: page };
  }
  function templateSectionOf(node) {
    var element = node.closest('[data-lb]');
    while (element) {
      var box = element.parentElement;
      if (box && (box.hasAttribute('data-lb-home') || box.hasAttribute('data-lb-product'))) return addressOf(element, box);
      element = box ? box.closest('[data-lb]') : null;
    }
    return null;
  }
  /** A template section (a product card inside one selects the section), a platform-owned part, or a classic section (a direct
   *  child of <main> with a literal id). */
  function targetOf(node) {
    if (!node || !node.closest) return null;
    var template = templateSectionOf(node);
    if (template) return template;
    var mount = node.closest(MOUNTS);
    if (mount) return { kind: 'platform', element: mount, id: '', label: 'Lo administra pagosYa' };
    var main = document.querySelector('main');
    if (!main) return null;
    var element = node;
    while (element && element.parentElement !== main) element = element.parentElement;
    if (!element || !element.id || !SECTION_ID.test(element.id)) return null;
    return { kind: 'section', element: element, id: element.id, label: labelOf(element, element.id) };
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
    if (typeof target.at === 'number') { message.at = target.at; message.page = target.page; }
    parent.postMessage(message, '*');
  }
  // A circle (spec 2026-11-05 point-at): a drag of 12 px or more draws a loop; on release, what it covers is the selection.
  var PARTS = [['announcement', '.es-announce,[data-pagosya-announcement]'], ['header', 'body header:not(main header)'], ['menu', 'body header:not(main header) nav,[data-pagosya-store-menu]'], ['footer', 'body footer:not(main footer)']];
  function pageBox(element) { var r = element.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; }
  function overlap(a, b) { return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); }
  /** Ray casting on the flat [x0,y0,x1,y1,…] loop. */
  function inside(points, x, y) {
    var hit = false;
    for (var i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
      var xi = points[i], yi = points[i + 1], xj = points[j], yj = points[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  function centreIn(points, element) { var b = pageBox(element); return b.width > 0 && inside(points, b.x + b.width / 2, b.y + b.height / 2); }
  function simplify(points) { var step = Math.ceil(points.length / 2 / 64), out = []; for (var i = 0; i < points.length; i += 2 * step) out.push(Math.round(points[i]), Math.round(points[i + 1])); return out; }
  function areaOf(points) {
    var xs = [], ys = []; for (var i = 0; i < points.length; i += 2) { xs.push(points[i]); ys.push(points[i + 1]); }
    var left = Math.max(0, Math.min.apply(null, xs)), top = Math.max(0, Math.min.apply(null, ys));
    var rect = { x: left, y: top, width: Math.max.apply(null, xs) - left, height: Math.max.apply(null, ys) - top };
    if (rect.width < 24 || rect.height < 24) return null;
    var sections = Array.prototype.map.call(document.querySelectorAll('[data-lb-home] > [data-lb], [data-lb-product] > [data-lb]'), function (element) { return addressOf(element, element.parentElement); })
      .filter(Boolean).map(function (s) { return { s: s, o: overlap(rect, pageBox(s.element)) }; }).filter(function (e) { return e.o > 0; })
      .sort(function (a, b) { return b.o - a.o; }).slice(0, 3).map(function (e) { return e.s; });
    var texts = [];
    Array.prototype.forEach.call(document.body.querySelectorAll('*'), function (element) {
      if (texts.length >= 12 || element.children.length || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(element.tagName) || element.closest('[data-pagosya-edit-overlay]')) return;
      var text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && centreIn(points, element)) texts.push(text.slice(0, 200));
    });
    var photos = [];
    Array.prototype.forEach.call(document.querySelectorAll('img,[style*="background-image"]'), function (element) {
      if (photos.length >= 6 || !centreIn(points, element)) return;
      var url = element.tagName === 'IMG' ? (element.currentSrc || element.src) : ((/url\(["']?([^"')]+)/.exec(element.style.backgroundImage) || [])[1] || '');
      if (url && url.length <= 500 && /^(https?:\/\/|\/|assets\/)/.test(url) && photos.indexOf(url) < 0) photos.push(url);
    });
    var parts = PARTS.filter(function (part) { return Array.prototype.some.call(document.querySelectorAll(part[1]), function (element) { return overlap(rect, pageBox(element)) > 0; }); }).map(function (part) { return part[0]; });
    // The preview is an opaque srcdoc: its page and query come from the preview's own globals, never from location.
    var page = String(window.PAGOSYA_PREVIEW_PAGE || 'index.html') + String(window.PAGOSYA_PREVIEW_QUERY || '');
    return { first: sections[0] || null, area: { points: simplify(points), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      sections: sections.map(function (s) { return { page: s.page, at: s.at, label: s.label }; }), texts: texts, photos: photos, parts: parts,
      width: Math.max(280, Math.min(2400, Math.round(innerWidth))), pageQuery: page.slice(0, 200) } };
  }
  /** The loop stays drawn (thin, dark, white halo) until the selection is cleared. */
  function drawLoop(points) {
    if (!loop) { loop = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); loop.setAttribute('data-pagosya-edit-overlay', ''); loop.setAttribute('aria-hidden', 'true'); document.body.appendChild(loop); }
    loop.setAttribute('style', 'position:absolute;left:0;top:0;width:' + document.documentElement.scrollWidth + 'px;height:' + document.documentElement.scrollHeight + 'px;pointer-events:none;z-index:2147483646;overflow:visible');
    var list = []; for (var i = 0; i < points.length; i += 2) list.push(points[i] + ',' + points[i + 1]);
    var line = '<polyline points="' + list.join(' ') + '" fill="none" stroke-linejoin="round" stroke-linecap="round" ';
    loop.innerHTML = line + 'stroke="#fff" stroke-width="6"/>' + line + 'stroke="#18181b" stroke-width="2.5"/>';
  }
  function clearLoop() { if (loop && loop.parentNode) loop.parentNode.removeChild(loop); loop = null; }
  function onDown(event) { if (event.button > 0) return; press = { x: event.clientX, y: event.clientY, points: [event.clientX + scrollX, event.clientY + scrollY] }; drawing = false; }
  function onDrag(event) {
    if (!press) return;
    if (!drawing && Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) < 12) return;
    if (!drawing) { drawing = true; clearLoop(); }
    event.preventDefault();
    press.points.push(event.clientX + scrollX, event.clientY + scrollY);
    drawLoop(press.points);
  }
  function onUp() {
    if (!press) return;
    var points = press.points; press = null;
    if (!drawing) return;
    drawing = false; swallowClick = true;
    var read = areaOf(points);
    if (!read) { clearLoop(); return; }
    var area = read.area, first = read.first;
    if (!first && !area.parts.length) {
      var hit = document.elementFromPoint ? document.elementFromPoint(area.rect.x - scrollX + area.rect.width / 2, area.rect.y - scrollY + area.rect.height / 2) : null;
      if (hit && hit.closest && hit.closest(MOUNTS)) { clearLoop(); post({ kind: 'platform', id: '', label: 'Lo administra pagosYa' }, ''); return; }
      if (!area.texts.length && !area.photos.length) { clearLoop(); return; }
    }
    selected = first ? first.id : '';
    parent.postMessage({ type: 'pagosya:source-select', kind: 'area', sectionId: first ? first.id : 'zona-marcada', label: (first ? first.label : area.texts[0] || 'Zona marcada').slice(0, 60), area: area }, '*');
    schedule();
  }
  function onMove(event) { var target = targetOf(event.target); hovered = target ? target.element : null; schedule(); }
  function onClick(event) {
    // Editing must not follow links, press buttons or add to the cart: the click only selects.
    event.preventDefault(); event.stopPropagation();
    // The click a drawn circle ends with selects nothing more.
    if (swallowClick) { swallowClick = false; return; }
    clearLoop();
    var target = targetOf(event.target);
    if (!target) return;
    var own = event.target.children && event.target.children.length === 0 ? (event.target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    selected = target.kind === 'section' ? target.id : '';
    post(target, own);
    schedule();
  }
  function onKey(event) {
    if (event.key !== 'Escape') return;
    selected = ''; clearLoop();
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
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onDrag, true);
    window.addEventListener('pointerup', onUp, true);
    // A finger draws the circle instead of scrolling the page.
    document.documentElement.style.touchAction = 'none';
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
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onDrag, true);
    window.removeEventListener('pointerup', onUp, true);
    document.documentElement.style.touchAction = '';
    press = null; drawing = false; swallowClick = false; clearLoop();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; tab = null;
  }

  // What the merchant is looking at (spec 2026-11-05 point-at): always on, the section under the middle of the viewport, at most
  // once per 400 ms and only when it changes.
  var viewingTimer = 0, lastViewing = '';
  function viewingNow() {
    viewingTimer = 0;
    var middle = innerHeight / 2, found = null, i, r;
    var list = document.querySelectorAll('[data-lb-home] > [data-lb], [data-lb-product] > [data-lb]');
    for (i = 0; i < list.length && !found; i++) { r = list[i].getBoundingClientRect(); if (r.height && r.top <= middle && r.bottom > middle) found = addressOf(list[i], list[i].parentElement); }
    var main = document.querySelector('main');
    for (i = 0; !found && main && i < main.children.length; i++) {
      var kid = main.children[i]; r = kid.getBoundingClientRect();
      if (r.height && r.top <= middle && r.bottom > middle && SECTION_ID.test(kid.id || '')) found = { id: kid.id, label: labelOf(kid, kid.id), page: 'home' };
    }
    if (!found) return;
    var message = { type: 'pagosya:source-viewing', page: found.page, sectionId: found.id, label: found.label };
    if (typeof found.at === 'number') message.at = found.at;
    var key = JSON.stringify(message);
    if (key === lastViewing) return;
    lastViewing = key;
    parent.postMessage(message, '*');
  }
  function onViewing() { if (!viewingTimer) viewingTimer = setTimeout(viewingNow, 400); }
  window.addEventListener('scroll', onViewing, true);
  window.addEventListener('resize', onViewing);
  window.addEventListener('load', onViewing);

  window.addEventListener('message', function (event) {
    // Only the Studio (the parent window) may switch edit mode.
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.type !== 'pagosya:source-edit-mode') return;
    if (data.on === true) turnOn(typeof data.selectedId === 'string' && SECTION_ID.test(data.selectedId) ? data.selectedId : ''); else turnOff();
  });
})();
