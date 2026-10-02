/// <reference lib="dom" />
import { compileNextPreview } from './source-next';
import { nextStoreFiles, nextBrief } from './fixtures/next-store';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(60_000);

it('lays out standard pages without StoreTheme, preserving a custom Shell at desktop and phone sizes', async () => {
  const files = nextStoreFiles().map(file => file.path === 'styles/globals.css' ? { ...file, content: 'body{margin:0;font:16px Arial;background:#fff8df;color:#191919}:root{--store-accent:#f4d72d;--store-accent-foreground:#191919}header{padding:23px}h1,h2,p{font:inherit;margin:0}' } : file);
  files.push(
    { path: 'components/Shell.tsx', content: 'export default function Shell({children}: any) { return <><header>Custom header</header>{children}<footer>Custom footer</footer></>; }' },
    { path: 'components/auth/login.tsx', content: '// @pagosya-page\nimport Shell from "../Shell"; import {AccountGatePage} from "@pagosya/ui"; export default function Login(){return <Shell><AccountGatePage view="login" /></Shell>}' },
    { path: 'components/pages/cookies.tsx', content: '// @pagosya-page\nimport Shell from "../Shell"; import {InfoPage} from "@pagosya/ui"; export default function Cookies(){return <Shell><InfoPage kind="cookies" /></Shell>}' },
  );
  const compiled = await compileNextPreview(files);
  await withVisualSandbox({ schemaVersion: 1, brief: nextBrief, files: [...files, ...compiled] } as any, '', undefined, false, async context => {
    const page = await context.newPage();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['acceso-ingresar.html', 'cookies.html']) {
        await page.goto(`https://preview.invalid/${route}`);
        await page.locator('main h1').waitFor();
        const layout = await page.evaluate(() => {
          const main = document.querySelector('main')!;
          const heading = main.querySelector('h1')!;
          const button = main.querySelector('a');
          return { padding: parseFloat(getComputedStyle(main).paddingTop), inset: heading.getBoundingClientRect().left, heading: parseFloat(getComputedStyle(heading).fontSize), headerPadding: getComputedStyle(document.querySelector('header')!).paddingTop, overflow: document.documentElement.scrollWidth > innerWidth, button: button && { height: button.getBoundingClientRect().height, background: getComputedStyle(button).backgroundColor }, inputs: main.querySelectorAll('input,textarea,select,form').length };
        });
        expect(layout.padding).toBeGreaterThanOrEqual(32);
        expect(layout.inset).toBeGreaterThanOrEqual(16);
        expect(layout.heading).toBeGreaterThanOrEqual(28);
        expect(layout.headerPadding).toBe('23px');
        expect(layout.overflow).toBe(false);
        if (route.startsWith('acceso')) {
          expect(layout.button!.height).toBeGreaterThanOrEqual(44);
          expect(layout.button!.background).toBe('rgb(244, 215, 45)');
          expect(layout.inputs).toBe(0);
        }
      }
    }
  });
});
