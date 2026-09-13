import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StoresService } from './stores.service';
import { publicImage, seoEscape as e, seoHead, seoPrice, sourceSeoCopy } from './store-seo';
@Injectable()
export class StoreSeoService {
  constructor(private readonly prisma: PrismaService, private readonly stores: StoresService, private readonly config: ConfigService) {}
  private apiBase() { return (process.env.PUBLIC_API_URL || `http://localhost:${this.config.get('app.port') || 3001}/v1`).replace(/\/$/, ''); }
  async context(slug: string) {
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false }, include: { customDomains: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 1 } } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const home = store.customDomains[0] ? `https://${store.customDomains[0].hostname}/` : `${this.config.get<string>('app.checkoutOrigin')!.replace(/\/$/, '')}/s/${encodeURIComponent(slug)}`;
    const productUrl = (id: string) => `${home.replace(/\/$/, '')}/p/${encodeURIComponent(id)}`;
    const pageUrl = (page: string) => page === 'index.html' ? home : `${home}?source_page=${encodeURIComponent(page)}`;
    const version = store.publishedSourceRevision ? await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId: store.id, revision: store.publishedSourceRevision } }, select: { snapshot: true, createdAt: true } }) : null;
    const files: Array<{ path: string; content: string }> = (version?.snapshot as any)?.files || [];
    const pages = files.filter(f => /^(?:pages\/)?[\w-]+\.html$/.test(f.path) && !['product.html', 'checkout.html'].includes(f.path)).map(f => ({ path: f.path, ...sourceSeoCopy(f.content) }));
    return { store, home, productUrl, pageUrl, pages, modified: version?.createdAt || store.updatedAt };
  }
  async document(slug: string, productId?: string, sourcePage?: string) {
    const c = await this.context(slug);
    const data = await this.stores.getStorePublic(slug, { trackView: false });
    const product = productId ? data.items.find(p => p.id === productId) : null;
    if (productId && !product) throw new NotFoundException('Producto no encontrado.');
    const page = c.pages.find(p => p.path === (sourcePage || 'index.html'));
    if (sourcePage && !page) throw new NotFoundException('Página no encontrada.');
    const canonical = product ? c.productUrl(product.id) : c.pageUrl(sourcePage || 'index.html');
    const description = String(product?.description || page?.description || c.store.tagline || `Conoce los productos y las novedades de ${c.store.name}.`).slice(0, 300);
    const title = product ? `${product.name} · ${c.store.name}` : page?.title || c.store.name;
    const image = publicImage(product?.imageUrls?.[0] || c.store.bannerUrl || c.store.logoUrl, this.apiBase());
    const graph: any[] = [
      { '@type': 'Organization', '@id': `${c.home}#business`, name: c.store.name, url: c.home, ...(c.store.logoUrl ? { logo: publicImage(c.store.logoUrl, this.apiBase()) } : {}) },
      { '@type': 'WebSite', '@id': `${c.home}#website`, name: c.store.name, url: c.home, publisher: { '@id': `${c.home}#business` } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: c.store.name, item: c.home }, ...(product || sourcePage ? [{ '@type': 'ListItem', position: 2, name: product?.name || title, item: canonical }] : [])] },
    ];
    if (product) {
      const variants = product.variants || [];
      const offers = variants.length ? { '@type': 'AggregateOffer', priceCurrency: product.currency, lowPrice: (Math.min(...variants.map(v => seoPrice({ ...product, amount: v.amount }))) / 100).toFixed(2), highPrice: (Math.max(...variants.map(v => seoPrice({ ...product, amount: v.amount }))) / 100).toFixed(2), offerCount: variants.length, url: canonical } : { '@type': 'Offer', url: canonical, price: (seoPrice(product) / 100).toFixed(2), priceCurrency: product.currency, availability: product.stock !== null && product.stock !== undefined && product.stock <= 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', seller: { '@id': `${c.home}#business` } };
      graph.push({ '@type': 'Product', '@id': `${canonical}#product`, name: product.name, description, image: product.imageUrls.map(url => publicImage(url, this.apiBase())).filter(Boolean), sku: product.id, offers });
    } else graph.push({ '@type': sourcePage ? 'WebPage' : 'CollectionPage', '@id': canonical, name: title, url: canonical, isPartOf: { '@id': `${c.home}#website` }, ...(!sourcePage ? { mainEntity: { '@type': 'ItemList', itemListElement: data.items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: c.productUrl(p.id) })) } } : {}) });
    const productHtml = (p: typeof data.items[number]) => `<article><h2><a href="${e(c.productUrl(p.id))}">${e(p.name)}</a></h2>${p.imageUrls[0] ? `<img src="${e(publicImage(p.imageUrls[0], this.apiBase()))}" alt="${e(p.name)}" width="320" height="320" loading="lazy">` : ''}<p>${e(p.description)}</p><p>${e(p.currency)} ${(seoPrice(p) / 100).toFixed(2)}${p.stock === 0 ? ' · Agotado' : ''}</p></article>`;
    const body = `<main data-pagosya-seo><header><a href="${e(c.home)}">${e(c.store.name)}</a></header><h1>${e(product?.name || page?.blocks.find(b => b.tag === 'h1')?.text || title)}</h1><p>${e(description)}</p>${product ? productHtml(product) : `${(page?.blocks || []).filter(b => b.tag !== 'h1').map(b => `<${b.tag === 'li' ? 'p' : b.tag}>${e(b.text)}</${b.tag === 'li' ? 'p' : b.tag}>`).join('')}${!sourcePage ? `<section aria-label="Productos">${data.items.map(productHtml).join('')}</section>` : ''}`}<nav aria-label="Páginas de la tienda">${c.pages.filter(p => p.path !== (sourcePage || 'index.html')).map(p => `<a href="${e(c.pageUrl(p.path))}">${e(p.title || p.path)}</a>`).join(' ')}</nav></main>`;
    return { title, canonical, noindex: Boolean(!product && page?.noindex), head: seoHead({ title, description, canonical, image, graph, kind: product ? 'product' : 'website', noindex: !product && page?.noindex }), body, home: c.home };
  }
  async map(slug: string) {
    const c = await this.context(slug);
    const products = await this.prisma.paymentLink.findMany({ where: { storeId: c.store.id, status: 'ACTIVE' }, select: { id: true, name: true, updatedAt: true }, orderBy: { id: 'asc' } });
    return { ...c, products, entries: [...(c.pages.find(p => p.path === 'index.html')?.noindex ? [] : [{ url: c.home, updatedAt: c.modified }]), ...products.map(p => ({ url: c.productUrl(p.id), updatedAt: p.updatedAt })), ...c.pages.filter(p => p.path !== 'index.html' && !p.noindex).map(p => ({ url: c.pageUrl(p.path), updatedAt: c.modified }))] };
  }
  async sitemap(slug: string, part?: number) {
    const c = await this.map(slug); const chunks = Math.ceil(c.entries.length / 10000);
    if (part === undefined && chunks > 1) return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: chunks }, (_, i) => `<sitemap><loc>${e(c.home.replace(/\/$/, '') + '/sitemap.xml?part=' + (i + 1))}</loc></sitemap>`).join('')}</sitemapindex>`;
    if (part !== undefined && (!Number.isInteger(part) || part < 1 || part > chunks)) throw new NotFoundException();
    const entries = c.entries.slice(((part || 1) - 1) * 10000, (part || 1) * 10000);
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${e(entry.url)}</loc><lastmod>${entry.updatedAt.toISOString()}</lastmod></url>`).join('')}</urlset>`;
  }
  async llms(slug: string) {
    const c = await this.map(slug);
    const text = (value: string) => value.replace(/[\r\n\[\]<>]/g, ' ').trim();
    return `# ${text(c.store.name)}\n\n> ${text(c.store.tagline || 'Catálogo y sitio oficial del negocio.')}\n\n## Sitio oficial\n\n- [Inicio](${c.home})\n- [Mapa del sitio](${c.home.replace(/\/$/, '')}/sitemap.xml)\n\n## Páginas\n\n${c.pages.filter(p => p.path !== 'index.html' && !p.noindex).map(p => `- [${text(p.title || p.path)}](${c.pageUrl(p.path)})`).join('\n')}\n\n## Productos\n\n${c.products.map(p => `- [${text(p.name)}](${c.productUrl(p.id)})`).join('\n')}\n\nLos precios y la disponibilidad vigentes se consultan en cada página de producto. Este archivo describe contenido público; no incluye pedidos, clientes ni enlaces privados.\n`;
  }
  async directory() {
    const stores = await this.prisma.store.findMany({ where: { status: 'ACTIVE', sourcePublicationPaused: false }, select: { slug: true, name: true, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1, orderBy: { createdAt: 'asc' } } }, orderBy: { slug: 'asc' } });
    // Custom domains publish their own root sitemap; shared-host maps stay on their host.
    const origin = this.config.get<string>('app.checkoutOrigin')!.replace(/\/$/, '');
    return stores.filter(s => !s.customDomains.length).map(s => ({ name: s.name, home: `${origin}/s/${encodeURIComponent(s.slug)}`, sitemap: `${origin}/s/${encodeURIComponent(s.slug)}/sitemap.xml` }));
  }
}
