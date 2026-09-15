/** Exercise the durable worker on candidate-arm outputs as they become available. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { SourceDesignJobsService } from '../src/stores/source-design-jobs.service';
import { SourceDesignJobWorker } from '../src/stores/source-design-job.worker';
import { SourceProjectsService } from '../src/stores/source-projects.service';
async function main() {
  const folder = resolve(__dirname, '../../../examples/premium-benchmark');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService); config.set('app.sourceDesignJobsEnabled', true); config.set('app.sourceFramework', 'static'); config.set('app.port', 3001); config.set('app.checkoutOrigin', 'http://localhost:5175');
    if (!['localhost', '127.0.0.1'].includes(new URL(config.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local benchmark only');
    const jobs = app.get(SourceDesignJobsService), worker = app.get(SourceDesignJobWorker), projects = app.get(SourceProjectsService);
    const deadline = Date.now() + 3 * 60 * 60 * 1000;
    while (Date.now() < deadline) {
      let finished = 0;
      for (const id of (await readdir(folder)).filter(id => id.endsWith('-candidate')).sort()) {
        const run = await readFile(resolve(folder, id, 'receipt.json'), 'utf8').then(JSON.parse).catch(() => null);
        if (!run || !['completed', 'failed', 'interrupted'].includes(run.status)) continue;
        if (run.status !== 'completed') { finished++; continue; }
        const path = resolve(folder, id, process.env.BENCHMARK_PAGE === 'product.html' ? 'design-job-product.json' : 'design-job.json');
        let saved = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
        if (saved?.status && !['QUEUED', 'RUNNING'].includes(saved.status)) { finished++; continue; }
        if (!saved) {
          // Review the store's latest revision; an earlier applied design job may have advanced it.
          const latest = await projects.current(run.merchantId, run.storeId);
          try {
            saved = await jobs.create(run.merchantId, run.storeId, { requestId: randomUUID(), revision: latest.revision, page: process.env.BENCHMARK_PAGE === 'product.html' ? 'product.html' : 'index.html', maxCredits: 150, maxRepairs: 1 });
          } catch (error) {
            saved = { status: 'NOT_STARTED', error: error instanceof Error ? error.message : 'No se pudo iniciar.' };
            await writeFile(path, JSON.stringify(saved, null, 2)); console.log(JSON.stringify({ id, ...saved })); finished++; continue;
          }
          await writeFile(path, JSON.stringify(saved, null, 2)); console.log(`${id}: job ${saved.id}`);
        }
        let previous = '';
        while (['QUEUED', 'RUNNING'].includes(saved.status)) {
          await worker.tick();
          saved = await jobs.get(run.merchantId, run.storeId, saved.id);
          await writeFile(path, JSON.stringify(saved, null, 2));
          if (previous !== saved.status + saved.stage) { console.log(`${id}: ${saved.status} ${saved.stage}`); previous = saved.status + saved.stage; }
          if (['QUEUED', 'RUNNING'].includes(saved.status)) await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log(JSON.stringify({ id, status: saved.status, observedCredits: saved.observedCredits, reservedCredits: saved.reservedCredits, error: saved.error }));
        const current = await projects.current(run.merchantId, run.storeId);
        const version = await projects.version(run.merchantId, run.storeId, current.revision);
        for (const file of (version.snapshot as any).files) {
          const destination = resolve(folder, id, 'reviewed', file.path); if (!destination.startsWith(resolve(folder, id, 'reviewed') + '/')) throw new Error('Invalid export');
          await mkdir(dirname(destination), { recursive: true });
          let content = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
          if (file.path === 'config.js') { const value = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]); content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...value, demo: true }) + ';'; }
          await writeFile(destination, content);
        }
        finished++;
      }
      // Candidates that never completed generation cannot be reviewed; stop once every reviewable one is done.
      const candidates = (await readdir(folder)).filter(id => id.endsWith('-candidate'));
      const reviewable = (await Promise.all(candidates.map(id => readFile(resolve(folder, id, 'receipt.json'), 'utf8').then(JSON.parse).catch(() => null)))).filter(run => run && ['completed', 'failed', 'interrupted'].includes(run.status)).length;
      if (finished >= reviewable) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Benchmark review failed'); process.exitCode = 1; });
