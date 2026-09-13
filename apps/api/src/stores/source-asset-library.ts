import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceImageUse } from './source-setup';
import { withCreativeAssets } from './source-creative-assets';

export const SOURCE_ASSET_MANIFEST = 'visual-assets.json';
export const SOURCE_ASSET_ROLES = ['logo', 'product', 'business', 'background', 'team', 'reference', 'unknown', 'unused'] as const;
export type SourceAssetRole = typeof SOURCE_ASSET_ROLES[number];
export type SourceAsset = { path: string; role: SourceAssetRole; description: string; references: string[]; kind: 'image' | 'icon' | 'video'; bytes: number };
const media = /^assets\/.*\.(png|jpe?g|webp|avif|gif|svg|mp4)$/i;
export const SOURCE_ICON_NAMES = ['shopping-bag', 'shopping-cart', 'arrow-right', 'arrow-left', 'chevron-down', 'chevron-right', 'check', 'x', 'plus', 'minus', 'search', 'menu', 'map-pin', 'clock', 'phone', 'mail', 'truck', 'package', 'heart', 'shield-check', 'credit-card', 'calendar', 'utensils', 'coffee'];
export const SOURCE_ICON_DIRECTION = `Bundled Lucide icons are available at assets/icons/NAME.svg: ${SOURCE_ICON_NAMES.join(', ')}. Use these exact local paths in img elements or CSS masks (mask-image:url(...) and background:currentColor for tinting). No imports or CDN. Supplied .mp4 files are real video assets: embed their exact bundled paths with HTML video or React video, never img or CSS background-image. Use controls and playsinline for content videos; only decorative backgrounds may autoplay with muted, loop, playsinline, a static fallback and reduced-motion handling. Do not invent unseen video content or generate a replacement drawing. Keep icons at a consistent optical size, with visible text labels for actions and empty alt for decorative icons. Only referenced icons and their license are bundled. visual-assets.json records merchant-confirmed media roles: reference/unused assets must not become storefront content. Do not author or replace this platform-owned manifest.`;

export function sourceAssetInventory(files: SourceProjectFileDto[]): SourceAsset[] {
  let saved: Array<{ path: string; role: SourceAssetRole; description: string }> = [];
  try { const value = JSON.parse(files.find(f => f.path === SOURCE_ASSET_MANIFEST)?.content || '{}'); if (Array.isArray(value.assets)) saved = value.assets; } catch {}
  const authored = files.filter(f => /\.(html|css|tsx|jsx)$/.test(f.path));
  return files.filter(f => media.test(f.path)).map(file => {
    const entry = saved.find(a => a && a.path === file.path);
    return { path: file.path, role: entry && SOURCE_ASSET_ROLES.includes(entry.role) ? entry.role : 'unknown',
      description: typeof entry?.description === 'string' ? entry.description.slice(0, 500) : '',
      kind: file.path.startsWith('assets/icons/') ? 'icon' : /\.mp4$/i.test(file.path) ? 'video' : 'image', bytes: Buffer.byteLength(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'),
      references: authored.filter(f => f.content.includes(file.path)).map(f => f.path) };
  });
}

export async function withSourceAssets(files: SourceProjectFileDto[], previous: SourceProjectFileDto[] = [], legend: Array<{ original: string; path: string }> = [], uses: SourceImageUse[] = []) {
  const result = withCreativeAssets(files.filter(f => f.path !== SOURCE_ASSET_MANIFEST));
  const source = files.filter(f => /\.(css|html|tsx|jsx)$/.test(f.path)).map(f => f.content).join('\n');
  for (const name of SOURCE_ICON_NAMES) {
    const path = `assets/icons/${name}.svg`;
    if (source.includes(path) && !result.some(f => f.path === path)) result.push({ path, content: await readFile(join(__dirname, 'source-kit/icons', `${name}.svg`), 'utf8') });
  }
  if (result.some(f => f.path.startsWith('assets/icons/')) && !result.some(f => f.path === 'assets/icons/LICENSE.txt')) result.push({ path: 'assets/icons/LICENSE.txt', content: await readFile(join(__dirname, 'source-kit/icons/LICENSE.txt'), 'utf8') });
  const remembered = sourceAssetInventory(previous);
  const assets = sourceAssetInventory(result).filter(a => a.kind !== 'icon').map(asset => {
    const use = uses.find(u => legend.some(l => l.path === asset.path && l.original === u.url));
    const old = remembered.find(a => a.path === asset.path);
    return { path: asset.path, role: use?.role || old?.role || 'unknown', description: (use?.description || old?.description || '').slice(0, 500) };
  });
  result.push({ path: SOURCE_ASSET_MANIFEST, content: JSON.stringify({ version: 1, assets }, null, 2) + '\n' });
  return result;
}
