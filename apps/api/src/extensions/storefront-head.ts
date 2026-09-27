import type { ExtensionSettings } from './extension';
import { EXTENSIONS, findExtension, type ExtensionRegistry } from './registry';
import { readSettings } from './settings';

export type Installation = { extensionId: string; enabled: boolean; settings: unknown };

/** JSON inside a <script> only needs its terminators hidden to be inert. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const attr = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function active(installations: Installation[], registry: ExtensionRegistry) {
  return installations.flatMap(item => {
    const manifest = item.enabled ? findExtension(item.extensionId, registry) : undefined;
    if (!manifest) return [];
    const settings = readSettings(manifest, item.settings);
    return manifest.settings.every(field => !field.required || settings[field.key] !== undefined) ? [{ manifest, settings }] : [];
  });
}

/**
 * Every script extension behind the one consent gate the storefront already asks through
 * (packages/storefront-kit/kit/privacy.js). Loaders are first-party code; the only merchant data they see
 * is settings that passed their patterns, embedded as inert JSON. PAGOSYA_TRACK exists before consent,
 * but handlers register only after it, so a purchase before consent is reported to nobody.
 */
export function extensionsHead(slug: string, installations: Installation[], registry: ExtensionRegistry = EXTENSIONS): string {
  const scripts = active(installations, registry).filter(item => item.manifest.storefrontLoader);
  if (!scripts.length) return '';
  const loaders = scripts.map(item => `${embed(item.manifest.id)}:${item.manifest.storefrontLoader}`).join(',');
  const configs: Record<string, ExtensionSettings> = Object.fromEntries(scripts.map(item => [item.manifest.id, item.settings]));
  const gate = `(function(){var s=${embed(slug)},C=${embed(configs)},d=document,w=window,done=false,H={},seen={};`
    + `var L={${loaders}};`
    + `w.PAGOSYA_ANALYTICS_AVAILABLE=true;w.PAGOSYA_ANALYTICS={slug:s,extensions:Object.keys(C)};`
    + `w.PAGOSYA_TRACK=function(n,p){if(n==='purchase'){if(!p||seen[p.orderId])return;seen[p.orderId]=1;}(H[n]||[]).forEach(function(f){try{f(p)}catch(e){}})};`
    + `function on(n,f){(H[n]=H[n]||[]).push(f)}`
    + `function tag(src){var e=d.createElement('script');e.async=true;e.src=src;(d.head||d.documentElement).appendChild(e);}`
    + `function start(){if(done||!(w.PAGOSYA_PRIVACY&&w.PAGOSYA_PRIVACY.analyticsAllowed(s)))return;done=true;`
    + `for(var k in L){try{L[k](C[k],tag,on)}catch(e){}}}`
    + `start();w.addEventListener('pagosya:privacy-change',start);})();`;
  return `<script data-pagosya-analytics="gate">${gate.replace(/<\/script/gi, '<\\/script')}</script>`;
}

/** Ownership tags (Search Console, Bing, Pinterest): no tracking, so no consent needed. */
export function verificationHead(installations: Installation[], registry: ExtensionRegistry = EXTENSIONS): string {
  return active(installations, registry).flatMap(({ manifest, settings }) => {
    const meta = manifest.verificationMeta, value = meta ? settings[meta.settingKey] : undefined;
    return meta && typeof value === 'string' ? [`<meta name="${attr(meta.name)}" content="${attr(value)}">`] : [];
  }).join('');
}
