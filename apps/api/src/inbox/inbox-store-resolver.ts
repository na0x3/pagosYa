import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { workspaceMail } from "../email-workspace/email-workspace.config";

/** Maps any address at inbound.<dominio> (the local part is not checked) back to
 * the store that verified that domain. */
@Injectable()
export class InboxStoreResolver {
  constructor(private readonly prisma: PrismaService) {}

  async findByInboundAddress(address: string) {
    const host = address.split("@")[1]?.trim().toLowerCase() ?? "";
    const domain = host.startsWith("inbound.") ? host.slice("inbound.".length) : "";
    if (!domain) return null;
    const row = await this.prisma.storeRetention.findFirst({
      where: { settings: { path: ["emailWorkspace", "domain", "name"], equals: domain } },
      select: { storeId: true },
    });
    if (!row) return null;
    const settings = await this.prisma.storeRetention.findUnique({ where: { storeId: row.storeId } });
    // A domain that lost verification must stop receiving on the store's behalf.
    if (workspaceMail(settings?.settings).domain?.status !== "verified") return null;
    return { id: row.storeId };
  }
}
