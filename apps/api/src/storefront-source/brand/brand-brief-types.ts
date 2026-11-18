import type { SourceFontId } from '../source-font-catalog';
import type { SourceSceneContract } from '../source-scene-contract';

/** «Mejorar mi marca» (spec 2026-11-18): what each step hands the next, and what the store keeps. */
export type BrandReference = { name: string; why: string };
export type BrandResearch = { niche: string; audience: string; references: BrandReference[]; patterns: string[]; searched: boolean };
export type BrandPalette = { ink: string; primary: string; accent: string; secondary: string; base: string };
export type BrandFonts = { display: SourceFontId; secondary: SourceFontId; body: SourceFontId };
export type BrandIdentity = {
  mode: 'evolve' | 'new';
  palette: BrandPalette;
  fonts: BrandFonts;
  oneLiner: string;
  voice: string;
  photoDirection: string;
  scene: SourceSceneContract;
};
export const BRAND_SHOT_KINDS = ['hero', 'lifestyle', 'poster', 'closeup', 'flatlay', 'banner'] as const;
export type BrandShotKind = (typeof BRAND_SHOT_KINDS)[number];
export type BrandShot = { kind: BrandShotKind; url: string; alt: string; product?: string };
export type BrandBrief = {
  version: 1;
  createdAt: string;
  storeName: string;
  research: BrandResearch;
  identity: BrandIdentity;
  shots: BrandShot[];
  inputs: { website?: string; images: number; text: boolean };
};
/** Written into the built revision; the store's onboarding JSON keeps a copy from before the shoot. */
export const BRAND_BRIEF_FILE = 'brand-brief.json';
export const PALETTE_ROLES = ['ink', 'primary', 'accent', 'secondary', 'base'] as const;
