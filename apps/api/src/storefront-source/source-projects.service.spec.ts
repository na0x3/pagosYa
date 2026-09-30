// Compiles real Next.js projects; under a full parallel run this takes well past the 5s default.
jest.setTimeout(60_000);

import { nextStoreFiles, nextBrief, nextStoreConfig } from './fixtures/next-store';
import { nextProjectScaffold } from './source-next';
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { SourceProjectsService } from "./source-projects.service";
import { SourceProjectsController } from "./source-projects.controller";
import { sourceProjectDigest, sourceProjectSnapshot } from "./source-project";
import { validateLegacySources } from "./source-legacy";
import { dnaFingerprint } from "./source-dna";
import { validDna } from "./fixtures/dna";

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
  prisma.store.findUniqueOrThrow = jest.fn().mockResolvedValue({ publishedSourceRevision: null, sourcePublicationVersion: 0, status: 'ACTIVE', slug: 'cafe', checkoutMode: 'payment', merchant: { status: 'ACTIVE' } });
  prisma.storeSourceExperiment = { findFirst: jest.fn().mockResolvedValue(null) };
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

  it("saves several text files as one revision with editFiles, and refuses unknown, binary, empty or oversized batches", async () => {
    const { service } = setup();
    const binary = { path: "assets/photo.png", content: Buffer.from("asset bytes").toString("base64"), encoding: "base64" as const };
    const site = { path: "site.js", content: 'document.title = "Café";' };
    await service.save("m1", "s1", { ...input(), files: [...input().files, site, binary] });
    const saved = await service.editFiles("m1", "s1", { revision: 1, files: [{ path: "README.md", content: "Docs" }, { path: "site.js", content: 'document.title = "Pan";' }] });
    expect(saved.revision).toBe(2);
    expect(saved.label).toBe("Edición de 2 archivos");
    const files = ((await service.version("m1", "s1", 2)).snapshot as any).files;
    expect(files.find((f: any) => f.path === "README.md").content).toBe("Docs");
    expect(files.find((f: any) => f.path === "site.js").content).toBe('document.title = "Pan";');
    expect(files).toEqual(expect.arrayContaining([binary]));
    await expect(service.editFiles("m1", "s1", { revision: 2, files: [{ path: "nope.js", content: "x" }] })).rejects.toThrow("Selecciona un archivo de texto existente.");
    await expect(service.editFiles("m1", "s1", { revision: 2, files: [{ path: binary.path, content: "x" }] })).rejects.toThrow("texto");
    await expect(service.editFiles("m1", "s1", { revision: 2, files: [] })).rejects.toThrow("1 y 20");
    await expect(service.editFiles("m1", "s1", { revision: 2, files: Array.from({ length: 21 }, () => ({ path: "README.md", content: "x" })) })).rejects.toThrow("1 y 20");
    await expect(service.editFiles("m1", "s1", { revision: 1, files: [{ path: "README.md", content: "stale" }] })).rejects.toBeInstanceOf(ConflictException);
  });

  // The Código tab writes straight into these files, so the classic projects get the
  // same refusals the React ones already get from validateNextSources.
  it("refuses hostile classic source on save and on a hand edit, without stranding the revision", async () => {
    const { service } = setup();
    const site = { path: "site.js", content: 'document.title = "Café";' };
    const page = { path: "index.html", content: "<h1>Café</h1>" };
    await service.save("m1", "s1", { ...input(), files: [...input().files, page, site] });

    await expect(service.editFile("m1", "s1", { revision: 1, path: "site.js", content: 'eval(location.hash.slice(1))' }))
      .rejects.toThrow("site.js: no uses eval().");
    await expect(service.save("m1", "s1", { ...input(), revision: 1, files: [...input().files, { path: "index.html", content: '<h1>Café</h1><script src="https://cdn.example.com/a.js"></script>' }] }))
      .rejects.toThrow("cdn.example.com");

    // The refusal is not a dead end: the revision is untouched and the next honest edit lands.
    expect((await service.state("m1", "s1")).revision).toBe(1);
    await service.editFile("m1", "s1", { revision: 1, path: "site.js", content: 'document.title = "Pan";' });
    expect((await service.version("m1", "s1", 2)).snapshot).toEqual(expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ path: "site.js", content: 'document.title = "Pan";' })]) }));
  });

  // Old revisions predate this contract. Restoring one appends the stored bytes
  // unchanged, so a merchant is never locked out of their own history by a rule
  // written after it was saved.
  it("restores a revision that today's validator would refuse", async () => {
    const { service, prisma } = setup();
    await service.save("m1", "s1", { ...input(), files: [...input().files, { path: "index.html", content: "<h1>Café</h1>" }] });
    // Stand the stored revision in for one saved before this rule existed.
    const legacy = sourceProjectSnapshot({ ...input(), files: [...input().files, { path: "index.html", content: '<h1>Café</h1><base href="/">' }] });
    expect(() => validateLegacySources(legacy.files)).toThrow();
    const stored: any = await prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId: "s1", revision: 1 } } });
    stored.snapshot = legacy;
    stored.digest = sourceProjectDigest(legacy);

    await service.restore("m1", "s1", 1, 1);
    expect((await service.version("m1", "s1", 2)).snapshot).toEqual(expect.objectContaining({
      files: expect.arrayContaining([expect.objectContaining({ path: "index.html", content: '<h1>Café</h1><base href="/">' })]),
    }));
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


