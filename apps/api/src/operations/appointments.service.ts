import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus } from "@prisma/client";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleCalendarService } from "./google-calendar.service";
import {
  CreateAppointmentDto,
  CreateAppointmentOfferingDto,
  CreatePublicAppointmentPaymentDto,
  UpdateAppointmentDto,
} from "./dto/operations.dto";
import { ownedStore, clean, paymentCheckoutUrl, DAY_MS } from "./operations-helpers";

/** Bookable services and appointments, including public booking with payment holds and Google Calendar sync. */
@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: GoogleCalendarService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  async createAppointmentOffering(merchantId: string, storeId: string, dto: CreateAppointmentOfferingDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.appointmentServiceOffering.create({ data: { merchantId, storeId, name: dto.name.trim(), durationMinutes: dto.durationMinutes, bufferMinutes: dto.bufferMinutes ?? 0, price: dto.price ?? 0, currency: dto.currency ?? "BOB", color: dto.color } });
  }
  async publicAppointmentAvailability(slug: string, offeringId: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException("La fecha debe tener formato AAAA-MM-DD");
    const store = await this.prisma.store.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true, merchantId: true, name: true } });
    if (!store) throw new NotFoundException("Store not found");
    const offering = await this.prisma.appointmentServiceOffering.findFirst({ where: { id: offeringId, storeId: store.id, isActive: true } });
    if (!offering) throw new NotFoundException("Appointment service not found");
    const dayStart = new Date(`${date}T00:00:00-04:00`);
    const dayEnd = new Date(`${date}T23:59:59.999-04:00`);
    const now = new Date();
    if (Number.isNaN(dayStart.getTime()) || dayEnd < now || dayStart.getTime() > now.getTime() + 90 * DAY_MS) throw new BadRequestException("Elige una fecha dentro de los próximos 90 días");
    const localAppointments = await this.prisma.appointment.findMany({
      where: {
        storeId: store.id,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
        ],
      },
      select: { startsAt: true, endsAt: true },
    });
    const google = await this.calendar.freeBusy(store.merchantId, store.id, dayStart, dayEnd);
    const busy = [
      ...localAppointments.map((item) => ({ start: item.startsAt, end: item.endsAt })),
      ...google.busy.map((item) => ({ start: new Date(item.start), end: new Date(item.end) })),
    ];
    const slots: Array<{ startsAt: string; endsAt: string; label: string }> = [];
    const opensAt = new Date(`${date}T09:00:00-04:00`);
    const closesAt = new Date(`${date}T18:00:00-04:00`);
    const durationMs = (offering.durationMinutes + offering.bufferMinutes) * 60_000;
    for (let start = opensAt; start.getTime() + durationMs <= closesAt.getTime(); start = new Date(start.getTime() + 30 * 60_000)) {
      const end = new Date(start.getTime() + durationMs);
      if (start.getTime() < now.getTime() + 15 * 60_000) continue;
      if (busy.some((range) => range.start < end && range.end > start)) continue;
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString(), label: start.toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" }) });
    }
    return {
      date,
      connectedToGoogleCalendar: google.connected,
      offering: { id: offering.id, name: offering.name, durationMinutes: offering.durationMinutes, bufferMinutes: offering.bufferMinutes, price: offering.price, currency: offering.currency },
      slots,
    };
  }
  async createPublicAppointmentPayment(slug: string, dto: CreatePublicAppointmentPaymentDto) {
    const store = await this.prisma.store.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true, merchantId: true, name: true, status: true, checkoutMode: true } });
    if (!store) throw new NotFoundException("Store not found");
    const offering = await this.prisma.appointmentServiceOffering.findFirst({ where: { id: dto.offeringId, storeId: store.id, isActive: true } });
    if (!offering) throw new NotFoundException("Appointment service not found");
    if (offering.price > 0 && store.checkoutMode !== "payment") throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados para citas");
    const startsAt = new Date(dto.startsAt);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt);
    const availability = await this.publicAppointmentAvailability(slug, offering.id, date);
    const selected = availability.slots.find((slot) => slot.startsAt === startsAt.toISOString());
    if (!selected) throw new ConflictException("Ese horario ya no está disponible. Elige otro.");
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId }, select: { status: true } });
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const endsAt = new Date(selected.endsAt);
    const holdExpiresAt = offering.price > 0 ? new Date(Date.now() + 15 * 60_000) : null;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${store.id}), hashtext(${startsAt.toISOString()}))`;
      const overlap = await tx.appointment.findFirst({
        where: {
          storeId: store.id,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          OR: [{ status: "CONFIRMED" }, { status: "PENDING", holdExpiresAt: { gt: new Date() } }],
        },
      });
      if (overlap) throw new ConflictException("Ese horario acaba de reservarse. Elige otro.");
      const appointment = await tx.appointment.create({
        data: {
          merchantId: store.merchantId,
          storeId: store.id,
          serviceOfferingId: offering.id,
          customerName: dto.customerName.trim(),
          customerEmail: dto.customerEmail.trim().toLowerCase(),
          customerPhone: clean(dto.customerPhone),
          startsAt,
          endsAt,
          status: offering.price > 0 ? "PENDING" : "CONFIRMED",
          holdExpiresAt,
        },
      });
      if (offering.price <= 0) return { appointment, intent: null };
      const intent = await this.paymentIntents.createInTransaction(tx, store.merchantId, livemode, {
        amount: offering.price,
        currency: offering.currency,
        description: `${offering.name} · ${dto.customerName.trim()} · ${store.name}`,
        customerName: dto.customerName.trim(),
        customerEmail: dto.customerEmail.trim().toLowerCase(),
        customerPhone: clean(dto.customerPhone) ?? undefined,
        metadata: {
          storeId: store.id,
          appointment: { appointmentId: appointment.id, offeringId: offering.id, offeringName: offering.name, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
        },
      });
      await tx.appointment.update({ where: { id: appointment.id }, data: { depositPaymentIntentId: intent.id } });
      return { appointment: { ...appointment, depositPaymentIntentId: intent.id }, intent };
    });
    try {
      const googleEventId = await this.calendar.createEvent(store.id, store.name, offering.name, created.appointment);
      if (googleEventId) await this.prisma.appointment.update({ where: { id: created.appointment.id }, data: { googleEventId, calendarSyncError: null } });
    } catch (error) {
      await this.prisma.appointment.update({ where: { id: created.appointment.id }, data: { status: "CANCELED", holdExpiresAt: null, calendarSyncError: (error as Error).message.slice(0, 500) } });
      if (created.intent) await this.paymentIntents.cancelById(created.intent.id).catch(() => undefined);
      throw error;
    }
    return {
      appointmentId: created.appointment.id,
      clientSecret: created.intent?.clientSecret ?? null,
      checkoutUrl: created.intent ? paymentCheckoutUrl(this.config, created.intent.clientSecret) : null,
      holdExpiresAt,
      status: created.intent ? "AWAITING_PAYMENT" : "CONFIRMED",
    };
  }
  async releaseExpiredAppointmentHolds() {
    const expired = await this.prisma.appointment.findMany({
      where: { status: "PENDING", holdExpiresAt: { lte: new Date() } },
      take: 200,
    });
    let released = 0;
    for (const appointment of expired) {
      if (appointment.googleEventId) await this.calendar.deleteEvent(appointment.storeId, appointment.googleEventId).catch(() => false);
      if (appointment.depositPaymentIntentId) await this.paymentIntents.cancelById(appointment.depositPaymentIntentId).catch(() => undefined);
      await this.prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELED", holdExpiresAt: null, googleEventId: null } });
      released += 1;
    }
    const canceledWithCalendarEvent = await this.prisma.appointment.findMany({
      where: { status: "CANCELED", googleEventId: { not: null } },
      take: 200,
    });
    let calendarEventsRemoved = 0;
    for (const appointment of canceledWithCalendarEvent) {
      const removed = await this.calendar.deleteEvent(appointment.storeId, appointment.googleEventId!).catch(() => false);
      if (!removed) continue;
      await this.prisma.appointment.update({ where: { id: appointment.id }, data: { googleEventId: null } });
      calendarEventsRemoved += 1;
    }
    return { released, calendarEventsRemoved };
  }
  async createAppointment(merchantId: string, storeId: string, dto: CreateAppointmentDto) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const offering = await this.prisma.appointmentServiceOffering.findFirst({ where: { id: dto.serviceOfferingId, storeId, isActive: true } });
    if (!offering) throw new NotFoundException("Appointment service not found");
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + (offering.durationMinutes + offering.bufferMinutes) * 60_000);
    if (startsAt <= new Date()) throw new BadRequestException("La cita debe programarse en el futuro");
    const overlap = await this.prisma.appointment.findFirst({ where: { storeId, status: { in: ["CONFIRMED", "PENDING"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (overlap) throw new ConflictException("Ese horario ya está ocupado");
    const appointment = await this.prisma.appointment.create({ data: { merchantId, storeId, serviceOfferingId: offering.id, customerName: dto.customerName.trim(), customerEmail: clean(dto.customerEmail)?.toLowerCase(), customerPhone: clean(dto.customerPhone), startsAt, endsAt, notes: clean(dto.notes) } });
    try {
      const googleEventId = await this.calendar.createEvent(storeId, store.name, offering.name, appointment);
      if (googleEventId) return this.prisma.appointment.update({ where: { id: appointment.id }, data: { googleEventId, calendarSyncError: null } });
    } catch (error) {
      this.logger.warn(`Calendar sync failed for appointment ${appointment.id}: ${(error as Error).message}`);
      return this.prisma.appointment.update({ where: { id: appointment.id }, data: { calendarSyncError: (error as Error).message.slice(0, 500) } });
    }
    return appointment;
  }
  async updateAppointment(merchantId: string, storeId: string, appointmentId: string, dto: UpdateAppointmentDto) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const appointment = await this.prisma.appointment.findFirst({ where: { id: appointmentId, merchantId, storeId } });
    if (!appointment) throw new NotFoundException("Appointment not found");
    if (!dto.status && !dto.startsAt) throw new BadRequestException("Envía un estado o una nueva fecha para la cita");
    const offering = await this.prisma.appointmentServiceOffering.findFirst({ where: { id: appointment.serviceOfferingId, storeId } });
    if (!offering) throw new NotFoundException("Appointment service not found");
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : appointment.startsAt;
    const endsAt = dto.startsAt ? new Date(startsAt.getTime() + (offering.durationMinutes + offering.bufferMinutes) * 60_000) : appointment.endsAt;
    if (dto.startsAt && startsAt <= new Date()) throw new BadRequestException("La cita debe programarse en el futuro");
    if (dto.startsAt) {
      const overlap = await this.prisma.appointment.findFirst({ where: { id: { not: appointmentId }, storeId, status: { in: ["CONFIRMED", "PENDING"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (overlap) throw new ConflictException("Ese horario ya está ocupado");
    }
    const updated = await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: dto.status, startsAt, endsAt } });
    if (["COMPLETED", "NO_SHOW"].includes(updated.status)) return updated;
    try {
      if (updated.status === "CANCELED") {
        if (updated.googleEventId && !(await this.calendar.deleteEvent(storeId, updated.googleEventId))) throw new Error("Google Calendar no está conectado; vuelve a conectarlo para eliminar la cita externa");
        return this.prisma.appointment.update({ where: { id: appointmentId }, data: { googleEventId: null, calendarSyncError: null } });
      }
      if (updated.googleEventId) {
        if (!(await this.calendar.updateEvent(storeId, updated.googleEventId, store.name, offering.name, updated))) throw new Error("Google Calendar no está conectado; vuelve a conectarlo para actualizar la cita externa");
        return this.prisma.appointment.update({ where: { id: appointmentId }, data: { calendarSyncError: null } });
      }
      const googleEventId = await this.calendar.createEvent(storeId, store.name, offering.name, updated);
      if (googleEventId) return this.prisma.appointment.update({ where: { id: appointmentId }, data: { googleEventId, calendarSyncError: null } });
    } catch (error) {
      this.logger.warn(`Calendar sync failed for appointment ${appointment.id}: ${(error as Error).message}`);
      return this.prisma.appointment.update({ where: { id: appointmentId }, data: { calendarSyncError: (error as Error).message.slice(0, 500) } });
    }
    return updated;
  }
}
