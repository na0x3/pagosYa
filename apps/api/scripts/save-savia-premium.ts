/** Persist the authorized Savia redesign and real photo-to-variant mappings. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { buildSourceVisualSystem, withSourceStyleTokens } from '../src/stores/source-visual-system';
import { sourceAssetInventory } from '../src/stores/source-asset-library';
import type { SourceProjectFileDto } from '../src/stores/dto/save-source-project.dto';

async function main() {
  const folder = resolve(__dirname, '../../../examples/savia');
  const record = JSON.parse(await readFile(resolve(folder, 'demo.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService), uploads = app.get(UploadsService), projects = app.get(SourceProjectsService);
    // Never apply this script to another merchant or storefront.
    const store = await prisma.store.findFirstOrThrow({ where: { id: record.storeId, merchantId: record.merchantId, slug: 'xlixm44n' } });
    record.premiumAssets ||= {};
    const names = ['bottle-salvia', 'bottle-coral', 'bottle-marfil', 'juice-studio', 'juice-ritual', 'granola-studio', 'granola-ritual', 'granola-cacao'];
    for (const name of names) {
      if (record.premiumAssets[name]) continue;
      const asset = await uploads.saveBuffer(await readFile(resolve(folder, `site/assets/${name}.jpg`)), 'image/jpeg');
      await prisma.mediaAsset.create({ data: { merchantId: record.merchantId, storeId: store.id, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      record.premiumAssets[name] = asset.url;
      await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    }
    const configText = await readFile(resolve(folder, 'site/config.js'), 'utf8');
    const config = JSON.parse(configText.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
    config.apiBaseUrl = 'http://localhost:3001/v1'; config.checkoutOrigin = 'http://localhost:5175';
    for (const item of config.data.items) {
      const existing = await prisma.paymentLink.findFirstOrThrow({ where: { id: item.id, storeId: store.id } });
      const kind = item.name.startsWith('Jugo') ? 'juice' : item.name.startsWith('Granola') ? 'granola' : null;
      const imageUrls = kind ? [...new Set([...existing.imageUrls, record.premiumAssets[kind + '-studio'], record.premiumAssets[kind + '-ritual']])] as string[] : existing.imageUrls;
      const variants = (existing.variants as any[]).map(v => {
        const color = v.options?.find((o: any) => o.name === 'Color')?.value?.toLowerCase();
        const presentation = v.options?.find((o: any) => o.name === 'Presentación')?.value;
        const flavor = v.options?.find((o: any) => o.name === 'Sabor')?.value;
        const imageUrl = color ? record.premiumAssets['bottle-' + color] : presentation ? presentation === 'Individual' ? record.premiumAssets['juice-studio'] : record.assets['juice.jpg'] : flavor ? record.premiumAssets[flavor === 'Cacao' ? 'granola-cacao' : 'granola-studio'] : undefined;
        return imageUrl ? { ...v, imageUrl } : v;
      });
      await prisma.paymentLink.update({ where: { id: item.id }, data: { imageUrls, variants } });
    }
    const current = await projects.current(record.merchantId, record.storeId);
    const previous = await projects.version(record.merchantId, record.storeId, current.revision);
    const snapshot = previous.snapshot as any;
    const files: SourceProjectFileDto[] = snapshot.files.map((f: any) => ({ ...f }));
    function replace(file: SourceProjectFileDto) {
      const index = files.findIndex(f => f.path === file.path);
      if (index < 0) files.push(file); else files[index] = file;
    }
    for (const path of ['index.html', 'product.html', 'checkout.html', 'styles.css', 'site.js', 'commerce.js', 'commerce-pages.css']) replace({ path, content: await readFile(resolve(folder, 'site', path), 'utf8') });
    replace({ path: 'config.js', content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...config, demo: false }) + ';\n' });
    for (const name of names) replace({ path: `assets/${name}.jpg`, encoding: 'base64', content: (await readFile(resolve(folder, `site/assets/${name}.jpg`))).toString('base64') });
    const assetManifest = files.find(f => f.path === 'visual-assets.json');
    if (assetManifest) {
      const data = JSON.parse(assetManifest.content);
      data.assets ||= [];
      for (const name of names) if (!data.assets.some((a: any) => a.path === `assets/${name}.jpg`)) data.assets.push({ path: `assets/${name}.jpg`, role: 'product', description: `Savia ${name}: approved coordinated product photography.` });
      replace({ ...assetManifest, content: JSON.stringify(data, null, 2) });
    }
    const direction = JSON.parse(files.find(f => f.path === 'design-direction.json')!.content);
    direction.concepts[direction.selected] = { ...direction.concepts[direction.selected], name: 'Savia · Rituales cotidianos', premise: 'Warm photographic color, a continuous quiet surface and clear product choices. Selected after actual desktop/mobile A/B review with Claude.', typography: 'Bricolage: moderate 500-weight headings, readable body and compact labeled controls.', imagery: 'Coordinated warm limestone studio and ritual photography; original product-specific galleries and mapped bottle colors.', mobile: 'Full-width gallery with horizontal thumbnails, then title, price and choices. Keep 20px margins, visible cart, and 44px controls.' };
    direction.selection = { source: 'forced', rationale: 'Candidate A selected by Codex after independent Claude critique of actual desktop and mobile screenshots.' };
    replace({ path: 'design-direction.json', content: JSON.stringify(direction, null, 2) });
    replace({ path: 'visual-system.json', content: JSON.stringify(withSourceStyleTokens(buildSourceVisualSystem('subtle', sourceAssetInventory(files), direction), files), null, 2) });
    const result = await projects.save(record.merchantId, record.storeId, { revision: current.revision, label: 'Savia: diseño premium, galerías y opciones coherentes', brief: snapshot.brief, files });
    record.revision = result.revision;
    record.premiumDesign = { direction: 'A', reviewedBy: ['Codex', 'Claude'], assets: names.length, savedAt: new Date().toISOString() };
    await writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ revision: record.revision, storeId: store.id, uploadedAssets: names.length, files: files.length }));
  } finally { await app.close(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Savia save failed'); process.exitCode = 1; });
