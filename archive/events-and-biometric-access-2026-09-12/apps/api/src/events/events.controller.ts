import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ConsumerUser } from "@prisma/client";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { ConsumerAuthGuard } from "../consumer/consumer-auth.guard";
import { CurrentConsumer } from "../consumer/current-consumer.decorator";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { EventsService } from "./events.service";
import { FaceEntryService } from "./face-entry.service";
import {
  ActivateFaceEntryDto, AddStaffDto, AttachEventTicketsBlockDto, CashSaleDto, ClaimAdmissionDto, CloseCashShiftDto, CompleteEnrollmentDto, ConsumerEnrollmentSessionDto, CreateDeviceDto,
  CreateEnrollmentSessionDto, CreateEventDto, CreateInvitationDto, CreateReservationDto, CreateTicketTypeDto,
  CreateVenueDto, DeleteBiometricDto, DeleteFaceEntryDto, ManageReservationDto, ManualAccessDto, NormalizedDeviceEventDto, OpenCashShiftDto, SimulatorActionDto,
} from "./events.dto";

type MerchantRequest = { merchantUser?: { id: string }; ip?: string };

@ApiTags("events-public")
@Controller("v1/events/public")
export class EventsPublicController {
  constructor(private readonly events: EventsService, private readonly faceEntry: FaceEntryService) {}

  @Get()
  list() { return this.events.listPublicEvents(); }

  @Get("id/:eventId")
  getById(@Param("eventId") eventId: string) { return this.events.publicEventById(eventId); }

  @Get(":slug")
  get(@Param("slug") slug: string) { return this.events.publicEvent(slug); }

  @Post(":slug/reservations")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reserve(@Param("slug") slug: string, @Body() dto: CreateReservationDto) { return this.events.createReservation(slug, dto); }

  @Post("reservations/:reservationId/manage")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  manage(@Param("reservationId") reservationId: string, @Body() dto: ManageReservationDto) { return this.events.manageOrder(reservationId, dto.managementToken); }

  @Post("admissions/:admissionId/invitations")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(@Param("admissionId") admissionId: string, @Body() dto: CreateInvitationDto) { return this.events.createInvitation(admissionId, dto); }

  @Post("admissions/:admissionId/claim")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  claim(@Param("admissionId") admissionId: string, @Body() dto: ClaimAdmissionDto) { return this.events.claimAdmission(admissionId, dto); }

  @Post("enrollment-sessions/:sessionId/complete")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  completeEnrollment(@Param("sessionId") sessionId: string, @Body() dto: CompleteEnrollmentDto) { return this.faceEntry.completeEnrollment(sessionId, dto); }
}

@ApiTags("events-face-entry")
@ApiBearerAuth()
@UseGuards(ConsumerAuthGuard)
@Controller("v1/events/consumer")
export class EventsConsumerController {
  constructor(private readonly faceEntry: FaceEntryService) {}

  @Get("face-entry")
  status(@CurrentConsumer() consumer: ConsumerUser) { return this.faceEntry.accountStatus(consumer.id); }

  @Post("admissions/:admissionId/face-entry")
  activate(@CurrentConsumer() consumer: ConsumerUser, @Param("admissionId") admissionId: string, @Body() dto: ActivateFaceEntryDto) {
    return this.faceEntry.activateForAdmission(consumer.id, admissionId, dto.managementToken);
  }

  @Post("admissions/:admissionId/enrollment-session")
  enrollmentSession(@CurrentConsumer() consumer: ConsumerUser, @Param("admissionId") admissionId: string, @Body() dto: ConsumerEnrollmentSessionDto) {
    return this.faceEntry.createConsumerEnrollmentSession(consumer.id, admissionId, dto);
  }

  @Post("enrollment-sessions/:sessionId/complete")
  completeEnrollment(@CurrentConsumer() consumer: ConsumerUser, @Param("sessionId") sessionId: string, @Body() dto: CompleteEnrollmentDto) {
    return this.faceEntry.completeEnrollment(sessionId, dto, consumer.id);
  }

