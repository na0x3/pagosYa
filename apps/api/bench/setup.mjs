// Creates ten benchmark stores (slug bench-<key>) under the merchant that already
// owns the dev stores, and mints one sk_test key so the design engine can be driven
// over HTTP. Create/upsert only: never deletes, never migrates, never resets.
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { writeFile } from "node:fs/promises";
import { BRIEFS } from "./briefs.mjs";

const prisma = new PrismaClient();
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const secretPart = () => Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

const host = await prisma.store.findUnique({ where: { slug: "r90l2ng9" }, select: { merchantId: true } });
if (!host) throw new Error("expected store r90l2ng9 to exist");
const merchantId = host.merchantId;

const existing = await prisma.apiKey.findFirst({ where: { merchantId, type: "SECRET", revokedAt: null, label: "sep5-benchmark" } });
let fullKey = process.env.REUSE_KEY || null;
if (!fullKey) {
  if (existing) await prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  fullKey = `sk_test_${secretPart()}`;
  await prisma.apiKey.create({
    data: { merchantId, mode: "TEST", type: "SECRET", keyPrefix: "sk_test", label: "sep5-benchmark",
            lastFour: fullKey.slice(-4), hashedSecret: await argon2.hash(fullKey) },
  });
}

const stores = [];
for (const b of BRIEFS) {
  const slug = `bench-${b.key}`;
  const store = await prisma.store.upsert({
    where: { slug },
    update: { name: b.name, tagline: b.tagline },
    create: { slug, name: b.name, tagline: b.tagline, merchantId, checkoutMode: "WHATSAPP" },
  });
  const catIds = {};
  for (const [order, name] of b.categories.entries()) {
    const found = await prisma.category.findFirst({ where: { storeId: store.id, name } });
    const cat = found
      ? await prisma.category.update({ where: { id: found.id }, data: { sortOrder: order } })
      : await prisma.category.create({ data: { storeId: store.id, name, sortOrder: order } });
    catIds[name] = cat.id;
  }
  for (const [name, amount, category] of b.items) {
    const found = await prisma.paymentLink.findFirst({ where: { storeId: store.id, name } });
    const data = { name, amount, currency: "BOB", categoryId: catIds[category] ?? null, status: "ACTIVE" };
    if (found) await prisma.paymentLink.update({ where: { id: found.id }, data });
    else await prisma.paymentLink.create({ data: { ...data, storeId: store.id } });
  }
  const count = await prisma.paymentLink.count({ where: { storeId: store.id, status: "ACTIVE" } });
  stores.push({ key: b.key, slug, storeId: store.id, name: b.name, items: count });
  console.log(`${slug.padEnd(20)} ${String(count).padStart(2)} items  ${store.id}`);
}

await writeFile(new URL("./stores.json", import.meta.url), JSON.stringify({ merchantId, key: fullKey, stores }, null, 2));
await prisma.$disconnect();
console.log(`\n${stores.length} stores ready; key ${existing && !process.env.REUSE_KEY ? "re-minted" : "minted"}`);
