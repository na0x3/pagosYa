  // Card text must not disappear into the card: switch to the store's text or background color, whichever reads.
  // WCAG AA guard for runtime-owned text only: 4.5:1 for body text, 3:1 for large text. Text over
  // photographs or gradients is left alone (its real background is unknown); authored markup outside
  // the commerce slots is never touched.
  const CONTRAST_SLOTS = '[data-pagosya-catalog],[data-pagosya-product-page],[data-pagosya-cart],[data-pagosya-checkout-page],dialog[data-pagosya-product]';
  // The colour probes are inserted and removed on every pass; the observer ignores them, or each pass would queue the next.
  const contrastProbe = () => { const probe = document.createElement('span'); probe.hidden = true; probe.setAttribute('data-pagosya-contrast-probe', ''); return probe; };
  const probeOnly = record => [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && node.hasAttribute('data-pagosya-contrast-probe'));
  function readableText(root) {
    if (!root || !root.isConnected) return;
    const probe = contrastProbe(); root.append(probe);
    // Browsers report color-mix() results as color(srgb r g b / a) with 0–1 channels, not rgb().
    const parseColor = value => { const n = (String(value).match(/[\d.]+/g) || []).map(Number); if (n.length < 3) return null; const scale = /^color\(srgb/i.test(value) ? 255 : 1; return [n[0] * scale, n[1] * scale, n[2] * scale, n.length > 3 ? n[3] : 1]; };
    const rgba = value => { probe.style.color = ''; probe.style.color = value; return parseColor(getComputedStyle(probe).color); };
    const luminance = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    const candidates = ['var(--store-foreground, var(--brand-foreground, #111111))', 'var(--store-background, var(--brand-background, #ffffff))', '#111111', '#ffffff'].map(rgba).filter(Boolean);
    const backgroundOf = element => {
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== 'none') return null;
        const color = parseColor(style.backgroundColor);
        if (color && color[3] > .5) return color;
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO') return null;
      }
      return [255, 255, 255, 1];
    };
    const elements = [root, ...root.querySelectorAll('h1,h2,h3,h4,h5,p,span,a,button,label,li,strong,small,dt,dd,th,td,legend,summary,output')].slice(0, 800);
    for (const element of elements) {
      if (element === probe || element.closest('[data-pagosya-contrast="skip"]')) continue;
      if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
      const style = getComputedStyle(element);
      const text = parseColor(style.color);
      const background = backgroundOf(element);
      if (!text || !background || text[3] < .5) continue;
      const size = parseFloat(style.fontSize) || 16, bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
      const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (contrast(text, background) >= required) continue;
      // Prefer the store's own colors when they read; fall back to the strongest contrast.
      const chosen = candidates.find(c => contrast(c, background) >= required) || candidates.reduce((best, c) => contrast(c, background) > contrast(best, background) ? c : best);
      element.style.color = `rgb(${chosen.slice(0, 3).join(',')})`;
      element.dataset.pagosyaContrast = 'corrected';
    }
    probe.remove();
  }
  /* Sub-project 7: pay and buy buttons and totals read at 4.5:1 whatever sets their colours (the store's CSS, its kit
   * CSS, the DNA). Measured as the scorecard measures: text composited over the ancestors' background colours, over the
   * page canvas (dark under color-scheme: dark). A failing control takes the first readable colour among the store's ink,
   * paper and on-accent, else pure black or white (one of the two always reaches 4.5:1). The colour is set through a guard
   * attribute and a custom property that the kit's first layer answers with !important, so no stylesheet undoes it at
   * rest, while the store's hover and focus colours still apply. Text over an image, a gradient, a pseudo-element or
   * backdrop filter, or a colour syntax the page cannot compare is left alone, and a hovered or focused control is never
   * measured (its interactive colours would be pinned onto its resting state); it is measured once the pointer leaves. */
  const CONTRAST_GUARDED = '.checkout-button,.menu-add,.product-detail__sticky button,[data-pay],[data-checkout],.order-total,.product-detail__subtotal';
  const contrastWarned = typeof WeakSet === 'function' ? new WeakSet() : null;
  const contrastWaiting = typeof WeakSet === 'function' ? new WeakSet() : null;
  const interacting = el => { try { return el.matches(':hover') || el.matches(':focus-visible'); } catch { return el.matches(':hover'); } };
  function resetContrastGuard() {
    document.querySelectorAll('[data-pagosya-contrast-guard]').forEach(el => {
      const target = el.closest('[data-pagosya-contrast-guard="fixed"]');
      if (target && interacting(target)) return;
      el.style.removeProperty('--pagosya-contrast-color'); el.removeAttribute('data-pagosya-contrast-guard');
    });
  }
  function guardContrast() {
    const targets = document.querySelectorAll(CONTRAST_GUARDED);
    if (!targets.length || !document.body) return;
    const parse = value => {
      const text = String(value), n = (text.match(/-?[\d.]+/g) || []).map(Number);
      if (!/^(?:rgba?\(|color\(srgb)/i.test(text) || n.length < 3) return null;
      const scale = /^color\(srgb/i.test(text) ? 255 : 1;
      return [n[0] * scale, n[1] * scale, n[2] * scale, n.length > 3 ? n[3] : 1];
    };
    const over = (top, base) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
    const luminance = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    // A decoration paints no real background: a gradient drawn as a line (the DNA underline-grow hover, at most 2px in
    // one direction, 0 at rest) or a gradient whose colours are all mostly transparent (the DNA shine).
    const decorative = style => {
      const image = style.backgroundImage;
      if (!image || image === 'none') return true;
      if (/url\(/i.test(image)) return false;
      const thin = style.backgroundSize.split(',').every(size => size.trim().split(/\s+/).some(part => /^[\d.]+px$/.test(part) && parseFloat(part) <= 2));
      const stops = image.match(/(?:rgba?|color)\([^)]*\)/gi) || [];
      return thin || (stops.length > 0 && stops.every(stop => { const c = parse(stop); return c && c[3] <= .5; }));
    };
    const REPLACED = 'img,video,canvas,picture,iframe,object,embed';
    // Whether a node's own painting hides what is really behind its text: a backdrop filter, a positioned ::before/::after
    // that paints, or a positioned box over a photo or video (its container's opaque colour is not what it sits on).
    const hidden = new Map();
    const obscured = (node, style) => {
      if (hidden.has(node)) return hidden.get(node);
      let result = false;
      const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;
      if (backdropFilter && backdropFilter !== 'none') result = true;
      for (const pseudo of result ? [] : ['::before', '::after']) {
        const box = getComputedStyle(node, pseudo);
        if (!box.content || box.content === 'none' || box.content === 'normal' || !/^(?:absolute|fixed)$/.test(box.position)) continue;
        const color = parse(box.backgroundColor);
        if ((color && color[3] > .1) || !decorative(box)) { result = true; break; }
      }
      if (!result && /^(?:absolute|fixed|sticky)$/.test(style.position)) {
        const rect = node.getBoundingClientRect(), container = node.offsetParent || node.parentElement;
        result = !!container && [...container.querySelectorAll(REPLACED)].some(media => {
          if (node.contains(media)) return false;
          const box = media.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
        });
      }
      hidden.set(node, result);
      return result;
    };
    const probe = contrastProbe(); document.body.append(probe);
    const resolve = value => { probe.style.color = ''; probe.style.color = value; return parse(getComputedStyle(probe).color); };
    const candidates = ['var(--store-foreground, var(--brand-foreground, #111111))', 'var(--store-background, var(--brand-background, #ffffff))', 'var(--store-accent-foreground, var(--brand-accent-foreground, #ffffff))', '#000000', '#ffffff'].map(resolve).filter(c => c && c[3] >= .99);
    // The page canvas under everything: dark when the page asks for color-scheme: dark.
    const canvas = (() => { const c = resolve('Canvas'); return c && c[3] >= .99 ? c : [255, 255, 255, 1]; })();
    probe.remove();
    // `deep` also asks whether anything hides the real background; only a failing control pays for it.
    const backdrop = (element, deep) => {
      const layers = [];
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (!decorative(style) || (deep && obscured(node, style))) return null;
        const color = parse(style.backgroundColor);
        if (!color) return null;
        if (color[3] > 0) layers.push(color);
        if (color[3] >= .99) break;
      }
      return layers.reverse().reduce((base, layer) => over(layer, base), canvas);
    };
    targets.forEach(target => {
      // A disabled control is exempt (WCAG 1.4.3); renderCart measures again once it is enabled.
      if (target.closest('[data-pagosya-contrast="skip"]') || target.matches(':disabled,[aria-disabled="true"]')) return;
      if (interacting(target)) {
        if (contrastWaiting && !contrastWaiting.has(target)) {
          contrastWaiting.add(target);
          const later = () => { contrastWaiting.delete(target); target.removeEventListener('pointerleave', later); target.removeEventListener('focusout', later); queueReadableText(); };
          target.addEventListener('pointerleave', later); target.addEventListener('focusout', later);
        }
        return;
      }
      const texts = [target, ...target.querySelectorAll('*')].filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()));
      // An icon-only button (the card's + icon) is read through its own colour, which the icon strokes with.
      const nodes = texts.length ? texts : target.querySelector('svg') ? [target] : [];
      const measured = [];
      for (const node of nodes) {
        const background = backdrop(node, false), text = parse(getComputedStyle(node).color);
        if (!background || !text) return;
        measured.push({ node, background, ratio: contrast(over(text, background), background) });
      }
      if (!measured.length || measured.every(entry => entry.ratio >= 4.5)) return;
      if (measured.some(entry => !backdrop(entry.node, true))) return;
      const worst = color => Math.min(...measured.map(entry => contrast(color, entry.background)));
      const chosen = candidates.find(color => worst(color) >= 4.5) || candidates.reduce((best, color) => worst(color) > worst(best) ? color : best, candidates[0]);
      if (!chosen) return;
      const value = `rgb(${chosen.slice(0, 3).map(Math.round).join(',')})`;
      for (const node of new Set([target, ...measured.map(entry => entry.node)])) {
        node.style.setProperty('--pagosya-contrast-color', value);
        node.setAttribute('data-pagosya-contrast-guard', node === target ? 'fixed' : 'text');
      }
      if (contrastWarned && !contrastWarned.has(target)) {
        contrastWarned.add(target);
        console.warn(`pagosYa: contraste ${Math.min(...measured.map(entry => entry.ratio)).toFixed(2)}:1 en un botón de compra o un total; se usó ${value} para que se lea (mínimo 4.5:1).`, target);
      }
    });
  }
  let contrastQueued = false;
  function queueReadableText() {
    if (contrastQueued) return;
    contrastQueued = true;
    setTimeout(() => {
      contrastQueued = false;
      try { resetContrastGuard(); } catch { /* Guards never break the store. */ }
      document.querySelectorAll(CONTRAST_SLOTS).forEach(readableText);
      try { guardContrast(); } catch { /* Guards never break the store. */ }
    }, 120);
  }
  function guardContrastNow() { try { guardContrast(); } catch { /* Guards never break the store. */ } }
  window.addEventListener('load', queueReadableText);
  if (typeof MutationObserver === 'function') {
    // The guard also runs right away (a mutation callback runs before the page's next task), so a pay or buy button
    // never shows unreadable, not even for the timer's 120ms; the timer then measures again with the text fixes applied.
    const watch = () => new MutationObserver(records => { if (records.some(record => record.type === 'childList' && !probeOnly(record) && (record.target.closest?.(CONTRAST_SLOTS) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.(CONTRAST_SLOTS) || node.querySelector?.(CONTRAST_SLOTS)))))) { guardContrastNow(); queueReadableText(); } }).observe(document.body, { childList: true, subtree: true });
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch, { once: true });
  }
