import { BadGatewayException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { chatgptPlanProvider } from '../ai/chatgpt-plan-provider';
import { autoFillable, mergeWrittenPage, PRODUCT_PAGE_SCHEMA, productPagePrompt, writtenPage, type ProductPageFacts } from './product-page-writer';

@Injectable()
export class ProductPageWriterService {
  private readonly logger = new Logger(ProductPageWriterService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly uploads: UploadsService, @Optional() private readonly usage?: AiUsageService) {}

  /** Writes one product's long page. 'auto' fills only an empty product; 'regenerate' replaces YAPI's own rows. */
  async fill(storeId: string, productId: string, mode: 'auto' | 'regenerate', merchantId?: string): Promise<'written' | 'skipped'> {
    const product = await this.prisma.paymentLink.findFirst({
      where: { id: productId, storeId, ...(merchantId ? { store: { merchantId } } : {}) },
      select: { id: true, updatedAt: true, name: true, description: true, specifications: true, tags: true, imageUrls: true, highlights: true, contentBlocks: true, category: { select: { name: true } }, store: { select: { name: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    if (mode === 'auto' && !autoFillable(product)) return 'skipped';
    const facts: ProductPageFacts = { name: product.name, description: product.description, specifications: Array.isArray(product.specifications) ? product.specifications as ProductPageFacts['specifications'] : [], tags: product.tags, category: product.category?.name ?? null };
    const photoUrls = (product.imageUrls || []).slice(0, 4);
    const model = this.config.get<string>('app.openAi.inventoryModel') ?? 'gpt-5.6-luna';
    const plan = chatgptPlanProvider(this.config, model);
    const apiKey = plan?.apiKey ?? this.config.get<string>('app.openAi.apiKey');
    if (!apiKey || !plan && this.config.get<boolean>('app.openAi.enabled') === false) throw new ServiceUnavailableException('YAPI no está configurado para escribir páginas de producto.');
    const images = (await Promise.all(photoUrls.map(async (url, index) => {
      const filename = url.split('/').at(-1)!;
      const bytes = await this.uploads.getBuffer(filename).catch(() => null);
      return bytes ? [{ type: 'input_text', text: `Foto ${index + 1}` }, { type: 'input_image', image_url: `data:${this.uploads.contentTypeFor(filename)};base64,${bytes.toString('base64')}`, detail: 'low' }] : [];
    }))).flat();
    const started = Date.now();
    // Photos travel in a user message: the API answers invalid_value to an image inside a developer message.
    const response = await fetch(plan?.endpoint ?? 'https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [{ role: 'developer', content: [{ type: 'input_text', text: productPagePrompt(facts, product.store.name) }] }, ...(images.length ? [{ role: 'user', content: images }] : [])], text: { format: { type: 'json_schema', name: 'pagosya_product_page', strict: true, schema: PRODUCT_PAGE_SCHEMA } }, max_output_tokens: 4000 }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json().catch(() => ({})) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: unknown };
    await this.usage?.record(storeId, 'product-page', model, body?.usage ? { usage: body.usage } : null, Date.now() - started, response.ok ? 'ok' : 'failed');
    if (!response.ok) throw new BadGatewayException('YAPI no pudo escribir la página de este producto.');
    let raw: unknown = null;
    try { raw = JSON.parse(body.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text ?? 'null'); } catch { raw = null; }
    const merged = mergeWrittenPage(product, writtenPage(raw, facts, photoUrls), mode);
    if (!merged) return 'skipped';
    // Only if nobody saved the product while YAPI was writing: a merchant's edit always wins over a stale merge.
    const saved = await this.prisma.paymentLink.updateMany({ where: { id: product.id, updatedAt: product.updatedAt }, data: { highlights: merged.highlights as unknown as Prisma.InputJsonValue, contentBlocks: merged.contentBlocks as unknown as Prisma.InputJsonValue } });
    return saved.count ? 'written' : 'skipped';
  }

  /** After YAPI builds or redesigns a store: fill its empty products, one at a time, never failing the caller. */
  async fillStore(storeId: string, limit = 20): Promise<void> {
    // The cap counts products that still need a page, so a store with many filled products still reaches the rest.
    const products = (await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, contentBlocks: true }, orderBy: { createdAt: 'asc' } }))
      .filter(product => autoFillable(product)).slice(0, limit);
    for (const product of products) {
      try { await this.fill(storeId, product.id, 'auto'); }
      catch (error) { this.logger.warn(JSON.stringify({ event: 'product_page_failed', storeId, productId: product.id, reason: (error as Error).message.slice(0, 200) })); }
    }
  }
}
