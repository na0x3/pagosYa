import zlib from "node:zlib";

// Quick manual QA fixture: creates ONE merchant running TWO separate stores
// (different slug/branding/catalog each) via the real REST API (POST
// /v1/uploads, POST /v1/stores, POST /v1/stores/:id/payment_links, ...) —
// the same calls a real merchant integration would make — then exercises
// the multi-product cart checkout endpoint once per store so you can see a
// single PaymentIntent cover several different products in one payment,
// scoped to just that store. Prints both storefront URLs to open in
// apps/checkout (:5173) plus the merchant's sk_test_ key.
//
// Usage: node scripts/demo-store.mjs
// Requires the API running locally (pnpm --filter @pagosya/api run start:dev).

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000/v1";
const CHECKOUT_ORIGIN = process.env.CHECKOUT_ORIGIN ?? "http://localhost:5174";

async function api(path, { method = "GET", body, secretKey, isForm = false } = {}) {
  const headers = {};
  if (secretKey) headers.authorization = `Bearer ${secretKey}`;
  if (!isForm && body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// --- Minimal solid-color PNG encoder (no image deps) so product/logo photos are
// real uploaded files, not placeholder URLs the imageUrl validator would reject. ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function solidColorPng(hex, size = 240) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array(size).fill(row));
  const idat = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

async function uploadPng(hex, secretKey) {
  const png = solidColorPng(hex);
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), `${hex.slice(1)}.png`);
  const { url } = await api("/uploads", { method: "POST", body: form, secretKey, isForm: true });
  return url;
}

async function createStore(secretKey, { name, brandColor, backgroundColor, products }) {
  const store = await api("/stores", { method: "POST", secretKey, body: { name } });
  const logoUrl = await uploadPng(brandColor, secretKey);
  await api(`/stores/${store.id}`, { method: "PATCH", secretKey, body: { logoUrl, backgroundColor } });

  console.log(`\nStore: ${name} (${store.id})`);
  console.log(`  Link: ${CHECKOUT_ORIGIN}/?link=${store.slug}`);

  const links = [];
  for (const p of products) {
    const imageUrl = await uploadPng(p.color, secretKey);
    const link = await api(`/stores/${store.id}/payment_links`, {
      method: "POST",
      secretKey,
      body: { name: p.name, description: p.description, amount: p.amount, color: p.color, imageUrl },
    });
    links.push(link);
    console.log(`  - ${p.name.padEnd(28)} ${(p.amount / 100).toFixed(2)} BOB  ${p.color}`);
  }

  // Prove the point of the exercise: several DIFFERENT products from THIS store, one
  // cart, one payment — and that cart can never pull in another store's products.
  const cartItems = products.slice(0, Math.min(3, products.length)).map((_, i) => ({
    paymentLinkId: links[i].id,
    quantity: i === 0 ? 2 : 1,
  }));
  const checkout = await api(`/stores/public/${store.slug}/cart-checkout`, {
    method: "POST",
    body: { items: cartItems },
  });
  console.log(
    `  Sample cart-checkout: "${checkout.cartDescription}" -> one PaymentIntent ${checkout.id} for ${(checkout.amount / 100).toFixed(2)} ${checkout.currency}`,
  );

  return store;
}

async function main() {
  console.log(`API: ${API_BASE_URL}`);

  const email = `demo-store-${Date.now()}@pagosya.bo`;
  const { merchant, testKeys } = await api("/merchants", {
    method: "POST",
    body: { name: "pagosYa Demo Merchant", email },
  });
  console.log(`\nMerchant:    ${merchant.name} (${merchant.id})`);
  console.log(`Secret key:  ${testKeys.secretKey}`);
  console.log(`\nOne merchant, two separate stores — different slug/branding/catalog each:`);

  await createStore(testKeys.secretKey, {
    name: "Ropa Urbana",
    brandColor: "#1d4ed8",
    backgroundColor: "#f8fafc",
    products: [
      { name: "Camiseta Básica - Azul", description: "100% algodón, corte unisex", amount: 8000, color: "#1d4ed8" },
      { name: "Camiseta Básica - Rojo", description: "100% algodón, corte unisex", amount: 8000, color: "#dc2626" },
      { name: "Camiseta Básica - Negro", description: "100% algodón, corte unisex", amount: 8000, color: "#111827" },
      { name: "Gorra Bordada", description: "Ajustable, bordado pagosYa", amount: 4500, color: "#f59e0b" },
      { name: "Tote Bag", description: "Bolsa de tela resistente", amount: 3500, color: "#059669" },
    ],
  });

  await createStore(testKeys.secretKey, {
    name: "Café Aroma",
    brandColor: "#78350f",
    backgroundColor: "#fffbeb",
    products: [
      { name: "Café Americano", description: "Grano boliviano de altura", amount: 1500, color: "#78350f" },
      { name: "Café con Leche", description: "Espresso doble con leche vaporizada", amount: 1800, color: "#a16207" },
      { name: "Combo Desayuno", description: "Café + medialuna", amount: 2500, color: "#b45309" },
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