  @Delete("face-entry")
  remove(@CurrentConsumer() consumer: ConsumerUser, @Body() dto: DeleteFaceEntryDto) {
    return this.faceEntry.deleteForConsumer(consumer.id, dto.reason);
  }
}

@ApiTags("events")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post("venues")
  createVenue(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: CreateVenueDto) { return this.events.createVenue(merchant.id, req.merchantUser?.id, dto); }

  @Get("venues")
  venues(@CurrentMerchant() merchant: { id: string }) { return this.events.listVenues(merchant.id); }

  @Post()
  create(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: CreateEventDto) { return this.events.createEvent(merchant.id, req.merchantUser?.id, dto); }

  @Get()
  list(@CurrentMerchant() merchant: { id: string }) { return this.events.listEvents(merchant.id); }

  @Post(":eventId/ticket-types")
  addTicketType(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Body() dto: CreateTicketTypeDto) { return this.events.addTicketType(merchant.id, eventId, req.merchantUser?.id, dto); }

  @Post(":eventId/landing-page-block")
  attachLandingPage(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Body() dto: AttachEventTicketsBlockDto) { return this.events.attachEventTicketsBlock(merchant.id, eventId, req.merchantUser?.id, dto.storeId); }

  @Get(":eventId/dashboard")
  dashboard(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string) { return this.events.dashboard(merchant.id, eventId, req.merchantUser?.id); }

  @Get(":eventId/operations")
  operations(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string) { return this.events.operations(merchant.id, eventId, req.merchantUser?.id); }

  @Post(":eventId/orders/cash")
  cashSale(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Body() dto: CashSaleDto) { return this.events.cashSale(merchant.id, eventId, req.merchantUser?.id, dto); }

  @Post("cash-shifts/open")
  openShift(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: OpenCashShiftDto) { return this.events.openCashShift(merchant.id, dto.eventId, req.merchantUser?.id, dto.openingFloat); }

  @Post("cash-shifts/:shiftId/close")
  closeShift(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("shiftId") shiftId: string, @Body() dto: CloseCashShiftDto) { return this.events.closeCashShift(merchant.id, shiftId, req.merchantUser?.id, dto.declaredCash); }

  @Post("admissions/:admissionId/enrollment-session")
  enrollmentSession(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("admissionId") admissionId: string, @Body() dto: CreateEnrollmentSessionDto) { return this.events.createEnrollmentSession(merchant.id, admissionId, req.merchantUser?.id, dto.deviceId); }

  @Post("devices")
  createDevice(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: CreateDeviceDto) { return this.events.createDevice(merchant.id, req.merchantUser?.id, dto); }

  @Get("devices/:deviceId/health")
  deviceHealth(@CurrentMerchant() merchant: { id: string }, @Param("deviceId") deviceId: string) { return this.events.deviceHealth(merchant.id, deviceId); }

  @Post(":eventId/devices/:deviceId/roster/sync")
  syncRoster(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Param("deviceId") deviceId: string) {
    return this.events.syncEventRoster(merchant.id, eventId, deviceId, req.merchantUser?.id);
  }

  @Post(":eventId/devices/:deviceId/roster/remove")
  removeRoster(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Param("deviceId") deviceId: string) {
    return this.events.removeEventRoster(merchant.id, eventId, deviceId, req.merchantUser?.id);
  }

  @Post(":eventId/end")
  endEvent(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string) {
    return this.events.endEvent(merchant.id, eventId, req.merchantUser?.id);
  }

  @Post(":eventId/biometrics/cleanup")
  cleanupEventBiometrics(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string) {
    return this.events.cleanupEndedEvent(merchant.id, eventId, req.merchantUser?.id);
  }

  @Post("device-events")
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  deviceEvent(@CurrentMerchant() merchant: { id: string }, @Body() dto: NormalizedDeviceEventDto) { return this.events.processDeviceEvent(dto as any, merchant.id); }

  @Post("access/manual-entry")
  manualEntry(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: ManualAccessDto) { return this.events.manualAccess(merchant.id, req.merchantUser?.id, "ENTRY", dto); }

  @Post("access/manual-exit")
  manualExit(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Body() dto: ManualAccessDto) { return this.events.manualAccess(merchant.id, req.merchantUser?.id, "EXIT", dto); }

  @Post("biometric-credentials/:credentialId/delete")
  deleteCredential(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("credentialId") credentialId: string, @Body() dto: DeleteBiometricDto) { return this.events.deleteCredential(merchant.id, credentialId, req.merchantUser?.id, dto.reason); }

  @Post("biometric-identities/:biometricIdentityId/delete")
  deleteIdentity(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("biometricIdentityId") biometricIdentityId: string, @Body() dto: DeleteBiometricDto) {
    return this.events.deleteBiometricIdentity(merchant.id, biometricIdentityId, dto.eventId, req.merchantUser?.id, dto.reason);
  }

  @Post(":eventId/staff")
  addStaff(@CurrentMerchant() merchant: { id: string }, @Req() req: MerchantRequest, @Param("eventId") eventId: string, @Body() dto: AddStaffDto) { return this.events.addStaff(merchant.id, eventId, req.merchantUser?.id, dto.merchantUserId, dto.role, dto.permissions); }

  @Post("dev/device-simulator")
  async simulate(@CurrentMerchant() merchant: { id: string }, @Body() dto: SimulatorActionDto) {
    if (process.env.NODE_ENV === "production") throw new Error("Device simulator is disabled in production");
    const externalPersonId = dto.externalPersonId || await this.events.simulatorExternalPerson(merchant.id, dto.deviceId, dto.attendeeId);
    let event;
    switch (dto.action) {
      case "FACE_RECOGNIZED_ENTRY": event = await this.events.mockProvider.recognize({ deviceId: dto.deviceId, externalPersonId: externalPersonId || "unknown", direction: "ENTRY", duplicateExternalEventId: dto.duplicateExternalEventId }); break;
      case "FACE_RECOGNIZED_EXIT": event = await this.events.mockProvider.recognize({ deviceId: dto.deviceId, externalPersonId: externalPersonId || "unknown", direction: "EXIT", duplicateExternalEventId: dto.duplicateExternalEventId }); break;
      case "UNKNOWN_FACE": event = await this.events.mockProvider.recognize({ deviceId: dto.deviceId, externalPersonId: `unknown-${Date.now()}`, direction: "ENTRY" }); break;
      case "SPOOF_ATTEMPT": event = await this.events.mockProvider.spoof(dto.deviceId, externalPersonId); break;
      case "DEVICE_OFFLINE": event = await this.events.mockProvider.setDeviceOnline(dto.deviceId, false); break;
      case "DEVICE_ONLINE": event = await this.events.mockProvider.setDeviceOnline(dto.deviceId, true); break;
      case "ENROLLMENT_FAILURE": this.events.mockProvider.failNextEnrollment(); return { armed: true, action: dto.action };
      case "DUPLICATE_ENTRY": event = await this.events.mockProvider.recognize({ deviceId: dto.deviceId, externalPersonId: externalPersonId || "unknown", direction: "ENTRY" }); break;
      default: throw new Error("Unsupported simulator action");
    }
    const first = await this.events.processDeviceEvent(event, merchant.id);
    if (dto.action === "DUPLICATE_ENTRY") {
      const secondEvent = await this.events.mockProvider.recognize({ deviceId: dto.deviceId, externalPersonId: externalPersonId || "unknown", direction: "ENTRY" });
      return { first, second: await this.events.processDeviceEvent(secondEvent, merchant.id) };
    }
    return first;
  }
}
