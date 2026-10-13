/**
 * Compares the agent and single YAPI engines on real builds. Spends real provider money; never saves or publishes
 * (each run is a candidate generation that returns the snapshot instead of storing it).
 * Usage (ts-node keeps the decorator metadata Nest needs): npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts --merchant <id> --store <id> --engine agent|single --runs 3 [--credits 200] [--brief brief.json, for a store with no saved design] --instruction "…" --i-accept-costs
 *
 * Record & replay (src/storefront-source/evaluation-tape.ts), to check the code after the model answers offline:
 * - `--record <dir>` on a real run keeps every model request/response, in order, per case, under <dir>/cases/<case>--run<n>/
 *   (with the case's brief, snapshot, revision and model, and the run's Math.random draws and "recent designs" lookups);
 *   <dir>/recording.json keeps the engine, store, model and suite. Use a folder under the ignored .yapi-evaluation/recordings/.
 * - `--replay <dir>` runs the recorded cases again with no model calls: no --i-accept-costs, no ChatGPT bridge, no port 3001.
 *   Everything downstream runs for real, against the dev DB like a real run. The first call the recording does not have
 *   (one call too many, or a changed request) fails the case loudly, naming the case and call; that is expected after a
 *   prompt change: re-record. `--replay-loose` serves calls whose input alone changed (a tool result fed back) as drift.
 * See docs/chatgpt-local-development.md, "Record a run, replay it offline".
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
import { SOURCE_DESIGN_FILE } from '../src/storefront-source/source-design';
import { signatureTellReport } from '../src/storefront-source/source-signature-report';
import { createModelTape, installModelTape, pinAsyncMethods, readCaseMeta, readRecordingMeta, writeCaseOutcome, writeRecordingMeta, type TapeCaseReport } from '../src/storefront-source/evaluation-tape';

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

/** The selected concept's signature and the tells in the built source. REPORTING ONLY. */
function tellsOf(candidate: any) {
  const files = Array.isArray(candidate?.files) ? candidate.files : [];
  let signature;
  try { const design = JSON.parse(files.find((file: { path: string }) => file.path === SOURCE_DESIGN_FILE)?.content ?? 'null'); signature = design?.concepts?.[design.selected]?.signature; } catch { signature = undefined; }
  return { signature, report: signatureTellReport(files, signature) };
}

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

/** The DB lookups a build reads to avoid looking like recent stores: pinned by the tape so a replay sees what the recording saw. */
const RECENT_LOOKUPS = ['recentFrameDraws', 'recentStyleCards', 'recentDesignFingerprints', 'recentCompositionFingerprints'];

/** One short line per case, the same in every mode, so two replays (or a replay and its recording) can be compared. */
function caseLine(row: Record<string, any>, tape?: TapeCaseReport): string {
  const passed = row.status === 'verified' || row.status === 'ungraded';
  const parts = [`${passed ? 'PASSED' : 'FAILED'} (${row.status})`, `${row.seconds}s`, `${row.repairs ?? 0} code repairs`, `${row.failedAttempts ?? 0} failed model attempts`];
  if (tape?.recorded !== undefined) parts.push(`replay ${tape.recorded - (tape.unused ?? 0)}/${tape.recorded} calls served${tape.unused ? `, ${tape.unused} unused` : ''}${tape.drift.length ? `, ${tape.drift.length} drifted` : ''}`);
  else if (tape) parts.push(`${tape.calls} model calls recorded`);
  const recorded = tape?.recordedOutcome as Record<string, any> | undefined;
  if (recorded) parts.push(`recorded: ${recorded.status}, ${recorded.seconds}s, ${recorded.repairs ?? 0} code repairs`);
  const lines = [`[${row.task}] run ${row.run}: ${parts.join(' · ')}`];
  if (row.failure) lines.push(`  reason: ${row.failure}`);
  for (const note of [...(tape?.drift ?? []), ...(tape?.notes ?? [])]) lines.push(`  replay: ${note}`);
  return lines.join('\n');
}

