/** Display-only identity. Authored HTML, scripts and CSS never enter the payment form. */
export interface CheckoutBranding {
  name: string;
  logoUrl: string | null;
  background: string;
  surface: string;
  foreground: string;
  accent: string;
  accentForeground: string;
  bodyFont: string;
  headingFont: string;
  radius: string;
  fonts: { family: string; source: string; weight: string; style: string }[];
}
type SourceFile = { path: string; content: string; encoding?: string };
type StoreIdentity = { name: string; logoUrl?: string | null; backgroundColor?: string | null; accentColor?: string | null; fontStyle?: string | null };
const color = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  if (/^#[\da-f]{6}$/i.test(v.trim())) return v.trim();
  if (/^#[\da-f]{3}$/i.test(v.trim())) return '#' + v.trim().slice(1).split('').map(c => c + c).join('');
  const rgb = v.match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/);
  return rgb && rgb.slice(1).every(n => +n <= 255) ? '#' + rgb.slice(1).map(n => (+n).toString(16).padStart(2, '0')).join('') : null;
};
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const readable = (bg: string, preferred: unknown) => { const c = color(preferred); return c && contrast(bg, c) >= 4.5 ? c : contrast(bg, '#ffffff') > contrast(bg, '#171717') ? '#ffffff' : '#171717'; };
const font = (v: unknown, fallback: string) => typeof v === 'string' && v.length <= 180 && /^[\w\s,"'-]+$/.test(v) ? v : fallback;
const logo = (v: unknown): string | null => typeof v === 'string' && v.length <= 2000 && (/^https?:\/\//i.test(v) || /^\/v1\/uploads\/[\w.-]+$/.test(v)) ? v : null;

export function normalizeCheckoutBranding(value: unknown, name: string): CheckoutBranding {
  const v = value && typeof value === 'object' ? value as Partial<CheckoutBranding> : {};
  const background = color(v.background) || '#faf9f6';
  const surface = color(v.surface) || background;
  const foreground = readable(background, v.foreground);
  // A common foreground must remain legible on both panels.
  const safeSurface = contrast(surface, foreground) >= 4.5 ? surface : background;
  const accent = color(v.accent) || foreground;
  return { name: name.slice(0, 120), logoUrl: logo(v.logoUrl), background, surface: safeSurface, foreground, accent,
    accentForeground: readable(accent, v.accentForeground), bodyFont: font(v.bodyFont, 'system-ui, sans-serif'), headingFont: font(v.headingFont, 'system-ui, sans-serif'),
    radius: typeof v.radius === 'string' && /^(?:\d|1\d|2[0-4])px$/.test(v.radius) ? v.radius : '0px',
    fonts: Array.isArray(v.fonts) ? v.fonts.slice(0, 2).filter(f => f && typeof f.family === 'string' && /^[\w -]{1,80}$/.test(f.family) && typeof f.source === 'string' && f.source.length <= 800000 && /^data:font\/(?:ttf|woff2?|otf);base64,[A-Za-z0-9+/]+=*$/.test(f.source)).map(f => ({family:f.family,source:f.source,weight:/^\d{3}(?: \d{3})?$/.test(f.weight) ? f.weight : '100 900',style:f.style === 'italic' ? 'italic' : 'normal'})) : [] };
}

/** Read the site's simple design tokens and locally bundled fonts, never execute authored code. */
export function sourceCheckoutBranding(store: StoreIdentity, snapshot?: { files?: SourceFile[] } | null): CheckoutBranding {
  const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
  const entry = files.find(f => f.path === 'checkout.html') || files.find(f => f.path === 'index.html');
  const linked = entry ? [...entry.content.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi)].map(m => m[1].replace(/^(?:\.\/|\/)/, '')) : [];
  const sheets = (linked.length ? linked.map(path => files.find(f => f.path === path)).filter((f): f is SourceFile => !!f) : files.filter(f => f.path.endsWith('.css'))).filter(f => f.encoding !== 'base64');
  const css = sheets.map(f => f.content).join('\n') + '\n' + (entry ? [...entry.content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') : '');
  const variables: Record<string, string> = {}, body: Record<string, string> = {}, heading: Record<string, string> = {};
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].trim().split(',').map(s => s.trim());
    const target = selectors.some(s => s === ':root' || s === 'html') ? variables : selectors.includes('body') ? body : selectors.includes('h1') ? heading : null;
    if (!target) continue;
    for (const declaration of match[2].split(';')) { const colon = declaration.indexOf(':'); if (colon > 0) target[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).replace(/\s*!important\s*$/, '').trim(); }
  }
  const resolve = (value: string | undefined, depth = 0): string => !value || depth > 8 ? '' : value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_, key, fallback) => resolve(variables[key] || body[key] || fallback, depth + 1));
  const token = (...keys: string[]) => keys.map(k => resolve(variables[k] || body[k])).find(Boolean);
  const fallbackFont = /classic|editorial|artisan|luxury/.test(store.fontStyle || '') ? 'Georgia, serif' : 'system-ui, sans-serif';
  const bodyFont = resolve(body['font-family']) || token('--brand-body-font', '--font-body', '--sans') || fallbackFont;
  const headingFont = resolve(heading['font-family']) || token('--brand-heading-font', '--font-heading', '--serif') || bodyFont;
  const fonts: CheckoutBranding['fonts'] = [];
  const fontSheets = [...sheets, ...(entry ? [{ path: entry.path, content: [...entry.content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') }] : [])];
  for (const sheet of fontSheets) for (const match of sheet.content.matchAll(/@font-face\s*\{([^}]+)\}/gi)) {
    const family = match[1].match(/font-family\s*:\s*([^;]+)/i)?.[1].trim().replace(/^["']|["']$/g, '');
    const src = match[1].match(/url\(\s*["']?([^"')]+)["']?\s*\)/i)?.[1];
    if (!family || !src || ![bodyFont, headingFont].some(stack => stack.split(',').some(f => f.trim().replace(/^["']|["']$/g, '') === family))) continue;
    const parts = (src.startsWith('/') ? src.slice(1) : (sheet.path.includes('/') ? sheet.path.slice(0, sheet.path.lastIndexOf('/') + 1) : '') + src).split('/');
    const resolved: string[] = []; for (const part of parts) { if (part === '..') resolved.pop(); else if (part && part !== '.') resolved.push(part); }
    const path = resolved.join('/');
    const file = files.find(f => f.path === path && f.encoding === 'base64');
    const ext = path.split('.').pop();
    if (file && /^(ttf|woff2?|otf)$/.test(ext || '')) fonts.push({family,source:`data:font/${ext};base64,${file.content}`,weight:match[1].match(/font-weight\s*:\s*([^;]+)/i)?.[1].trim() || '100 900',style:match[1].match(/font-style\s*:\s*([^;]+)/i)?.[1].trim() || 'normal'});
  }
  return normalizeCheckoutBranding({logoUrl:store.logoUrl,background:resolve(body.background || body['background-color']) || token('--brand-background', '--background', '--cream', '--paper') || store.backgroundColor,
    surface:token('--brand-surface', '--surface', '--paper'),foreground:resolve(body.color) || token('--brand-foreground', '--foreground', '--ink'),accent:token('--brand-accent', '--accent', '--primary', '--green') || store.accentColor,
    accentForeground:token('--brand-accent-foreground'),bodyFont,headingFont,radius:token('--brand-radius', '--radius'),fonts}, store.name);
}
