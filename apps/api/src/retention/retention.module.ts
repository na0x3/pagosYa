import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RetentionService } from "./retention.service";
import { StorePopupModule } from "../store-popups/store-popup.module";
import { RetentionController, RetentionPaymentController, RetentionPublicController } from "./retention.controller";
import { PopupDesignController } from "../store-popups/popup-design.controller";
import { PromoCodesModule } from "../promo-codes/promo-codes.module";

/** Newsletter sign-ups, comeback cards, abandoned-cart recovery, and review requests. */
@Module({
  imports: [DashboardModule, AuthModule, StorePopupModule, PromoCodesModule],
  // Popups 2.0 (spec 2026-11-18): the Popups page sits with the rest of the store's customer tools.
  controllers: [RetentionPaymentController, RetentionController, RetentionPublicController, PopupDesignController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
