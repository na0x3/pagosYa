import sharp from 'sharp';
import type { SourceProjectBriefDto, SourceProjectFileDto } from '../dto/save-source-project.dto';
import { nextSourceFile } from '../source-next';
import { SourceProjectsService } from '../source-projects.service';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';

export type AgentPreviewBase = { brief: SourceProjectBriefDto; files: SourceProjectFileDto[] };
export type AgentShot = { width: 1280 | 820 | 390; image: string; thumbnail: string; errors: string[] };

/** The draft as a site the sandbox can open: the store's runtime files with this draft's pages, compiled by prepare(). */
export async function agentPreviewSnapshot(base: AgentPreviewBase, authored: SourceProjectFileDto[]) {
  const runtime = base.files.filter(f => !nextSourceFile(f.path) && !f.path.startsWith('_compiled/'));
  return new SourceProjectsService({} as any).prepare({ revision: 0, label: 'Borrador de YAPI', brief: base.brief, files: [...runtime, ...authored] } as any);
}

export async function captureAgentDraft(snapshot: Awaited<ReturnType<typeof agentPreviewSnapshot>>, width: 1280 | 820 | 390, signal?: AbortSignal): Promise<AgentShot> {
  const errors: string[] = [];
  // The sandbox serves only query-less URLs; the preview query reaches the page through its init script.
  const png = await withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html').query, signal, false, async context => {
    const page = await context.newPage();
    page.on('pageerror', error => { if (errors.length < 5) errors.push(error.message.slice(0, 300)); });
    page.on('dialog', dialog => { void dialog.dismiss(); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const shot = await page.screenshot({ type: 'png', fullPage: true, timeout: 12_000 });
    await page.close();
    return shot;
  });
  const image = await sharp(png).resize({ width: Math.min(width, 1024), height: 2400, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
  const thumbnail = await sharp(png).resize({ width: 320, height: 640, fit: 'cover', position: 'top' }).jpeg({ quality: 65 }).toBuffer();
  return { width, errors, image: `data:image/jpeg;base64,${image.toString('base64')}`, thumbnail: `data:image/jpeg;base64,${thumbnail.toString('base64')}` };
}