async function main() {
  const [recordDir, replayDir] = [arg('record'), arg('replay')];
  if (recordDir && replayDir) throw new Error('Use --record or --replay, not both.');
  // A replay makes no model call, so it spends nothing.
  if (!replayDir && !process.argv.includes('--i-accept-costs')) throw new Error('This spends real provider credits. Re-run with --i-accept-costs.');
  const recording = replayDir ? readRecordingMeta(replayDir) : undefined;
  const [merchantId, storeId, engine, instruction] = [arg('merchant') ?? recording?.merchantId, arg('store') ?? recording?.storeId, arg('engine') ?? recording?.engine, arg('instruction')];
  const runs = Number(arg('runs') || recording?.runs || 1);
  // Studio's default per-request limit (mode A builds cost more than the old 50).
  const credits = Number(arg('credits') || recording?.credits || 200);
  const model = arg('model') || recording?.model || 'auto';
  if (!merchantId || !storeId || (!instruction && !arg('suite') && !recording) || (engine !== 'agent' && engine !== 'single')) throw new Error('Missing --merchant, --store, --instruction or --engine agent|single.');
  if (recording) {
    // The provider the recording used, with placeholder credentials: every model call is answered from the recording.
    // Configuration is read when the app boots below, after the .env files were loaded, so these win.
    if (recording.env?.NODE_ENV) process.env.NODE_ENV = recording.env.NODE_ENV;
    if (recording.env?.CHECKOUT_ORIGIN) process.env.CHECKOUT_ORIGIN = recording.env.CHECKOUT_ORIGIN;
    if (recording.providerMode === 'chatgpt-plan') Object.assign(process.env, { YAPI_CHATGPT_PLAN_URL: recording.planUrl, YAPI_CHATGPT_PLAN_SECRET: 'replay-offline', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' });
    else { delete process.env.YAPI_CHATGPT_PLAN_URL; Object.assign(process.env, { OPENAI_API_KEY: 'replay-offline', ANTHROPIC_API_KEY: 'replay-offline' }); }
    console.log(`Replaying ${replayDir} (recorded ${recording.createdAt}, ${recording.providerMode}, model ${model}): no model calls.`);
  }
  const tape = recordDir ? createModelTape('record', recordDir) : replayDir ? createModelTape('replay', replayDir, { loose: process.argv.includes('--replay-loose') }) : undefined;
  if (tape) installModelTape(tape);
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
  if (tape) pinAsyncMethods(tape, projects, 'projects', RECENT_LOOKUPS);
  // A replay runs the cases it recorded.
  const suite: Array<{ id: string; instruction: string; requirements: AgentRequirement[] }> = recording ? recording.suite : arg('suite') ? JSON.parse(readFileSync(arg('suite')!, 'utf8')) : [{ id:'custom', instruction:instruction!, requirements:[] }];
  const providerMode = config.get('app.chatgptPlan') ? 'chatgpt-plan' : 'api';
  if (recordDir) writeRecordingMeta(recordDir, { createdAt: new Date().toISOString(), engine, merchantId, storeId, model, credits, runs, providerMode, planUrl: process.env.YAPI_CHATGPT_PLAN_URL ?? null, env: { NODE_ENV: process.env.NODE_ENV ?? null, CHECKOUT_ORIGIN: process.env.CHECKOUT_ORIGIN ?? null }, suite });
  const rows: Array<Record<string, any>> = [];
  const fixture = arg('fixture') ? JSON.parse(readFileSync(arg('fixture')!, 'utf8')) : null;
  for (const task of suite) for (let run = 1; run <= runs; run++) {
    const current = await projects.current(merchantId, storeId);
    // A replay builds from the snapshot it recorded; the store's revision and catalogue still come from the DB.
    const recorded = replayDir ? readCaseMeta(replayDir, task.id, run) : undefined;
    if (recorded && recorded.revision !== current.revision) console.warn(`[${task.id}] the store is at revision ${current.revision}, the recording at ${recorded.revision}: expect a replay mismatch; re-record.`);
    // A store with no saved design is built from scratch, as its first YAPI build would be; --brief <file.json> supplies its brief.
    const snapshot = recorded?.snapshot || fixture || (current.revision ? (await projects.version(merchantId, storeId, current.revision) as any).snapshot : { brief: JSON.parse(readFileSync(arg('brief') ?? '', 'utf8')), files: [] });
    const brief = snapshot.brief;
    tape?.startCase(task.id, run, { instruction: task.instruction, requirements: task.requirements, brief, snapshot, revision: current.revision, model, engine, merchantId, storeId });
    let taped: TapeCaseReport | undefined;
    // Only the build talks to the model; the case closes as soon as it ends, before screenshots.
    const closeCase = () => { if (tape && !taped) taped = tape.finishCase(); };
    const started = Date.now();
    let attempts: any[] = [];
    try {
      const result: any = await generation.generate(merchantId, storeId, { revision: current.revision, brief, instruction: task.instruction, model, maxCredits: credits } as any, generation.newBudget(credits), [], Object.assign(async () => undefined, { detail: async (step: {label:string}) => { console.log(`[${task.id}] ${step.label}`); } }), { candidate: true, free: true, evaluate: true, snapshot, onAttempts: value => { attempts = value; } }).finally(closeCase);
      attempts = result.generation?.attempts || attempts;
      const evidence = [];
      const errors: string[] = [];
      for (const page of new Set(task.requirements.map(r => r.page))) for (const width of [1280,390] as const) {
        const shot = await captureAgentDraft(result.candidate, width, undefined, page, task.requirements);
        evidence.push(...shot.evidence); errors.push(...shot.errors);
      }
      // The evaluator owns these requirements; an agent cannot weaken them to pass.
      const verified = !!task.requirements.length && evidence.length === task.requirements.length * 2 && evidence.every(e => e.passed) && !errors.length;
      rows.push({ task:task.id, run, status:verified ? 'verified' : task.requirements.length ? 'false_completion' : 'ungraded', seconds:Math.round((Date.now()-started)/1000), repairs:result.generation?.autoRepairs?.length ?? 0, failedAttempts:attempts.filter(a=>a.status==='FAILED').length, failure:verified || !task.requirements.length ? undefined : [...errors, ...evidence.filter((e: any) => !e.passed).map((e: any) => e.detail)].join('; ').slice(0, 240) || 'requirements not shown', credits:result.generation?.credits || 0, modelCalls:attempts.filter(a=>a.phase==='agent').length, inputTokens:attempts.reduce((n,a)=>n+(a.usage?.inputTokens||0),0), peakInputTokens:Math.max(0,...attempts.map(a=>a.usage?.inputTokens||0)), requirements:task.requirements, evidence, errors, diagnostics:attempts.flatMap(a=>a.diagnostics||[]), summary:result.agent?.summary });
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
      const tells = tellsOf(result.candidate);
      console.log(`  firma: ${tells.signature ? `${tells.signature.idea} · vocabulario en página ${tells.report.vocabularyFound.length}/${tells.signature.vocabulary.length}` : 'ninguna'}`);
      console.log(`  señas: eyebrows ${tells.report.eyebrowSections} · marquesina ${tells.report.marquee ? 'sí' : 'no'} · reveal ${tells.report.topRevealClass ? `${tells.report.topRevealClass.name}×${tells.report.topRevealClass.uses}` : 'ninguno'} · fuentes ${tells.report.fonts.join(', ') || '—'} · mantuvo: ${attempts.flatMap((a: any) => a.tellsKept ?? []).join(' | ') || '—'}`);
      if (shot && result.candidate) writeFileSync(shot.replace(/(\.jpe?g)?$/i, `-${run}.jpg`), Buffer.from((await captureAgentDraft(result.candidate, 1280)).image.split(',')[1], 'base64'));
      console.log(`run ${run}: ${result.agent?.summary ?? result.label}\n  secciones: ${(result.agent?.sections ?? []).join(' · ')}\n  pasos: ${(result.agent?.steps ?? []).map((step: { label: string }) => step.label).join(' → ')}`);
    } catch (error) {
      // The merchant message hides the cause; each attempt's own reason names the check that failed.
      for (const attempt of attempts) console.log(`  intento ${attempt.phase ?? '?'} ${attempt.model} ${attempt.status}${attempt.failureReason ? `: ${attempt.failureReason}` : ''}`);
      rows.push({ task:task.id, run, status: 'failed', seconds: Math.round((Date.now() - started) / 1000), repairs: 0, failedAttempts: attempts.filter(a=>a.status==='FAILED').length, failure: [(error as Error).message, attempts.find(a => a.failureReason)?.failureReason].filter(Boolean).join(' — ').slice(0, 240), credits: 0, modelCalls: attempts.filter(a=>a.phase==='agent').length, diagnostics: attempts.flatMap(a=>a.diagnostics||[]), error: (error as Error).message.slice(0, 160) });
    }
    closeCase();
    const row = rows[rows.length - 1];
    // Whatever the build did with a refused call, a replay that ran out of recording did not check what it claims to.
    if (taped?.mismatch) Object.assign(row, { status: 'replay_mismatch', failure: taped.mismatch });
    if (recordDir) writeCaseOutcome(recordDir, task.id, run, { status: row.status, seconds: row.seconds, repairs: row.repairs, failedAttempts: row.failedAttempts, failure: row.failure, modelCalls: taped?.calls });
    console.log(caseLine(row, taped));
    if (arg('out')) writeFileSync(arg('out')!, JSON.stringify({ engine, providerMode, ...(replayDir ? { replay: replayDir } : {}), rows },null,2), {mode:0o600});
  }
  console.table(rows.map(({evidence,requirements,diagnostics,failure,...row})=>row));
  console.log(`${engine}: ${rows.filter(row => row.status === 'verified').length}/${rows.length} verified`);
  await app.close();
  if (rows.some(row => row.status === 'failed' || row.status === 'false_completion' || row.status === 'replay_mismatch')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exit(1); });
