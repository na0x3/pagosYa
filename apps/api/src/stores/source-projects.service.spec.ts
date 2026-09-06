import { ConflictException, NotFoundException } from "@nestjs/common";
import { SourceProjectsService } from "./source-projects.service";

const input = () => ({ revision: 0, label: "First", brief: { businessType: "Café", audience: "Neighbors", primaryAction: "Pickup", visualDirection: "Menu" }, files: [
  { path: "package.json", content: '{"name":"cafe","scripts":{"build":"node build.mjs"}}' },
  { path: "README.md", content: "Build with npm run build. Commerce uses PagosYa." },
  { path: "build.mjs", content: 'console.log("build")' },
] });

function setup() {
  let project: any = null;
  let versions: any[] = [];
  const prisma: any = {
    store: { findFirst: jest.fn(async ({ where }) => where.id === "s1" && where.merchantId === "m1" ? { id: "s1", slug: "cafe" } : null) },
    storeSourceProject: {
      upsert: jest.fn(async () => { project ??= { storeId: "s1", revision: 0 }; return project; }),
      updateMany: jest.fn(async ({ where }) => {
        if (project.revision !== where.revision) return { count: 0 };
        project.revision++; return { count: 1 };
      }),
      findUnique: jest.fn(async () => project),
    },
    storeSourceVersion: {
      create: jest.fn(async ({ data }) => { const result = { ...structuredClone(data), createdAt: new Date() }; versions.push(result); return result; }),
      findUnique: jest.fn(async ({ where }) => versions.find((v) => v.storeId === where.storeId_revision.storeId && v.revision === where.storeId_revision.revision) ?? null),
      findMany: jest.fn(async ({ where, take }) => versions.filter((v) => !where.revision || v.revision < where.revision.lt).reverse().slice(0, take)),
    },
  };
  prisma.$transaction = async (work: any) => {
    if (Array.isArray(work)) return Promise.all(work);
    const before = structuredClone({ project, versions });
    try { return await work(prisma); } catch (error) { project = before.project; versions = before.versions; throw error; }
  };
  return { service: new SourceProjectsService(prisma), prisma, read: () => ({ project, versions }) };
}

describe("Private source project revisions", () => {
  it("saves immutable revisions, exports the requested revision and restores by appending", async () => {
    const { service, read } = setup();
    expect((await service.state("m1", "s1")).revision).toBe(0);
    const first = await service.save("m1", "s1", input());
    await service.save("m1", "s1", { ...input(), revision: 1, label: "Second", brief: { ...input().brief, visualDirection: "New direction" } });
    const originalZip = await service.archive("m1", "s1", 1);
    const restored = await service.restore("m1", "s1", 1, 2);
    expect(restored).toMatchObject({ revision: 3, restoredFrom: 1, digest: first.digest });
    expect((await service.archive("m1", "s1", 1)).buffer).toEqual(originalZip.buffer);
    expect(read().versions.map((v) => v.revision)).toEqual([1, 2, 3]);
  });

  it("denies another merchant on every source operation before reading source", async () => {
    const { service, prisma } = setup();
    for (const call of [() => service.state("other", "s1"), () => service.save("other", "s1", input()), () => service.version("other", "s1", 1), () => service.archive("other", "s1", 1), () => service.restore("other", "s1", 1, 0)]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.storeSourceVersion.findUnique).not.toHaveBeenCalled();
    expect(prisma.storeSourceProject.upsert).not.toHaveBeenCalled();
  });

  it("rejects stale writes and restores without changing accepted source", async () => {
    const { service, read } = setup();
    await service.save("m1", "s1", input());
    await expect(service.save("m1", "s1", input())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.restore("m1", "s1", 1, 0)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.restore("m1", "s1", 99, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(read().project.revision).toBe(1);
    expect(read().versions).toHaveLength(1);
  });

  it("rolls back the revision counter when persisting source fails", async () => {
    const { service, prisma, read } = setup();
    await service.save("m1", "s1", input());
    prisma.storeSourceVersion.create.mockRejectedValueOnce(new Error("storage failure"));
    await expect(service.save("m1", "s1", { ...input(), revision: 1 })).rejects.toThrow("storage failure");
    expect(read().project.revision).toBe(1);
    expect(read().versions).toHaveLength(1);
  });

  it("refuses an export when stored source no longer matches its digest", async () => {
    const { service, read } = setup();
    await service.save("m1", "s1", input());
    read().versions[0].digest = "corrupt";
    await expect(service.archive("m1", "s1", 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it("edits one text file while preserving binary assets and rejecting a stale revision", async () => {
    const { service } = setup();
    const binary = { path: "assets/photo.png", content: Buffer.from("asset bytes").toString("base64"), encoding: "base64" as const };
    await service.save("m1", "s1", { ...input(), files: [...input().files, binary] });
    await service.editFile("m1", "s1", { revision: 1, path: "README.md", content: "Updated documentation" });
    const saved = await service.version("m1", "s1", 2);
    expect((saved.snapshot as any).files).toEqual(expect.arrayContaining([binary]));
    await expect(service.editFile("m1", "s1", { revision: 1, path: "README.md", content: "stale" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.editFile("m1", "s1", { revision: 2, path: binary.path, content: "bad" })).rejects.toThrow("texto");
  });

  it("paginates history without dropping or repeating the boundary revision", async () => {
    const { service } = setup();
    for (let revision = 0; revision < 32; revision++) await service.save("m1", "s1", { ...input(), revision });
    const page = await service.state("m1", "s1");
    expect(page.versions.map((v) => v.revision)).toEqual(Array.from({ length: 30 }, (_, i) => 32 - i));
    const next = await service.state("m1", "s1", page.nextBefore!);
    expect(next.versions.map((v) => v.revision)).toEqual([2, 1]);
    expect(next.nextBefore).toBeNull();
  });
});
