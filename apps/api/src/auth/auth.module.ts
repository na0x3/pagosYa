import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";
import { SecretApiKeyGuard } from "./guards/secret-api-key.guard";
import { ClientSecretGuard } from "./guards/client-secret.guard";
import { InternalSecretGuard } from "./guards/internal-secret.guard";

@Module({
  providers: [ApiKeyService, SecretApiKeyGuard, ClientSecretGuard, InternalSecretGuard],
  exports: [ApiKeyService, SecretApiKeyGuard, ClientSecretGuard, InternalSecretGuard],
})
export class AuthModule {}
