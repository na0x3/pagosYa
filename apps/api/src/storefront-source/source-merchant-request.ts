import { createHash } from 'node:crypto';
import { sourceRequestProfile, type SourceRequestProfile } from './source-request-profile';
import type { SendSourceMessageDto } from './dto/send-source-message.dto';

/** Original merchant intent stays separate from conversational summaries and model-authored plans. */
export type SourceMerchantRequest = {
  version: 1;
  contextAnchor?: string;
  options?: Pick<SendSourceMessageDto, 'templateId' | 'directionId' | 'sitePurpose' | 'motion' | 'scrollFeel' | 'setupAction'>;
  instruction: string;
  baseRevision: number;
  assetUrls: string[];
  currentPage?: string;
  /** Spec 2026-11-05 point-at: a template address, and a circle as the 12-char hash of its area (the area itself rides in the job input). */
  selection?: { sectionId: string; at?: number; page?: string; area?: string };
  profile: SourceRequestProfile;
};
export function sourceMerchantRequest(input: SendSourceMessageDto, contextAnchor?: string): SourceMerchantRequest {
  return { version: 1, options: { templateId: input.templateId, directionId: input.directionId, sitePurpose: input.sitePurpose, motion: input.motion, scrollFeel: input.scrollFeel, setupAction: input.setupAction }, ...(contextAnchor ? { contextAnchor } : {}), instruction: input.instruction.trim(), baseRevision: input.revision,
    assetUrls: [...(input.assetUrls || [])], currentPage: input.currentPage,
    selection: input.selection ? { sectionId: input.selection.sectionId,
      ...(typeof input.selection.at === 'number' && input.selection.page ? { at: input.selection.at, page: input.selection.page } : {}),
      ...(input.selection.area ? { area: createHash('sha256').update(JSON.stringify(input.selection.area)).digest('hex').slice(0, 12) } : {}) } : undefined,
    profile: sourceRequestProfile(input.instruction, input.revision > 0) };
}

/** A model rephrasing a request must not invalidate reusable source. Evidence is always rebuilt. */
export function sourceMerchantRequestKey(request: SourceMerchantRequest): string {
  return createHash('sha256').update(JSON.stringify({ version: request.version, contextAnchor: request.contextAnchor || null,
    instruction: request.instruction, revision: request.baseRevision, assets: [...request.assetUrls].sort(),
    page: request.currentPage || null, selection: request.selection ? [request.selection.sectionId, request.selection.page ?? null, request.selection.at ?? null, request.selection.area ?? null] : null, options: { templateId: request.options?.templateId, directionId: request.options?.directionId, sitePurpose: request.options?.sitePurpose, motion: request.options?.motion, scrollFeel: request.options?.scrollFeel, setupAction: request.options?.setupAction } })).digest('hex');
}
