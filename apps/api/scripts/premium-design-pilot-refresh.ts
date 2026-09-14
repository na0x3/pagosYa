/** Refresh platform files and portable variant assets without editing pilot design. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
async function main() {
  const folder = resolve(__dirname, '../../../examples/savia/pilot');
  const runs = JSON.parse(await readFile(resolve(folder, 'results.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService), projects = app.get(SourceProjectsService), uploads = app.get(UploadsService);
    const receipts = [];
    for (const run of runs.filter((r: any) => r.status === 'completed')) {
      await prisma.store.findFirstOrThrow({ where: { id: run.storeId, merchantId: run.merchantId, slug: run.slug } });
      const current = await projects.current(run.merchantId, run.storeId);
      const version = await projects.version(run.merchantId, run.storeId, current.revision);
      const snapshot = version.snapshot as any, files = snapshot.files.map((f: any) => ({ ...f }));
      const file = files.find((f: any) => f.path === 'config.js');
      const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]);
      config.apiBaseUrl = 'http://localhost:3001/v1'; config.checkoutOrigin = 'http://localhost:5175'; config.demo = false;
      let images = 0;
      for (const item of config.data.items) for (const variant of item.variants || []) {
        if (!variant.imageUrl || variant.imageUrl.startsWith('assets/')) continue;
        const url = new URL(variant.imageUrl, config.apiBaseUrl);
        const owned = await prisma.mediaAsset.findFirstOrThrow({ where: { merchantId: run.merchantId, url: url.pathname } });
        const bytes = await uploads.getBuffer(owned.storageKey); if (!bytes) throw new Error('Missing owned variant asset');
        const path = 'assets/image-' + createHash('sha256').update(bytes).digest('hex').slice(0, 12) + '.jpg';
        if (!files.some((f: any) => f.path === path)) files.push({ path, content: bytes.toString('base64'), encoding: 'base64' });
        variant.imageUrl = path; images++;
      }
      file.content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify(config) + ';\n';
      for (const name of ['commerce.js', 'commerce-pages.css']) {
        const entry = files.find((f: any) => f.path === name);
        entry.content = await readFile(resolve(__dirname, '../src/stores/source-kit', name), 'utf8');
      }
      const saved = await projects.save(run.merchantId, run.storeId, { revision: current.revision, label: 'Platform asset portability and current commerce runtime', brief: snapshot.brief, files });
      for (const entry of files) {
        const path = resolve(folder, run.id, entry.path);
        if (!path.startsWith(resolve(folder, run.id) + '/')) throw new Error('Invalid export path');
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, entry.path === 'config.js' ? 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...config, demo: true }) + ';\n' : entry.encoding === 'base64' ? Buffer.from(entry.content, 'base64') : entry.content);
      }
      receipts.push({ id: run.id, fromRevision: current.revision, revision: saved.revision, images, designFilesChanged: false });
      await writeFile(resolve(folder, 'platform-refresh.json'), JSON.stringify(receipts, null, 2));
      console.log(JSON.stringify(receipts.at(-1)));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Pilot refresh failed'); process.exitCode = 1; });
