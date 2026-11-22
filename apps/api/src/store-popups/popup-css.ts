import postcss, { type AtRule, type Rule } from 'postcss';

/** Popups 2.0 (spec 2026-11-18 §5): YAPI's sheet for one design, scoped to the popup and guarded. Every selector lives under
 *  [data-pya-popup="<id>"], keyframes get the design's prefix, outside URLs and imports go, and nothing may hide the close
 *  button, the fields or the submit button. `dropped` names what was removed — it goes back to YAPI on a retry. */
export const MAX_POPUP_CSS = 24_000;

const LOCAL_URL = /^(?:\/v1\/uploads\/[A-Za-z0-9._-]+|assets\/[A-Za-z0-9._/-]+)$/;
// Selectors that reach the parts a shopper needs: the hooks themselves, or every button / input.
const GUARDED = /\[data-(?:close|field|submit)\b|(?:^|[\s>+~(,])(?:button|input)\b/;
const HIDING: Array<[RegExp, RegExp]> = [
  [/^display$/, /^none\b/], [/^visibility$/, /^(?:hidden|collapse)\b/], [/^opacity$/, /^0*(?:\.0+)?$/], [/^pointer-events$/, /^none\b/],
  [/^(?:clip|clip-path)$/, /./], [/^(?:width|height|max-width|max-height)$/, /^0(?:px|em|rem|%)?$/], [/^transform$/, /scale\(\s*0\s*[,)]/],
];
const inKeyframes = (node: { parent?: unknown }) => {
  const parent = node.parent as AtRule | undefined;
  return parent?.type === 'atrule' && /keyframes$/i.test(parent.name);
};

/** `max`: a family popup carries the shared sheet plus its own (spec 2026-11-21 §6: 24 + 6 KB, plus the scope on every selector). */
export function scopePopupCss(css: string, designId: string, max = MAX_POPUP_CSS): { css: string; dropped: string[] } | { problem: string } {
  if (typeof css !== 'string') return { problem: 'Falta el CSS del popup.' };
  const tooBig = { problem: `El CSS supera los ${Math.round(max / 1000)} KB.` };
  if (css.length > max * 2) return tooBig;
  const scope = `[data-pya-popup="${designId}"]`;
  const prefix = `pp-${designId.slice(0, 8)}-`;
  let root: postcss.Root;
  try { root = postcss.parse(css); } catch { return { problem: 'El CSS no se pudo leer.' }; }
  const dropped: string[] = [];
  const keyframes = new Map<string, string>();
  root.walkComments(comment => { comment.remove(); });
  root.walkAtRules(at => {
    const name = at.name.toLowerCase();
    if (/keyframes$/.test(name)) { const renamed = prefix + at.params.trim(); keyframes.set(at.params.trim(), renamed); at.params = renamed; return; }
    if (name === 'font-face') {
      const urls = [...at.toString().matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map(m => m[2].trim());
      if (urls.some(url => !LOCAL_URL.test(url))) { dropped.push('@font-face de fuera de la tienda'); at.remove(); }
      return;
    }
    if (name !== 'media' && name !== 'supports') { dropped.push(`@${name}`); at.remove(); }
  });
  root.walkRules(rule => {
    // A nested rule (CSS nesting) already sits inside a scoped one.
    if (inKeyframes(rule) || rule.parent?.type === 'rule') return;
    rule.selectors = rule.selectors.map(selector => {
      const trimmed = selector.trim();
      if (/^(?::root|html|body)$/i.test(trimmed)) return scope;
      return `${scope} ${trimmed.replace(/^(?::root|html|body)\s+/i, '')}`;
    });
  });
  root.walkDecls(decl => {
    const prop = decl.prop.toLowerCase(), value = decl.value.trim();
    const urls = [...value.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map(m => m[2].trim());
    // Escapes (`\\75 rl(`) and bare addresses (image-set("https://…")) are how a url() hides from the check above.
    if (urls.some(url => !LOCAL_URL.test(url)) || /expression\s*\(|javascript:|\\/i.test(value) || /\b(?:https?|ftp|wss?):/i.test(value) || /(?:^|[\s,("'])\/\//.test(value)) { dropped.push(`${prop}: dirección fuera de la tienda`); decl.remove(); return; }
    const rule = decl.parent as Rule | undefined;
    if (rule?.type !== 'rule' || inKeyframes(rule)) return;
    if (prop === 'position' && /^fixed\b/i.test(value) && rule.selector !== scope) { dropped.push(`${rule.selector}: position fixed`); decl.remove(); return; }
    if (GUARDED.test(rule.selector) && HIDING.some(([p, v]) => p.test(prop) && v.test(value))) { dropped.push(`${rule.selector}: ${prop}: ${value} (oculta un control)`); decl.remove(); return; }
    if (prop === 'animation' || prop === 'animation-name') decl.value = value.replace(/[A-Za-z_][\w-]*/g, word => keyframes.get(word) ?? word);
  });
  root.walkRules(rule => { if (!rule.nodes?.length) rule.remove(); });
  const out = root.toString().trim();
  if (out.length > max) return tooBig;
  return { css: out, dropped };
}

/** Part 2 (final review I6): a stored, scoped sheet given back as plain CSS — the welcome's look handed to YAPI for the other
 *  moments, which scopePopupCss then scopes to each new design. */
export function unscopePopupCss(css: string, designId: string): string {
  const scope = `[data-pya-popup="${designId}"]`;
  return css.split(`${scope} `).join('').split(scope).join(':root').split(`pp-${designId.slice(0, 8)}-`).join('');
}
