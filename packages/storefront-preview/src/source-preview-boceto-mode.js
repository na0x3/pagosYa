/* Boceto mode of the Studio preview (sketch block editor). Injected into the sandboxed preview, never into a
 * published site. Idle until the Studio sends { type: 'pagosya:boceto-mode', on: true }. While on:
 *   - hovering a [data-skb] section outlines it and shows a drag handle;
 *   - clicking a section posts pagosya:boceto-select;
 *   - dragging the handle reorders sections live and posts pagosya:boceto-reorder { id, index };
 *   - double-clicking a [data-skb-field] element edits the text in place and posts pagosya:boceto-text. */
(function () {
  var on = false, ready = false, handle = null, indicator = null, hovered = null, dragging = null, editing = null;

  function sections() { return Array.prototype.slice.call(document.querySelectorAll('[data-skb]')); }
  function sectionOf(node) { return node && node.closest ? node.closest('[data-skb]') : null; }

  function ensure() {
    if (ready) return; ready = true;
    var style = document.createElement('style');
    style.textContent = '[data-boceto-hover]{outline:2px solid #1f6feb!important;outline-offset:-2px!important}' +
      '[data-boceto-dragging]{opacity:.35!important}' +
      '[data-boceto-editing]{outline:2px dashed #1f6feb!important;outline-offset:-2px!important;cursor:text!important}';
    document.head.append(style);
    handle = document.createElement('button');
    handle.type = 'button';
    handle.textContent = '⠿ Mover';
    handle.setAttribute('data-boceto-handle', '');
    handle.style.cssText = 'position:fixed;display:none;z-index:2147483647;font:12px/1 system-ui;padding:6px 10px;border-radius:999px;border:0;background:#1f6feb;color:#fff;cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,.25);touch-action:none';
    document.body.append(handle);
    indicator = document.createElement('div');
    indicator.style.cssText = 'position:fixed;display:none;z-index:2147483647;height:4px;left:0;right:0;background:#1f6feb;border-radius:2px;pointer-events:none';
    document.body.append(indicator);
    handle.addEventListener('pointerdown', startDrag);
  }

  function placeHandle() {
    if (!handle) return;
    if (!on || !hovered || dragging) { handle.style.display = 'none'; return; }
    var rect = hovered.getBoundingClientRect();
    handle.style.display = 'block';
    handle.style.top = Math.max(8, rect.top + 8) + 'px';
    handle.style.left = (rect.left + 8) + 'px';
  }

  function setHovered(section) {
    if (hovered === section) return;
    if (hovered) hovered.removeAttribute('data-boceto-hover');
    hovered = section;
    if (hovered) hovered.setAttribute('data-boceto-hover', '');
    placeHandle();
  }

  function startDrag(event) {
    if (!hovered) return;
    event.preventDefault();
    var section = hovered;
    dragging = section;
    section.setAttribute('data-boceto-dragging', '');
    handle.style.display = 'none';
    if (handle.setPointerCapture) { try { handle.setPointerCapture(event.pointerId); } catch (error) { /* pointer capture is a nicety */ } }
    var move = function (ev) {
      // Auto-scroll near the viewport edges so long pages stay reachable.
      if (ev.clientY < 70) window.scrollBy(0, -18); else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 18);
      var target = dropTarget(ev.clientY);
      if (!target) { indicator.style.display = 'none'; return; }
      var rect = target.section.getBoundingClientRect();
      indicator.style.display = 'block';
      indicator.style.top = (target.before ? rect.top : rect.bottom) - 2 + 'px';
    };
    var finish = function (ev) {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      indicator.style.display = 'none';
      section.removeAttribute('data-boceto-dragging');
      dragging = null;
      var target = dropTarget(ev.clientY);
      if (target && target.section !== section) {
        // Move live so the merchant sees the result instantly; the Studio saves and reloads the real revision.
        if (target.before) target.section.before(section); else target.section.after(section);
        var index = sections().indexOf(section);
        parent.postMessage({ type: 'pagosya:boceto-reorder', id: section.getAttribute('data-skb'), index: index }, '*');
        if (section.scrollIntoView) section.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      placeHandle();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
  }

  function dropTarget(clientY) {
    var list = sections().filter(function (section) { return section !== dragging; });
    for (var i = 0; i < list.length; i++) {
      var rect = list[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return { section: list[i], before: true };
    }
    return list.length ? { section: list[list.length - 1], before: false } : null;
  }

  function startEditing(element) {
    if (editing) stopEditing(false);
    editing = element;
    element.setAttribute('data-boceto-editing', '');
    element.setAttribute('contenteditable', 'plaintext-only');
    if (element.contentEditable !== 'plaintext-only') element.setAttribute('contenteditable', 'true');
    element.dataset.bocetoOriginal = element.textContent || '';
    element.focus();
    try { document.execCommand('selectAll', false, null); } catch (error) { /* selection is a nicety */ }
  }
  function stopEditing(commit) {
    if (!editing) return;
    var element = editing; editing = null;
    element.removeAttribute('contenteditable');
    element.removeAttribute('data-boceto-editing');
    var original = element.dataset.bocetoOriginal || '';
    delete element.dataset.bocetoOriginal;
    var value = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!commit || value === original.replace(/\s+/g, ' ').trim()) { if (!commit) element.textContent = original; return; }
    var section = sectionOf(element);
    if (!section || value.length > 1000) { element.textContent = original; return; }
    parent.postMessage({ type: 'pagosya:boceto-text', id: section.getAttribute('data-skb'), field: element.getAttribute('data-skb-field'), value: value }, '*');
  }

  document.addEventListener('pointerover', function (event) { if (on && !dragging && !editing) setHovered(sectionOf(event.target)); }, true);
  document.addEventListener('scroll', placeHandle, true);
  document.addEventListener('click', function (event) {
    if (!on || dragging) return;
    if (event.target === handle || editing) return;
    var section = sectionOf(event.target);
    if (!section) return;
    event.preventDefault(); event.stopImmediatePropagation();
    parent.postMessage({ type: 'pagosya:boceto-select', id: section.getAttribute('data-skb') }, '*');
  }, true);
  document.addEventListener('dblclick', function (event) {
    if (!on) return;
    var element = event.target instanceof Element ? event.target.closest('[data-skb-field]') : null;
    if (!element) return;
    event.preventDefault(); event.stopImmediatePropagation();
    startEditing(element);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (!editing) return;
    if (event.key === 'Enter') { event.preventDefault(); stopEditing(true); }
    if (event.key === 'Escape') { event.preventDefault(); stopEditing(false); }
  }, true);
  document.addEventListener('focusout', function () { if (editing) stopEditing(true); }, true);

  window.addEventListener('message', function (event) {
    if (event.source !== parent || !event.data || event.data.type !== 'pagosya:boceto-mode') return;
    on = event.data.on === true;
    if (on) ensure();
    if (!on) { setHovered(null); if (editing) stopEditing(false); }
    placeHandle();
  });
})();
