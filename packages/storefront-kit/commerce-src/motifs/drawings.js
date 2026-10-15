  /* DNA motifs (sub-project 3): small line drawings the kit places next to the product title, in a corner of matching
   * cards and in the cart header, and animates with its own keyframes on the --motion-* tokens. The API sanitised the
   * markup; it is verified again against the same allow-lists (a test pins them) and imported as nodes, never as HTML.
   * A store without motifs gets no style, no slot and no attribute. */
  const MOTIF_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc'];
  const MOTIF_ATTRIBUTES = ['viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'pathLength', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'color', 'transform', 'vector-effect', 'clip-path', 'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'class', 'id', 'data-part', 'aria-hidden', 'focusable'];
  const MOTIF_BEHAVIORS = ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float'];
  const MOTIF_SLOT_TRIGGERS = ['appear', 'scroll', 'hover', 'add-to-cart'];
  function parseMotifDrawing(markup) {
    let root;
    try { root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement; } catch { return null; }
    const SVG_NS = 'http://www.w3.org/2000/svg';
    if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg') return null;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.namespaceURI !== SVG_NS || !MOTIF_ELEMENTS.includes(el.localName)) return null;
      for (const attr of [...el.attributes]) {
        if (el === root && attr.name === 'xmlns') continue;
        const value = attr.value;
        if (!MOTIF_ATTRIBUTES.includes(attr.name) || /[<>"`\\]|(?:javascript|vbscript|data)\s*:|expression\s*\(/i.test(value)
          || /url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z][\w-]*\s*\)$/.test(value.trim())) return null;
      }
    }
    root.removeAttribute('transform'); // a root transform would move the drawing out of its slot
    return root;
  }
  // Every distinct drawing string is parsed and sanitised once (finding 4): a public catalog can place the same
  // drawing on well over a hundred cards, and DOMParser is not cheap. Every call after the first for the same
  // markup clones the cached, already-sanitised element; callers may freely mutate their own clone. Defined here,
  // ahead of AI_MOTIFS/PACK_MOTIFS below (both call motifDrawing while filtering, at module-evaluation time).
  const motifDrawingCache = new Map();
  function motifDrawing(markup) {
    if (!motifDrawingCache.has(markup)) motifDrawingCache.set(markup, parseMotifDrawing(markup));
    const cached = motifDrawingCache.get(markup);
    return cached ? cached.cloneNode(true) : null;
  }
  const AI_MOTIFS = (Array.isArray(config.motifs) ? config.motifs : []).slice(0, 3).filter(motif => motif && typeof motif === 'object'
    && MOTIF_BEHAVIORS.includes(motif.behavior) && MOTIF_SLOT_TRIGGERS.includes(motif.trigger) && ['product', 'card', 'cart'].includes(motif.placement)
    && ['store', 'category', 'product'].includes(motif.for) && typeof motif.target === 'string' && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg));
  /* Identity libraries (T2a): one drawn motif pack, at most 8 placements, one drawing each. The API sanitised the markup
   * (config.motifPack, re-sanitised on every save); it is verified again here with the same lists. Pack motifs are
   * store-wide; the store's own targeted motifs above keep precedence in the slots both can fill. A store without a
   * pack gets nothing new: no entry, no style, no observer. */
  const MOTIF_PACK_PLACEMENTS = ['button', 'pattern', 'divider', 'sticker', 'empty', 'product', 'card', 'cart'];
  const MOTIF_PACK_TRIGGERS = { product: 'appear', card: 'hover', cart: 'add-to-cart', button: 'hover', pattern: 'none', divider: 'scroll', sticker: 'appear', empty: 'appear' };
  const MOTIF_PACK = config.motifPack && typeof config.motifPack === 'object' && typeof config.motifPack.id === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.motifPack.id) && Array.isArray(config.motifPack.motifs) ? config.motifPack : null;
  const PACK_MOTIFS = (MOTIF_PACK ? MOTIF_PACK.motifs : []).slice(0, 8).filter((motif, index, all) => motif && typeof motif === 'object'
    && MOTIF_PACK_PLACEMENTS.includes(motif.placement) && all.findIndex(other => other && other.placement === motif.placement) === index
    && MOTIF_BEHAVIORS.includes(motif.behavior) && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg))
    .map(motif => ({ file: '', for: 'store', target: '', behavior: motif.behavior, trigger: MOTIF_PACK_TRIGGERS[motif.placement], placement: motif.placement, svg: motif.svg, pack: true }));
  const MOTIFS = [...AI_MOTIFS, ...PACK_MOTIFS];
  const packMotif = placement => MOTIFS.findIndex(motif => motif.pack && motif.placement === placement);
  let motifObserver = null;
