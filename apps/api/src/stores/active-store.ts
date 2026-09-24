import { NotFoundException } from "@nestjs/common";
import { Prisma, Store, StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Shared public eligibility, for both Prisma queries and already-loaded stores. */
export const PUBLIC_STORE_WHERE = {
  status: StoreStatus.ACTIVE,
  sourcePublicationPaused: false,
  publicVisibility: true,
} as const satisfies Prisma.StoreWhereInput;

export function isPublicStore(store: Pick<Store, keyof typeof PUBLIC_STORE_WHERE>): boolean {
  return store.status === PUBLIC_STORE_WHERE.status
    && store.sourcePublicationPaused === PUBLIC_STORE_WHERE.sourcePublicationPaused
    && store.publicVisibility === PUBLIC_STORE_WHERE.publicVisibility;
}

/** Shared by public routes without introducing a dependency on StoresModule. */
export async function findActiveStoreBySlug(prisma: PrismaService, slug: string) {
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store || !isPublicStore(store)) throw new NotFoundException("Esta tienda ya no está disponible");
  return store;
}
