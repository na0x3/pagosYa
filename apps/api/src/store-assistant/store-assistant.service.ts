import { HttpException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantConversation, Store, StoreAssistant } from '@prisma/client';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { PrismaService } from '../prisma/prisma.service';
import { findActiveStoreBySlug } from '../stores/active-store';
import { runAssistantTurn } from './assistant-loop';
import { ASSISTANT_MODEL_FACTORY, type AssistantModelFactory } from './assistant-model';
import { assistantInstructions } from './assistant-prompt';
import { assembleReply } from './assistant-reply';
import { buildAssistantSummary, storePassages } from './assistant-summary';
import { normaliseQuestion } from './assistant-text';
import { ASSISTANT_TOOLS, AssistantToolbox } from './assistant-tools';
import type { AssistantReply, ChatResult } from './assistant-types';
import { AssistantUsage } from './assistant-usage';
import type { AssistantChatDto } from './dto/assistant-chat.dto';

export type TurnStore = Store & { categories: string[] };
export type ConverseInput = {
  store: TurnStore; assistant: StoreAssistant; conversation: AssistantConversation | null; message: string;
  productId?: string; addedToCart?: boolean; pagePath?: string; ipHash: string; preview: boolean; now: Date;
};

const IDLE_MS = 30 * 60_000;
const MIN_GAP_MS = 2_000;
const MAX_BUYER_MESSAGES = 20;
const TURN_MS = 25_000;
const HISTORY = 12;
const PROVIDER_DOWN = 'Ahora no puedo responder. Escríbele a la tienda 👉';
const TOO_LONG = 'Seguimos mejor con la tienda: te paso con ellos para terminar de ayudarte.';

@Injectable()
export class StoreAssistantService {
  private readonly logger = new Logger(StoreAssistantService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usage: AssistantUsage,
    @Inject(ASSISTANT_MODEL_FACTORY) private readonly modelFactory: AssistantModelFactory,
    @Optional() private readonly metering?: AiUsageService,
  ) {}

