import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DebtRecordStatus, MerchantStatus, PaymentIntentStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash } from "crypto";
import { customAlphabet } from "nanoid";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { GoogleCalendarService } from "./google-calendar.service";
import {
  AdjustInventoryDto,
  AdjustLoyaltyDto,
  AssignDeliveryDto,
  ClosePosSessionDto,
  CreateAppointmentDto,
  CreateAppointmentOfferingDto,
  CreateAutomationDto,
  CreateBusinessCustomerDto,
  CreateCourierDto,
  CreateDeliveryZoneDto,
  CreateIntegrationDto,
  CreatePosSaleDto,
  CreatePosSessionDto,
  CreateProductMappingDto,
  CreatePurchaseOrderDto,
  CreatePublicAppointmentPaymentDto,
  CreateReconciliationImportDto,
  CreateReturnRequestDto,
  CreateSubscriptionDto,
  CreateSubscriptionPlanDto,
  CreateSubscriptionPlanMappingDto,
  CreateSupplierDto,
  InboundSubscriptionItemDto,
  InboundSubscriptionSyncDto,
  InboundStockSyncDto,
  ResolveReturnRequestDto,
  UpdateSubscriptionPlanDto,
  UpdateSubscriptionStatusDto,
  UpdateAppointmentDto,
} from "./dto/operations.dto";

const integrationSecretPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 40);
const DAY_MS = 86_400_000;

