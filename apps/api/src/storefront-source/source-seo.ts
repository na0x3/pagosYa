import type { SourceProjectSnapshot } from './source-project';
import { seoEscape as e, seoHead, sourcePageUrl, sourceSeoCopy } from '../store-seo/store-seo';
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
  // coleccion.html is parameterized like product.html (one file, many collections via ?c=): its
  // real URL depends on which collection a visit is for, so it gets no single sitemap entry and
  // its own baked <link rel=canonical> stays a neutral `home` fallback (see canonical below);
  // the real value is only known and set at runtime. productos.html, unlike those two, has one
  // stable URL — it is an ordinary page whose pretty pageUrl below IS its real, final canonical,
  // so its sitemap/llms.txt entry and its baked canonical agree with each other (and with the
  // pretty URL the runtime independently sets in commerce.js).
  const pages = snapshot.files.filter(f => f.path.endsWith('.html') && !['product.html', 'checkout.html', 'coleccion.html', '404.html'].includes(f.path) && !sourceSeoCopy(f.content).noindex);
  const pageUrl = (path: string) => sourcePageUrl(home, path);
  const products: Array<{ id: string; name: string }> = Array.isArray(config.data?.items) ? config.data.items : [];
  const urls = [...pages.map(f => pageUrl(f.path)), ...products.map(p => `${home.replace(/\/$/, '')}/p/${encodeURIComponent(p.id)}`)];
  const metadata = ['robots.txt', 'sitemap.xml', 'llms.txt'];
  const files = snapshot.files.filter(f => !metadata.includes(f.path)).map(file => {
    if (!file.path.endsWith('.html')) return file;
    const copy = sourceSeoCopy(file.content);
    // product.html/coleccion.html are parameterized (one file, many products/collections): the
    // real value commerce.js sets at runtime is the only correct canonical, so their static
    // fallback here is neutral `home`, never a guess. checkout never enters search. productos.html
    // has one fixed meaning, so pageUrl(file.path) below already IS its real canonical — no
    // fallback needed, and it agrees with both the sitemap entry above and the runtime value.
    const privatePage = file.path === 'checkout.html' || file.path === '404.html';
    const runtimeFallbackPage = ['product.html', 'coleccion.html'].includes(file.path);
    const canonical = runtimeFallbackPage || privatePage ? home : pageUrl(file.path);
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
