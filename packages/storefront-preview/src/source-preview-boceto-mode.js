/* Boceto mode of the Studio preview (sketch block editor). Injected into the sandboxed preview, never into a
 * published site. Idle until the Studio sends { type: 'pagosya:boceto-mode', on: true }. While on:
 *   - hovering a [data-skb] section outlines it and shows a drag handle;
 *   - clicking a section posts pagosya:boceto-select;
 *   - dragging the handle (or grabbing anywhere) reorders sections live and posts pagosya:boceto-reorder { id, index };
 *   - dragging a [data-skb-el] copy element reorders it inside its block and posts pagosya:boceto-el-reorder { id, order };
 *   - dragging a sticker ([data-skb-el="sticker"]) moves it freely and posts pagosya:boceto-el-move { id, x, y } in percentages;
 *   - double-clicking a [data-skb-field] element edits the text in place and posts pagosya:boceto-text. */
(function () {
  var on = false, ready = false, handle = null, indicator = null, hovered = null, dragging = null, editing = null, elDragging = null;
  var photoChip = null, photoTarget = null;

  /** "Cambiar foto": a chip over the hovered photo; clicking it asks the Studio to open its photo picker. */
  function placePhotoChip(img) {
    if (!photoChip) {
      photoChip = document.createElement('button');
      photoChip.type = 'button';
      photoChip.textContent = 'Cambiar foto';
      photoChip.style.cssText = 'position:fixed;display:none;z-index:2147483647;font:600 12px/1 system-ui;padding:7px 11px;border-radius:999px;border:0;background:#fff;color:#111;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      photoChip.addEventListener('pointerdown', function (event) { event.stopPropagation(); }, true);
      photoChip.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        var section = photoTarget && sectionOf(photoTarget);
        if (section) parent.postMessage({ type: 'pagosya:boceto-photo', id: section.getAttribute('data-skb'), slot: photoTarget.getAttribute('data-skb-photo') }, '*');
      });
      document.body.append(photoChip);
    }
    photoTarget = img;
    if (!img || !on || dragging || elDragging || editing) { photoChip.style.display = 'none'; return; }
    var rect = img.getBoundingClientRect();
    photoChip.style.display = 'block';
    photoChip.style.top = Math.max(8, rect.top + 10) + 'px';
    photoChip.style.left = Math.max(8, rect.right - photoChip.offsetWidth - 10) + 'px';
  }

  /** Drag one button of a two-button row past the other to swap them. */
  function startButtonDrag(button) {
    var row = button.parentElement, section = sectionOf(button);
    var other = Array.prototype.slice.call(row.children).filter(function (node) { return node !== button && node.classList.contains('skb-btn'); })[0];
    if (!section || !other) return false;
    elDragging = button;
    button.setAttribute('data-boceto-dragging', '');
    var crossed = false;
    var move = function (ev) {
      var box = other.getBoundingClientRect(), mid = box.left + box.width / 2;
      var buttonFirst = button.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
      crossed = buttonFirst ? ev.clientX > mid : ev.clientX < mid;
      other.style.outline = crossed ? '2px dashed #1f6feb' : '';
    };
    var finish = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      button.removeAttribute('data-boceto-dragging');
      other.style.outline = '';
      elDragging = null;
      if (!crossed) return;
      if (button.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) other.after(button); else other.before(button);
      parent.postMessage({ type: 'pagosya:boceto-swap', id: section.getAttribute('data-skb') }, '*');
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    return true;
  }

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
    indicator.style.cssText = 'position:fixed;display:none;z-index:2147483647;height:4px;left:12px;right:12px;background:#1f6feb;border-radius:2px;pointer-events:none;transition:top 90ms ease';
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
    // A ghost of the section follows the cursor, Figma-style.
    var ghost = section.cloneNode(true);
    ghost.removeAttribute('data-boceto-dragging');
    ghost.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:' + Math.min(section.offsetWidth, 420) + 'px;transform:scale(' + Math.min(1, 320 / Math.max(1, section.offsetWidth)) + ');transform-origin:top left;opacity:.92;border-radius:10px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35);max-height:240px;left:' + (event.clientX + 14) + 'px;top:' + (event.clientY + 10) + 'px';
    document.body.append(ghost);
    if (handle.setPointerCapture) { try { handle.setPointerCapture(event.pointerId); } catch (error) { /* pointer capture is a nicety */ } }
    var move = function (ev) {
      ghost.style.left = (ev.clientX + 14) + 'px';
      ghost.style.top = (ev.clientY + 10) + 'px';
      // Auto-scroll near the viewport edges so long pages stay reachable.
      if (ev.clientY < 70) window.scrollBy(0, -22); else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 22);
      var target = dropTarget(ev.clientY);
      if (!target) { indicator.style.display = 'none'; return; }
      var rect = target.section.getBoundingClientRect();
      indicator.style.display = 'block';
      indicator.style.top = (target.before ? rect.top : rect.bottom) - 2 + 'px';
    };
    var finish = function (ev) {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      ghost.remove();
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

  /** Free drag for a sticker: it follows the cursor inside its positioning parent and the final
   * spot is posted as percentages, so the saved sketch reproduces it at any width. */
  function startStickerDrag(element, event) {
    var section = sectionOf(element);
    var parentBox = element.offsetParent || section;
    if (!section || !parentBox) return;
    elDragging = element;
    var rect = element.getBoundingClientRect();
    var grabX = event.clientX - rect.left, grabY = event.clientY - rect.top;
    var move = function (ev) {
      var box = parentBox.getBoundingClientRect();
      element.style.left = (ev.clientX - grabX - box.left) + 'px';
      element.style.top = (ev.clientY - grabY - box.top) + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    };
    var finish = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      elDragging = null;
      var box = parentBox.getBoundingClientRect();
      var finalRect = element.getBoundingClientRect();
      var x = box.width ? Math.min(100, Math.max(0, ((finalRect.left - box.left) / box.width) * 100)) : 0;
      var y = box.height ? Math.min(100, Math.max(0, ((finalRect.top - box.top) / box.height) * 100)) : 0;
      x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10;
      element.style.left = x + '%';
      element.style.top = y + '%';
      parent.postMessage({ type: 'pagosya:boceto-el-move', id: section.getAttribute('data-skb'), el: element.getAttribute('data-skb-el'), x: x, y: y }, '*');
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
  }

  /** Reorder a copy element (headline, buttons, pills…) among its visible siblings. The resulting
   * on-page order is posted whole; the Studio merges it with the block's hidden elements. */
  function startElementDrag(element) {
    var section = sectionOf(element);
    var column = element.parentElement;
    if (!section || !column) return;
    elDragging = element;
    element.setAttribute('data-boceto-dragging', '');
    var siblings = function () {
      return Array.prototype.slice.call(column.children).filter(function (node) {
        return node !== element && node.hasAttribute && node.hasAttribute('data-skb-el');
      });
    };
    var target = null;
    var move = function (ev) {
      target = null;
      var list = siblings();
      for (var i = 0; i < list.length; i++) {
        var rect = list[i].getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) { target = { node: list[i], before: true }; break; }
        target = { node: list[i], before: false };
      }
      if (!target) { indicator.style.display = 'none'; return; }
      var box = target.node.getBoundingClientRect();
      indicator.style.display = 'block';
      indicator.style.left = box.left + 'px';
      indicator.style.right = 'auto';
      indicator.style.width = box.width + 'px';
      indicator.style.top = (target.before ? box.top : box.bottom) - 2 + 'px';
    };
    var finish = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      indicator.style.display = 'none';
      indicator.style.left = '12px'; indicator.style.right = '12px'; indicator.style.width = 'auto';
      element.removeAttribute('data-boceto-dragging');
      elDragging = null;
      if (target) {
        if (target.before) target.node.before(element); else target.node.after(element);
        var order = Array.prototype.slice.call(column.children)
          .map(function (node) { return node.getAttribute && node.getAttribute('data-skb-el'); })
          .filter(Boolean);
        parent.postMessage({ type: 'pagosya:boceto-el-reorder', id: section.getAttribute('data-skb'), order: order }, '*');
      }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
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

  document.addEventListener('pointerover', function (event) {
    if (!on || dragging || elDragging || editing) return;
    setHovered(sectionOf(event.target));
    if (event.target === photoChip) return;
    var photo = event.target instanceof Element ? event.target.closest('img[data-skb-photo]') : null;
    if (photo || (photoChip && photoChip.style.display !== 'none' && !(photoTarget && photoTarget.contains(event.target)))) placePhotoChip(photo);
  }, true);
  // Grab anywhere: a real drag starts only after 6px of travel, so clicks and double-clicks survive.
  // A press on a copy element ([data-skb-el]) drags that element; anywhere else drags the section.
  document.addEventListener('pointerdown', function (event) {
    if (!on || dragging || elDragging || editing || event.button !== 0) return;
    if (event.target === handle) return;
    var section = sectionOf(event.target);
    if (!section) return;
    var element = event.target instanceof Element ? event.target.closest('[data-skb-el]') : null;
    var rowButton = event.target instanceof Element ? event.target.closest('.skb-actions > .skb-btn') : null;
    var startX = event.clientX, startY = event.clientY;
    var arm = function (ev) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
      cleanup();
      placePhotoChip(null);
      if (rowButton && startButtonDrag(rowButton)) return;
      if (element && element.getAttribute('data-skb-el') === 'sticker') { startStickerDrag(element, ev); return; }
      if (element) { startElementDrag(element); return; }
      hovered = section;
      startDrag(ev);
    };
    var cleanup = function () {
      document.removeEventListener('pointermove', arm, true);
      document.removeEventListener('pointerup', cleanup, true);
    };
    document.addEventListener('pointermove', arm, true);
    document.addEventListener('pointerup', cleanup, true);
  }, true);
  document.addEventListener('scroll', function () { placeHandle(); if (photoTarget) placePhotoChip(photoTarget); }, true);
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
    if (event.source !== parent || !event.data) return;
    if (event.data.type === 'pagosya:boceto-apply') {
      var root = document.documentElement;
      var vars = event.data.vars || {};
      for (var key in vars) if (/^--skb-[a-z0-9-]+$/.test(key) && typeof vars[key] === 'string' && vars[key].length < 200) root.style.setProperty(key, vars[key]);
      var site = document.querySelector('.skb-site');
      var style = event.data.style || {};
      if (site) for (var styleKey in style) {
        if (/^(radius|buttons|cards|header|footer)$/.test(styleKey) && /^[a-z]{3,10}$/.test(String(style[styleKey]))) site.setAttribute('data-skb-' + styleKey, style[styleKey]);
      }
      var blocks = event.data.blocks || {};
      for (var id in blocks) {
        if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
        var section = document.querySelector('[data-skb="' + id + '"]');
        if (!section) continue;
        var spec = blocks[id] || {};
        if (typeof spec.bg === 'string' && /^#[0-9a-f]{6}$/i.test(spec.bg)) section.style.setProperty('--skb-bg', spec.bg);
        if (typeof spec.ink === 'string' && /^#[0-9a-f]{6}$/i.test(spec.ink)) section.style.setProperty('--skb-ink', spec.ink);
        if (spec.align === 'center' || spec.align === 'end') section.setAttribute('data-skb-align', spec.align);
        else if (spec.align === 'start') section.removeAttribute('data-skb-align');
        if (spec.flip === true) section.setAttribute('data-skb-flip', 'on');
        else if (spec.flip === false) section.removeAttribute('data-skb-flip');
        if (typeof spec.form === 'string' && /^(pill|stacked|underline|card)$/.test(spec.form)) section.setAttribute('data-skb-form', spec.form);
        // Photos arrive as inline data: the preview inlines assets when it builds the page, so a raw path would not load.
        var photos = spec.photos || {};
        for (var slot in photos) {
          if (!/^(photo|items\.\d+\.photo|photos\.\d+)$/.test(slot) || typeof photos[slot] !== 'string' || !/^data:image\/(png|jpe?g|webp|avif|gif);base64,/.test(photos[slot])) continue;
          var target = section.querySelector('img[data-skb-photo="' + slot + '"]');
          if (target) target.setAttribute('src', photos[slot]);
        }
        if (typeof spec.size === 'string' && /^(s|m|l|xl)$/.test(spec.size)) section.className = section.className.replace(/skb--(s|m|l|xl)/, 'skb--' + spec.size);
        if (typeof spec.variant === 'string' && /^[a-z-]{2,20}$/.test(spec.variant)) {
          var media = section.querySelector('[class*="skb-hero__media"]');
          if (media) media.className = 'skb-hero__media skb-hero__media--' + spec.variant;
        }
        if (typeof spec.cardRatio === 'string' && /^[0-9] \/ [0-9]$/.test(spec.cardRatio)) section.style.setProperty('--skb-card-ratio', spec.cardRatio);
        if (spec.cardDesc === 'on' || spec.cardDesc === 'off') section.setAttribute('data-skb-card-desc', spec.cardDesc);
        if (spec.cardAdd === 'on' || spec.cardAdd === 'off') section.setAttribute('data-skb-card-add', spec.cardAdd);
      }
      return;
    }
    if (event.data.type !== 'pagosya:boceto-mode') return;
    on = event.data.on === true;
    if (on) {
      // Content height from the body's own box, never the viewport: a forced iframe height would
      // echo back through scrollHeight and the whitespace below the footer could never shrink.
      var report = function () { try { parent.postMessage({ type: 'pagosya:boceto-size', height: Math.ceil(document.body ? document.body.getBoundingClientRect().height : document.documentElement.scrollHeight) }, '*'); } catch (e) {}
      };
      report();
      setTimeout(report, 600);
      if (!window.__bocetoSize && typeof ResizeObserver === 'function' && document.body) {
        window.__bocetoSize = true;
        new ResizeObserver(report).observe(document.body);
      }
      if (!window.__bocetoWheel) {
        window.__bocetoWheel = true;
        document.addEventListener('wheel', function (ev) {
          if (!on) return;
          ev.preventDefault();
          parent.postMessage({ type: 'pagosya:boceto-wheel', dx: ev.deltaX, dy: ev.deltaY, ctrl: ev.ctrlKey || ev.metaKey, x: ev.clientX, y: ev.clientY }, '*');
        }, { passive: false, capture: true });
      }
    }
    if (on) ensure();
    if (!on) { setHovered(null); placePhotoChip(null); if (editing) stopEditing(false); }
    placeHandle();
  });
  try { parent.postMessage({ type: 'pagosya:boceto-ready' }, '*'); } catch (error) { /* no parent */ }
})();
