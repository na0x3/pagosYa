import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AccessDecision, AccessDirection, AdmissionSource, BiometricEnrollmentStatus, BiometricIdentityStatus, DevicePersonSyncStatus, EventBiometricAuthorizationStatus, EventPaymentMethod, EventPaymentStatus, EventStaffRole, EventStatus, Prisma, PresenceStatus, TicketReservationStatus } from "@prisma/client";
import { MockAccessControlProvider, type AccessControlProvider, type NormalizedDeviceEvent } from "@pagosya/access-control";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { admissionCode, digestEventToken, enrollmentCode, secureToken } from "./event-security";
import type { CashSaleDto, ClaimAdmissionDto, CreateDeviceDto, CreateEventDto, CreateInvitationDto, CreateReservationDto, CreateTicketTypeDto, CreateVenueDto, ManualAccessDto } from "./events.dto";
import { ACCESS_CONTROL_PROVIDER } from "./access-control.provider";
import { evaluateAccess } from "./access-policy";
import { EventRosterService } from "./event-roster.service";
import { FaceEntryService } from "./face-entry.service";

const ADMIN_ROLES = [EventStaffRole.ORGANIZATION_ADMIN, EventStaffRole.EVENT_MANAGER];

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    @Inject(ACCESS_CONTROL_PROVIDER) private readonly provider: AccessControlProvider,
    readonly mockProvider: MockAccessControlProvider,
    private readonly rosters: EventRosterService,
    private readonly faceEntry: FaceEntryService,
  ) {}

  private async assertRole(merchantId: string, eventId: string, userId: string | undefined, allowed: EventStaffRole[]) {
    if (!userId) throw new ForbiddenException("A dashboard user is required");
    const event = await this.prisma.event.findFirst({ where: { id: eventId, merchantId }, select: { id: true } });
    if (!event) throw new NotFoundException("Event not found");
    const memberships = await this.prisma.eventStaffMembership.findMany({ where: { eventId, merchantUserId: userId, revokedAt: null }, select: { role: true } });
    if (!memberships.some(({ role }) => allowed.includes(role))) throw new ForbiddenException("Insufficient event permission");
  }

  private async assertOrganizationAdmin(merchantId: string, userId: string | undefined) {
    if (!userId) throw new ForbiddenException("A dashboard user is required");
    const admin = await this.prisma.eventStaffMembership.count({ where: { merchantId, merchantUserId: userId, role: EventStaffRole.ORGANIZATION_ADMIN, revokedAt: null } });
    if (admin) return;
    const memberships = await this.prisma.eventStaffMembership.count({ where: { merchantId, revokedAt: null } });
    const firstUser = await this.prisma.merchantUser.findFirst({ where: { merchantId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (memberships || firstUser?.id !== userId) throw new ForbiddenException("Organization administrator permission is required");
  }

  async createVenue(merchantId: string, userId: string | undefined, dto: CreateVenueDto) {
    await this.assertOrganizationAdmin(merchantId, userId);
    return this.prisma.venue.create({ data: { merchantId, name: dto.name.trim(), address: dto.address?.trim(), city: dto.city?.trim() || "La Paz", timezone: dto.timezone || "America/La_Paz", capacity: dto.capacity } });
  }

  listVenues(merchantId: string) { return this.prisma.venue.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } }); }

  async createEvent(merchantId: string, userId: string | undefined, dto: CreateEventDto) {
    await this.assertOrganizationAdmin(merchantId, userId);
    const venue = await this.prisma.venue.findFirst({ where: { id: dto.venueId, merchantId } });
    if (!venue) throw new NotFoundException("Venue not found");
    const startsAt = new Date(dto.startsAt); const endsAt = new Date(dto.endsAt); const doorsOpenAt = new Date(dto.doorsOpenAt);
    if (endsAt <= startsAt || startsAt < doorsOpenAt) throw new BadRequestException("Event dates are inconsistent");
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({ data: {
        merchantId, venueId: venue.id, slug: `evt-${secureToken(9).toLowerCase()}`, name: dto.name.trim(), description: dto.description?.trim(),
        startsAt, endsAt, doorsOpenAt, lastEntryAt: dto.lastEntryAt ? new Date(dto.lastEntryAt) : undefined,
        capacity: dto.capacity, timezone: dto.timezone || venue.timezone, status: dto.status ?? EventStatus.DRAFT,
        allowReentry: dto.allowReentry ?? true, biometricRequired: dto.biometricRequired ?? true,
        retentionHours: dto.retentionHours ?? 24, salesAtDoorEnabled: dto.salesAtDoorEnabled ?? true,
        onlineSalesEnabled: dto.onlineSalesEnabled ?? true, manualOverrideAllowed: dto.manualOverrideAllowed ?? true,
      } });
      await tx.eventStaffMembership.create({ data: { merchantId, eventId: event.id, merchantUserId: userId!, role: EventStaffRole.ORGANIZATION_ADMIN } });
      await tx.eventAuditLog.create({ data: { merchantId, eventId: event.id, actorUserId: userId, action: "EVENT_CREATED", entityType: "Event", entityId: event.id } });
      return event;
    });
  }

  listEvents(merchantId: string) {
    return this.prisma.event.findMany({ where: { merchantId }, include: { venue: true, ticketTypes: true, store: { select: { id: true, slug: true, name: true, status: true } } }, orderBy: { startsAt: "desc" } });
  }

  async listPublicEvents() {
    const events = await this.prisma.event.findMany({
      where: {
        status: { in: [EventStatus.PUBLISHED, EventStatus.ACTIVE] },
        onlineSalesEnabled: true,
        startsAt: { gte: new Date() },
        store: { is: { status: "ACTIVE", merchant: { status: "ACTIVE" } } },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        publicityImageUrl: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        venue: { select: { name: true, city: true } },
        store: { select: { slug: true, name: true, logoUrl: true, bannerUrl: true, accentColor: true } },
        ticketTypes: {
          where: { active: true },
          orderBy: { price: "asc" },
          select: { price: true, currency: true, inventory: true, reservedQuantity: true, soldQuantity: true },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 60,
    });
    return {
      events: events.map((event) => ({
        ...event,
        availableTickets: event.ticketTypes.reduce((total, ticket) => total + Math.max(0, (ticket.inventory ?? 0) - ticket.reservedQuantity - ticket.soldQuantity), 0),
        minimumAmount: event.ticketTypes.length ? Math.min(...event.ticketTypes.map((ticket) => ticket.price)) : null,
        currency: event.ticketTypes[0]?.currency ?? "BOB",
      })),
    };
  }

  async addTicketType(merchantId: string, eventId: string, userId: string | undefined, dto: CreateTicketTypeDto) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    const row = await this.prisma.ticketType.create({ data: { eventId, kind: dto.kind, name: dto.name.trim(), price: dto.price, currency: (dto.currency || "BOB").toUpperCase(), inventory: dto.inventory, salesStart: dto.salesStart ? new Date(dto.salesStart) : undefined, salesEnd: dto.salesEnd ? new Date(dto.salesEnd) : undefined, reentryAllowed: dto.reentryAllowed ?? true, capacityContribution: dto.capacityContribution ?? 1 } });
    await this.audit(merchantId, eventId, userId, "TICKET_TYPE_CREATED", "TicketType", row.id, { price: row.price, inventory: row.inventory });
    return row;
  }

  async publicEvent(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug, status: { in: [EventStatus.PUBLISHED, EventStatus.ACTIVE] }, onlineSalesEnabled: true },
      include: { store: { select: { slug: true, name: true, logoUrl: true } }, venue: { select: { name: true, city: true } }, ticketTypes: { where: { active: true }, orderBy: { price: "asc" } } },
    });
    if (!event) throw new NotFoundException("Event not found");
    return { ...event, ticketTypes: event.ticketTypes.map((ticket) => ({ ...ticket, available: Math.max(0, (ticket.inventory ?? 0) - ticket.reservedQuantity - ticket.soldQuantity) })) };
  }

  async publicEventById(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: [EventStatus.PUBLISHED, EventStatus.ACTIVE] }, onlineSalesEnabled: true },
      include: { store: { select: { slug: true, name: true, logoUrl: true } }, venue: { select: { name: true, city: true } }, ticketTypes: { where: { active: true }, orderBy: { price: "asc" } } },
    });
    if (!event) throw new NotFoundException("Event not found");
    return { ...event, ticketTypes: event.ticketTypes.map((ticket) => ({ ...ticket, available: Math.max(0, (ticket.inventory ?? 0) - ticket.reservedQuantity - ticket.soldQuantity) })) };
  }

  async attachEventTicketsBlock(merchantId: string, eventId: string, userId: string | undefined, storeId: string) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.prisma.$transaction(async (tx) => {
      const [event, store] = await Promise.all([
        tx.event.findFirst({ where: { id: eventId, merchantId } }),
        tx.store.findFirst({ where: { id: storeId, merchantId } }),
      ]);
      if (!event) throw new NotFoundException("Event not found");
      if (!store) throw new NotFoundException("Landing page not found");
      if (store.checkoutMode !== "payment") throw new BadRequestException("The landing page must use PagosYa payments");
      const current = store.siteDocument && typeof store.siteDocument === "object" && !Array.isArray(store.siteDocument)
        ? JSON.parse(JSON.stringify(store.siteDocument)) as Record<string, any>
        : {
          version: 1,
          direction: "PagosYa Event",
          theme: { pageBackground: store.backgroundColor || "#f8fafc", textColor: "#111111", accentColor: store.accentColor || "#7c3aed", secondaryColor: "#dbeafe", surfaceColor: "#ffffff", mutedColor: "#6b7280", borderColor: "#111111", headingFont: "grotesk", bodyFont: "grotesk", radius: 12, shadow: "none", productLayout: "gallery", displayScale: "balanced", density: "balanced", imageTreatment: "natural" },
          navigation: { layout: "brand-left", sticky: true, transparent: false, logoTreatment: "wordmark" },
          motion: { intensity: "restrained" },
          merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "collection", showDescriptions: true },
          experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
          sections: [
            { id: "hero", kind: "hero", layout: "centered", width: "wide", align: "left", motion: "reveal", title: store.name, body: store.tagline || "", ctaLabel: "Ver entradas", backgroundColor: store.backgroundColor || "#f8fafc", textColor: "#111111", mediaUrls: [], items: [] },
            { id: "catalog", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "reveal", title: "Productos", body: "", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [] },
            { id: "contact", kind: "contact", layout: "split", width: "wide", align: "left", motion: "reveal", title: "Contacto", body: "", ctaLabel: "", backgroundColor: "#ffffff", textColor: "#111111", mediaUrls: [], items: [] },
          ],
        };
      if (!Array.isArray(current.sections)) throw new BadRequestException("Landing page document is invalid");
      const sectionId = "paya-events";
      current.sections = current.sections.filter((section: any) => section?.kind !== "event-tickets");
      const contactIndex = current.sections.findIndex((section: any) => section?.kind === "contact");
      const block = { id: sectionId, kind: "event-tickets", layout: "stacked", width: "wide", align: "left", motion: "reveal", title: "Próximos eventos", body: "Reserva tus entradas sin salir de esta página. El pago se procesa de forma segura con pagosYa.", ctaLabel: "Comprar entradas", backgroundColor: current.theme?.surfaceColor || "#ffffff", textColor: current.theme?.textColor || "#111111", mediaUrls: [], items: [] };
      current.sections.splice(contactIndex < 0 ? current.sections.length : contactIndex, 0, block);
      const updated = await tx.store.update({ where: { id: store.id }, data: { siteDocument: current as Prisma.InputJsonObject } });
      await tx.event.update({ where: { id: event.id }, data: { storeId: store.id } });
      await tx.eventAuditLog.create({ data: { merchantId, eventId, actorUserId: userId, action: "EVENT_TICKETS_BLOCK_ATTACHED", entityType: "Store", entityId: store.id, metadata: { sectionId } } });
      return { eventId, storeId: store.id, storeSlug: updated.slug, sectionId };
    });
  }

  private async releaseExpiredReservations(tx: Prisma.TransactionClient, eventId: string) {
    const expired = await tx.ticketReservation.findMany({ where: { eventId, status: TicketReservationStatus.RESERVED, expiresAt: { lte: new Date() } }, include: { items: true } });
    for (const reservation of expired) {
      const changed = await tx.ticketReservation.updateMany({ where: { id: reservation.id, status: TicketReservationStatus.RESERVED }, data: { status: TicketReservationStatus.EXPIRED } });
      if (!changed.count) continue;
      for (const item of reservation.items) await tx.ticketType.update({ where: { id: item.ticketTypeId }, data: { reservedQuantity: { decrement: item.quantity } } });
    }
  }

  async createReservation(eventSlug: string, dto: CreateReservationDto) {
    const rawManagementToken = secureToken();
    const result = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({ where: { slug: eventSlug, status: { in: [EventStatus.PUBLISHED, EventStatus.ACTIVE] }, onlineSalesEnabled: true } });
      if (!event) throw new NotFoundException("Event is not available for online sales");
      await this.releaseExpiredReservations(tx, event.id);
      const quantities = new Map<string, number>();
      for (const item of dto.items) quantities.set(item.ticketTypeId, (quantities.get(item.ticketTypeId) ?? 0) + item.quantity);
      const types = await tx.ticketType.findMany({ where: { id: { in: [...quantities.keys()] }, eventId: event.id, active: true } });
      if (types.length !== quantities.size) throw new BadRequestException("A ticket type is unavailable");
      const currency = types[0].currency;
      if (types.some((type) => type.currency !== currency)) throw new BadRequestException("Mixed ticket currencies are not supported");
      let totalAmount = 0;
      for (const ticket of types) {
        const quantity = quantities.get(ticket.id)!;
        const reserved = await tx.$executeRaw`
          UPDATE "EventPriceStage" SET "heldCount" = "heldCount" + ${quantity}, "updatedAt" = NOW()
          WHERE id = ${ticket.id} AND active = true AND quantity - "soldCount" - "heldCount" >= ${quantity}
        `;
        if (reserved !== 1) throw new BadRequestException(`${ticket.name} no tiene suficiente inventario`);
        totalAmount += ticket.price * quantity;
      }
      const expiresAt = new Date(Date.now() + event.reservationMinutes * 60_000);
      const reservation = await tx.ticketReservation.create({ data: {
        merchantId: event.merchantId, eventId: event.id, totalAmount, currency, expiresAt,
        buyerName: dto.buyerName?.trim(), buyerEmail: dto.buyerEmail?.trim().toLowerCase(), buyerPhone: dto.buyerPhone?.trim(),
        managementTokenHash: digestEventToken(rawManagementToken), managementTokenExpiresAt: new Date((event.endsAt ?? event.startsAt).getTime() + 72 * 60 * 60_000),
        items: { create: types.map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities.get(ticket.id)!, unitAmount: ticket.price })) },
      } });
      const paymentIntent = await this.paymentIntents.createInTransaction(tx, event.merchantId, false, {
        amount: totalAmount, currency, description: `Entradas: ${event.name}`, customerName: dto.buyerName,
        customerEmail: dto.buyerEmail, customerPhone: dto.buyerPhone,
        metadata: { eventReservation: { reservationId: reservation.id, eventId: event.id }, source: "EVENT_TICKETS" },
      });
      await tx.ticketReservation.update({ where: { id: reservation.id }, data: { paymentIntentId: paymentIntent.id } });
      return { reservation, paymentIntent };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { reservationId: result.reservation.id, amount: result.reservation.totalAmount, currency: result.reservation.currency, expiresAt: result.reservation.expiresAt, paymentIntentId: result.paymentIntent.id, clientSecret: result.paymentIntent.clientSecret, managementToken: rawManagementToken };
  }

  async manageOrder(reservationId: string, managementToken: string) {
    const reservation = await this.prisma.ticketReservation.findFirst({ where: { id: reservationId, managementTokenHash: digestEventToken(managementToken), managementTokenExpiresAt: { gt: new Date() } }, include: { order: { include: { admissions: { include: { ticketType: true, attendee: true } } } }, event: true } });
    if (!reservation) throw new NotFoundException("Reservation management link is invalid or expired");
    return {
      id: reservation.id,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      managementExpiresAt: reservation.managementTokenExpiresAt,
      event: { id: reservation.event.id, name: reservation.event.name, startsAt: reservation.event.startsAt },
      order: reservation.order ? {
        id: reservation.order.id,
        admissions: reservation.order.admissions.map((admission) => ({
          id: admission.id,
          code: admission.code,
          status: admission.status,
          assignmentStatus: admission.assignmentStatus,
          biometricEnrollmentStatus: admission.biometricEnrollmentStatus,
          presenceStatus: admission.presenceStatus,
          ticketType: admission.ticketType ? { id: admission.ticketType.id, name: admission.ticketType.name, kind: admission.ticketType.kind } : null,
          attendee: admission.attendee ? { id: admission.attendee.id, displayName: admission.attendee.displayName } : null,
        })),
      } : null,
    };
  }

  async createInvitation(admissionId: string, dto: CreateInvitationDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventTicket" WHERE id = ${admissionId} FOR UPDATE`;
      const admission = await tx.admission.findUnique({ where: { id: admissionId }, include: { order: { include: { reservation: true } } } });
      if (!admission || admission.order.managementTokenHash !== digestEventToken(dto.managementToken)
        || !admission.order.reservation || admission.order.reservation.managementTokenExpiresAt <= new Date()) {
        throw new ForbiddenException("Invalid or expired management token");
      }
      if (admission.assignmentStatus === "CLAIMED") throw new BadRequestException("Admission is already claimed");
      const now = new Date();
      await tx.admissionAssignment.updateMany({ where: { admissionId, claimedAt: null, revokedAt: null }, data: { revokedAt: now, claimTokenHash: null } });
      const attendee = admission.attendeeId ? { id: admission.attendeeId } : await tx.attendee.create({ data: { merchantId: admission.order.merchantId, eventId: admission.eventId, displayName: "Invitado pendiente" }, select: { id: true } });
      const token = secureToken();
      const assignment = await tx.admissionAssignment.create({ data: { admissionId, attendeeId: attendee.id, claimTokenHash: digestEventToken(token), expiresAt: new Date(now.getTime() + (dto.expiresInHours ?? 72) * 60 * 60_000) } });
      return { assignmentId: assignment.id, token, expiresAt: assignment.expiresAt };
    });
  }

  async claimAdmission(admissionId: string, dto: ClaimAdmissionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventTicket" WHERE id = ${admissionId} FOR UPDATE`;
      const assignment = await tx.admissionAssignment.findFirst({ where: { admissionId, claimTokenHash: digestEventToken(dto.token), revokedAt: null, claimedAt: null, expiresAt: { gt: new Date() } }, include: { admission: { include: { order: true } } } });
      if (!assignment || assignment.admission.assignmentStatus === "CLAIMED") throw new BadRequestException("Claim link is invalid, expired, revoked, or already used");
      const attendee = await tx.attendee.create({ data: { merchantId: assignment.admission.order.merchantId, eventId: assignment.admission.eventId, displayName: dto.displayName.trim(), email: dto.email?.trim().toLowerCase(), phone: dto.phone?.trim() } });
      await tx.admissionAssignment.update({ where: { id: assignment.id }, data: { attendeeId: attendee.id, claimedAt: new Date(), claimTokenHash: null } });
      await tx.admissionAssignment.updateMany({ where: { admissionId, id: { not: assignment.id }, claimedAt: null, revokedAt: null }, data: { revokedAt: new Date(), claimTokenHash: null } });
      await tx.admission.update({ where: { id: admissionId }, data: { attendeeId: attendee.id, assignmentStatus: "CLAIMED", claimedAt: new Date() } });
      await tx.eventAuditLog.create({ data: { merchantId: assignment.admission.order.merchantId, eventId: assignment.admission.eventId, action: "ADMISSION_CLAIMED", entityType: "Admission", entityId: admissionId } });
      return { admissionId, attendeeId: attendee.id };
    });
  }

  async openCashShift(merchantId: string, eventId: string, userId: string | undefined, openingFloat: number) {
    await this.assertRole(merchantId, eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER]);
    const open = await this.prisma.cashShift.findFirst({ where: { eventId, cashierId: userId!, closedAt: null } });
    if (open) throw new BadRequestException("Cashier already has an open shift");
    const shift = await this.prisma.cashShift.create({ data: { eventId, cashierId: userId!, openingFloat } });
    await this.audit(merchantId, eventId, userId, "CASH_SHIFT_OPENED", "CashShift", shift.id, { openingFloat });
    return shift;
  }

  async cashSale(merchantId: string, eventId: string, userId: string | undefined, dto: CashSaleDto) {
    await this.assertRole(merchantId, eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER]);
    const rawCodes: Array<{ admissionId: string; admissionCode: string; enrollmentCode: string }> = [];
    const order = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.cashShift.findFirst({ where: { id: dto.cashShiftId, eventId, cashierId: userId!, closedAt: null } });
      if (!shift) throw new BadRequestException("Cash shift is not open");
      const event = await tx.event.findFirst({ where: { id: eventId, merchantId, salesAtDoorEnabled: true } });
      if (!event) throw new BadRequestException("Door sales are disabled");
      const quantities = new Map<string, number>(); for (const item of dto.items) quantities.set(item.ticketTypeId, (quantities.get(item.ticketTypeId) ?? 0) + item.quantity);
      const types = await tx.ticketType.findMany({ where: { id: { in: [...quantities.keys()] }, eventId, active: true } });
      if (types.length !== quantities.size) throw new BadRequestException("A ticket type is unavailable");
      let totalAmount = 0;
      for (const ticket of types) {
        const quantity = quantities.get(ticket.id)!;
        const sold = await tx.$executeRaw`UPDATE "EventPriceStage" SET "soldCount" = "soldCount" + ${quantity}, "updatedAt" = NOW() WHERE id = ${ticket.id} AND quantity - "soldCount" - "heldCount" >= ${quantity}`;
        if (sold !== 1) throw new BadRequestException(`${ticket.name} no tiene suficiente inventario`);
        totalAmount += ticket.price * quantity;
      }
      const created = await tx.admissionOrder.create({ data: { merchantId, eventId, cashShiftId: shift.id, source: AdmissionSource.CASH_DOOR, paymentMethod: dto.paymentMethod ?? EventPaymentMethod.CASH, paymentStatus: EventPaymentStatus.PAID, totalAmount, currency: types[0]?.currency ?? "BOB", buyerName: dto.buyerName?.trim(), buyerPhone: dto.buyerPhone?.trim() } });
      await tx.eventFinancialTransaction.create({ data: { eventId, orderId: created.id, cashShiftId: shift.id, type: "SALE", paymentMethod: dto.paymentMethod ?? EventPaymentMethod.CASH, status: EventPaymentStatus.PAID, amount: totalAmount, currency: types[0]?.currency ?? "BOB", actorUserId: userId } });
      for (const ticket of types) for (let index = 0; index < quantities.get(ticket.id)!; index += 1) {
        const code = admissionCode();
        const admission = await tx.admission.create({ data: { code, orderId: created.id, eventId, ticketTypeId: ticket.id, source: AdmissionSource.CASH_DOOR, biometricEnrollmentStatus: event.biometricRequired ? BiometricEnrollmentStatus.PENDING : BiometricEnrollmentStatus.NOT_REQUIRED } });
        const rawCode = enrollmentCode();
        await tx.enrollmentSession.create({ data: { eventId, admissionId: admission.id, codeHash: digestEventToken(rawCode), expiresAt: new Date(Date.now() + 15 * 60_000) } });
        rawCodes.push({ admissionId: admission.id, admissionCode: code, enrollmentCode: rawCode });
      }
      await tx.eventAuditLog.create({ data: { actorUserId: userId, merchantId, eventId, action: "CASH_SALE_CREATED", entityType: "AdmissionOrder", entityId: created.id, metadata: { amount: totalAmount, quantity: rawCodes.length } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { order, admissions: rawCodes, message: "PAGO REGISTRADO", next: "REGISTRAR ROSTRO" };
  }

  async closeCashShift(merchantId: string, shiftId: string, userId: string | undefined, declaredCash: number) {
    const shift = await this.prisma.cashShift.findUnique({ where: { id: shiftId }, include: { event: true } });
    if (!shift || shift.event.merchantId !== merchantId) throw new NotFoundException("Cash shift not found");
    await this.assertRole(merchantId, shift.eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER]);
    if (shift.cashierId !== userId && !(await this.hasAdminRole(shift.eventId, userId!))) throw new ForbiddenException();
    const totals = await this.prisma.eventFinancialTransaction.aggregate({ where: { cashShiftId: shift.id, paymentMethod: EventPaymentMethod.CASH, status: EventPaymentStatus.PAID }, _sum: { amount: true } });
    const expectedCash = shift.openingFloat + (totals._sum.amount ?? 0);
    const closed = await this.prisma.cashShift.update({ where: { id: shift.id }, data: { closedAt: new Date(), expectedCash, declaredCash, difference: declaredCash - expectedCash } });
    await this.audit(merchantId, shift.eventId, userId, "CASH_SHIFT_CLOSED", "CashShift", shift.id, { expectedCash, declaredCash, difference: declaredCash - expectedCash });
    return closed;
  }

  private async hasAdminRole(eventId: string, userId: string) { return (await this.prisma.eventStaffMembership.count({ where: { eventId, merchantUserId: userId, role: { in: ADMIN_ROLES }, revokedAt: null } })) > 0; }

  async createEnrollmentSession(merchantId: string, admissionId: string, userId: string | undefined, deviceId?: string) {
    const admission = await this.prisma.admission.findFirst({ where: { id: admissionId, order: { merchantId } } });
    if (!admission) throw new NotFoundException("Admission not found");
    await this.assertRole(merchantId, admission.eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER, EventStaffRole.DOOR_STAFF]);
    const code = enrollmentCode();
    const session = await this.prisma.enrollmentSession.create({ data: { eventId: admission.eventId, admissionId, deviceId, codeHash: digestEventToken(code), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    return { id: session.id, code, expiresAt: session.expiresAt };
  }

  async createDevice(merchantId: string, userId: string | undefined, dto: CreateDeviceDto) {
    if (dto.eventId) await this.assertRole(merchantId, dto.eventId, userId, ADMIN_ROLES);
    else await this.assertOrganizationAdmin(merchantId, userId);
    const venue = await this.prisma.venue.findFirst({ where: { id: dto.venueId, merchantId } }); if (!venue) throw new NotFoundException("Venue not found");
    const device = await this.prisma.accessDevice.create({ data: { merchantId, venueId: venue.id, eventId: dto.eventId, name: dto.name.trim(), vendor: dto.vendor || "Mock", model: dto.model || "Simulator", serialNumber: dto.serialNumber, ipAddress: dto.ipAddress, port: dto.port, role: dto.role, faceCapacity: dto.faceCapacity, algorithmVersion: dto.algorithmVersion, providerCapabilities: dto.providerCapabilities as Prisma.InputJsonValue | undefined, configuration: dto.configuration as Prisma.InputJsonValue | undefined, encryptedSecrets: dto.encryptedSecrets } });
    await this.audit(merchantId, dto.eventId, userId, "DEVICE_CREATED", "AccessDevice", device.id, { role: device.role, vendor: device.vendor, model: device.model, faceCapacity: device.faceCapacity, algorithmVersion: device.algorithmVersion });
    return { ...device, encryptedSecrets: device.encryptedSecrets ? "configured" : null };
  }

  async deviceHealth(merchantId: string, deviceId: string) {
    const device = await this.prisma.accessDevice.findFirst({ where: { id: deviceId, merchantId } }); if (!device) throw new NotFoundException("Device not found");
    return this.provider.healthCheck(this.rosters.deviceInput(device));
  }

  async simulatorExternalPerson(merchantId: string, deviceId: string, attendeeId?: string) {
    if (!attendeeId) return undefined;
    const mapping = await this.prisma.devicePersonMapping.findFirst({
      where: { deviceId, syncStatus: DevicePersonSyncStatus.SYNCED, device: { merchantId }, biometricIdentity: { authorizations: { some: { attendeeId, status: EventBiometricAuthorizationStatus.AUTHORIZED } } } },
      select: { externalPersonId: true },
    });
    if (!mapping) throw new BadRequestException("The selected attendee is not enrolled on this device");
    return mapping.externalPersonId;
  }

  async processDeviceEvent(input: NormalizedDeviceEvent, merchantId?: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
        const ingest = await tx.deviceEventIngest.create({ data: { externalEventId: input.externalEventId, deviceId: input.deviceId, occurredAt: new Date(input.occurredAt), eventType: input.eventType, externalPersonId: input.externalPersonId, matchConfidence: input.matchConfidence, livenessPassed: input.livenessPassed, rawVendorEventReference: input.rawVendorEventReference } });
        const device = await tx.accessDevice.findUnique({ where: { id: input.deviceId } });
        if (!device) throw new NotFoundException("Device not found");
        if (merchantId && device.merchantId !== merchantId) throw new ForbiddenException("Device does not belong to merchant");
        if (input.eventType === "DEVICE_OFFLINE" || input.eventType === "DEVICE_ONLINE") {
          const status = input.eventType === "DEVICE_ONLINE" ? "ONLINE" : "OFFLINE";
          await tx.accessDevice.update({ where: { id: device.id }, data: { status, lastSeenAt: new Date(input.occurredAt) } });
          await tx.deviceEventIngest.update({ where: { id: ingest.id }, data: { processedAt: new Date() } });
          return { decision: "IGNORED", reason: status };
        }
        if (input.eventType !== "RECOGNIZED_FACE" || !input.externalPersonId) {
          const reason = input.eventType === "SPOOF_REJECTED" ? "SPOOF_REJECTED" : input.eventType === "UNKNOWN_FACE" ? "UNKNOWN_FACE" : input.eventType;
          const attempt = await tx.accessAttempt.create({ data: { eventId: device.eventId, deviceId: device.id, decision: AccessDecision.DENY, reason, externalPersonId: input.externalPersonId, occurredAt: new Date(input.occurredAt) } });
          await tx.deviceEventIngest.update({ where: { id: ingest.id }, data: { processedAt: new Date(), accessAttemptId: attempt.id } });
          return { decision: "DENY", reason };
        }
        const mapping = await tx.devicePersonMapping.findFirst({ where: { deviceId: device.id, externalPersonId: input.externalPersonId, syncStatus: DevicePersonSyncStatus.SYNCED }, include: { biometricIdentity: true } });
        if (!mapping || mapping.biometricIdentity.status !== BiometricIdentityStatus.ACTIVE || mapping.eventId !== device.eventId) {
          const attempt = await tx.accessAttempt.create({ data: { eventId: device.eventId, deviceId: device.id, decision: AccessDecision.DENY, reason: "UNKNOWN_FACE", externalPersonId: input.externalPersonId, occurredAt: new Date(input.occurredAt) } });
          await tx.deviceEventIngest.update({ where: { id: ingest.id }, data: { processedAt: new Date(), accessAttemptId: attempt.id } });
          return { decision: "DENY", reason: "UNKNOWN_FACE" };
        }
        const authorization = await tx.eventBiometricAuthorization.findUnique({
          where: { eventId_biometricIdentityId: { eventId: mapping.eventId, biometricIdentityId: mapping.biometricIdentityId } },
          include: { consent: true },
        });
        if (!authorization || authorization.status !== EventBiometricAuthorizationStatus.AUTHORIZED || authorization.consent.revokedAt || (authorization.consent.expiresAt && authorization.consent.expiresAt <= new Date(input.occurredAt))) {
          const denied = await tx.accessAttempt.create({ data: { eventId: device.eventId, deviceId: device.id, decision: AccessDecision.DENY, reason: "BIOMETRIC_AUTHORIZATION_INVALID", externalPersonId: input.externalPersonId, occurredAt: new Date(input.occurredAt) } });
          await tx.deviceEventIngest.update({ where: { id: ingest.id }, data: { processedAt: new Date(), accessAttemptId: denied.id } });
          return { decision: "DENY", reason: "BIOMETRIC_AUTHORIZATION_INVALID" };
        }
        const direction = input.direction || (device.role === "EXIT" ? "EXIT" : "ENTRY");
        return this.decideAccess(tx, { ingestId: ingest.id, deviceId: device.id, admissionId: authorization.admissionId, attendeeId: authorization.attendeeId, eventId: mapping.eventId, direction, occurredAt: new Date(input.occurredAt) });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: any) {
        if (error?.code === "P2002") {
          const existing = await this.prisma.deviceEventIngest.findUnique({ where: { externalEventId: input.externalEventId }, include: { accessEvent: true, accessAttempt: true } });
          return { idempotent: true, decision: existing?.accessEvent?.decision ?? existing?.accessAttempt?.decision ?? "IGNORED", reason: existing?.accessAttempt?.reason ?? existing?.accessEvent?.reason };
        }
        // PostgreSQL may abort one SERIALIZABLE transaction when two readers
        // recognize the same attendee simultaneously. Retrying is safe because
        // the ingest ID is unique and lets the loser observe the committed
        // INSIDE state, producing ALREADY_INSIDE instead of a 500.
        const serializationConflict = error?.code === "P2034"
          || (error?.code === "P2010" && error?.meta?.code === "40001")
          || String(error?.message || "").includes("could not serialize access");
        if (serializationConflict && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Device event transaction retry exhausted");
  }

  private async decideAccess(tx: Prisma.TransactionClient, input: { ingestId?: string; deviceId?: string; admissionId: string; attendeeId: string; eventId: string; direction: "ENTRY" | "EXIT"; occurredAt: Date; actorUserId?: string; manualReason?: string }) {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${input.eventId} FOR UPDATE`;
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; eventStatus: string; presenceStatus: PresenceStatus; biometricEnrollmentStatus: BiometricEnrollmentStatus; paymentStatus: EventPaymentStatus; reentryAllowed: boolean; allowReentry: boolean; capacity: number; capacityContribution: number; doorsOpenAt: Date; endsAt: Date; lastEntryAt: Date | null }>>`
      SELECT a.id, a.status, e.status AS "eventStatus", a."presenceStatus", a."biometricEnrollmentStatus", o.status AS "paymentStatus", t."reentryAllowed", e."allowReentry", e.capacity, t."capacityContribution", e."doorsOpenAt", e."endsAt", e."lastEntryAt"
      FROM "EventTicket" a JOIN "EventOrder" o ON o.id = a."eventOrderId" JOIN "EventPriceStage" t ON t.id = a."eventPriceStageId" JOIN "Event" e ON e.id = a."eventId"
      WHERE a.id = ${input.admissionId} FOR UPDATE OF a
    `;
    const admission = rows[0]; if (!admission || !admission.capacity || !admission.doorsOpenAt || !admission.endsAt) throw new NotFoundException("Admission or access configuration not found");
    const inside = input.direction === "ENTRY" ? await tx.admission.count({ where: { eventId: input.eventId, presenceStatus: PresenceStatus.INSIDE } }) : 0;
    const policy = evaluateAccess({ eventStatus: admission.eventStatus, admissionStatus: admission.status, paymentStatus: admission.paymentStatus, biometricEnrollmentStatus: admission.biometricEnrollmentStatus, presenceStatus: admission.presenceStatus, direction: input.direction, allowReentry: admission.allowReentry, ticketReentryAllowed: admission.reentryAllowed, occurredAt: input.occurredAt, doorsOpenAt: admission.doorsOpenAt, lastEntryAt: admission.lastEntryAt ?? admission.endsAt, manual: Boolean(input.actorUserId), insideCount: inside, capacity: admission.capacity, capacityContribution: admission.capacityContribution });
    if (policy.decision !== "ALLOW") {
      const attempt = await tx.accessAttempt.create({ data: { eventId: input.eventId, deviceId: input.deviceId, admissionId: input.admissionId, attendeeId: input.attendeeId, direction: input.direction, decision: policy.decision === "IGNORED" ? AccessDecision.IGNORED : AccessDecision.DENY, reason: policy.reason, occurredAt: input.occurredAt } });
      if (input.ingestId) await tx.deviceEventIngest.update({ where: { id: input.ingestId }, data: { processedAt: new Date(), accessAttemptId: attempt.id } });
      return { decision: attempt.decision, reason: policy.reason };
    }
    const presenceStatus = policy.nextPresence === "INSIDE" ? PresenceStatus.INSIDE : PresenceStatus.OUTSIDE;
    await tx.admission.update({ where: { id: input.admissionId }, data: { presenceStatus, lastPresenceChangedAt: input.occurredAt, ...(input.direction === "ENTRY" && admission.presenceStatus === PresenceStatus.NEVER_ENTERED ? { firstEnteredAt: input.occurredAt } : {}) } });
    const event = await tx.accessEvent.create({ data: { eventId: input.eventId, deviceId: input.deviceId, admissionId: input.admissionId, attendeeId: input.attendeeId, actorUserId: input.actorUserId, direction: input.actorUserId ? (input.direction === "ENTRY" ? AccessDirection.MANUAL_ENTRY : AccessDirection.MANUAL_EXIT) : input.direction, decision: AccessDecision.ALLOW, reason: input.manualReason, occurredAt: input.occurredAt } });
    if (input.ingestId) await tx.deviceEventIngest.update({ where: { id: input.ingestId }, data: { processedAt: new Date(), accessEventId: event.id } });
    return { decision: "ALLOW", presenceStatus, accessEventId: event.id };
  }

  async manualAccess(merchantId: string, userId: string | undefined, direction: "ENTRY" | "EXIT", dto: ManualAccessDto) {
    const admission = await this.prisma.admission.findFirst({ where: { id: dto.admissionId, order: { merchantId } } }); if (!admission?.attendeeId) throw new NotFoundException("Assigned admission not found");
    await this.assertRole(merchantId, admission.eventId, userId, [...ADMIN_ROLES, EventStaffRole.DOOR_STAFF]);
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: admission.eventId } }); if (!event.manualOverrideAllowed) throw new ForbiddenException("Manual override is disabled");
    const result = await this.prisma.$transaction((tx) => this.decideAccess(tx, { admissionId: admission.id, attendeeId: admission.attendeeId!, eventId: admission.eventId, direction, occurredAt: new Date(), actorUserId: userId, manualReason: dto.reason }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(merchantId, admission.eventId, userId, direction === "ENTRY" ? "MANUAL_ENTRY" : "MANUAL_EXIT", "Admission", admission.id, { reason: dto.reason, decision: result.decision });
    return result;
  }

  async dashboard(merchantId: string, eventId: string, userId?: string) {
    await this.assertRole(merchantId, eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER, EventStaffRole.DOOR_STAFF, EventStaffRole.AUDITOR]);
    const event = await this.prisma.event.findFirst({ where: { id: eventId, merchantId }, include: { ticketTypes: true, devices: { select: { id: true, name: true, role: true, status: true, lastSeenAt: true, faceCapacity: true, algorithmVersion: true } } } }); if (!event) throw new NotFoundException("Event not found");
    const [inside, entered, exited, admissions, denied, revenue, cash, recent] = await Promise.all([
      this.prisma.admission.count({ where: { eventId, presenceStatus: PresenceStatus.INSIDE } }),
      this.prisma.accessEvent.count({ where: { eventId, direction: { in: [AccessDirection.ENTRY, AccessDirection.MANUAL_ENTRY] }, decision: AccessDecision.ALLOW } }),
      this.prisma.accessEvent.count({ where: { eventId, direction: { in: [AccessDirection.EXIT, AccessDirection.MANUAL_EXIT] }, decision: AccessDecision.ALLOW } }),
      this.prisma.admission.count({ where: { eventId } }), this.prisma.accessAttempt.count({ where: { eventId, decision: AccessDecision.DENY } }),
      this.prisma.admissionOrder.aggregate({ where: { eventId, paymentStatus: EventPaymentStatus.PAID }, _sum: { totalAmount: true } }),
      this.prisma.eventFinancialTransaction.aggregate({ where: { eventId, paymentMethod: EventPaymentMethod.CASH, status: EventPaymentStatus.PAID }, _sum: { amount: true } }),
      this.prisma.accessEvent.findMany({ where: { eventId }, include: { attendee: { select: { displayName: true } }, admission: { include: { ticketType: { select: { name: true } } } } }, orderBy: { occurredAt: "desc" }, take: 20 }),
    ]);
    const capacity = event.capacity ?? 0;
    return { event: { id: event.id, name: event.name, capacity, status: event.status }, capacity: { inside, capacity, remaining: Math.max(0, capacity - inside), totalEntered: entered, totalExited: exited }, sales: { admissions, revenue: revenue._sum.totalAmount ?? 0, cashExpected: cash._sum.amount ?? 0, currency: "BOB" }, deniedAttempts: denied, ticketTypes: event.ticketTypes, devices: event.devices, recentEvents: recent };
  }

  async operations(merchantId: string, eventId: string, userId?: string) {
    await this.assertRole(merchantId, eventId, userId, [...ADMIN_ROLES, EventStaffRole.CASHIER, EventStaffRole.DOOR_STAFF, EventStaffRole.AUDITOR]);
    const event = await this.prisma.event.findFirst({ where: { id: eventId, merchantId }, select: { id: true } });
    if (!event) throw new NotFoundException("Event not found");
    const [admissions, shifts, audit] = await Promise.all([
      this.prisma.admission.findMany({ where: { eventId }, select: { id: true, code: true, status: true, assignmentStatus: true, biometricEnrollmentStatus: true, presenceStatus: true, attendee: { select: { id: true, displayName: true } }, ticketType: { select: { id: true, name: true } }, biometricAuthorization: { select: { biometricIdentityId: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      this.prisma.cashShift.findMany({ where: { eventId }, select: { id: true, cashierId: true, openedAt: true, closedAt: true, openingFloat: true, expectedCash: true, declaredCash: true, difference: true }, orderBy: { openedAt: "desc" }, take: 20 }),
      this.prisma.eventAuditLog.findMany({ where: { eventId }, select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true, actorUserId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return { admissions, shifts, audit };
  }

  async deleteCredential(merchantId: string, credentialId: string, userId: string | undefined, reason: string) {
    const credential = await this.prisma.biometricCredential.findFirst({ where: { id: credentialId, deletedAt: null }, include: { biometricIdentity: { include: { authorizations: { where: { event: { merchantId } }, take: 1 } } } } });
    if (!credential) throw new NotFoundException("Biometric credential not found");
    const eventId = credential.biometricIdentity.authorizations[0]?.eventId;
    if (!eventId) throw new NotFoundException("Biometric credential is not associated with this merchant");
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.faceEntry.deleteForEventAdmin(merchantId, credential.biometricIdentityId, eventId, userId, reason);
  }

  async deleteBiometricIdentity(merchantId: string, biometricIdentityId: string, eventId: string | undefined, userId: string | undefined, reason: string) {
    if (!eventId) throw new BadRequestException("eventId is required for merchant biometric deletion");
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.faceEntry.deleteForEventAdmin(merchantId, biometricIdentityId, eventId, userId, reason);
  }

  async syncEventRoster(merchantId: string, eventId: string, deviceId: string, userId: string | undefined) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.rosters.syncEventRoster(merchantId, eventId, deviceId, userId);
  }

  async removeEventRoster(merchantId: string, eventId: string, deviceId: string, userId: string | undefined) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.rosters.removeEventRoster(merchantId, eventId, deviceId, userId);
  }

  async endEvent(merchantId: string, eventId: string, userId: string | undefined) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    const event = await this.prisma.event.update({ where: { id: eventId }, data: { status: EventStatus.ENDED } });
    await this.audit(merchantId, eventId, userId, "EVENT_ENDED", "Event", eventId);
    return { event, cleanupRequired: true };
  }

  async cleanupEndedEvent(merchantId: string, eventId: string, userId: string | undefined) {
    await this.assertRole(merchantId, eventId, userId, ADMIN_ROLES);
    return this.rosters.cleanupEndedEvent(merchantId, eventId, userId);
  }

  async addStaff(merchantId: string, eventId: string, actorUserId: string | undefined, merchantUserId: string, role: EventStaffRole, permissions?: Record<string, boolean>) {
    await this.assertRole(merchantId, eventId, actorUserId, ADMIN_ROLES);
    const user = await this.prisma.merchantUser.findFirst({ where: { id: merchantUserId, merchantId, deletedAt: null } }); if (!user) throw new NotFoundException("Merchant user not found");
    const membership = await this.prisma.eventStaffMembership.upsert({ where: { eventId_merchantUserId_role: { eventId, merchantUserId, role } }, create: { merchantId, eventId, merchantUserId, role, permissions: permissions as Prisma.InputJsonValue | undefined }, update: { revokedAt: null, permissions: permissions as Prisma.InputJsonValue | undefined } });
    await this.audit(merchantId, eventId, actorUserId, "EVENT_ROLE_ASSIGNED", "EventStaffMembership", membership.id, { merchantUserId, role }); return membership;
  }

  private audit(merchantId: string, eventId: string | undefined, actorUserId: string | undefined, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.eventAuditLog.create({ data: { merchantId, eventId, actorUserId, action, entityType, entityId, metadata } });
  }
}
