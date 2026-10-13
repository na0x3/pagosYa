import { CREDIT_MICRO_USD, sourceUsage } from './source-generation-policy';
import type { BrandProfile } from '../brand/brand-profile';
import type { HeroFacts } from './design-engine/style-hero';

/** The OpenAI model that runs the parts Claude does not (design planning, the single-call fallback). */
export const CLAUDE_COMPANION_MODEL = 'gpt-5.6-terra' as const;
/** What apps/api/sep5-run.mjs allowed the September 5 generator, which averaged 250s across the nine stores. */
export const SEP5_CLIENT_TIMEOUT_MS = 900_000;
/** Reasoning tokens count against max_output_tokens on this API, so the 18,000 apps/api/sep5-run.mjs asked for
 *  only sufficed because its model's reasoning fit inside it. The prompt still tells the model to write for
 *  18,000; this is the headroom that keeps a thinking model from truncating the project mid-file. */
export const SEP5_MAX_OUTPUT_TOKENS = 32_000;

/** Credits for the calls that completed: unknown provider usage is never invented or billed, and a free run costs nothing. */
export function completedCredits(attempts: ReadonlyArray<{ status: string; usage: ReturnType<typeof sourceUsage> }>, maxCredits: number, free: boolean): number {
  const successful = attempts.filter(attempt => attempt.status === 'COMPLETED');
  return free ? 0 : successful.every(attempt => attempt.usage) ? Math.min(maxCredits, Math.ceil(successful.reduce((sum, attempt) => sum + attempt.usage!.providerMicroUsd, 0) / CREDIT_MICRO_USD)) : 0;
}

/** The merchant's confirmed colours as a card palette, for a hero whose slot drew none; undefined without any. */
export function brandPalette(data: BrandProfile | undefined | null): HeroFacts['palette'] | undefined {
  const colour = (field: string) => data?.confirmed?.find(fact => fact.field === field && /^#[0-9a-f]{6}$/i.test(fact.value))?.value;
  const [paper, ink, accent, accent2] = [colour('background'), colour('foreground'), colour('accent'), colour('surface') ?? colour('accentForeground')];
  if (!paper && !ink && !accent && !accent2) return undefined;
  return { paper: paper ?? '#ffffff', ink: ink ?? '#111111', accent: accent ?? ink ?? '#111111', accent2: accent2 ?? '#f2f2f2' };
}

/** A new store or a redesign gets long product pages for products without one; a small edit never rewrites them. */
export const fillsProductPagesAfterSave = (isNewStore: boolean, redesign: boolean) => isNewStore || redesign;
