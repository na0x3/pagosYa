import type { SourceProjectSnapshot } from './source-project';
import { withVisualSandbox } from './source-visual-capture';
import { sourceVisualState } from './source-visual-state';
import { evaluateTemplateRules } from './source-template-qa-rules';

/** Owner 2026-11-02 («check and log»): a new template home, rendered in the preview sandbox at a desktop and a phone width, through
 *  the template rules. Read the way the live checks read it: every part scrolled into view once (lazy photos, entrances), then the
 *  rules from the top of the page. Only the blocking lines are returned; nothing here changes the store. */
export async function templateQaFindings(prepared: SourceProjectSnapshot, signal?: AbortSignal): Promise<Array<{ width: number; blocking: string[] }>> {
  const out: Array<{ width: number; blocking: string[] }> = [];
  for (const width of [1280, 390] as const) {
    const blocking = await withVisualSandbox(prepared, sourceVisualState(prepared, 'index.html', undefined, true).query, signal, false, async context => {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 400) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
      const lines = await page.evaluate(evaluateTemplateRules);
      return lines.filter(line => line.startsWith('BLOQUEA:')).map(line => line.slice(9).trim());
    }, 'no-preference');
    out.push({ width, blocking });
  }
  return out;
}
