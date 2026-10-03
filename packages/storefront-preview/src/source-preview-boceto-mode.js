/* Boceto mode of the Studio preview (sketch block editor). Injected into the sandboxed preview, never into a
 * published site. Idle until the Studio sends { type: 'pagosya:boceto-mode', on: true }. While on:
 *   - hovering a [data-skb] section outlines it and shows a drag handle;
 *   - clicking drills down block → group → element (Figma) and posts pagosya:boceto-select { id, path };
 *     Esc selects the parent, Enter the first child; Ctrl/⌘+Z and Ctrl/⌘+Shift+Z post pagosya:boceto-key undo/redo;
 *   - grabbing a movable part (text, button, card, cajita… — the Studio lists them per block in `movable`) drags it
 *     among its siblings and posts pagosya:boceto-node-move { id, path, order }; a selected movable part drags as a
 *     whole; ⌥↑/⌥↓/Supr are forwarded as pagosya:boceto-key;
 *   - a part the Studio lists as freeable, dragged 24px past its box, comes out and floats (desktop widths only); a free part
 *     moves freely and its corner square sets its width; both post pagosya:boceto-free { id, path, x, y, w? } in percentages;
 *   - dragging the handle (or grabbing anything else in a section) reorders sections live and posts pagosya:boceto-reorder { id, index };
 *   - dragging a sticker ([data-skb-el="sticker"]) moves it freely and posts pagosya:boceto-el-move { id, x, y } in percentages;
 *   - double-clicking a [data-skb-field] element edits the text in place and posts pagosya:boceto-text. */
