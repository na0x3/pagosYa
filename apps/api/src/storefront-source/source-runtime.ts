import { ConflictException } from '@nestjs/common';
import { withCommerceTemplates } from './commerce-surfaces/surface-inject';
import { createHash } from 'node:crypto';
import { withSourceSeo } from './source-seo';
import { readFile } from 'node:fs/promises';
import { sourceMotionMode, withSourceMotion } from './source-motion';
import type { SourceProjectSnapshot } from './source-project';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { withSourceCommerceDesign } from './source-commerce-design';
import { withSourceFonts } from './source-fonts';
import { withSourceAssets } from './source-asset-library';
import { applySourceLayoutBaseline } from './source-layout-baseline';
import { kitPath } from '@pagosya/storefront-kit';

// Include the template used to recognize stock commerce shells and all appended scripts.
// chat.js (2026-10) is optional in verification so bundles pinned before it still load.
const RUNTIME_PATHS = ['privacy.js', 'commerce.js', 'retention.js', 'chat.js', 'productos.html', 'coleccion.html', 'video.js', 'motion.js', 'product.html'].sort();
const OPTIONAL_RUNTIME_PATHS = ['chat.js'];
export type SourceRuntimeFiles = { path: string; content: string }[];
export type TrustedSourceRuntimeBundle = { digest: string; files: SourceRuntimeFiles };

export function sourceRuntimeBundleDigest(files: SourceRuntimeFiles) {
  const canonical = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, content }) => ({ path, content }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function currentSourceRuntimeBundle(): Promise<TrustedSourceRuntimeBundle> {
  const files = await Promise.all(RUNTIME_PATHS.map(async path => ({ path, content: await readFile(kitPath(path), 'utf8') })));
  return { digest: sourceRuntimeBundleDigest(files), files };
}

/** Previews always use the installed kit; saved revisions remain untouched. */
export async function currentSourceRuntime(snapshot: SourceProjectSnapshot): Promise<SourceProjectSnapshot> {
  return withSourceRuntime(snapshot, await currentSourceRuntimeBundle());
}

export async function withSourceRuntime(snapshot: SourceProjectSnapshot, bundle: TrustedSourceRuntimeBundle): Promise<SourceProjectSnapshot> {
  const required = RUNTIME_PATHS.filter(path => !OPTIONAL_RUNTIME_PATHS.includes(path));
  const once = (path: string) => bundle.files.filter(file => file?.path === path && typeof file.content === 'string').length === 1;
  if (!Array.isArray(bundle.files) || !required.every(once) ||
    bundle.files.some(file => !RUNTIME_PATHS.includes(file?.path)) ||
    OPTIONAL_RUNTIME_PATHS.some(path => bundle.files.filter(file => file?.path === path).length > 1) ||
    sourceRuntimeBundleDigest(bundle.files) !== bundle.digest) {
    throw new ConflictException('No se pudo verificar el runtime publicado.');
  }
  const content = (path: string) => bundle.files.find(file => file.path === path)?.content ?? '';
  const commerce = ['privacy.js', 'commerce.js', 'retention.js', 'chat.js'].map(content).join('\n');
  const prepared = applySourceLayoutBaseline(await withSourceFonts(await withSourceAssets(snapshot.files, snapshot.files)));
  if (!prepared.some(f => f.path === 'commerce.js') || !prepared.some(f => f.path === 'config.js')) return { ...snapshot, files: prepared.map(f => ({ ...f, encoding: f.encoding || 'utf8' })) };
  const substituted = prepared.map(f => {
    if (f.path === 'commerce.js') return { ...f, content: commerce };
    if (f.path !== 'config.js') return f;
    const match = f.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return f;
    const config = JSON.parse(match[1]);
    return { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, ...sourceCommerceRoutes(snapshot.files, config) })};` };
  });
  // Existing stores never regenerate: ship the products/collection pages onto every snapshot that
  // already has commerce.js so the arrangement's catalog and tab links never 404 on a store
  // published before this kit existed.
  const catalogPages = ['productos.html', 'coleccion.html']
    .filter(path => !substituted.some(f => f.path === path))
    .map(path => ({ path, encoding: 'utf8' as const, content: content(path) }));
  const files = await withSourceMotion(await withSourceCommerceDesign([...substituted, ...catalogPages], content('product.html')), sourceMotionMode(snapshot.files), ['video.js', 'motion.js'].map(content).join('\n'));
  // Spec 2026-10-15 free commerce surfaces: the store's commerce templates reach every served page, the kit pages included.
  return withSourceSeo({ ...snapshot, files: withCommerceTemplates(files.map(f => ({ ...f, encoding: f.encoding || 'utf8' }))) });
}
