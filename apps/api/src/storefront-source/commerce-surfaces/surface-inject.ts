import { COMMERCE_TEMPLATES_FILE, readTemplatesFile, templatesMarkup } from './surface-parts';

const START = '<!--pagosya:commerce-templates-->', END = '<!--/pagosya:commerce-templates-->';
const BLOCK = /<!--pagosya:commerce-templates-->[\s\S]*?<!--\/pagosya:commerce-templates-->/g;

/** Spec 2026-10-15: the runtime finds templates in the current document only, and product.html / the catalog pages are
 *  platform pages re-copied from the kit on every serve (withSourceRuntime), so every served page carries the store's
 *  templates. Idempotent; without the file, pages are untouched. */
export function withCommerceTemplates<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  const source = templatesMarkup(readTemplatesFile(files.find(file => file.path === COMMERCE_TEMPLATES_FILE)?.content ?? ''));
  return files.map(file => {
    if (!file.path.endsWith('.html') || file.encoding === 'base64' || file.encoding === 'url') return file;
    const clean = file.content.includes(START) ? file.content.replace(BLOCK, '') : file.content;
    if (!source) return clean === file.content ? file : { ...file, content: clean };
    const injected = `${START}${source}${END}`;
    const at = clean.lastIndexOf('</body>');
    return { ...file, content: at === -1 ? clean + injected : clean.slice(0, at) + injected + clean.slice(at) };
  });
}

/** Saved pages never keep an injected block (review I7): served pages get it from withSourceRuntime, and stored HTML stays what
 *  the store authored, so substring sniffers (data-pagosya-product-page, data-pagosya-cart …) never see template attributes. */
export function withoutCommerceTemplates<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  return files.map(file => file.path.endsWith('.html') && file.content.includes(START) ? { ...file, content: file.content.replace(BLOCK, '') } : file);
}
