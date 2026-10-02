import { BadRequestException } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceProjectArchive, sourceProjectDigest, sourceProjectSnapshot } from "./source-project";
import { SaveSourceProjectDto } from "./dto/save-source-project.dto";
import { kitPath } from '@pagosya/storefront-kit';

export function sourceFixture(): SaveSourceProjectDto {
  return {
    revision: 0, label: "Café initial source",
    brief: { businessType: "Café", audience: "Local customers", primaryAction: "Order for pickup", visualDirection: "Editorial menu with large food photography" },
    files: [
      { path: "package.json", content: JSON.stringify({ name: "cafe-independent", private: true, type: "module", scripts: { build: "node build.mjs" } }) },
      { path: "README.md", content: "Run npm run build. Serve dist. Configure the public PagosYa API separately." },
      { path: "build.mjs", content: 'import { mkdir, copyFile } from "node:fs/promises"; await mkdir("dist", { recursive: true }); await copyFile("index.html", "dist/index.html");' },
      { path: "index.html", content: '<!doctype html><html lang="es"><title>Café</title><main><h1>Menú del día</h1></main></html>' },
      { path: "public/mark.png", encoding: "base64", content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" },
    ],
  };
}

describe("Independent source artifacts", () => {
  it('holds the files of a template store with its standard pages: up to 250 files, not one more', () => {
    const many = (count: number) => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, ...Array.from({ length: count - sourceFixture().files.length }, (_, i) => ({ path: `components/pages/p${i}.tsx`, content: 'x' }))] });
    expect(() => many(250)).not.toThrow();
    expect(() => many(251)).toThrow('1–250 source files');
  });
  it('gives the compiled script of a standard page folder the compiled-script budget, and no other folder', () => {
    const compiled = (path: string) => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, { path, content: 'x'.repeat(500_000) }] });
    for (const folder of ['pages', 'catalog', 'auth', 'account']) expect(() => compiled(`_compiled/${folder}/faq.js`)).not.toThrow();
    expect(() => compiled('_compiled/home.js')).not.toThrow();
    expect(() => compiled('_compiled/other/faq.js')).toThrow('Invalid source file content');
    expect(() => compiled('_compiled/pages/deep/faq.js')).toThrow('Invalid source file content');
  });
  it('gives the platform commerce runtime its own budget while authored files keep theirs', () => {
    const runtime = { path: 'commerce.js', content: '/* runtime */'.padEnd(200_000, ' ') };
    expect(sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, runtime] }).files.some(f => f.path === 'commerce.js')).toBe(true);
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, { path: 'site.js', content: runtime.content }] })).toThrow('Invalid source file content');
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, { path: 'commerce.js', content: ''.padEnd(600_001, ' ') }] })).toThrow('Invalid source file content');
  });

  it('exports MP4 bytes intact and enforces a separate video budget', () => {
    const bytes = Buffer.alloc(3_000_000); bytes.write('ftyp', 4); bytes.write('isom', 8);
    const video = { path: 'assets/clip.mp4', encoding: 'base64' as const, content: bytes.toString('base64') };
    const snapshot = sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, video] });
    expect(Buffer.from(snapshot.files.find(f => f.path === video.path)!.content, 'base64').equals(bytes)).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), 'pagosya-video-export-'));
    try {
      const archive = join(directory, 'source.zip');
      writeFileSync(archive, sourceProjectArchive(snapshot, 1));
      execFileSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', archive, directory]);
      writeFileSync(join(directory, 'build.mjs'), readFileSync(kitPath('build.mjs')));
      execFileSync(process.execPath, ['build.mjs'], { cwd: directory });
      expect(readFileSync(join(directory, 'dist/assets/clip.mp4')).equals(bytes)).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, { ...video, encoding: 'utf8', content: 'not a video' }] })).toThrow('Invalid MP4');
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, ...Array.from({ length: 7 }, (_, i) => ({ ...video, path: `assets/clip${i}.mp4` }))] })).toThrow('20 MB');
  });
  it("canonicalizes file order and excludes extra/private input fields", () => {
    const input = sourceFixture();
    const snapshot = sourceProjectSnapshot({ ...input, merchantSecret: "must not be copied" } as SaveSourceProjectDto);
    expect(sourceProjectDigest(snapshot)).toBe(sourceProjectDigest(sourceProjectSnapshot({ ...input, files: [...input.files].reverse() })));
    expect(snapshot).not.toHaveProperty("merchantSecret");
    input.files[0].content = "mutated";
    expect(snapshot.files.find((file) => file.path === "package.json")?.content).toContain("cafe-independent");
  });

  it.each(["../outside.js", "/absolute.js", "src/../outside.js", "src\\index.js", "src//x.js", ".git/config", ".env", "nested/.env.production", ".npmrc", "key.pem", "node_modules/a.js", "dist/index.html", "CON.txt", "src./a.js", "pagosya-project.json"])("rejects unsafe archive path %s", (path) => {
    const input = sourceFixture();
    input.files.push({ path, content: "unsafe" });
    expect(() => sourceProjectSnapshot(input)).toThrow(BadRequestException);
  });

  it("rejects case collisions, directory collisions, local dependencies and missing build instructions", () => {
    for (const file of [{ path: "README.MD", content: "collision" }, { path: "public", content: "collision" }]) {
      const input = sourceFixture(); input.files.push(file);
      expect(() => sourceProjectSnapshot(input)).toThrow(/collid|Duplicate/);
    }
    const input = sourceFixture();
    input.files[0].content = JSON.stringify({ name: "site", scripts: { build: "vite build" }, dependencies: { "@pagosya/shared-types": "workspace:*" } });
    expect(() => sourceProjectSnapshot(input)).toThrow(/workspace/);
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [] })).toThrow();
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: sourceFixture().files.filter((file) => file.path !== "README.md") })).toThrow(/README/);
  });

  it("bounds decoded bytes and rejects malformed assets and recognized credentials", () => {
    const input = sourceFixture();
    input.files.push({ path: "src/token.js", content: "sk_live_" + "a".repeat(30) });
    expect(() => sourceProjectSnapshot(input)).toThrow(/credentials/);
    for (const file of [{ path: "src/index.js", content: "YQ==", encoding: "base64" as const }, { path: "public/a.png", content: "!!!!", encoding: "base64" as const }]) {
      expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, file] })).toThrow(/base64/);
    }
    expect(() => sourceProjectSnapshot({ ...sourceFixture(), files: [...sourceFixture().files, ...Array.from({ length: 60 }, (_, i) => ({ path: `src/large${i}.txt`, content: "x".repeat(150_000) }))] })).toThrow(/8 MiB/);
  });

  it("exports a deterministic ZIP that an independent reader extracts and builds outside the monorepo", () => {
    const snapshot = sourceProjectSnapshot(sourceFixture());
    const zip = sourceProjectArchive(snapshot, 1);
    expect(zip.equals(sourceProjectArchive(snapshot, 1))).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), "pagosya-source-test-"));
    try {
      const archive = join(directory, "source.zip"); writeFileSync(archive, zip);
      // Python's standard ZIP reader independently verifies CRCs and central directory.
      execFileSync("python3", ["-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])", archive, directory]);
      execFileSync(process.execPath, ["build.mjs"], { cwd: directory });
      expect(readFileSync(join(directory, "dist/index.html"), "utf8")).toContain("Menú del día");
      expect(readFileSync(join(directory, "public/mark.png"))).toEqual(Buffer.from(sourceFixture().files[4].content, "base64"));
      const manifest = JSON.parse(readFileSync(join(directory, "pagosya-project.json"), "utf8"));
      expect(manifest).toMatchObject({ revision: 1, digest: sourceProjectDigest(snapshot), commerce: { portableBackend: false } });
      expect(manifest.files).toHaveLength(5);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
