import { NotFoundException } from "@nestjs/common";
import { StoreAgentService } from "./store-agent.service";

describe("StoreAgentService", () => {
  function setup() {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
      storeVisualProposal: { findFirst: jest.fn().mockResolvedValue({ id: "proposal_1" }) },
      storeAgentThread: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "thread_1", storeId: "store_1" }),
        update: jest.fn().mockResolvedValue({ id: "thread_1" }),
      },
      storeAgentMessage: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `message_${data.role}`, ...data })),
      },
    };
    const visualStudio = {
      revise: jest.fn().mockResolvedValue({
        proposal: { id: "proposal_2", title: "Ajuste" },
        plan: { target: "opening", tone: "warmer", preserveCatalog: true, socialHandle: "", socialPlatform: "unknown", summary: "Apertura más cálida" },
        changedAreas: ["apertura"],
        preservedAreas: ["catálogo", "productos", "precios", "inventario", "checkout", "estado público"],
      }),
      generate: jest.fn(),
    };
    return { service: new StoreAgentService(prisma as never, visualStudio as never), prisma, visualStudio };
  }

  it("persists both sides of a targeted proposal revision", async () => {
    const { service, prisma, visualStudio } = setup();
    const result = await service.send("merchant_1", "store_1", {
      instruction: "Mantén el catálogo, pero haz la apertura más cálida.",
      proposalId: "proposal_1",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      "proposal_1",
      "Mantén el catálogo, pero haz la apertura más cálida.",
      [],
    );
    expect(prisma.storeAgentMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.storeAgentMessage.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({
      threadId: "thread_1",
      role: "USER",
      proposalId: "proposal_1",
    }) });
    expect(prisma.storeAgentMessage.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      role: "ASSISTANT",
      proposalId: "proposal_2",
      metadata: expect.objectContaining({ sourceProposalId: "proposal_1" }),
    }) });
    expect(result.proposals).toEqual([{ id: "proposal_2", title: "Ajuste" }]);
  });

  it("routes a footer request without a selected proposal through one scoped revision", async () => {
    const { service, prisma, visualStudio } = setup();
    visualStudio.revise.mockResolvedValueOnce({
      proposal: { id: "proposal_footer", title: "Footer ajustado" },
      plan: { target: "footer", tone: "unchanged", preserveCatalog: false, socialHandle: "@joaoreis", socialPlatform: "unknown", summary: "Agregar la red" },
      changedAreas: ["pie de página"],
      preservedAreas: ["menú", "secciones", "catálogo", "productos", "precios", "inventario", "checkout", "estado público"],
    });

    const result = await service.send("merchant_1", "store_1", {
      instruction: "incluye mis redes en el footer @joaoreis",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "incluye mis redes en el footer @joaoreis",
      [],
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toContain("Mostré @joaoreis como texto");
    expect(prisma.storeAgentMessage.create).toHaveBeenCalledTimes(2);
  });

  it("rejects a proposal from another store before creating a conversation", async () => {
    const { service, prisma, visualStudio } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue(null);

    await expect(service.send("merchant_1", "store_1", {
      instruction: "Hazlo más cálido",
      proposalId: "proposal_other_store",
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.storeAgentThread.create).not.toHaveBeenCalled();
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
    expect(visualStudio.revise).not.toHaveBeenCalled();
  });
});
