import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile } from './surface-parts';
import { withCommerceTemplates } from './surface-inject';

const FILE = composeTemplatesFile([{ part: 'added', css: '.aviso{padding:8px}', html: '<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>' }]);
const page = (path: string) => ({ path, content: `<!doctype html><html><body><main>${path}</main></body></html>` });

describe('withCommerceTemplates', () => {
  it('puts one block before </body> of every page, the platform pages included', () => {
    const out = withCommerceTemplates([page('index.html'), page('product.html'), page('checkout.html'), { path: COMMERCE_TEMPLATES_FILE, content: FILE }, { path: 'config.js', content: 'x' }]);
    for (const path of ['index.html', 'product.html', 'checkout.html']) {
      const html = out.find(f => f.path === path)!.content;
      expect(html.match(/<!--pagosya:commerce-templates-->/g)).toHaveLength(1);
      expect(html.indexOf('data-pagosya-added-template')).toBeLessThan(html.indexOf('</body>'));
    }
    expect(out.find(f => f.path === COMMERCE_TEMPLATES_FILE)!.content).toBe(FILE);
    expect(out.find(f => f.path === 'index.html')!.content).toContain('<style data-commerce-part="added">.aviso{padding:8px}</style>');
  });
  it('replaces, never duplicates, on every later pass (Review Focus 4)', () => {
    let files = [page('index.html'), { path: COMMERCE_TEMPLATES_FILE, content: FILE }];
    for (let i = 0; i < 3; i++) files = withCommerceTemplates(files);
    expect(files[0].content.match(/<!--pagosya:commerce-templates-->/g)).toHaveLength(1);
  });
  it('removes an old block when the file is gone, and leaves stores without it byte-identical', () => {
    const injected = withCommerceTemplates([page('index.html'), { path: COMMERCE_TEMPLATES_FILE, content: FILE }])[0];
    expect(withCommerceTemplates([injected])[0].content).toBe(page('index.html').content);
    const plain = [page('index.html')];
    expect(withCommerceTemplates(plain)).toEqual(plain);
  });
});
