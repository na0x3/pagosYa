import type { SourceWebsiteReference } from './source-website-reference';

export type SourceImageRole = 'logo' | 'product' | 'business' | 'background' | 'team' | 'reference' | 'unknown' | 'unused';
export type SourceImageUse = { url: string; role: SourceImageRole; description: string };
export type SourceSetupDraft = {
  sitePurpose?: import('./source-site-purpose').SourceSitePurpose;
  step: 'conversation';
  answers: Record<string, string>;
  assetUrls: string[];
  imageUses: SourceImageUse[];
  prompt?: string;
  discoveryReplies?: number;
  websiteReferences?: SourceWebsiteReference[];
  /** Spec 2026-10-16 brand source: the merchant's answer about shared material, and the images YAPI asked about. */
  brandSource?: 'own' | 'other' | 'asked';
  brandAssetUrls?: string[];
  /** The asked message was about the look (colours, style): the answer turn keeps it (final review 2026-10-16, I2). */
  brandLook?: boolean;
  /** The photos and logo already imported from the merchant's own old site: a retry reuses them (final review 2026-10-16). */
  brandImport?: { page: string; images: Array<{ url: string; source: string; kind: 'photo' | 'logo' }> };
  pendingCatalogRequest?: string;
  /** The merchant's answer to the template question, kept across turns (spec 2026-09-26). */
  startFrom?: 'template' | 'scratch';
  /** The design direction chosen for a from-scratch build (sub-project 2), reused if that build is retried. */
  directionId?: string;
  directionOrigin?: 'merchant';
  designReady?: boolean;
};
export const newSourceSetup = (): SourceSetupDraft => ({ step: 'conversation', answers: {}, assetUrls: [], imageUses: [] });

export function sourceSetupPrompt(draft: SourceSetupDraft, store: { name: string }) {
  return {
    step: 'conversation' as const,
    sitePurpose: draft.sitePurpose || 'shop',
    prompt: draft.prompt || `Antes de crear el sitio de ${store.name}, aclaremos tu negocio y el estilo que buscas. ¿Qué ofrece tu negocio y a quién quieres llegar?`,
    options: [],
  };
}
