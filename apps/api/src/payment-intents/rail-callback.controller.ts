import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { InternalSecretGuard } from "../auth/guards/internal-secret.guard";
import { PaymentIntentsService } from "./payment-intents.service";
import { RailCallbackDto } from "./dto/rail-callback.dto";

/**
 * Drives the async requires_action -> succeeded/failed path for rails like
 * Tigo Money (USSD confirmation) or bank/QR redirects. In production a real
 * rail integration calls this; in dev, apps/checkout's "simulate
 * confirmation" button calls it directly so the async path is testable
 * without real bank/Tigo infra.
 */
@ApiTags("internal")
@ApiBearerAuth()
@UseGuards(InternalSecretGuard)
@Controller("internal/rails")
export class RailCallbackController {
  constructor(private readonly paymentIntents: PaymentIntentsService) {}

  @Post(":railId/callback")
  callback(@Param("railId") _railId: string, @Body() dto: RailCallbackDto) {
    return this.paymentIntents.applyCallbackResult(dto.paymentIntentId, {
      status: dto.status,
      railReference: dto.railReference,
      failureReason: dto.failureReason,
      raw: dto.raw ?? {},
    });
  }
}
