import type { SourceProjectSnapshot } from './source-project';
import { withVisualSandbox } from './source-visual-capture';
import { sourceVisualState } from './source-visual-state';
import { evaluateTemplateRules, type TemplateRuleFinding } from './source-template-qa-rules';
import { agentShotSections } from './agent/agent-capture';

export type TemplateQaWidth = { width: 1280 | 390; blocking: string[]; findings: TemplateRuleFinding[]; images?: string[] };

/** Owner 2026-11-02 («check and log»): a new template home, rendered in the preview sandbox at a desktop and a phone width, through
 *  the template rules. Read the way the live checks read it: every part scrolled into view once (lazy photos, entrances), then the
 *  rules from the top of the page. `blocking` keeps the log's lines; `findings` carry each rule's id and section (spec 2026-11-13
 *  fill review), and with `shots` the same render is photographed whole, in slices. Nothing here changes the store. */
export async function templateQaFindings(prepared: SourceProjectSnapshot, signal?: AbortSignal, options: { shots?: boolean } = {}): Promise<TemplateQaWidth[]> {
  const out: TemplateQaWidth[] = [];
  for (const width of [1280, 390] as const) {
    const read = await withVisualSandbox(prepared, sourceVisualState(prepared, 'index.html', undefined, true).query, signal, false, async context => {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 400) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
      const findings = await page.evaluate(evaluateTemplateRules);
      const png = options.shots ? await page.screenshot({ type: 'png', fullPage: true, timeout: 12_000 }).catch(() => null) : null;
      return { findings, images: png ? await agentShotSections(png) : undefined };
    }, 'no-preference');
    const blocking = read.findings.filter(finding => finding.severity === 'block').map(finding => finding.line.slice(9).trim());
    out.push({ width, blocking, findings: read.findings, ...(read.images ? { images: read.images } : {}) });
  }
  return out;
}
