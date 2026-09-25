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
  if (editing) {
    const mediaPaths = new Map(Object.entries(assets).map(([path, value]) => [value, path]));
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
