import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { InboxService } from "./inbox.service";
import { InboxStoreResolver } from "./inbox-store-resolver";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";
import { InboxWebhookController } from "./inbox-webhook.controller";
import { InboxController } from "./inbox.controller";

/**
 * InboxController (listing/reading/replying to threads from the dashboard)
 * lands in Task 5 alongside the public inbound webhook wired in Task 4.
 * DashboardModule and AuthModule are imported so MerchantAuthGuard on
 * InboxController can resolve its own dependencies (ApiKeyService,
 * MerchantSessionService) — the same pair EmailWorkspaceModule imports for
 * the identical guard on EmailWorkspaceController.
 *
 * InboxService is exported so importing modules can actually satisfy the
 * optional dependency StoreCheckoutService and PaymentIntentsService declare
 * on it via DI, instead of leaving it undefined at runtime.
 */
@Module({
  imports: [DashboardModule, AuthModule],
  providers: [InboxService, InboxStoreResolver, InboundSignatureVerifier],
  controllers: [InboxWebhookController, InboxController],
  exports: [InboxService],
})
export class InboxModule {}
