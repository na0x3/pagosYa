import type { AiUsageService } from '../ai-usage/ai-usage.service';
import { sideCallDeadlineMs } from './source-side-deadlines';
import { KIT_TOUCH_MAX_OUTPUT_TOKENS, KIT_TOUCH_SCHEMA, KIT_TOUCH_TIMEOUT_MS } from './kit-touch';
import { SEP5_MAX_OUTPUT_TOKENS } from './source-generation-run';
import { controlsDeadlineMs, CONTROLS_MAX_OUTPUT_TOKENS, CONTROLS_SCHEMA } from './store-controls-design';
import { sourceUsage, type SourceModel } from './source-generation-policy';
import type { sourceProvider } from './source-provider';
import type { SourceRequestBudget } from './source-request-budget';
import type { SourceGenerationAttempt, SourceInputImage } from './source-generation-types';

export type Sep5CallContext = {
  /** The owner's ChatGPT plan: the touch and controls calls get longer deadlines (source-side-deadlines.ts). */
  chatgptPlan?: boolean;
  provider: Pick<ReturnType<typeof sourceProvider>, 'endpoint'>;
  apiKey: ReturnType<typeof sourceProvider>['apiKey'];
  budget: SourceRequestBudget;
  /** The run's model at the moment of each call. generate()'s single-call repair can switch it before the chat touch runs,
   *  so it is read per call, never captured. */
  model: () => SourceModel;
  signal: AbortSignal;
  attempts: SourceGenerationAttempt[];
  storeId: string;
  metering?: AiUsageService;
};
export type Sep5CallOptions = { signal?: AbortSignal; attempts?: SourceGenerationAttempt[]; maxOutputTokens?: number; effort?: 'low' | 'medium' | 'high' };
export type Sep5Caller = ReturnType<typeof sep5Caller>;

/** One whole-project call, shared by the author and its self-review so both are budgeted, metered and recorded alike. */
export function sep5Caller(context: Sep5CallContext) {
  const { provider, apiKey, budget, signal, attempts, storeId, metering } = context;
  const sep5Call = async (phase: 'author' | 'review' | 'touch' | 'controls' | 'photo' | 'voice' | 'tone', text: string, attached: SourceInputImage[], schemaName: string, schema: object, timeoutMs: number, options: Sep5CallOptions = {}) => {
    const callSignal = options.signal ?? signal;
    const attempt: SourceGenerationAttempt = { model: context.model(), phase, durationMs: 0, status: 'FAILED', usage: null };
    (options.attempts ?? attempts).push(attempt);
    let body: any = null;
    const callStarted = Date.now();
    try {
      // A small call (the 400-token photo line) asks for less than the usual 500-token floor; the floor never exceeds the request.
      const requested = options.maxOutputTokens ?? SEP5_MAX_OUTPUT_TOKENS;
      const allocation = budget.reserve(context.model(), Math.ceil(text.length / 3) + 1000, requested, Math.min(500, requested));
      try {
        // SEP5_CLIENT_TIMEOUT_MS, not the staged-call arms: those are sized for a 3,500-token design stage,
        // and this one writes the entire store.
        const response = await fetch(provider.endpoint, { method: 'POST', signal: AbortSignal.any([callSignal, AbortSignal.timeout(timeoutMs)]), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: context.model(), store: false, instructions: '', input: [{ role: 'user', content: [{ type: 'input_text', text }, ...attached] }], max_output_tokens: allocation.outputTokens, reasoning: { effort: options.effort ?? 'high' }, text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } } }) });
        body = await response.json().catch(() => null);
      } finally { allocation.settle(body?.usage); }
    } catch (error) { attempt.failureReason = ((error as Error)?.message || 'sin respuesta').slice(0, 300); }
    callSignal.throwIfAborted();
    attempt.durationMs = Date.now() - callStarted;
    attempt.usage = sourceUsage(context.model(), body?.usage);
    // A truncated project and a refused one fail identically without these, which is how an "incomplete
    // response" reached the merchant with nothing for anyone to act on.
    if (typeof body?.status === 'string') attempt.responseStatus = body.status;
    if (typeof body?.incomplete_details?.reason === 'string') attempt.incompleteReason = body.incomplete_details.reason;
    if (typeof body?.usage?.output_tokens === 'number') attempt.reasoningTokens = body.usage.output_tokens_details?.reasoning_tokens;
    await metering?.record(storeId, 'source-generation', context.model(), body, attempt.durationMs, attempt.status);
    return { attempt, body };
  };
  /** The touch call (spec 2026-10-14): the same metered client, a smaller answer, and one more try after 3 s when the
   *  bridge gives no completed answer. The attempt is charged only when its CSS is kept (`used`). */
  const touchCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: SourceInputImage[]) => {
    for (let tries = 0; ; tries++) {
      const { attempt, body } = await sep5Call('touch', text, attached, 'storefront_kit_touch', KIT_TOUCH_SCHEMA, sideCallDeadlineMs(KIT_TOUCH_TIMEOUT_MS, context.chatgptPlan), { signal: run.signal, attempts: run.attempts, maxOutputTokens: KIT_TOUCH_MAX_OUTPUT_TOKENS, effort: 'medium' });
      if ((body as { status?: string } | null)?.status === 'completed' || tries === 1) return { body, used: () => { attempt.status = 'COMPLETED'; } };
      await new Promise(resolve => setTimeout(resolve, 3000));
      run.signal.throwIfAborted();
    }
  };
  /** The controls call (spec 2026-10-14 store controls, part 4): the same metered client, a small answer and medium effort, on
   *  its own signal. The attempt is charged only when the guard keeps the record (`used`). */
  const controlsCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: SourceInputImage[]) => {
    const { attempt, body } = await sep5Call('controls', text, attached, 'storefront_controls', CONTROLS_SCHEMA, sideCallDeadlineMs(controlsDeadlineMs(), context.chatgptPlan), { signal: run.signal, attempts: run.attempts, maxOutputTokens: CONTROLS_MAX_OUTPUT_TOKENS, effort: 'medium' });
    return { body, used: () => { attempt.status = 'COMPLETED'; } };
  };
  return { sep5Call, touchCall, controlsCall };
}
