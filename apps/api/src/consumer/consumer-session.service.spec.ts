import { ConsumerSessionService } from "./consumer-session.service";

function makeFakePrisma() {
  const prisma: any = {
    consumerUser: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    consumerSession: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    consumerVerificationToken: { deleteMany: jest.fn() },
    consumerInstitutionAffiliation: { updateMany: jest.fn() },
    paymentIntent: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    storeOrder: { updateMany: jest.fn() },
    auditLogEntry: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((work: any) => Array.isArray(work) ? Promise.all(work) : work(prisma));
  return prisma;
}

describe("ConsumerSessionService.loginWithGoogle", () => {
  it("creates a verified consumer after collecting the required carnet and issues a normal session", async () => {
    const prisma = makeFakePrisma();
    prisma.consumerUser.findUnique.mockResolvedValue(null);
    prisma.consumerUser.create.mockResolvedValue({
      id: "consumer_1",
      name: "Ana Pérez",
      email: "ana@gmail.com",
      carnet: "778899",
      googleSubject: "google_ana",
      deletedAt: null,
    });
    const google = {
      verifyCredential: jest.fn().mockResolvedValue({
        subject: "google_ana",
        email: "ana@gmail.com",
        name: "Ana Pérez",
        emailAuthoritative: true,
      }),
    };

    const result = await new ConsumerSessionService(prisma, google as any).loginWithGoogle("id-token", "77-8899");

    expect(prisma.consumerUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "ana@gmail.com",
        carnet: "778899",
        googleSubject: "google_ana",
        emailVerifiedAt: expect.any(Date),
      }),
    });
    expect(result.token).toMatch(/^consumer_/);
  });
});

describe("ConsumerSessionService.deactivateAccount", () => {
  it("anonymizes the profile and keeps payment/order evidence linked to its stable id", async () => {
    const prisma = makeFakePrisma();
    prisma.consumerUser.findUnique.mockResolvedValue({
      id: "consumer_1",
      name: "Ana Pérez",
      email: "ana@gmail.com",
      carnet: "778899",
      googleSubject: "google_ana",
      deletedAt: null,
    });

    await new ConsumerSessionService(prisma).deactivateAccount("consumer_1");

    expect(prisma.consumerUser.update).toHaveBeenCalledWith({
      where: { id: "consumer_1" },
      data: expect.objectContaining({
        name: "Cuenta eliminada",
        email: "deleted.consumer_1@privacy.invalid",
        carnet: "deleted-consumer_1",
        googleSubject: null,
        deletedAt: expect.any(Date),
      }),
    });
    expect(prisma.consumerSession.updateMany).toHaveBeenCalled();
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ACCOUNT_DEACTIVATED",
        metadata: expect.objectContaining({ retainedEvidence: expect.arrayContaining(["STORE_ORDERS", "FULFILLMENT_EVENTS"]) }),
      }),
    });
  });
});
