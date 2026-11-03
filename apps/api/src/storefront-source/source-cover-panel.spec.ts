import { listTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(180_000);

async function cover(width: number) {
  const manifest = listTemplates().find(entry => entry.id === 'crocante')!;
  const resolved = resolvePresetTemplate(manifest, templateManifest);
  const assembled = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
  const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 844 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    return page.evaluate(() => {
      const section = document.querySelector('.lb-cover-full[data-lb-look="right"]')!, copy = section.querySelector('.lb-cover-full__copy') as HTMLElement;
      const photo = section.querySelector('.lb-cover-full__photo')!.getBoundingClientRect(), card = copy.getBoundingClientRect();
      const third = { left: photo.left + photo.width / 3, right: photo.right - photo.width / 3, top: photo.top, bottom: photo.bottom };
      const overCentre = card.left < third.right && card.right > third.left && card.top < third.bottom && card.bottom > third.top;
      const aligns = Array.from(copy.querySelectorAll('h1,h2,p,.lb-actions')).map(el => getComputedStyle(el).textAlign);
      const bg = getComputedStyle(copy).backgroundColor;
      return { overCentre, aligns: Array.from(new Set(aligns)), solid: bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', below: card.top >= photo.bottom - 40 };
    });
  });
}

describe('cover-full right: words in a solid card (spec 2026-11-03 §3)', () => {
  it('on a laptop the card is solid, left-aligned and clear of the photo centre', async () => {
    const seen = await cover(1280);
    expect(seen.solid).toBe(true);
    expect(seen.aligns).toEqual(['left']);
    expect(seen.overCentre).toBe(false);
  });
  it('on a phone the card sits under the photo (Review Focus 5)', async () => {
    const seen = await cover(390);
    expect(seen.below).toBe(true);
    expect(seen.aligns).toEqual(['left']);
  });
});
