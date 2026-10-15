import type { SourceModel, sourceUsage } from './source-generation-policy';

// Types shared by SourceGenerationService and the modules split out of generate() (2026-10-15). This module imports
// types only and must never import the service: the service re-exports what its importers already use.

/** What a proposal-mode generate returns: the run now waits for the merchant to pick a card. */
export type StyleProposalResult = { styleProposal: { generationId: string; cards: number } };
/** One provider call of a run (or of its background review), as the row's attempts record it. */
export type SourceGenerationAttempt = { model: SourceModel; phase?: 'design' | 'source' | 'agent' | 'visual' | 'sketch' | 'composition' | 'brand' | 'creative' | 'critic' | 'author' | 'review' | 'touch'; durationMs: number; status: string; usage: ReturnType<typeof sourceUsage>; responseStatus?: string; incompleteReason?: string; reasoningTokens?: number; reasoningEffort?: string; failureReason?: string; tools?: string[]; diagnostics?: Array<{ tool: string; digest: string; durationMs: number; output: string }> };
