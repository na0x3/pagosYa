import { Module } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { KycService } from "./kyc.service";
import { MerchantsController } from "./merchants.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, KycService],
  exports: [MerchantsService, KycService],
})
export class MerchantsModule {}
