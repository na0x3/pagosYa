import "reflect-metadata";
import { PrismaClient, ApiKeyMode, ApiKeyType, BiometricConsentScope, BiometricProvider, DevicePersonSyncStatus, EventStaffRole, EventStatus, KycStatus, MerchantStatus, SettlementMode, TicketTypeKind } from "@prisma/client";
import * as argon2 from "argon2";
import { ApiKeyService } from "../src/auth/api-key.service";
import { KycService } from "../src/merchants/kyc.service";
import { MerchantsService } from "../src/merchants/merchants.service";
import { OpsUserService } from "../src/ops/ops-user.service";
import { AuditLogService } from "../src/ops/audit-log.service";
import { PrismaService } from "../src/prisma/prisma.service";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The development seed must never run in production");
  const prisma = new PrismaClient();
  const apiKeys = new ApiKeyService(prisma as unknown as PrismaService);
  const auditLog = new AuditLogService(prisma as unknown as PrismaService);
  const kyc = new KycService(prisma as unknown as PrismaService, auditLog);
  const merchantsService = new MerchantsService(prisma as unknown as PrismaService, apiKeys);
  const opsUsers = new OpsUserService(prisma as unknown as PrismaService);

  const opsUserEmail = "ana@pagosya.bo";
  let opsUser = await prisma.opsUser.findUnique({ where: { email: opsUserEmail } });
  if (!opsUser) {
    const created = await opsUsers.create("Ana Gutierrez", opsUserEmail);
    opsUser = await prisma.opsUser.findUniqueOrThrow({ where: { id: created.user.id } });
    console.log(`\nOps reviewer: ${created.user.name} <${created.user.email}>`);
    console.log(`  ops token:       ${created.fullToken}`);
  }

  const merchants = [
    { name: "pagosYa Demo Store (Aggregator)", email: "demo-aggregator@pagosya.bo", settlementMode: SettlementMode.AGGREGATOR },
    { name: "pagosYa Demo Store (Facilitator)", email: "demo-facilitator@pagosya.bo", settlementMode: SettlementMode.FACILITATOR },
  ];

  for (const m of merchants) {
    const merchant = await prisma.merchant.upsert({
      where: { email: m.email },
      update: {},
      // status starts PENDING (schema default) — same as any real self-serve
      // signup. Only the Aggregator demo below walks through KYC to ACTIVE.
      create: { name: m.name, email: m.email, settlementMode: m.settlementMode },
    });

    const existingKeys = await prisma.apiKey.count({ where: { merchantId: merchant.id } });
    if (existingKeys > 0) {
      console.log(`\n${m.name} already seeded (merchant id: ${merchant.id}) — skipping key issuance.`);
      continue;
    }

    const secretKey = await apiKeys.issue(merchant.id, ApiKeyType.SECRET, ApiKeyMode.TEST);
    const publishableKey = await apiKeys.issue(merchant.id, ApiKeyType.PUBLISHABLE, ApiKeyMode.TEST);

    console.log(`\n${m.name}`);
    console.log(`  merchant id:     ${merchant.id}`);
    console.log(`  secret key:      ${secretKey.fullKey}`);
    console.log(`  publishable key: ${publishableKey.fullKey}`);

    // Demonstrate the full KYC -> ACTIVE -> LIVE keys path for one merchant;
    // leave the other PENDING to show what an unreviewed merchant looks like.
    if (m.settlementMode === SettlementMode.AGGREGATOR) {
      const submission = await kyc.submit(merchant.id, {
        legalName: m.name,
        taxId: "1023456028",
        legalRepName: "Maria Fernanda Rojas",
        legalRepDocumentId: "7654321 LP",
        payoutBankAccount: "BNB 4012345678",
      });
      const reviewed = await kyc.review(
        submission.id,
        { decision: KycStatus.APPROVED, note: "Seed data auto-approval" },
        opsUser,
      );
      console.log(`  kyc:             ${reviewed.status} (reviewed by ${reviewed.reviewedByLabel} at ${reviewed.reviewedAt?.toISOString()})`);

      const { liveKeys } = await merchantsService.issueLiveKeys(merchant.id);
      console.log(`  live secret key: ${liveKeys.secretKey}`);
      console.log(`  live pub key:    ${liveKeys.publishableKey}`);
    } else {
      console.log(`  kyc:             not submitted (status: ${merchant.status})`);
    }
  }

  const demoMerchant = await prisma.merchant.upsert({
    where: { email: "eventos-demo@pagosya.bo" },
    update: { name: "Noche Demo", status: MerchantStatus.ACTIVE },
    create: { name: "Noche Demo", email: "eventos-demo@pagosya.bo", status: MerchantStatus.ACTIVE, settlementMode: SettlementMode.AGGREGATOR },
  });
  const demoPassword = "PayaDemo!2026";
  const hashedPassword = await argon2.hash(demoPassword);
  await prisma.consumerUser.upsert({
    where: { email: "maria.face@example.test" },
    update: { name: "María Demo", deletedAt: null, emailVerifiedAt: new Date(), hashedPassword },
    create: { name: "María Demo", email: "maria.face@example.test", carnet: "FACE-DEMO-001", hashedPassword, emailVerifiedAt: new Date() },
  });
  const demoRoles = [
    ["admin", EventStaffRole.ORGANIZATION_ADMIN], ["manager", EventStaffRole.EVENT_MANAGER],
    ["cashier", EventStaffRole.CASHIER], ["doorstaff", EventStaffRole.DOOR_STAFF], ["promoter", EventStaffRole.PROMOTER],
  ] as const;
  const demoUsers = new Map<EventStaffRole, { id: string }>();
  for (const [label, role] of demoRoles) {
    const email = `${label}@demo.pagosya.bo`;
    const user = await prisma.merchantUser.upsert({
      where: { email },
      update: { merchantId: demoMerchant.id, deletedAt: null, emailVerifiedAt: new Date() },
      create: { merchantId: demoMerchant.id, email, hashedPassword, emailVerifiedAt: new Date() },
    });
    demoUsers.set(role, user);
  }
  const venue = await prisma.venue.findFirst({ where: { merchantId: demoMerchant.id, name: "Club Demo La Paz" } })
    ?? await prisma.venue.create({ data: { merchantId: demoMerchant.id, name: "Club Demo La Paz", city: "La Paz", capacity: 900 } });
  const store = await prisma.store.upsert({
    where: { slug: "noche-demo" },
    update: { merchantId: demoMerchant.id, name: "Noche Demo", checkoutMode: "payment" },
    create: { merchantId: demoMerchant.id, slug: "noche-demo", name: "Noche Demo", tagline: "Entradas y experiencias en La Paz", checkoutMode: "payment" },
  });
  const now = Date.now();
  const event = await prisma.event.upsert({
    where: { slug: "fiesta-demo" },
    update: { merchantId: demoMerchant.id, storeId: store.id, venueId: venue.id, venueName: venue.name, name: "Fiesta Demo", doorsOpenAt: new Date(now - 60 * 60_000), startsAt: new Date(now), endsAt: new Date(now + 8 * 60 * 60_000), capacity: 900, status: EventStatus.ACTIVE, onlineSalesEnabled: true, salesAtDoorEnabled: true },
    create: { merchantId: demoMerchant.id, storeId: store.id, venueId: venue.id, venueName: venue.name, slug: "fiesta-demo", name: "Fiesta Demo", publicityImageUrl: "", doorsOpenAt: new Date(now - 60 * 60_000), startsAt: new Date(now), endsAt: new Date(now + 8 * 60 * 60_000), capacity: 900, status: EventStatus.ACTIVE, onlineSalesEnabled: true, salesAtDoorEnabled: true },
  });
  const general = await prisma.ticketType.upsert({
    where: { eventId_name: { eventId: event.id, name: "General" } },
    update: { kind: TicketTypeKind.GENERAL, price: 8000, inventory: 600, currency: "BOB", sortOrder: 0, active: true },
    create: { eventId: event.id, kind: TicketTypeKind.GENERAL, name: "General", price: 8000, inventory: 600, currency: "BOB", sortOrder: 0 },
  });
  await prisma.ticketType.upsert({
    where: { eventId_name: { eventId: event.id, name: "VIP" } },
    update: { kind: TicketTypeKind.VIP, price: 15000, inventory: 100, currency: "BOB", sortOrder: 1, active: true },
    create: { eventId: event.id, kind: TicketTypeKind.VIP, name: "VIP", price: 15000, inventory: 100, currency: "BOB", sortOrder: 1 },
  });
  for (const [, role] of demoRoles) {
    const user = demoUsers.get(role)!;
    await prisma.eventStaffMembership.upsert({
      where: { eventId_merchantUserId_role: { eventId: event.id, merchantUserId: user.id, role } },
      update: { revokedAt: null },
      create: { merchantId: demoMerchant.id, eventId: event.id, merchantUserId: user.id, role },
    });
  }
  const promoterUser = demoUsers.get(EventStaffRole.PROMOTER)!;
  await prisma.promoterProfile.upsert({ where: { merchantUserId: promoterUser.id }, update: { displayName: "Promotor Demo" }, create: { merchantUserId: promoterUser.id, displayName: "Promotor Demo" } });
  const demoDevice = await prisma.accessDevice.upsert({
    where: { merchantId_serialNumber: { merchantId: demoMerchant.id, serialNumber: "MOCK-NOCHE-DEMO-01" } },
    update: { eventId: event.id, venueId: venue.id, status: "ONLINE", role: "BIDIRECTIONAL", faceCapacity: 5000, algorithmVersion: "MOCK-v1", providerCapabilities: { reusableProfiles: true, templatePortability: "SIMULATED" } },
    create: { merchantId: demoMerchant.id, venueId: venue.id, eventId: event.id, name: "SpeedFace simulado", vendor: "Mock", model: "Simulator", serialNumber: "MOCK-NOCHE-DEMO-01", status: "ONLINE", role: "BIDIRECTIONAL", faceCapacity: 5000, algorithmVersion: "MOCK-v1", providerCapabilities: { reusableProfiles: true, templatePortability: "SIMULATED" } },
  });
  const siteDocument = {
    version: 1, direction: "Noche Demo", theme: { pageBackground: "#0b0b0f", textColor: "#f8fafc", accentColor: "#b6ff5c", secondaryColor: "#8b5cf6", surfaceColor: "#17171d", mutedColor: "#a1a1aa", borderColor: "#f8fafc", headingFont: "grotesk", bodyFont: "mono", radius: 10, shadow: "none", productLayout: "gallery", displayScale: "dramatic", density: "airy", imageTreatment: "cinematic" },
    navigation: { layout: "brand-left", sticky: true, transparent: false, logoTreatment: "wordmark" }, motion: { intensity: "restrained" }, merchandising: { featuredProductIds: [], productOrderIds: [], spotlightLayout: "collection", showDescriptions: true }, experience: { type: "none", placement: "after-catalog", title: "", body: "", mediaUrls: [] },
    sections: [
      { id: "hero", kind: "hero", layout: "centered", width: "wide", align: "left", motion: "reveal", title: "Fiesta Demo", body: "Una noche en La Paz. Compra, registra tu rostro y entra.", ctaLabel: "Ver entradas", backgroundColor: "#0b0b0f", textColor: "#f8fafc", mediaUrls: [], items: [] },
      { id: "event-demo", kind: "event-tickets", eventId: event.id, layout: "stacked", width: "wide", align: "left", motion: "reveal", title: "Entradas", body: "Elige General o VIP. Tu inventario se reserva antes de abrir el pago PagosYa.", ctaLabel: "Comprar entradas", backgroundColor: "#17171d", textColor: "#f8fafc", mediaUrls: [], items: [] },
      { id: "catalog", kind: "catalog", layout: "grid", width: "wide", align: "left", motion: "none", title: "Más de Noche Demo", body: "", ctaLabel: "", backgroundColor: "#0b0b0f", textColor: "#f8fafc", mediaUrls: [], items: [] },
      { id: "contact", kind: "contact", layout: "split", width: "wide", align: "left", motion: "reveal", title: "¿Necesitas ayuda?", body: "Escríbenos antes del evento.", ctaLabel: "", backgroundColor: "#17171d", textColor: "#f8fafc", mediaUrls: [], items: [] },
    ],
  };
  await prisma.store.update({ where: { id: store.id }, data: { siteDocument } });
  const demoOrder = await prisma.admissionOrder.findFirst({ where: { eventId: event.id, source: "COMPLIMENTARY", buyerName: "Datos de demostración" } })
    ?? await prisma.admissionOrder.create({ data: { merchantId: demoMerchant.id, eventId: event.id, source: "COMPLIMENTARY", paymentMethod: "COMPLIMENTARY", paymentStatus: "PAID", totalAmount: 0, currency: "BOB", buyerName: "Datos de demostración" } });
  const demoAttendees = [
    { code: "DEMO-EXTERIOR", name: "Invitada Demo Exterior", presence: "OUTSIDE" as const },
    { code: "DEMO-INTERIOR", name: "Invitado Demo Interior", presence: "INSIDE" as const },
    { code: "DEMO-PENDIENTE", name: "Invitada Demo Pendiente", presence: "NEVER_ENTERED" as const },
  ];
  for (const row of demoAttendees) {
    const attendee = await prisma.attendee.findFirst({ where: { eventId: event.id, displayName: row.name } })
      ?? await prisma.attendee.create({ data: { merchantId: demoMerchant.id, eventId: event.id, displayName: row.name } });
    const enrolled = row.presence !== "NEVER_ENTERED";
    const admission = await prisma.admission.upsert({
      where: { code: row.code },
      update: { attendeeId: attendee.id, presenceStatus: row.presence, assignmentStatus: "CLAIMED", biometricEnrollmentStatus: enrolled ? "ENROLLED" : "PENDING" },
      create: { code: row.code, orderId: demoOrder.id, eventId: event.id, ticketTypeId: general.id, attendeeId: attendee.id, source: "COMPLIMENTARY", assignmentStatus: "CLAIMED", biometricEnrollmentStatus: enrolled ? "ENROLLED" : "PENDING", presenceStatus: row.presence },
    });
    if (enrolled) {
      let authorization = await prisma.eventBiometricAuthorization.findUnique({ where: { admissionId: admission.id }, include: { biometricIdentity: true } });
      if (!authorization) {
        const identity = await prisma.biometricIdentity.create({ data: { provider: BiometricProvider.MOCK, reusableAcrossEvents: false, providerExternalId: `mock-seed-${admission.id}`, algorithmVersion: "MOCK-v1", lastVerifiedAt: new Date(), metadata: { seeded: true } } });
        const consent = await prisma.biometricConsent.create({ data: { eventId: event.id, attendeeId: attendee.id, admissionId: admission.id, biometricIdentityId: identity.id, scope: BiometricConsentScope.EVENT_ONLY, version: "events-biometric-v2", purpose: `Acceso a ${event.name}`, consentedAt: new Date(), retentionUntil: new Date(event.endsAt!.getTime() + event.retentionHours * 60 * 60_000) } });
        await prisma.biometricIdentity.update({ where: { id: identity.id }, data: { activeConsentId: consent.id } });
        await prisma.biometricCredential.create({ data: { biometricIdentityId: identity.id, provider: BiometricProvider.MOCK, providerExternalId: `mock-seed-${admission.id}`, algorithmVersion: "MOCK-v1", enrolledAt: new Date(), lastVerifiedAt: new Date(), metadata: { seeded: true } } });
        authorization = await prisma.eventBiometricAuthorization.create({ data: { eventId: event.id, admissionId: admission.id, attendeeId: attendee.id, biometricIdentityId: identity.id, consentId: consent.id }, include: { biometricIdentity: true } });
      }
      await prisma.devicePersonMapping.upsert({
        where: { deviceId_eventId_biometricIdentityId: { deviceId: demoDevice.id, eventId: event.id, biometricIdentityId: authorization.biometricIdentityId } },
        update: { syncStatus: DevicePersonSyncStatus.SYNCED, removedAt: null, syncedAt: new Date() },
        create: { deviceId: demoDevice.id, eventId: event.id, biometricIdentityId: authorization.biometricIdentityId, externalPersonId: `seed-${admission.id}`, syncStatus: DevicePersonSyncStatus.SYNCED, syncedAt: new Date(), algorithmVersion: "MOCK-v1" },
      });
    }
  }
  const seededAdmissions = await prisma.admission.count({ where: { eventId: event.id, ticketTypeId: general.id } });
  await prisma.ticketType.update({ where: { id: general.id }, data: { soldQuantity: seededAdmissions } });
  console.log(`\nNoche Demo seeded: admin@demo.pagosya.bo / ${demoPassword}`);
  console.log(`  storefront: /s/${store.slug}`);
  console.log(`  event:      ${event.name} (${event.id}), General ${general.price / 100} BOB`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
