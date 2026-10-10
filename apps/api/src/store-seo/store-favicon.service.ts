import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_STORE_WHERE } from '../stores/active-store';
import { SOURCE_DESIGN_FILE } from '../storefront-source/source-design';
import { UploadsService } from '../uploads/uploads.service';
import { faviconPng, wordmarkSvg } from './store-favicon';
import { DEFAULT_IDENTITY, storeIdentity, type StoreIdentity } from './store-identity';

const CACHE_LIMIT = 500;
const UPLOADED_LOGO = /^\/v1\/uploads\/([a-f0-9-]+\.(?:png|jpe?g|webp|gif))$/i;
type FaviconStore = { id: string; name: string; logoUrl: string | null; publishedSourceRevision: number | null };

/** Every store's tab icon and drawn wordmark (spec 2026-10-10 part A). Unknown slugs 404; nothing else fails. */
@Injectable()
export class StoreFaviconService {
  private readonly logger = new Logger(StoreFaviconService.name);
  private readonly cache = new Map<string, Buffer>();
  private readonly warned = new Set<string>();
  constructor(private readonly prisma: PrismaService, private readonly uploads: UploadsService) {}

  async favicon(slug: string, size: number) {
    const store = await this.store(slug);
    const key = `${this.key(store)}|png|${size}`;
    const body = await this.remember(key, async () => faviconPng({ logo: await this.logo(store.logoUrl, key), name: store.name, identity: await this.identity(store), size }));
    return { body, etag: etagOf(key) };
  }

  async logoSvg(slug: string) {
    const store = await this.store(slug);
    const key = `${this.key(store)}|svg`;
    const body = await this.remember(key, async () => Buffer.from(wordmarkSvg(store.name, await this.identity(store))));
    return { body, etag: etagOf(key) };
  }

  private key(store: FaviconStore) { return `${store.id}|${store.logoUrl ?? ''}|${store.publishedSourceRevision ?? 0}`; }

  private async store(slug: string): Promise<FaviconStore> {
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, name: true, logoUrl: true, publishedSourceRevision: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return store;
  }

  /** Only the design file and stylesheets of the published revision; never the bundled images. */
  private async identity(store: FaviconStore): Promise<StoreIdentity> {
    if (!store.publishedSourceRevision) return DEFAULT_IDENTITY;
    try {
      const files = await this.prisma.$queryRaw<Array<{ path: string; content: string }>>(Prisma.sql`
        SELECT f->>'path' AS path, f->>'content' AS content
        FROM "StoreSourceVersion" v, LATERAL jsonb_array_elements(v.snapshot->'files') f
        WHERE v."storeId" = ${store.id} AND v.revision = ${store.publishedSourceRevision}
          AND (f->>'path' = ${SOURCE_DESIGN_FILE} OR (f->>'path' LIKE '%.css' AND COALESCE(f->>'encoding', 'utf8') <> 'base64'))`);
      return storeIdentity(files);
    } catch (error) { this.warnOnce(`${store.id}|identity`, error); return DEFAULT_IDENTITY; }
  }

  private async logo(url: string | null, key: string): Promise<Buffer | null> {
    const filename = url?.match(UPLOADED_LOGO)?.[1];
    if (!filename) return null;
    try { return await this.uploads.getBuffer(filename); } catch (error) { this.warnOnce(key, error); return null; }
  }

  private async remember(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }
    const value = await make();
    this.cache.set(key, value);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private warnOnce(key: string, error: unknown) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.logger.warn(`favicon fallback for ${key}: ${(error as Error)?.message ?? error}`);
  }
}

export const etagOf = (key: string) => `"${createHash('sha1').update(key).digest('hex').slice(0, 16)}"`;
