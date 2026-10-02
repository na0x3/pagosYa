import { expect, test } from '@playwright/test';

const source = `import Shell from './Shell';\n\n// El diseño de tu tienda\nexport default function Home() {\n  const title = 'Taller Alba';\n  return <Shell><h1>{title}</h1></Shell>;\n}\n`;
const files = [
  { path: 'storefront-framework.json', content: '{}' },
  { path: 'components/home.tsx', content: source },
  { path: 'components/Shell.tsx', content: 'export default function Shell({children}) { return <main>{children}</main>; }' },
  { path: 'components/pages/about.tsx', content: '// @pagosya-page\nexport default function About() { return <h1>Nosotros</h1>; }' },
  { path: 'styles/globals.css', content: 'body { color: #234; }' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' },
  { path: 'index.html', content: '<html><body><h1>Taller Alba</h1></body></html>' },
  { path: 'nosotros.html', content: '<html><body><h1>Nosotros</h1></body></html>' },
  ...['contacto', 'envios', 'faq', 'privacidad', 'terminos', 'cookies', 'reembolsos', 'buscar', 'colecciones', 'acceso-ingresar', 'acceso-registro', 'cuenta-pedidos', 'cuenta-perfil'].map(name => ({ path: `${name}.html`, content: `<html><body><h1>${name}</h1></body></html>` })),
];

for (const width of [1440, 390]) test(`page navigation and highlighted editing at ${width}px`, async ({ page }) => {
  const errors: string[] = [];
  let releaseEstimate!: () => void;
  const estimateReady = new Promise<void>(resolve => { releaseEstimate = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  const version = { revision: 1, label: 'Taller Alba', snapshot: { schemaVersion: 1, brief: {}, files } };
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => { if (window === window.top) sessionStorage.setItem('pagosya_merchant_session', 'test-session'); });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/estimate')) await estimateReady;
    await route.fulfill({ json: path.endsWith('/stores') ? [{ id: 's1', name: 'Taller Alba', slug: 'alba' }]
      : path.endsWith('/conversation') ? { messages: [] }
      : path.endsWith('/estimate') ? { billingMode: 'chatgpt-plan', model: 'gpt-5.6-sol', estimate: { minCredits: 1, maxCredits: 3 } }
      : path.endsWith('/catalog') ? { items: [], categories: [] }
      : path.endsWith('/versions/1') ? version
      : path.endsWith('/source-project') ? { revision: 1, versions: [version], nextBefore: null }
      : {} });
  });
  await page.goto('/?source=1');
  const picker = page.locator('.source-page-menu>summary');
  await picker.click();
  // A background estimate rerenders Studio while the merchant has the menu open.
  releaseEstimate();
  await expect(page.locator('.source-credit-details>summary')).toHaveText('Plan de ChatGPT');
  await expect(page.getByRole('navigation', { name: 'Página de la vista previa' })).toBeVisible();
  await page.screenshot({ path: `/tmp/pagosya-pages-${width}.png` });
  await page.getByRole('button', { name: 'Nosotros', exact: true }).click();
  await expect(page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading', { name: 'Nosotros' })).toBeVisible();
  await picker.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.source-page-menu')).not.toHaveAttribute('open');
  await picker.click();
  await page.getByRole('button', { name: 'Administrar páginas' }).click();
  await expect(page.getByRole('dialog')).toContainText('Una base para cada página.');
  await page.getByLabel('Nombre de la página').fill('Servicios');
  await page.getByLabel('¿Qué quieres mostrar?').fill('Una presentación de nuestros servicios');
  await page.getByRole('button', { name: 'Preparar pedido a YAPI' }).click();
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toHaveValue(/página independiente llamada "Servicios"/);
  await expect(page.locator('.source-credit-details>summary')).toHaveText('Plan de ChatGPT');
  await page.locator('.source-credit-details>summary').click();
  await expect(page.locator('[data-source-estimate]')).toContainText('sin créditos API');
  await expect(page.locator('#source-credit-limit')).not.toBeVisible();
  await page.locator('.source-credit-details>summary').click();
  await picker.click();
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.locator('#source-code-tab').click();
  const editor = page.getByRole('textbox', { name: 'Código del archivo' });
  await expect(editor).toHaveValue(source);
  await expect(page.locator('[data-code-highlight] .hljs-keyword').first()).toBeVisible();
  await page.screenshot({ path: `/tmp/pagosya-code-${width}.png` });
  const changed = source + Array.from({ length: 80 }, (_, i) => `// línea ${i}`).join('\n') + '\nconst unsafe = "<img src=x onerror=alert(1)>";';
  await editor.fill(changed);
  await expect(editor).toHaveValue(changed);
  await expect(page.locator('[data-code-highlight] img')).toHaveCount(0);
  await expect(page.locator('[data-code-highlight]')).toHaveText(changed + '\n');
  await expect(page.locator('#source-save')).toBeEnabled();
  await editor.evaluate(element => { element.scrollTop = 400; element.dispatchEvent(new Event('scroll')); });
  await expect(page.locator('[data-code-highlight]')).toHaveCSS('transform', /-400/);
  await page.locator('#source-discard').click();
  await expect(editor).toHaveValue(source);
  if (width > 720) await page.locator('[data-code-file="config.js"]').click();
  else await page.locator('#source-file').selectOption('config.js');
  await expect(editor).toHaveAttribute('readonly');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
