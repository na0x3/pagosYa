/** Re-render the saved photo-led benchmark stores with the current product page kit. Local only; never generates or publishes. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { SourceVisualReviewService } from '../src/stores/source-visual-review.service';
import { sourceProjectSnapshot } from '../src/stores/source-project';
import { currentSourceRuntime } from '../src/stores/source-runtime';
import { captureSourceVisuals } from '../src/stores/source-visual-capture';
import { designCaptureFailures } from '../src/stores/source-design-evaluator';

async function main() {
  const root = resolve(__dirname, '../../../examples/premium-benchmark-photos');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const settings = app.get(ConfigService);
    if (!['localhost', '127.0.0.1'].includes(new URL(settings.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local fixtures only');
    const projects = app.get(SourceProjectsService), review = app.get(SourceVisualReviewService);
    for (const id of ['apparel-photo-1', 'beauty-photo-1', 'home-photo-1', 'technical-photo-1']) {
      const folder = resolve(root, id);
      const record = JSON.parse(await readFile(resolve(folder, 'receipt.json'), 'utf8'));
      const current = await projects.current(record.merchantId, record.storeId);
      const version = await projects.version(record.merchantId, record.storeId, current.revision);
      const snapshot = sourceProjectSnapshot({ ...(version.snapshot as any), revision: version.revision, label: version.label });
      const rendered = await review.hydrate(await currentSourceRuntime(snapshot), record.merchantId);
      const captures = await captureSourceVisuals(rendered, 'product.html');
      const failures = designCaptureFailures(captures);
      const evidence = await Promise.all(captures.map(async ({ image, ...capture }, i) => {
        const path = `kit-product-capture-${i}.jpg`;
        await writeFile(resolve(folder, path), Buffer.from(image.split(',')[1], 'base64'));
        return { ...capture, path };
      }));
      await writeFile(resolve(folder, 'kit-evidence.json'), JSON.stringify({ revision: current.revision, captures: evidence, failures }, null, 2) + '\n');
      console.log(JSON.stringify({ id, revision: current.revision, failures }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Kit capture failed'); process.exitCode = 1; });
