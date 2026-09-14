/** Apply the diagnosed runtime fix to one isolated demo, retaining original evidence. No AI. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { AppModule } from '../src/app.module';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { currentSourceRuntime } from '../src/stores/source-runtime';
import { probeSourceShopping } from '../src/stores/source-visual-capture';
async function main() {
  const root = resolve(__dirname, '../../../examples/premium-benchmark'), folder = resolve(root, 'technical-1-candidate');
  const run = JSON.parse(await readFile(resolve(folder, 'receipt.json'), 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService); config.set('app.sourceDesignJobsEnabled', false);
    if (!['localhost', '127.0.0.1'].includes(new URL(config.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local only');
    const projects = app.get(SourceProjectsService), current = await projects.current(run.merchantId, run.storeId);
    let version = await projects.version(run.merchantId, run.storeId, current.revision);
    if (current.revision === 1) {
      const fixed = await currentSourceRuntime(version.snapshot as any);
      const saved = await projects.save(run.merchantId, run.storeId, { revision: 1, label: 'Corrección del checkout móvil verificada', brief: fixed.brief, files: fixed.files });
      version = await projects.version(run.merchantId, run.storeId, saved.revision);
    }
    const snapshot = version.snapshot as any, shopping = await probeSourceShopping(snapshot);
    if (shopping.some(r => r.status !== 'passed')) throw new Error(JSON.stringify(shopping));
    for (const file of snapshot.files) {
      const destination = resolve(folder, 'corrected', file.path); if (!destination.startsWith(resolve(folder, 'corrected') + '/')) throw new Error('Unsafe export');
      await mkdir(dirname(destination), { recursive: true });
      let bytes = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
      if (file.path === 'config.js') { const cfg = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)[1]); bytes = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...cfg, demo: true }) + ';'; }
      await writeFile(destination, bytes);
    }
    const remediation = { method: 'Codex runtime correction, no model generation', revision: version.revision, digest: version.digest, shopping, originalEvidence: 'evidence.json', reason: 'Authored !important fixed cart positioning obstructed the mobile checkout CTA. Shared checkout layout now overrides drawer positioning.' };
    await writeFile(resolve(folder, 'remediation.json'), JSON.stringify(remediation, null, 2));
    const results = JSON.parse(await readFile(resolve(root, 'results.json'), 'utf8'));
    results.find((r: any) => r.id === run.id).remediation = remediation;
    await writeFile(resolve(root, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(remediation));
  } finally { await app.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
