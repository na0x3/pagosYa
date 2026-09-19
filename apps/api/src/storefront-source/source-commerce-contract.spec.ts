import { assertSourceCommerceContract } from './source-commerce-contract';
const source = () => ({ files: [
  { path: 'index.html', content: '<button data-cart-open>Pedido</button><section data-pagosya-catalog></section><script src="config.js"></script><script src="commerce.js"></script>' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' }, { path: 'commerce.js', content: '// replaced by platform runtime' },
] } as any);
it('requires the shared catalog and drawer and preserves platform runtime ownership', () => {
  expect(() => assertSourceCommerceContract(source())).not.toThrow();
  for (const removed of ['data-cart-open', 'data-pagosya-catalog', 'src="commerce.js"']) {
    const snapshot = source(); snapshot.files[0].content = snapshot.files[0].content.replace(removed, '');
    expect(() => assertSourceCommerceContract(snapshot)).toThrow();
  }
});
it('rejects hooks present only in comments and missing checkout destinations', () => {
  const snapshot = source(); snapshot.files[0].content = snapshot.files[0].content.replace('<button', '<!-- <button').replace('</button>', '</button> -->');
  expect(() => assertSourceCommerceContract(snapshot)).toThrow();
  const missing = source(); missing.files[1].content = 'window.PAGOSYA_CONFIG = {"checkoutPage":"missing.html"};';
  expect(() => assertSourceCommerceContract(missing)).toThrow('no existe');
});
it('accepts nested pages that resolve scripts to the shared root files', () => {
  const snapshot = source(); snapshot.files.push({ path:'pages/about.html', content:'<h1>Nosotros</h1><script src="../config.js"></script><script src="../commerce.js"></script>' });
  expect(() => assertSourceCommerceContract(snapshot)).not.toThrow();
  snapshot.files.at(-1).content = snapshot.files.at(-1).content.replace('../commerce.js', 'commerce.js');
  expect(() => assertSourceCommerceContract(snapshot)).toThrow();
});
