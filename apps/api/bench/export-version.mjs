// Pulls the newest StoreSourceVersion snapshot for a store onto disk. Used to
// salvage a run whose poller gave up before the job finished.
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
const cfg = JSON.parse(await readFile(new URL("./stores2.json", import.meta.url), "utf8"));
const entry = cfg.stores.find((s) => s.key === process.env.STORE_KEY);
const OUT = process.env.OUT_DIR || `/Users/saramia/pagosYa-sep5-output/bench2/engine/${entry.key}`;
const prisma = new PrismaClient();
const v = await prisma.storeSourceVersion.findFirst({ where: { project: { storeId: entry.storeId } }, orderBy: { revision: "desc" } });
await prisma.$disconnect();
if (!v) { console.error("no version"); process.exit(1); }
for (const f of v.snapshot?.files || []) {
  const dest = join(OUT, f.path);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, f.encoding === "base64" ? Buffer.from(f.content, "base64") : f.content);
}
console.log(`[${entry.key}] exported revision ${v.revision}, ${(v.snapshot?.files || []).length} files -> ${OUT}`);
