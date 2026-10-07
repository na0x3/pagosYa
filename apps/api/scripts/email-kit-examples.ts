// Designs email kits for six example stores and renders both receipts side by side.
// Usage: cd apps/api && npx ts-node --transpile-only scripts/email-kit-examples.ts <out-dir> --i-accept-costs
// Uses the API's model credentials (.env.local, then .env) and is billed like any design run:
// at most EMAIL_KIT_MAX_CREDITS per kit. Never touches the database.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { sourceProvider } from '../src/storefront-source/source-provider';
import { SourceRequestBudget } from '../src/storefront-source/source-request-budget';
import { designEmailKit, EMAIL_KIT_MAX_CREDITS, EMAIL_KIT_MODEL, type DesignInput } from '../src/store-emails/email-kit-designer';
import { validateEmailKit } from '../src/store-emails/email-kit-validate';
import { loadFloorKit } from '../src/store-emails/email-copy-defaults';
import { assembleWithinBudget } from '../src/store-emails/email-assemble';
import type { EmailContext } from '../src/store-emails/email-context';
import { resolveContent, resolveCopy, richReceiptCalls, type ReceiptData } from '../src/store-emails/email-recipes';
import { EMAIL_TYPES } from '../src/store-emails/email-kit-contract';

const STORES: (Omit<DesignInput, 'mode'> & { slug: string; modes: DesignInput['mode'][] })[] = [
  { slug: 'moda', storeName: 'Ñusta Atelier', brand: '{"personality":"editorial, minimal","accent":"#1f1f1f","background":"#f5f1ea"}', stylesheet: 'body{font-family:"Cormorant Garamond",serif;background:#f5f1ea;color:#1f1f1f}h1{font-size:64px;letter-spacing:-.02em}', homepage: '<h1>Lana de alpaca, cortada a mano</h1>', products: ['Abrigo de alpaca', 'Chompa trenzada'], modes: ['twin', 'bold'] },
  { slug: 'cafe', storeName: 'Café Illimani', brand: '{"personality":"cálido, artesanal","accent":"#c2410c","background":"#fff7ed"}', stylesheet: 'body{font-family:Georgia,serif;background:#fff7ed;color:#3b2a1a}.btn{background:#c2410c;color:#fff;border-radius:999px}', homepage: '<h1>Café de altura de los Yungas</h1>', products: ['Café de altura 250 g', 'Taza de cerámica'], modes: ['twin'] },
  { slug: 'salon', storeName: 'Estudio Tijera', brand: '{"personality":"moderno, cercano","accent":"#7c3aed"}', stylesheet: 'body{font-family:Inter,sans-serif;background:#fafafa;color:#18181b}.btn{background:#7c3aed;color:#fff}', homepage: '<h1>Reserva tu corte en dos minutos</h1>', products: ['Corte de cabello', 'Color'], modes: ['twin'] },
  { slug: 'tech', storeName: 'Pulso Tech', brand: '{"personality":"preciso, nocturno","accent":"#22d3ee","background":"#0b0f14","foreground":"#e5e7eb"}', stylesheet: 'body{font-family:"Space Grotesk",sans-serif;background:#0b0f14;color:#e5e7eb}', homepage: '<h1>Accesorios para tu setup</h1>', products: ['Cable USB-C trenzado', 'Soporte de aluminio'], modes: ['twin', 'bold'] },
  { slug: 'panaderia', storeName: 'Horno de Doña Elsa', brand: '{"personality":"familiar, tradicional","accent":"#a16207","background":"#fffbeb"}', stylesheet: 'body{font-family:"Trebuchet MS",sans-serif;background:#fffbeb;color:#422006}', homepage: '<h1>Pan de batalla recién salido del horno</h1>', products: ['Marraqueta', 'Empanada de queso'], modes: ['twin'] },
  { slug: 'yoga', storeName: 'Respira Yoga', brand: '{"personality":"sereno, luminoso","accent":"#15803d","background":"#f0fdf4"}', stylesheet: 'body{font-family:"Helvetica Neue",sans-serif;background:#f0fdf4;color:#14532d}', homepage: '<h1>Clases para empezar el día</h1>', products: ['Clase suelta', 'Pase mensual'], modes: ['twin'] },
];

