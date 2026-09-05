import { ConflictException } from "@nestjs/common";
import { Prisma, Store } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

// Only normalized storefront settings enter this object. Keep operational
// identity, credentials, stock and payment records outside the draft.
export type WebsiteDraft = {
  data: Prisma.JsonObject;
  links?: Array<{ label: string; url: string }>;
  basePublishedRevision: number;
  inventoryChanges?: Array<{ id: string; name: string; beforeStock: number | null; beforeLocations: Prisma.JsonValue; stock: number | null; locationStocks: Record<string, number | null> }>;
  locationInventory?: Array<{ id: string; inventory: Array<{ paymentLinkId: string; stock: number | null }> }>;
};

export function websiteDraft(store: Pick<Store, "websiteDraft">): WebsiteDraft | null {
  const value = store.websiteDraft;
  return value && typeof value === "object" && !Array.isArray(value) && value.data
    ? value as unknown as WebsiteDraft : null;
}

export function websiteEditorStore<T extends Store>(store: T): T {
  const draft = websiteDraft(store);
  return draft ? { ...store, ...draft.data, ...(draft.links ? { links: draft.links } : {}) } as T : store;
}

export function assertWebsiteRevision(store: Store, revision: number | undefined) {
  if (!Number.isSafeInteger(revision) || revision !== (store.websiteRevision ?? 0)) {
    throw new ConflictException("El borrador cambió en otra pestaña o mientras Yapi trabajaba. Conservamos tus cambios; vuelve a abrir el borrador actualizado antes de intentarlo.");
  }
  const draft = websiteDraft(store);
  if (draft && draft.basePublishedRevision !== (store.websitePublishedRevision ?? 0)) {
    throw new ConflictException("La tienda pública cambió después de este borrador. Revisa la versión publicada antes de preparar un borrador nuevo.");
  }
}

export function websiteUpdateData(data: Prisma.JsonObject): Prisma.StoreUpdateInput {
  const result = { ...data } as Record<string, unknown>;
  for (const key of ["siteDocument", "heroSlides", "contentOrder", "sectionBackgrounds", "locations", "animations", "motionExperiences", "editorialGallery", "cartRecommendationProductIds"]) {
    if (result[key] === null) result[key] = Prisma.DbNull;
  }
  return result as Prisma.StoreUpdateInput;
}

export async function saveWebsiteDraftPatch(
  prisma: PrismaService, store: Store, revision: number | undefined,
  data: Prisma.JsonObject, links?: WebsiteDraft["links"],
  history?: { label: string; source: string; snapshot: Prisma.InputJsonObject },
  inventory?: Pick<WebsiteDraft, "inventoryChanges" | "locationInventory">,
) {
  assertWebsiteRevision(store, revision);
  const previous = websiteDraft(store);
  const draft: WebsiteDraft = {
    data: { ...previous?.data, ...data },
    ...(links || previous?.links ? { links: links ?? previous?.links } : {}),
    basePublishedRevision: store.websitePublishedRevision ?? 0,
    ...(previous?.inventoryChanges ? { inventoryChanges: previous.inventoryChanges, locationInventory: previous.locationInventory } : {}),
    ...inventory,
  };
  return prisma.$transaction(async (tx) => {
    const result = await tx.store.updateMany({
      where: { id: store.id, merchantId: store.merchantId, websiteRevision: revision },
      data: { websiteDraft: draft as unknown as Prisma.InputJsonObject, websiteRevision: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException("Llegaron cambios más recientes. Tu borrador no se reemplazó; recarga para revisarlos.");
    if (history) await tx.storeVisualVersion.create({ data: { storeId: store.id, ...history } });
    return websiteEditorStore({ ...store, websiteDraft: draft as unknown as Prisma.JsonObject, websiteRevision: (revision as number) + 1 });
  });
}
