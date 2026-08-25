import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { customAlphabet } from "nanoid";
import { ApiKeyMode, ApiKeyType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateSecretPart = customAlphabet(alphabet, 32);

export interface IssuedApiKey {
  id: string;
  fullKey: string;
  keyPrefix: string;
  mode: ApiKeyMode;
  type: ApiKeyType;
  label: string | null;
  createdAt: Date;
}

export interface ApiKeySummary {
  id: string;
  mode: ApiKeyMode;
  type: ApiKeyType;
  label: string | null;
  maskedKey: string;
  createdAt: Date;
  revokedAt: Date | null;
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

  async issue(merchantId: string, type: ApiKeyType, mode: ApiKeyMode, label?: string): Promise<IssuedApiKey> {
    const prepared = await this.prepare(merchantId, type, mode, label);
    const record = await this.prisma.apiKey.create({ data: prepared.data });

    return {
      id: record.id,
      fullKey: prepared.fullKey,
      keyPrefix: prepared.keyPrefix,
      mode: record.mode,
      type: record.type,
      label: record.label,
      createdAt: record.createdAt,
    };
  }

  async list(merchantId: string): Promise<ApiKeySummary[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, mode: true, type: true, keyPrefix: true, label: true, lastFour: true, createdAt: true, revokedAt: true },
    });
    return keys.map(({ keyPrefix, lastFour, ...key }) => ({
      ...key,
      maskedKey: `${keyPrefix}_••••${lastFour ?? ""}`,
    }));
  }

  async issueManaged(merchantId: string, type: ApiKeyType, mode: ApiKeyMode, label?: string) {
    await this.assertModeAllowed(merchantId, mode);
    return this.issue(merchantId, type, mode, label?.trim() || undefined);
  }

  async rotate(merchantId: string, id: string) {
    const current = await this.ownedActiveKey(merchantId, id);
    await this.assertModeAllowed(merchantId, current.mode);
    const prepared = await this.prepare(merchantId, current.type, current.mode, current.label ?? undefined);
    const [record] = await this.prisma.$transaction([
      this.prisma.apiKey.create({ data: prepared.data }),
      this.prisma.apiKey.update({ where: { id: current.id }, data: { revokedAt: new Date() } }),
    ]);
    return {
      id: record.id,
      fullKey: prepared.fullKey,
      keyPrefix: prepared.keyPrefix,
      mode: record.mode,
      type: record.type,
      label: record.label,
      createdAt: record.createdAt,
    };
  }

  async revoke(merchantId: string, id: string): Promise<void> {
    const key = await this.ownedActiveKey(merchantId, id);
    await this.prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  }

  private async ownedActiveKey(merchantId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, merchantId, revokedAt: null } });
    if (!key) throw new NotFoundException("API key not found");
    return key;
  }

  private async assertModeAllowed(merchantId: string, mode: ApiKeyMode): Promise<void> {
    if (mode !== ApiKeyMode.LIVE) return;
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.status !== "ACTIVE") {
      throw new ForbiddenException("Live API keys require an approved KYC profile");
    }
  }

  private async prepare(merchantId: string, type: ApiKeyType, mode: ApiKeyMode, label?: string) {
    const keyPrefix = this.prefixFor(type, mode);
    const fullKey = `${keyPrefix}_${generateSecretPart()}`;
    const hashedSecret = await argon2.hash(fullKey);
    return {
      fullKey,
      keyPrefix,
      data: { merchantId, mode, type, keyPrefix, label, lastFour: fullKey.slice(-4), hashedSecret },
    };
  }

  /** Looks up an ApiKey by its prefix, then verifies the full presented key against the stored hash. */
  async verify(presentedKey: string, expectedType: ApiKeyType) {
    if (!/^(?:sk|pk)_(?:test|live)_[0-9A-Za-z]{32}$/.test(presentedKey)) return null;
    const parts = presentedKey.split("_");
    const keyPrefix = parts.slice(0, 2).join("_");

    const candidates = await this.prisma.apiKey.findMany({
      // lastFour is not secret, but makes invalid-key work effectively O(1)
      // instead of Argon2-verifying every key in the same mode/type bucket.
      where: { keyPrefix, lastFour: presentedKey.slice(-4), type: expectedType, revokedAt: null },
      include: { merchant: true },
      take: 4,
    });

    for (const candidate of candidates) {
      if (await argon2.verify(candidate.hashedSecret, presentedKey)) {
        return candidate;
      }
    }
    return null;
  }
}
