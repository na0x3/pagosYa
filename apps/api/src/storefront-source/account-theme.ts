import { sanitizeThemeCss, type ThemeCssProfile } from './product-theme-css';

/** How a store's account pages look beyond its tokens (spec 2026-10-08-store-built-in-account-pages-design): a layout,
 * a photo of the store's own for `split`, and guarded CSS on the account parts. Stored as config.accountTheme. */
export const ACCOUNT_LAYOUTS = ['card', 'split', 'minimal', 'panel'] as const;
export type AccountLayout = (typeof ACCOUNT_LAYOUTS)[number];
export type AccountTheme = { layout: AccountLayout; photo?: string; css?: string };
export const ACCOUNT_PARTS = ['account', 'card', 'media', 'title', 'lead', 'form', 'field', 'label', 'input', 'hint', 'submit', 'link', 'error', 'notice', 'nav', 'nav-item', 'list', 'order', 'order-status', 'address', 'empty', 'danger'] as const;
/** Parts a shopper needs to sign in: they may be restyled, never hidden, made transparent, covered or shrunk. */
const PROTECTED = new Set(['input', 'submit', 'error', 'link', 'label', 'field', 'form']);
const HIDING = /^(display|visibility|opacity|clip|clip-path|width|height|max-width|max-height|font-size|transform|position|z-index|inset|top|left|right|bottom)$/;
const PROFILE: ThemeCssProfile = {
  parts: ACCOUNT_PARTS, sizedParts: ['card', 'media', 'account', 'nav', 'list', 'order', 'address'], scope: '[data-account-gate] ',
  keyframePrefix: 'at-', variables: /^--(?:ui|acc|account|store|brand)-[a-z0-9-]+$/i, variableHint: '--ui-, --acc-, --account-, --store- and --brand-',
  refuse: (part, property) => PROTECTED.has(part) && HIDING.test(property),
};

export function resolveAccountTheme(input: unknown, assetPaths: string[]): { theme: AccountTheme; dropped: string[] } {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const dropped: string[] = [];
  const layout = (ACCOUNT_LAYOUTS as readonly string[]).includes(raw.layout as string) ? raw.layout as AccountLayout : 'card';
  if (raw.layout !== undefined && layout !== raw.layout) dropped.push(`layout ${String(raw.layout)}`);
  const photo = typeof raw.photo === 'string' && assetPaths.includes(raw.photo) && layout === 'split' ? raw.photo : undefined;
  if (raw.photo !== undefined && !photo) dropped.push('photo: only one of the store\'s own photos, and only for split');
  const report = typeof raw.css === 'string' && raw.css.trim() ? sanitizeThemeCss(raw.css, PROFILE) : { css: '', dropped: [] };
  dropped.push(...report.dropped.map(item => `${item.rule ?? ''} ${item.declaration ?? ''}: ${item.reason}`.trim()));
  return { theme: { layout, ...(photo ? { photo } : {}), ...(report.css ? { css: report.css } : {}) }, dropped };
}

/** A stored theme, sanitized again (idempotent); undefined for anything that is not one. */
export function normalizeAccountTheme(value: unknown): AccountTheme | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return resolveAccountTheme(raw, typeof raw.photo === 'string' ? [raw.photo] : []).theme;
}

/** A snapshot with the account theme in its config.js, as the store would be saved with it (previews and the browser check). */
export function snapshotWithAccountTheme<T extends { files: Array<{ path: string; content: string }> }>(snapshot: T, theme: AccountTheme): T {
  return { ...snapshot, files: snapshot.files.map(file => {
    if (file.path !== 'config.js') return file;
    try {
      const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}');
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, accountTheme: theme })};` };
    } catch { return file; }
  }) };
}
