import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DebtRecordStatus, PaymentIntentStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import {
  AdjustInventoryDto,
  AdjustLoyaltyDto,
  AssignDeliveryDto,
  ClosePosSessionDto,
  CreateAutomationDto,
  CreateBusinessCustomerDto,
  CreateCourierDto,
  CreateDeliveryZoneDto,
  CreatePosSaleDto,
  CreatePosSessionDto,
  CreatePurchaseOrderDto,
  CreateReconciliationImportDto,
  CreateReturnRequestDto,
  CreateSupplierDto,
  ResolveReturnRequestDto
} from "./dto/operations.dto";
import { ownedStore, clean, paymentCheckoutUrl, subscriptionInvoiceStatus, DAY_MS } from "./operations-helpers";

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

/** The merchant's operations hub: calendar, customers and loyalty, automations, delivery, suppliers and inventory, reconciliation, returns, and POS. */
@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async hub(merchantId: string, storeId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
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
        displayStatus: subscriptionInvoiceStatus(invoice, intent?.status ?? null, now),
        checkoutUrl: intent && invoice.status === "DUE" && intent.status !== PaymentIntentStatus.CANCELED ? paymentCheckoutUrl(this.config, intent.clientSecret) : null,
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
    await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
    const email = clean(dto.email)?.toLowerCase() ?? null;
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
        phone: clean(dto.phone),
        document: clean(dto.document),
        tags: [...new Set((dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
        marketingConsent: dto.marketingConsent ?? false,
      },
    });
  }
  async syncCustomers(merchantId: string, storeId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.merchantAutomation.create({
      data: {
        merchantId,
        storeId,
        name: dto.name.trim(),
        kind: dto.kind,
        channel: dto.channel ?? "EMAIL",
        delayHours: dto.delayHours ?? 24,
        subject: clean(dto.subject),
        message: dto.message.trim(),
      },
    });
  }
  private template(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{(name|store|amount|date)\}\}/g, (_, key: string) => values[key] ?? "");
  }
  async runAutomations(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
    if (dto.maximumOrder !== undefined && dto.maximumOrder < (dto.minimumOrder ?? 0) || dto.maximumWeightGrams !== undefined && dto.maximumWeightGrams < (dto.minimumWeightGrams ?? 0)) throw new BadRequestException('Revisa los límites de importe y peso.');
    return this.prisma.deliveryZone.create({ data: { countryCodes: dto.countryCodes, postalPrefixes: dto.postalPrefixes, currency: dto.currency ?? 'BOB', freeAbove: dto.freeAbove, maximumOrder: dto.maximumOrder, minimumWeightGrams: dto.minimumWeightGrams, maximumWeightGrams: dto.maximumWeightGrams, merchantId, storeId, name: dto.name.trim(), fee: dto.fee, minimumOrder: dto.minimumOrder ?? 0, radiusKm: dto.radiusKm, estimatedMinutes: dto.estimatedMinutes } });
  }
  async createCourier(merchantId: string, storeId: string, dto: CreateCourierDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.courier.create({ data: { merchantId, storeId, name: dto.name.trim(), phone: clean(dto.phone), vehicle: clean(dto.vehicle) } });
  }
  async assignDelivery(merchantId: string, storeId: string, orderId: string, dto: AssignDeliveryDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const order = await this.prisma.storeOrder.findFirst({ where: { id: orderId, merchantId, storeId } });
    if (!order) throw new NotFoundException("Order not found");
    if (dto.courierId && !(await this.prisma.courier.findFirst({ where: { id: dto.courierId, storeId } }))) throw new BadRequestException("El repartidor no pertenece a esta tienda");
    if (dto.zoneId && !(await this.prisma.deliveryZone.findFirst({ where: { id: dto.zoneId, storeId } }))) throw new BadRequestException("La zona no pertenece a esta tienda");
    return this.prisma.deliveryAssignment.upsert({
      where: { orderId },
      create: { merchantId, storeId, orderId, courierId: dto.courierId, zoneId: dto.zoneId, status: dto.status ?? "ASSIGNED", address: clean(dto.address), latitude: dto.latitude, longitude: dto.longitude, fee: dto.fee ?? 0, notes: clean(dto.notes), estimatedAt: dto.estimatedAt ? new Date(dto.estimatedAt) : null },
      update: { courierId: dto.courierId, zoneId: dto.zoneId, status: dto.status, address: clean(dto.address), latitude: dto.latitude, longitude: dto.longitude, fee: dto.fee, notes: clean(dto.notes), estimatedAt: dto.estimatedAt ? new Date(dto.estimatedAt) : undefined, ...(dto.status === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
    });
  }
  async createSupplier(merchantId: string, storeId: string, dto: CreateSupplierDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.supplier.create({ data: { merchantId, storeId, name: dto.name.trim(), contactName: clean(dto.contactName), email: clean(dto.email)?.toLowerCase(), phone: clean(dto.phone), notes: clean(dto.notes) } });
  }
  async createPurchaseOrder(merchantId: string, storeId: string, dto: CreatePurchaseOrderDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    if (!(await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, storeId } }))) throw new BadRequestException("El proveedor no pertenece a esta tienda");
    const paymentLinkIds = dto.items.flatMap((item) => item.paymentLinkId ? [item.paymentLinkId] : []);
    if (paymentLinkIds.length) {
      const count = await this.prisma.paymentLink.count({ where: { id: { in: [...new Set(paymentLinkIds)] }, storeId } });
      if (count !== new Set(paymentLinkIds).size) throw new BadRequestException("Uno de los productos no pertenece a esta tienda");
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({ data: { merchantId, storeId, supplierId: dto.supplierId, currency: dto.currency ?? "BOB", expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null, notes: clean(dto.notes), totalAmount: dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) } });
      await tx.purchaseOrderItem.createMany({ data: dto.items.map((item) => ({ purchaseOrderId: order.id, paymentLinkId: item.paymentLinkId, sku: clean(item.sku), name: item.name.trim(), quantity: item.quantity, unitCost: item.unitCost })) });
      return { ...order, items: await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: order.id } }) };
    });
  }
  async receivePurchaseOrder(merchantId: string, storeId: string, purchaseOrderId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
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
    await ownedStore(this.prisma, merchantId, storeId);
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
      await tx.reconciliationEntry.createMany({ data: rows.map((row) => ({ importId: imported.id, externalId: row.externalId.trim(), occurredAt: new Date(row.occurredAt), amount: row.amount, description: clean(row.description), railReference: clean(row.railReference), transactionId: row.match?.id, status: row.status })) });
      return { ...imported, entries: await tx.reconciliationEntry.findMany({ where: { importId: imported.id } }) };
    });
  }
  async listReturns(merchantId: string, storeId: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    return this.prisma.customerReturnRequest.findMany({ where: { merchantId, storeId }, orderBy: { createdAt: "desc" } });
  }
  async resolveReturn(merchantId: string, storeId: string, id: string, dto: ResolveReturnRequestDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const row = await this.prisma.customerReturnRequest.findFirst({ where: { id, merchantId, storeId } });
    if (!row) throw new NotFoundException("Return request not found");
    return this.prisma.customerReturnRequest.update({ where: { id }, data: { status: dto.status, resolution: clean(dto.resolution) } });
  }
  async createPosSession(merchantId: string, storeId: string, dto: CreatePosSessionDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const existing = await this.prisma.posSession.findFirst({ where: { storeId, status: "OPEN", cashierName: dto.cashierName.trim() } });
    if (existing) throw new ConflictException("Esta persona ya tiene una caja abierta");
    return this.prisma.posSession.create({ data: { merchantId, storeId, cashierName: dto.cashierName.trim(), openingFloat: dto.openingFloat ?? 0 } });
  }
  async closePosSession(merchantId: string, storeId: string, sessionId: string, dto: ClosePosSessionDto) {
    await ownedStore(this.prisma, merchantId, storeId);
    const session = await this.prisma.posSession.findFirst({ where: { id: sessionId, merchantId, storeId, status: "OPEN" } });
    if (!session) throw new NotFoundException("Open POS session not found");
    return this.prisma.posSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closingAmount: dto.closingAmount, closedAt: new Date() } });
  }
  async createPosSale(merchantId: string, storeId: string, dto: CreatePosSaleDto) {
    await ownedStore(this.prisma, merchantId, storeId);
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
      return tx.posSale.create({ data: { merchantId, storeId, sessionId: session.id, paymentMethod: dto.paymentMethod, amount, items: lines as unknown as Prisma.InputJsonValue, customerName: clean(dto.customerName), customerEmail: clean(dto.customerEmail)?.toLowerCase() } });
    });
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
    return this.prisma.customerReturnRequest.create({ data: { consumerUserId, merchantId: order.merchantId, storeId: order.storeId, orderId: order.id, reason: dto.reason.trim(), details: clean(dto.details), dueAt: new Date(Date.now() + 7 * DAY_MS) } });
  }
}
