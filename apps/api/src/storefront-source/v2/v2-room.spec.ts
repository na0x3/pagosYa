import { makeRoom } from './v2-room';

/** Live 2026-11-18 (Fishwife copy): the import design fills its photo room on purpose; the V2 copy's cut-outs, art and pages then
 *  passed the 8 MiB limit. Before writing, V2 turns the biggest catalogue-only photos back into links to their uploads. */
describe('making room in a copied store', () => {
  const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64');
  const files = () => [
    { path: 'assets/image-aaaaaaaaaaaa.jpg', content: b64(3_000_000), encoding: 'base64' as const },
    { path: 'assets/image-bbbbbbbbbbbb.png', content: b64(2_000_000), encoding: 'base64' as const },
    { path: 'assets/image-cccccccccccc.webp', content: b64(1_000_000), encoding: 'base64' as const },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG={"items":[{"imageUrls":["assets/image-aaaaaaaaaaaa.jpg","assets/image-bbbbbbbbbbbb.png"]},{"imageUrls":["assets/image-cccccccccccc.webp"]}]}' },
    { path: 'visual-assets.json', content: '["assets/image-aaaaaaaaaaaa.jpg"]' },
    { path: 'components/pages/home.tsx', content: 'export default () => <img src="assets/image-cccccccccccc.webp" />' },
  ];
  const uploads = new Map([['aaaaaaaaaaaa', '/v1/uploads/a1.jpg'], ['bbbbbbbbbbbb', '/v1/uploads/b2.png'], ['cccccccccccc', '/v1/uploads/c3.webp']]);

  it('links the biggest catalogue-only photos until the store fits, keeping photos the pages draw', () => {
    const out = makeRoom(files(), uploads, 'https://api.test', 2_500_000);
    expect(out.moved).toEqual(['assets/image-aaaaaaaaaaaa.jpg', 'assets/image-bbbbbbbbbbbb.png']);
    const paths = out.files.map(file => file.path);
    expect(paths).not.toContain('assets/image-aaaaaaaaaaaa.jpg');
    expect(paths).toContain('assets/image-cccccccccccc.webp');
    const config = out.files.find(file => file.path === 'config.js')!.content;
    expect(config).toContain('https://api.test/v1/uploads/a1.jpg');
    expect(config).toContain('assets/image-cccccccccccc.webp');
    expect(out.files.find(file => file.path === 'visual-assets.json')!.content).toContain('https://api.test/v1/uploads/a1.jpg');
  });

  it('changes nothing when the store already fits, or a photo has no upload to point at', () => {
    expect(makeRoom(files(), uploads, 'https://api.test', 50_000_000).moved).toEqual([]);
    expect(makeRoom(files(), new Map(), 'https://api.test', 1).moved).toEqual([]);
  });
});
