import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, StoreAssistant } from '@prisma/client';
import { StructuredCompletionService } from '../ai/structured-completion';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../store-knowledge/store-knowledge';
import { storePolicies } from '../stores/store-presentation';
import { ASSISTANT_PRIVACY_PARAGRAPH, withAssistantPrivacy } from './assistant-privacy';
import { buildAssistantSummary } from './assistant-summary';
import { maskContact } from './assistant-text';
import { AssistantUsage, PREVIEW_ALLOWANCE } from './assistant-usage';
import type { AssistantSettingsDto, AssistantTestDto, AssistantUnansweredDto } from './dto/assistant-settings.dto';
import { StoreAssistantService } from './store-assistant.service';

const defaults = (storeId: string): StoreAssistant => ({ storeId, enabled: false, name: null, avatarUrl: null, greeting: null, formality: 'tu', notes: '', monthlyCap: 300, createdAt: new Date(0), updatedAt: new Date(0) });

@Injectable()
export class StoreAssistantAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usage: AssistantUsage,
    private readonly chat: StoreAssistantService,
    @Optional() private readonly completion?: StructuredCompletionService,
  ) {}

  private async owned(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  async view(merchantId: string, storeId: string, now = new Date()) {
    const store = await this.owned(merchantId, storeId);
    const row = (await this.prisma.storeAssistant.findUnique({ where: { storeId } })) ?? defaults(storeId);
    const [used, previewUsed, coupons] = await Promise.all([
      this.usage.monthlyUsed(storeId, now), this.usage.previewUsed(storeId, now),
      this.prisma.promoCode.findMany({ where: { storeId, isActive: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      settings: { enabled: row.enabled, name: row.name, avatarUrl: row.avatarUrl, greeting: row.greeting, formality: row.formality, notes: row.notes },
      usage: { used, cap: row.monthlyCap, previewUsed, previewCap: PREVIEW_ALLOWANCE },
      platformEnabled: Boolean(this.config.get<boolean>('app.assistant.enabled')),
      publishedDesign: Boolean(store.publishedSourceRevision),
      coupons: coupons.map((c) => ({ id: c.id, code: c.code, label: c.discountType === 'PERCENT' ? `${c.discountValue}%` : money(c.discountValue, 'BOB'), showInAssistant: c.showInAssistant })),
    };
  }

  async save(merchantId: string, storeId: string, dto: AssistantSettingsDto, now = new Date()) {
    const store = await this.owned(merchantId, storeId);
    const data = {
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.name !== undefined && { name: dto.name?.trim() || null }),
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      ...(dto.greeting !== undefined && { greeting: dto.greeting?.trim() || null }),
      ...(dto.formality !== undefined && { formality: dto.formality }),
      ...(dto.notes !== undefined && { notes: dto.notes.trim() }),
    };
    const policies = dto.enabled === undefined ? null : withAssistantPrivacy(storePolicies(store.policies), dto.enabled);
    if (dto.enabled === true && !policies?.privacy?.includes(ASSISTANT_PRIVACY_PARAGRAPH)) {
      throw new BadRequestException('Tu política de privacidad es demasiado larga para agregar el aviso del asistente. Acórtala para activarlo.');
    }
    await this.prisma.storeAssistant.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
    if (policies) await this.prisma.store.update({ where: { id: storeId }, data: { policies: policies as Prisma.InputJsonValue } });
    return this.view(merchantId, storeId, now);
  }

  async test(merchantId: string, storeId: string, dto: AssistantTestDto, now = new Date()) {
    await this.owned(merchantId, storeId);
    const conversation = dto.conversationId ? await this.prisma.assistantConversation.findFirst({ where: { id: dto.conversationId, storeId, preview: true } }) : null;
    if (!conversation && await this.usage.previewUsed(storeId, now) >= PREVIEW_ALLOWANCE) throw new BadRequestException(`Usaste las ${PREVIEW_ALLOWANCE} pruebas de este mes.`);
    const [store, row] = await Promise.all([this.chat.loadTurnStore(storeId), this.prisma.storeAssistant.findUnique({ where: { storeId } })]);
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return this.chat.converse({ store, assistant: row ?? defaults(storeId), conversation, message: dto.message.trim(), ipHash: 'merchant', preview: true, now });
  }

  async notesDraft(merchantId: string, storeId: string) {
    await this.owned(merchantId, storeId);
    if (!this.completion) throw new BadRequestException('La redacción con IA no está disponible.');
    const store = await this.chat.loadTurnStore(storeId);
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const { data } = await this.completion.structuredCompletion<{ notes: string }>({
      storeId, stage: 'assistant-notes',
      system: 'Redacta, en español de Bolivia, notas breves para el asistente de una tienda: historia, horarios, días de envío, cambios y devoluciones. Usa solo los datos dados; si algo falta, escribe una línea con {{completar}}. Máximo 1500 caracteres, en párrafos cortos.',
      user: buildAssistantSummary(store, { name: null, notes: '', formality: 'tu' }),
      schema: { name: 'assistant_notes', schema: { type: 'object', additionalProperties: false, properties: { notes: { type: 'string' } }, required: ['notes'] } },
      maxOutputTokens: 900,
    });
    return { notes: data.notes.slice(0, 4000) };
  }

  async conversations(merchantId: string, storeId: string) {
    await this.owned(merchantId, storeId);
    const rows = await this.prisma.assistantConversation.findMany({
      where: { storeId, preview: false }, orderBy: { startedAt: 'desc' }, take: 50,
      include: { messages: { where: { role: 'buyer' }, orderBy: { createdAt: 'asc' }, take: 1, select: { text: true } } },
    });
    return { conversations: rows.map((r) => ({ id: r.id, startedAt: r.startedAt, firstQuestion: maskContact(r.messages[0]?.text ?? ''), buyerMessages: r.buyerMessages, addedToCart: r.addedToCart, handedOff: r.handedOff })) };
  }

  async conversation(merchantId: string, storeId: string, id: string) {
    await this.owned(merchantId, storeId);
    const row = await this.prisma.assistantConversation.findFirst({ where: { id, storeId }, include: { messages: { orderBy: { createdAt: 'asc' }, select: { role: true, text: true, createdAt: true } } } });
    if (!row) throw new NotFoundException('Conversación no encontrada');
    return { id: row.id, startedAt: row.startedAt, messages: row.messages };
  }

  async unansweredList(merchantId: string, storeId: string) {
    await this.owned(merchantId, storeId);
    const rows = await this.prisma.assistantUnanswered.findMany({ where: { storeId, status: 'open' }, orderBy: [{ count: 'desc' }, { lastAskedAt: 'desc' }], take: 50 });
    return { questions: rows.map((r) => ({ id: r.id, question: r.question, count: r.count, lastAskedAt: r.lastAskedAt })) };
  }

  async unanswered(merchantId: string, storeId: string, id: string, dto: AssistantUnansweredDto, now = new Date()) {
    await this.owned(merchantId, storeId);
    const row = await this.prisma.assistantUnanswered.findFirst({ where: { id, storeId } });
    if (!row) throw new NotFoundException('Pregunta no encontrada');
    if (row.status !== 'open') throw new BadRequestException('Esta pregunta ya fue atendida.');
    if (dto.action === 'teach') {
      const answer = dto.answer?.trim();
      if (!answer) throw new BadRequestException('Escribe la respuesta.');
      const current = (await this.prisma.storeAssistant.findUnique({ where: { storeId } }))?.notes ?? '';
      const notes = `${current ? `${current}\n\n` : ''}Pregunta: ${row.question}\nRespuesta: ${answer}`;
      if (notes.length > 4000) throw new BadRequestException('Las notas superan los 4000 caracteres. Acorta algo antes de enseñar más.');
      await this.prisma.storeAssistant.upsert({ where: { storeId }, create: { storeId, notes }, update: { notes } });
    }
    await this.prisma.assistantUnanswered.update({ where: { id }, data: { status: dto.action === 'teach' ? 'taught' : 'ignored' } });
    return this.view(merchantId, storeId, now);
  }
}
