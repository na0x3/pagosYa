import { Prisma } from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level encryption at rest (ISO 27001 finding A-02): bank account numbers, NIT/CI and stored secrets are written
 * to the database as AES-256-GCM envelopes and read back as plain text, by a Prisma middleware on PrismaService — so no
 * service has to remember. Rows written before this (plain text) still read; scripts/encrypt-fields.ts seals them and
 * re-seals after a key rotation. None of these fields is ever used in a WHERE, ORDER BY or unique index: an envelope
 * is random per write, so it cannot be searched.
 */
export const ENCRYPTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  PayoutAccount: ["accountNumber"],
  Payout: ["bankAccount"],
  MerchantKycSubmission: ["taxId", "legalRepDocumentId", "payoutBankAccount", "payoutUsdBankAccount"],
  MerchantInvoicingProfile: ["nit"],
  WebhookEndpoint: ["secret"],
  OpsUser: ["totpSecret"],
  MerchantUser: ["totpSecret"],
};

const PREFIX = "pfe1";
const ENCRYPTED_NAMES = new Set(Object.values(ENCRYPTED_FIELDS).flat());

export class FieldEncryptionError extends Error {}

export interface FieldKeys {
  /** Seals every new write. */
  current: string;
  /** Older keys that can still open envelopes during a rotation. */
  previous?: string[];
}

const derive = (key: string) => createHash("sha256").update(key, "utf8").digest();
export const fieldKeyId = (key: string) => createHash("sha256").update(`pfe-kid:${key}`, "utf8").digest("hex").slice(0, 8);

export const isEncrypted = (value: unknown): value is string => typeof value === "string" && value.startsWith(`${PREFIX}.`);

export function encryptField(keys: FieldKeys, value: string): string {
  if (isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(keys.current), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, fieldKeyId(keys.current), ...[iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url"))].join(".");
}

export function decryptField(keys: FieldKeys, value: string): string {
  if (!isEncrypted(value)) return value;
  const [, kid, iv, tag, body] = value.split(".");
  const key = [keys.current, ...(keys.previous ?? [])].find((candidate) => fieldKeyId(candidate) === kid);
  if (!key || !iv || !tag || !body) throw new FieldEncryptionError(`No key opens this field (key id ${kid})`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive(key), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new FieldEncryptionError("An encrypted field failed its integrity check");
  }
}

/** Sealed with an older key (or not at all): what scripts/encrypt-fields.ts rewrites. */
export const needsSealing = (keys: FieldKeys, value: unknown) =>
  typeof value === "string" && (!isEncrypted(value) || value.split(".")[1] !== fieldKeyId(keys.current));

// relation field -> related model, per model, from the generated client's schema.
const relations = new Map<string, Map<string, string>>(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Map(model.fields.filter((field) => field.kind === "object").map((field) => [field.name, field.type])),
  ]),
);

// Models whose nested writes can reach an encrypted field: every other relation is skipped without walking it.
const SEALED_MODELS_REACHABLE = (() => {
  const reach = new Set(Object.keys(ENCRYPTED_FIELDS));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [model, fields] of relations) {
      if (!reach.has(model) && [...fields.values()].some((related) => reach.has(related))) { reach.add(model); grew = true; }
    }
  }
  return reach;
})();
const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Seals the encrypted fields of one model's write data, following nested relation writes into their models. Returns a
 * copy where anything changed: the caller's own object keeps its plain text.
 */
export function sealWriteData(keys: FieldKeys, model: string, data: unknown): unknown {
  if (Array.isArray(data)) return data.map((row) => sealWriteData(keys, model, row));
  if (!isPlain(data)) return data;
  let out: Record<string, unknown> | null = null;
  const put = (field: string, value: unknown) => { (out ??= { ...data })[field] = value; };
  for (const [field, value] of Object.entries(data)) {
    if (ENCRYPTED_FIELDS[model]?.includes(field)) {
      if (typeof value === "string") put(field, encryptField(keys, value));
      else if (isPlain(value) && typeof value.set === "string") put(field, { ...value, set: encryptField(keys, value.set) });
      continue;
    }
    const related = relations.get(model)?.get(field);
    if (related && isPlain(value)) {
      const sealed = sealNested(keys, related, value);
      if (sealed !== value) put(field, sealed);
    }
  }
  return out ?? data;
}

const mapOne = (value: unknown, fn: (item: unknown) => unknown) => (Array.isArray(value) ? value.map(fn) : value == null ? value : fn(value));
const withKey = (item: unknown, key: string, fn: (inner: unknown) => unknown) =>
  isPlain(item) && key in item ? { ...item, [key]: fn(item[key]) } : item;

function sealNested(keys: FieldKeys, model: string, ops: Record<string, unknown>): Record<string, unknown> {
  if (!SEALED_MODELS_REACHABLE.has(model)) return ops;
  const seal = (inner: unknown) => sealWriteData(keys, model, inner);
  const out = { ...ops };
  if ("create" in ops) out.create = mapOne(ops.create, seal);
  if ("createMany" in ops) out.createMany = withKey(ops.createMany, "data", seal);
  if ("connectOrCreate" in ops) out.connectOrCreate = mapOne(ops.connectOrCreate, (item) => withKey(item, "create", seal));
  if ("upsert" in ops) out.upsert = mapOne(ops.upsert, (item) => withKey(withKey(item, "create", seal), "update", seal));
  for (const key of ["update", "updateMany"] as const) {
    if (!(key in ops)) continue;
    // A list relation wraps its data in { where, data }; a to-one update may pass the data directly.
    out[key] = mapOne(ops[key], (item) => (isPlain(item) && "data" in item && isPlain(item.data) ? withKey(item, "data", seal) : seal(item)));
  }
  return out;
}

/** Opens every encrypted field in a result, at any depth (includes, nested selects, lists). */
export function openResult(keys: FieldKeys, value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = openResult(keys, value[i]);
    return value;
  }
  if (!isPlain(value)) return value;
  for (const [field, inner] of Object.entries(value)) {
    if (ENCRYPTED_NAMES.has(field) && isEncrypted(inner)) value[field] = decryptField(keys, inner);
    else if (inner && typeof inner === "object") openResult(keys, inner);
  }
  return value;
}

/** The PrismaService middleware: seal on the way in, open on the way out. */
export function fieldEncryptionMiddleware(keys: FieldKeys): Prisma.Middleware {
  return async (params, next) => {
    const model = params.model;
    if (model && params.args) {
      const args = params.args as Record<string, unknown>;
      switch (params.action) {
        case "create":
        case "update":
        case "updateMany":
        case "createMany":
        case "createManyAndReturn" as Prisma.PrismaAction:
          params = { ...params, args: { ...args, data: sealWriteData(keys, model, args.data) } };
          break;
        case "upsert":
          params = { ...params, args: { ...args, create: sealWriteData(keys, model, args.create), update: sealWriteData(keys, model, args.update) } };
          break;
      }
    }
    return openResult(keys, await next(params));
  };
}
