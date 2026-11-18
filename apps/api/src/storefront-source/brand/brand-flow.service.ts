import { BadRequestException, HttpException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BrandProfileService } from '../../brand/brand-profile.service';
import { brandContext } from '../../brand/brand-profile';
import { ProductScenesService } from '../../product-content/product-scenes.service';
import { PlansService } from '../../plans/plans.service';
import { UploadsService } from '../../uploads/uploads.service';
import { AiUsageService } from '../../ai-usage/ai-usage.service';
import { SourceV2PrototypeService } from '../v2/v2-prototype.service';
import { sourceProvider } from '../source-provider';
import type { SourceMessageInput } from '../dto/send-source-message.dto';
import type { BrandBrief, BrandShot } from './brand-brief-types';
import { brandCall, type BrandCallDeps } from './brand-model-call';
import { parseResearch, RESEARCH_SCHEMA, researchPrompt } from './brand-research';
import { IDENTITY_SCHEMA, identityPrompt, normalizeIdentity } from './brand-identity';
import { brandCardMetadata, brandCardText, brandDoneText } from './brand-card';
import { POSTER_READ_PROMPT, POSTER_READ_SCHEMA, posterSpelledRight, shotList, shotPrompt } from './brand-shoot';
import { brandLinks } from './brand-intent';

type ChatResult = { revision: { revision: number } } | { assistantMessage: { metadata: Record<string, unknown> } };

/** «Mejorar mi marca» (spec 2026-11-18): research → identity → card → campaign shoot → V2 build, inside one chat job. */
@Injectable()
export class BrandFlowService {
  private readonly log = new Logger(BrandFlowService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly brands: BrandProfileService,
    private readonly scenes: ProductScenesService,
    private readonly plans: PlansService,
    private readonly v2: SourceV2PrototypeService,
    private readonly uploads: UploadsService,
    @Optional() private readonly usage?: AiUsageService,
    /** Tests hand in the call target; production resolves it per run. */
    @Optional() private readonly callTarget?: Pick<BrandCallDeps, 'endpoint' | 'apiKey' | 'model'>,
  ) {}

