import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";
import { SecretApiKeyGuard } from "./guards/secret-api-key.guard";
import { ClientSecretGuard } from "./guards/client-secret.guard";
import { InternalSecretGuard } from "./guards/internal-secret.guard";
import { InternalOpsGuard } from "./guards/internal-ops.guard";
import { PublishableApiKeyGuard } from "./guards/publishable-api-key.guard";
import { GoogleIdentityController } from "./google-identity.controller";
import { GoogleIdentityService } from "./google-identity.service";

@Module({
  controllers: [GoogleIdentityController],
  providers: [
    ApiKeyService,
    GoogleIdentityService,
    SecretApiKeyGuard,
    PublishableApiKeyGuard,
    ClientSecretGuard,
    InternalSecretGuard,
    InternalOpsGuard,
  ],
  exports: [
    ApiKeyService,
    GoogleIdentityService,
    SecretApiKeyGuard,
    PublishableApiKeyGuard,
    ClientSecretGuard,
    InternalSecretGuard,
    InternalOpsGuard,
  ],
})
export class AuthModule {}
