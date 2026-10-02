import sharp from 'sharp';
import { compileNextPreview } from './source-next';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(120_000);
it('the default hero preserves a portrait at native or smaller scale and shows shopping first on mobile', async () => {
  const files: any[] = [
    { path: 'components/home.tsx', content: `import { StoreTheme, Hero, Button, CommerceSlots, CartButton } from '@pagosya/ui'; export default function Home(){return <StoreTheme tokens={{paper:'#f5f0eb',ink:'#26211f',accent:'#26211f',displayFont:'sans-serif',bodyFont:'sans-serif',subheadStyle:'normal'}}><main><Hero title="Tu selección Rhode" lead="Labios, rubor y tus esenciales." image={{src:'assets/portrait.png',alt:'Campaña'}} actions={<Button href="#catalog">Comprar productos</Button>}/><section id="catalog" data-pagosya-catalog></section></main><CommerceSlots/><CartButton/></StoreTheme>}` },
    { path: 'components/product.tsx', content: `import { ProductDetail, CommerceSlots, CartButton } from '@pagosya/ui'; export default function Product(){return <><ProductDetail/><CommerceSlots/><CartButton/></>}` },
    { path: 'components/checkout.tsx', content: `import { CheckoutDetail } from '@pagosya/ui'; export default function Checkout(){return <><CheckoutDetail/><p data-pagosya-status/></>}` },
    { path: 'styles/globals.css', content: 'body{margin:0}' },
    { path: 'assets/portrait.png', encoding: 'base64', content: (await sharp({create:{width:736,height:1104,channels:3,background:'#dba8ab'}}).png().toBuffer()).toString('base64') },
  ];
  const snapshot: any = { brief: {}, files: [...await compileNextPreview(files.filter(file => file.encoding !== 'base64')), ...files.filter(file => file.encoding === 'base64')] };
  await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    for (const width of [1280, 390]) {
      await page.setViewportSize({width,height:844});
      await page.goto('https://preview.invalid/index.html');
      await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
      const result = await page.evaluate(() => {
        const img = document.querySelector('img')!;
        const r = img.getBoundingClientRect(), a = document.querySelector('a')!.getBoundingClientRect();
        return { variant: document.querySelector('.ui-hero')?.getAttribute('data-variant'), ratio: r.width/r.height, scale: r.width/img.naturalWidth, actionBottom: a.bottom, imageTop: r.top, overflow: document.documentElement.scrollWidth>innerWidth };
      });
      expect(result.variant).toBe('contained');
      expect(result.ratio).toBeCloseTo(736/1104, 2);
      expect(result.scale).toBeLessThanOrEqual(1);
      expect(result.actionBottom).toBeLessThan(844);
      expect(result.overflow).toBe(false);
      if(width === 390) expect(result.imageTop).toBeGreaterThan(result.actionBottom);
    }
  });
});
