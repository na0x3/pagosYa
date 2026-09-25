import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { test, expect } = createRequire(new URL('../../../merchant-studio/package.json', import.meta.url))('@playwright/test');

// Finding 1: --checkout-dna-btn-* was declared on body.store-branded-checkout[data-dna-button=X], referencing
// var(--checkout-accent)/var(--checkout-foreground) — variables checkout-branding.ts only ever sets on #app. On body
// those var() calls were invalid, so every button form's pay button lost its fill and border (Chromium: background
// rgba(0,0,0,0), border 0px none). Reproduces the exact DOM/CSS wiring checkout-branding.ts builds, in a real browser,
// with computed-style assertions (the vitest suite only regex-checks the CSS source).
const css = readFileSync(fileURLToPath(new URL('../../src/checkout-branding.css', import.meta.url)), 'utf8');

const FORMS = ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'];

function page_html(form) {
  // Mirrors what checkout-branding.ts actually sets: the three colour vars (and the rest) live on #app's inline
  // style via app.style.setProperty, never on body — only --checkout-background also lands on body.
  return `<!doctype html><html><head><style>${css}</style></head>
    <body class="payment-page store-branded-checkout" data-dna-button="${form}" style="--checkout-background:#fffaf0">
      <div id="app" style="--checkout-background:#fffaf0;--checkout-surface:#f4efe6;--checkout-foreground:#1d1b18;--checkout-accent:#b4441f;--checkout-accent-foreground:#ffffff;--checkout-radius:8px">
        <button type="button" class="primary">Pagar</button>
      </div>
    </body></html>`;
}

for (const form of FORMS) {
  test(`the ${form} pay button keeps a real fill in a real browser`, async ({ page }) => {
    await page.setContent(page_html(form));
    const facts = await page.$eval('#app button.primary', el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle, boxShadow: style.boxShadow };
    });
    expect(facts.background).not.toBe('rgba(0, 0, 0, 0)');
  });
}

test('sticker keeps its offset ink shadow and border in a real browser', async ({ page }) => {
  await page.setContent(page_html('sticker'));
  const facts = await page.$eval('#app button.primary', el => { const style = getComputedStyle(el); return { borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle, boxShadow: style.boxShadow }; });
  expect(facts.borderWidth).toBe('2px');
  expect(facts.borderStyle).toBe('solid');
  expect(facts.boxShadow).not.toBe('none');
});

test('brutal keeps its thick ink border in a real browser', async ({ page }) => {
  await page.setContent(page_html('brutal'));
  const facts = await page.$eval('#app button.primary', el => { const style = getComputedStyle(el); return { borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle }; });
  expect(facts.borderWidth).toBe('3px');
  expect(facts.borderStyle).toBe('solid');
});
