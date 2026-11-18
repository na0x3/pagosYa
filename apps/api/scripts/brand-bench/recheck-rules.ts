/** Spec 2026-11-16 store quality, Part 2 acceptance: the page rules on saved designs, desktop and phone, through the 4330 viewer.
 *  npx ts-node --transpile-only scripts/brand-bench/recheck-rules.ts <url> … */
import { chromium } from 'playwright';
import { evaluateTemplateRules } from '../../src/storefront-source/source-template-qa-rules';

(async () => {
  const browser = await chromium.launch();
  for (const url of process.argv.slice(2)) for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
    const found = await page.evaluate(evaluateTemplateRules);
    console.log(url, width, [...new Set(found.map(f => f.rule))].sort().join(' '));
    await page.close();
  }
  await browser.close();
})();
