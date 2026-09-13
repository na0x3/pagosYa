import { MAX_SOURCE_VIDEO_BYTES, MAX_SOURCE_VIDEO_BASE64, sourceVideo } from './source-media';
import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { SaveSourceProjectDto, SourceProjectBriefDto } from "./dto/save-source-project.dto";

export interface SourceProjectSnapshot {
  schemaVersion: 1;
  brief: SourceProjectBriefDto;
  files: Array<{ path: string; content: string; encoding: "utf8" | "base64" }>;
}

const MAX_BYTES = 8 * 1024 * 1024;
const BINARY_EXTENSIONS = /\.(png|jpe?g|webp|avif|gif|mp4|ico|woff2?|ttf|otf)$/i;
const RESERVED_PATH = "pagosya-project.json";
const PRIVATE_FILE = /^(?:\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|\.netrc|id_rsa|id_ed25519|credentials(?:\.json)?|.*\.(?:pem|key|p12|pfx))$/i;
const FORBIDDEN_DIRS = new Set([".git", ".ssh", ".aws", ".vercel", ".netlify", "node_modules", "dist", ".next"]);
const SECRET = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk_live_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}/;

function reject(message: string): never {
  throw new BadRequestException(message);
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) reject(`Invalid ${name}`);
  return value.trim();
}

/** A source artifact is data here. No imports, build scripts, or HTML are run. */
export function sourceProjectSnapshot(input: SaveSourceProjectDto): SourceProjectSnapshot {
  if (!input.brief || !Array.isArray(input.files) || !input.files.length || input.files.length > 100) reject("A brief and 1–100 source files are required");
  const brief = {
    businessType: text(input.brief.businessType, "business type", 120),
    audience: text(input.brief.audience, "audience", 500),
    primaryAction: text(input.brief.primaryAction, "primary action", 500),
    visualDirection: text(input.brief.visualDirection, "visual direction", 2000),
    ...(input.brief.businessInformation ? { businessInformation: text(input.brief.businessInformation, "business information", 80000) } : {}),
  };
  const paths = new Set<string>();
  let total = 0, videoTotal = 0;
  const files = input.files.map((file) => {
    if (!file || typeof file.path !== "string" || !/^[a-zA-Z0-9_@()[\]./-]{1,200}$/.test(file.path)) reject("Invalid source file path");
    const parts = file.path.split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || part.endsWith(".") || FORBIDDEN_DIRS.has(part.toLowerCase()) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) reject("Unsafe source file path");
    const basename = parts[parts.length - 1];
    if (PRIVATE_FILE.test(basename) && basename !== ".env.example") reject("Private configuration cannot be included in source exports");
    const key = file.path.toLowerCase();
    if (key === RESERVED_PATH || paths.has(key)) reject("Duplicate or reserved source file path");
    paths.add(key);
    const encoding = file.encoding ?? "utf8";
    if (typeof file.content !== "string" || file.content.length > (encoding === "base64" ? (sourceVideo(file.path) ? MAX_SOURCE_VIDEO_BASE64 : 2_800_000) : /^_compiled\/(home|product|checkout)\.js$/.test(file.path) ? 800_000 : 180_000) || !["utf8", "base64"].includes(encoding)) reject("Invalid source file content");
    if (encoding === "base64" && (!BINARY_EXTENSIONS.test(file.path) || !file.content || Buffer.from(file.content, "base64").toString("base64") !== file.content)) reject("Only canonical base64 image, MP4 and font assets are supported");
    if (encoding === "utf8" && (file.content.includes("\0") || SECRET.test(file.content))) reject("Source files cannot contain NUL characters or recognized private credentials");
    if (sourceVideo(file.path)) {
      const bytes = Buffer.from(file.content, 'base64');
      if (encoding !== 'base64' || bytes.length < 12 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') reject('Invalid MP4 asset');
      videoTotal += bytes.length;
      if (videoTotal > MAX_SOURCE_VIDEO_BYTES) reject('Los videos del proyecto superan 20 MB en total.');
    } else total += Buffer.byteLength(file.content, encoding === "base64" ? "base64" : "utf8");
    if (total > MAX_BYTES) reject("Source project exceeds the 8 MiB limit");
    return { path: file.path, content: file.content, encoding };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const file of files) {
    const parts = file.path.toLowerCase().split("/");
    for (let index = 1; index < parts.length; index++) {
      if (paths.has(parts.slice(0, index).join("/"))) reject("Source file paths collide with a directory");
    }
  }
  const packageFile = files.find((file) => file.path === "package.json" && file.encoding === "utf8");
  const readme = files.find((file) => file.path === "README.md" && file.encoding === "utf8" && file.content.trim());
  if (!packageFile || !readme) reject("A standalone project needs package.json and README.md");
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(packageFile.content); } catch { reject("Invalid package.json"); }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg) || typeof pkg.name !== "string" || !pkg.name.trim()) reject("package.json needs a project name");
  const scripts = pkg.scripts as Record<string, unknown> | undefined;
  if (!scripts || typeof scripts.build !== "string" || !scripts.build.trim()) reject("package.json needs a build script");
  for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = pkg[group];
    if (deps !== undefined && (!deps || typeof deps !== "object" || Array.isArray(deps))) reject(`Invalid ${group}`);
    for (const value of Object.values(deps ?? {})) {
      if (typeof value !== "string" || /^(workspace:|link:|file:|\/|\.\.?\/)/.test(value)) reject("Exported projects must not depend on the PagosYa workspace or local files");
    }
  }
  return { schemaVersion: 1, brief, files };
}

export function sourceProjectDigest(snapshot: SourceProjectSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// Uncompressed ZIP32 keeps the bounded source archive portable and deterministic.
// Entries are regular files only; callers supply validated project paths.
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sourceProjectArchive(snapshot: SourceProjectSnapshot, revision: number, restoredFrom: number | null = null): Buffer {
  const manifest = {
    schemaVersion: 1, revision, restoredFrom, digest: sourceProjectDigest(snapshot), brief: snapshot.brief,
    commerce: { provider: "pagosya", portableBackend: false, note: "Source only. Configure the public PagosYa API and allowed storefront origin separately. Payments, inventory, orders, credentials and customer data are not included." },
    files: snapshot.files.map((file) => ({ path: file.path, sha256: createHash("sha256").update(Buffer.from(file.content, file.encoding)).digest("hex") })),
  };
  const files = [...snapshot.files, { path: RESERVED_PATH, content: JSON.stringify(manifest, null, 2) + "\n", encoding: "utf8" as const }];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path);
    const data = Buffer.from(file.content, file.encoding);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); // UTF-8, 1980-01-01
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, data); central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
