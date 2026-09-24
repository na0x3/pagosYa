import { BadRequestException } from "@nestjs/common";
import { IdentityDocumentsService } from "./identity-documents.service";

// 1x1 transparent PNG
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a1f60000000049454e44ae426082", "hex");
const key = "0f8fad5b-d9cb-469f-a165-70867728950e";

function setup() {
  const prisma: any = {
    merchantKycDocument: { create: jest.fn().mockResolvedValue({ id: "doc_1", slot: "CI_FRONT" }), findMany: jest.fn(), findUnique: jest.fn() },
    merchantKycSubmission: { findUnique: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn) => fn(prisma));
  const files = { put: jest.fn().mockResolvedValue(key), get: jest.fn().mockResolvedValue(png) };
  const audit = { record: jest.fn() };
  return { prisma, files, audit, service: new IdentityDocumentsService(prisma, files as any, audit as any) };
}

it("stores an image privately and binds it to the merchant", async () => {
  const { service, files, prisma } = setup();
  await expect(service.upload("m_1", "CI_FRONT", { buffer: png, mimetype: "image/png" })).resolves.toEqual({ id: "doc_1", slot: "CI_FRONT" });
  expect(files.put).toHaveBeenCalledWith(png, "image/png");
  expect(prisma.merchantKycDocument.create).toHaveBeenCalledWith({
    data: { merchantId: "m_1", slot: "CI_FRONT", storageKey: key, mimeType: "image/png", byteSize: png.length },
    select: { id: true, slot: true },
  });
});

it("rejects non-images and mislabeled files", async () => {
  const { service } = setup();
  await expect(service.upload("m_1", "SELFIE", { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.upload("m_1", "SELFIE", { buffer: Buffer.from("not a png"), mimetype: "image/png" })).rejects.toBeInstanceOf(BadRequestException);
});

it("rejects another merchant's document or a wrong slot", async () => {
  const { service, prisma } = setup();
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_2", slot: "CI_FRONT" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).rejects.toBeInstanceOf(BadRequestException);
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_1", slot: "SELFIE" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).rejects.toBeInstanceOf(BadRequestException);
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_1", slot: "CI_FRONT" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).resolves.toBeUndefined();
});

it("audits every ops view", async () => {
  const { service, prisma, audit } = setup();
  prisma.merchantKycSubmission.findUnique.mockResolvedValue({ id: "kyc_1", merchantId: "m_1", selfieDocId: "doc_9" });
  prisma.merchantKycDocument.findUnique.mockResolvedValue({ id: "doc_9", merchantId: "m_1", storageKey: key, mimeType: "image/png" });
  await expect(service.readForOps("kyc_1", "SELFIE", { id: "ops_1", name: "Ana", email: "ana@pagosya.bo" })).resolves.toEqual({ bytes: png, mimeType: "image/png" });
  expect(audit.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: "kyc.document_viewed", targetId: "kyc_1", metadata: { slot: "SELFIE", documentId: "doc_9" } }));
});
