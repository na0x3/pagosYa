import { productMediaProblem, withProductMedia } from './source-agent-product-media';
import { applySourceVisualEdit, sourceVisualFields } from './source-visual-edit';

const photo = (n: number) => `/v1/uploads/0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
const video = (n: number) => `/v1/uploads/0000000${n}-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4`;

describe('product photos and videos (owner 2026-11-17)', () => {
  it('keeps every photo before every video, so the cover is always a photo, and moves the crop positions with them', () => {
    const next = withProductMedia([video(1), photo(1)], ['10% 10%', '20% 20%'], [photo(2), video(2)]);
    expect(next.imageUrls).toEqual([photo(1), photo(2), video(1), video(2)]);
    expect(next.imagePositions).toEqual(['20% 20%', '50% 50%', '10% 10%', '50% 50%']);
    expect(withProductMedia([photo(1)], [], [photo(1)]).imageUrls).toEqual([photo(1)]);
  });

  it('refuses a non-upload, a repeat and an eleventh item', () => {
    expect(productMediaProblem('https://evil.example/x.mp4', [], [])).toMatch(/subió a pagosYa/);
    expect(productMediaProblem(photo(1), [photo(1)], [])).toMatch(/ya tiene esa foto/);
    expect(productMediaProblem(video(3), Array.from({ length: 9 }, (_, n) => photo(n)), [photo(9)])).toMatch(/máximo/);
    expect(productMediaProblem(video(3), [photo(1)], [])).toBeNull();
  });
});

describe('the Studio photo picker writes the field\'s own path style (owner 2026-11-17)', () => {
  const files = () => [
    { path: 'components/home.tsx', content: 'export default function Home() { return <main><img src="assets/a.webp" alt="A" /></main>; }' },
    { path: 'assets/a.webp', content: 'AA==', encoding: 'base64' as const },
    { path: 'assets/b.webp', content: 'AA==', encoding: 'base64' as const },
  ];
  it('swaps a V2 photo to another saved photo given with or without the leading slash, keeping assets/…', () => {
    const field = sourceVisualFields(files()).find(item => item.kind === 'image' && item.value === 'assets/a.webp')!;
    for (const value of ['assets/b.webp', '/assets/b.webp']) {
      const home = applySourceVisualEdit(files(), field.id, value).files.find(file => file.path === 'components/home.tsx')!.content;
      expect(home).toContain('src="assets/b.webp"');
    }
    expect(() => applySourceVisualEdit(files(), field.id, 'assets/missing.webp')).toThrow(/imagen existente/);
  });

  it('finds photos a written store keeps in its own data ({ img: \'assets/…\' }) and swaps them', () => {
    const data = [{ path: 'components/home.tsx', content: "const RECIPES = [{ name: 'Aliño', img: 'assets/a.webp' }];\nexport default function Home() { return <main>{RECIPES.map(r => <img key={r.name} src={r.img} alt='' />)}</main>; }" }, ...files().slice(1)];
    const field = sourceVisualFields(data).find(item => item.kind === 'image' && item.value === 'assets/a.webp')!;
    expect(field.label).toBe('Foto · img');
    expect(applySourceVisualEdit(data, field.id, '/assets/b.webp').files[0].content).toContain("img: \"assets/b.webp\"");
  });
});
