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
  selection?: { sectionId: string };
  profile: SourceRequestProfile;
};
export function sourceMerchantRequest(input: SendSourceMessageDto, contextAnchor?: string): SourceMerchantRequest {
  return { version: 1, options: { templateId: input.templateId, directionId: input.directionId, sitePurpose: input.sitePurpose, motion: input.motion, scrollFeel: input.scrollFeel, setupAction: input.setupAction }, ...(contextAnchor ? { contextAnchor } : {}), instruction: input.instruction.trim(), baseRevision: input.revision,
    assetUrls: [...(input.assetUrls || [])], currentPage: input.currentPage,
    selection: input.selection ? { sectionId: input.selection.sectionId } : undefined,
    profile: sourceRequestProfile(input.instruction, input.revision > 0) };
}

/** A model rephrasing a request must not invalidate reusable source. Evidence is always rebuilt. */
export function sourceMerchantRequestKey(request: SourceMerchantRequest): string {
  return createHash('sha256').update(JSON.stringify({ version: request.version, contextAnchor: request.contextAnchor || null,
    instruction: request.instruction, revision: request.baseRevision, assets: [...request.assetUrls].sort(),
    page: request.currentPage || null, selection: request.selection?.sectionId || null, options: { templateId: request.options?.templateId, directionId: request.options?.directionId, sitePurpose: request.options?.sitePurpose, motion: request.options?.motion, scrollFeel: request.options?.scrollFeel, setupAction: request.options?.setupAction } })).digest('hex');
}
