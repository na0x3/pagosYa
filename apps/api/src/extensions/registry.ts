import type { ExtensionManifest } from './extension';

export const EXTENSION_REGISTRY = 'EXTENSION_REGISTRY';
export type ExtensionRegistry = readonly ExtensionManifest[];

export function assertRegistry(registry: ExtensionRegistry) {
  const seen = new Set<string>();
  for (const manifest of registry) { if (seen.has(manifest.id)) throw new Error(`Duplicate extension id: ${manifest.id}`); seen.add(manifest.id); }
}

/** Every extension pagosYa offers (spec 2026-09-27 §4). Only pagosYa adds entries. */
export const EXTENSIONS: ExtensionRegistry = [];
assertRegistry(EXTENSIONS);

export const findExtension = (id: string, registry: ExtensionRegistry = EXTENSIONS) => registry.find(manifest => manifest.id === id);
