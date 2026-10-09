/**
 * product.html and checkout.html are almost entirely runtime-owned: the model styles them, the runtime fills the mount.
 * A page that forgot its mount, the shared stylesheet or the commerce scripts is wired in place and reported, so one
 * mechanical slip no longer throws away a whole multi-minute generation (validateGeneratedSource still guards the result).
 */
const MOUNTS: Record<string, string> = { 'product.html': 'data-pagosya-product-page', 'checkout.html': 'data-pagosya-checkout-page' };
const SCRIPTS = ['config.js', 'commerce.js', 'site.js'];
const scriptTag = (src: string) => new RegExp(`<script\\b[^>]*\\bsrc=["']${src.replace('.', '\\.')}["'][^>]*>\\s*</script>\\s*`, 'gi');
const hasScript = (html: string, src: string) => new RegExp(`src=["']${src.replace('.', '\\.')}["']`).test(html);

function beforeClosing(html: string, tag: 'head' | 'body', insert: string): string {
  const at = html.search(new RegExp(`</${tag}>`, 'i'));
  return at < 0 ? (tag === 'head' ? insert + html : html + insert) : html.slice(0, at) + insert + html.slice(at);
}

export function repairCommercePageWiring<T extends { path: string; content: string }>(files: T[]): { files: T[]; repairs: string[] } {
  const repairs: string[] = [];
  const next = files.map(file => {
    const mount = MOUNTS[file.path];
    if (!mount || typeof file.content !== 'string') return file;
    let html = file.content;
    const fixed: string[] = [];
    if (!html.includes(mount)) {
      html = /<main\b/i.test(html) ? html.replace(/<main\b/i, `<main ${mount}`) : beforeClosing(html, 'body', `<main ${mount}></main>`);
      fixed.push(mount);
    }
    if (!html.includes('styles.css')) {
      html = beforeClosing(html, 'head', '<link rel="stylesheet" href="styles.css">');
      fixed.push('styles.css');
    }
    const missing = SCRIPTS.filter(src => !hasScript(html, src));
    if (missing.length) {
      // Re-emit all three in order: appending only the missing one could load config.js after commerce.js.
      for (const src of SCRIPTS) html = html.replace(scriptTag(src), '');
      html = beforeClosing(html, 'body', SCRIPTS.map(src => `<script src="${src}"></script>`).join(''));
      fixed.push(...missing);
    }
    if (!fixed.length) return file;
    repairs.push(`${file.path}: wired missing ${fixed.join(', ')}`);
    return { ...file, content: html };
  });
  return { files: next, repairs };
}
