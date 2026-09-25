/** Sub-project 3 (illustrated motion): the store's confirmation motif, a small DNA drawing shown on the order
 * confirmation. The API sanitised it (source-svg-sanitize.ts) before serving it with the public store; it is verified
 * again here against the same allow-lists (an API test pins them) and imported as nodes, never set as HTML. Decorative:
 * aria-hidden, no pointer events, ≤ 64px, animated once only when motion is allowed. */
const MOTIF_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc'];
const MOTIF_ATTRIBUTES = ['viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'pathLength', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'color', 'transform', 'vector-effect', 'clip-path', 'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'class', 'id', 'data-part', 'aria-hidden', 'focusable'];
const BEHAVIORS = ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float'];
const SVG_NS = 'http://www.w3.org/2000/svg';

let remembered: { behavior: string; svg: string } | null = null;
/** The public store JSON carries `confirmationMotif`; the payment flow that follows reads it here. */
export function rememberConfirmationMotif(value: unknown) {
  const motif = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  remembered = motif && typeof motif.svg === 'string' && motif.svg.length <= 6144 && BEHAVIORS.includes(motif.behavior as string) ? { behavior: motif.behavior as string, svg: motif.svg } : null;
}

function verifiedDrawing(markup: string): SVGSVGElement | null {
  let root: Element | null;
  try { root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement; } catch { return null; }
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg') return null;
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (el.namespaceURI !== SVG_NS || !MOTIF_ELEMENTS.includes(el.localName)) return null;
    for (const attr of Array.from(el.attributes)) {
      if (el === root && attr.name === 'xmlns') continue;
      const value = attr.value;
      if (!MOTIF_ATTRIBUTES.includes(attr.name) || /[<>"`\\]|(?:javascript|vbscript|data)\s*:|expression\s*\(/i.test(value)
        || /url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z][\w-]*\s*\)$/.test(value.trim())) return null;
    }
  }
  return root as unknown as SVGSVGElement;
}

const motionAllowed = () => !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Places the remembered motif at the top of the success panel; nothing when there is none or it fails verification. */
export function mountConfirmationMotif(panel: Element | null) {
  if (!panel || !remembered) return;
  const drawing = verifiedDrawing(remembered.svg);
  if (!drawing) return;
  const holder = document.createElement('span');
  holder.className = 'payment-success-motif';
  holder.setAttribute('aria-hidden', 'true');
  holder.dataset.motifBehavior = remembered.behavior;
  const svg = document.importNode(drawing, true);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const part = ({ glow: 'light', steam: 'steam' } as Record<string, string>)[remembered.behavior];
  if (part && !svg.querySelector(`[data-part="${part}"]`)) svg.setAttribute('data-part', part);
  if (remembered.behavior === 'draw') svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect').forEach(el => el.setAttribute('pathLength', '1'));
  holder.append(svg);
  panel.prepend(holder);
  // purchase is the trigger: it plays once, as the confirmation appears.
  if (motionAllowed()) setTimeout(() => { if (holder.isConnected) holder.setAttribute('data-motif-play', ''); }, 16);
}
