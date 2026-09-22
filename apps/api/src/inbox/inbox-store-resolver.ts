import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { workspaceMail } from "../email-workspace/email-workspace.config";

/** Maps any address at inbound.<dominio> (the local part is not checked) back to
 * the store that verified that domain. */
@Injectable()
export class InboxStoreResolver {
  private readonly logger = new Logger(InboxStoreResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByInboundAddress(address: string) {
    const host = address.split("@")[1]?.trim().toLowerCase() ?? "";
    const domain = host.startsWith("inbound.") ? host.slice("inbound.".length) : "";
    if (!domain) return null;
    // Both conditions are asked of the database in ONE query, on purpose.
    //
    // The domain name is not a unique column, so nothing stops a second store
    // from claiming a domain it does not own. Matching on the name alone and
    // checking verification afterwards means a squatter's unverified row can
    // be the one findFirst returns, and the real owner's mail is then dropped
    // platform-wide with no trace. Filtering on verified status inside the
    // query removes that shadowing entirely.
    //
    // And if two VERIFIED stores still somehow claim one domain, there is no
    // right answer, only a coin flip that misroutes a stranger's private mail
    // into someone else's inbox. `take: 2` is enough to detect it, and the
    // message is dropped rather than guessed.
    const rows = await this.prisma.storeRetention.findMany({
      where: {
        AND: [
          { settings: { path: ["emailWorkspace", "domain", "name"], equals: domain } },
          // A domain that lost verification must stop receiving on the store's behalf.
          { settings: { path: ["emailWorkspace", "domain", "status"], equals: "verified" } },
        ],
      },
      select: { storeId: true, settings: true },
      take: 2,
    });
    if (rows.length !== 1) {
      if (rows.length > 1) this.logger.error(`Inbound domain ${domain} is claimed by more than one verified store; message dropped`);
      return null;
    }
    // Re-read through workspaceMail so the JSON path filter above can never be
    // the only thing standing between an unverified domain and the inbox.
    if (workspaceMail(rows[0].settings).domain?.status !== "verified") return null;
    return { id: rows[0].storeId };
  }
}
