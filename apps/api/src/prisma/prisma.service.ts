import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { fieldEncryptionMiddleware } from "./field-encryption";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const url = config.get<string>("app.databaseUrl");
    super(url ? { datasources: { db: { url } } } : undefined);
    // ISO A-02: bank accounts, NIT/CI and stored secrets are sealed on write and opened on read.
    const current = config.get<string>("app.fieldEncryptionKey");
    if (current) this.$use(fieldEncryptionMiddleware({ current, previous: config.get<string[]>("app.fieldEncryptionPreviousKeys") ?? [] }));
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