(function () {
  var on = false, ready = false, handle = null, indicator = null, hovered = null, dragging = null, editing = null, elDragging = null;
  var photoChip = null, photoTarget = null;
  var selection = { id: '', path: '', label: '' }, boxes = [], hoverBox = null;
  /** Per block, the paths whose position saves (from the Studio): the only parts that drag and the only drop spots. */
  var movableByBlock = {};
  function movableIn(section, node) { var list = movableByBlock[section.getAttribute('data-skb')] || []; return list.indexOf(pathOf(node)) !== -1; }
  /** Per block, the parts that may float (freed ones and inserted elements included); none while YAPI works. */
  var freeableByBlock = {};
  var PATH = /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/;
  var FREE_VARS = ['--skb-fx', '--skb-fy', '--skb-fw', '--skb-fr'];
  function freeableIn(section, node) { var list = freeableByBlock[section.getAttribute('data-skb')] || []; return list.indexOf(pathOf(node)) !== -1; }
  /** Free spots only exist from 900px up: on a phone-width board everything sits in its column. */
  function canFree(section, node) { return window.innerWidth >= 900 && freeableIn(section, node); }
  function isFree(node) { return node.hasAttribute('data-skb-free'); }
  function freeVar(node, name) { var value = parseFloat(node.style.getPropertyValue(name)); return isFinite(value) ? value : null; }
  function clampPct(value, low) { return Math.round(Math.min(100, Math.max(low, value)) * 10) / 10; }
  function grabbable(section, node) { return movableIn(section, node) || canFree(section, node); }

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

  function sections() { return Array.prototype.slice.call(document.querySelectorAll('[data-skb]')); }
  function sectionOf(node) { return node && node.closest ? node.closest('[data-skb]') : null; }

  function selectable(node) { return !!(node && node.nodeType === 1 && (node.hasAttribute('data-skb-group') || node.hasAttribute('data-skb-node') || node.hasAttribute('data-skb-el'))); }
  function segmentOf(node) { return node.getAttribute('data-skb-group') || node.getAttribute('data-skb-node') || node.getAttribute('data-skb-el'); }
  /** The nearest selectable ancestor, or the section itself. */
  function containerOf(node) { var p = node.parentElement; while (p && !selectable(p) && !p.hasAttribute('data-skb')) p = p.parentElement; return p; }
  function pathOf(node) { var parts = []; for (var n = node; n && !n.hasAttribute('data-skb'); n = n.parentElement) if (selectable(n)) parts.unshift(segmentOf(n)); return parts.join('/'); }
  function childrenOf(node) { return Array.prototype.slice.call(node.querySelectorAll('[data-skb-group],[data-skb-node],[data-skb-el]')).filter(function (child) { return containerOf(child) === node; }); }
  function nodeAt(section, path) {
    var node = section;
    if (!path || !node) return node;
    var parts = path.split('/');
    for (var i = 0; i < parts.length && node; i++) node = childrenOf(node).filter(function (child) { return segmentOf(child) === parts[i]; })[0] || null;
    return node;
  }
  function sectionById(id) { return /^[a-z0-9-]{1,40}$/.test(id) ? document.querySelector('[data-skb="' + id + '"]') : null; }
  /** Figma drill-down: the next deeper node toward the target, or the child of the deepest common ancestor. */
  function nextSelection(target) {
    var section = sectionOf(target);
    if (!section) return null;
    var id = section.getAttribute('data-skb');
    var chain = [];
    for (var n = target; n && n !== section; n = n.parentElement) if (selectable(n)) chain.unshift(n);
    var paths = [''].concat(chain.map(pathOf));
    if (selection.id !== id) return { id: id, path: '' };
    var k = 0;
    for (var i = 1; i < paths.length; i++) if (selection.path === paths[i] || selection.path.indexOf(paths[i] + '/') === 0) k = i;
    return { id: id, path: paths[Math.min(k + 1, paths.length - 1)] };
  }
  function select(id, path) {
    selection = { id: id, path: path, label: '' };
    drawOverlay();
    parent.postMessage({ type: 'pagosya:boceto-select', id: id, path: path }, '*');
  }
  function clearBoxes() { boxes.splice(0).forEach(function (box) { box.remove(); }); }
  function makeBox(node, kind, label) {
    var rect = node.getBoundingClientRect();
    var box = document.createElement('div');
    box.setAttribute('data-boceto-box', kind);
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:' +
      (kind === 'selected' ? '2px solid #1f6feb' : kind === 'hover' ? '1px solid #1f6feb' : '1px dashed rgba(31,111,235,.75)');
    if (label) {
      var tag = document.createElement('span');
      tag.textContent = label;
      tag.style.cssText = 'position:absolute;left:-2px;top:-21px;font:600 11px/1 system-ui;padding:4px 7px;border-radius:4px;background:#1f6feb;color:#fff;white-space:nowrap';
      box.append(tag);
    }
    document.body.append(box);
    return box;
  }
  function drawOverlay() {
    clearBoxes();
    if (!on || !selection.id || dragging || elDragging) return;
    var section = sectionById(selection.id);
    var node = section && nodeAt(section, selection.path);
    if (!node) return;
    boxes.push(makeBox(node, 'selected', selection.label));
    if (isFree(node) && canFree(section, node)) boxes.push(makeResizeHandle(node));
    childrenOf(node).forEach(function (child) { boxes.push(makeBox(child, 'child')); });
  }
  function placeHoverBox(target) {
    if (hoverBox) { hoverBox.remove(); hoverBox = null; }
    if (!on || !target || dragging || elDragging || editing) return;
    var next = nextSelection(target);
    var node = next && nodeAt(sectionById(next.id), next.path);
    if (!node || (next.id === selection.id && next.path === selection.path)) return;
    hoverBox = makeBox(node, 'hover');
  }

  function ensure() {
    if (ready) return; ready = true;
    var style = document.createElement('style');
    style.textContent = '' +
      '[data-boceto-dragging]{opacity:.35!important}' +
      // Links and images would start the browser's own drag (which cancels ours) and text would get highlighted.
      'html[data-boceto-on] [data-skb]{-webkit-user-select:none!important;user-select:none!important}' +
      'html[data-boceto-on] [data-skb] :is(a,img){-webkit-user-drag:none!important}' +
      'html[data-boceto-on] [data-skb] [data-boceto-editing]{-webkit-user-select:text!important;user-select:text!important}' +
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

  /** The node a drag should move: the selection when it is movable and under the pointer, otherwise the deepest
   * movable part under the pointer (Figma direct manipulation: grab a title or a card and it moves). */
  function dragCandidate(target) {
    var section = sectionOf(target);
    if (!section) return null;
    var picked = selection.id === section.getAttribute('data-skb') && selection.path ? nodeAt(section, selection.path) : null;
    if (picked && picked.contains(target) && grabbable(section, picked)) return picked;
    for (var n = target; n && n !== section; n = n.parentElement) if (selectable(n) && grabbable(section, n)) return n;
    return null;
  }
  /** Reorder a node among its siblings (Figma auto layout): rows move along x, columns along y. Only siblings whose
   * position saves are drop spots, so a fixed part like the antetítulo never offers one. */
  function startNodeDrag(node, down, now) {
    var section = sectionOf(node), container = containerOf(node);
    if (!section || !container) return;
    if (isFree(node)) { if (canFree(section, node)) startFreeDrag(node, down, false, now); return; }
    var reorder = movableIn(section, node), freeable = canFree(section, node);
    var fromPath = pathOf(node);
    elDragging = node;
    node.setAttribute('data-boceto-dragging', '');
    clearBoxes();
    var style = window.getComputedStyle(container);
    var display = String(style.display);
    var siblings = function () { return childrenOf(container).filter(function (child) { return child !== node && movableIn(section, child); }); };
    var horizontal = container === section ? window.innerWidth >= 900 : (display.indexOf('flex') !== -1 && String(style.flexDirection).indexOf('column') === -1);
    // Multi-column grids (steps, categories, reviews, boxes, gallery): drop by the nearest item in 2D.
    var startLeft = node.getBoundingClientRect().left;
    var grid = container !== section && display.indexOf('grid') !== -1 && siblings().some(function (child) { return Math.abs(child.getBoundingClientRect().left - startLeft) > 1; });
    var target = null, alongX = horizontal;
    var move = function (ev) {
      if (freeable) {
        var bounds = container.getBoundingClientRect();
        if (ev.clientX < bounds.left - 24 || ev.clientX > bounds.right + 24 || ev.clientY < bounds.top - 24 || ev.clientY > bounds.bottom + 24) {
          stop(); node.removeAttribute('data-boceto-dragging'); target = null;
          startFreeDrag(node, down, true, ev);
          return;
        }
      }
      if (!reorder) return;
      target = null;
      var list = siblings();
      if (grid) {
        var best = null, bestDistance = Infinity;
        list.forEach(function (child) {
          var r = child.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var distance = Math.pow(ev.clientX - cx, 2) + Math.pow(ev.clientY - cy, 2);
          if (distance < bestDistance) { bestDistance = distance; best = { node: child, cx: cx, cy: cy, height: r.height }; }
        });
        if (best) {
          alongX = Math.abs(ev.clientY - best.cy) < best.height / 2;
          target = { node: best.node, before: alongX ? ev.clientX < best.cx : ev.clientY < best.cy };
        }
      } else {
        for (var i = 0; i < list.length; i++) {
          var rect = list[i].getBoundingClientRect();
          var before = horizontal ? ev.clientX < rect.left + rect.width / 2 : ev.clientY < rect.top + rect.height / 2;
          if (before) { target = { node: list[i], before: true }; break; }
          target = { node: list[i], before: false };
        }
      }
      if (!target) { indicator.style.display = 'none'; return; }
      var box = target.node.getBoundingClientRect();
      indicator.style.display = 'block';
      indicator.style.right = 'auto';
      if (alongX) { indicator.style.top = box.top + 'px'; indicator.style.height = box.height + 'px'; indicator.style.width = '4px'; indicator.style.left = (target.before ? box.left : box.right) - 2 + 'px'; }
      else { indicator.style.left = box.left + 'px'; indicator.style.width = box.width + 'px'; indicator.style.height = '4px'; indicator.style.top = (target.before ? box.top : box.bottom) - 2 + 'px'; }
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      indicator.style.display = 'none';
      indicator.style.left = '12px'; indicator.style.right = '12px'; indicator.style.width = 'auto'; indicator.style.height = '4px';
    };
    var finish = function () {
      stop();
      node.removeAttribute('data-boceto-dragging');
      elDragging = null;
      if (target) {
        var order = siblings().map(segmentOf);
        order.splice(order.indexOf(segmentOf(target.node)) + (target.before ? 0 : 1), 0, segmentOf(node));
        // The copy/media columns swap through the flip attribute the Studio applies live; moving them in the DOM
        // would leave a later "Foto al lado" change without effect until a reload.
        if (container !== section) { if (target.before) target.node.before(node); else target.node.after(node); }
        parent.postMessage({ type: 'pagosya:boceto-node-move', id: section.getAttribute('data-skb'), path: fromPath, order: order }, '*');
      }
      drawOverlay();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    // A cancelled pointer (the browser took over the gesture) must not leave the canvas stuck mid-drag.
    document.addEventListener('pointercancel', finish, true);
  }

  /** A free part (or one just pulled out of its box) follows the pointer inside its positioning box — its section, or
   * the photo column it sits in — and the drop is posted as percentages of that box. Moves are measured from the press,
   * so a turned part does not drift. */
  function startFreeDrag(node, down, detach, now) {
    var section = sectionOf(node);
    var holder = node.offsetParent || section;
    var rect = node.getBoundingClientRect();
    var pct = function (value, size) { return size ? (value / size) * 100 : 0; };
    // Out of the flow, the part no longer holds its section up: measure the box after it closes the gap, so the spot
    // (a percentage of that box) puts the part where it was, under the pointer.
    if (detach) node.setAttribute('data-skb-free', 'on');
    var box = holder.getBoundingClientRect();
    var fromX = detach ? pct(rect.left - box.left, box.width) : (freeVar(node, '--skb-fx') || 0);
    var fromY = detach ? pct(rect.top - box.top, box.height) : (freeVar(node, '--skb-fy') || 0);
    var width = detach ? clampPct(pct(rect.width, box.width), 5) : freeVar(node, '--skb-fw');
    var at = { x: fromX, y: fromY };
    elDragging = node;
    clearBoxes();
    if (detach) node.style.setProperty('--skb-fw', String(width));
    var move = function (ev) {
      at.x = clampPct(fromX + pct(ev.clientX - down.clientX, box.width), 0);
      at.y = clampPct(fromY + pct(ev.clientY - down.clientY, box.height), 0);
      node.style.setProperty('--skb-fx', String(at.x));
      node.style.setProperty('--skb-fy', String(at.y));
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', cancel, true);
      elDragging = null;
    };
    var finish = function () {
      stop();
      var message = { type: 'pagosya:boceto-free', id: section.getAttribute('data-skb'), path: pathOf(node), x: clampPct(at.x, 0), y: clampPct(at.y, 0) };
      if (width !== null) message.w = width;
      parent.postMessage(message, '*');
      drawOverlay();
    };
    // The browser took the gesture: a part pulled out just now goes back in; a free part keeps its saved spot.
    var cancel = function () {
      stop();
      if (detach) { node.removeAttribute('data-skb-free'); FREE_VARS.forEach(function (name) { node.style.removeProperty(name); }); }
      else { node.style.setProperty('--skb-fx', String(fromX)); node.style.setProperty('--skb-fy', String(fromY)); }
      drawOverlay();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', cancel, true);
    if (now) move(now);
  }

  /** The corner square on a selected free part: dragging it sets the part's width (percent of its box). */
  function makeResizeHandle(node) {
    var rect = node.getBoundingClientRect();
    var grip = document.createElement('div');
    grip.setAttribute('data-boceto-resize', '');
    grip.style.cssText = 'position:fixed;z-index:2147483647;width:10px;height:10px;box-sizing:border-box;background:#fff;border:2px solid #1f6feb;border-radius:2px;cursor:nwse-resize;touch-action:none;left:' + (rect.right - 5) + 'px;top:' + (rect.bottom - 5) + 'px';
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      var section = sectionOf(node), holder = node.offsetParent || section;
      var box = holder.getBoundingClientRect();
      var from = freeVar(node, '--skb-fw');
      if (from === null) from = box.width ? (node.getBoundingClientRect().width / box.width) * 100 : 0;
      var width = clampPct(from, 5);
      elDragging = node;
      clearBoxes();
      var move = function (ev) { width = clampPct(from + (box.width ? ((ev.clientX - event.clientX) / box.width) * 100 : 0), 5); node.style.setProperty('--skb-fw', String(width)); };
      var finish = function () {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', finish, true);
        document.removeEventListener('pointercancel', finish, true);
        elDragging = null;
        parent.postMessage({ type: 'pagosya:boceto-free', id: section.getAttribute('data-skb'), path: pathOf(node), x: freeVar(node, '--skb-fx') || 0, y: freeVar(node, '--skb-fy') || 0, w: width }, '*');
        drawOverlay();
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', finish, true);
      document.addEventListener('pointercancel', finish, true);
    });
    document.body.append(grip);
    return grip;
  }

  /** Live free spots from the Studio: set each listed path, and put back any part no longer listed. */
  function applyFree(section, map) {
    var kept = [];
    for (var path in map) {
      var pos = map[path];
      if (!PATH.test(path) || !pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || !isFinite(pos.x) || !isFinite(pos.y)) continue;
      var node = nodeAt(section, path);
      if (!node || node === section) continue;
      kept.push(node);
      node.setAttribute('data-skb-free', 'on');
      node.style.setProperty('--skb-fx', String(clampPct(pos.x, 0)));
      node.style.setProperty('--skb-fy', String(clampPct(pos.y, 0)));
      if (typeof pos.w === 'number' && isFinite(pos.w)) node.style.setProperty('--skb-fw', String(clampPct(pos.w, 5))); else node.style.removeProperty('--skb-fw');
      if (typeof pos.r === 'number' && isFinite(pos.r) && pos.r) node.style.setProperty('--skb-fr', String(Math.round(Math.min(180, Math.max(-180, pos.r))))); else node.style.removeProperty('--skb-fr');
    }
    Array.prototype.slice.call(section.querySelectorAll('[data-skb-free]')).forEach(function (node) {
      if (sectionOf(node) !== section || kept.indexOf(node) !== -1) return;
      node.removeAttribute('data-skb-free');
      FREE_VARS.forEach(function (name) { node.style.removeProperty(name); });
    });
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
    // An inserted element never empties (the Studio keeps its words and says how to remove it).
    if (!value && /^extras\./.test(element.getAttribute('data-skb-field') || '')) element.textContent = original;
    parent.postMessage({ type: 'pagosya:boceto-text', id: section.getAttribute('data-skb'), field: element.getAttribute('data-skb-field'), value: value }, '*');
  }

  document.addEventListener('pointerover', function (event) {
    if (!on || dragging || elDragging || editing) return;
    setHovered(sectionOf(event.target));
    placeHoverBox(event.target);
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
    var startX = event.clientX, startY = event.clientY;
    var arm = function (ev) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
      cleanup();
      placePhotoChip(null);
      var sticker = event.target instanceof Element ? event.target.closest('[data-skb-el="sticker"]') : null;
      if (sticker && sectionOf(sticker) === section) { startStickerDrag(sticker, ev); return; }
      var drag = dragCandidate(event.target);
      if (drag) {
        if (selection.id !== section.getAttribute('data-skb') || pathOf(drag) !== selection.path) select(section.getAttribute('data-skb'), pathOf(drag));
        startNodeDrag(drag, event, ev);
        return;
      }
      hovered = section;
      startDrag(ev);
    };
    var cleanup = function () {
      document.removeEventListener('pointermove', arm, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
    };
    document.addEventListener('pointermove', arm, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);
  }, true);
  // No native drag on the board: it would swallow the pointer events our drags run on (text being edited excepted).
  document.addEventListener('dragstart', function (event) { if (on && !(editing && editing.contains(event.target))) event.preventDefault(); }, true);
  document.addEventListener('scroll', function () { placeHandle(); if (photoTarget) placePhotoChip(photoTarget); drawOverlay(); }, true);
  window.addEventListener('resize', drawOverlay);
  document.addEventListener('click', function (event) {
    if (!on || dragging) return;
    if (event.target === handle || editing) return;
    var section = sectionOf(event.target);
    if (!section) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var next = nextSelection(event.target);
    if (next) select(next.id, next.path);
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
    // The key only finishes the edit: stop it here so the selection handler below does not also move the selection.
    if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); stopEditing(true); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stopEditing(false); }
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!on || editing) return;
    // Ctrl/⌘+Z goes back a step (with Shift, or Ctrl+Y, forward again); the Studio keeps the steps.
    var key = String(event.key || '').toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'z' || (key === 'y' && !event.shiftKey))) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: key === 'y' || event.shiftKey ? 'redo' : 'undo' }, '*'); return; }
    if (!selection.id) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: event.key === 'ArrowUp' ? 'up' : 'down' }, '*'); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: 'delete' }, '*'); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!selection.path) select('', '');
      else select(selection.id, selection.path.split('/').slice(0, -1).join('/'));
    } else if (event.key === 'Enter') {
      var section = sectionById(selection.id), node = section && nodeAt(section, selection.path);
      var kids = node ? childrenOf(node) : [];
      if (kids.length) { event.preventDefault(); select(selection.id, pathOf(kids[0])); }
    }
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
      var sel = event.data.selection;
      if (sel && typeof sel === 'object' && typeof sel.id === 'string' && typeof sel.path === 'string' && sel.path.length <= 120) {
        selection = { id: sel.id, path: sel.path, label: typeof sel.label === 'string' ? sel.label.slice(0, 60) : '' };
        // Chosen from the Studio's layer tree: report where the part sits so the board can scroll to it.
        var revealSection = sel.reveal === true && on ? sectionById(selection.id) : null;
        var revealNode = revealSection && nodeAt(revealSection, selection.path);
        if (revealNode) {
          var revealRect = revealNode.getBoundingClientRect();
          parent.postMessage({ type: 'pagosya:boceto-reveal', top: revealRect.top + (window.scrollY || 0), height: revealRect.height }, '*');
        }
      }
      var blocks = event.data.blocks || {};
      for (var id in blocks) {
        if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
        var section = document.querySelector('[data-skb="' + id + '"]');
        if (!section) continue;
        var spec = blocks[id] || {};
        if (Array.isArray(spec.movable)) movableByBlock[id] = spec.movable.filter(function (path) { return typeof path === 'string' && PATH.test(path); }).slice(0, 120);
        if (Array.isArray(spec.freeable)) freeableByBlock[id] = spec.freeable.filter(function (path) { return typeof path === 'string' && PATH.test(path); }).slice(0, 160);
        if (spec.free && typeof spec.free === 'object') applyFree(section, spec.free);
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
          if (!/^(photo|items\.\d+\.photo|photos\.\d+|extras\.\d+\.value)$/.test(slot) || typeof photos[slot] !== 'string' || !/^data:image\/(png|jpe?g|webp|avif|gif);base64,/.test(photos[slot])) continue;
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
        if (spec.layout && typeof spec.layout === 'object') {
          var setOrClear = function (node, name, value, pattern) { if (typeof value === 'string' && pattern.test(value)) node.setAttribute(name, value); else node.removeAttribute(name); };
          var layoutSpec = spec.layout, owner = section;
          Array.prototype.slice.call(section.querySelectorAll('[data-skb-group]')).forEach(function (groupNode) {
            if (sectionOf(groupNode) !== owner) return;
            var entry = layoutSpec[groupNode.getAttribute('data-skb-group')] || {};
            setOrClear(groupNode, 'data-skb-gap', entry.gap, /^(s|m|l)$/);
            setOrClear(groupNode, 'data-skb-dir', entry.dir, /^(row|column)$/);
            setOrClear(groupNode, 'data-skb-galign', entry.align, /^(start|center|end)$/);
            setOrClear(groupNode, 'data-skb-valign', entry.valign, /^(start|center|end)$/);
          });
        }
      }
      drawOverlay();
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
    if (on) document.documentElement.setAttribute('data-boceto-on', ''); else document.documentElement.removeAttribute('data-boceto-on');
    drawOverlay();
    if (!on) { setHovered(null); placePhotoChip(null); clearBoxes(); placeHoverBox(null); if (editing) stopEditing(false); }
    placeHandle();
  });
  try { parent.postMessage({ type: 'pagosya:boceto-ready' }, '*'); } catch (error) { /* no parent */ }
})();
