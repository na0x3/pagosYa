import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertWebsiteRevision, saveWebsiteDraftPatch, websiteEditorStore } from "../stores/website-draft";
import {
  storefrontCreativeRecipe,
  storefrontStructuralSignature
} from "./storefront-engine";
import { stableGeneratedProposalConfig } from "./generated-proposals";
import { storedSectionLocks, snapshot, storedSiteDocument, toStoreUpdate } from "./visual-config";
import { ownedStore } from "./visual-config";

/** The visual editor's saved state: listing proposals and versions, section locks, applying, restoring, dismissing, and saving templates. */
@Injectable()
export class VisualStudioService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async list(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const [proposals, versions, templates] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 24 }),
    ]);
    return {
      proposals: proposals.map((proposal) => ({ ...proposal, config: stableGeneratedProposalConfig(proposal.config) })),
      versions,
      templates,
      lockedSectionIds: storedSectionLocks(store.visualSectionLocks),
    };
  }
  async setSectionLocks(merchantId: string, storeId: string, sectionIds: string[]) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const document = storedSiteDocument(store.siteDocument);
    if (sectionIds.length && (!document || sectionIds.some((id) => !document.sections.some((section) => section.id === id)))) {
      throw new BadRequestException("Una o más secciones bloqueadas ya no existen en la versión actual de la tienda");
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { visualSectionLocks: sectionIds } });
    return { sectionIds };
  }
  async saveTemplate(merchantId: string, storeId: string, proposalId: string, name: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const config = proposal.config && typeof proposal.config === "object" && !Array.isArray(proposal.config)
      ? proposal.config as Record<string, unknown>
      : {};
    const document = storedSiteDocument(config.siteDocument);
    if (!document) throw new BadRequestException("La propuesta no contiene una receta visual reutilizable");
    const recipe = storefrontCreativeRecipe(document, name);
    const signature = storefrontStructuralSignature(document);
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.storeVisualTemplate.create({
        data: { merchantId, name: recipe.name, sourceProposalId: proposal.id, recipe: recipe as unknown as Prisma.InputJsonObject },
      });
      await transaction.storeVisualSignature.create({
        data: {
          storeId,
          sourceType: "TEMPLATE",
          sourceId: template.id,
          fingerprint: signature.fingerprint,
          signature: signature as unknown as Prisma.InputJsonObject,
        },
      });
      return template;
    });
  }
  async apply(merchantId: string, storeId: string, proposalId: string, revision?: number) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    if (proposal.baseWebsiteRevision !== revision) throw new ConflictException("Esta propuesta pertenece a un borrador anterior. Pide el cambio de nuevo sobre el borrador actual.");
    const config = toStoreUpdate(stableGeneratedProposalConfig(proposal.config)) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, config, undefined, {
      label: `Antes de “${proposal.title}”`, source: `draft-proposal:${proposal.id}`, snapshot: snapshot(websiteEditorStore(store)),
    });
  }
  async restore(merchantId: string, storeId: string, versionId: string, revision?: number) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const version = await this.prisma.storeVisualVersion.findFirst({ where: { id: versionId, storeId } });
    if (!version) throw new NotFoundException("Visual version not found");
    const saved = version.snapshot as Prisma.JsonObject;
    // Publication snapshots contain additional normalized settings. All keys
    // originate on the server, never from a restore request body.
    const { links, ...data } = version.source.startsWith("publish:") ? saved : toStoreUpdate(saved) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, data,
      Array.isArray(links) ? links as Array<{ label: string; url: string }> : undefined,
      { label: "Antes de restaurar borrador", source: `draft-restore:${version.id}`, snapshot: snapshot(websiteEditorStore(store)) });
  }
  async dismiss(merchantId: string, storeId: string, proposalId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    return this.prisma.storeVisualProposal.update({ where: { id: proposalId }, data: { status: "DISMISSED" } });
  }
}
