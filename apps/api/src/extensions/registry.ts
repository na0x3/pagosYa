import { googleAnalytics } from './catalog/google-analytics';
import { googleTagManager } from './catalog/google-tag-manager';
import { microsoftClarity } from './catalog/microsoft-clarity';
import { hotjar } from './catalog/hotjar';
import { metaPixel } from './catalog/meta-pixel';
import { tiktokPixel } from './catalog/tiktok-pixel';
import { pinterestTag } from './catalog/pinterest-tag';
import { googleAds } from './catalog/google-ads';
import { googleSearchConsole } from './catalog/google-search-console';
import { bingWebmaster } from './catalog/bing-webmaster';
import { pinterestVerification } from './catalog/pinterest-verification';
import { googleShopping } from './catalog/google-shopping';
import { metaCatalog } from './catalog/meta-catalog';
import type { ExtensionManifest } from './extension';

export const EXTENSION_REGISTRY = 'EXTENSION_REGISTRY';
export type ExtensionRegistry = readonly ExtensionManifest[];

export function assertRegistry(registry: ExtensionRegistry) {
  const seen = new Set<string>();
  for (const manifest of registry) { if (seen.has(manifest.id)) throw new Error(`Duplicate extension id: ${manifest.id}`); seen.add(manifest.id); }
}

/** Every extension pagosYa offers (spec 2026-09-27 §4). Only pagosYa adds entries. */
export const EXTENSIONS: ExtensionRegistry = [googleAnalytics, googleTagManager, microsoftClarity, hotjar, metaPixel, tiktokPixel, pinterestTag, googleAds, googleSearchConsole, bingWebmaster, pinterestVerification, googleShopping, metaCatalog];
assertRegistry(EXTENSIONS);

export const findExtension = (id: string, registry: ExtensionRegistry = EXTENSIONS) => registry.find(manifest => manifest.id === id);
