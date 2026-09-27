import { BadRequestException } from '@nestjs/common';
import type { ExtensionField, ExtensionManifest, ExtensionSettings } from './extension';

function accept(field: ExtensionField, raw: unknown): string | boolean | undefined {
  if (field.type === 'toggle') return typeof raw === 'boolean' ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const value = field.normalize ? field.normalize(raw) : raw.trim();
  if (!value) return undefined;
  if (field.type === 'select') return field.options?.some(option => option.value === value) ? value : undefined;
  return !field.pattern || field.pattern.test(value) ? value : undefined;
}

/** What a stored row means today: values that no longer pass their field are "not configured", never injected. */
export function readSettings(manifest: ExtensionManifest, stored: unknown): ExtensionSettings {
  const source = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  const settings: ExtensionSettings = {};
  for (const field of manifest.settings) { const value = accept(field, source[field.key]); if (value !== undefined) settings[field.key] = value; }
  return settings;
}

export function isConfigured(manifest: ExtensionManifest, settings: ExtensionSettings, secrets: Record<string, string>) {
  return manifest.settings.every(field => !field.required || settings[field.key] !== undefined) && (manifest.secrets ?? []).every(secret => Boolean(secrets[secret.key]));
}

export function validateInput(manifest: ExtensionManifest, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }, storedSecrets: Record<string, string>) {
  const given = input.settings ?? {};
  for (const key of Object.keys(given)) if (!manifest.settings.some(field => field.key === key)) throw new BadRequestException(`«${key}» no es parte de esta extensión.`);
  const settings: ExtensionSettings = {};
  for (const field of manifest.settings) {
    const raw = given[field.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
    if (empty) { if (field.required) throw new BadRequestException(`Completa «${field.label}».`); continue; }
    const value = accept(field, raw);
    if (value === undefined) throw new BadRequestException(`Revisa «${field.label}»: no tiene el formato esperado.`);
    settings[field.key] = value;
  }
  const typed = input.secrets ?? {};
  for (const key of Object.keys(typed)) if (!(manifest.secrets ?? []).some(secret => secret.key === key)) throw new BadRequestException(`«${key}» no es parte de esta extensión.`);
  const secrets: Record<string, string> = {};
  for (const secret of manifest.secrets ?? []) {
    const raw = typed[secret.key];
    // An empty secret field means "keep what is stored": the form never shows the stored value.
    if (typeof raw !== 'string' || !raw.trim()) { if (storedSecrets[secret.key]) secrets[secret.key] = storedSecrets[secret.key]; continue; }
    if (secret.pattern && !secret.pattern.test(raw.trim())) throw new BadRequestException(`Revisa «${secret.label}»: no tiene el formato esperado.`);
    secrets[secret.key] = raw.trim();
  }
  return { settings, secrets };
}
