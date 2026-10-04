/**
 * Compares the agent and single YAPI engines on real builds. Spends real provider money; never saves or publishes
 * (each run is a candidate generation that returns the snapshot instead of storing it).
 * Usage (ts-node keeps the decorator metadata Nest needs): npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --merchant <id> --store <id> --engine agent|single --runs 3 [--credits 200] --instruction "…" --i-accept-costs
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../src/app.module';
import { SourceGenerationService } from '../src/storefront-source/source-generation.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { readFileSync, writeFileSync } from 'node:fs';
import type { AgentRequirement } from '../src/storefront-source/agent/agent-task';
import { captureAgentDraft } from '../src/storefront-source/agent/agent-capture';
import { catalogueDigest, specificityReport, type StoreSketch } from '../src/storefront-source/sketch';

/** The product card theme in a candidate's config.js (null when it has no DNA). */
function productThemeOf(candidate: any): { productCard: Record<string, string>; productCss: string } | null {
  const content: string | undefined = candidate?.files?.find((file: { path: string }) => file.path === 'config.js')?.content;
  try {
    const dna = JSON.parse(content?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}').dna;
    if (!dna) return null;
    return { productCard: Object.fromEntries(['swatch', 'gallery', 'blocks', 'divider', 'enter'].map(key => [key, String(dna[key] ?? '')])), productCss: typeof dna.productCss === 'string' ? dna.productCss : '' };
  } catch { return null; }
}

/** How grounded a generated sketch's copy is in the store's real catalogue. REPORTING ONLY: it reads the candidate's
 * sketch.json and config.js and prints a ratio and the filler phrases found; it never rewrites a sketch. A high ratio
 * means "not obviously generic", not "specific" (see SpecificityReport). Null when the candidate has no sketch. */
