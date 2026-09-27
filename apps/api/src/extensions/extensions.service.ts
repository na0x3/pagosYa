import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, StoreExtension } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GUIDES } from './catalog/guides';
import { CATEGORY_LABELS, type ExtensionManifest } from './extension';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from './registry';
import { SecretBox, SecretBoxError } from './secret-box';
import { isConfigured, readSettings, validateInput } from './settings';

type Row = Pick<StoreExtension, 'extensionId' | 'enabled' | 'settings' | 'secrets'> & Partial<Pick<StoreExtension, 'lastError' | 'lastErrorAt'>>;
const UNREADABLE = 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.';

/** Merchant-facing extension settings (spec 2026-09-27 §8). Secrets go in, never come out. */
@Injectable()
export class ExtensionsService {
  private readonly registry: ExtensionRegistry;
  constructor(private readonly prisma: PrismaService, private readonly box: SecretBox, private readonly config: ConfigService, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) { this.registry = registry ?? EXTENSIONS; }

  private async store(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return store;
  }
  private manifest(id: string) {
    const manifest = this.registry.find(item => item.id === id);
    if (!manifest) throw new NotFoundException('Esa extensión no existe.');
    return manifest;
  }
  /** null = stored but unreadable (the key was rotated); the merchant pastes it again. */
  private secretsOf(row: Row | null): Record<string, string> | null {
    if (!row?.secrets) return {};
    try { return this.box.open(row.secrets); } catch (error) { if (error instanceof SecretBoxError) return null; throw error; }
  }
  private feedUrl(slug: string, id: string) {
    const base = (process.env.PUBLIC_API_URL || `http://localhost:${this.config.get('app.port') || 3001}/v1`).replace(/\/$/, '');
    return `${base}/stores/public/${encodeURIComponent(slug)}/feeds/${id}.xml`;
  }

  private view(manifest: ExtensionManifest, row: Row | null, slug: string) {
    const settings = readSettings(manifest, row?.settings);
    const secrets = this.secretsOf(row);
    return {
      kind: 'extension' as const, id: manifest.id, name: manifest.name, category: manifest.category, categoryLabel: CATEGORY_LABELS[manifest.category], tier: manifest.tier,
      logo: manifest.logo, summary: manifest.summary, description: manifest.description, docsUrl: manifest.docsUrl ?? null,
      fields: manifest.settings.map(field => ({ key: field.key, label: field.label, type: field.type, help: field.help ?? null, where: field.where ?? null, placeholder: field.placeholder ?? null, required: Boolean(field.required), pattern: field.pattern?.source ?? null, options: field.options ?? [] })),
      secrets: (manifest.secrets ?? []).map(secret => ({ key: secret.key, label: secret.label, help: secret.help ?? null, configured: Boolean(secrets?.[secret.key]) })),
      installed: Boolean(row), enabled: Boolean(row?.enabled), configured: Boolean(row) && secrets !== null && isConfigured(manifest, settings, secrets), settings,
      lastError: secrets === null ? UNREADABLE : row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ? new Date(row.lastErrorAt).toISOString() : null,
      capabilities: [manifest.storefrontLoader && 'script', manifest.verificationMeta && 'verification', manifest.productFeed && 'feed', manifest.shippingCarrier && 'shipping', manifest.onEvent && 'events'].filter(Boolean) as Array<'script' | 'verification' | 'feed' | 'shipping' | 'events'>,
      feed: manifest.productFeed && row ? { url: this.feedUrl(slug, manifest.id), platform: manifest.productFeed.platform, steps: manifest.productFeed.steps } as { url: string; platform: 'google' | 'meta'; steps: string[]; skipped?: { noPhoto: number; noPrice: number } } : null,
    };
  }

  async list(merchantId: string, storeId: string) {
    const store = await this.store(merchantId, storeId);
    const rows = await this.prisma.storeExtension.findMany({ where: { storeId } });
    return {
      extensions: this.registry.map(manifest => this.view(manifest, rows.find(row => row.extensionId === manifest.id) ?? null, store.slug)),
      guides: GUIDES.map(guide => ({ kind: 'guide' as const, ...guide, categoryLabel: CATEGORY_LABELS[guide.category] })),
    };
  }

  async save(merchantId: string, storeId: string, extensionId: string, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }) {
    const store = await this.store(merchantId, storeId);
    const manifest = this.manifest(extensionId);
    const current = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId, extensionId } } });
    const { settings, secrets } = validateInput(manifest, input, this.secretsOf(current) ?? {});
    const data = { settings: settings as Prisma.InputJsonValue, secrets: Object.keys(secrets).length ? this.box.seal(secrets) : null, lastError: null, lastErrorAt: null };
    const row = await this.prisma.storeExtension.upsert({ where: { storeId_extensionId: { storeId, extensionId } }, create: { storeId, extensionId, ...data }, update: data });
    return this.view(manifest, row, store.slug);
  }

  async setEnabled(merchantId: string, storeId: string, extensionId: string, enabled: boolean) {
    const store = await this.store(merchantId, storeId);
    const manifest = this.manifest(extensionId);
    if (!await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId, extensionId } } })) throw new NotFoundException('Primero configura esta extensión.');
    return this.view(manifest, await this.prisma.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId } }, data: { enabled } }), store.slug);
  }

  async remove(merchantId: string, storeId: string, extensionId: string) {
    await this.store(merchantId, storeId);
    this.manifest(extensionId);
    await this.prisma.storeExtension.deleteMany({ where: { storeId, extensionId } });
    return { removed: true as const };
  }
}
