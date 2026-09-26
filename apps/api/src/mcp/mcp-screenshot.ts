import { BadRequestException } from '@nestjs/common';
import type { SourceProjectSnapshot } from '../storefront-source/source-project';
import { withVisualSandbox } from '../storefront-source/source-visual-capture';

/** The top of one page of a saved design, rendered in the same offline sandbox as the publication checks. */
export async function screenshotSnapshot(snapshot: SourceProjectSnapshot, width: 1280 | 390, page: string): Promise<Buffer> {
  if (!/\.html$/.test(page) || !snapshot.files.some(file => file.path === page && file.encoding !== 'base64')) throw new BadRequestException('Esa página no existe en el diseño.');
  const height = width === 390 ? 844 : 900;
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width, height });
    await tab.goto(`https://preview.invalid/${page}`, { waitUntil: 'load' });
    await tab.evaluate(async () => { await document.fonts.ready; });
    await tab.waitForTimeout(300);
    return tab.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height }, animations: 'disabled' });
  });
}
