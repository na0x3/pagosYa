/* Runs inside the preview sandbox before authored scripts. Resolve media at the
 * DOM boundary so computed URLs work just like literal asset paths. */
(function (assets, page) {
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