describe('React source revisions', () => {
  it('recompiles edits, rejects broken source atomically, and exports Next tooling', async () => {
    const { service } = setup();
    await service.save('m1', 's1', { revision: 0, label: 'Next', brief: nextBrief, files: [...nextStoreFiles(), ...nextProjectScaffold('cafe'), { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` }, { path: 'commerce.js', content: '/* runtime */' }] });
    const source = nextStoreFiles().find(f => f.path === 'components/home.tsx')!.content;
    await service.editFile('m1', 's1', { revision: 1, path: 'components/home.tsx', content: source.replace('Nuestra carta', 'Menú actualizado') });
    const version: any = await service.version('m1', 's1', 2);
    expect(version.snapshot.files.find((f: any) => f.path === '_compiled/home.js').content).toContain('Menú actualizado');
    await expect(service.editFile('m1', 's1', { revision: 2, path: 'components/home.tsx', content: 'invalid source' })).rejects.toThrow();
    await expect(service.editFile('m1', 's1', { revision: 2, path: '_compiled/home.js', content: 'tampered' })).rejects.toThrow('componentes React');
    expect((await service.state('m1', 's1')).revision).toBe(2);
    const archive = await service.archive('m1', 's1', 2);
    expect(archive.buffer.toString()).toContain('pages/index.tsx');
    expect(archive.buffer.toString()).toContain('public/commerce.js');
    expect(archive.buffer.toString()).not.toContain('_compiled/home.js');
  });
});

describe('store kit CSS on save', () => {
  it('serves the component block while it exists and drops the compiled file with it', async () => {
    const { service } = setup();
    const withBlock = nextStoreFiles().map(f => f.path === 'styles/globals.css' ? { ...f, content: f.content + '\n/* pagosya-kit:start */\n.cart-drawer{background:#fff}\n/* pagosya-kit:end */\n' } : f);
    await service.save('m1', 's1', { revision: 0, label: 'Next', brief: nextBrief, files: [...withBlock, ...nextProjectScaffold('cafe'), { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` }, { path: 'commerce.js', content: '/* runtime */' }] });
    const first: any = await service.version('m1', 's1', 1);
    expect(first.snapshot.files.find((f: any) => f.path === 'styles/kit.css').content).toContain('@layer pagosya-store-kit');
    await service.editFile('m1', 's1', { revision: 1, path: 'styles/globals.css', content: nextStoreFiles().find(f => f.path === 'styles/globals.css')!.content });
    const second: any = await service.version('m1', 's1', 2);
    expect(second.snapshot.files.some((f: any) => f.path === 'styles/kit.css')).toBe(false);
    expect(second.snapshot.files.find((f: any) => f.path === 'index.html').content).not.toContain('kit.css');
  });
  it('validates a static kit file a merchant edits by hand, and leaves their other stylesheets alone', async () => {
    const { service } = setup();
    const prepared = await service.prepare({ revision: 0, label: 'Static', brief: nextBrief, files: [
      { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body></body></html>' },
      { path: 'styles.css', content: '.menu-add{display:none}' }, { path: 'styles/kit.css', content: '.cart-drawer{color:red}body{margin:0}' },
      { path: 'package.json', content: JSON.stringify({ name: 'x', private: true, type: 'module', scripts: { build: 'node build.mjs', start: 'node server.mjs' } }) }, { path: 'README.md', content: '# x' },
    ] } as any);
    const file = (path: string) => prepared.files.find((f: any) => f.path === path)!.content;
    expect(file('styles/kit.css')).toContain('@layer pagosya-store-kit');
    expect(file('styles/kit.css')).not.toContain('body');
    expect(file('styles.css')).toContain('.menu-add{display:none}');
    expect(file('index.html')).toContain('data-pagosya-kit="store"');
  });
});

describe('DNA motifs on save (sub-project 3)', () => {
  it("re-sanitises a merchant's hand-edited config.js motifs and motif files", async () => {
    const { service } = setup();
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><foreignObject><img src=x onerror="alert(1)"></foreignObject><path onclick="alert(1)" d="M1 1h20"/></svg>';
    const prepared = await service.prepare({ revision: 0, label: 'Static', brief: nextBrief, files: [
      { path: 'index.html', content: '<!doctype html><html><head></head><body></body></html>' },
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'cafe', motifs: [{ file: 'motifs/lampara.svg', for: 'product', target: 'Lámpara', behavior: 'glow', trigger: 'hover', placement: 'product', svg: hostile }] })};` },
      { path: 'motifs/lampara.svg', content: hostile },
      { path: 'package.json', content: JSON.stringify({ name: 'x', private: true, type: 'module', scripts: { build: 'node build.mjs', start: 'node server.mjs' } }) }, { path: 'README.md', content: '# x' },
    ] } as any);
    const file = (path: string) => prepared.files.find((f: any) => f.path === path)!.content;
    expect(file('motifs/lampara.svg')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h20"/></svg>');
    expect(file('config.js')).not.toMatch(/foreignObject|onerror|onclick/);
    expect(file('config.js')).toContain('<path d=\\"M1 1h20\\"/>');
  });
});

describe('design fingerprint memory', () => {
  const designFile = (dna?: unknown) => ({ path: 'design-direction.json', content: JSON.stringify({ selected: 1, concepts: ['Market', 'Workshop', 'Object'].map(name => ({
    name, premise: 'Handmade ceramics', opening: `${name} opening`, flow: `${name} flow`, typography: 'Fraunces / Instrument Sans', imagery: 'None', mobile: 'Stack',
    ...(dna ? { dna } : {}),
  })) }) });

  it("saves the chosen concept's DNA fingerprint with the revision, and null without one", async () => {
    const { service, prisma } = setup();
    const dna = { ...validDna(), buttons: { form: 'tag', hover: 'fill', press: 'sink' } };
    await service.save('m1', 's1', { ...input(), files: [...input().files, designFile(dna)] });
    expect(prisma.storeSourceVersion.create.mock.calls[0][0].data.designFingerprint).toBe(dnaFingerprint(dna as any));
    await service.save('m1', 's1', { ...input(), revision: 1, files: [...input().files, designFile()] });
    expect(prisma.storeSourceVersion.create.mock.calls[1][0].data.designFingerprint).toBeNull();
    await service.save('m1', 's1', { ...input(), revision: 2 });
    expect(prisma.storeSourceVersion.create.mock.calls[2][0].data.designFingerprint).toBeNull();
  });

  it("reads the last 40 fingerprints of other stores from the last 60 days, without loading snapshots", async () => {
    const { service, prisma } = setup();
    prisma.storeSourceVersion.findMany = jest.fn().mockResolvedValue([{ designFingerprint: 'a' }, { designFingerprint: 'b' }, { designFingerprint: 'a' }]);
    const now = new Date('2026-09-24T12:00:00Z');
    expect(await service.recentDesignFingerprints('s1', now)).toEqual(['a', 'b']);
    expect(prisma.storeSourceVersion.findMany).toHaveBeenCalledWith({
      where: { storeId: { not: 's1' }, designFingerprint: { not: null }, createdAt: { gte: new Date('2026-07-26T12:00:00Z') } },
      orderBy: { createdAt: 'desc' }, take: 40, select: { designFingerprint: true },
    });
  });
});

describe('adding the standard pages to a store that already exists', () => {
  const shell = { path: 'components/Shell.tsx', content: "import type { ReactNode } from 'react';\nexport function Footer() {\n  return <footer className=\"x\"><p>Pie</p></footer>;\n}\nexport default function Shell({ children }: { children: ReactNode }) { return <div>{children}<Footer /></div>; }\n" };
  const project = (extra: Array<{ path: string; content: string }> = []) => ({ revision: 0, label: 'Next', brief: nextBrief, files: [...nextStoreFiles(), ...extra, ...nextProjectScaffold('cafe'), { path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify(nextStoreConfig)};` }, { path: 'commerce.js', content: '/* runtime */' }] });

  it('saves a new revision with the pages, the footer slot and the pages compiled, and leaves the old revision alone', async () => {
    const { service } = setup();
    await service.save('m1', 's1', project([shell]));
    const saved: any = await service.addStandardPages('m1', 's1', 1);
    expect(saved.revision).toBe(2);
    const version: any = await service.version('m1', 's1', 2);
    const paths = version.snapshot.files.map((f: any) => f.path);
    for (const page of ['components/pages/faq.tsx', 'components/catalog/search.tsx']) expect(paths).toContain(page);
    for (const html of ['faq.html', 'buscar.html', '404.html']) expect(paths).toContain(html);
    expect(version.snapshot.files.find((f: any) => f.path === 'components/Shell.tsx').content).toContain('data-pagosya-pages');
    const old: any = await service.version('m1', 's1', 1);
    expect(old.snapshot.files.map((f: any) => f.path)).not.toContain('components/pages/faq.tsx');
  });

  it('refuses when there is nothing to add, when there is no Shell, for a missing site and for a store it does not own', async () => {
    const { service } = setup();
    await service.save('m1', 's1', project([shell]));
    await service.addStandardPages('m1', 's1', 1);
    await expect(service.addStandardPages('m1', 's1', 2)).rejects.toBeInstanceOf(ConflictException);
    const bare = setup();
    await bare.service.save('m1', 's1', project());
    await expect(bare.service.addStandardPages('m1', 's1', 1)).rejects.toBeInstanceOf(ConflictException);
    await expect(bare.service.addStandardPages('m1', 's1', 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(bare.service.addStandardPages('other', 's1', 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a compile-heavy merchant route with its own throttle', () => {
    const handler = (SourceProjectsController.prototype as any).addStandardPages;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBeGreaterThan(0);
    expect(Reflect.getMetadata('path', handler)).toBe('standard-pages');
  });
});
