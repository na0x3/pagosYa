import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SendStoreAgentMessageDto } from "./dto/send-store-agent-message.dto";
import { assertWebsiteRevision, websiteEditorStore } from "./website-draft";
import { instructionUsesSelection } from "./store-agent-selection";
import { requestsStoreRedesign } from "./store-agent-intent";
import {
  storeAgentInstructionIsScoped,
  storeAgentInstructionLooksLikeEditorCommand,
  storeAgentInstructionLooksLikeProductCreation,
  VisualStudioService,
} from "./visual-studio.service";

type StoreAgentClarificationOption = {
  id: string;
  label: string;
  value: string;
};

type StoreAgentClarification = {
  id: string;
  prompt: string;
  options: StoreAgentClarificationOption[];
};

function normalizeAgentInstruction(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

function storeAgentInstructionRepairsPreviousRevision(instruction: string): boolean {
  const text = normalizeAgentInstruction(instruction);
  return /\b(solo queria|solamente queria|unicamente queria|no te pedi|nunca pedi|nada que ver|deshaz|deshacer|revierte|revertir|vuelve al anterior)\b/.test(text);
}

export function storeAgentClarificationForInstruction(instruction: string): StoreAgentClarification | null {
  const text = normalizeAgentInstruction(instruction);
  const concreteTarget = /\b(portadas?|hero|titulos?|textos?|boton(?:es)?|color(?:es)?|paletas?|imagen(?:es)?|fotos?|galerias?|catalogos?|productos?|seccion(?:es)?|sliders?|carrusel(?:es)?|diapositivas?|historia|footer|pie|redes|instagram|tiktok|whatsapp|enlaces?|menu|navegacion|tipografia|fuentes?|animacion(?:es)?|movimiento|orden|fondo|coleccion|contacto)\b/.test(text);
  const vagueDirection = /\b(bonit[oa]|lind[oa]|mejor|mejora|mejorar|atractiv[oa]|profesional|modern[oa]|diferente|arregla|arreglar|cambia|cambiar|redisena|redisenar|disena|disenar)\b/.test(text);
  const broadStoreRequest = /^(quiero\s+)?(que\s+)?(mejora|mejorar|arregla|arreglar|cambia|cambiar|redisena|redisenar|disena|disenar|haz)(me|la|lo)?(?:\s+(mi|la|el))?(?:\s+(tienda|sitio|pagina))?(?:\s+(mas\s+)?(bonita|bonito|linda|lindo|mejor|atractiva|atractivo|profesional|moderna|moderno|diferente))?[.!?]*$/.test(text);
  if (text.length >= 12 && !broadStoreRequest && (!vagueDirection || concreteTarget)) return null;

  if (/\b(portada|hero)\b/.test(text)) {
    return {
      id: "opening_direction",
      prompt: "¿Qué dirección quieres para la portada?",
      options: [
        { id: "warm", label: "Más cálida", value: "Haz la portada más cálida y cercana, conservando productos, precios y checkout." },
        { id: "editorial", label: "Más editorial", value: "Haz la portada más editorial, con una jerarquía tipográfica más marcada y el catálogo intacto." },
        { id: "conversion", label: "Más directa para vender", value: "Haz la portada más directa para vender, con un mensaje y llamado a la acción claros, sin cambiar precios." },
      ],
    };
  }

  return {
    id: "storefront_priority",
    prompt: "¿Qué debería priorizar Yapi en esta pasada?",
    options: [
      { id: "opening", label: "Portada y mensaje", value: "Prioriza la portada: mejora el mensaje, la jerarquía y el llamado a la acción, sin cambiar productos ni precios." },
      { id: "visual", label: "Color y estilo", value: "Prioriza el color y el estilo visual de toda la tienda, conservando catálogo, precios y checkout." },
      { id: "catalog", label: "Catálogo y orden", value: "Prioriza la organización visual del catálogo y el orden de las secciones, sin cambiar productos, precios ni inventario." },
    ],
  };
}

@Injectable()
export class StoreAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visualStudio: VisualStudioService,
  ) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async conversation(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.findUnique({
      where: { storeId },
      include: { messages: { where: { channel: "website" }, orderBy: { createdAt: "asc" } } },
    });
    const messages = thread?.messages ?? [];
    return { thread: thread ? { ...thread, messages } : null, messages };
  }

  async send(merchantId: string, storeId: string, dto: SendStoreAgentMessageDto) {
    const publishedStore = await this.ownedStore(merchantId, storeId);
    assertWebsiteRevision(publishedStore, dto.revision);
    const ownedStore = websiteEditorStore(publishedStore);
    let selectedProposal: { id: string; sourceAssetUrls?: unknown } | null = null;
    if (dto.proposalId) {
      selectedProposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: dto.proposalId, storeId }, select: { id: true, sourceAssetUrls: true } });
      if (!selectedProposal) throw new NotFoundException("Visual proposal not found");
    }
    const submittedInstruction = dto.instruction.trim();
    const existing = await this.prisma.storeAgentThread.findUnique({
      where: { storeId },
      include: { messages: { where: { channel: "website" }, orderBy: { createdAt: "desc" }, take: 8 } },
    });
    const latestMessage = existing?.messages?.[0];
    const latestMetadata = latestMessage?.metadata && typeof latestMessage.metadata === "object" && !Array.isArray(latestMessage.metadata)
      ? latestMessage.metadata as Prisma.JsonObject
      : null;
    const pendingRequest = latestMetadata?.pendingRequest && typeof latestMetadata.pendingRequest === "object" && !Array.isArray(latestMetadata.pendingRequest)
      ? latestMetadata.pendingRequest as Prisma.JsonObject
      : null;
    const startsNewTask = requestsStoreRedesign(submittedInstruction)
      || /^(olvida|olvidalo|cancela|cancelar|otra cosa|nuevo pedido|nueva tarea|en vez de eso)\b/.test(normalizeAgentInstruction(submittedInstruction));
    const answeringClarification = latestMessage?.role === "ASSISTANT" && Boolean(latestMetadata?.clarification)
      && !startsNewTask
      && (!dto.proposalId || (pendingRequest?.proposalId ?? latestMessage.proposalId) === dto.proposalId);
    const instruction = answeringClarification && typeof pendingRequest?.instruction === "string"
      ? `${pendingRequest.instruction}\n\nAclaración del comercio: ${submittedInstruction}`
      : submittedInstruction;
    const proposalId = dto.proposalId ?? (answeringClarification && typeof pendingRequest?.proposalId === "string" ? pendingRequest.proposalId : undefined);
    if (proposalId && !selectedProposal) {
      selectedProposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId }, select: { id: true, sourceAssetUrls: true } });
      if (!selectedProposal) throw new NotFoundException("Visual proposal not found");
    }
    // A clarification continues the same ordered attachment batch, including
    // after a refresh. The visual service rechecks ownership before using it.
    const pendingAssetUrls = answeringClarification && Array.isArray(pendingRequest?.assetUrls)
      ? pendingRequest.assetUrls.filter((url): url is string => typeof url === "string")
      : [];
    const assetUrls = [...new Set([...pendingAssetUrls, ...(dto.assetUrls ?? [])])];
    const selection = dto.selection !== undefined ? dto.selection : (answeringClarification && pendingRequest?.revision === dto.revision
      ? pendingRequest?.selection as unknown as SendStoreAgentMessageDto["selection"] : undefined);
    const thread = existing ?? await this.prisma.storeAgentThread.create({ data: { storeId } });
    await this.prisma.storeAgentThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    const userMessage = await this.prisma.storeAgentMessage.create({
      data: {
        threadId: thread.id,
        role: "USER",
        content: submittedInstruction,
        proposalId,
        metadata: {
          sourceProposalId: proposalId ?? null,
          assetUrls,
          revision: dto.revision,
          ...(selection ? { selection: selection as unknown as Prisma.InputJsonObject } : {}),
        },
      },
    });
    const context = (existing?.messages ?? []).slice().reverse().map((message) => `${message.role === "USER" ? "Comercio" : "Yapi"}: ${message.content}`);
    try {
      const asksForAdvice = /(?:que|como|what|how).{0,45}(?:mejorarias|recomiendas|aconsejas|puedo mejorar|podria mejorar|improve|recommend)|(?:dame|give me).{0,20}(?:ideas|consejos|sugerencias|suggestions)/i.test(normalizeAgentInstruction(instruction));
      if (asksForAdvice) {
        const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, role: "ASSISTANT",
          content: "Revisaría tres cosas: que el primer título explique qué vendes, que la foto principal muestre bien el producto y que el botón indique el siguiente paso. Podemos empezar por el título o la foto que selecciones. No cambié el borrador.",
          metadata: { intent: "advice", changedAreas: [] } } });
        return { userMessage, assistantMessage, proposals: [], intent: "advice" };
      }
      const redesign = requestsStoreRedesign(instruction);
      const clarification = redesign ? null : instructionUsesSelection(instruction) && !selection
        ? { id: "select_target", prompt: "Selecciona en la vista previa el texto o la foto que quieres cambiar y vuelve a enviar el pedido.", options: [] }
        : answeringClarification || selection ? null : storeAgentClarificationForInstruction(instruction);
      if (clarification) {
        const assistantMessage = await this.prisma.storeAgentMessage.create({
          data: {
            threadId: thread.id,
            role: "ASSISTANT",
            content: clarification.prompt,
            proposalId,
            metadata: { clarification, pendingRequest: { instruction, proposalId: proposalId ?? null, assetUrls, revision: dto.revision, ...(selection ? { selection } : {}) } } as unknown as Prisma.InputJsonObject,
          },
        });
        return {
          userMessage,
          assistantMessage,
          needsClarification: true,
          question: clarification,
          proposals: [],
        };
      }

      const hasStructuredStorefront = Boolean(
        ownedStore.siteDocument
        && typeof ownedStore.siteDocument === "object"
        && !Array.isArray(ownedStore.siteDocument)
        && Array.isArray((ownedStore.siteDocument as Prisma.JsonObject).sections),
      );
      const richEditorCommand = this.visualStudio.canPlanStorefrontOperations()
        && storeAgentInstructionLooksLikeEditorCommand(instruction);
      const productCreation = storeAgentInstructionLooksLikeProductCreation(instruction);
      if (!redesign && (proposalId || selection || (hasStructuredStorefront && (answeringClarification || storeAgentInstructionIsScoped(instruction) || richEditorCommand || productCreation)))) {
        const repairSourceProposalId = storeAgentInstructionRepairsPreviousRevision(instruction)
          ? (existing?.messages ?? []).find((message) => {
              if (message.role !== "ASSISTANT" || message.proposalId !== proposalId) return false;
              const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
                ? message.metadata as Prisma.JsonObject
                : null;
              return typeof metadata?.sourceProposalId === "string" && metadata.sourceProposalId !== proposalId;
            })?.metadata
          : null;
        const repairSourceMetadata = repairSourceProposalId && typeof repairSourceProposalId === "object" && !Array.isArray(repairSourceProposalId)
          ? repairSourceProposalId as Prisma.JsonObject
          : null;
        const effectiveProposalId = typeof repairSourceMetadata?.sourceProposalId === "string"
          ? repairSourceMetadata.sourceProposalId
          : proposalId ?? null;
        const inheritedAssetUrls = effectiveProposalId !== proposalId && Array.isArray(selectedProposal?.sourceAssetUrls)
          ? selectedProposal.sourceAssetUrls.filter((url): url is string => typeof url === "string")
          : [];
        const revisionAssetUrls = [...new Set([...assetUrls, ...inheritedAssetUrls])];
        const revision = await this.visualStudio.revise(merchantId, storeId, effectiveProposalId, instruction, context, revisionAssetUrls, { revision: dto.revision, selection: selection ?? undefined });
        const socialLinkNote = revision.plan.target === "footer" && revision.plan.socialHandle && revision.plan.socialPlatform === "unknown"
          ? ` Mostré ${revision.plan.socialHandle} como texto; dime la plataforma o el enlace si quieres que sea clicable.`
          : "";
        const createdProductCount = revision.createdProducts?.length ?? 0;
        const productNote = createdProductCount
          ? ` Creé ${createdProductCount} ${createdProductCount === 1 ? "producto activo" : "productos activos"}; su ubicación en las páginas queda en esta variante para que la revises y la apliques.`
          : " Nada fue aplicado ni publicado.";
        const assistantContent = `Preparé una variante privada. Cambié ${revision.changedAreas.join(", ")}. Conservé ${revision.preservedAreas.join(", ")}.${socialLinkNote}${productNote}`;
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
              createdProductIds: revision.createdProducts?.map((product) => product.id) ?? [],
              sourceProposalId: effectiveProposalId,
            } as Prisma.InputJsonObject,
          },
        });
        return { userMessage, assistantMessage, proposal: revision.proposal, proposals: [revision.proposal], revision: revision.plan };
      }

      const generated = await this.visualStudio.generate(merchantId, storeId, {
        revision: dto.revision,
        creativeBrief: instruction,
        assetUrls: assetUrls.length ? assetUrls : undefined,
        lockedSectionIds: Array.isArray(ownedStore.visualSectionLocks)
          ? ownedStore.visualSectionLocks.filter((id): id is string => typeof id === "string").slice(0, 12)
          : undefined,
      });
      const proposals = generated.proposals ?? [];
      const primaryProposal = proposals[0] ?? null;
      const generationNote = generated.mode === "local" ? " Usé composiciones de respaldo; la generación personalizada no estuvo disponible en este intento." : "";
      const assistantContent = `Preparé ${proposals.length} ${proposals.length === 1 ? "dirección privada" : "direcciones privadas"} para comparar.${generationNote} Conservé productos, precios, inventario, checkout y estado público. Nada fue aplicado ni publicado.`;
      const assistantMessage = await this.prisma.storeAgentMessage.create({
        data: {
          threadId: thread.id,
          role: "ASSISTANT",
          content: assistantContent,
          proposalId: primaryProposal?.id,
          metadata: {
            intent: redesign ? "redesign" : "generate",
            generationMode: generated.mode ?? "unknown",
            proposalIds: proposals.map((proposal) => proposal.id),
            changedAreas: ["sitio visual"],
            preservedAreas: ["productos", "precios", "inventario", "checkout", "estado público"],
          },
        },
      });
      return { userMessage, assistantMessage, proposal: primaryProposal, proposals, mode: generated.mode, engine: generated.engine };
    } catch (error) {
      const failureContent = error instanceof HttpException && error.getStatus() < 500
        ? error.message
        : "No pude preparar una variante segura con esta instrucción. La tienda y el borrador anterior siguen intactos.";
      await this.prisma.storeAgentMessage.create({
        data: {
          threadId: thread.id,
          role: "ASSISTANT",
          content: failureContent,
          proposalId,
          metadata: {
            failed: true,
            statusCode: error instanceof HttpException ? error.getStatus() : 500,
            ...(answeringClarification && pendingRequest ? { clarification: latestMetadata!.clarification, pendingRequest } : {}),
          } as Prisma.InputJsonObject,
        },
      });
      throw error;
    }
  }
}
