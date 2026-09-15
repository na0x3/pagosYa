/** Offline evidence collection. Makes no inference or payment requests. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { captureSourceVisuals, probeSourceShopping } from '../src/stores/source-visual-capture';
import { designCaptureFailures } from '../src/stores/source-design-evaluator';
import { sourceProjectSnapshot, type SourceProjectSnapshot } from '../src/stores/source-project';
import { currentSourceRuntime } from '../src/stores/source-runtime';
/** Product-page evidence renders with the current runtime so runtime PDP changes are measured on every stored revision. */
async function captureProductPage(snapshot: SourceProjectSnapshot, folder: string) {
  if (!snapshot.files.some(file => file.path === 'product.html')) return { productCaptureError: 'Sin product.html en esta revisión.' };
  try {
    const captures = await captureSourceVisuals(await currentSourceRuntime(snapshot), 'product.html');
    const productCaptures = [];
    for (let i = 0; i < captures.length; i++) {
      const { image, ...capture } = captures[i]; const path = `product-capture-${i}.jpg`;
      await writeFile(resolve(folder, path), Buffer.from(image.split(',')[1], 'base64')); productCaptures.push({ ...capture, path });
    }
    return { productCaptures, productCaptureFailures: designCaptureFailures(captures), productRuntime: 'current' };
  } catch (error) { return { productCaptureError: error instanceof Error ? error.message : 'Capture failed' }; }
}
async function main() {
  const root = resolve(__dirname, '../../../examples/premium-benchmark');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService); config.set('app.sourceDesignJobsEnabled', false);
    if (!['localhost', '127.0.0.1'].includes(new URL(config.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local benchmark only');
    const prisma = app.get(PrismaService), results: any[] = [];
    for (const fixture of ['food', 'apparel', 'beauty', 'technical', 'home', 'single']) for (let repeat = 1; repeat <= 3; repeat++) for (const arm of ['baseline', 'candidate']) {
      const id = `${fixture}-${repeat}-${arm}`, folder = resolve(root, id); await mkdir(folder, { recursive: true });
      const run = await readFile(resolve(folder, 'receipt.json'), 'utf8').then(JSON.parse).catch(() => ({ id, fixture, repeat, arm, status: 'not_run', error: 'Stopped after OpenAI reported insufficient balance.' }));
      if (['running', 'setup', 'ready'].includes(run.status)) { run.status = 'interrupted'; run.error = 'Stopped after OpenAI reported insufficient balance. No automatic replay.'; await writeFile(resolve(folder, 'receipt.json'), JSON.stringify(run, null, 2)); }
      const result: any = { id, fixture, repeat, arm, status: run.status, error: run.error, generation: run.generation, revision: run.revision };
      if (run.storeId) {
        const generations = await prisma.storeSourceGeneration.findMany({ where: { storeId: run.storeId } });
        result.generationAttempts = generations.flatMap(g => (g.attempts as any[]).map(a => ({ ...a, generationId: g.id })));
        const usage = await prisma.storeAiUsage.findMany({ where: { storeId: run.storeId, stage: { in: ['design-job-review', 'design-job-comparison'] } }, select: { stage: true, model: true, usage: true, status: true } });
        result.reviewUsage = usage;
        const job = await prisma.storeSourceDesignJob.findFirst({ where: { storeId: run.storeId }, orderBy: { createdAt: 'desc' } });
        if (job) result.job = { id: job.id, status: job.status, stage: job.stage, error: job.error, receipts: job.receipts, checkpoints: job.checkpoints, observedMicroUsd: job.settledMicroUsd, reservedMicroUsd: job.reservedMicroUsd };
        // Only release admission slots for these isolated stopped benchmark runs.
        await prisma.storeSourceGeneration.updateMany({ where: { storeId: run.storeId, status: 'RUNNING' }, data: { status: 'INTERRUPTED', activeStoreId: null, completedAt: new Date() } });
      }
      if (run.status === 'completed') {
        const existing = await readFile(resolve(folder, 'evidence.json'), 'utf8').then(JSON.parse).catch(() => null);
        const snapshotFor = async () => {
          const project = await prisma.storeSourceProject.findUniqueOrThrow({ where: { storeId: run.storeId } });
          const version = await prisma.storeSourceVersion.findUniqueOrThrow({ where: { storeId_revision: { storeId: run.storeId, revision: project.revision } } });
          return { version, snapshot: sourceProjectSnapshot({ ...(version.snapshot as any), revision: version.revision, label: version.label }) };
        };
        if (existing) {
          Object.assign(result, existing);
          if (!existing.productCaptures && !existing.productCaptureError) {
            console.log(`Capturing product page ${id}`);
            Object.assign(result, await captureProductPage((await snapshotFor()).snapshot, folder));
            await writeFile(resolve(folder, 'evidence.json'), JSON.stringify({ ...existing, productCaptures: result.productCaptures, productCaptureFailures: result.productCaptureFailures, productRuntime: result.productRuntime, productCaptureError: result.productCaptureError }, null, 2));
          }
        } else {
          console.log(`Capturing ${id}`);
          const { version, snapshot } = await snapshotFor();
          result.sourceDigest = version.digest; result.evidenceRevision = version.revision;
          try {
            const captures = await captureSourceVisuals(snapshot, 'index.html');
            result.captureFailures = designCaptureFailures(captures);
            result.captures = [];
            for (let i = 0; i < captures.length; i++) {
              const { image, ...capture } = captures[i]; const path = `capture-${i}.jpg`;
              await writeFile(resolve(folder, path), Buffer.from(image.split(',')[1], 'base64')); result.captures.push({ ...capture, path });
            }
            result.shopping = await probeSourceShopping(snapshot);
            Object.assign(result, await captureProductPage(snapshot, folder));
          } catch (error) { result.evidenceError = error instanceof Error ? error.message : 'Capture failed'; }
          await writeFile(resolve(folder, 'evidence.json'), JSON.stringify({ sourceDigest: result.sourceDigest, evidenceRevision: result.evidenceRevision, captures: result.captures, captureFailures: result.captureFailures, shopping: result.shopping, productCaptures: result.productCaptures, productCaptureFailures: result.productCaptureFailures, productRuntime: result.productRuntime, productCaptureError: result.productCaptureError, evidenceError: result.evidenceError }, null, 2));
        }
      }
      results.push(result);
      await writeFile(resolve(root, 'results.json'), JSON.stringify(results, null, 2));
    }
    console.log(JSON.stringify({ planned: results.length, completed: results.filter(r => r.status === 'completed').length, checked: results.filter(r => r.shopping).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Evidence failed'); process.exitCode = 1; });
