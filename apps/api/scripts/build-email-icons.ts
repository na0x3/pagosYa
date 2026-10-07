// Renders the email icon set to PNG (Gmail strips SVG). Run: cd apps/api && npx ts-node --transpile-only scripts/build-email-icons.ts
// UI icons: Lucide (ISC, see kit/icons/LICENSE.txt). Brand icons: Simple Icons (CC0).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import * as simple from 'simple-icons';
import { kitPath } from '@pagosya/storefront-kit';

const LUCIDE: Record<string, string> = { lock: 'lock', return: 'rotate-ccw', truck: 'truck', store: 'store', chat: 'message-circle', check: 'check', box: 'package', calendar: 'calendar', mail: 'mail', phone: 'phone', pin: 'map-pin', star: 'star' };
const BRANDS: Record<string, string> = { whatsapp: 'siWhatsapp', instagram: 'siInstagram', tiktok: 'siTiktok', facebook: 'siFacebook', x: 'siX', youtube: 'siYoutube' };
const TONES = { dark: '#18181b', light: '#ffffff' } as const;
const lucideDir = join(require.resolve('lucide-static/package.json'), '..', 'icons');

async function svgFor(name: string, colour: string): Promise<string> {
  if (LUCIDE[name]) return (await readFile(join(lucideDir, `${LUCIDE[name]}.svg`), 'utf8')).replace(/stroke="currentColor"/g, `stroke="${colour}"`);
  const icon = (simple as unknown as Record<string, { path: string }>)[BRANDS[name]];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${colour}" d="${icon.path}"/></svg>`;
}

async function main() {
  const out = kitPath('emails', 'icons');
  await mkdir(out, { recursive: true });
  for (const name of [...Object.keys(LUCIDE), ...Object.keys(BRANDS)]) for (const [tone, colour] of Object.entries(TONES)) {
    const png = await sharp(Buffer.from(await svgFor(name, colour)), { density: 384 })
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await writeFile(join(out, `${name}-${tone}.png`), png);
  }
  console.log('email icons written to', out);
}
void main();
