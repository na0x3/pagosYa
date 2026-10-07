import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { brandContext, EMPTY_BRAND, type BrandProfile } from '../brand/brand-profile';
import { sourceProvider } from '../storefront-source/source-provider';
import { SourceRequestBudget } from '../storefront-source/source-request-budget';
import { CREDIT_MICRO_USD, sourceUsage } from '../storefront-source/source-generation-policy';
import * as designer from './email-kit-designer';
import { EmailKitStore } from './email-kit-store';
import { validateEmailKit } from './email-kit-validate';

type SnapshotFile = { path: string; content: string };

@Injectable()
export class EmailKitService {
  private readonly logger = new Logger(EmailKitService.name);
  constructor(private readonly prisma: PrismaService, private readonly kits: EmailKitStore, private readonly usage: AiUsageService, private readonly config: ConfigService) {}

  async design(storeId: string, mode: 'twin' | 'bold', as: 'candidate' | 'first'): Promise<{ status: 'saved' | 'unusable'; credits: number; repairs: string[] }> {
    const [store, version, brand, products] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true, publishedSourceRevision: true } }),
      this.prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } }),
      this.prisma.storeBrandProfile.findUnique({ where: { storeId }, select: { data: true } }),
      this.prisma.paymentLink.findMany({ where: { storeId }, take: 8, orderBy: { createdAt: 'desc' }, select: { name: true } }),
    ]);
    const files = (version?.snapshot as { files?: SnapshotFile[] } | null)?.files ?? [];
    const read = (pattern: RegExp) => files.find(file => pattern.test(file.path))?.content ?? '';
    const unmetered = Boolean(this.config.get('app.chatgptPlan'));

    const { raw, usage } = await designer.designEmailKit({
      storeName: store?.name ?? 'Tu tienda', mode,
      brand: brandContext((brand?.data as BrandProfile | null) ?? EMPTY_BRAND),
      stylesheet: read(/(?:^|\/)styles(?:\/globals)?\.css$/i), homepage: read(/(?:^|\/)index\.html$/i),
      products: products.map(p => p.name),
    }, {
      provider: sourceProvider(this.config, designer.EMAIL_KIT_MODEL), budget: new SourceRequestBudget(designer.EMAIL_KIT_MAX_CREDITS, unmetered),
      record: (body, durationMs, status) => this.usage.record(storeId, 'email-kit', designer.EMAIL_KIT_MODEL, body, durationMs, status),
    });

    const priced = sourceUsage(designer.EMAIL_KIT_MODEL, usage);
    // Unknown usage is charged at the ceiling, never assumed free (as the site budget does).
    const credits = unmetered ? 0 : Math.min(designer.EMAIL_KIT_MAX_CREDITS, Math.ceil((priced?.providerMicroUsd ?? designer.EMAIL_KIT_MAX_CREDITS * CREDIT_MICRO_USD) / CREDIT_MICRO_USD));
    const checked = validateEmailKit(raw);
    if (!checked.usable) return { status: 'unusable', credits, repairs: checked.repairs };
    const row = { mode, layout: checked.kit.layout!, blocks: Object.values(checked.kit.blocks).join('\n'), copy: checked.kit.copy,
      designedFromRevision: store?.publishedSourceRevision ?? version?.revision ?? null, model: designer.EMAIL_KIT_MODEL, credits, repairs: checked.repairs };
    if (as === 'first') await this.kits.saveActive(storeId, row); else await this.kits.saveCandidate(storeId, row);
    return { status: 'saved', credits, repairs: checked.repairs };
  }

  /** Runs after a site is saved. A store keeps its look across redesigns; failure costs only the look, never the site. */
  async designAfterSite(storeId: string): Promise<void> {
    try {
      if (await this.kits.active(storeId)) return;
      await this.design(storeId, 'twin', 'first');
    } catch (error) {
      this.logger.warn(`Email kit design after site failed for ${storeId}: ${(error as Error).message}`);
    }
  }
}
