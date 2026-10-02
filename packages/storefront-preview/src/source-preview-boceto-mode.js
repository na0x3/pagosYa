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
  // Grab anywhere on a section: a real drag starts only after 6px of travel, so clicks and double-clicks survive.
  document.addEventListener('pointerdown', function (event) {
    if (!on || dragging || editing || event.button !== 0) return;
    if (event.target === handle) return;
    var section = sectionOf(event.target);
    if (!section) return;
    var startX = event.clientX, startY = event.clientY;
    var arm = function (ev) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
      cleanup();
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
    if (event.source !== parent || !event.data) return;
    if (event.data.type === 'pagosya:boceto-apply') {
      var root = document.documentElement;
      var vars = event.data.vars || {};
      for (var key in vars) if (/^--skb-[a-z-]+$/.test(key) && typeof vars[key] === 'string' && vars[key].length < 200) root.style.setProperty(key, vars[key]);
      var blocks = event.data.blocks || {};
      for (var id in blocks) {
        if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
        var section = document.querySelector('[data-skb="' + id + '"]');
        if (!section) continue;
        var spec = blocks[id] || {};
        if (typeof spec.bg === 'string' && /^#[0-9a-f]{6}$/i.test(spec.bg)) section.style.setProperty('--skb-bg', spec.bg);
        if (typeof spec.ink === 'string' && /^#[0-9a-f]{6}$/i.test(spec.ink)) section.style.setProperty('--skb-ink', spec.ink);
        if (typeof spec.size === 'string' && /^(s|m|l|xl)$/.test(spec.size)) section.className = section.className.replace(/skb--(s|m|l|xl)/, 'skb--' + spec.size);
        if (typeof spec.variant === 'string' && /^[a-z-]{2,20}$/.test(spec.variant)) {
          var media = section.querySelector('[class*="skb-hero__media"]');
          if (media) media.className = 'skb-hero__media skb-hero__media--' + spec.variant;
        }
        if (typeof spec.photo === 'string' && /^assets\/[\w.-]+$/.test(spec.photo)) {
          var img = section.querySelector('img.skb-hero__img,img.skb-story__img,img.skb-split__img');
          if (img) img.setAttribute('src', spec.photo);
        }
      }
      return;
    }
    if (event.data.type !== 'pagosya:boceto-mode') return;
    on = event.data.on === true;
    if (on) {
      var report = function () { try { parent.postMessage({ type: 'pagosya:boceto-size', height: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) }, '*'); } catch (e) {}
      };
      report();
      setTimeout(report, 600);
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
    if (!on) { setHovered(null); if (editing) stopEditing(false); }
    placeHandle();
  });
  try { parent.postMessage({ type: 'pagosya:boceto-ready' }, '*'); } catch (error) { /* no parent */ }
})();