type OperationalCalendarEvent = {
  id: string;
  type: "APPOINTMENT" | "RESTOCK" | "PROMOTION_START" | "PROMOTION_END" | "DELIVERY" | "SUBSCRIPTION" | "INVOICE" | "RETURN" | "INTEGRATION_ERROR";
  title: string;
  detail: string;
  startsAt: Date;
  endsAt?: Date;
  status: string;
  urgency: "OVERDUE" | "TODAY" | "UPCOMING" | "INFORMATION";
  source: { kind: string; id: string };
  action?: { kind: string; label: string };
};

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: GoogleCalendarService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  private clean(value?: string | null): string | null {
    const next = value?.trim();
    return next ? next : null;
  }

  private checkoutUrl(clientSecret: string): string {
    const origin = (this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "");
    return `${origin}/#client_secret=${encodeURIComponent(clientSecret)}`;
  }

  private subscriptionIdentityKey(storeId: string, planId: string, customer: { id?: string | null; email?: string | null; phone?: string | null; name: string }): string {
    const identity = customer.id?.trim()
      || customer.email?.trim().toLowerCase()
      || customer.phone?.replace(/\D/g, "")
      || customer.name.trim().toLocaleLowerCase("es-BO");
    return createHash("sha256").update(`${storeId}:${planId}:${identity}`).digest("hex");
  }

  private subscriptionInvoiceStatus(invoice: { status: string; dueAt: Date }, paymentStatus: PaymentIntentStatus | null, now: Date): string {
    if (invoice.status === "CANCELED" || paymentStatus === PaymentIntentStatus.CANCELED) return "CANCELED";
    if (invoice.status === "PAID" || paymentStatus === PaymentIntentStatus.SUCCEEDED) return "PAID";
    if (paymentStatus === PaymentIntentStatus.FAILED) return "FAILED";
    if (invoice.dueAt > now) return "SCHEDULED";
    if (invoice.dueAt.getTime() + DAY_MS < now.getTime()) return "OVERDUE";
    return "PENDING";
  }

  async hub(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 86_400_000);
    const [
      customers,
      automations,
      deliveryZones,
      couriers,
      deliveryAssignments,
      suppliers,
      purchaseOrders,
      movements,
      reconciliations,
      returns,
      posSessions,
      posSales,
      integrations,
      offerings,
      appointments,
      calendarConnection,
      plans,
      subscriptions,
      invoices,
      lowStockProducts,
    ] = await Promise.all([
      this.prisma.businessCustomer.findMany({ where: { storeId }, orderBy: [{ lifetimeValue: "desc" }, { updatedAt: "desc" }], take: 50 }),
      this.prisma.merchantAutomation.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }),
      this.prisma.deliveryZone.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
      this.prisma.courier.findMany({ where: { storeId }, orderBy: [{ status: "asc" }, { name: "asc" }] }),
      this.prisma.deliveryAssignment.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.supplier.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
      this.prisma.purchaseOrder.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.inventoryMovement.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 40 }),
      this.prisma.reconciliationImport.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.customerReturnRequest.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.posSession.findMany({ where: { storeId }, orderBy: { openedAt: "desc" }, take: 20 }),
      this.prisma.posSale.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.integrationConnection.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, name: true, status: true, lastSyncAt: true, createdAt: true },
      }),
      this.prisma.appointmentServiceOffering.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
      this.prisma.appointment.findMany({ where: { storeId, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 50 }),
      this.prisma.calendarConnection.findUnique({ where: { storeId }, select: { id: true, provider: true, accountEmail: true, calendarId: true, status: true, updatedAt: true } }),
      this.prisma.subscriptionPlan.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }),
      this.prisma.customerSubscription.findMany({ where: { storeId }, orderBy: { nextBillingAt: "asc" }, take: 50 }),
      this.prisma.subscriptionInvoice.findMany({ where: { storeId }, orderBy: { dueAt: "asc" }, take: 50 }),
      this.prisma.paymentLink.findMany({
        where: { storeId, status: PaymentLinkStatus.ACTIVE, stock: { lte: 5 } },
        select: { id: true, name: true, stock: true, codigoProducto: true },
        orderBy: { stock: "asc" },
        take: 30,
      }),
    ]);

    const invoiceIntentIds = invoices.flatMap((invoice) => invoice.paymentIntentId ? [invoice.paymentIntentId] : []);
    const invoiceIntents = invoiceIntentIds.length
      ? await this.prisma.paymentIntent.findMany({
          where: { id: { in: invoiceIntentIds }, merchantId },
          select: { id: true, clientSecret: true, status: true },
        })
      : [];
    const invoiceIntentById = new Map(invoiceIntents.map((intent) => [intent.id, intent]));
    const invoicesWithCheckout = invoices.map((invoice) => {
      const intent = invoice.paymentIntentId ? invoiceIntentById.get(invoice.paymentIntentId) : undefined;
      return {
        ...invoice,
        paymentStatus: intent?.status ?? null,
        displayStatus: this.subscriptionInvoiceStatus(invoice, intent?.status ?? null, now),
        checkoutUrl: intent && invoice.status === "DUE" && intent.status !== PaymentIntentStatus.CANCELED ? this.checkoutUrl(intent.clientSecret) : null,
      };
    });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const invoicesBySubscription = new Map<string, typeof invoicesWithCheckout>();
    for (const invoice of invoicesWithCheckout) invoicesBySubscription.set(invoice.subscriptionId, [...(invoicesBySubscription.get(invoice.subscriptionId) ?? []), invoice]);
    const subscriptionsWithHistory = subscriptions.map((subscription) => ({
      ...subscription,
      plan: planById.get(subscription.planId) ?? null,
      invoices: invoicesBySubscription.get(subscription.id) ?? [],
    }));
    const integrationsWithHealth = await Promise.all(integrations.map(async (connection) => {
      const [lastRun, customerMappings, mappedSubscriptions] = await Promise.all([
        this.prisma.integrationSyncRun.findFirst({ where: { connectionId: connection.id }, orderBy: { startedAt: "desc" } }),
        this.prisma.integrationCustomerMapping.findMany({ where: { connectionId: connection.id }, select: { businessCustomerId: true } }),
        this.prisma.integrationSubscriptionMapping.count({ where: { connectionId: connection.id } }),
      ]);
      const incompleteCustomers = customerMappings.length
        ? await this.prisma.businessCustomer.count({ where: { id: { in: customerMappings.map((item) => item.businessCustomerId) }, storeId, email: null, phone: null } })
        : 0;
      const stale = !connection.lastSyncAt || now.getTime() - connection.lastSyncAt.getTime() > DAY_MS;
      return {
        ...connection,
        health: lastRun?.status === "FAILED" ? "ERROR" : stale ? (connection.lastSyncAt ? "STALE" : "NOT_SYNCED") : "HEALTHY",
        lastRun: lastRun ? { status: lastRun.status, itemCount: lastRun.itemCount, errorMessage: lastRun.errorMessage, startedAt: lastRun.startedAt, completedAt: lastRun.completedAt } : null,
        mappedCustomers: customerMappings.length,
        mappedSubscriptions,
        incompleteCustomers,
      };
    }));

    return {
      summary: {
        customers: customers.length,
        loyaltyPoints: customers.reduce((sum, customer) => sum + customer.loyaltyPoints, 0),
        openDeliveries: deliveryAssignments.filter((item) => !["DELIVERED", "CANCELED"].includes(item.status)).length,
        lowStock: lowStockProducts.length,
        unmatchedAmount: reconciliations.reduce((sum, item) => sum + item.unmatchedAmount, 0),
        upcomingAppointments: appointments.filter((item) => item.startsAt <= inSevenDays).length,
        activeSubscriptions: subscriptions.filter((item) => item.status === "ACTIVE").length,
        openReturns: returns.filter((item) => !["REJECTED", "REFUNDED"].includes(item.status)).length,
      },
      customers,
      automations,
      delivery: { zones: deliveryZones, couriers, assignments: deliveryAssignments },
      inventory: { lowStockProducts, suppliers, purchaseOrders, movements },
      reconciliation: reconciliations,
      returns,
      pos: { sessions: posSessions, sales: posSales },
      integrations: integrationsWithHealth,
      appointments: { offerings, upcoming: appointments, calendarConnection },
      subscriptions: { plans, customers: subscriptionsWithHistory, invoices: invoicesWithCheckout },
    };
  }

  async calendarEvents(merchantId: string, storeId: string, timeMin: Date, timeMax: Date) {
    await this.ownedStore(merchantId, storeId);
    const now = new Date();
    const urgencyFor = (date: Date, unresolved = true): OperationalCalendarEvent["urgency"] => {
      if (!unresolved) return "INFORMATION";
      if (date < now) return "OVERDUE";
      const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" });
      return localDay.format(date) === localDay.format(now) ? "TODAY" : "UPCOMING";
    };
    const inRange = { gte: timeMin, lt: timeMax };
    const [appointments, purchaseOrders, products, deliveries, subscriptions, invoices, returns, connections] = await Promise.all([
      this.prisma.appointment.findMany({ where: { storeId, startsAt: inRange, status: { not: "CANCELED" } }, orderBy: { startsAt: "asc" } }),
      this.prisma.purchaseOrder.findMany({ where: { storeId, expectedAt: inRange, status: { notIn: ["RECEIVED", "CANCELED"] } }, orderBy: { expectedAt: "asc" } }),
      this.prisma.paymentLink.findMany({
        where: {
          storeId,
          status: PaymentLinkStatus.ACTIVE,
          OR: [{ discountStartsAt: inRange }, { discountEndsAt: inRange }],
        },
        select: { id: true, name: true, discountPercent: true, discountStartsAt: true, discountEndsAt: true },
      }),
      this.prisma.deliveryAssignment.findMany({ where: { storeId, estimatedAt: inRange, status: { notIn: ["DELIVERED", "CANCELED"] } }, orderBy: { estimatedAt: "asc" } }),
      this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE", nextBillingAt: inRange }, orderBy: { nextBillingAt: "asc" } }),
      this.prisma.subscriptionInvoice.findMany({ where: { storeId, dueAt: inRange, status: { notIn: ["PAID", "CANCELED"] } }, orderBy: { dueAt: "asc" } }),
      this.prisma.customerReturnRequest.findMany({ where: { storeId, dueAt: inRange, status: { notIn: ["REJECTED", "REFUNDED"] } }, orderBy: { dueAt: "asc" } }),
      this.prisma.integrationConnection.findMany({ where: { storeId }, select: { id: true, name: true } }),
    ]);

    const offeringIds = [...new Set(appointments.map((item) => item.serviceOfferingId))];
    const supplierIds = [...new Set(purchaseOrders.map((item) => item.supplierId))];
    const purchaseOrderIds = purchaseOrders.map((item) => item.id);
    const orderIds = [...new Set([...deliveries.map((item) => item.orderId), ...returns.map((item) => item.orderId)])];
    const subscriptionIds = [...new Set([...subscriptions.map((item) => item.id), ...invoices.map((item) => item.subscriptionId)])];
    const planIds = [...new Set(subscriptions.map((item) => item.planId))];
    const connectionIds = connections.map((item) => item.id);
    const [offerings, suppliers, purchaseItems, storeOrders, relatedSubscriptions, directPlans, failedSyncs] = await Promise.all([
      offeringIds.length ? this.prisma.appointmentServiceOffering.findMany({ where: { id: { in: offeringIds }, storeId }, select: { id: true, name: true } }) : [],
      supplierIds.length ? this.prisma.supplier.findMany({ where: { id: { in: supplierIds }, storeId }, select: { id: true, name: true } }) : [],
      purchaseOrderIds.length ? this.prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: { in: purchaseOrderIds } }, orderBy: { createdAt: "asc" } }) : [],
      orderIds.length ? this.prisma.storeOrder.findMany({ where: { id: { in: orderIds }, storeId }, select: { id: true, amount: true, currency: true, status: true } }) : [],
      subscriptionIds.length ? this.prisma.customerSubscription.findMany({ where: { id: { in: subscriptionIds }, storeId }, select: { id: true, planId: true, customerName: true } }) : [],
      planIds.length ? this.prisma.subscriptionPlan.findMany({ where: { id: { in: planIds }, storeId }, select: { id: true, name: true } }) : [],
      connectionIds.length ? this.prisma.integrationSyncRun.findMany({ where: { connectionId: { in: connectionIds }, status: "FAILED", startedAt: inRange }, orderBy: { startedAt: "asc" } }) : [],
    ]);
    const missingPlanIds = [...new Set(relatedSubscriptions.map((item) => item.planId).filter((id) => !directPlans.some((plan) => plan.id === id)))];
    const extraPlans = missingPlanIds.length ? await this.prisma.subscriptionPlan.findMany({ where: { id: { in: missingPlanIds }, storeId }, select: { id: true, name: true } }) : [];

    const offeringById = new Map(offerings.map((item) => [item.id, item]));
    const supplierById = new Map(suppliers.map((item) => [item.id, item]));
    const orderById = new Map(storeOrders.map((item) => [item.id, item]));
    const subscriptionById = new Map(relatedSubscriptions.map((item) => [item.id, item]));
    const planById = new Map([...directPlans, ...extraPlans].map((item) => [item.id, item]));
    const connectionById = new Map(connections.map((item) => [item.id, item]));
    const purchaseItemsByOrder = new Map<string, typeof purchaseItems>();
    for (const item of purchaseItems) purchaseItemsByOrder.set(item.purchaseOrderId, [...(purchaseItemsByOrder.get(item.purchaseOrderId) ?? []), item]);
    const events: OperationalCalendarEvent[] = [];

    for (const appointment of appointments) {
      const offering = offeringById.get(appointment.serviceOfferingId);
      events.push({
        id: `appointment:${appointment.id}`,
        type: "APPOINTMENT",
        title: offering?.name ?? "Cita",
        detail: `${appointment.customerName}${appointment.calendarSyncError ? " · Error al sincronizar con Google" : ""}`,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        urgency: urgencyFor(appointment.startsAt, false),
        source: { kind: "APPOINTMENT", id: appointment.id },
        action: { kind: "MANAGE_APPOINTMENT", label: "Gestionar cita" },
      });
    }
    for (const order of purchaseOrders) {
      if (!order.expectedAt) continue;
      const items = purchaseItemsByOrder.get(order.id) ?? [];
      const units = items.reduce((sum, item) => sum + Math.max(0, item.quantity - item.receivedQuantity), 0);
      const names = items.slice(0, 2).map((item) => item.name).join(", ");
      events.push({
        id: `restock:${order.id}`,
        type: "RESTOCK",
        title: `Reposición · ${supplierById.get(order.supplierId)?.name ?? "Proveedor"}`,
        detail: `${units} uds.${names ? ` · ${names}${items.length > 2 ? ` +${items.length - 2}` : ""}` : ""}`,
        startsAt: order.expectedAt,
        status: order.status,
        urgency: urgencyFor(order.expectedAt),
        source: { kind: "PURCHASE_ORDER", id: order.id },
        action: { kind: "RECEIVE_PURCHASE_ORDER", label: "Recibir stock" },
      });
    }
    for (const product of products) {
      if (product.discountStartsAt && product.discountStartsAt >= timeMin && product.discountStartsAt < timeMax) events.push({
        id: `promotion-start:${product.id}`,
        type: "PROMOTION_START",
        title: `Inicia oferta · ${product.name}`,
        detail: `${product.discountPercent ?? 0}% de descuento`,
        startsAt: product.discountStartsAt,
        status: "SCHEDULED",
        urgency: urgencyFor(product.discountStartsAt, false),
        source: { kind: "PRODUCT", id: product.id },
        action: { kind: "OPEN_PRODUCT", label: "Ver producto" },
      });
      if (product.discountEndsAt && product.discountEndsAt >= timeMin && product.discountEndsAt < timeMax) events.push({
        id: `promotion-end:${product.id}`,
        type: "PROMOTION_END",
        title: `Termina oferta · ${product.name}`,
        detail: `${product.discountPercent ?? 0}% de descuento`,
        startsAt: product.discountEndsAt,
        status: "SCHEDULED",
        urgency: urgencyFor(product.discountEndsAt, false),
        source: { kind: "PRODUCT", id: product.id },
        action: { kind: "OPEN_PRODUCT", label: "Ver producto" },
      });
    }
    for (const delivery of deliveries) {
      if (!delivery.estimatedAt) continue;
      const order = orderById.get(delivery.orderId);
      events.push({
        id: `delivery:${delivery.id}`,
        type: "DELIVERY",
        title: `Entrega · ${delivery.orderId.slice(-8)}`,
        detail: `${delivery.address ?? "Dirección por confirmar"}${order ? ` · ${order.currency} ${(order.amount / 100).toFixed(2)}` : ""}`,
        startsAt: delivery.estimatedAt,
        status: delivery.status,
        urgency: urgencyFor(delivery.estimatedAt),
        source: { kind: "DELIVERY", id: delivery.id },
        action: { kind: "OPEN_DELIVERIES", label: "Ver entrega" },
      });
    }
    for (const subscription of subscriptions) {
      events.push({
        id: `subscription:${subscription.id}`,
        type: "SUBSCRIPTION",
        title: `Próximo cobro · ${subscription.customerName}`,
        detail: planById.get(subscription.planId)?.name ?? "Suscripción activa",
        startsAt: subscription.nextBillingAt,
        status: subscription.status,
        urgency: urgencyFor(subscription.nextBillingAt),
        source: { kind: "SUBSCRIPTION", id: subscription.id },
        action: { kind: "OPEN_FINANCE", label: "Ver cobro" },
      });
    }
    for (const invoice of invoices) {
      const subscription = subscriptionById.get(invoice.subscriptionId);
      events.push({
        id: `invoice:${invoice.id}`,
        type: "INVOICE",
        title: `Cobro pendiente · ${subscription?.customerName ?? "Cliente"}`,
        detail: `${invoice.currency} ${(invoice.amount / 100).toFixed(2)}`,
        startsAt: invoice.dueAt,
        status: invoice.status,
        urgency: urgencyFor(invoice.dueAt),
        source: { kind: "SUBSCRIPTION_INVOICE", id: invoice.id },
        action: { kind: "OPEN_FINANCE", label: "Revisar cobro" },
      });
    }
    for (const item of returns) {
      if (!item.dueAt) continue;
      const order = orderById.get(item.orderId);
      events.push({
        id: `return:${item.id}`,
        type: "RETURN",
        title: `Resolver devolución · ${item.orderId.slice(-8)}`,
        detail: `${item.reason}${order ? ` · ${order.currency} ${(order.amount / 100).toFixed(2)}` : ""}`,
        startsAt: item.dueAt,
        status: item.status,
        urgency: urgencyFor(item.dueAt),
        source: { kind: "RETURN", id: item.id },
        action: { kind: "OPEN_DELIVERIES", label: "Revisar devolución" },
      });
    }
    for (const run of failedSyncs) {
      const occurredAt = run.completedAt ?? run.startedAt;
      events.push({
        id: `integration-error:${run.id}`,
        type: "INTEGRATION_ERROR",
        title: `Falló sincronización · ${connectionById.get(run.connectionId)?.name ?? "Conexión externa"}`,
        detail: run.errorMessage ?? "Revisa la conexión y vuelve a enviar el stock.",
        startsAt: occurredAt,
        status: run.status,
        urgency: "OVERDUE",
        source: { kind: "INTEGRATION_SYNC", id: run.id },
        action: { kind: "OPEN_CONNECTIONS", label: "Revisar conexión" },
      });
    }

    events.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    return {
      range: { timeMin, timeMax },
      summary: {
        total: events.length,
        overdue: events.filter((item) => item.urgency === "OVERDUE").length,
        syncErrors: events.filter((item) => item.type === "INTEGRATION_ERROR").length,
      },
      events,
    };
  }

  async createCustomer(merchantId: string, storeId: string, dto: CreateBusinessCustomerDto) {
    await this.ownedStore(merchantId, storeId);
    const email = this.clean(dto.email)?.toLowerCase() ?? null;
    if (email) {
      const existing = await this.prisma.businessCustomer.findUnique({ where: { storeId_email: { storeId, email } } });
      if (existing) throw new ConflictException("Ya existe un cliente con ese correo en esta tienda");
    }
    return this.prisma.businessCustomer.create({
      data: {
        merchantId,
        storeId,
        name: dto.name.trim(),
        email,
        phone: this.clean(dto.phone),
        document: this.clean(dto.document),
        tags: [...new Set((dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
        marketingConsent: dto.marketingConsent ?? false,
      },
    });
  }

  async syncCustomers(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        merchantId,
        status: PaymentIntentStatus.SUCCEEDED,
        storeOrder: { is: { storeId } },
        OR: [{ customerEmail: { not: null } }, { customerPhone: { not: null } }],
      },
      select: { customerName: true, customerEmail: true, customerPhone: true, customerDocument: true, amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const grouped = new Map<string, typeof intents>();
    for (const intent of intents) {
      const email = intent.customerEmail?.trim().toLowerCase();
      const phone = intent.customerPhone?.trim();
      const key = email ? `email:${email}` : `phone:${phone}`;
      grouped.set(key, [...(grouped.get(key) ?? []), intent]);
    }

    let created = 0;
    let updated = 0;
    for (const records of grouped.values()) {
      const last = records.at(-1)!;
      const email = last.customerEmail?.trim().toLowerCase() ?? null;
      const phone = last.customerPhone?.trim() ?? null;
      const existing = email
        ? await this.prisma.businessCustomer.findUnique({ where: { storeId_email: { storeId, email } } })
        : await this.prisma.businessCustomer.findFirst({ where: { storeId, phone } });
      const data = {
        name: last.customerName?.trim() || email || phone || "Cliente",
        email,
        phone,
        document: last.customerDocument?.trim() || null,
        lifetimeValue: records.reduce((sum, record) => sum + record.amount, 0),
        orderCount: records.length,
        lastOrderAt: last.createdAt,
      };
      if (existing) {
        await this.prisma.businessCustomer.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await this.prisma.businessCustomer.create({ data: { merchantId, storeId, ...data } });
        created += 1;
      }
    }
    return { created, updated, total: grouped.size };
  }

  async adjustLoyalty(merchantId: string, storeId: string, customerId: string, dto: AdjustLoyaltyDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.businessCustomer.findFirst({ where: { id: customerId, storeId, merchantId } });
      if (!customer) throw new NotFoundException("Customer not found");
      const loyaltyPoints = customer.loyaltyPoints + dto.points;
      if (loyaltyPoints < 0) throw new BadRequestException("El saldo de puntos no puede quedar negativo");
      const updated = await tx.businessCustomer.update({ where: { id: customer.id }, data: { loyaltyPoints } });
      await tx.customerLoyaltyEntry.create({
        data: { merchantId, storeId, customerId, points: dto.points, reason: dto.reason.trim() },
      });
      return updated;
    });
  }

  async createAutomation(merchantId: string, storeId: string, dto: CreateAutomationDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.merchantAutomation.create({
      data: {
        merchantId,
        storeId,
        name: dto.name.trim(),
        kind: dto.kind,
        channel: dto.channel ?? "EMAIL",
        delayHours: dto.delayHours ?? 24,
        subject: this.clean(dto.subject),
        message: dto.message.trim(),
      },
    });
  }

  private template(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{(name|store|amount|date)\}\}/g, (_, key: string) => values[key] ?? "");
  }

  async runAutomations(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const automations = await this.prisma.merchantAutomation.findMany({ where: { storeId, merchantId, isActive: true } });
    let delivered = 0;
    let skipped = 0;
    for (const automation of automations) {
      const before = new Date(Date.now() - automation.delayHours * 3_600_000);
      const candidates: Array<{ sourceType: string; sourceId: string; recipient: string | null; name: string; amount: number; date: Date }> = [];
      if (automation.kind === "PAYMENT_RECOVERY") {
        const rows = await this.prisma.paymentIntent.findMany({
          where: {
            merchantId,
            storeOrder: { is: { storeId } },
            status: { in: [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.REQUIRES_ACTION, PaymentIntentStatus.FAILED] },
            customerEmail: { not: null },
            createdAt: { lte: before },
          },
          take: 100,
        });
        candidates.push(...rows.map((row) => ({ sourceType: "PAYMENT_INTENT", sourceId: row.id, recipient: row.customerEmail, name: row.customerName ?? "Cliente", amount: row.amount, date: row.createdAt })));
      } else if (automation.kind === "DEBT_REMINDER") {
        const rows = await this.prisma.debtRecord.findMany({
          where: { debtCollectionLink: { storeId }, status: DebtRecordStatus.PENDING, customerEmail: { not: null }, createdAt: { lte: before } },
          take: 100,
        });
        candidates.push(...rows.map((row) => ({ sourceType: "DEBT", sourceId: row.id, recipient: row.customerEmail, name: row.customerName, amount: row.amount, date: row.createdAt })));
      } else if (automation.kind === "APPOINTMENT_REMINDER") {
        const after = new Date(Date.now() + automation.delayHours * 3_600_000);
        const rows = await this.prisma.appointment.findMany({ where: { storeId, status: "CONFIRMED", startsAt: { gte: new Date(), lte: after }, customerEmail: { not: null } }, take: 100 });
        candidates.push(...rows.map((row) => ({ sourceType: "APPOINTMENT", sourceId: row.id, recipient: row.customerEmail, name: row.customerName, amount: 0, date: row.startsAt })));
      } else if (automation.kind === "LOW_STOCK") {
        const lowStock = await this.prisma.paymentLink.findMany({ where: { storeId, status: PaymentLinkStatus.ACTIVE, stock: { lte: 5 } }, take: 100 });
        const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { email: true } });
        candidates.push(...lowStock.map((row) => ({ sourceType: "LOW_STOCK", sourceId: `${row.id}:${row.stock}`, recipient: merchant.email, name: row.name, amount: row.stock ?? 0, date: row.updatedAt })));
      }

      for (const candidate of candidates) {
        if (!candidate.recipient || automation.channel !== "EMAIL") { skipped += 1; continue; }
        const exists = await this.prisma.automationDelivery.findUnique({ where: { automationId_sourceType_sourceId: { automationId: automation.id, sourceType: candidate.sourceType, sourceId: candidate.sourceId } } });
        if (exists) { skipped += 1; continue; }
        const values = {
          name: candidate.name,
          store: store.name,
          amount: `${(candidate.amount / 100).toFixed(2)} BOB`,
          date: candidate.date.toLocaleString("es-BO", { timeZone: "America/La_Paz" }),
        };
        try {
          await this.email.send({
            to: candidate.recipient,
            subject: this.template(automation.subject || `Recordatorio de ${store.name}`, values),
            body: this.template(automation.message, values),
          });
          await this.prisma.automationDelivery.create({ data: { automationId: automation.id, merchantId, storeId, recipient: candidate.recipient, sourceType: candidate.sourceType, sourceId: candidate.sourceId, deliveredAt: new Date() } });
          delivered += 1;
        } catch (error) {
          await this.prisma.automationDelivery.create({ data: { automationId: automation.id, merchantId, storeId, recipient: candidate.recipient, sourceType: candidate.sourceType, sourceId: candidate.sourceId, status: "FAILED", failureReason: (error as Error).message } });
        }
      }
      await this.prisma.merchantAutomation.update({ where: { id: automation.id }, data: { lastRunAt: new Date() } });
    }
    return { delivered, skipped };
  }

  async createDeliveryZone(merchantId: string, storeId: string, dto: CreateDeliveryZoneDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.deliveryZone.create({ data: { merchantId, storeId, name: dto.name.trim(), fee: dto.fee, minimumOrder: dto.minimumOrder ?? 0, radiusKm: dto.radiusKm, estimatedMinutes: dto.estimatedMinutes } });
  }

  async createCourier(merchantId: string, storeId: string, dto: CreateCourierDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.courier.create({ data: { merchantId, storeId, name: dto.name.trim(), phone: this.clean(dto.phone), vehicle: this.clean(dto.vehicle) } });
  }

  async assignDelivery(merchantId: string, storeId: string, orderId: string, dto: AssignDeliveryDto) {
    await this.ownedStore(merchantId, storeId);
    const order = await this.prisma.storeOrder.findFirst({ where: { id: orderId, merchantId, storeId } });
    if (!order) throw new NotFoundException("Order not found");
    if (dto.courierId && !(await this.prisma.courier.findFirst({ where: { id: dto.courierId, storeId } }))) throw new BadRequestException("El repartidor no pertenece a esta tienda");
    if (dto.zoneId && !(await this.prisma.deliveryZone.findFirst({ where: { id: dto.zoneId, storeId } }))) throw new BadRequestException("La zona no pertenece a esta tienda");
    return this.prisma.deliveryAssignment.upsert({
      where: { orderId },
      create: { merchantId, storeId, orderId, courierId: dto.courierId, zoneId: dto.zoneId, status: dto.status ?? "ASSIGNED", address: this.clean(dto.address), latitude: dto.latitude, longitude: dto.longitude, fee: dto.fee ?? 0, notes: this.clean(dto.notes), estimatedAt: dto.estimatedAt ? new Date(dto.estimatedAt) : null },
      update: { courierId: dto.courierId, zoneId: dto.zoneId, status: dto.status, address: this.clean(dto.address), latitude: dto.latitude, longitude: dto.longitude, fee: dto.fee, notes: this.clean(dto.notes), estimatedAt: dto.estimatedAt ? new Date(dto.estimatedAt) : undefined, ...(dto.status === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
    });
  }

  async createSupplier(merchantId: string, storeId: string, dto: CreateSupplierDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.supplier.create({ data: { merchantId, storeId, name: dto.name.trim(), contactName: this.clean(dto.contactName), email: this.clean(dto.email)?.toLowerCase(), phone: this.clean(dto.phone), notes: this.clean(dto.notes) } });
  }

  async createPurchaseOrder(merchantId: string, storeId: string, dto: CreatePurchaseOrderDto) {
    await this.ownedStore(merchantId, storeId);
    if (!(await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, storeId } }))) throw new BadRequestException("El proveedor no pertenece a esta tienda");
    const paymentLinkIds = dto.items.flatMap((item) => item.paymentLinkId ? [item.paymentLinkId] : []);
    if (paymentLinkIds.length) {
      const count = await this.prisma.paymentLink.count({ where: { id: { in: [...new Set(paymentLinkIds)] }, storeId } });
      if (count !== new Set(paymentLinkIds).size) throw new BadRequestException("Uno de los productos no pertenece a esta tienda");
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({ data: { merchantId, storeId, supplierId: dto.supplierId, currency: dto.currency ?? "BOB", expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null, notes: this.clean(dto.notes), totalAmount: dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) } });
      await tx.purchaseOrderItem.createMany({ data: dto.items.map((item) => ({ purchaseOrderId: order.id, paymentLinkId: item.paymentLinkId, sku: this.clean(item.sku), name: item.name.trim(), quantity: item.quantity, unitCost: item.unitCost })) });
      return { ...order, items: await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: order.id } }) };
    });
  }

  async receivePurchaseOrder(merchantId: string, storeId: string, purchaseOrderId: string) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, merchantId, storeId } });
      if (!order) throw new NotFoundException("Purchase order not found");
      if (order.status === "RECEIVED") throw new ConflictException("La orden de compra ya fue recibida");
      if (order.status === "CANCELED") throw new ConflictException("No se puede recibir una orden cancelada");
      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
      let updatedProducts = 0;
      for (const item of items) {
        const remaining = Math.max(0, item.quantity - item.receivedQuantity);
        if (!item.paymentLinkId || remaining === 0) continue;
        const product = await tx.paymentLink.findFirst({ where: { id: item.paymentLinkId, storeId } });
        if (!product) continue;
        const stockAfter = (product.stock ?? 0) + remaining;
        await tx.paymentLink.update({ where: { id: product.id }, data: { stock: stockAfter } });
        await tx.inventoryMovement.create({
          data: {
            merchantId,
            storeId,
            paymentLinkId: product.id,
            quantityDelta: remaining,
            stockAfter,
            reason: `Recepción de orden ${purchaseOrderId.slice(-8)}`,
            sourceType: "PURCHASE_ORDER",
            sourceId: purchaseOrderId,
          },
        });
        updatedProducts += 1;
      }
      for (const item of items) {
        if (item.receivedQuantity !== item.quantity) await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQuantity: item.quantity } });
      }
      const receivedAt = new Date();
      const received = await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: "RECEIVED", receivedAt } });
      return { ...received, receivedItems: items.length, updatedProducts };
    });
  }

  async adjustInventory(merchantId: string, storeId: string, dto: AdjustInventoryDto, sourceType = "MANUAL", sourceId?: string) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.paymentLink.findFirst({ where: { id: dto.paymentLinkId, storeId } });
      if (!product) throw new NotFoundException("Product not found");
      if (dto.mode === "DELTA" && product.stock === null) throw new BadRequestException("Define un stock antes de aplicar movimientos");
      const stock = dto.mode === "SET" ? dto.quantity : (product.stock ?? 0) + dto.quantity;
      if (stock < 0) throw new BadRequestException("El movimiento dejaría el stock negativo");
      await tx.paymentLink.update({ where: { id: product.id }, data: { stock } });
      return tx.inventoryMovement.create({ data: { merchantId, storeId, paymentLinkId: product.id, quantityDelta: stock - (product.stock ?? 0), stockAfter: stock, reason: dto.reason.trim(), sourceType, sourceId } });
    });
  }

  async reconcile(merchantId: string, storeId: string, dto: CreateReconciliationImportDto) {
    await this.ownedStore(merchantId, storeId);
    const references = dto.entries.flatMap((entry) => entry.railReference ? [entry.railReference] : []);
    const transactions = references.length ? await this.prisma.transaction.findMany({ where: { railReference: { in: [...new Set(references)] }, paymentIntent: { is: { merchantId } } }, select: { id: true, railReference: true, amount: true } }) : [];
    const byReference = new Map(transactions.map((transaction) => [transaction.railReference, transaction]));
    const rows = dto.entries.map((entry) => {
      const match = entry.railReference ? byReference.get(entry.railReference) : undefined;
      const matched = Boolean(match && match.amount === entry.amount);
      return { ...entry, match, status: matched ? "MATCHED" : match ? "AMOUNT_MISMATCH" : "UNMATCHED" };
    });
    const matchedAmount = rows.filter((row) => row.status === "MATCHED").reduce((sum, row) => sum + row.amount, 0);
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    return this.prisma.$transaction(async (tx) => {
      const imported = await tx.reconciliationImport.create({ data: { merchantId, storeId, source: dto.source.trim(), currency: dto.currency ?? "BOB", totalAmount, matchedAmount, unmatchedAmount: totalAmount - matchedAmount, status: matchedAmount === totalAmount ? "MATCHED" : "NEEDS_REVIEW", completedAt: new Date() } });
      await tx.reconciliationEntry.createMany({ data: rows.map((row) => ({ importId: imported.id, externalId: row.externalId.trim(), occurredAt: new Date(row.occurredAt), amount: row.amount, description: this.clean(row.description), railReference: this.clean(row.railReference), transactionId: row.match?.id, status: row.status })) });
      return { ...imported, entries: await tx.reconciliationEntry.findMany({ where: { importId: imported.id } }) };
    });
  }

  async listReturns(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.customerReturnRequest.findMany({ where: { merchantId, storeId }, orderBy: { createdAt: "desc" } });
  }

  async resolveReturn(merchantId: string, storeId: string, id: string, dto: ResolveReturnRequestDto) {
    await this.ownedStore(merchantId, storeId);
    const row = await this.prisma.customerReturnRequest.findFirst({ where: { id, merchantId, storeId } });
    if (!row) throw new NotFoundException("Return request not found");
    return this.prisma.customerReturnRequest.update({ where: { id }, data: { status: dto.status, resolution: this.clean(dto.resolution) } });
  }

  async createPosSession(merchantId: string, storeId: string, dto: CreatePosSessionDto) {
    await this.ownedStore(merchantId, storeId);
    const existing = await this.prisma.posSession.findFirst({ where: { storeId, status: "OPEN", cashierName: dto.cashierName.trim() } });
    if (existing) throw new ConflictException("Esta persona ya tiene una caja abierta");
    return this.prisma.posSession.create({ data: { merchantId, storeId, cashierName: dto.cashierName.trim(), openingFloat: dto.openingFloat ?? 0 } });
  }

  async closePosSession(merchantId: string, storeId: string, sessionId: string, dto: ClosePosSessionDto) {
    await this.ownedStore(merchantId, storeId);
    const session = await this.prisma.posSession.findFirst({ where: { id: sessionId, merchantId, storeId, status: "OPEN" } });
    if (!session) throw new NotFoundException("Open POS session not found");
    return this.prisma.posSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closingAmount: dto.closingAmount, closedAt: new Date() } });
  }

  async createPosSale(merchantId: string, storeId: string, dto: CreatePosSaleDto) {
    await this.ownedStore(merchantId, storeId);
    const session = await this.prisma.posSession.findFirst({ where: { id: dto.sessionId, merchantId, storeId, status: "OPEN" } });
    if (!session) throw new NotFoundException("Open POS session not found");
    const requested = new Map<string, number>();
    dto.items.forEach((item) => requested.set(item.paymentLinkId, (requested.get(item.paymentLinkId) ?? 0) + item.quantity));
    const products = await this.prisma.paymentLink.findMany({ where: { id: { in: [...requested.keys()] }, storeId, status: PaymentLinkStatus.ACTIVE } });
    if (products.length !== requested.size) throw new BadRequestException("Uno de los productos no está disponible");
    const lines = products.map((product) => ({ paymentLinkId: product.id, name: product.name, quantity: requested.get(product.id)!, unitAmount: product.amount }));
    const amount = lines.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
    return this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const updated = await tx.paymentLink.updateMany({ where: { id: line.paymentLinkId, OR: [{ stock: null }, { stock: { gte: line.quantity } }] }, data: { stock: { decrement: line.quantity } } });
        if (updated.count !== 1) throw new BadRequestException(`Ya no hay suficiente stock de "${line.name}"`);
        const product = products.find((item) => item.id === line.paymentLinkId)!;
        await tx.inventoryMovement.create({ data: { merchantId, storeId, paymentLinkId: line.paymentLinkId, quantityDelta: -line.quantity, stockAfter: product.stock === null ? null : product.stock - line.quantity, reason: "Venta en caja", sourceType: "POS" } });
      }
      return tx.posSale.create({ data: { merchantId, storeId, sessionId: session.id, paymentMethod: dto.paymentMethod, amount, items: lines as unknown as Prisma.InputJsonValue, customerName: this.clean(dto.customerName), customerEmail: this.clean(dto.customerEmail)?.toLowerCase() } });
    });
  }

  async createIntegration(merchantId: string, storeId: string, dto: CreateIntegrationDto) {
    await this.ownedStore(merchantId, storeId);
    const secret = `sync_${integrationSecretPart()}`;
    const connection = await this.prisma.integrationConnection.create({ data: { merchantId, storeId, kind: dto.kind, name: dto.name.trim(), secretHash: await argon2.hash(secret) }, select: { id: true, kind: true, name: true, status: true, createdAt: true } });
    return { ...connection, secret };
  }

  async listIntegrations(merchantId: string, storeId: string) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.integrationConnection.findMany({
      where: { merchantId, storeId, status: "ACTIVE" },
      select: { id: true, kind: true, name: true, status: true, lastSyncAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async verifyIntegrationInbound(connectionId: string, secret: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, status: "ACTIVE" },
      select: { id: true, name: true, kind: true, secretHash: true },
    });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) {
      throw new UnauthorizedException("Invalid integration secret");
    }
    return {
      connected: true,
      connectionId: connection.id,
      name: connection.name,
      kind: connection.kind,
      checkedAt: new Date().toISOString(),
      capabilities: ["stock", "subscriptions"],
    };
  }

  async createProductMapping(merchantId: string, storeId: string, connectionId: string, dto: CreateProductMappingDto) {
    await this.ownedStore(merchantId, storeId);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId, status: "ACTIVE" } });
    if (!connection) throw new NotFoundException("Integration not found");
    if (!(await this.prisma.paymentLink.findFirst({ where: { id: dto.paymentLinkId, storeId } }))) throw new BadRequestException("El producto no pertenece a esta tienda");
    return this.prisma.integrationProductMapping.upsert({ where: { connectionId_externalSku: { connectionId, externalSku: dto.externalSku.trim() } }, create: { connectionId, paymentLinkId: dto.paymentLinkId, externalSku: dto.externalSku.trim(), externalName: this.clean(dto.externalName) }, update: { paymentLinkId: dto.paymentLinkId, externalName: this.clean(dto.externalName) } });
  }

  async createSubscriptionPlanMapping(merchantId: string, storeId: string, connectionId: string, dto: CreateSubscriptionPlanMappingDto) {
    await this.ownedStore(merchantId, storeId);
    const [connection, plan] = await Promise.all([
      this.prisma.integrationConnection.findFirst({ where: { id: connectionId, merchantId, storeId, status: "ACTIVE" } }),
      this.prisma.subscriptionPlan.findFirst({ where: { id: dto.subscriptionPlanId, merchantId, storeId, isActive: true } }),
    ]);
    if (!connection) throw new NotFoundException("Integration not found");
    if (!plan) throw new BadRequestException("El plan no pertenece a esta tienda o está inactivo");
    const externalPlanCode = dto.externalPlanCode.trim();
    return this.prisma.integrationSubscriptionPlanMapping.upsert({
      where: { connectionId_externalPlanCode: { connectionId, externalPlanCode } },
      create: { connectionId, subscriptionPlanId: plan.id, externalPlanCode, externalName: this.clean(dto.externalName) },
      update: { subscriptionPlanId: plan.id, externalName: this.clean(dto.externalName) },
    });
  }

  async syncStockInbound(connectionId: string, secret: string, dto: InboundStockSyncDto) {
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, status: "ACTIVE" } });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) throw new UnauthorizedException("Invalid integration secret");
    const mappings = await this.prisma.integrationProductMapping.findMany({ where: { connectionId, externalSku: { in: dto.items.map((item) => item.externalSku.trim()) } } });
    const mappingBySku = new Map(mappings.map((mapping) => [mapping.externalSku, mapping]));
    const run = await this.prisma.integrationSyncRun.create({ data: { connectionId, direction: "INBOUND_STOCK" } });
    try {
      let updated = 0;
      await this.prisma.$transaction(async (tx) => {
        for (const item of dto.items) {
          const mapping = mappingBySku.get(item.externalSku.trim());
          if (!mapping) continue;
          const product = await tx.paymentLink.findFirst({ where: { id: mapping.paymentLinkId, storeId: connection.storeId } });
          if (!product) continue;
          await tx.paymentLink.update({ where: { id: product.id }, data: { stock: item.stock } });
          await tx.inventoryMovement.create({ data: { merchantId: connection.merchantId, storeId: connection.storeId, paymentLinkId: product.id, quantityDelta: item.stock - (product.stock ?? 0), stockAfter: item.stock, reason: `Sincronización ${connection.name}`, sourceType: "INTEGRATION", sourceId: run.id } });
          updated += 1;
        }
        await tx.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
        await tx.integrationSyncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", itemCount: updated, completedAt: new Date() } });
      });
      return { received: dto.items.length, updated };
    } catch (error) {
      await this.prisma.integrationSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: (error as Error).message, completedAt: new Date() } });
      throw error;
    }
  }

  private async upsertExternalCustomer(
    tx: Prisma.TransactionClient,
    connection: { id: string; merchantId: string; storeId: string },
    item: InboundSubscriptionItemDto,
  ) {
    const externalCustomerId = item.externalCustomerId.trim();
    const mapped = await tx.integrationCustomerMapping.findUnique({
      where: { connectionId_externalCustomerId: { connectionId: connection.id, externalCustomerId } },
    });
    let customer = mapped
      ? await tx.businessCustomer.findFirst({ where: { id: mapped.businessCustomerId, storeId: connection.storeId } })
      : null;
    const email = this.clean(item.customerEmail)?.toLowerCase() ?? null;
    const phone = this.clean(item.customerPhone);
    if (!customer && email) customer = await tx.businessCustomer.findUnique({ where: { storeId_email: { storeId: connection.storeId, email } } });
    if (!customer && phone) customer = await tx.businessCustomer.findFirst({ where: { storeId: connection.storeId, phone } });
    const data = { name: item.customerName.trim(), email, phone };
    if (customer) customer = await tx.businessCustomer.update({ where: { id: customer.id }, data });
    else customer = await tx.businessCustomer.create({ data: { merchantId: connection.merchantId, storeId: connection.storeId, ...data } });
    await tx.integrationCustomerMapping.upsert({
      where: { connectionId_externalCustomerId: { connectionId: connection.id, externalCustomerId } },
      create: { connectionId: connection.id, externalCustomerId, businessCustomerId: customer.id },
      update: { businessCustomerId: customer.id },
    });
    return customer;
  }

  async syncSubscriptionsInbound(connectionId: string, secret: string, dto: InboundSubscriptionSyncDto) {
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, status: "ACTIVE" } });
    if (!connection || !(await argon2.verify(connection.secretHash, secret))) throw new UnauthorizedException("Invalid integration secret");
    const externalIds = dto.items.map((item) => item.externalSubscriptionId.trim());
    if (new Set(externalIds).size !== externalIds.length) throw new BadRequestException("externalSubscriptionId no puede repetirse en una misma sincronización");
    const planCodes = [...new Set(dto.items.map((item) => item.externalPlanCode.trim()))];
    const planMappings = await this.prisma.integrationSubscriptionPlanMapping.findMany({
      where: { connectionId, externalPlanCode: { in: planCodes } },
    });
    const mappingByCode = new Map(planMappings.map((mapping) => [mapping.externalPlanCode, mapping]));
    const run = await this.prisma.integrationSyncRun.create({ data: { connectionId, direction: "INBOUND_SUBSCRIPTIONS" } });
    try {
      const summary = { created: 0, updated: 0, canceled: 0, paused: 0, skipped: [] as Array<{ externalSubscriptionId: string; reason: string }> };
      await this.prisma.$transaction(async (tx) => {
        for (const item of dto.items) {
          const externalSubscriptionId = item.externalSubscriptionId.trim();
          const planMapping = mappingByCode.get(item.externalPlanCode.trim());
          if (!planMapping) {
            summary.skipped.push({ externalSubscriptionId, reason: `Plan externo sin mapear: ${item.externalPlanCode.trim()}` });
            continue;
          }
          const plan = await tx.subscriptionPlan.findFirst({
            where: { id: planMapping.subscriptionPlanId, storeId: connection.storeId, isActive: true },
          });
          if (!plan) {
            summary.skipped.push({ externalSubscriptionId, reason: "El plan mapeado ya no está activo" });
            continue;
          }
          const customer = await this.upsertExternalCustomer(tx, connection, item);
          const existingMapping = await tx.integrationSubscriptionMapping.findUnique({
            where: { connectionId_externalSubscriptionId: { connectionId, externalSubscriptionId } },
          });
          const canceledAt = item.status === "CANCELED" ? new Date(item.canceledAt ?? Date.now()) : null;
          const activeKey = item.status === "CANCELED" ? null : this.subscriptionIdentityKey(connection.storeId, plan.id, {
            id: customer.id,
            email: item.customerEmail,
            phone: item.customerPhone,
            name: item.customerName,
          });
          const subscriptionData = {
            planId: plan.id,
            customerId: customer.id,
            customerName: item.customerName.trim(),
            customerEmail: this.clean(item.customerEmail)?.toLowerCase(),
            customerPhone: this.clean(item.customerPhone),
            amountOverride: item.amount ?? null,
            status: item.status,
            startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
            nextBillingAt: new Date(item.nextBillingAt),
            canceledAt,
            activeKey,
          };
          const mappedSubscription = existingMapping
            ? await tx.customerSubscription.findFirst({ where: { id: existingMapping.customerSubscriptionId, storeId: connection.storeId } })
            : null;
          let duplicateSubscription = !mappedSubscription && activeKey
            ? await tx.customerSubscription.findUnique({ where: { activeKey } })
            : null;
          if (!mappedSubscription && !duplicateSubscription && activeKey) {
            duplicateSubscription = await tx.customerSubscription.findFirst({
              where: {
                storeId: connection.storeId,
                planId: plan.id,
                status: { in: ["ACTIVE", "PAUSED"] },
                customerId: customer.id,
              },
            });
          }
          const existingSubscription = mappedSubscription ?? duplicateSubscription;
          let subscription;
          if (existingSubscription) {
            const nextBillingAt = existingSubscription.nextBillingAt > subscriptionData.nextBillingAt
              ? existingSubscription.nextBillingAt
              : subscriptionData.nextBillingAt;
            subscription = await tx.customerSubscription.update({ where: { id: existingSubscription.id }, data: { ...subscriptionData, nextBillingAt } });
            summary.updated += 1;
          } else {
            subscription = await tx.customerSubscription.create({
              data: { merchantId: connection.merchantId, storeId: connection.storeId, ...subscriptionData },
            });
            summary.created += 1;
          }
          await tx.integrationSubscriptionMapping.upsert({
            where: { connectionId_externalSubscriptionId: { connectionId, externalSubscriptionId } },
            create: { connectionId, externalSubscriptionId, customerSubscriptionId: subscription.id },
            update: { customerSubscriptionId: subscription.id },
          });
          if (item.status === "CANCELED") summary.canceled += 1;
          if (item.status === "PAUSED") summary.paused += 1;
        }
        const processed = summary.created + summary.updated;
        await tx.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });
        await tx.integrationSyncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", itemCount: processed, completedAt: new Date() } });
      });
      const billing = await this.generateSubscriptionInvoices(connection.merchantId, connection.storeId);
      return { received: dto.items.length, ...summary, billing };
    } catch (error) {
      await this.prisma.integrationSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: (error as Error).message.slice(0, 1_000), completedAt: new Date() } });
      throw error;
    }
  }

  async createAppointmentOffering(merchantId: string, storeId: string, dto: CreateAppointmentOfferingDto) {
    await this.ownedStore(merchantId, storeId);
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
          customerPhone: this.clean(dto.customerPhone),
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
        customerPhone: this.clean(dto.customerPhone) ?? undefined,
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
      checkoutUrl: created.intent ? this.checkoutUrl(created.intent.clientSecret) : null,
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
    const store = await this.ownedStore(merchantId, storeId);
    const offering = await this.prisma.appointmentServiceOffering.findFirst({ where: { id: dto.serviceOfferingId, storeId, isActive: true } });
    if (!offering) throw new NotFoundException("Appointment service not found");
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + (offering.durationMinutes + offering.bufferMinutes) * 60_000);
    if (startsAt <= new Date()) throw new BadRequestException("La cita debe programarse en el futuro");
    const overlap = await this.prisma.appointment.findFirst({ where: { storeId, status: { in: ["CONFIRMED", "PENDING"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (overlap) throw new ConflictException("Ese horario ya está ocupado");
    const appointment = await this.prisma.appointment.create({ data: { merchantId, storeId, serviceOfferingId: offering.id, customerName: dto.customerName.trim(), customerEmail: this.clean(dto.customerEmail)?.toLowerCase(), customerPhone: this.clean(dto.customerPhone), startsAt, endsAt, notes: this.clean(dto.notes) } });
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
    const store = await this.ownedStore(merchantId, storeId);
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

  async createSubscriptionPlan(merchantId: string, storeId: string, dto: CreateSubscriptionPlanDto) {
    await this.ownedStore(merchantId, storeId);
    return this.prisma.subscriptionPlan.create({ data: { merchantId, storeId, name: dto.name.trim(), amount: dto.amount, currency: dto.currency ?? "BOB", interval: dto.interval ?? "MONTHLY", intervalCount: dto.intervalCount ?? 1, reminderHoursBefore: dto.reminderHoursBefore ?? 24 } });
  }

  async updateSubscriptionPlan(merchantId: string, storeId: string, planId: string, dto: UpdateSubscriptionPlanDto) {
    await this.ownedStore(merchantId, storeId);
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: planId, merchantId, storeId, isActive: true } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    if (dto.scope === "NEXT_ONLY") {
      if (!dto.amount) throw new BadRequestException("Indica el monto que se aplicará solo al próximo cobro");
      if (dto.name || dto.interval || dto.intervalCount || dto.reminderHoursBefore !== undefined) {
        throw new BadRequestException("El alcance 'solo el próximo cobro' admite únicamente un cambio de monto");
      }
      const result = await this.prisma.customerSubscription.updateMany({
        where: { merchantId, storeId, planId, status: { in: ["ACTIVE", "PAUSED"] } },
        data: { nextAmountOverride: dto.amount },
      });
      return { plan, scope: dto.scope, affectedSubscriptions: result.count, nextAmount: dto.amount };
    }
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.amount ? { amount: dto.amount } : {}),
        ...(dto.interval ? { interval: dto.interval } : {}),
        ...(dto.intervalCount ? { intervalCount: dto.intervalCount } : {}),
        ...(dto.reminderHoursBefore !== undefined ? { reminderHoursBefore: dto.reminderHoursBefore } : {}),
      },
    });
    return { plan: updated, scope: dto.scope, affectedSubscriptions: await this.prisma.customerSubscription.count({ where: { merchantId, storeId, planId, status: { in: ["ACTIVE", "PAUSED"] } } }) };
  }

  async createSubscription(merchantId: string, storeId: string, dto: CreateSubscriptionDto) {
    await this.ownedStore(merchantId, storeId);
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: dto.planId, storeId, isActive: true } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    const customer = dto.customerId ? await this.prisma.businessCustomer.findFirst({ where: { id: dto.customerId, storeId } }) : null;
    if (dto.customerId && !customer) throw new BadRequestException("El cliente no pertenece a esta tienda");
    const customerName = customer?.name ?? dto.customerName.trim();
    const customerEmail = customer?.email ?? this.clean(dto.customerEmail)?.toLowerCase() ?? null;
    const customerPhone = customer?.phone ?? this.clean(dto.customerPhone);
    const identityCustomerId = customer?.id ?? dto.customerId;
    const activeKey = this.subscriptionIdentityKey(storeId, plan.id, { id: identityCustomerId, email: customerEmail, phone: customerPhone, name: customerName });
    let duplicate = await this.prisma.customerSubscription.findUnique({ where: { activeKey } });
    if (!duplicate) {
      const identities: Array<{ customerId: string } | { customerEmail: string } | { customerPhone: string }> = [];
      if (identityCustomerId) identities.push({ customerId: identityCustomerId });
      if (customerEmail) identities.push({ customerEmail });
      if (customerPhone) identities.push({ customerPhone });
      duplicate = await this.prisma.customerSubscription.findFirst({
        where: {
          storeId,
          planId: plan.id,
          status: { in: ["ACTIVE", "PAUSED"] },
          ...(identities.length > 0 ? { OR: identities } : { customerName: { equals: customerName, mode: "insensitive" } }),
        },
      });
    }
    if (duplicate) throw new ConflictException("Este cliente ya tiene una suscripción activa o pausada para el mismo plan");
    const nextBillingAt = new Date(dto.nextBillingAt);
    if (nextBillingAt.getTime() < Date.now() - DAY_MS) throw new BadRequestException("La primera fecha de cobro no puede estar en el pasado");
    return this.prisma.customerSubscription.create({ data: { merchantId, storeId, planId: plan.id, customerId: customer?.id ?? dto.customerId, customerName, customerEmail, customerPhone, amountOverride: dto.amountOverride, nextBillingAt, activeKey } });
  }

  async updateSubscriptionStatus(merchantId: string, storeId: string, subscriptionId: string, dto: UpdateSubscriptionStatusDto) {
    await this.ownedStore(merchantId, storeId);
    const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: subscriptionId, merchantId, storeId } });
    if (!subscription) throw new NotFoundException("Subscription not found");
    if (subscription.status === "CANCELED" && dto.status !== "CANCELED") throw new BadRequestException("Una suscripción cancelada no puede reactivarse; crea una nueva");
    const activeKey = dto.status === "CANCELED" ? null : this.subscriptionIdentityKey(storeId, subscription.planId, {
      id: subscription.customerId,
      email: subscription.customerEmail,
      phone: subscription.customerPhone,
      name: subscription.customerName,
    });
    const conflict = activeKey ? await this.prisma.customerSubscription.findFirst({ where: { activeKey, id: { not: subscription.id } } }) : null;
    if (conflict) throw new ConflictException("Ya existe otra suscripción para este cliente y plan");
    return this.prisma.customerSubscription.update({
      where: { id: subscription.id },
      data: { status: dto.status, activeKey, canceledAt: dto.status === "CANCELED" ? new Date() : null },
    });
  }

  private advanceBilling(date: Date, interval: string, count: number): Date {
    const next = new Date(date);
    if (interval === "WEEKLY") next.setUTCDate(next.getUTCDate() + count * 7);
    else if (interval === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + count);
    else next.setUTCMonth(next.getUTCMonth() + count);
    return next;
  }

  private async ensureSubscriptionPaymentIntent(
    tx: Prisma.TransactionClient,
    livemode: boolean,
    storeName: string,
    subscription: { id: string; planId: string; customerName: string; customerEmail: string | null; customerPhone: string | null },
    plan: { id: string; name: string },
    invoice: { id: string; periodStart: Date; amount: number; currency: string },
    merchantId: string,
    storeId: string,
    forceNew = false,
  ) {
    const rows = await tx.$queryRaw<Array<{ paymentIntentId: string | null }>>`
      SELECT "paymentIntentId" FROM "SubscriptionInvoice" WHERE id = ${invoice.id} FOR UPDATE
    `;
    const existingIntentId = rows[0]?.paymentIntentId;
    if (existingIntentId) {
      const existingIntent = await tx.paymentIntent.findUnique({ where: { id: existingIntentId } });
      if (existingIntent && (!forceNew || (existingIntent.status !== PaymentIntentStatus.FAILED && existingIntent.status !== PaymentIntentStatus.CANCELED))) return { intent: existingIntent, created: false };
      if (existingIntent?.status === PaymentIntentStatus.FAILED) {
        await tx.paymentIntent.update({ where: { id: existingIntent.id }, data: { status: PaymentIntentStatus.CANCELED } });
      }
    }
    const intent = await this.paymentIntents.createInTransaction(tx, merchantId, livemode, {
      amount: invoice.amount,
      currency: invoice.currency,
      description: `${plan.name} · ${subscription.customerName} · ${storeName}`,
      metadata: {
        storeId,
        subscription: {
          invoiceId: invoice.id,
          subscriptionId: subscription.id,
          planId: plan.id,
          planName: plan.name,
          periodStart: invoice.periodStart.toISOString(),
          customerName: subscription.customerName,
          customerEmail: subscription.customerEmail,
          customerPhone: subscription.customerPhone,
        },
      },
    });
    await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { paymentIntentId: intent.id } });
    return { intent, created: true };
  }

  private async sendSubscriptionChargeEmail(
    storeName: string,
    planName: string,
    customer: { name: string; email: string | null },
    amount: number,
    currency: string,
    checkoutUrl: string,
    reminder = false,
  ): Promise<boolean> {
    if (!customer.email) return false;
    try {
      await this.email.send({
        to: customer.email,
        subject: reminder ? `Recordatorio: ${planName} en ${storeName}` : `Tu cobro de ${planName} en ${storeName}`,
        body: reminder
          ? `Hola ${customer.name}, tu cobro de ${(amount / 100).toFixed(2)} ${currency} por ${planName} sigue pendiente. Puedes pagarlo aquí: ${checkoutUrl}`
          : `Hola ${customer.name}, tu cobro de ${(amount / 100).toFixed(2)} ${currency} por ${planName} está listo. Págalo de forma segura aquí: ${checkoutUrl}`,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Subscription charge email failed for ${customer.email}: ${(error as Error).message}`);
      return false;
    }
  }

  async generateSubscriptionInvoices(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } });
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const now = new Date();
    const generationHorizon = new Date(now.getTime() + 720 * 3_600_000);
    const candidates = await this.prisma.customerSubscription.findMany({ where: { merchantId, storeId, status: "ACTIVE", nextBillingAt: { lte: generationHorizon } } });
    let created = 0;
    let paymentLinksCreated = 0;
    let emailsSent = 0;
    const charges: Array<{ invoiceId: string; paymentIntentId: string; checkoutUrl: string; amount: number; currency: string }> = [];
    for (const subscription of candidates) {
      const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
      if (!plan) continue;
      const generationAt = new Date(subscription.nextBillingAt.getTime() - plan.reminderHoursBefore * 3_600_000);
      if (generationAt > now) continue;
      const amount = subscription.nextAmountOverride ?? subscription.amountOverride ?? plan.amount;
      const outcome = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.subscriptionInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } } });
        const invoice = existing ?? await tx.subscriptionInvoice.upsert({
          where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
          create: { subscriptionId: subscription.id, merchantId, storeId, periodStart: subscription.nextBillingAt, amount, currency: plan.currency, dueAt: subscription.nextBillingAt },
          update: {},
        });
        const ensured = await this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId);
        await tx.customerSubscription.updateMany({
          where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
          data: { nextBillingAt: this.advanceBilling(subscription.nextBillingAt, plan.interval, plan.intervalCount), nextAmountOverride: null },
        });
        return { invoice, intent: ensured.intent, invoiceCreated: !existing, paymentLinkCreated: ensured.created };
      });
      if (outcome.invoiceCreated) created += 1;
      if (outcome.paymentLinkCreated) paymentLinksCreated += 1;
      const checkoutUrl = this.checkoutUrl(outcome.intent.clientSecret);
      charges.push({ invoiceId: outcome.invoice.id, paymentIntentId: outcome.intent.id, checkoutUrl, amount: outcome.invoice.amount, currency: outcome.invoice.currency });
      if (outcome.paymentLinkCreated && await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, outcome.invoice.amount, outcome.invoice.currency, checkoutUrl)) {
        emailsSent += 1;
        await this.prisma.subscriptionInvoice.update({ where: { id: outcome.invoice.id }, data: { initialNoticeAt: new Date() } });
      }
    }

    const invoicesWithoutLinks = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", paymentIntentId: null }, take: 200 });
    for (const invoice of invoicesWithoutLinks) {
      const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
      if (!subscription) continue;
      const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
      if (!plan) continue;
      const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId));
      if (!ensured.created) continue;
      paymentLinksCreated += 1;
      const checkoutUrl = this.checkoutUrl(ensured.intent.clientSecret);
      charges.push({ invoiceId: invoice.id, paymentIntentId: ensured.intent.id, checkoutUrl, amount: invoice.amount, currency: invoice.currency });
      if (await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, checkoutUrl)) {
        emailsSent += 1;
        await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { initialNoticeAt: new Date() } });
      }
    }
    return { created, paymentLinksCreated, emailsSent, charges };
  }

  async sendDueSubscriptionReminders(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const now = new Date();
    const initialCutoff = new Date(now.getTime() - 12 * 3_600_000);
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        merchantId,
        storeId,
        status: "DUE",
        dueAt: { lte: now },
        lastReminderAt: null,
        OR: [{ initialNoticeAt: null }, { initialNoticeAt: { lte: initialCutoff } }],
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    });
    let delivered = 0;
    let skipped = 0;
    for (const invoice of invoices) {
      const subscription = await this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } });
      if (!subscription || !subscription.customerEmail || !invoice.paymentIntentId) { skipped += 1; continue; }
      const [plan, intent] = await Promise.all([
        this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } }),
        this.prisma.paymentIntent.findUnique({ where: { id: invoice.paymentIntentId } }),
      ]);
      if (!plan || !intent || intent.status === PaymentIntentStatus.SUCCEEDED || intent.status === PaymentIntentStatus.CANCELED) { skipped += 1; continue; }
      const sent = await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, this.checkoutUrl(intent.clientSecret), true);
      if (!sent) { skipped += 1; continue; }
      await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
      delivered += 1;
    }
    return { delivered, skipped };
  }

  async remindSubscriptionInvoice(merchantId: string, storeId: string, invoiceId: string, regenerate: boolean) {
    const store = await this.ownedStore(merchantId, storeId);
    const invoice = await this.prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, merchantId, storeId } });
    if (!invoice) throw new NotFoundException("Subscription invoice not found");
    if (invoice.status === "PAID") throw new BadRequestException("Este cobro ya fue pagado");
    if (invoice.status === "CANCELED") throw new BadRequestException("Este cobro fue cancelado");
    const [subscription, merchant] = await Promise.all([
      this.prisma.customerSubscription.findFirst({ where: { id: invoice.subscriptionId, merchantId, storeId } }),
      this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { status: true } }),
    ]);
    if (!subscription) throw new NotFoundException("Subscription not found");
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } });
    if (!plan) throw new NotFoundException("Subscription plan not found");
    const livemode = merchant.status === MerchantStatus.ACTIVE && store.status === "ACTIVE";
    const ensured = await this.prisma.$transaction((tx) => this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, plan, invoice, merchantId, storeId, regenerate));
    const checkoutUrl = this.checkoutUrl(ensured.intent.clientSecret);
    const sent = await this.sendSubscriptionChargeEmail(store.name, plan.name, { name: subscription.customerName, email: subscription.customerEmail }, invoice.amount, invoice.currency, checkoutUrl, true);
    if (sent) await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } } });
    return { checkoutUrl, regenerated: ensured.created, sent, recipient: subscription.customerEmail };
  }

  async consumerFavorites(consumerUserId: string) {
    const favorites = await this.prisma.customerFavorite.findMany({ where: { consumerUserId }, orderBy: { createdAt: "desc" } });
    const products = await this.prisma.paymentLink.findMany({ where: { id: { in: favorites.map((favorite) => favorite.paymentLinkId) }, status: PaymentLinkStatus.ACTIVE }, select: { id: true, storeId: true, name: true, amount: true, currency: true, imageUrls: true, stock: true } });
    return products;
  }

  async addFavorite(consumerUserId: string, paymentLinkId: string) {
    const product = await this.prisma.paymentLink.findFirst({ where: { id: paymentLinkId, status: PaymentLinkStatus.ACTIVE }, select: { id: true, storeId: true } });
    if (!product) throw new NotFoundException("Product not found");
    return this.prisma.customerFavorite.upsert({ where: { consumerUserId_paymentLinkId: { consumerUserId, paymentLinkId } }, create: { consumerUserId, paymentLinkId, storeId: product.storeId }, update: {} });
  }

  async removeFavorite(consumerUserId: string, paymentLinkId: string) {
    await this.prisma.customerFavorite.deleteMany({ where: { consumerUserId, paymentLinkId } });
    return { removed: true };
  }

  async createConsumerReturn(consumerUserId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.storeOrder.findFirst({ where: { id: dto.orderId, consumerUserId } });
    if (!order) throw new NotFoundException("Order not found");
    return this.prisma.customerReturnRequest.create({ data: { consumerUserId, merchantId: order.merchantId, storeId: order.storeId, orderId: order.id, reason: dto.reason.trim(), details: this.clean(dto.details), dueAt: new Date(Date.now() + 7 * DAY_MS) } });
  }
}
