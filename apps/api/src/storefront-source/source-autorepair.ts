import { posix } from 'node:path';
import postcss from 'postcss';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { STATIC_STANDARD_PAGE_PATHS } from './source-static-pages';

/**
 * Contracts that a model does not need to be asked about twice.
 *
 * Six of the preflight rules describe a mechanical property of the source
 * rather than a design decision: an attribute is absent, a reference points at
 * nothing, a declaration is forbidden. Sending those back for another
 * generation costs a round-trip and a retry the merchant pays for, and the
 * model's second answer is not better informed than ours.
 *
 * Every repair here is conservative: it either has one correct outcome or it
 * declines and leaves the failure for the bounded repair. Nothing invents
 * content, and a reference is only rewritten when exactly one real file
 * matches it.
 */

export type RepairContext = {
  /** Every path the saved revision will contain, assets and fonts included. */
  knownPaths: Set<string>;
  /** Alt text for a bundled image, when the asset legend knows a caption. */
  altFor?: (src: string) => string | undefined;
};

export type RepairResult = { files: SourceProjectFileDto[]; repairs: string[] };

const cleanReference = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/, 1)[0];
const isExternal = (value: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(value);
const resolveLocal = (from: string, target: string) => {
  const cleanTarget = target.replace(/^\/+/, '');
  return posix.normalize(target.startsWith('/') ? cleanTarget : posix.join(posix.dirname(from), cleanTarget)).replace(/^\.\//, '');
};

/** Scripts the storefront kit supplies at save time; a missing file is expected. */
const KIT_SCRIPTS = new Set(['config.js', 'commerce.js']);
/** The commerce pages the kit copies into a shop that did not author its own. */
const COMMERCE_KIT_PAGES = ['product.html', 'checkout.html', 'productos.html', 'coleccion.html'];

/** Pages the platform adds after this repair runs, so a link to one is live, not dead: the standard pages always, the commerce pages for a shop. */
export function platformSuppliedPages(sitePurpose: string): string[] {
  return [...STATIC_STANDARD_PAGE_PATHS, ...(sitePurpose === 'shop' ? COMMERCE_KIT_PAGES : [])];
}

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Resolve a dead reference to a real file when exactly one candidate shares its
 * basename. Ambiguity is left alone: guessing between two matches is a design
 * decision, not a repair.
 */
function remapByBasename(target: string, knownPaths: Set<string>): string | null {
  const basename = posix.basename(target);
  if (!basename) return null;
  const matches = [...knownPaths].filter(path => posix.basename(path) === basename);
  return matches.length === 1 ? matches[0] : null;
}

/** True when b is a with exactly one character inserted, deleted or replaced. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * A bundled asset name the model copied with one character dropped, doubled or changed
 * (assets/image-86fa4da35b7.jpg for assets/image-86fa4da35b7b.jpg). Same folder, same
 * extension and exactly one such asset, or no repair.
 */
function remapNearMiss(target: string, knownPaths: Set<string>): string | null {
  if (!/(?:^|\/)assets\//i.test(target)) return null;
  const extension = posix.extname(target).toLowerCase();
  const stem = posix.basename(target, posix.extname(target));
  const matches = [...knownPaths].filter(path => posix.dirname(path) === posix.dirname(target) && posix.extname(path).toLowerCase() === extension && oneEditApart(stem, posix.basename(path, posix.extname(path))));
  return matches.length === 1 ? matches[0] : null;
}

const remapDead = (target: string, knownPaths: Set<string>) => remapByBasename(target, knownPaths) ?? remapNearMiss(target, knownPaths);

export function repairSourceContracts(files: SourceProjectFileDto[], context: RepairContext): RepairResult {
  const repairs: string[] = [];
  const { knownPaths } = context;
  const exists = (from: string, raw: string) => {
    const target = cleanReference(raw);
    if (!target || isExternal(target)) return true;
    return knownPaths.has(resolveLocal(from, target));
  };

  const repaired = files.map(file => {
    if (/\.css$/i.test(file.path)) {
      let content = stripRootOverflowMask(file.content);
      if (content !== file.content) repairs.push(`${file.path}: removed page-wide overflow-x masking`);
      // A dead url(assets/…) that resolves to exactly one real asset. styles/globals.css is served from the
      // site root, so its assets/ references resolve from there (the same rule source-preflight applies).
      content = content.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, quote: string, raw: string) => {
        const target = cleanReference(raw);
        if (!target || isExternal(target) || !/(?:^|\/)assets\//i.test(target)) return whole;
        const from = file.path === 'styles/globals.css' ? 'index.css' : file.path;
        const resolved = resolveLocal(from, target);
        if (knownPaths.has(resolved)) return whole;
        const remapped = remapDead(resolved, knownPaths);
        if (!remapped) return whole;
        const relative = posix.relative(posix.dirname(from), remapped) || remapped;
        repairs.push(`${file.path}: repointed ${target} to ${relative}`);
        return `url(${quote}${relative}${quote})`;
      });
      return content === file.content ? file : { ...file, content };
    }
    if (!/\.html$/i.test(file.path)) return file;

    let html = file.content;

    // 1. An <img> with no alt attribute. A bundled caption when the legend has
    //    one, otherwise empty alt, which is the correct value for decoration.
    html = html.replace(/<img\b(?![^>]*\balt\s*=)([^>]*?)(\/?)>/gi, (_whole, attributes: string, selfClosing: string) => {
      const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      const caption = src ? context.altFor?.(cleanReference(src)) : undefined;
      repairs.push(`${file.path}: supplied alt text${caption ? ' from the asset legend' : ' (decorative)'}`);
      return `<img${attributes.replace(/\s+$/, '')} alt="${caption ? escapeAttribute(caption) : ''}"${selfClosing ? ' /' : ''}>`;
    });

    // 2. A dead asset or page reference that resolves to exactly one real file.
    html = html.replace(/\b(href|src)\s*=\s*(["'])([^"']+)\2/gi, (whole, attribute: string, quote: string, raw: string) => {
      const target = cleanReference(raw);
      if (!target || isExternal(target) || exists(file.path, raw)) return whole;
      const remapped = remapDead(resolveLocal(file.path, target), knownPaths);
      if (!remapped) return whole;
      const relative = posix.relative(posix.dirname(file.path), remapped) || remapped;
      repairs.push(`${file.path}: repointed ${target} to ${relative}`);
      return `${attribute}=${quote}${relative}${quote}`;
    });

    // 3. A <script> whose file does not exist and that the kit will not supply.
    //    A 404 script contributes nothing, so the tag goes.
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, (whole, raw: string) => {
      const target = cleanReference(raw);
      if (!target || isExternal(target) || exists(file.path, raw)) return whole;
      if (KIT_SCRIPTS.has(posix.basename(target))) return whole;
      repairs.push(`${file.path}: dropped script tag for missing ${target}`);
      return '';
    });

    // 4. A dead <a href> with no single match left. The text stays; the link goes.
    html = html.replace(/<a\b([^>]*?)\bhref\s*=\s*(["'])([^"']+)\2([^>]*)>/gi, (whole, before: string, _quote: string, raw: string, after: string) => {
      const target = cleanReference(raw);
      if (!target || isExternal(target) || !/\.html$/i.test(target) || exists(file.path, raw)) return whole;
      repairs.push(`${file.path}: removed broken link to ${target}`);
      return `<a${before}${after}>`;
    });

    if (html === file.content) return file;
    return { ...file, content: html };
  });

  // 5. A homepage with headings but no primary one. Only plain HTML is promoted;
  //    a React homepage composes its heading elsewhere and is left to the model.
  const homeIndex = repaired.findIndex(file => file.path === 'index.html');
  if (homeIndex >= 0 && !/<h1\b/i.test(repaired[homeIndex].content)) {
    const promoted = repaired[homeIndex].content.replace(/<(h2)\b([^>]*)>([\s\S]*?)<\/\1>/i, (_whole, _tag, attributes: string, inner: string) => `<h1${attributes}>${inner}</h1>`);
    if (promoted !== repaired[homeIndex].content) {
      repairs.push('index.html: promoted the leading h2 to the primary h1');
      repaired[homeIndex] = { ...repaired[homeIndex], content: promoted };
    }
  }

  return { files: repaired, repairs };
}

/**
 * Delete only the offending declaration. Component-level clipping is legitimate
 * and is left untouched; the rule is about the page root.
 */
function stripRootOverflowMask(content: string): string {
  try {
    const root = postcss.parse(content);
    let changed = false;
    root.walkRules(rule => {
      if (!splitSelectorList(rule.selector).some(selector => pageRootSelector(selector))) return;
      rule.walkDecls(declaration => {
        if (declaration.prop?.toLowerCase() !== 'overflow-x') return;
        if (!/^(?:hidden|clip)$/i.test(declaration.value.trim())) return;
        declaration.remove();
        changed = true;
      });
      if (!rule.nodes?.length) rule.remove();
    });
    return changed ? root.toString() : content;
  } catch {
    // Malformed CSS is left for the bounded repair rather than edited blindly.
    return content;
  }
}

const pageRootSelector = (selector: string) => {
  let depth = 0;
  let end = selector.length;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (character === '>' || character === '+' || character === '~' || /\s/.test(character))) {
      end = index;
      break;
    }
  }
  const subject = selector.trim().slice(0, end).trim();
  return /^(?:html|body|:root)(?:[#.:\[].*)?$/i.test(subject)
    || /^(?::where|:is)\([^)]*\b(?:html|body|:root)\b[^)]*\)$/i.test(subject);
};

const splitSelectorList = (selectorList: string) => {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      selectors.push(selectorList.slice(start, index));
      start = index + 1;
    }
  }
  selectors.push(selectorList.slice(start));
  return selectors;
};