function specificityOf(candidate: any): { blocks: number; bands: number; groundedBands: number; hits: number; filler: string[] } | null {
  try {
    const file = (path: string): string | undefined => candidate?.files?.find((entry: { path: string }) => entry.path === path)?.content;
    const sketch = JSON.parse(file('sketch.json') ?? 'null') as StoreSketch | null;
    if (!sketch) return null;
    const data = JSON.parse(file('config.js')?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}').data ?? {};
    return specificityReport(sketch, catalogueDigest(data.items, data.categories));
  } catch { return null; }
}

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if (!process.argv.includes('--i-accept-costs')) throw new Error('This spends real provider credits. Re-run with --i-accept-costs.');
  const [merchantId, storeId, engine, instruction] = [arg('merchant'), arg('store'), arg('engine'), arg('instruction')];
  const runs = Number(arg('runs') || 1);
  // Studio's default per-request limit (mode A builds cost more than the old 50).
  const credits = Number(arg('credits') || 200);
  if (!merchantId || !storeId || (!instruction && !arg('suite')) || (engine !== 'agent' && engine !== 'single')) throw new Error('Missing --merchant, --store, --instruction or --engine agent|single.');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  // Candidate evaluation must not run recurring billing, delivery or mail jobs.
  const scheduler = app.get(SchedulerRegistry);
  for (const name of scheduler.getCronJobs().keys()) scheduler.deleteCronJob(name);
  for (const name of scheduler.getIntervals()) scheduler.deleteInterval(name);
  for (const name of scheduler.getTimeouts()) scheduler.deleteTimeout(name);
  const config = app.get(ConfigService);
  const original = config.get.bind(config);
  (config as any).get = (key: string, ...rest: unknown[]) => key === 'app.yapiEngine' ? engine : (original as any)(key, ...rest);
  const generation = app.get(SourceGenerationService);
  const projects = app.get(SourceProjectsService);
  const suite: Array<{ id: string; instruction: string; requirements: AgentRequirement[] }> = arg('suite') ? JSON.parse(readFileSync(arg('suite')!, 'utf8')) : [{ id:'custom', instruction:instruction!, requirements:[] }];
  const rows: Array<Record<string, any>> = [];
  const fixture = arg('fixture') ? JSON.parse(readFileSync(arg('fixture')!, 'utf8')) : null;
  for (const task of suite) for (let run = 1; run <= runs; run++) {
    const current = await projects.current(merchantId, storeId);
    const snapshot = fixture || (await projects.version(merchantId, storeId, current.revision) as any).snapshot;
    const brief = snapshot.brief;
    const started = Date.now();
    let attempts: any[] = [];
    try {
      const result: any = await generation.generate(merchantId, storeId, { revision: current.revision, brief, instruction: task.instruction, model: arg('model') || 'auto', maxCredits: credits } as any, generation.newBudget(credits), [], Object.assign(async () => undefined, { detail: async (step: {label:string}) => { console.log(`[${task.id}] ${step.label}`); } }), { candidate: true, free: true, evaluate: true, snapshot, onAttempts: value => { attempts = value; } });
      attempts = result.generation?.attempts || attempts;
      const evidence = [];
      const errors: string[] = [];
      for (const page of new Set(task.requirements.map(r => r.page))) for (const width of [1280,390] as const) {
        const shot = await captureAgentDraft(result.candidate, width, undefined, page, task.requirements);
        evidence.push(...shot.evidence); errors.push(...shot.errors);
      }
      // The evaluator owns these requirements; an agent cannot weaken them to pass.
      const verified = !!task.requirements.length && evidence.length === task.requirements.length * 2 && evidence.every(e => e.passed) && !errors.length;
      rows.push({ task:task.id, run, status:verified ? 'verified' : task.requirements.length ? 'false_completion' : 'ungraded', seconds:Math.round((Date.now()-started)/1000), credits:result.generation?.credits || 0, modelCalls:attempts.filter(a=>a.phase==='agent').length, inputTokens:attempts.reduce((n,a)=>n+(a.usage?.inputTokens||0),0), peakInputTokens:Math.max(0,...attempts.map(a=>a.usage?.inputTokens||0)), requirements:task.requirements, evidence, errors, diagnostics:attempts.flatMap(a=>a.diagnostics||[]), summary:result.agent?.summary });
      const candidateOut = arg('candidate-out');
      if (candidateOut) writeFileSync(candidateOut + '-' + task.id + '-' + run + '.json', JSON.stringify(result.candidate), {mode:0o600});
      // --shot <file.jpg>: a desktop screenshot of the built candidate, to judge the design itself.
      const shot = arg('shot');
      // The product page theme YAPI chose; --theme-out <file.json> keeps it so scripts/compare-product-themes.ts can compare two stores.
      const theme = productThemeOf(result.candidate);
      if (theme) {
        console.log(`  ficha: ${Object.entries(theme.productCard).map(([key, value]) => `${key}=${value}`).join(' ')} · css ${theme.productCss ? `${(theme.productCss.match(/\{/g) ?? []).length} reglas` : 'ninguno'}`);
        const out = arg('theme-out');
        if (out) writeFileSync(out.replace(/(\.json)?$/i, `-${run}.json`), JSON.stringify(theme, null, 2));
      }
      // Whether the copy work landed: grounded bands over prose bands, plus any filler phrases. Reporting only.
      const specificity = specificityOf(result.candidate);
      if (specificity) console.log(`  especificidad: ${specificity.groundedBands}/${specificity.bands} bandas con producto real (${specificity.blocks} bloques, ${specificity.hits} menciones) · relleno: ${specificity.filler.length ? specificity.filler.join(' | ') : 'ninguno'}`);
      if (shot && result.candidate) writeFileSync(shot.replace(/(\.jpe?g)?$/i, `-${run}.jpg`), Buffer.from((await captureAgentDraft(result.candidate, 1280)).image.split(',')[1], 'base64'));
      console.log(`run ${run}: ${result.agent?.summary ?? result.label}\n  secciones: ${(result.agent?.sections ?? []).join(' · ')}\n  pasos: ${(result.agent?.steps ?? []).map((step: { label: string }) => step.label).join(' → ')}`);
    } catch (error) {
      rows.push({ task:task.id, run, status: 'failed', seconds: Math.round((Date.now() - started) / 1000), credits: 0, modelCalls: attempts.filter(a=>a.phase==='agent').length, diagnostics: attempts.flatMap(a=>a.diagnostics||[]), error: (error as Error).message.slice(0, 160) });
    }
    if (arg('out')) writeFileSync(arg('out')!, JSON.stringify({ engine, providerMode:config.get('app.chatgptPlan') ? 'chatgpt-plan' : 'api', rows },null,2), {mode:0o600});
  }
  console.table(rows.map(({evidence,requirements,diagnostics,...row})=>row));
  console.log(`${engine}: ${rows.filter(row => row.status === 'verified').length}/${rows.length} verified`);
  await app.close();
  if (rows.some(row => row.status === 'failed' || row.status === 'false_completion')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exit(1); });
