import { parse } from 'parse5';
import type { ValidEmailKit } from './email-kit-contract';
import { attrOf, fragmentOf, has, walk, type Element, type Node } from './email-dom';

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i;

function declared(el: Element, property: 'background' | 'color'): string | null {
  const style = attrOf(el, 'style')?.value ?? '';
  const pattern = property === 'background' ? /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i : /(?:^|;)\s*color\s*:\s*([^;]+)/i;
  return style.match(pattern)?.[1].match(COLOUR)?.[0] ?? null;
}

/** The nearest declared value, from the element outwards. */
function inherited(el: Element | null, property: 'background' | 'color'): string | null {
  for (let node: any = el; node && node.tagName; node = node.parentNode) {
    const value = declared(node, property);
    if (value) return value;
  }
  return null;
}

/**
 * The store layout's own colours, under the brand token names the standard blocks use. A stand-in
 * block (one the AI's kit lacks) then sits on the layout's surface in its text colour instead of the
 * platform's white, when the store has no confirmed brand colours to offer.
 */
export function layoutColorTokens(kit: ValidEmailKit): Map<string, string> {
  const tokens = new Map<string, string>();
  if (!kit.layout) return tokens;
  const doc = parse(kit.layout) as unknown as Node;
  const content = [...walk(doc)].find(el => has(el, 'data-email-content')) ?? null;
  const body = [...walk(doc)].find(el => el.tagName === 'body') ?? null;
  const set = (name: string, value: string | null) => { if (value) tokens.set(name, value); };
  set('--brand-surface', inherited(content, 'background'));
  set('--brand-foreground', inherited(content, 'color'));
  set('--brand-background', body ? declared(body, 'background') : null);
  const link = kit.blocks.button ? [...walk(fragmentOf(kit.blocks.button))].find(el => has(el, 'data-block-link')) ?? null : null;
  set('--brand-accent', inherited(link, 'background') ?? tokens.get('--brand-foreground') ?? null);
  set('--brand-accent-foreground', (link && declared(link, 'color')) ?? tokens.get('--brand-surface') ?? null);
  return tokens;
}