  private async post(storeId: string, content: string, metadata: Record<string, unknown> = {}) {
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
    await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content, metadata: metadata as never } });
  }

  private callDeps(storeId: string): BrandCallDeps {
    const model = this.config.get<string>('app.yapiBrandModel') ?? 'gpt-5.6-sol';
    const target = this.callTarget ?? (() => { const provider = sourceProvider(this.config, model); return { endpoint: provider.endpoint, apiKey: provider.apiKey, model }; })();
    const claudeKey = process.env.YAPI_CLAUDE_API_KEY || this.config.get<string>('app.anthropic.apiKey');
    return { ...target,
      ...(process.env.YAPI_CHAT_ON_CLAUDE && claudeKey ? { anthropic: { apiKey: claudeKey, model: process.env.YAPI_BRAND_CLAUDE_MODEL || 'claude-sonnet-5-5' } } : {}),
      record: async (body, ms, ok) => { await this.usage?.record(storeId, 'brand-flow', target.model, body, ms, ok ? 'COMPLETED' : 'FAILED'); } };
  }

  private async twice<T>(attempt: () => Promise<T | null>): Promise<T | null> {
    for (let i = 0; i < 2; i++) { const value = await attempt().catch(() => null); if (value) return value; }
    return null;
  }

  private async saveBrief(storeId: string, brief: BrandBrief) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { onboarding: true } });
    await this.prisma.store.update({ where: { id: storeId }, data: { onboarding: { ...((store?.onboarding as object) ?? {}), brandBrief: brief } as never } });
  }

  async runForChat(job: { merchantId: string; storeId: string; input: SourceMessageInput; signal: AbortSignal }): Promise<ChatResult> {
    const { merchantId, storeId, input, signal } = job;
    const revision = Number(input.revision);
    const links = brandLinks(input.instruction);
    const images = input.assetUrls ?? [];
    if (links.social && !images.length) {
      await this.post(storeId, 'Mándame 2–3 capturas de tu perfil y fotos de tus productos y sigo con tu marca.');
      return { assistantMessage: { metadata: { awaitingInput: true } } };
    }
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true, logoUrl: true } });
    const storeName = store?.name ?? 'tu tienda';
    const rows = await this.prisma.paymentLink.findMany({ where: { storeId, NOT: { imageUrls: { isEmpty: true } } }, select: { name: true, imageUrls: true }, take: 12 });
    const products = rows.map(row => ({ name: row.name, photo: String(row.imageUrls[0]) })).filter(p => p.photo.startsWith('/v1/uploads/'));
    // Photos and words without a catalogue: the attached photos are the shoot's references.
    const references = products.length ? products : images.map((photo, i) => ({ name: `${storeName} ${i + 1}`, photo }));
    if (!references.length) {
      await this.post(storeId, 'Mándame una foto de tu producto para la sesión de fotos y sigo con tu marca.');
      return { assistantMessage: { metadata: { awaitingInput: true } } };
    }

    // Read (best effort): what the merchant's own material says about the brand.
    const profileRevision = (await this.brands.get(merchantId, storeId)).revision;
    await this.brands.analyze(merchantId, storeId, { revision: profileRevision, text: input.instruction, websiteUrl: links.website, assetUrls: images.slice(0, 6) }).catch(() => null);
    const profile = await this.brands.get(merchantId, storeId);
    const brandFacts = brandContext(profile.data);
    const deps = this.callDeps(storeId);

    await this.post(storeId, 'Investigando tu nicho…', { progress: 'research' });
    const research = await this.twice(async () => {
      const { json, searched } = await brandCall(deps, { text: researchPrompt({ storeName, products: references.map(p => ({ name: p.name })), country: 'Bolivia', ownWords: input.instruction, brandFacts, website: links.website }), schemaName: 'brand_research', schema: RESEARCH_SCHEMA, webSearch: true, signal });
      return parseResearch(json, searched);
    });
    const identity = research && await this.twice(async () => normalizeIdentity((await brandCall(deps, { text: identityPrompt({ storeName, products: references.map(p => p.name), brandFacts, research, evolve: profile.data.confirmed.length > 0 }), schemaName: 'brand_identity', schema: IDENTITY_SCHEMA, signal })).json));
    if (!research || !identity) {
      await this.post(storeId, 'No pude completar la investigación de tu marca; diseño tu tienda como siempre.');
      return this.v2.designForChat(merchantId, storeId, revision);
    }

    const brief: BrandBrief = { version: 1, createdAt: new Date().toISOString(), storeName, research, identity, shots: [], inputs: { ...(links.website ? { website: links.website } : {}), images: images.length, text: Boolean(input.instruction.trim()) } };
    await this.saveBrief(storeId, brief);
    await this.post(storeId, brandCardText(brief), brandCardMetadata(brief));

    // Campaign shoot: the plan's cap, credits checked before every photo.
    let shootNote = '';
    // The store's own logo, when it is one of its uploads, goes on the poster beside the product.
    const logo = store?.logoUrl?.startsWith('/v1/uploads/') ? store.logoUrl : null;
    const plan = shotList(references, logo, (await this.plans.planOf(merchantId)).campaignPhotos);
    if (plan.length) await this.post(storeId, `Fotografiando tus productos (${plan.length} escenas)…`, { progress: 'shoot' });
    for (const shot of plan) {
      signal.throwIfAborted();
      try { await this.plans.assertCredits(storeId); } catch (error) {
        if (error instanceof HttpException && error.getStatus() === 402) { shootNote = 'Se acabaron tus créditos del mes durante la sesión de fotos.'; break; }
        throw error;
      }
      const take = (withText: boolean) => this.scenes.campaignShot(merchantId, storeId, { referenceUrls: shot.references, prompt: shotPrompt(shot, identity, storeName, withText), aspect: shot.aspect });
      try {
        let { url } = await take(shot.kind === 'poster');
        if (shot.kind === 'poster' && !(await this.posterReads(deps, url, storeName, signal))) {
          ({ url } = await take(true));
          if (!(await this.posterReads(deps, url, storeName, signal))) ({ url } = await take(false));
        }
        const taken: BrandShot = { kind: shot.kind, url, alt: `${storeName} — ${shot.kind}`, ...(shot.product ? { product: shot.product } : {}) };
        brief.shots.push(taken);
      } catch (error) {
        if (error instanceof BadRequestException) continue;
        if (error instanceof ServiceUnavailableException) { shootNote = 'Sin fotos nuevas: el servicio de imágenes no está configurado; usé tus fotos.'; break; }
        this.log.warn(`brand shot failed for ${storeId}: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
      }
    }
    await this.saveBrief(storeId, brief);

    const result = await this.v2.designForChat(merchantId, storeId, revision, brief);
    await this.post(storeId, [brandDoneText(brief, brief.shots.length, 'revision' in result), shootNote].filter(Boolean).join(' '));
    return result;
  }

  private async posterReads(deps: BrandCallDeps, url: string, brand: string, signal: AbortSignal): Promise<boolean> {
    const bytes = await this.uploads.getBuffer(url.split('/').at(-1)!).catch(() => null);
    if (!bytes) return false;
    const { json } = await brandCall(deps, { text: POSTER_READ_PROMPT, images: [{ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'high' }], schemaName: 'poster_read', schema: POSTER_READ_SCHEMA, maxOutputTokens: 300, signal }).catch(() => ({ json: { text: '' } }));
    return posterSpelledRight(String((json as { text?: string }).text ?? ''), brand);
  }
}
