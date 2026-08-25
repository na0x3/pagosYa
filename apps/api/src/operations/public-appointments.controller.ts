import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreatePublicAppointmentPaymentDto } from "./dto/operations.dto";
import { OperationsService } from "./operations.service";

@Controller("v1/public/stores/:slug/appointments")
export class PublicAppointmentsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("availability")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  availability(@Param("slug") slug: string, @Query("offeringId") offeringId: string, @Query("date") date: string) {
    return this.operations.publicAppointmentAvailability(slug, offeringId, date);
  }

  @Post("payment")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  createPayment(@Param("slug") slug: string, @Body() dto: CreatePublicAppointmentPaymentDto) {
    return this.operations.createPublicAppointmentPayment(slug, dto);
  }
}
