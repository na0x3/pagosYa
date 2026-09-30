/**
 * Compares the agent and single YAPI engines on real builds. Spends real provider money; never saves or publishes
 * (each run is a candidate generation that returns the snapshot instead of storing it).
 * Usage (ts-node keeps the decorator metadata Nest needs): npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --merchant <id> --store <id> --engine agent|single --runs 3 [--credits 200] --instruction "…" --i-accept-costs
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { SourceGenerationService } from '../src/storefront-source/source-generation.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceRequestBudget } from '../src/storefront-source/source-request-budget';
import { writeFileSync } from 'node:fs';
import { captureAgentDraft } from '../src/storefront-source/agent/agent-capture';

/** The product card theme in a candidate's config.js (null when it has no DNA). */
function productThemeOf(candidate: any): { productCard: Record<string, string>; productCss: string } | null {
  const content: string | undefined = candidate?.files?.find((file: { path: string }) => file.path === 'config.js')?.content;
  try {
    const dna = JSON.parse(content?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}').dna;
    if (!dna) return null;
    return { productCard: Object.fromEntries(['swatch', 'gallery', 'blocks', 'divider', 'enter'].map(key => [key, String(dna[key] ?? '')])), productCss: typeof dna.productCss === 'string' ? dna.productCss : '' };
  } catch { return null; }
}

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if (!process.argv.includes('--i-accept-costs')) throw new Error('This spends real provider credits. Re-run with --i-accept-costs.');
  const [merchantId, storeId, engine, instruction] = [arg('merchant'), arg('store'), arg('engine'), arg('instruction')];
  const runs = Number(arg('runs') || 1);
  // Studio's default per-request limit (mode A builds cost more than the old 50).
  const credits = Number(arg('credits') || 200);
  if (!merchantId || !storeId || !instruction || (engine !== 'agent' && engine !== 'single')) throw new Error('Missing --merchant, --store, --instruction or --engine agent|single.');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const config = app.get(ConfigService);
  const original = config.get.bind(config);
  (config as any).get = (key: string, ...rest: unknown[]) => key === 'app.yapiEngine' ? engine : (original as any)(key, ...rest);
  const generation = app.get(SourceGenerationService);
  const projects = app.get(SourceProjectsService);
  const rows: Array<{ run: number; status: string; seconds: number; credits: number; modelCalls: number; error?: string }> = [];
  for (let run = 1; run <= runs; run++) {
    const current = await projects.current(merchantId, storeId);
    const snapshot = (await projects.version(merchantId, storeId, current.revision) as any).snapshot;
    const brief = snapshot.brief;
    const started = Date.now();
    try {
      const result: any = await generation.generate(merchantId, storeId, { revision: current.revision, brief, instruction, maxCredits: credits } as any, new SourceRequestBudget(credits), [], undefined, { candidate: true, free: true, evaluate: true, snapshot });
      rows.push({ run, status: 'ok', seconds: Math.round((Date.now() - started) / 1000), credits: result.generation?.credits ?? 0, modelCalls: result.generation?.attempts?.length ?? 0 });
      // --shot <file.jpg>: a desktop screenshot of the built candidate, to judge the design itself.
      const shot = arg('shot');
      // The product page theme YAPI chose; --theme-out <file.json> keeps it so scripts/compare-product-themes.ts can compare two stores.
      const theme = productThemeOf(result.candidate);
      if (theme) {
        console.log(`  ficha: ${Object.entries(theme.productCard).map(([key, value]) => `${key}=${value}`).join(' ')} · css ${theme.productCss ? `${(theme.productCss.match(/\{/g) ?? []).length} reglas` : 'ninguno'}`);
        const out = arg('theme-out');
        if (out) writeFileSync(out.replace(/(\.json)?$/i, `-${run}.json`), JSON.stringify(theme, null, 2));
      }
      if (shot && result.candidate) writeFileSync(shot.replace(/(\.jpe?g)?$/i, `-${run}.jpg`), Buffer.from((await captureAgentDraft(result.candidate, 1280)).image.split(',')[1], 'base64'));
      console.log(`run ${run}: ${result.agent?.summary ?? result.label}\n  secciones: ${(result.agent?.sections ?? []).join(' · ')}\n  pasos: ${(result.agent?.steps ?? []).map((step: { label: string }) => step.label).join(' → ')}`);
    } catch (error) {
      rows.push({ run, status: 'failed', seconds: Math.round((Date.now() - started) / 1000), credits: 0, modelCalls: 0, error: (error as Error).message.slice(0, 160) });
    }
  }
  console.table(rows);
  console.log(`${engine}: ${rows.filter(row => row.status === 'ok').length}/${rows.length} succeeded`);
  await app.close();
}
main().catch(error => { console.error(error.message); process.exit(1); });
