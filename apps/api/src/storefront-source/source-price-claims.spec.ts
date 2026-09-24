import { validateSourcePriceClaims } from './source-price-claims';

describe('authored price claims', () => {
  it('rejects the observed hardcoded story prices without rewriting names, photos or business numbers', () => {
    const files = [{ path: 'components/home.tsx', content: `export default function Home(){return <main><section id="manta"><h2>Manta tejida</h2><p className="chapter-price">Bs 2.000</p></section><section id="cojin"><h2>Cojín terracota</h2><p className="chapter-price">Bs 3.000</p></section></main>}` }];
    expect(() => validateSourcePriceClaims(files)).toThrow('2000 significa 20,00');
    expect(files[0].content).toContain('Bs 2.000');
    const fixed = files.map(file => ({ ...file, content: file.content.replace(/<p className="chapter-price">[^<]+<\/p>/g, '<a href="#catalogo">Ver precio y opciones</a>') }));
    expect(() => validateSourcePriceClaims(fixed)).not.toThrow();
  });

  it.each(['<p className="price">{product.amount}</p>', '<p id="precio">{`Bs ${product.amount}`}</p>', '<p className="chapter-price">{"USD 20.00"}</p>'])('rejects a static or raw minor-unit price slot: %s', jsx => {
    expect(() => validateSourcePriceClaims([{ path: 'components/home.tsx', content: `export default function Home(){return ${jsx}}` }])).toThrow('Precios estáticos');
  });

  it('allows authoritative runtime slots, formatted expressions and unrelated business numbers', () => {
    expect(() => validateSourcePriceClaims([{ path: 'components/home.tsx', content: `export default function Home(){return <main><p>Calle 2000. Desde 2020. Mide 120 cm.</p><p className="price-label">Opciones de precio</p><span data-product-field="price">Bs 0</span><p className="price">{formatMoney(product.amount, product.currency)}</p></main>}` }])).not.toThrow();
  });

  it('enforces the same explicit price-slot rule for static HTML', () => {
    expect(() => validateSourcePriceClaims([{ path: 'index.html', content: '<section><p class="chapter-price">Bs 2.000</p></section>' }])).toThrow('index.html');
    expect(() => validateSourcePriceClaims([{ path: 'index.html', content: '<template><span class="price" data-product-field="price"></span></template><p>Calle 2000</p>' }])).not.toThrow();
  });
});
