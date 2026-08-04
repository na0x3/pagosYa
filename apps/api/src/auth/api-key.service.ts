import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { ApiKeyMode, ApiKeyType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);

export interface IssuedApiKey {
  fullKey: string;
  keyPrefix: string;
  record: { id: string };
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /** e.g. "sk_test", "pk_live" — narrows candidate lookup without ever storing/comparing the raw secret. */
  private prefixFor(type: ApiKeyType, mode: ApiKeyMode): string {
    const kind = type === ApiKeyType.SECRET ? "sk" : "pk";
    const env = mode === ApiKeyMode.TEST ? "test" : "live";
    return `${kind}_${env}`;
  }

  async issue(merchantId: string, type: ApiKeyType, mode: ApiKeyMode): Promise<IssuedApiKey> {
    const keyPrefix = this.prefixFor(type, mode);
    const fullKey = `${keyPrefix}_${generateSecretPart()}`;
    const hashedSecret = await argon2.hash(fullKey);

    const record = await this.prisma.apiKey.create({
      data: { merchantId, mode, type, keyPrefix, hashedSecret },
    });

    return { fullKey, keyPrefix, record: { id: record.id } };
  }

  /** Looks up an ApiKey by its prefix, then verifies the full presented key against the stored hash. */
  async verify(presentedKey: string, expectedType: ApiKeyType) {
    const parts = presentedKey.split("_");
    if (parts.length < 3) return null;
    const keyPrefix = parts.slice(0, 2).join("_");

    const candidates = await this.prisma.apiKey.findMany({
      where: { keyPrefix, type: expectedType, revokedAt: null },
      include: { merchant: true },
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedSecret, presentedKey)) {
        return candidate;
      }
    }
    return null;
  }
}
