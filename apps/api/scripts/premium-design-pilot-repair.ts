/** Bounded repair of measured browser findings; preserves untouched pilot runs. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { SourceGenerationService } from '../src/stores/source-generation.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import type { SourceImageUse } from '../src/stores/source-setup';
async function main() {
  const root = resolve(__dirname, '../../..'), folder = resolve(root, 'examples/savia/pilot');
  const results = JSON.parse(await readFile(resolve(folder, 'results.json'), 'utf8'));
  const audit = JSON.parse(await readFile(resolve(folder, 'audit.json'), 'utf8'));
  const repairs: any[] = await readFile(resolve(folder, 'repairs.json'), 'utf8').then(JSON.parse).catch(() => []);
  const failures = audit.filter((r: any) => r.scrollWidth > r.width + 1 || r.expected.standaloneIntro === false && r.catalog?.y > 320 || r.expected.productsInOpening && !r.products.some((p: any) => p.buy?.bottom <= r.height && p.price?.bottom <= r.height));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const settings = app.get(ConfigService); settings.set('app.sourceFramework', 'static'); settings.set('app.port', 3001); settings.set('app.checkoutOrigin', 'http://localhost:5175');
    const prisma = app.get(PrismaService), projects = app.get(SourceProjectsService), uploads = app.get(UploadsService), generator = app.get(SourceGenerationService);
    for (const id of [...new Set(failures.map((r: any) => r.id))]) {
      if (repairs.filter(r => r.id === id).length >= 2) continue;
      const run = results.find((r: any) => r.id === id); if (!run || run.status !== 'completed') continue;
      const current = await projects.current(run.merchantId, run.storeId);
      const previous = await projects.version(run.merchantId, run.storeId, current.revision);
      const snapshot = previous.snapshot as any;
      const evidence = audit.filter((r: any) => r.id === id);
      const uses: SourceImageUse[] = [];
      for (const row of evidence) {
        const asset = await uploads.saveBuffer(await readFile(row.screenshot), 'image/jpeg');
        await prisma.mediaAsset.create({ data: { merchantId: run.merchantId, storeId: run.storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
        uses.push({ url: asset.url, role: 'reference', description: `Actual ${row.width}x${row.height} browser capture of THIS current homepage. Repair the observed defect; never embed this screenshot.` });
      }
      const products = await prisma.paymentLink.findMany({ where: { storeId: run.storeId } });
      const photoUrls: string[] = [...new Set(products.flatMap(p => [...p.imageUrls, ...(p.variants as any[]).map(v => v.imageUrl).filter(Boolean)]))] as string[];
      const instruction = `Corrige exclusivamente los problemas observados de la apertura de Inicio, conservando su identidad, contenido factual, fotografía, estructura elegida y funcionamiento de compra. NO rediseñes toda la tienda. Datos medidos en el navegador, con fuentes e imágenes cargadas: ${JSON.stringify(evidence.map((r: any) => ({ viewport: r.viewport, width: r.width, height: r.height, catalogY: r.catalog?.y, firstProduct: r.products[0], scrollWidth: r.scrollWidth, promise: r.expected })))}. La composición seleccionada prometió catálogo antes de 320px y producto, precio y compra antes de 844px en escritorio y móvil. Haz que cumpla esa promesa con ajustes concretos y moderados de las columnas, altura de fotografía y espaciado. En las capturas busca columnas de texto demasiado estrechas, letras apiladas y espacio vacío excesivo; usa minmax(0,1fr) y una composición móvil legible. No escondas productos, precios, descripciones significativas ni controles para aprobar. No cambies los flags del plan. Elimina expresiones de implementación como “opciones reales” de la interfaz; usa lenguaje natural de compra. Revisa los estilos exactos y repara la causa, no la tapes con overflow hidden.`;
      let result: any = { id, fromRevision: current.revision, screenshots: evidence.map((r: any) => r.screenshot), instruction, status: 'failed' };
      console.log(`Repairing ${id}`);
      try {
        const generated = await generator.generate(run.merchantId, run.storeId, { revision: current.revision, model: 'gpt-5.6-sol', maxCredits: 100, motion: 'subtle', brief: snapshot.brief, instruction, assetUrls: [...uses.map(u => u.url), ...photoUrls] }, undefined, [...uses, ...photoUrls.map(url => ({ url, role: 'product' as const, description: 'Existing catalog product photography; retain its identity.' }))], async phase => { console.log(`${id}: ${phase}`); });
        const version = await projects.version(run.merchantId, run.storeId, generated.revision);
        for (const file of (version.snapshot as any).files) {
          const path = resolve(folder, String(id), file.path); await mkdir(dirname(path), { recursive: true });
          let content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
          if (file.path === 'config.js') { const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]); config.demo = true; content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify(config) + ';\n'; }
          await writeFile(path, content);
        }
        result = { ...result, status: 'completed', revision: generated.revision, generation: generated.generation };
      } catch (error) { result.error = error instanceof Error ? error.message : 'Repair failed'; }
      repairs.push(result); await writeFile(resolve(folder, 'repairs.json'), JSON.stringify(repairs, null, 2)); console.log(JSON.stringify({ id, status: result.status, error: result.error, credits: result.generation?.credits }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Pilot repair failed'); process.exitCode = 1; });
