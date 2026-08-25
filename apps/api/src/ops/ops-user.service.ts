import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { OpsRole } from "@prisma/client";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);

/**
 * Per-person credentials for pagosYa staff doing ops review (KYC today).
 * Mirrors ApiKeyService's issue/verify shape, but there's no meaningful
 * prefix to narrow lookup by (a handful of staff, not thousands of keys),
 * so verify() just scans active users and argon2-verifies each.
 */
@Injectable()
export class OpsUserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    name: string,
    email: string,
    role: OpsRole = OpsRole.SUPPORT_AGENT,
  ): Promise<{ user: { id: string; name: string; email: string; role: OpsRole }; fullToken: string }> {
    const fullToken = `ops_${generateSecretPart()}`;
    const hashedToken = await argon2.hash(fullToken);
    const user = await this.prisma.opsUser.create({ data: { name, email, hashedToken, role } });
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, fullToken };
  }

  async revoke(id: string) {
    return this.prisma.opsUser.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async verify(presentedToken: string): Promise<{ id: string; name: string; email: string; role: OpsRole } | null> {
    if (!presentedToken.startsWith("ops_")) return null;

    const candidates = await this.prisma.opsUser.findMany({ where: { revokedAt: null } });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedToken, presentedToken)) {
        return { id: candidate.id, name: candidate.name, email: candidate.email, role: candidate.role };
      }
    }
    return null;
  }
}
