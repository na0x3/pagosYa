/* Runs inside the preview sandbox before authored scripts. Resolve media at the
 * DOM boundary so computed URLs work just like literal asset paths. */
// A fragment: source-preview.ts imports it ?raw and appends the call arguments.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
(function (assets, page, editing) {
  const base = new URL(page, 'https://source.invalid/');
  const resolve = value => {
    if (typeof value !== 'string' || /^(?:[a-z]+:|\/\/|#)/i.test(value.trim())) return value;
    try {
      const url = new URL(value, base);
      const asset = assets[decodeURIComponent(url.pathname.slice(1))];
      return asset ? asset + url.hash : value;
    } catch { return value; }
  };
  const srcset = value => typeof value === 'string'
    ? value.replace(/(^|,\s*)([^\s,]+)(?=\s|,|$)/g, (_match, separator, path) => separator + resolve(path))
    : value;
  const css = value => typeof value === 'string'
    ? value.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote, path) => {
      const resolved = resolve(path);
      return resolved === path ? match : `url("${resolved}")`;
    }) : value;
  const mediaAttribute = (element, name, value) => {
    if (name === 'style') return css(value);
    if (!element.matches('img,source,video,audio')) return value;
    if (name === 'src' || name === 'poster') return resolve(value);
    return name === 'srcset' ? srcset(value) : value;
  };
  const setAttribute = Element.prototype.setAttribute;
  const mediaPaths = new Map(Object.entries(assets).map(([path, value]) => [value, path]));
  // Owner 2026-11-17 («easy picture changing»): the Studio's selection asks which saved photo a clicked image shows.
  window.__pagosyaAssetPath = url => mediaPaths.get(url) || '';
  // Owner 2026-11-17 («double click on an image and the ability to change it»): a double-clicked photo tells the Studio which saved
  // photo it is, or that it is a product's own photo (the catalogue's, changed in Productos).
  // The photo under the pointer: the clicked image itself, or one inside the clicked link or card (a photo with pointer-events off
  // under its card link); never a photo elsewhere on the page behind it (a fixed hero).
  const photoAt = (target, x, y) => {
    if (!target) return null;
    const own = target.closest('img');
    if (own) return own;
    const box = target.closest('a,figure,li,article') || target;
    return Array.from(box.querySelectorAll('img')).find(img => { const r = img.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || null;
  };
  window.__pagosyaPhotoAt = photoAt;
  // The photo under the first press of a double click, remembered before anything moves: the first click into a freshly loaded
  // preview can scroll it, and the double click must still change the photo the merchant aimed at.
  let pressed = { img: null, at: 0 };
  // The first click into the preview gives it focus, and the browser may scroll back to the element that last had focus inside it
  // (the top): a scroll that comes with that focus, right after a press, is put back.
  let pressY = null, pressAt = 0;
  window.addEventListener('pointerdown', event => { if (event.isTrusted) { pressY = window.scrollY; pressAt = Date.now(); } }, { capture: true, passive: true });
  const keepPlace = () => { if (pressY !== null && Date.now() - pressAt < 500 && Math.abs(window.scrollY - pressY) > 40) window.scrollTo({ top: pressY, behavior: 'instant' }); };
  window.addEventListener('focus', () => requestAnimationFrame(keepPlace), true);
  document.addEventListener('focusin', () => requestAnimationFrame(keepPlace), true);
  window.addEventListener('pointerdown', event => {
    // The second press of a double click keeps the first one's photo.
    if (event.isTrusted && event.button === 0 && Date.now() - pressed.at > 500) pressed = { img: photoAt(event.target instanceof Element ? event.target : null, event.clientX, event.clientY), at: Date.now() };
  }, { capture: true, passive: true });
  document.addEventListener('dblclick', event => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    const img = (Date.now() - pressed.at < 900 && pressed.img && pressed.img.isConnected ? pressed.img : null) || photoAt(target, event.clientX, event.clientY);
    if (!img) return;
    const image = mediaPaths.get(img.getAttribute('src') || '') || '';
    // A design's own photo is changed here; a product's photo goes on to the inline editor, which opens that product.
    if (!image) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // Which copy of that photo it is (the same photo can sit in the header's menu and on the page): its part — the store's frame
    // (header, menu, footer) or the page — and its place among the same photo there, in page order.
    const inFrame = element => Boolean(element.closest('header, footer, [data-nav-shell], .ui-nav__panel-wrap'));
    const frame = inFrame(img);
    const nth = Array.from(document.querySelectorAll('img')).filter(other => other.getAttribute('src') === img.getAttribute('src') && inFrame(other) === frame).indexOf(img);
    parent.postMessage({ type: 'pagosya:photo-dblclick', image, region: frame ? 'frame' : 'page', nth: Math.max(0, nth) }, '*');
  }, true);
  // A photo inside a link (a recipe card opening its product): the click waits a moment, so a double click changes the photo
  // instead of leaving the page; a single click still follows the link.
  let linkTimer = 0;
  // On window, in capture: this script runs first, so the delay comes before the store's own link handlers.
  window.addEventListener('click', event => {
    if (editing) return;
    const target = event.target instanceof Element ? event.target : null;
    const img = photoAt(target, event.clientX, event.clientY);
    const link = img && target?.closest('a[href]');
    if (!link) return;
    event.preventDefault(); event.stopImmediatePropagation();
    clearTimeout(linkTimer);
    if (event.detail < 2) linkTimer = setTimeout(() => link.click(), 280);
  }, true);
  if (editing) {
    const selector = 'img,h1,h2,h3,h4,h5,h6,p,span,strong,em,a,button,blockquote';
    const target = event => event.target instanceof Element ? event.target.closest(selector) : null;
    let outlined;
    const clear = () => { if (outlined) outlined.removeAttribute('data-preview-edit-hover'); outlined = null; };
    const style = document.createElement('style');
    style.textContent = '[data-preview-edit-hover]{outline:2px solid #735da5!important;outline-offset:4px!important;cursor:crosshair!important}';
    document.head.append(style);
    document.addEventListener('pointerover', event => { clear(); outlined = target(event); if (outlined) setAttribute.call(outlined, 'data-preview-edit-hover', ''); }, true);
    document.addEventListener('pointerout', clear, true);
    document.addEventListener('click', event => {
      const element = target(event); if (!element) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const image = element.tagName === 'IMG';
      const value = image ? mediaPaths.get(element.getAttribute('src')) : element.textContent?.replace(/\s+/g, ' ').trim();
      if (typeof value === 'string' && value.length <= 3000) parent.postMessage({ type: 'pagosya:visual-select', kind: image ? 'image' : 'text', value }, '*');
    }, true);
  }
  Element.prototype.setAttribute = function (name, value) {
    return setAttribute.call(this, name, mediaAttribute(this, String(name).toLowerCase(), value));
  };
  const patchProperty = (prototype, name, transform) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.set || !descriptor.configurable) return;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      set(value) { descriptor.set.call(this, transform(value)); },
    });
  };
  patchProperty(HTMLImageElement.prototype, 'src', resolve);
  patchProperty(HTMLImageElement.prototype, 'srcset', srcset);
  patchProperty(HTMLSourceElement.prototype, 'src', resolve);
  patchProperty(HTMLSourceElement.prototype, 'srcset', srcset);
  patchProperty(HTMLMediaElement.prototype, 'src', resolve);
  patchProperty(HTMLVideoElement.prototype, 'poster', resolve);
  for (const name of ['background', 'backgroundImage', 'mask', 'maskImage', 'webkitMask', 'webkitMaskImage', 'cssText']) {
    patchProperty(CSSStyleDeclaration.prototype, name, css);
  }
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
    return setProperty.call(this, name, css(value), priority);
  };
  // Markup inserted through innerHTML bypasses the DOM setters above.
  const rewrite = element => {
    for (const name of ['src', 'srcset', 'poster', 'style']) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const next = mediaAttribute(element, name, value);
      if (next !== value) setAttribute.call(element, name, next);
    }
  };
  const visit = node => {
    if (node.nodeType !== 1) return;
    rewrite(node);
    node.querySelectorAll('img,source,video,audio,[style]').forEach(rewrite);
  };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') rewrite(record.target);
      else record.addedNodes.forEach(visit);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'style'] });
})