const sample = (storeName: string, appointment: boolean): ReceiptData => ({
  storeName, customerName: 'Ana', orderId: 'pi_SYNTH001', total: 'Bs 150,00', originalTotal: null, trackingUrl: 'https://example.test/track/sample', subscription: null,
  appointment: appointment ? { name: 'Corte de cabello', date: '12/10/2026, 10:00' } : null,
  items: [{ name: 'Producto de ejemplo', variant: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00', image: null }, { name: 'Otro producto', variant: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00', image: null }],
});

/** The API's own env files, in its order (.env.local wins); values already in the environment win over both. */
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

/** Store facts for the examples, so every optional section shows; real receipts load them from the store. */
function exampleContext(storeName: string): EmailContext {
  const storeUrl = 'https://example.test';
  return { storeUrl, heroImage: null, nav: [{ label: 'Novedades', href: storeUrl }, { label: 'Colecciones', href: storeUrl }],
    socials: [{ icon: 'instagram', label: 'Instagram', href: 'https://instagram.com/example' }, { icon: 'tiktok', label: 'TikTok', href: 'https://tiktok.com/@example' }],
    address: 'Av. 6 de Agosto 123, La Paz', policies: [{ key: 'returns', label: 'Cambios y devoluciones', href: storeUrl }, { key: 'delivery', label: 'Envíos', href: storeUrl }],
    contact: { email: 'hola@example.test', phone: '+591 70000000', whatsapp: true }, delivers: true,
    review: { text: `Todo llegó perfecto, se nota el cariño de ${storeName}.`, author: 'Lucía', stars: 5 },
    promos: [{ id: 'example', code: 'VUELVE10', discount: '10% en tu próxima compra' }], recommendations: () => [] };
}

async function main() {
  if (!process.argv.includes('--i-accept-costs')) throw new Error('Each kit is a billed model run. Re-run with --i-accept-costs.');
  loadEnv();
  const out = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'email-kit-examples';
  await mkdir(out, { recursive: true });
  const config = new ConfigService({ app: configuration().app });
  const floor = await loadFloorKit();
  const cells: string[] = [];
  for (const store of STORES) for (const mode of store.modes) {
    const budget = new SourceRequestBudget(EMAIL_KIT_MAX_CREDITS);
    const { raw, usage } = await designEmailKit({ ...store, mode }, { provider: sourceProvider(config, EMAIL_KIT_MODEL), budget,
      // A failed run prints the provider's answer, so the cause is visible rather than a generic 502.
      record: async (body, _ms, status) => { if (status === 'FAILED') console.error(`${store.slug}/${mode} provider reply:`, JSON.stringify(body).slice(0, 1500)); } });
    const { kit, repairs, usable } = validateEmailKit(raw);
    console.log(`${store.slug}/${mode}: usable=${usable} usage=${JSON.stringify(usage)} repairs=${repairs.length}`);
    for (const repair of repairs) console.log(`  - ${repair}`);
    for (const type of EMAIL_TYPES) {
      const data = sample(store.storeName, type === 'appointment_confirmed');
      const copy = resolveCopy(type, kit.copy, {}, { cliente: 'Ana', tienda: store.storeName });
      const ctx = exampleContext(store.storeName);
      const delivery = type === 'appointment_confirmed' ? null : { method: 'delivery' as const, recipient: 'Ana Quispe', lines: ['Av. 6 de Agosto 123', 'La Paz'] };
      const calls = richReceiptCalls(type, { ...data, delivery }, copy, ctx, resolveContent(type, {}, ctx, copy, store.storeName, null));
      const { html } = assembleWithinBudget(usable ? kit : floor, floor, calls, { storeName: store.storeName, logoUrl: null, storeUrl: ctx.storeUrl,
        preheader: copy.preheader, unsubscribeUrl: null, marketing: false, nav: ctx.nav, socials: ctx.socials, address: ctx.address, policies: ctx.policies,
        iconBase: config.get<string>('app.publicAssetBaseUrl') ?? null });
      const file = `${store.slug}-${mode}-${type}.html`;
      await writeFile(join(out, file), html);
      cells.push(`<section><h2>${store.storeName} · ${mode} · ${type}</h2><iframe src="${file}" width="390" height="760"></iframe><iframe src="${file}" width="640" height="760"></iframe></section>`);
    }
  }
  await writeFile(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email kits</title><style>body{font-family:system-ui;margin:24px}section{margin:0 0 40px}iframe{border:1px solid #ddd;margin-right:16px;vertical-align:top}</style>${cells.join('')}`);
  console.log(`Open ${join(out, 'index.html')}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