  async loadTurnStore(storeId: string): Promise<TurnStore | null> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return null;
    const categories = await this.prisma.category.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' }, select: { name: true } });
    return { ...store, categories: categories.map((c) => c.name) };
  }

  /** Public buyer chat. Any refusal before the model runs returns the contact-button fallback. */
  async chat(slug: string, dto: AssistantChatDto, ip: string, now = new Date()): Promise<ChatResult> {
    const fallback: ChatResult = { conversationId: null, fallback: 'contact' };
    if (!this.config.get<boolean>('app.assistant.enabled')) return fallback;
    const base = await findActiveStoreBySlug(this.prisma, slug);
    const assistant = await this.prisma.storeAssistant.findUnique({ where: { storeId: base.id } });
    if (!assistant?.enabled || !base.publishedSourceRevision) return fallback;
    let conversation = dto.conversationId
      ? await this.prisma.assistantConversation.findFirst({ where: { id: dto.conversationId, storeId: base.id, preview: false } })
      : null;
    if (conversation && now.getTime() - conversation.lastMessageAt.getTime() > IDLE_MS) conversation = null;
    if (!conversation && await this.usage.startGate(base.id, assistant.monthlyCap, now) !== 'ok') return fallback;
    if (!(await this.usage.spendOk(now))) return fallback;
    const categories = await this.prisma.category.findMany({ where: { storeId: base.id }, orderBy: { sortOrder: 'asc' }, select: { name: true } });
    return this.converse({
      store: { ...base, categories: categories.map((c) => c.name) }, assistant, conversation, message: dto.message.trim(),
      productId: dto.productId, addedToCart: dto.addedToCart, pagePath: dto.pagePath, ipHash: this.usage.ipHash(ip), preview: false, now,
    });
  }

  async converse(input: ConverseInput): Promise<ChatResult> {
    const { store, assistant, now } = input;
    const isNew = !input.conversation;
    const handoffOnly = (text: string): AssistantReply => ({ text, blocks: [{ type: 'handoff', whatsappUrl: this.whatsapp(store.contactPhone), summary: '' }] });
    let conversation: { id: string };
    if (input.conversation) {
      // Claim the turn atomically so concurrent posts cannot all pass the gap and the cap.
      const claimed = await this.prisma.assistantConversation.updateMany({
        where: { id: input.conversation.id, storeId: store.id, lastMessageAt: { lte: new Date(now.getTime() - MIN_GAP_MS) }, buyerMessages: { lt: MAX_BUYER_MESSAGES } },
        data: { lastMessageAt: now, buyerMessages: { increment: 1 } },
      });
      if (claimed.count === 0) {
        const current = await this.prisma.assistantConversation.findUnique({ where: { id: input.conversation.id } });
        if (current && current.buyerMessages >= MAX_BUYER_MESSAGES) {
          await this.prisma.assistantConversation.update({ where: { id: current.id }, data: { handedOff: true } });
          return { conversationId: current.id, reply: handoffOnly(TOO_LONG) };
        }
        throw new HttpException('Espera un momento antes de enviar otro mensaje.', 429);
      }
      conversation = input.conversation;
    } else {
      conversation = await this.prisma.assistantConversation.create({
        data: { storeId: store.id, preview: input.preview, ipHash: input.ipHash, pagePath: input.pagePath?.slice(0, 200) ?? null, startedAt: now, lastMessageAt: now, buyerMessages: 1 },
      });
    }
    const history = isNew ? [] : await this.prisma.assistantMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY });

    const profile = { name: assistant.name, notes: assistant.notes, formality: assistant.formality };
    const summary = buildAssistantSummary(store, profile);
    const box = new AssistantToolbox({ prisma: this.prisma, now, store: { id: store.id, contactPhone: store.contactPhone, locations: store.locations, passages: storePassages(store, profile) } });
    const viewing = input.productId ? `\n(El cliente está mirando el producto con id ${input.productId}.)` : '';
    const transcript = [
      ...history.reverse().map((m) => ({ role: m.role === 'buyer' ? 'user' : 'assistant', content: [{ type: m.role === 'buyer' ? 'input_text' : 'output_text', text: m.text }] })),
      { role: 'user', content: [{ type: 'input_text', text: `${input.message}${viewing}` }] },
    ];
    let modelName = 'unknown';
    let text: string;
    try {
      const signal = AbortSignal.timeout(TURN_MS);
      const built = this.modelFactory({ storeId: store.id, signal, onTurn: async ({ body, durationMs, status }) => { await this.metering?.record(store.id, 'assistant', modelName, body, durationMs, status); } });
      modelName = built.modelName;
      ({ text } = await runAssistantTurn({ model: built.model, toolbox: box, instructions: assistantInstructions(summary, profile, store.name), transcript, tools: ASSISTANT_TOOLS }));
    } catch (error) {
      this.logger.warn(`assistant turn failed for store ${store.id}: ${(error as Error).message}`);
      if (isNew) await this.prisma.assistantConversation.delete({ where: { id: conversation.id } });
      return { conversationId: isNew ? null : conversation.id, reply: handoffOnly(PROVIDER_DOWN) };
    }

    await this.prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'buyer', text: input.message } });
    const { reply, guarded, offending } = assembleReply({ text, box, evidence: [summary, input.message], contactPhone: store.contactPhone });
    if (guarded) await this.metering?.record(store.id, 'assistant-guard', modelName, { offending }, 0, 'REJECTED');
    await this.prisma.assistantMessage.create({ data: { conversationId: conversation.id, role: 'assistant', text: reply.text, blocks: reply.blocks as any } });
    const handedOff = reply.blocks.some((b) => b.type === 'handoff');
    await this.prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now, ...(handedOff && { handedOff: true }), ...(input.addedToCart && { addedToCart: true }) },
    });
    if (box.handoff?.reason === 'no_se') {
      const question = normaliseQuestion(box.handoff.question || input.message);
      if (question) {
        try {
          await this.prisma.assistantUnanswered.upsert({
            where: { storeId_question: { storeId: store.id, question } },
            create: { storeId: store.id, question },
            update: { count: { increment: 1 }, lastAskedAt: now, status: 'open' },
          });
        } catch (error) {
          this.logger.warn(`could not file unanswered question for store ${store.id}: ${(error as Error).message}`);
        }
      }
    }
    return { conversationId: conversation.id, reply };
  }

  private whatsapp(phone: string | null) {
    const digits = (phone ?? '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola, vengo del chat de la tienda.')}` : null;
  }
}
