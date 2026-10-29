import { readFile } from 'node:fs/promises';
import { agentLabel } from './agent/agent-label';
import { productRuntimeDna } from './design-engine/product-draw';
import { BadGatewayException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { AgentWorkspace } from './agent/agent-workspace';
import { AgentToolbox, recordTellsKept } from './agent/agent-tools';
import { abortedByTimeout, AGENT_LIMITS, agentLimits, agentWallWithin, runAgent } from './agent/agent-loop';
import { assertMerchantTaskCoverage, assertTaskFeasibility, validateTaskRequirements, workspaceDigest } from './agent/agent-task';
import { agentDraftPreviews } from './agent/agent-draft-previews';
import { anthropicAgentModel } from './agent/agent-model-anthropic';
import { openAiAgentModel } from './agent/agent-model';
import { agentInstructions, agentOpening } from './agent/agent-prompt';
import { SOURCE_VISUAL_SYSTEM_CONTRACT, SOURCE_VISUAL_SYSTEM_FILE, sourceProductPageStyle } from './source-visual-system';
import { sourceRuntimeDna } from './source-dna';
import { SOURCE_DESIGN_FILE, SOURCE_VISUAL_COHERENCE_CONTRACT } from './source-design';
import { nextSourceFile, SOURCE_NEXT_INSTRUCTIONS } from './source-next';
import { repairDiagnostic } from './source-validation-error';
import { sourceRequestContext } from './source-request-context';
import { sourceMediaPolicy } from './source-media-design';
import { reviewSourceComposition } from './source-composition-review';
import { sourceProvider } from './source-provider';
import { agentStepModel, sourcePromptCacheKey, sourceUsage } from './source-generation-policy';
import { instructionConcernsProductCard } from './product-theme';
import { instructionConcernsKitSurfaces } from './kit-touch';
import { normalizeAccountTheme } from './account-theme';
import { readConfigFile } from './store-look';
import { AGENT_POLICY_KINDS } from './source-agent-policies';
import { withStoreLogo } from './source-templates';
import { masterPhotoUrl } from './source-master';
import { SOURCE_SHOPPING_FLOW } from './source-shopping-flow';
import { SOURCE_LOCATION_INSTRUCTIONS } from './source-location';
import { SOURCE_FONT_CHOICES } from './source-fonts';
import { sourceSitePurposePrompt } from './source-site-purpose';
import type { SourceMerchantRequest } from './source-merchant-request';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';

export type AgentStageContext = {
  facts: Pick<GenerationRunFacts, 'prisma' | 'config' | 'metering' | 'storeId' | 'runId' | 'slug' | 'dto' | 'execution' | 'progress' | 'plan' | 'chatgptPlan' | 'provider' | 'apiKey' | 'agentProvider' | 'budget' | 'signal' | 'attempts' | 'autoRepairs' | 'started' | 'runTimeout' | 'stablePrompt' | 'signatureOn' | 'apiUrl' | 'data' | 'images' | 'assets' | 'assetUrls' | 'previous' | 'previousFiles' | 'oldFiles' | 'sectionScope' | 'sitePurpose' | 'scrollFeel' | 'redesign' | 'editExisting'>;
  live: GenerationLive;
  acceptCandidate: () => Promise<void>;
  /** An earlier unfinished run of this exact request, as generate() read it before the design stage. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the checkpoint is untyped JSON from the run row, read as today
  resume: { resumable: boolean; checkpoint: any; checkpointKey: string; requestKey: string | undefined; merchantRequest: SourceMerchantRequest | undefined };
};

/** The tool-using agent builds or edits a component store (docs/superpowers/specs/2026-09-26-yapi-agent-design.md); finish
 *  is accepted only when the draft passes the same acceptance chain a single-call response must pass. */
export async function runAgentStage(context: AgentStageContext): Promise<void> {
  const { facts, live, acceptCandidate, resume } = context;
  const { resumable, checkpoint, checkpointKey, requestKey, merchantRequest } = resume;
  const { prisma, config, metering, storeId, runId, slug, dto, execution, progress, plan, chatgptPlan, provider, apiKey, agentProvider, budget, signal, attempts, autoRepairs, started, runTimeout, stablePrompt, signatureOn, apiUrl, data, images, assets, assetUrls, previous, previousFiles, oldFiles: givenFiles, sectionScope, sitePurpose, scrollFeel, redesign, editExisting } = facts;
  await progress?.('building');
  const isNew = !previous;
  // Review fix 2026-10-28 (I1): the store-data line the locked Shell reads gets the logo the cover pick saved after rev 1.
  const oldFiles = redesign && execution?.firstDesign ? withStoreLogo(givenFiles, masterPhotoUrl((data as { logoUrl?: string | null }).logoUrl, apiUrl)) : givenFiles;
  // Owner 2026-10-28 («they eat the gpt credits»): a first design runs leaner — low reasoning, no location or font-list
  // instructions (its brief already names the fonts), and the merchant's photos at low detail on every turn.
  const leanDesign = redesign && execution?.firstDesign === true;
  const workspace = new AgentWorkspace(oldFiles, { redesign: isNew || redesign, rewriteComponents: execution?.keepTemplate === true, lockedShell: redesign && execution?.firstDesign === true });


  // What the sandbox needs besides the draft: the saved store, or for a new store its catalog config and the commerce runtime.
  const previewBase = previous
    ? { brief: dto.brief, files: [...previousFiles.filter(file => !assets.some(asset => asset.path === file.path)), ...assets] }
    : { brief: dto.brief, files: [
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ sitePurpose, scrollFeel, demo: false, slug: slug, apiBaseUrl: apiUrl.href.replace(/\/$/, ''), checkoutOrigin: config.get<string>('app.checkoutOrigin'), productPage: 'product.html', checkoutPage: 'checkout.html', data })};\n` },
      { path: 'commerce.js', content: await readFile(kitPath('commerce.js'), 'utf8') },
      ...assets,
    ] };
  if (previous) previewBase.files = previewBase.files.map(file => {
    if (file.path !== 'config.js') return file;
    const stored = JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, ''));
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...stored, sitePurpose, scrollFeel, slug: slug, data })};\n` };
  });
  // Review the committed commerce structure, not the previous store's runtime DNA.
  // pendingTheme is subsequently applied by the toolbox, as it is at final save.
  if (isNew || redesign) {
    previewBase.files = previewBase.files.map(file => {
      if (file.path !== 'config.js') return file;
      const stored = JSON.parse(file.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, ''));
      // The agent previews the product surfaces the save will apply (product-draw.ts), not the planner's own pick.
      const productPageStyle = live.frame.product?.draw.productPage ?? sourceProductPageStyle(live.visualSystem, stored);
      const dna = { ...sourceRuntimeDna(live.committedDesign?.concepts[live.committedDesign.selected]?.dna, storeId, productPageStyle), ...productRuntimeDna(live.frame.product?.draw ?? {}) };
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...stored, ...(productPageStyle ? { productPageStyle } : {}), dna })};\n` };
    });
    previewBase.files = previewBase.files.filter(file => ![SOURCE_DESIGN_FILE, SOURCE_VISUAL_SYSTEM_FILE].includes(file.path));
    previewBase.files.push({ path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify(live.visualSystem) });
    if (live.committedDesign) previewBase.files.push({ path: SOURCE_DESIGN_FILE, content: JSON.stringify(live.committedDesign) });
  }
  // finish is accepted only when the draft passes the same acceptance chain a single-call response must pass.
  const gate = async (files: SourceProjectFileDto[]) => {
    const saved = { repairs: autoRepairs.length, motifs: live.motifFiles };
    live.generated = { label: 'Cambios de YAPI', files: files.map(file => ({ ...file })) };
    try { await acceptCandidate(); workspace.restore(live.generated.files.filter(file => nextSourceFile(file.path))); return null; }
    catch (error) { autoRepairs.length = saved.repairs; live.motifFiles = saved.motifs; return repairDiagnostic(error); }
  };
  const lenientGate = async (files: SourceProjectFileDto[]) => { live.lenient = true; try { return await gate(files); } finally { live.lenient = false; } };
  let renderablePreview = resumable ? checkpoint.preview : undefined;
  const toolbox = new AgentToolbox({ lockedShell: redesign && execution?.firstDesign === true, workspace, previous: oldFiles, base: previewBase, instruction: dto.instruction, merchantInstruction: sourceRequestContext.getStore()?.request.instruction, purpose: sitePurpose, maxScreenshots: AGENT_LIMITS.screenshots, signal, sectionScope, redesign: isNew || redesign, gate, lenientGate, taskRequired: true,
    mediaPolicy: sourceMediaPolicy(sitePurpose, isNew || redesign, merchantRequest?.instruction || dto.instruction, live.committedDesign?.concepts[live.committedDesign.selected]?.composition),
    ...((isNew || redesign) ? { reviewComposition: async (input: Parameters<typeof reviewSourceComposition>[0]) => {
      // The existing vision-capable planning provider reviews independently of the writing transcript.
      const reviewModel = live.model;
      const review = await reviewSourceComposition(input, { model: reviewModel, provider: sourceProvider(config, reviewModel), budget,
        direction: live.committedDesign?.concepts[live.committedDesign.selected],
        record: async (body, durationMs, status) => {
          attempts.push({ model: reviewModel, phase: 'visual', durationMs, status, usage: sourceUsage(reviewModel, body?.usage), tools: ['composition_review'] });
          await metering?.record(storeId, 'source-composition-review', reviewModel, body, durationMs, status);
        },
      });
      const visualAttempt = attempts.slice().reverse().find(attempt => attempt.phase === 'visual');
      if (visualAttempt) (visualAttempt.diagnostics ??= []).push({ tool: 'composition_review', digest: workspaceDigest(input.snapshot.files), durationMs: visualAttempt.durationMs,
        output: JSON.stringify({ ...review, coverage: input.captures.map(({ page, width }) => ({ page, width, state: 'normal' })) }) });
      return review;
    } } : {}),
    onDiagnostic: diagnostic => { const attempt = attempts.at(-1); if (attempt) (attempt.diagnostics ??= []).push(diagnostic); },
    // A whole-store design may always set the product page theme; a local edit only when it concerns the product page.
    themeAllowed: isNew || redesign || instructionConcernsProductCard(dto.instruction) || instructionConcernsKitSurfaces(dto.instruction),
    accountThemeAllowed: isNew || redesign || /cuenta|login|ingres|registro|contraseña|perfil|pedidos|acceso/i.test(dto.instruction),
    // A local edit builds on the account theme the store has; a new store or a redesign starts it fresh.
    accountThemeBase: isNew || redesign ? undefined : normalizeAccountTheme(readConfigFile(previousFiles).accountTheme),
    motifPackAllowed: isNew || redesign || /motivo|decora|paquete|dibuj|ilustra|sticker|pegatina|tem[aá]tic|divertid|l[uú]dic/i.test(dto.instruction),
    // The store appears in Studio while YAPI works; photos Studio already has from the saved revision are not resent.
    onPreview: files => {
      renderablePreview = { files: workspace.files(), theme: toolbox.pendingTheme };
      agentDraftPreviews.set(storeId, files.filter(file => !(file.encoding === 'base64' && previousFiles.some(saved => saved.path === file.path))));
    } });
  if (resumable) {
    try { toolbox.requirements = validateTaskRequirements(checkpoint.requirements, oldFiles); assertTaskFeasibility(toolbox.requirements, previewBase.files); assertMerchantTaskCoverage(toolbox.requirements, merchantRequest?.instruction || dto.instruction); }
    catch (error) {
      toolbox.requirements = [];
      live.taskPrompt += '\nThe retained source is reusable, but its old checker plan was invalid: ' + (error as Error).message + ' Plan again against the unchanged original merchant request before continuing.';
    }
    workspace.restore(checkpoint.files, true);
    toolbox.pendingTheme = checkpoint.theme || null;
    toolbox.pendingAccountTheme = normalizeAccountTheme(checkpoint.accountTheme) ?? null;
    toolbox.pendingMotifPack = typeof checkpoint.motifPack === 'string' || checkpoint.motifPack === null ? checkpoint.motifPack : undefined;
    toolbox.pendingPolicies = Object.fromEntries(AGENT_POLICY_KINDS.filter(kind => typeof checkpoint.policies?.[kind] === 'string' || checkpoint.policies?.[kind] === null).map(kind => [kind, checkpoint.policies[kind]]));
    live.taskPrompt += '\nRestored unfinished private draft for this exact request. Original requirements (must not be reduced): ' + JSON.stringify(toolbox.requirements) + '. Inspect current files, repair the remaining problems and verify again.';
  }
  const saveCheckpoint = async () => {
    if (execution?.candidate || !toolbox.requirements.length) return;
    await prisma.storeSourceGeneration.updateMany({ where: { id: runId, status: 'RUNNING' }, data: { checkpoint: { key: checkpointKey, ...(execution?.firstDesign ? { firstDesign: true } : {}),...(live.committedDesign ? { design: live.committedDesign } : {}), ...(requestKey ? { requestKey } : {}), assetUrls, ...(renderablePreview ? { preview: renderablePreview } : {}), ...(!previous ? { base: { brief: previewBase.brief, files: previewBase.files.filter(file => !file.path.startsWith('assets/')) } } : {}), requirements: toolbox.requirements, files: workspace.files(), theme: toolbox.pendingTheme, accountTheme: toolbox.pendingAccountTheme, ...(toolbox.pendingMotifPack !== undefined ? { motifPack: toolbox.pendingMotifPack } : {}), ...(Object.keys(toolbox.pendingPolicies).length ? { policies: toolbox.pendingPolicies } : {}), evidence: toolbox.evidence } as unknown as Prisma.InputJsonValue } });
  };
  // Spec 2026-10-29 (agent cost): the build steps run on the step model; planning and the composition review keep plan.model.
  const stepModel = agentProvider ? plan.model : agentStepModel(plan, config.get<string>('app.yapiAgentStepModel'));
  const onTurn = async ({ body, durationMs, status, prefixTokens }: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED'; prefixTokens?: number }) => {
    // The tools this turn asked for, so a slow or failed run can be explained afterwards (OpenAI `output`, Anthropic `content`).
    const tools = [...(Array.isArray(body?.output) ? body.output : []), ...(Array.isArray(body?.content) ? body.content : [])].filter((item: any) => item?.type === 'function_call' || item?.type === 'tool_use').map((item: any) => String(item.name));
    attempts.push({ model: stepModel, phase: 'agent', durationMs, status, usage: sourceUsage(stepModel, body?.usage), reasoningEffort: plan.reasoningEffort, tools, ...(prefixTokens !== undefined ? { prefixTokens } : {}), ...(typeof body?.status === 'string' ? { responseStatus: body.status } : {}),
      // The provider's own words, for us: the merchant sees only the status and code.
      ...(body?.error ? { failureReason: [body.error.code || body.error.type, body.error.message].filter(part => typeof part === 'string' && part).join(': ').slice(0, 300) } : {}) });
    await prisma.storeSourceGeneration.updateMany({ where:{id:runId,status:'RUNNING'}, data:{attempts:attempts as unknown as Prisma.InputJsonValue} });
    await metering?.record(storeId, 'source-generation', stepModel, body, durationMs, status);
  };
  const agentModel = agentProvider
    ? anthropicAgentModel({ endpoint: agentProvider.endpoint, apiKey: agentProvider.apiKey, model: plan.model, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), signal, onTurn })
    : openAiAgentModel({
      endpoint: provider.endpoint, apiKey, model: stepModel, providerName: provider.name, budget, maxOutputTokens: Math.min(plan.maxOutputTokens, 16_000), reasoningEffort: leanDesign ? 'low' : plan.reasoningEffort, signal,
      // Every turn resends the growing transcript; a stable key lets the provider bill that prefix at the cached rate.
      promptCacheKey: sourcePromptCacheKey('agent', stablePrompt, storeId),
      onTurn,
    });
  execution?.onDispatch?.();
  let outcome: Awaited<ReturnType<typeof runAgent>>;
  let accepted: boolean;
  try {
    // Measured against the run's hard stop, so the agent stops itself (warned, and its draft rescued) before the run is aborted.
    const runLimits = { ...agentWallWithin(agentLimits(chatgptPlan), started + runTimeout), ...(execution?.agentToolCalls ? { toolCalls: execution.agentToolCalls } : {}) };
    outcome = await runAgent({ model: agentModel, toolbox, signal, limits: runLimits, instructions: agentInstructions([SOURCE_VISUAL_COHERENCE_CONTRACT, SOURCE_VISUAL_SYSTEM_CONTRACT, SOURCE_NEXT_INSTRUCTIONS, SOURCE_SHOPPING_FLOW, ...(leanDesign ? [] : [SOURCE_LOCATION_INSTRUCTIONS, SOURCE_FONT_CHOICES.replaceAll('styles.css', 'styles/globals.css')])].join('\n\n'), sitePurpose, isNew, isNew || redesign, runLimits.wallMs / 60_000, signatureOn, [live.frame.paragraph, live.playbookText].filter(Boolean).join('\n')), opening: agentOpening(live.taskPrompt + '\n' + sourceSitePurposePrompt(sitePurpose), [...workspace.files(), ...previewBase.files.filter(f => f.path.startsWith('assets/'))], leanDesign ? images.map(image => ({ ...image, detail: 'low' as const })) : images), onStep: async step => { await progress?.detail?.({ label: step.label, ...(step.thumbnail ? { thumbnail: step.thumbnail } : {}) }); if (['create_page','edit_file','edit_file_batch','write_file','delete_file','set_product_card_theme','set_account_theme','set_motif_pack','set_store_policy','verify'].includes(step.kind)) await saveCheckpoint(); } });
    accepted = outcome.status === 'finished' && !!toolbox.finished;
    // Soft checks (palette, visual review, template structure, the model's own requirements) must never discard a draft that builds.
    // A model that stopped answering is not a soft check: Dulce Horno 2026-10-26 lost its ChatGPT plan quota between writing new
    // markup and styling it, and the half-made page was saved as done. That draft stays private for «sigue»; the revision stays.
    if (!accepted && !outcome.provider && outcome.reason !== 'cancelled' && !signal?.aborted && (workspace.changedPaths().length || toolbox.pendingTheme || toolbox.pendingAccountTheme || toolbox.pendingMotifPack !== undefined || Object.keys(toolbox.pendingPolicies).length)) accepted = await toolbox.acceptIfBuildable();
    live.unfinishedStatus = toolbox.stopped?.status === 'partial' ? 'PARTIAL' : toolbox.stopped?.status === 'blocked' ? 'BLOCKED' : null;
  } finally { agentDraftPreviews.clear(storeId); }
  if (!accepted) throw new BadGatewayException(`YAPI no pudo terminar el trabajo${outcome.reason === 'cancelled' ? (abortedByTimeout(signal) ? ' porque se acabó el tiempo de esta solicitud' : ' porque se canceló') : outcome.status === 'failed' && outcome.reason ? `: ${outcome.reason.replace(/\.+$/, '')}` : outcome.reason === 'credits' ? ' dentro del límite de créditos de esta solicitud; puedes subirlo en Créditos' : outcome.reason === 'loop' ? ' porque se quedó repitiendo la misma acción' : ' dentro del límite de pasos'}. Tu revisión anterior sigue guardada.`);
  // An account-theme-only edit (PEPPA please 2026-10-20: «quita el borde de la tarjeta») changes the store too.
  if (editExisting && !workspace.changedPaths().length && !toolbox.pendingTheme && !toolbox.pendingAccountTheme && toolbox.pendingMotifPack === undefined && !Object.keys(toolbox.pendingPolicies).length) throw new BadGatewayException('YAPI terminó sin cambiar la tienda. Tu revisión anterior sigue guardada.');
  autoRepairs.push(...toolbox.repairs);
  if (signatureOn) recordTellsKept(attempts, toolbox.tellsKept);
  live.agentTheme = toolbox.pendingTheme;
  live.agentAccountTheme = toolbox.pendingAccountTheme;
  live.agentMotifPack = toolbox.pendingMotifPack;
  live.agentPolicies = toolbox.pendingPolicies;
  const summary = toolbox.finished?.summary.trim() || 'Cambios de YAPI';
  live.generated.label = agentLabel(summary);
  live.agentOutcome = { summary, requirements: toolbox.requirements, evidence: toolbox.evidence, sections: toolbox.finished?.sections ?? [], steps: toolbox.steps.map(({ thumbnail: _thumbnail, ...step }) => step), ...(outcome.status === 'finished' && toolbox.finished ? {} : { unchecked: true }) };
}
