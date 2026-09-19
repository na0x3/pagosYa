import { NotFoundException } from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** A store that shoppers may see: published and not paused. Shared by modules that
 * serve public store routes but must not depend on StoresModule (it depends on them). */
export async function findActiveStoreBySlug(prisma: PrismaService, slug: string) {
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store || store.status !== StoreStatus.ACTIVE || store.sourcePublicationPaused) throw new NotFoundException("Esta tienda ya no está disponible");
  return store;
}
