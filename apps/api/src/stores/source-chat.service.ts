import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SourceProjectsService } from './source-projects.service';
import { SourceGenerationService } from './source-generation.service';
import { storeAgentClarificationForInstruction } from './store-agent.service';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import type { SourceProjectSnapshot } from './source-project';

@Injectable()
export class SourceChatService {
  constructor(private readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService) {}

  private async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async conversation(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.findUnique({ where: { storeId }, include: {
      messages: { where: { channel: 'source' }, orderBy: { createdAt: 'desc' }, take: 100 },
    } });
    return { messages: (thread?.messages || []).reverse() };
  }

  async send(merchantId: string, storeId: string, input: SendSourceMessageDto) {
    const store = await this.owner(merchantId, storeId);
    const current = await this.projects.state(merchantId, storeId);
    if (current.revision !== input.revision) throw new ConflictException('El sitio cambió en otra sesión. Actualiza antes de enviar.');
    const history = await this.conversation(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: { updatedAt: new Date() } });
    const userMessage = await this.prisma.storeAgentMessage.create({ data: {
      threadId: thread.id, channel: 'source', role: 'USER', content: input.instruction.trim(),
      metadata: { assetUrls: input.assetUrls || [], revision: input.revision },
    } });
    const last = history.messages.at(-1);
    const lastMetadata = last?.metadata as Record<string, unknown> | undefined;
    const clarification = lastMetadata?.clarification ? null : storeAgentClarificationForInstruction(input.instruction);
    if (clarification) {
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: clarification.prompt,
        metadata: { clarification, assetUrls: input.assetUrls || [] },
      } });
      return { userMessage, assistantMessage };
    }
    const previous = current.revision ? await this.projects.version(merchantId, storeId, current.revision) : null;
    const brief = previous ? (previous.snapshot as unknown as SourceProjectSnapshot).brief : {
      businessType: store.name.slice(0, 120), audience: 'Clientes del negocio descrito en la conversación',
      primaryAction: 'Explorar la oferta del negocio y hacer un pedido o contactar', visualDirection: input.instruction.slice(0, 2000),
    };
    const context = history.messages.slice(-6).map(message => `${message.role === 'USER' ? 'Comercio' : 'YAPI'}: ${message.content}`).join('\n').slice(-1400);
    const pendingAssets = lastMetadata?.clarification && Array.isArray(lastMetadata.assetUrls)
      ? lastMetadata.assetUrls.filter((url): url is string => typeof url === 'string') : [];
    try {
      const assetUrls = [...new Set([...pendingAssets, ...(input.assetUrls || [])])];
      if (assetUrls.length > 6) throw new BadRequestException('La conversación ya tiene imágenes adjuntas. Usa hasta seis en total.');
      const revision = await this.generation.generate(merchantId, storeId, {
        revision: input.revision, brief, instruction: `${context ? `Conversación anterior:\n${context}\n\n` : ''}Pedido actual del comercio:\n${input.instruction}`,
        assetUrls,
      });
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: `Preparé «${revision.label}». Revisa el sitio a la derecha y dime qué ajustamos. También puedes descargar sus archivos.`,
        metadata: { sourceRevision: revision.revision, label: revision.label },
      } });
      return { userMessage, assistantMessage, revision };
    } catch (error) {
      await this.prisma.storeAgentMessage.create({ data: {
        threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: 'No pude completar esta revisión. Tu pedido quedó en la conversación; puedes volver a intentarlo.', metadata: { failed: true },
      } });
      throw error;
    }
  }
}
