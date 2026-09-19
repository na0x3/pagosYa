import { posix } from 'node:path';
import { BadGatewayException } from '@nestjs/common';
import postcss from 'postcss';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const htmlFiles = (files: SourceProjectFileDto[]) => files.filter(file => /\.html$/i.test(file.path));
const cleanReference = (value: string) => value.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/, 1)[0];
const isExternal = (value: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(value);
const resolveLocal = (from: string, target: string) => {
  const cleanTarget = target.replace(/^\/+/, '');
  return posix.normalize(target.startsWith('/') ? cleanTarget : posix.join(posix.dirname(from), cleanTarget)).replace(/^\.\//, '');
};

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

const masksPageWideOverflow = (content: string) => {
  try {
    const root = postcss.parse(content);
    let masked = false;
    root.walkRules(rule => {
      if (!rule.nodes?.some(node => node.type === 'decl' && node.prop?.toLowerCase() === 'overflow-x' && /^(?:hidden|clip)$/i.test(node.value.trim()))) return;
      if (splitSelectorList(rule.selector).some(selector => pageRootSelector(selector))) masked = true;
    });
    return masked;
  } catch {
    // Preserve the safety gate for malformed CSS while still allowing the
    // normal parser to distinguish component-level clipping from page-wide CSS.
    return /(?:^|[{}])[^{}]*(?:html|body|:root)[^{}]*\boverflow-x\s*:\s*(?:hidden|clip)\b/i.test(content);
  }
};

/**
 * Provider-free safety gate for a generated storefront. It intentionally checks
 * contracts that can be proven from source before the revision is persisted.
 * Browser-only geometry and commerce behavior remain covered by the Chromium benchmark.
 */
export function validateSourcePreflight(files: SourceProjectFileDto[], imageUse: { requiredImagePaths?: string[]; catalogImagePaths?: string[] } = {}): void {
  const paths = new Set(files.map(file => file.path));
  const pages = htmlFiles(files);
  const findPath = (from: string, raw: string) => {
    const target = cleanReference(raw);
    if (!target || isExternal(target)) return null;
    const resolved = resolveLocal(from, target);
    return paths.has(resolved) ? resolved : null;
  };
  const missing: string[] = [];
  const authored = files.filter(file => /\.(?:html|css|tsx|jsx|js)$/.test(file.path) && !file.path.startsWith('_compiled/') && !['commerce.js', 'config.js'].includes(file.path)).map(file => file.content).join('\n');
  const omittedImages = (imageUse.requiredImagePaths || []).filter(path => !authored.includes(path) && !imageUse.catalogImagePaths?.includes(path));
  if (omittedImages.length) missing.push(`requested images are absent from the design: ${omittedImages.join(', ')}. Display these actual local images; do not replace them with illustrations or treat them as reference-only`);

  for (const page of pages) {
    const html = page.content;
    if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(html)) missing.push(`${page.path}: an image is missing alt text`);
    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = match[1];
      const target = cleanReference(raw);
      if (!target || isExternal(target)) continue;
      const isAsset = /(?:^|\/)assets\//i.test(target);
      if (isAsset && !findPath(page.path, target)) missing.push(`${page.path}: missing local asset ${target}`);
      if (!isAsset && /\.html$/i.test(target) && !findPath(page.path, target)) missing.push(`${page.path}: broken internal link ${target}`);
    }
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const target = cleanReference(match[1]);
      if (!target || isExternal(target) || !/\.js(?:$|[?#])/i.test(target)) continue;
      if (!findPath(page.path, target) && !['config.js', 'commerce.js'].includes(posix.basename(target))) missing.push(`${page.path}: missing script ${target}`);
    }
  }

  for (const file of files.filter(file => /\.css$/i.test(file.path))) {
    if (masksPageWideOverflow(file.content)) missing.push(`${file.path}: do not mask page-wide horizontal overflow`);
    for (const match of file.content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const target = cleanReference(match[1]);
      if (/(?:^|\/)assets\//i.test(target) && !findPath(file.path, target)) missing.push(`${file.path}: missing local asset ${target}`);
    }
  }

  const headingSources = files.filter(file => file.path === 'index.html' || /(?:^|\/)components\/home\.(?:tsx|jsx)$/i.test(file.path));
  if (headingSources.length && !headingSources.some(file => /<h1\b/i.test(file.content))) missing.push('homepage: missing a primary h1');
  if (missing.length) throw new BadGatewayException(`La revisión no pasó el preflight automático: ${missing.slice(0, 8).join('; ')}${missing.length > 8 ? `; y ${missing.length - 8} más` : ''}`);
}
