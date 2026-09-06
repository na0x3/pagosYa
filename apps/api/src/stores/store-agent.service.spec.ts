import { BadRequestException, NotFoundException } from "@nestjs/common";
import { StoreAgentService, storeAgentClarificationForInstruction } from "./store-agent.service";

describe("StoreAgentService", () => {
  function setup() {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", siteDocument: { version: 1, sections: [] } }) },
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
      canPlanStorefrontOperations: jest.fn().mockReturnValue(false),
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

  it("answers an improvement question without generating or changing a design", async () => {
    const { service, visualStudio } = setup();
    const result = await service.send("merchant_1", "store_1", { revision: 0, instruction: "¿Qué mejorarías para que se entienda mejor?" });
    expect(result.assistantMessage.metadata).toMatchObject({ intent: "advice", changedAreas: [] });
    expect(visualStudio.generate).not.toHaveBeenCalled();
    expect(visualStudio.revise).not.toHaveBeenCalled();
  });

  it.each([false, true])("composes the exact redesign request even with an existing selection (%s)", async (selected) => {
    const { service, prisma, visualStudio } = setup();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", websiteRevision: 7, siteDocument: { version: 1, sections: [] }, visualSectionLocks: ["contact"] } as never);
    visualStudio.canPlanStorefrontOperations.mockReturnValue(true);
    visualStudio.generate.mockResolvedValue({ proposals: [{ id: "new_design" }], mode: "ai", engine: "test" });
    const instruction = "haz el website de nuevo, quiero un cambio profundo coloca tabs unicas con animaciones textos con sentido, fotos";
    const selection = { entity: "section-media", targetId: "", parentId: "opening", field: "imageUrl", position: 1, pageId: "" };
    const result = await service.send("merchant_1", "store_1", {
      revision: 7, instruction, assetUrls: ["/v1/uploads/reference.jpg"],
      ...(selected ? { proposalId: "proposal_1", selection } : {}),
    });
    expect(visualStudio.revise).not.toHaveBeenCalled();
    expect(visualStudio.generate).toHaveBeenCalledWith("merchant_1", "store_1", expect.objectContaining({
      revision: 7, creativeBrief: instruction, assetUrls: ["/v1/uploads/reference.jpg"], lockedSectionIds: ["contact"],
    }));
    expect(result.assistantMessage.metadata).toMatchObject({ intent: "redesign", generationMode: "ai" });
  });

  it("starts an explicit redesign without inheriting an old clarification or its attachments", async () => {
    const { service, prisma, visualStudio } = setup();
    const question = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazla más bonita", proposalId: "proposal_1", assetUrls: ["/v1/uploads/old.jpg"],
    });
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1", storeId: "store_1", messages: [question.assistantMessage, question.userMessage],
    });
    visualStudio.generate.mockResolvedValue({ proposals: [], mode: "local", engine: "test" });
    const result = await service.send("merchant_1", "store_1", { revision: 0, instruction: "Rehaz mi sitio web" });
    expect(visualStudio.revise).not.toHaveBeenCalled();
    expect(visualStudio.generate).toHaveBeenCalledWith("merchant_1", "store_1", expect.objectContaining({
      creativeBrief: "Rehaz mi sitio web", assetUrls: undefined,
    }));
    expect(result.assistantMessage.content).toContain("generación personalizada no estuvo disponible");
  });

  it("asks for an exact missing selection and forwards one once supplied", async () => {
    const { service, visualStudio } = setup();
    const first = await service.send("merchant_1", "store_1", { revision: 0, instruction: "Cambia esta foto" });
    expect(first.question?.id).toBe("select_target");
    expect(visualStudio.revise).not.toHaveBeenCalled();
    const selection = { entity: "section-media", targetId: "", parentId: "opening", field: "imageUrl", position: 1, pageId: "" };
    await service.send("merchant_1", "store_1", { revision: 0, instruction: "Cambia esta foto", selection });
    expect(visualStudio.revise.mock.calls[0][6]).toEqual({ revision: 0, selection });
  });

  it("returns the complete conversation in chronological order", async () => {
    const { service, prisma } = setup();
    prisma.storeAgentThread.findUnique.mockResolvedValueOnce({
      id: "thread_1",
      storeId: "store_1",
      messages: [
        { id: "message_old", role: "USER", content: "Pregunta anterior" },
        { id: "message_new", role: "ASSISTANT", content: "Respuesta nueva" },
      ],
    });

    const result = await service.conversation("merchant_1", "store_1");

    expect(prisma.storeAgentThread.findUnique).toHaveBeenCalledWith({
      where: { storeId: "store_1" },
      include: { messages: { where: { channel: "website" }, orderBy: { createdAt: "asc" } } },
    });
    expect(result.messages.map((message) => message.id)).toEqual(["message_old", "message_new"]);
    expect(result.thread?.messages.map((message) => message.id)).toEqual(["message_old", "message_new"]);
  });

  it("never turns a selected legacy photo edit into full-site generation", async () => {
    const { service, prisma, visualStudio } = setup();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", siteDocument: null });
    visualStudio.revise.mockRejectedValue(new BadRequestException("La tienda actual todavía no tiene un sitio estructurado."));
    await expect(service.send("merchant_1", "store_1", { revision: 0, instruction: "Cambia esta foto",
      selection: { entity: "animation-media", targetId: "1", parentId: "slider", field: "imageUrl", position: 1, pageId: "" },
    })).rejects.toThrow("sitio estructurado");
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("asks a focused follow-up before acting on a vague storefront request", async () => {
    const { service, prisma, visualStudio } = setup();

    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazla más bonita",
    });

    expect(result).toMatchObject({
      needsClarification: true,
      question: {
        id: "storefront_priority",
        options: expect.arrayContaining([
          expect.objectContaining({ id: "opening", label: "Portada y mensaje" }),
        ]),
      },
    });
    expect(prisma.storeAgentMessage.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      role: "ASSISTANT",
      content: "¿Qué debería priorizar Yapi en esta pasada?",
      metadata: expect.objectContaining({ clarification: expect.any(Object) }),
    }) });
    expect(visualStudio.revise).not.toHaveBeenCalled();
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("accepts a manually typed answer to the latest Yapi question", async () => {
    const { service, prisma, visualStudio } = setup();
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1",
      storeId: "store_1",
      messages: [{
        role: "ASSISTANT",
        content: "¿Qué debería priorizar Yapi en esta pasada?",
        metadata: { clarification: storeAgentClarificationForInstruction("Hazla más bonita") },
      }],
    });
    visualStudio.generate.mockResolvedValueOnce({ proposals: [], mode: "local", engine: "test" });

    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Más cálida, con fotos grandes del taller",
    });

    expect(result.needsClarification).toBeUndefined();
    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "Más cálida, con fotos grandes del taller",
      ["Yapi: ¿Qué debería priorizar Yapi en esta pasada?"], [], { revision: 0, selection: undefined }
    );
  });

  it.each([
    "yapi cambia las fotos del primer slider por fotos generadas por ia parecidas con el tema",
    "Cambia las imágenes del carrusel por las fotos adjuntas.",
    "Cambia los títulos de las secciones.",
    "Cambia la imagen de la portada.",
    "Cambia el color del botón.",
  ])("keeps a concrete editing request out of the broad style questionnaire: %s", (instruction) => {
    expect(storeAgentClarificationForInstruction(instruction)).toBeNull();
  });

  it("retains the original request, proposal and ordered photos when a clarification is answered after refresh", async () => {
    const { service, prisma, visualStudio } = setup();
    const photos = ["/v1/uploads/first.jpg", "/v1/uploads/second.jpg"];
    const question = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazla más bonita",
      proposalId: "proposal_1",
      assetUrls: photos,
    });
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1", storeId: "store_1",
      messages: [question.assistantMessage, question.userMessage],
    });

    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "La portada, usando la segunda foto",
      assetUrls: [photos[1], "/v1/uploads/third.jpg"],
    });

    expect(result.userMessage.content).toBe("La portada, usando la segunda foto");
    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1", "store_1", "proposal_1",
      "Hazla más bonita\n\nAclaración del comercio: La portada, usando la segunda foto",
      expect.any(Array), [...photos, "/v1/uploads/third.jpg"], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("does not carry a pending question or its photos into another selected proposal", async () => {
    const { service, prisma, visualStudio } = setup();
    const question = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazla más bonita", proposalId: "proposal_1", assetUrls: ["/v1/uploads/old.jpg"],
    });
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1", storeId: "store_1", messages: [question.assistantMessage, question.userMessage],
    });
    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Cambia el título de la portada a Nuevo", proposalId: "proposal_other",
    });
    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1", "store_1", "proposal_other", "Cambia el título de la portada a Nuevo", expect.any(Array), [], { revision: 0, selection: undefined }
    );
  });

  it("keeps clarification context available when the resolved edit fails and is retried", async () => {
    const { service, prisma, visualStudio } = setup();
    const question = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazla más bonita", assetUrls: ["/v1/uploads/reference.jpg"],
    });
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1", storeId: "store_1", messages: [question.assistantMessage, question.userMessage],
    });
    visualStudio.revise.mockRejectedValueOnce(new BadRequestException("Inténtalo otra vez"));
    await expect(service.send("merchant_1", "store_1", { revision: 0, instruction: "La portada" })).rejects.toThrow("Inténtalo otra vez");
    const failedMessage = prisma.storeAgentMessage.create.mock.calls.at(-1)![0].data;
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1", storeId: "store_1", messages: [failedMessage],
    });

    await service.send("merchant_1", "store_1", { revision: 0, instruction: "La portada" });
    expect(visualStudio.revise).toHaveBeenLastCalledWith(
      "merchant_1", "store_1", null, "Hazla más bonita\n\nAclaración del comercio: La portada",
      expect.any(Array), ["/v1/uploads/reference.jpg"], { revision: 0, selection: undefined }
    );
  });

  it("persists both sides of a targeted proposal revision", async () => {
    const { service, prisma, visualStudio } = setup();
    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Mantén el catálogo, pero haz la apertura más cálida.",
      proposalId: "proposal_1",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      "proposal_1",
      "Mantén el catálogo, pero haz la apertura más cálida.",
      [], [], { revision: 0, selection: undefined }
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

  it("replays a correction from the parent proposal instead of the already-wrong revision", async () => {
    const { service, prisma, visualStudio } = setup();
    const attachedPhoto = "/v1/uploads/11111111-1111-4111-8111-111111111199.jpg";
    prisma.storeVisualProposal.findFirst.mockResolvedValue({ id: "proposal_wrong", sourceAssetUrls: [attachedPhoto] });
    prisma.storeAgentThread.findUnique.mockResolvedValue({
      id: "thread_1",
      storeId: "store_1",
      messages: [
        { role: "ASSISTANT", content: "No pude preparar una variante segura.", proposalId: "proposal_wrong", metadata: { failed: true } },
        { role: "USER", content: "solo quería que cambies la foto y el texto", proposalId: "proposal_wrong", metadata: {} },
        {
          role: "ASSISTANT",
          content: "Preparé una variante privada.",
          proposalId: "proposal_wrong",
          metadata: { sourceProposalId: "proposal_parent" },
        },
        {
          role: "USER",
          content: "Cambia la foto de la primera sección y el texto a Helados al mejor precio",
          proposalId: "proposal_parent",
          metadata: {},
        },
      ],
    });
    visualStudio.canPlanStorefrontOperations.mockReturnValue(true);

    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Solo quería que cambies la foto y el texto; sacaste otras animaciones que nada que ver.",
      proposalId: "proposal_wrong",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      "proposal_parent",
      "Solo quería que cambies la foto y el texto; sacaste otras animaciones que nada que ver.",
      expect.arrayContaining([
        "Comercio: Cambia la foto de la primera sección y el texto a Helados al mejor precio",
        "Yapi: Preparé una variante privada.",
      ]),
      [attachedPhoto], { revision: 0, selection: undefined }
    );
    expect(prisma.storeAgentMessage.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      role: "ASSISTANT",
      metadata: expect.objectContaining({ sourceProposalId: "proposal_parent" }),
    }) });
  });

  it("routes a footer request without a selected proposal through one scoped revision", async () => {
    const { service, prisma, visualStudio } = setup();
    visualStudio.revise.mockResolvedValueOnce({
      proposal: { id: "proposal_footer", title: "Footer ajustado" },
      plan: { target: "footer", tone: "unchanged", preserveCatalog: false, socialHandle: "@joaoreis", socialPlatform: "unknown", summary: "Agregar la red" },
      changedAreas: ["pie de página"],
      preservedAreas: ["menú", "secciones", "catálogo", "productos", "precios", "inventario", "checkout", "estado público"],
    });

    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "incluye mis redes en el footer @joaoreis",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "incluye mis redes en el footer @joaoreis",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toContain("Mostré @joaoreis como texto");
    expect(prisma.storeAgentMessage.create).toHaveBeenCalledTimes(2);
  });

  it("routes an explicit title edit through the bounded revision path", async () => {
    const { service, visualStudio } = setup();

    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Cambia el título de la portada a “Hecho para durar”.",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "Cambia el título de la portada a “Hecho para durar”.",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("persists a precise safety explanation when a scoped AI plan is rejected", async () => {
    const { service, prisma, visualStudio } = setup();
    visualStudio.canPlanStorefrontOperations.mockReturnValue(true);
    visualStudio.revise.mockRejectedValueOnce(new BadRequestException(
      "Yapi intentó cambiar animaciones que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.",
    ));

    await expect(service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Cambia la foto de la primera sección y el texto.",
    })).rejects.toThrow("Yapi intentó cambiar animaciones que no pediste");

    expect(prisma.storeAgentMessage.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({
      role: "ASSISTANT",
      content: "Yapi intentó cambiar animaciones que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.",
      metadata: { failed: true, statusCode: 400 },
    }) });
  });

  it("routes a named footer link URL edit through the bounded revision path", async () => {
    const { service, visualStudio } = setup();

    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "en el que dice nuevo enlace ponle un enlace a https://pagosya.bo",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "en el que dice nuevo enlace ponle un enlace a https://pagosya.bo",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("routes any recognized editor operation through the rich planner when configured", async () => {
    const { service, visualStudio } = setup();
    visualStudio.canPlanStorefrontOperations.mockReturnValue(true);

    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Fija el encabezado y mueve la galería debajo de la historia.",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "Fija el encabezado y mueve la galería debajo de la historia.",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("routes an explicit image-generation request through one private revision", async () => {
    const { service, visualStudio } = setup();
    visualStudio.canPlanStorefrontOperations.mockReturnValue(true);

    await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Genera una imagen editorial para la portada.",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "Genera una imagen editorial para la portada.",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
  });

  it("routes explicit product creation through Yapi even without the rich editor planner flag", async () => {
    const { service, visualStudio } = setup();
    visualStudio.revise.mockResolvedValueOnce({
      proposal: { id: "proposal_product", title: "Producto agregado" },
      plan: { target: "catalog", tone: "unchanged", preserveCatalog: true, socialHandle: "", socialPlatform: "unknown", summary: "Crear el producto" },
      changedAreas: ["productos", "sección catalog"],
      preservedAreas: ["productos, precios e inventario existentes", "checkout", "estado público"],
      createdProducts: [{ id: "product_new", status: "ACTIVE" }],
    });

    const result = await service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Crea el producto Matcha frio por Bs. 35 y agrégalo a Inicio.",
    });

    expect(visualStudio.revise).toHaveBeenCalledWith(
      "merchant_1",
      "store_1",
      null,
      "Crea el producto Matcha frio por Bs. 35 y agrégalo a Inicio.",
      [], [], { revision: 0, selection: undefined }
    );
    expect(visualStudio.generate).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toContain("Creé 1 producto activo");
    expect(result.assistantMessage.content).toContain("ubicación en las páginas queda en esta variante");
  });

  it("rejects a proposal from another store before creating a conversation", async () => {
    const { service, prisma, visualStudio } = setup();
    prisma.storeVisualProposal.findFirst.mockResolvedValue(null);

    await expect(service.send("merchant_1", "store_1", { revision: 0,
      instruction: "Hazlo más cálido",
      proposalId: "proposal_other_store",
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.storeAgentThread.create).not.toHaveBeenCalled();
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
    expect(visualStudio.revise).not.toHaveBeenCalled();
  });
});
