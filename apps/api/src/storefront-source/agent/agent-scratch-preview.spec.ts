import { agentPreviewSnapshot } from './agent-capture';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { nextStoreFiles } from '../fixtures/next-store';
import { nextSourceFile } from '../source-next';
jest.setTimeout(60_000);
it('prepares scratch-authored components without a saved revision or a designer template', async () => {
  const files = nextStoreFiles();
  const snapshot = await agentPreviewSnapshot({ brief: { businessType:'Paper', audience:'Students', primaryAction:'Shop', visualDirection:'Blue' }, files: files.filter(file => ['config.js','commerce.js'].includes(file.path)) }, files.filter(file => nextSourceFile(file.path)));
  expect(snapshot.files.find(file=>file.path==='package.json')).toBeDefined();
  expect(snapshot.files.find(file=>file.path==='README.md')).toBeDefined();
  expect(snapshot.files.find(file=>file.path==='index.html')?.content).toContain('_compiled/');
  expect(snapshot.files.find(file=>file.path==='components/home.tsx')?.content).toBe(files.find(file=>file.path==='components/home.tsx')?.content);
});

it('reviews the current commerce baseline, including old catalog pages and privacy controls', async () => {
  const files = nextStoreFiles();
  const runtime = ['productos.html', 'commerce-pages.css'].map(path => ({ path, content: readFileSync(kitPath(path), 'utf8') }));
  const snapshot = await agentPreviewSnapshot({ brief: { businessType:'Shop', audience:'People', primaryAction:'Shop', visualDirection:'Simple' }, files: [...runtime, { path:'config.js', content:'window.PAGOSYA_CONFIG = {"slug":"test","data":{"items":[]}};' }, { path:'commerce.js', content:'/* old runtime */' }] }, files);
  const catalog = snapshot.files.find(file => file.path === 'productos.html')!.content;
  expect(catalog).toContain('class="commerce-catalog-title"');
  expect(catalog).not.toContain('<aside class="commerce-order"');
  expect(catalog).toContain('data-pagosya-cart hidden');
  expect(snapshot.files.find(file => file.path === 'commerce.js')!.content).toContain('Privacidad y cookies');
  expect(snapshot.files.find(file => file.path === 'commerce.js')!.content).toContain('Cuenta de cliente');
});
