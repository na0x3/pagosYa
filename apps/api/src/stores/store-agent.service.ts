import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SendStoreAgentMessageDto } from "./dto/send-store-agent-message.dto";
import { VisualStudioService } from "./visual-studio.service";

@Injectable()
export class StoreAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visualStudio: VisualStudioService,
  ) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async conversation(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.findUnique({
      where: { storeId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } },
    });
    return { thread, messages: thread?.messages ?? [] };
  }

  async send(merchantId: string, storeId: string, dto: SendStoreAgentMessageDto) {
    await this.ownedStore(merchantId, storeId);
    if (dto.proposalId) {
      const source = await this.prisma.storeVisualProposal.findFirst({ where: { id: dto.proposalId, storeId }, select: { id: true } });
      if (!source) throw new NotFoundException("Visual proposal not found");
    }
    const instruction = dto.instruction.trim();
    const existing = await this.prisma.storeAgentThread.findUnique({
      where: { storeId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 8 } },
    });
    const thread = existing ?? await this.prisma.storeAgentThread.create({ data: { storeId } });
    await this.prisma.storeAgentThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    const userMessage = await this.prisma.storeAgentMessage.create({
      data: {
        threadId: thread.id,
        role: "USER",
        content: instruction,
        proposalId: dto.proposalId,
        metadata: { sourceProposalId: dto.proposalId ?? null },
      },
    });
    const context = (existing?.messages ?? []).slice().reverse().map((message) => `${message.role === "USER" ? "Comercio" : "Yapi"}: ${message.content}`);
    try {
      if (dto.proposalId) {
        const revision = await this.visualStudio.revise(merchantId, storeId, dto.proposalId, instruction, context);
        const assistantContent = `Preparé una variante privada. Cambié ${revision.changedAreas.join(", ")}. Conservé ${revision.preservedAreas.join(", ")}. Nada fue aplicado ni publicado.`;
        const assistantMessage = await this.prisma.storeAgentMessage.create({
          data: {
            threadId: thread.id,
            role: "ASSISTANT",
            content: assistantContent,
            proposalId: revision.proposal.id,
            metadata: {
              plan: revision.plan,
              changedAreas: revision.changedAreas,
              preservedAreas: revision.preservedAreas,
              sourceProposalId: dto.proposalId,
            } as Prisma.InputJsonObject,
          },
        });
        return { userMessage, assistantMessage, proposal: revision.proposal, proposals: [revision.proposal], revision: revision.plan };
      }

      const generated = await this.visualStudio.generate(merchantId, storeId, { creativeBrief: instruction });
      const proposals = generated.proposals ?? [];
      const primaryProposal = proposals[0] ?? null;
      const assistantContent = `Preparé ${proposals.length} ${proposals.length === 1 ? "dirección privada" : "direcciones privadas"} para comparar. Conservé productos, precios, inventario, checkout y estado público. Nada fue aplicado ni publicado.`;
      const assistantMessage = await this.prisma.storeAgentMessage.create({
        data: {
          threadId: thread.id,
          role: "ASSISTANT",
          content: assistantContent,
          proposalId: primaryProposal?.id,
          metadata: {
            proposalIds: proposals.map((proposal) => proposal.id),
            changedAreas: ["sitio visual"],
            preservedAreas: ["productos", "precios", "inventario", "checkout", "estado público"],
          },
        },
      });
      return { userMessage, assistantMessage, proposal: primaryProposal, proposals, mode: generated.mode, engine: generated.engine };
    } catch (error) {
      await this.prisma.storeAgentMessage.create({
        data: {
          threadId: thread.id,
          role: "ASSISTANT",
          content: "No pude preparar una variante segura con esta instrucción. La tienda y el borrador anterior siguen intactos.",
          proposalId: dto.proposalId,
          metadata: { failed: true },
        },
      });
      throw error;
    }
  }
}
