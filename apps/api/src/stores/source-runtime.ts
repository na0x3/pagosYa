import { withSourceSeo } from './source-seo';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sourceMotionMode, withSourceMotion } from './source-motion';
import type { SourceProjectSnapshot } from './source-project';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { withSourceCommerceDesign } from './source-commerce-design';
import { withSourceFonts } from './source-fonts';
import { withSourceAssets } from './source-asset-library';
import { applySourceLayoutBaseline } from './source-layout-baseline';

/** Editor and hosted pages use the same commerce renderer without rewriting saved history. */
export async function currentSourceRuntime(snapshot: SourceProjectSnapshot): Promise<SourceProjectSnapshot> {
  const commerce = await readFile(join(__dirname, 'source-kit', 'privacy.js'), 'utf8') + '\n' + await readFile(join(__dirname, 'source-kit', 'commerce.js'), 'utf8') + '\n' + await readFile(join(__dirname, 'source-kit', 'retention.js'), 'utf8');
  const prepared = applySourceLayoutBaseline(await withSourceFonts(await withSourceAssets(snapshot.files, snapshot.files)));
  if (!prepared.some(f => f.path === 'commerce.js') || !prepared.some(f => f.path === 'config.js')) return { ...snapshot, files: prepared.map(f => ({ ...f, encoding: f.encoding || 'utf8' })) };
  const files = await withSourceMotion(await withSourceCommerceDesign(prepared.map(f => {
    if (f.path === 'commerce.js') return { ...f, content: commerce };
    if (f.path !== 'config.js') return f;
    const match = f.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return f;
    const config = JSON.parse(match[1]);
    return { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, ...sourceCommerceRoutes(snapshot.files, config) })};` };
  })), sourceMotionMode(snapshot.files));
  return withSourceSeo({ ...snapshot, files: files.map(f => ({ ...f, encoding: f.encoding || 'utf8' })) });
}
