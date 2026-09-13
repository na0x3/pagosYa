import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const pathValid = (value: string) => /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*)?$/.test(value) && value.length <= 200;
@Injectable()
export class StorePagesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private base(slug: string) { return `${(process.env.PUBLIC_API_URL || `http://localhost:${this.config.get<number>('app.port') || 3001}/v1`).replace(/\/$/, '')}/stores/public/${encodeURIComponent(slug)}`; }
  private home(slug: string) { return `${this.config.get<string>('app.checkoutOrigin')!.replace(/\/$/, '')}/s/${encodeURIComponent(slug)}`; }
  private async store(slug: string) { const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false }, include: { brandProfile: true } }); if (!store) throw new NotFoundException(); return store; }
  private async owner(merchantId: string, storeId: string) { if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId } })) throw new NotFoundException(); }
  async redirects(merchantId: string, storeId: string) { await this.owner(merchantId, storeId); return this.prisma.storeRedirect.findMany({ where: { storeId }, orderBy: { fromPath: 'asc' }, take: 500 }); }
  async saveRedirect(merchantId: string, storeId: string, fromPath: string, toPath: string) {
    await this.owner(merchantId, storeId);
    if (!pathValid(fromPath) || !pathValid(toPath) || fromPath === '/' || fromPath === toPath) throw new BadRequestException('Usa rutas internas diferentes, por ejemplo /es/articulo-anterior y /es/articulo-nuevo.');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
      const all = await tx.storeRedirect.findMany({ where: { storeId } });
      if (all.length >= 500 && !all.some(item => item.fromPath === fromPath)) throw new BadRequestException('Se alcanzó el límite de 500 redirecciones.');
      const graph = new Map(all.map(row => [row.fromPath, row.toPath])); graph.set(fromPath, toPath);
      for (const first of graph.keys()) { const seen = new Set<string>(); let cursor = first; while (graph.has(cursor)) { if (seen.has(cursor) || seen.size >= 20) throw new BadRequestException('La redirección crea un ciclo o una cadena demasiado larga.'); seen.add(cursor); cursor = graph.get(cursor)!; } }
      return tx.storeRedirect.upsert({ where: { storeId_fromPath: { storeId, fromPath } }, create: { storeId, fromPath, toPath }, update: { toPath } });
    });
  }
  async deleteRedirect(merchantId: string, storeId: string, id: string) { await this.owner(merchantId, storeId); if (!(await this.prisma.storeRedirect.deleteMany({ where: { id, storeId } })).count) throw new NotFoundException(); return { deleted: true }; }
  async page(slug: string, path: string) {
    const store = await this.store(slug); const base = this.base(slug);
    if (!pathValid(path)) throw new NotFoundException();
    const redirect = await this.prisma.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId: store.id, fromPath: path } } });
    if (redirect) return { location: redirect.toPath === '/' ? `${base}/pages` : `${base}/pages${redirect.toPath}` };
    const [locale, articleSlug, extra] = path.slice(1).split('/');
    if (extra || !locale || !articleSlug) throw new NotFoundException();
    const article = await this.prisma.storeArticle.findFirst({ where: { storeId: store.id, locale, slug: articleSlug, publishedAt: { lte: new Date() } } });
    if (!article) throw new NotFoundException();
    const translations = await this.prisma.storeArticle.findMany({ where: { storeId: store.id, slug: article.slug, publishedAt: { lte: new Date() } }, select: { locale: true } });
    const url = `${base}/pages/${article.locale}/${article.slug}`;
    const alternates = translations.map(row => `<link rel="alternate" hreflang="${xml(row.locale)}" href="${xml(`${base}/pages/${row.locale}/${article.slug}`)}">`).join('');
    const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title, description: article.excerpt, datePublished: article.publishedAt!.toISOString(), dateModified: article.updatedAt.toISOString(), inLanguage: article.locale, author: { '@type': 'Person', name: article.author }, mainEntityOfPage: url }).replace(/</g, '\\u003c');
    return { html: this.document(store.name, article.title, article.locale, url, `<article><h1>${xml(article.title)}</h1><p class="meta">${xml(article.author)} · <time datetime="${article.publishedAt!.toISOString()}">${article.publishedAt!.toISOString().slice(0, 10)}</time></p>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${xml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}</article><p><a href="${xml(base)}/pages">Todos los artículos</a></p>`, slug, article.excerpt, `${this.brandHead(store.brandProfile?.data)}${alternates}<script type="application/ld+json">${structured}</script>`) };
  }
  private brandHead(data: unknown) {
    const confirmed = (data as { confirmed?: Array<{ field: string; value: string }> } | null)?.confirmed;
    if (!Array.isArray(confirmed)) return '';
    const facts = Object.fromEntries(confirmed.map(fact => [fact.field, fact.value]));
    const rules: string[] = []; const faces: string[] = [];
    for (const [field, role] of [['background', 'bg'], ['foreground', 'fg']]) if (/^#[a-f0-9]{6}$/i.test(facts[field] || '')) rules.push(`--article-${role}:${facts[field]}`);
    for (const [field, role] of [['headingFontUrl', 'heading'], ['bodyFontUrl', 'body']]) if (/^\/v1\/uploads\/[a-f0-9-]{36}\.woff2$/.test(facts[field] || '')) {
      rules.push(`--article-${role}:'Article ${role}',sans-serif`);
      faces.push(`@font-face{font-family:'Article ${role}';src:url('${facts[field]}') format('woff2');font-display:swap}`);
    }
    return `<style>:root{${rules.join(';')}}${faces.join('')}</style>`;
  }
  private document(store: string, title: string, locale: string, url: string, content: string, slug: string, description = '', head = '') {
    return `<!doctype html><html lang="${xml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xml(title)} — ${xml(store)}</title><meta name="description" content="${xml(description)}"><meta property="og:title" content="${xml(title)}"><meta property="og:description" content="${xml(description)}"><meta property="og:url" content="${xml(url)}"><meta property="og:type" content="article"><link rel="canonical" href="${xml(url)}"><link rel="alternate" type="application/rss+xml" title="${xml(store)}" href="${xml(this.base(slug))}/rss.xml">${head}<style>body{margin:0;background:var(--article-bg,#fff);color:var(--article-fg,#202124);font:18px/1.7 var(--article-body,system-ui,sans-serif)}header,main,footer{max-width:70ch;margin:auto;padding:24px}header{border-bottom:1px solid #ddd}main{padding-block:48px}h1,h2{font-family:var(--article-heading,inherit)}h1{font-size:clamp(32px,5vw,48px);line-height:1.15;letter-spacing:-.02em;text-wrap:balance}h2{font-size:26px;line-height:1.3}p{overflow-wrap:anywhere}a{color:var(--article-fg,#164994);text-underline-offset:4px}a:focus-visible{outline:3px solid #164994;outline-offset:4px}.meta{font-size:15px;color:var(--article-fg,#505050)}article+article{margin-top:48px}nav{display:flex;gap:24px;flex-wrap:wrap}</style></head><body><header><a href="${xml(this.home(slug))}">${xml(store)}</a></header><main>${content}</main><footer><a href="${xml(this.home(slug))}">Volver a la tienda</a></footer></body></html>`;
  }
  async archive(slug: string, page = 1) {
    const store = await this.store(slug); if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new BadRequestException('Página no válida.');
    const articles = await this.prisma.storeArticle.findMany({ where: { storeId: store.id, publishedAt: { lte: new Date() } }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 51 });
    const base = this.base(slug); const content = `<h1>Artículos de ${xml(store.name)}</h1>${articles.slice(0, 50).map(article => `<article lang="${xml(article.locale)}"><h2><a href="${xml(base)}/pages/${xml(article.locale)}/${xml(article.slug)}">${xml(article.title)}</a></h2><p>${xml(article.excerpt)}</p></article>`).join('') || '<p>Aún no hay artículos publicados.</p>'}<nav>${page > 1 ? `<a rel="prev" href="${base}/pages?page=${page - 1}">Anteriores</a>` : ''}${articles.length > 50 ? `<a rel="next" href="${base}/pages?page=${page + 1}">Siguientes</a>` : ''}</nav>`;
    return this.document(store.name, 'Artículos', 'es', `${base}/pages${page > 1 ? `?page=${page}` : ''}`, content, slug, '', this.brandHead(store.brandProfile?.data));
  }
  async feed(slug: string) {
    const store = await this.store(slug), base = this.base(slug);
    const articles = await this.prisma.storeArticle.findMany({ where: { storeId: store.id, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: 'desc' }, take: 100 });
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(store.name)}</title><link>${xml(base)}/pages</link><description>Artículos de ${xml(store.name)}</description>${articles.map(a => `<item><title>${xml(a.title)}</title><link>${xml(base)}/pages/${xml(a.locale)}/${xml(a.slug)}</link><guid isPermaLink="true">${xml(base)}/pages/${xml(a.locale)}/${xml(a.slug)}</guid><description>${xml(a.excerpt)}</description><pubDate>${a.publishedAt!.toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  }
  async sitemap(slug: string) {
    const store = await this.store(slug), base = this.base(slug);
    const articles = await this.prisma.storeArticle.findMany({ where: { storeId: store.id, publishedAt: { lte: new Date() } }, select: { slug: true, locale: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 49000 });
    // Sitemap URLs share this API host; storefront host maps belong in its own sitemap.
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${xml(base)}/pages</loc></url>${articles.map(a => `<url><loc>${xml(base)}/pages/${xml(a.locale)}/${xml(a.slug)}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod></url>`).join('')}</urlset>`;
  }
}
