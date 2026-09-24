import { sourceVisualState } from './source-visual-state';
const snapshot: any = { files: [{ path: 'product.html', content: '<main data-pagosya-product-page></main>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"productPage":"product.html","data":{"items":[{"id":"juice"},{"id":"bottle"}]}};' }] };
it('captures a real product by default and preserves an explicitly selected product', () => {
  expect(sourceVisualState(snapshot, 'product.html')).toEqual({ productId: 'juice', query: '?id=juice' });
  expect(sourceVisualState(snapshot, 'product.html', 'bottle').productId).toBe('bottle');
  expect(sourceVisualState(snapshot, 'index.html')).toEqual({ query: '' });
});
it('refuses empty or missing products before starting a paid visual review', () => {
  expect(() => sourceVisualState(snapshot, 'product.html', 'missing')).toThrow('producto real');
  expect(() => sourceVisualState({ ...snapshot, files: snapshot.files.slice(0, 1) }, 'product.html')).toThrow('producto real');
});
