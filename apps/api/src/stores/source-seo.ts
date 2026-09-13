import type { SourceProjectSnapshot } from './source-project';
import { seoEscape as e, seoHead, sourceSeoCopy } from './store-seo';
/** Keep every new export self-describing. Canonicals point to the configured public store. */
export function withSourceSeo(snapshot: SourceProjectSnapshot): SourceProjectSnapshot {
  const configFile = snapshot.files.find(f => f.path === 'config.js');
  const match = configFile?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([^]*?);?\s*$/);
  if (!match) return snapshot;
  let config: any; try { config = JSON.parse(match[1]); } catch { return snapshot; }
  if (!config.slug || !config.checkoutOrigin) return snapshot;
  let base: URL; try { base = new URL(config.publicSiteUrl || `/s/${encodeURIComponent(config.slug)}`, config.checkoutOrigin); } catch { return snapshot; }
  if (!['https:', 'http:'].includes(base.protocol)) return snapshot;
  const home = base.href; const name = config.data?.storeName || config.slug;
  const pages = snapshot.files.filter(f => f.path.endsWith('.html') && !['product.html', 'checkout.html'].includes(f.path) && !sourceSeoCopy(f.content).noindex);
  const pageUrl = (path: string) => path === 'index.html' ? home : `${home}?source_page=${encodeURIComponent(path)}`;
  const products: Array<{ id: string; name: string }> = Array.isArray(config.data?.items) ? config.data.items : [];
  const urls = [...pages.map(f => pageUrl(f.path)), ...products.map(p => `${home.replace(/\/$/, '')}/p/${encodeURIComponent(p.id)}`)];
  const metadata = ['robots.txt', 'sitemap.xml', 'llms.txt'];
  const files = snapshot.files.filter(f => !metadata.includes(f.path)).map(file => {
    if (!file.path.endsWith('.html')) return file;
    const copy = sourceSeoCopy(file.content);
    // Product metadata is personalized by the live runtime; checkout never enters search.
    const privatePage = file.path === 'checkout.html';
    const canonical = file.path === 'product.html' || privatePage ? home : pageUrl(file.path);
    const head = seoHead({ title: copy.title || name, description: copy.description || config.data?.tagline || name, canonical, graph: [], noindex: privatePage || copy.noindex });
    let content = file.content.replace(/<script\b[^>]*data-pagosya-seo[^>]*>[^]*?<\/script>/gi, '').replace(/<title\b[^>]*>[^]*?<\/title>/gi, '').replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
    content = content.replace(/<\/head>/i, () => head + '</head>');
    return { ...file, content };
  });
  files.push(
    { path: 'robots.txt', encoding: 'utf8', content: `User-agent: *\nAllow: /\nDisallow: /checkout.html\nDisallow: /*?*recover=\nDisallow: /*?*comeback=\nDisallow: /*?*unsubscribe=\nSitemap: ${home.replace(/\/$/, '')}/sitemap.xml\n` },
    { path: 'sitemap.xml', encoding: 'utf8', content: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${e(url)}</loc></url>`).join('')}</urlset>` },
    { path: 'llms.txt', encoding: 'utf8', content: `# ${String(name).replace(/[\r\n]/g, ' ')}\n\n> Sitio oficial y catálogo público.\n\n## Páginas\n\n${pages.map(f => `- [${sourceSeoCopy(f.content).title.replace(/[\r\n\[\]]/g, ' ') || f.path}](${pageUrl(f.path)})`).join('\n')}\n\n## Productos\n\n${products.map(p => `- [${String(p.name).replace(/[\r\n\[\]]/g, ' ')}](${home.replace(/\/$/, '')}/p/${encodeURIComponent(p.id)})`).join('\n')}\n\nConsulta precios y disponibilidad actualizados en el sitio oficial.\n` },
  );
  return { ...snapshot, files };
}
