/**
 * Who may drive the store preview (security audit 2026-10-21): checking event.source alone let any HTTPS page that
 * framed `?preview=1` post store patches and show a fake store on the real pagosYa origin. Only the merchant
 * dashboard and Studio origins in VITE_PREVIEW_PARENT_ORIGINS (comma-separated) may; locally, the dev servers.
 */
const LOCAL = ['http://localhost:4323', 'http://127.0.0.1:4323', 'http://localhost:5173'];

export function parsePreviewParentOrigins(value: string | undefined): string[] {
  const list = (value ?? '').split(',').map(origin => origin.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.length ? list : LOCAL;
}

export function previewParentAllowed(origin: string, allowed: string[]): boolean {
  return allowed.includes(origin);
}

export const PREVIEW_PARENT_ORIGINS = parsePreviewParentOrigins(import.meta.env?.VITE_PREVIEW_PARENT_ORIGINS);
