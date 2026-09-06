import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SourceProjectsService } from './source-projects.service';
import { SourceGenerationService } from './source-generation.service';
import { storeAgentClarificationForInstruction } from './store-agent.service';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import { newSourceSetup, sourceSetupPrompt, type SourceSetupDraft, type SetupStep } from './source-setup';
import type { SourceProjectSnapshot } from './source-project';

@Injectable()
export class SourceChatService {
  constructor(private readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService) {}

  private async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, logoUrl: true, _count: { select: { paymentLinks: true } } } });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async conversation(merchantId: string, storeId: string) {
    const store = await this.owner(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.findUnique({ where: { storeId }, include: {
      messages: { where: { channel: 'source' }, orderBy: { createdAt: 'desc' }, take: 100 },
    } });
    const messages = (thread?.messages || []).reverse();
    const current = await this.projects.state(merchantId, storeId);
    const draft = this.setupDraft(messages);
    return { messages, setup: current.revision ? null : sourceSetupPrompt(draft, store) };
  }

  private setupDraft(messages: Array<{ metadata?: unknown }>): SourceSetupDraft {
    const last = [...messages].reverse().find(message => (message.metadata as any)?.sourceSetup);
    return (last?.metadata as any)?.sourceSetup || newSourceSetup();
  }

  async send(merchantId: string, storeId: string, input: SendSourceMessageDto) {
    const store = await this.owner(merchantId, storeId);
    const current = await this.projects.state(merchantId, storeId);
    if (current.revision !== input.revision) throw new ConflictException('El sitio cambió en otra sesión. Actualiza antes de enviar.');
    const history = await this.conversation(merchantId, storeId);
    let setupDraft = !current.revision ? this.setupDraft(history.messages) : null;
    if (setupDraft && input.setupStep && setupDraft.step !== input.setupStep) throw new ConflictException('La conversación avanzó. Actualiza antes de responder.');
    if (input.setupAction === 'generate' && setupDraft?.step !== 'review') throw new BadRequestException('Primero completa los detalles de tu negocio.');
    const existingLogo = setupDraft?.step === 'logo' && input.instruction === 'Usar mi logo actual' && store.logoUrl ? [store.logoUrl] : [];
    const allAssets = [...new Set([...(setupDraft?.assetUrls || []), ...existingLogo, ...(input.assetUrls || [])])];
    if (allAssets.length > 6) throw new BadRequestException('Usa hasta seis imágenes en total para la primera versión.');
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: { updatedAt: new Date() } });
    const userMessage = await this.prisma.storeAgentMessage.create({ data: {
      threadId: thread.id, channel: 'source', role: 'USER', content: input.instruction.trim(),
      metadata: { assetUrls: input.assetUrls || [], revision: input.revision },
    } });
    if (setupDraft && input.setupAction !== 'generate') {
      if (input.setupAction === 'restart') setupDraft = newSourceSetup();
      else {
        setupDraft = { ...setupDraft, answers: { ...setupDraft.answers }, assetUrls: allAssets };
        if (setupDraft.step === 'review') setupDraft.answers.adjustments = [setupDraft.answers.adjustments, input.instruction.trim()].filter(Boolean).join('\n').slice(-2000);
        else {
          setupDraft.answers[setupDraft.step] = input.instruction.trim().slice(0, 2000);
          if (setupDraft.step === 'logo' && input.instruction === 'Usar mi logo actual' && store.logoUrl && !setupDraft.assetUrls.includes(store.logoUrl)) {
            setupDraft.assetUrls.push(store.logoUrl);
          }
          const steps: SetupStep[] = ['business', 'logo', 'products', 'colors', 'review'];
          setupDraft.step = steps[steps.indexOf(setupDraft.step) + 1];
        }
      }
      const setup = sourceSetupPrompt(setupDraft, store);
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: setup.prompt,
        metadata: { sourceSetup: setupDraft },
      } });
      return { userMessage, assistantMessage, setup };
    }
    const last = history.messages.at(-1);
    const lastMetadata = last?.metadata as Record<string, unknown> | undefined;
    const clarification = setupDraft || lastMetadata?.clarification ? null : storeAgentClarificationForInstruction(input.instruction);
    if (clarification) {
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
        threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: clarification.prompt,
        metadata: { clarification, assetUrls: input.assetUrls || [] },
      } });
      return { userMessage, assistantMessage };
    }
    const previous = current.revision ? await this.projects.version(merchantId, storeId, current.revision) : null;
    const brief = previous ? (previous.snapshot as unknown as SourceProjectSnapshot).brief : {
      businessType: (setupDraft?.answers.business || store.name).slice(0, 120), audience: 'Clientes del negocio descrito en la conversación',
      primaryAction: 'Explorar la oferta del negocio y hacer un pedido o contactar', visualDirection: (setupDraft?.answers.colors || input.instruction).slice(0, 2000),
    };
    const context = history.messages.slice(-6).map(message => `${message.role === 'USER' ? 'Comercio' : 'YAPI'}: ${message.content}`).join('\n').slice(-1400);
    const pendingAssets = lastMetadata?.clarification && Array.isArray(lastMetadata.assetUrls)
      ? lastMetadata.assetUrls.filter((url): url is string => typeof url === 'string') : [];
    try {
      const assetUrls = [...new Set([...pendingAssets, ...allAssets])];
      if (assetUrls.length > 6) throw new BadRequestException('La conversación ya tiene imágenes adjuntas. Usa hasta seis en total.');
      const revision = await this.generation.generate(merchantId, storeId, {
        revision: input.revision, brief, instruction: `${context ? `Conversación anterior:\n${context}\n\n` : ''}${setupDraft ? `Detalles acordados:\n${JSON.stringify(setupDraft.answers)}\nImágenes adjuntas: ${JSON.stringify(setupDraft.assetUrls)}\n` : ''}Pedido actual del comercio:\n${input.instruction}`,
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
