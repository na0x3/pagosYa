// Uploads each folder's photos as merchant media assets, then builds nine stores
// whose products carry those photos. Both engines then see the identical catalog
// and the identical image set. Create/upsert only; never deletes or migrates.
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { FOLDERS } from "./folders.mjs";

const prisma = new PrismaClient();
const cfg = JSON.parse(await readFile(new URL("./stores.json", import.meta.url), "utf8"));
const KEY = cfg.key, merchantId = cfg.merchantId;
const API = "http://127.0.0.1:3001";
const mime = (f) => f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";

const out = [];
for (const f of FOLDERS) {
  const names = (await readdir(f.dir))
    .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .sort()
    .slice(0, 12);
  const uploaded = [];
  for (const n of names) {
    const bytes = await readFile(join(f.dir, n));
    if (bytes.length > 2_000_000) continue;               // keep parity with the Sep-5 asset budget
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime(n.toLowerCase()) }), n);
    const res = await fetch(`${API}/v1/uploads`, { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
    if (!res.ok) { console.error(`  upload failed ${n}: ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
    const body = await res.json();
    uploaded.push({ file: join(f.dir, n), url: body.url });
  }

  const slug = `bench2-${f.key}`;
  const store = await prisma.store.upsert({
    where: { slug },
    update: { name: f.name, tagline: f.tagline },
    create: { slug, name: f.name, tagline: f.tagline, merchantId, checkoutMode: "WHATSAPP" },
  });
  const catIds = {};
  for (const [order, name] of f.categories.entries()) {
    const found = await prisma.category.findFirst({ where: { storeId: store.id, name } });
    catIds[name] = found
      ? (await prisma.category.update({ where: { id: found.id }, data: { sortOrder: order } })).id
      : (await prisma.category.create({ data: { storeId: store.id, name, sortOrder: order } })).id;
  }
  for (const [index, [name, amount, category]] of f.items.entries()) {
    const photo = uploaded[index % Math.max(uploaded.length, 1)];
    const data = { name, amount, currency: "BOB", categoryId: catIds[category] ?? null, status: "ACTIVE",
                   imageUrls: photo ? [photo.url] : [] };
    const found = await prisma.paymentLink.findFirst({ where: { storeId: store.id, name } });
    if (found) await prisma.paymentLink.update({ where: { id: found.id }, data });
    else await prisma.paymentLink.create({ data: { ...data, storeId: store.id } });
  }
  out.push({ key: f.key, slug, storeId: store.id, name: f.name, images: uploaded, items: f.items.length });
  console.log(`${slug.padEnd(20)} ${String(f.items.length).padStart(2)} items  ${String(uploaded.length).padStart(2)} photos uploaded`);
}

await writeFile(new URL("./stores2.json", import.meta.url), JSON.stringify({ merchantId, key: KEY, stores: out }, null, 2));
await prisma.$disconnect();
console.log(`\n${out.length} stores ready, ${out.reduce((n, s) => n + s.images.length, 0)} photos uploaded`);
