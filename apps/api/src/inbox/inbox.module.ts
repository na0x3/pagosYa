import { Module } from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { InboxStoreResolver } from "./inbox-store-resolver";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";
import { InboxWebhookController } from "./inbox-webhook.controller";

/**
 * The merchant-facing InboxController (listing/replying to threads) does not
 * exist yet — it lands in Task 5. Declaring it here before then would fail
 * Nest's boot-time provider resolution, so this module only wires what Task 4
 * needs: the public inbound webhook and the service both StoreCheckoutService
 * and PaymentIntentsService optionally depend on.
 *
 * InboxService is exported so importing modules can actually satisfy that
 * optional dependency via DI, instead of leaving it undefined at runtime.
 */
@Module({
  providers: [InboxService, InboxStoreResolver, InboundSignatureVerifier],
  controllers: [InboxWebhookController],
  exports: [InboxService],
})
export class InboxModule {}
