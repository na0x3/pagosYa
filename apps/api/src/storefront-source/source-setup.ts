import type { SourceWebsiteReference } from './source-website-reference';

export type SourceImageRole = 'logo' | 'product' | 'business' | 'background' | 'team' | 'reference' | 'unknown' | 'unused';
export type SourceImageUse = { url: string; role: SourceImageRole; description: string };
export type SourceSetupDraft = {
  step: 'conversation';
  answers: Record<string, string>;
  assetUrls: string[];
  imageUses: SourceImageUse[];
  prompt?: string;
  discoveryReplies?: number;
  websiteReferences?: SourceWebsiteReference[];
  pendingCatalogRequest?: string;
};
export const newSourceSetup = (): SourceSetupDraft => ({ step: 'conversation', answers: {}, assetUrls: [], imageUses: [] });

export function sourceSetupPrompt(draft: SourceSetupDraft, store: { name: string }) {
  return {
    step: 'conversation' as const,
    prompt: draft.prompt || `Antes de crear el sitio de ${store.name}, aclaremos tu negocio y el estilo que buscas. ¿Qué vendes y a quién quieres llegar?`,
    options: [],
  };
}
