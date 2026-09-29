# Extensions Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Studio "Integraciones" page into a real extensions framework (first-party modules with settings, encrypted secrets, consent-gated storefront scripts, site verification, product feeds, a shipping quote step and a store event queue), shipping 13 working extensions.

**Architecture:** Extensions are TypeScript manifests in `apps/api/src/extensions/catalog/`, listed in a static registry. Per-store state lives in `StoreExtension`; events are written to `StoreEvent` + `ExtensionDelivery` inside the transaction of the change and processed by a leased worker. The storefront head, product feeds, merchant API and Studio page are all driven by the registry, so a new extension is one manifest file.

**Tech Stack:** NestJS 10 + Prisma 5 (Postgres) in `apps/api`, Jest (unit and `jest.integration.config.js` real-Postgres suites); Vite + vanilla TS + Vitest in `apps/merchant-studio`; Vitest in `apps/checkout`.

**Spec:** `docs/superpowers/specs/2026-09-27-extensions-framework-design.md`

## Global Constraints

- Only pagosYa builds extensions; no third-party code, no OAuth app installs.
- Every manifest has `tier: 'free' | 'pro'`. Pro is never enforced in this plan; the UI shows "Pro · gratis por ahora".
- Secrets are AES-256-GCM with `EXTENSIONS_ENCRYPTION_KEY`, required in production via `requireSecret`, development default `"development-only-extensions-key"`. Secrets are never returned by any endpoint.
- Every merchant-typed value that reaches a `<script>` or `<meta>` must match its field `pattern`; a value that fails is "not configured", never escaped-and-injected.
- Storefront scripts load only after `PAGOSYA_PRIVACY.analyticsAllowed(slug)`; the fragment stays one `<script data-pagosya-analytics="gate">` so `apps/checkout/storefront-seo.mjs` can still strip it on private URLs.
- Merchant-facing copy is Spanish (Bolivia). Code, comments and commit messages are English.
- Database: schema changes are the hand-written migration `20260928120000_store_extensions` plus `npx prisma generate`. Never run `prisma migrate dev|reset|diff|push` or write to the development database. Applying the migration is the owner's call.
- Prices are integer centavos; format with integer math only.
- Match surrounding code style: dense one-line methods in services, 2-space indent in `apps/api`, 4-space in `source-business-workspace.ts`.
- Commit after every task on the current branch (`feature/blobs-and-identity`), conventional-commit subject in English.

## Review Focus

1. **A store with several script extensions and a purchase on the success page:** each installed pixel reports the purchase once, and a re-render of the same order reports nothing new. (Task 5 test.)
2. **A merchant changes one setting and leaves a secret field empty:** the stored secret survives; `secrets: { token: '' }` must not wipe it. (Task 7 test.)
3. **An extension throws on every delivery:** after the 6th attempt the delivery is `FAILED`, the card shows the Spanish error, and another extension's delivery of the same event still completes. (Task 9 test.)
4. **A product with variants (one sold out) and a product without a photo in a feed:** variants share `item_group_id`, the sold-out one is `out_of_stock`, the photo-less product is skipped and counted. (Task 10 test.)
5. **A store whose four analytics IDs were migrated:** the storefront still loads the same provider URLs with the same init calls and still sets `PAGOSYA_ANALYTICS_AVAILABLE`. (Task 5 golden test.)

---

## File Structure

**API — new (`apps/api/src/extensions/`)**
- `extension.ts`: shared types (manifest, fields, events, context) and category labels.
- `settings.ts`: reading stored settings and validating merchant input against a manifest.
- `secret-box.ts`: AES-256-GCM seal/open with a key id.
- `registry.ts`: the manifest list, `findExtension`, `assertRegistry`, `EXTENSION_REGISTRY` token.
- `catalog/*.ts`: one file per extension (13) and `catalog/guides.ts`.
- `storefront-head.ts`: consent gate + `PAGOSYA_TRACK` + verification meta tags.
- `store-events.ts`: `emitStoreEvent`, `orderEventPayload`.
- `extension-delivery.service.ts`, `extension-delivery.worker.ts`: the queue.
- `extensions.service.ts`, `extensions.controller.ts`, `extensions.module.ts`, `dto.ts`: merchant API.
- `feeds/product-feed.ts` (pure RSS builder), `feeds/store-feeds.service.ts`, `feeds/store-feeds.controller.ts`.

**API — modified**
- `prisma/schema.prisma`, `prisma/migrations/20260928120000_store_extensions/migration.sql`.
- `src/config/configuration.ts`: `extensionsEncryptionKey`.
- `src/store-seo/store-seo.service.ts`, `store-seo.module.ts`: head from extensions; feeds.
- `src/store-seo/store-analytics.ts`: keeps `ANALYTICS_ID_PATTERNS` and `normalizeAnalyticsId`; `analyticsHead` removed.
- `src/stores/store-presentation.ts`: analytics fields no longer written.
- `src/payment-intents/payment-intents.service.ts`, `src/shipping/shipments.service.ts`, `src/consumer/consumer.service.ts`, `src/refunds/refunds.service.ts`: emit events.
- `src/shipping/carriers/carrier.ts`, `carrier-registry.ts`: optional `quote`, extension carriers.
- `src/app.module.ts`: `ExtensionsModule`.
- `.env.example` (repo root): `EXTENSIONS_ENCRYPTION_KEY`.

**Checkout — modified:** `apps/checkout/src/checkout/payment-result.ts`, `apps/checkout/test/purchase-tracking.test.ts`.

**Studio:** new `apps/merchant-studio/src/extensions-panel.ts` (+ `.test.ts`); modified `src/api.ts`, `src/source-business-workspace.ts`, the stylesheet defining `.integration-card`, `public/integrations/*.svg`; deleted `src/integration-catalog.ts`; rebuilt `apps/merchant-dashboard/public/studio`.

---

### Task 1: Tables, migration and configuration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (three new models; `extensions StoreExtension[]` inside `model Store`)
- Create: `apps/api/prisma/migrations/20260928120000_store_extensions/migration.sql`
- Modify: `apps/api/src/config/configuration.ts` (type near line 99, `requireSecret` near line 218, value near line 289), `.env.example`
- Test: `apps/api/src/extensions/migration.integration.spec.ts`

**Interfaces:**
- Produces: Prisma delegates `storeExtension`, `storeEvent`, `extensionDelivery` with the fields below; config `app.extensionsEncryptionKey: string`.

- [ ] **Step 1: Add the models** after `model StoreImportLink` in `schema.prisma`, and add the line `extensions StoreExtension[]` inside `model Store { … }`.

```prisma
// Spec 2026-09-27 extensions framework: one row per store and installed extension.
model StoreExtension {
  id          String    @id @default(cuid())
  storeId     String
  store       Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  extensionId String
  enabled     Boolean   @default(true)
  settings    Json      @default("{}")
  secrets     String? // "v1.<keyId>.<iv>.<tag>.<ciphertext>" (SecretBox); never returned by the API
  lastError   String?
  lastErrorAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([storeId, extensionId])
}

// Written in the same transaction as the change it describes (outbox).
model StoreEvent {
  id         String              @id @default(cuid())
  storeId    String
  type       String // order.paid | order.status_changed | refund.succeeded
  payload    Json
  createdAt  DateTime            @default(now())
  deliveries ExtensionDelivery[]

  @@index([storeId, createdAt])
}

model ExtensionDelivery {
  id            String     @id @default(cuid())
  eventId       String
  event         StoreEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  storeId       String
  extensionId   String
  status        String     @default("PENDING") // PENDING | RUNNING | DONE | FAILED
  attempts      Int        @default(0)
  nextAttemptAt DateTime   @default(now())
  leaseToken    String?
  leaseUntil    DateTime?
  lastError     String?
  doneAt        DateTime?

  @@unique([eventId, extensionId])
  @@index([status, nextAttemptAt])
}
```

The spec's `installedById` is dropped: `CurrentMerchant` carries only the merchant id, and nothing reads it.

- [ ] **Step 2: Write the migration**

```sql
-- Extensions framework (spec 2026-09-27). Hand-written; applied by the owner.
CREATE TABLE "StoreExtension" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreExtension_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreExtension_storeId_extensionId_key" ON "StoreExtension"("storeId", "extensionId");
ALTER TABLE "StoreExtension" ADD CONSTRAINT "StoreExtension_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreEvent_storeId_createdAt_idx" ON "StoreEvent"("storeId", "createdAt");

CREATE TABLE "ExtensionDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExtensionDelivery_eventId_extensionId_key" ON "ExtensionDelivery"("eventId", "extensionId");
CREATE INDEX "ExtensionDelivery_status_nextAttemptAt_idx" ON "ExtensionDelivery"("status", "nextAttemptAt");
ALTER TABLE "ExtensionDelivery" ADD CONSTRAINT "ExtensionDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "StoreEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The four measurement IDs stores already have become installed extensions. The Store columns stay
-- (unread) and are dropped in a later migration. Idempotent: re-running changes nothing.
-- copy-analytics:begin
INSERT INTO "StoreExtension" ("id", "storeId", "extensionId", "settings", "updatedAt")
SELECT 'ext_' || md5(s."id" || ':' || x.ext), s."id", x.ext, jsonb_build_object('id', btrim(x.value)), CURRENT_TIMESTAMP
FROM "Store" s
CROSS JOIN LATERAL (VALUES
    ('google-analytics', s."analyticsGa4Id"),
    ('google-tag-manager', s."analyticsGtmId"),
    ('meta-pixel', s."analyticsMetaPixelId"),
    ('tiktok-pixel', s."analyticsTiktokPixelId")
) AS x(ext, value)
WHERE x.value IS NOT NULL AND btrim(x.value) <> ''
ON CONFLICT ("storeId", "extensionId") DO NOTHING;
-- copy-analytics:end
```

- [ ] **Step 3: Configuration.** In `configuration.ts` add `extensionsEncryptionKey: string;` beside `operationsEncryptionKey: string;`, `requireSecret("EXTENSIONS_ENCRYPTION_KEY", app.extensionsEncryptionKey);` after the `OPERATIONS_ENCRYPTION_KEY` line, and `extensionsEncryptionKey: process.env.EXTENSIONS_ENCRYPTION_KEY ?? "development-only-extensions-key",` after `operationsEncryptionKey`. In `.env.example`, under `OPERATIONS_ENCRYPTION_KEY`:

```
# Encrypts extension credentials (WhatsApp, Meta, FedEx tokens). 32+ random characters.
EXTENSIONS_ENCRYPTION_KEY="replace-with-at-least-32-random-characters"
```

- [ ] **Step 4: Generate the client** — `cd apps/api && npx prisma generate` → "Generated Prisma Client". Do NOT run any `migrate` command.

- [ ] **Step 5: Write the integration test** `apps/api/src/extensions/migration.integration.spec.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';

const sql = readFileSync(join(__dirname, '../../prisma/migrations/20260928120000_store_extensions/migration.sql'), 'utf8');
const copyAnalytics = sql.slice(sql.indexOf('-- copy-analytics:begin'), sql.indexOf('-- copy-analytics:end'));

const harness = integrationDatabase('store_extensions_migration');
harness.describeDb('store_extensions migration (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient;
  beforeAll(async () => { db = await harness.create(); });
  afterAll(async () => { await harness.drop(); });

  it('turns the stored measurement IDs into installed extensions, once', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Comercio', email: `m-${harness.databaseName}@test.test` } });
    const store = await db.store.create({ data: { merchantId: merchant.id, name: 'Tienda', slug: `t-${harness.databaseName}`, analyticsGa4Id: 'G-ABC1234567', analyticsMetaPixelId: ' 123456789012345 ', analyticsGtmId: '' } });
    await db.$executeRawUnsafe(copyAnalytics);
    await db.$executeRawUnsafe(copyAnalytics);
    const rows = await db.storeExtension.findMany({ where: { storeId: store.id }, orderBy: { extensionId: 'asc' } });
    expect(rows.map(row => [row.extensionId, row.settings])).toEqual([['google-analytics', { id: 'G-ABC1234567' }], ['meta-pixel', { id: '123456789012345' }]]);
    expect(rows.every(row => row.enabled && row.secrets === null)).toBe(true);
  });
});
```

- [ ] **Step 6: Run** — `cd apps/api && npx jest --config jest.integration.config.js src/extensions/migration` → PASS. The harness applies every migration, the new one included, to a throwaway database; a SQL error shows up here. Fix and rerun until green.

- [ ] **Step 7: Typecheck** — `npx tsc --noEmit -p tsconfig.json` → no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260928120000_store_extensions apps/api/src/config/configuration.ts .env.example apps/api/src/extensions/migration.integration.spec.ts
git commit -m "feat(extensions): store extensions, store events and extension deliveries tables; existing measurement IDs become installed extensions"
```

---

### Task 2: SecretBox

**Files:**
- Create: `apps/api/src/extensions/secret-box.ts`
- Test: `apps/api/src/extensions/secret-box.spec.ts`

**Interfaces:**
- Produces: `sealSecrets(key: string, value: Record<string, string>): string`; `openSecrets(key: string, envelope: string): Record<string, string>` (throws `SecretBoxError`); `class SecretBoxError extends Error`; `@Injectable() class SecretBox { constructor(config: ConfigService); seal(value: Record<string, string>): string; open(envelope: string): Record<string, string> }`.

- [ ] **Step 1: Write the failing test**

```ts
import { openSecrets, sealSecrets, SecretBoxError } from './secret-box';

describe('SecretBox', () => {
  it('round-trips a secrets object and never stores it in the clear', () => {
    const sealed = sealSecrets('k'.repeat(32), { token: 'EAAG-secret' });
    expect(sealed).toMatch(/^v1\.[0-9a-f]{8}\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('EAAG-secret');
    expect(openSecrets('k'.repeat(32), sealed)).toEqual({ token: 'EAAG-secret' });
  });

  it('refuses a tampered envelope, a different key and garbage', () => {
    const sealed = sealSecrets('k'.repeat(32), { token: 'x' });
    const parts = sealed.split('.');
    parts[4] = (parts[4][0] === 'A' ? 'B' : 'A') + parts[4].slice(1);
    expect(() => openSecrets('k'.repeat(32), parts.join('.'))).toThrow(SecretBoxError);
    expect(() => openSecrets('z'.repeat(32), sealed)).toThrow(SecretBoxError);
    expect(() => openSecrets('k'.repeat(32), 'garbage')).toThrow(SecretBoxError);
  });
});
```

- [ ] **Step 2: Run** — `cd apps/api && npx jest src/extensions/secret-box` → FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class SecretBoxError extends Error {}

const derive = (key: string) => createHash('sha256').update(key, 'utf8').digest();
// The key id travels in the envelope, so a rotated key reads as "unreadable", not as tampering.
const keyId = (key: string) => createHash('sha256').update(`kid:${key}`, 'utf8').digest('hex').slice(0, 8);

export function sealSecrets(key: string, value: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(key), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', keyId(key), ...[iv, cipher.getAuthTag(), body].map(part => part.toString('base64url'))].join('.');
}

export function openSecrets(key: string, envelope: string): Record<string, string> {
  const [version, kid, iv, tag, body] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !body || kid !== keyId(key)) throw new SecretBoxError('Unreadable secrets');
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(key), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'));
  } catch { throw new SecretBoxError('Unreadable secrets'); }
}

/** Extension credentials at rest (spec 2026-09-27 §5). */
@Injectable()
export class SecretBox {
  constructor(private readonly config: ConfigService) {}
  private key() { return this.config.get<string>('app.extensionsEncryptionKey') || 'development-only-extensions-key'; }
  seal(value: Record<string, string>) { return sealSecrets(this.key(), value); }
  open(envelope: string) { return openSecrets(this.key(), envelope); }
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git add apps/api/src/extensions/secret-box.ts apps/api/src/extensions/secret-box.spec.ts && git commit -m "feat(extensions): AES-256-GCM secret box with a key id"`

---

### Task 3: Extension types, settings validation and the registry

**Files:**
- Create: `apps/api/src/extensions/extension.ts`, `apps/api/src/extensions/settings.ts`, `apps/api/src/extensions/registry.ts`
- Test: `apps/api/src/extensions/settings.spec.ts`

**Interfaces:**
- Produces (exact; later tasks use these names):

```ts
// extension.ts
import type { CarrierAdapter } from '../shipping/carriers/carrier';
export type ExtensionCategory = 'analytics' | 'ads' | 'seo' | 'catalogs' | 'shipping' | 'messaging' | 'payments';
export const CATEGORY_LABELS: Record<ExtensionCategory, string>;
export type ExtensionSettings = Record<string, string | boolean>;
export type ExtensionField = { key: string; label: string; type: 'text' | 'select' | 'toggle'; help?: string; where?: string; placeholder?: string; required?: boolean; pattern?: RegExp; normalize?: (value: string) => string; options?: Array<{ value: string; label: string }> };
export type ExtensionSecret = { key: string; label: string; help?: string; pattern?: RegExp };
export type StoreEventType = 'order.paid' | 'order.status_changed' | 'refund.succeeded';
export type StoreEventRecord = { id: string; storeId: string; type: StoreEventType; payload: Record<string, unknown>; createdAt: Date };
export type ExtensionContext = { storeId: string; settings: ExtensionSettings; secrets: Record<string, string> };
export interface ExtensionManifest {
  id: string; name: string; category: ExtensionCategory; tier: 'free' | 'pro';
  logo: string | null; summary: string; description: string; docsUrl?: string;
  settings: ExtensionField[]; secrets?: ExtensionSecret[];
  storefrontLoader?: string;
  verificationMeta?: { name: string; settingKey: string };
  productFeed?: { platform: 'google' | 'meta'; steps: string[] };
  shippingCarrier?: CarrierAdapter;
  onEvent?(event: StoreEventRecord, context: ExtensionContext): Promise<void>;
}
// settings.ts
export function readSettings(manifest: ExtensionManifest, stored: unknown): ExtensionSettings;
export function isConfigured(manifest: ExtensionManifest, settings: ExtensionSettings, secrets: Record<string, string>): boolean;
export function validateInput(manifest: ExtensionManifest, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }, storedSecrets: Record<string, string>): { settings: ExtensionSettings; secrets: Record<string, string> };
// registry.ts
export const EXTENSION_REGISTRY = 'EXTENSION_REGISTRY';
export type ExtensionRegistry = readonly ExtensionManifest[];
export const EXTENSIONS: ExtensionRegistry;   // empty now, filled in Task 4
export function findExtension(id: string, registry?: ExtensionRegistry): ExtensionManifest | undefined;
export function assertRegistry(registry: ExtensionRegistry): void;
```

The spec's `storefrontScript(settings)` and `siteVerification(settings)` are expressed as static data (`storefrontLoader`, `verificationMeta`): the framework embeds validated settings itself, so extension code never touches merchant input. Loader contract: the string is the source of `function(c, tag, on){…}`; `c` is the validated settings, `tag(src)` appends an async script, `on('purchase', fn)` registers a handler receiving `{ orderId, value, currency }` (value in major units, currency upper-case); `w` and `d` are `window` and `document` in the gate's scope.

- [ ] **Step 1: Write the failing test** `settings.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import type { ExtensionManifest } from './extension';
import { assertRegistry } from './registry';
import { isConfigured, readSettings, validateInput } from './settings';

const manifest: ExtensionManifest = {
  id: 'demo', name: 'Demo', category: 'ads', tier: 'free', logo: null, summary: 's', description: 'd',
  settings: [
    { key: 'id', label: 'ID del pixel', type: 'text', required: true, pattern: /^[0-9]{8,20}$/, normalize: value => value.trim() },
    { key: 'mode', label: 'Modo', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { key: 'on', label: 'Activo', type: 'toggle' },
  ],
  secrets: [{ key: 'token', label: 'Token', pattern: /^[A-Za-z0-9-]{10,}$/ }],
};

describe('extension settings', () => {
  it('keeps only valid stored values: a value that fails its pattern is "not configured"', () => {
    expect(readSettings(manifest, { id: '123456789', mode: 'b', on: true, stray: 'x' })).toEqual({ id: '123456789', mode: 'b', on: true });
    expect(readSettings(manifest, { id: '12<script>', mode: 'z' })).toEqual({});
    expect(readSettings(manifest, null)).toEqual({});
  });

  it('validates and normalizes input, naming the field in Spanish when it is wrong', () => {
    expect(validateInput(manifest, { settings: { id: ' 123456789 ', on: false } }, {})).toEqual({ settings: { id: '123456789', on: false }, secrets: {} });
    expect(() => validateInput(manifest, { settings: { id: 'abc' } }, {})).toThrow(new BadRequestException('Revisa «ID del pixel»: no tiene el formato esperado.'));
    expect(() => validateInput(manifest, { settings: {} }, {})).toThrow('Completa «ID del pixel».');
    expect(() => validateInput(manifest, { settings: { id: '123456789', extra: 'x' } }, {})).toThrow('«extra» no es parte de esta extensión.');
    expect(() => validateInput(manifest, { settings: { id: '123456789', mode: 'z' } }, {})).toThrow('Revisa «Modo»');
  });

  it('keeps a stored secret when the field comes back empty, replaces it when a new one is typed', () => {
    const stored = { token: 'old-token-123' };
    expect(validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: '' } }, stored).secrets).toEqual(stored);
    expect(validateInput(manifest, { settings: { id: '123456789' } }, stored).secrets).toEqual(stored);
    expect(validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: 'new-token-456' } }, stored).secrets).toEqual({ token: 'new-token-456' });
    expect(() => validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: 'bad token' } }, stored)).toThrow('Revisa «Token»');
  });

  it('is configured only when every required field and every secret is present', () => {
    expect(isConfigured(manifest, { id: '123456789' }, { token: 't' })).toBe(true);
    expect(isConfigured(manifest, { id: '123456789' }, {})).toBe(false);
    expect(isConfigured(manifest, {}, { token: 't' })).toBe(false);
  });

  it('refuses two manifests with the same id', () => {
    expect(() => assertRegistry([manifest, manifest])).toThrow('Duplicate extension id: demo');
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/extensions/settings` → FAIL.

- [ ] **Step 3: Implement `extension.ts`** with exactly the Interfaces types, plus:

```ts
export const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  analytics: 'Analítica', ads: 'Publicidad', seo: 'Tráfico y SEO', catalogs: 'Catálogos', shipping: 'Envíos', messaging: 'Mensajería', payments: 'Pagos',
};
```

- [ ] **Step 4: Implement `settings.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import type { ExtensionField, ExtensionManifest, ExtensionSettings } from './extension';

function accept(field: ExtensionField, raw: unknown): string | boolean | undefined {
  if (field.type === 'toggle') return typeof raw === 'boolean' ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  const value = field.normalize ? field.normalize(raw) : raw.trim();
  if (!value) return undefined;
  if (field.type === 'select') return field.options?.some(option => option.value === value) ? value : undefined;
  return !field.pattern || field.pattern.test(value) ? value : undefined;
}

/** What a stored row means today: values that no longer pass their field are "not configured", never injected. */
export function readSettings(manifest: ExtensionManifest, stored: unknown): ExtensionSettings {
  const source = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  const settings: ExtensionSettings = {};
  for (const field of manifest.settings) { const value = accept(field, source[field.key]); if (value !== undefined) settings[field.key] = value; }
  return settings;
}

export function isConfigured(manifest: ExtensionManifest, settings: ExtensionSettings, secrets: Record<string, string>) {
  return manifest.settings.every(field => !field.required || settings[field.key] !== undefined) && (manifest.secrets ?? []).every(secret => Boolean(secrets[secret.key]));
}

export function validateInput(manifest: ExtensionManifest, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }, storedSecrets: Record<string, string>) {
  const given = input.settings ?? {};
  for (const key of Object.keys(given)) if (!manifest.settings.some(field => field.key === key)) throw new BadRequestException(`«${key}» no es parte de esta extensión.`);
  const settings: ExtensionSettings = {};
  for (const field of manifest.settings) {
    const raw = given[field.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim());
    if (empty) { if (field.required) throw new BadRequestException(`Completa «${field.label}».`); continue; }
    const value = accept(field, raw);
    if (value === undefined) throw new BadRequestException(`Revisa «${field.label}»: no tiene el formato esperado.`);
    settings[field.key] = value;
  }
  const typed = input.secrets ?? {};
  for (const key of Object.keys(typed)) if (!(manifest.secrets ?? []).some(secret => secret.key === key)) throw new BadRequestException(`«${key}» no es parte de esta extensión.`);
  const secrets: Record<string, string> = {};
  for (const secret of manifest.secrets ?? []) {
    const raw = typed[secret.key];
    // An empty secret field means "keep what is stored": the form never shows the stored value.
    if (typeof raw !== 'string' || !raw.trim()) { if (storedSecrets[secret.key]) secrets[secret.key] = storedSecrets[secret.key]; continue; }
    if (secret.pattern && !secret.pattern.test(raw.trim())) throw new BadRequestException(`Revisa «${secret.label}»: no tiene el formato esperado.`);
    secrets[secret.key] = raw.trim();
  }
  return { settings, secrets };
}
```

- [ ] **Step 5: Implement `registry.ts`**

```ts
import type { ExtensionManifest } from './extension';

export const EXTENSION_REGISTRY = 'EXTENSION_REGISTRY';
export type ExtensionRegistry = readonly ExtensionManifest[];

export function assertRegistry(registry: ExtensionRegistry) {
  const seen = new Set<string>();
  for (const manifest of registry) { if (seen.has(manifest.id)) throw new Error(`Duplicate extension id: ${manifest.id}`); seen.add(manifest.id); }
}

/** Every extension pagosYa offers (spec 2026-09-27 §4). Only pagosYa adds entries. */
export const EXTENSIONS: ExtensionRegistry = [];
assertRegistry(EXTENSIONS);

export const findExtension = (id: string, registry: ExtensionRegistry = EXTENSIONS) => registry.find(manifest => manifest.id === id);
```

- [ ] **Step 6: Run** → PASS.

- [ ] **Step 7: Commit** — `git add apps/api/src/extensions/extension.ts apps/api/src/extensions/settings.ts apps/api/src/extensions/registry.ts apps/api/src/extensions/settings.spec.ts && git commit -m "feat(extensions): manifest types, settings validation that names the field in Spanish, and the registry"`

---

### Task 4: The 13 manifests and the guides

**Files:**
- Create: `apps/api/src/extensions/catalog/{google-analytics,google-tag-manager,microsoft-clarity,hotjar,meta-pixel,tiktok-pixel,pinterest-tag,google-ads,google-search-console,bing-webmaster,pinterest-verification,google-shopping,meta-catalog,guides}.ts`
- Modify: `apps/api/src/extensions/registry.ts`; add logos to `apps/merchant-studio/public/integrations/`
- Test: `apps/api/src/extensions/catalog/catalog.spec.ts`

**Interfaces:**
- Consumes: `ExtensionManifest`, `ExtensionCategory` (Task 3); `ANALYTICS_ID_PATTERNS` from `../../store-seo/store-analytics`.
- Produces: `EXTENSIONS` (13, in spec §10 order); `GUIDES: Array<{ id: string; name: string; category: ExtensionCategory; logo: string | null; summary: string; url: string; guide: string }>`. `logo` = file name without `.svg` in `apps/merchant-studio/public/integrations/`.

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXTENSIONS } from '../registry';
import { GUIDES } from './guides';

const logos = join(__dirname, '../../../../merchant-studio/public/integrations');

describe('extension catalog', () => {
  it('ships the 13 extensions of the spec, in order, with the catalogs as Pro', () => {
    expect(EXTENSIONS.map(item => item.id)).toEqual(['google-analytics', 'google-tag-manager', 'microsoft-clarity', 'hotjar', 'meta-pixel', 'tiktok-pixel', 'pinterest-tag', 'google-ads', 'google-search-console', 'bing-webmaster', 'pinterest-verification', 'google-shopping', 'meta-catalog']);
    expect(EXTENSIONS.filter(item => item.tier === 'pro').map(item => item.id)).toEqual(['google-shopping', 'meta-catalog']);
  });

  it.each(EXTENSIONS.map(item => [item.id, item] as const))('%s is complete: Spanish copy, a logo, placeholders its patterns accept, one capability', (_id, item) => {
    expect(item.summary.length).toBeGreaterThan(10);
    expect(item.description.length).toBeGreaterThan(20);
    if (item.logo) expect(existsSync(join(logos, `${item.logo}.svg`))).toBe(true);
    for (const field of item.settings) if (field.pattern && field.placeholder) expect(field.pattern.test(field.normalize ? field.normalize(field.placeholder) : field.placeholder)).toBe(true);
    expect([item.storefrontLoader, item.verificationMeta, item.productFeed].filter(Boolean)).toHaveLength(1);
    if (item.storefrontLoader) expect(() => new Function(`return (${item.storefrontLoader})`)()).not.toThrow();
    if (item.verificationMeta) expect(item.settings.some(field => field.key === item.verificationMeta!.settingKey && field.pattern)).toBe(true);
  });

  it('keeps guides apart from extensions', () => {
    expect(GUIDES.map(item => item.id)).toEqual(['meta-business-suite', 'instagram-ads', 'whatsapp-business']);
    for (const guide of GUIDES) expect(EXTENSIONS.some(item => item.id === guide.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/extensions/catalog` → FAIL.

- [ ] **Step 3: Write the manifests.** The four migrated ones carry today's loaders from `store-seo/store-analytics.ts` verbatim, plus the purchase call `apps/checkout/src/checkout/payment-result.ts` makes today.

`catalog/google-analytics.ts`:
```ts
import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const googleAnalytics: ExtensionManifest = {
  id: 'google-analytics', name: 'Google Analytics 4', category: 'analytics', tier: 'free', logo: 'googleanalytics',
  summary: 'Mide de dónde vienen tus visitas y qué compran.', description: 'Conecta tu propiedad GA4: registramos visitas y compras en todas las páginas de tu tienda, solo si el comprador acepta las estadísticas.',
  docsUrl: 'https://support.google.com/analytics/answer/12270356?hl=es',
  settings: [{ key: 'id', label: 'ID de medición', type: 'text', required: true, placeholder: 'G-ABC1234567', pattern: ANALYTICS_ID_PATTERNS.analyticsGa4Id, normalize: value => value.trim().toUpperCase(), where: 'Administrar → Flujos de datos → tu flujo web → ID de medición.' }],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w.gtag('js',new Date());w.gtag('config',c.id);tag('https://www.googletagmanager.com/gtag/js?id='+c.id);on('purchase',function(p){w.gtag('event','purchase',{transaction_id:p.orderId,value:p.value,currency:p.currency})})}`,
};
```

`catalog/google-tag-manager.ts`:
```ts
import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const googleTagManager: ExtensionManifest = {
  id: 'google-tag-manager', name: 'Google Tag Manager', category: 'analytics', tier: 'free', logo: 'googletagmanager',
  summary: 'Administra tus etiquetas de medición desde un contenedor.', description: 'Instalamos tu contenedor web en todas las páginas de tu tienda; desde Tag Manager decides qué etiquetas corren. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://marketingplatform.google.com/about/tag-manager/',
  settings: [{ key: 'id', label: 'ID del contenedor', type: 'text', required: true, placeholder: 'GTM-ABCD123', pattern: ANALYTICS_ID_PATTERNS.analyticsGtmId, normalize: value => value.trim().toUpperCase(), where: 'Arriba del panel, junto al nombre del contenedor.' }],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});tag('https://www.googletagmanager.com/gtm.js?id='+c.id);on('purchase',function(p){w.dataLayer.push({event:'purchase',ecommerce:{transaction_id:p.orderId,value:p.value,currency:p.currency}})})}`,
};
```

`catalog/meta-pixel.ts`:
```ts
import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const metaPixel: ExtensionManifest = {
  id: 'meta-pixel', name: 'Meta Pixel', category: 'ads', tier: 'free', logo: 'meta',
  summary: 'Mide tus anuncios de Facebook e Instagram.', description: 'Tu pixel registra visitas y compras para que Meta optimice tus anuncios. Instagram usa este mismo pixel. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://www.facebook.com/business/help/952192354843755',
  settings: [{ key: 'id', label: 'ID del pixel', type: 'text', required: true, placeholder: '123456789012345', pattern: ANALYTICS_ID_PATTERNS.analyticsMetaPixelId, normalize: value => value.trim(), where: 'Events Manager → Orígenes de datos → tu pixel.' }],
  storefrontLoader: `function(c,tag,on){if(!w.fbq){var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};w._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];tag('https://connect.facebook.net/en_US/fbevents.js');}w.fbq('init',c.id);w.fbq('track','PageView');on('purchase',function(p){w.fbq('track','Purchase',{value:p.value,currency:p.currency},{eventID:p.orderId})})}`,
};
```

`catalog/tiktok-pixel.ts`:
```ts
import { ANALYTICS_ID_PATTERNS } from '../../store-seo/store-analytics';
import type { ExtensionManifest } from '../extension';

export const tiktokPixel: ExtensionManifest = {
  id: 'tiktok-pixel', name: 'TikTok Pixel', category: 'ads', tier: 'free', logo: 'tiktok',
  summary: 'Mide tus anuncios de TikTok.', description: 'Registra visitas y compras para medir y optimizar tus campañas en TikTok. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://ads.tiktok.com/help/article/get-started-pixel',
  settings: [{ key: 'id', label: 'ID del pixel', type: 'text', required: true, placeholder: 'CJKLMNOP1234', pattern: ANALYTICS_ID_PATTERNS.analyticsTiktokPixelId, normalize: value => value.trim().toUpperCase(), where: 'Administrador de anuncios → Herramientas → Eventos → Pixel de sitio web.' }],
  storefrontLoader: `function(c,tag,on){w.TiktokAnalyticsObject='ttq';var q=w.ttq=w.ttq||[];q.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];q.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var k=0;k<q.methods.length;k++)q.setAndDefer(q,q.methods[k]);q.instance=function(t){for(var e=q._i[t]||[],n=0;n<q.methods.length;n++)q.setAndDefer(e,q.methods[n]);return e};q.load=function(e){var r='https://analytics.tiktok.com/i18n/pixel/events.js';q._i=q._i||{};q._i[e]=[];q._i[e]._u=r;q._t=q._t||{};q._t[e]=+new Date;q._o=q._o||{};q._o[e]={};tag(r+'?sdkid='+e+'&lib=ttq');};q.load(c.id);q.page();on('purchase',function(p){w.ttq.track('CompletePayment',{value:p.value,currency:p.currency,event_id:p.orderId})})}`,
};
```

`catalog/microsoft-clarity.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const microsoftClarity: ExtensionManifest = {
  id: 'microsoft-clarity', name: 'Microsoft Clarity', category: 'analytics', tier: 'free', logo: 'microsoft',
  summary: 'Mapas de calor y grabaciones de sesiones, gratis.', description: 'Mira dónde tocan tus compradores y en qué parte de la tienda se van. Clarity es gratuito. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://learn.microsoft.com/es-es/clarity/setup-and-installation/clarity-setup',
  settings: [{ key: 'id', label: 'ID del proyecto', type: 'text', required: true, placeholder: 'abcd1234ef', pattern: /^[a-z0-9]{6,20}$/, normalize: value => value.trim().toLowerCase(), where: 'Clarity → tu proyecto → Configuración → Descripción general → ID del proyecto.' }],
  storefrontLoader: `function(c,tag){w.clarity=w.clarity||function(){(w.clarity.q=w.clarity.q||[]).push(arguments)};tag('https://www.clarity.ms/tag/'+c.id)}`,
};
```

`catalog/hotjar.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const hotjar: ExtensionManifest = {
  id: 'hotjar', name: 'Hotjar', category: 'analytics', tier: 'free', logo: 'hotjar',
  summary: 'Mapas de calor, grabaciones y encuestas.', description: 'Entiende cómo navegan tus compradores con mapas de calor y grabaciones. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://help.hotjar.com/hc/es/articles/115009336727',
  settings: [{ key: 'id', label: 'ID del sitio', type: 'text', required: true, placeholder: '1234567', pattern: /^[0-9]{5,12}$/, normalize: value => value.trim(), where: 'Hotjar → Sitios y organizaciones → ID del sitio.' }],
  storefrontLoader: `function(c,tag){w.hj=w.hj||function(){(w.hj.q=w.hj.q||[]).push(arguments)};w._hjSettings={hjid:Number(c.id),hjsv:6};tag('https://static.hotjar.com/c/hotjar-'+c.id+'.js?sv=6')}`,
};
```

`catalog/pinterest-tag.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const pinterestTag: ExtensionManifest = {
  id: 'pinterest-tag', name: 'Pinterest Tag', category: 'ads', tier: 'free', logo: 'pinterest',
  summary: 'Mide tus anuncios de Pinterest.', description: 'Registra visitas y compras para medir tus campañas y crear audiencias en Pinterest. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://help.pinterest.com/es/business/article/install-the-pinterest-tag',
  settings: [{ key: 'id', label: 'ID de la etiqueta', type: 'text', required: true, placeholder: '2612345678901', pattern: /^[0-9]{10,20}$/, normalize: value => value.trim(), where: 'Pinterest Ads → Conversiones → Administrador de etiquetas → ID de la etiqueta.' }],
  storefrontLoader: `function(c,tag,on){if(!w.pintrk){w.pintrk=function(){w.pintrk.queue.push(Array.prototype.slice.call(arguments))};w.pintrk.queue=[];w.pintrk.version='3.0';tag('https://s.pinimg.com/ct/core.js');}w.pintrk('load',c.id);w.pintrk('page');on('purchase',function(p){w.pintrk('track','checkout',{value:p.value,currency:p.currency,order_id:p.orderId,event_id:p.orderId})})}`,
};
```

`catalog/google-ads.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const googleAds: ExtensionManifest = {
  id: 'google-ads', name: 'Google Ads', category: 'ads', tier: 'free', logo: 'googleads',
  summary: 'Mide las ventas que traen tus anuncios de Google.', description: 'Instalamos la etiqueta de Google Ads y, si nos das la etiqueta de conversión de compra, registramos cada venta. Solo carga si el comprador acepta las estadísticas.',
  docsUrl: 'https://support.google.com/google-ads/answer/6095821?hl=es',
  settings: [
    { key: 'id', label: 'ID de conversión', type: 'text', required: true, placeholder: 'AW-123456789', pattern: /^AW-[0-9]{6,15}$/, normalize: value => value.trim().toUpperCase(), where: 'Google Ads → Objetivos → Conversiones → tu acción → Configuración de etiqueta.' },
    { key: 'purchaseLabel', label: 'Etiqueta de conversión de compra (opcional)', type: 'text', placeholder: 'AbC-D_efG-h12', pattern: /^[A-Za-z0-9_-]{6,40}$/, normalize: value => value.trim(), where: 'En el mismo fragmento, después de la barra: AW-123456789/esta-parte.' },
  ],
  storefrontLoader: `function(c,tag,on){w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w.gtag('js',new Date());w.gtag('config',c.id);tag('https://www.googletagmanager.com/gtag/js?id='+c.id);if(c.purchaseLabel)on('purchase',function(p){w.gtag('event','conversion',{send_to:c.id+'/'+c.purchaseLabel,value:p.value,currency:p.currency,transaction_id:p.orderId})})}`,
};
```

`catalog/google-search-console.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const googleSearchConsole: ExtensionManifest = {
  id: 'google-search-console', name: 'Google Search Console', category: 'seo', tier: 'free', logo: 'googlesearchconsole',
  summary: 'Verifica tu tienda en Google y mira cómo te encuentran.', description: 'Agregamos la etiqueta de verificación a tu tienda. Después, en Search Console ves tus búsquedas, clics y problemas de indexación.',
  docsUrl: 'https://support.google.com/webmasters/answer/9008080?hl=es',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc', pattern: /^[A-Za-z0-9_-]{20,100}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1'), where: 'Search Console → Añadir propiedad → Prefijo de URL → Etiqueta HTML → copia el valor de content (o pega la etiqueta completa).' }],
  verificationMeta: { name: 'google-site-verification', settingKey: 'token' },
};
```

`catalog/bing-webmaster.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const bingWebmaster: ExtensionManifest = {
  id: 'bing-webmaster', name: 'Bing Webmaster Tools', category: 'seo', tier: 'free', logo: 'microsoftbing',
  summary: 'Verifica tu tienda en Bing.', description: 'Agregamos la etiqueta de verificación de Bing para que veas cómo te encuentran en Bing y en los asistentes que usan sus resultados.',
  docsUrl: 'https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: '0123456789ABCDEF0123456789ABCDEF', pattern: /^[A-F0-9]{32}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1').toUpperCase(), where: 'Bing Webmaster Tools → Agregar sitio → Etiqueta meta HTML → valor de content.' }],
  verificationMeta: { name: 'msvalidate.01', settingKey: 'token' },
};
```

`catalog/pinterest-verification.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const pinterestVerification: ExtensionManifest = {
  id: 'pinterest-verification', name: 'Pinterest (verificación)', category: 'seo', tier: 'free', logo: 'pinterest',
  summary: 'Reclama tu dominio en Pinterest.', description: 'Agregamos la etiqueta de Pinterest para que tus Pines muestren tu marca y veas sus estadísticas.',
  docsUrl: 'https://help.pinterest.com/es/business/article/claim-your-website',
  settings: [{ key: 'token', label: 'Código de verificación', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef', pattern: /^[a-f0-9]{32}$/, normalize: value => value.trim().replace(/^.*content="([^"]+)".*$/s, '$1').toLowerCase(), where: 'Pinterest → Configuración → Cuentas reclamadas → Sitios web → Agregar etiqueta HTML.' }],
  verificationMeta: { name: 'p:domain_verify', settingKey: 'token' },
};
```

`catalog/google-shopping.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const googleShopping: ExtensionManifest = {
  id: 'google-shopping', name: 'Google Shopping', category: 'catalogs', tier: 'pro', logo: 'google',
  summary: 'Muestra tus productos en Google Shopping.', description: 'Publicamos tu catálogo en una dirección que Google Merchant Center lee cada día: precios, stock y fotos siempre al día.',
  docsUrl: 'https://support.google.com/merchants/answer/7439058?hl=es',
  settings: [],
  productFeed: { platform: 'google', steps: ['Entra a Google Merchant Center con tu cuenta de Google.', 'Productos → Añadir productos → Añadir desde un archivo → Añadir una URL.', 'Pega la dirección de tu catálogo y elige actualización diaria.'] },
};
```

`catalog/meta-catalog.ts`:
```ts
import type { ExtensionManifest } from '../extension';

export const metaCatalog: ExtensionManifest = {
  id: 'meta-catalog', name: 'Facebook e Instagram Shop', category: 'catalogs', tier: 'pro', logo: 'meta',
  summary: 'Vende con tu catálogo en Facebook e Instagram.', description: 'Publicamos tu catálogo en una dirección que Meta lee cada día, para etiquetar productos en Instagram y crear anuncios de catálogo.',
  docsUrl: 'https://www.facebook.com/business/help/125074381480892',
  settings: [],
  productFeed: { platform: 'meta', steps: ['Entra a Commerce Manager y crea un catálogo de comercio electrónico.', 'Orígenes de datos → Agregar artículos → Lista de datos → Programar actualizaciones.', 'Pega la dirección de tu catálogo y elige actualización diaria.'] },
};
```

`catalog/guides.ts`:
```ts
import type { ExtensionCategory } from '../extension';

/** External tools with nothing to install: shown under "Guías", never counted as extensions. */
export const GUIDES: Array<{ id: string; name: string; category: ExtensionCategory; logo: string | null; summary: string; url: string; guide: string }> = [
  { id: 'meta-business-suite', name: 'Meta Business Suite', category: 'ads', logo: 'meta', summary: 'Consulta estadísticas de Facebook e Instagram y administra tus publicaciones.', url: 'https://business.facebook.com/', guide: 'https://www.facebook.com/business/tools/meta-business-suite' },
  { id: 'instagram-ads', name: 'Instagram Ads', category: 'ads', logo: 'instagram', summary: 'Promociona tu tienda en el feed, Stories y Reels de Instagram.', url: 'https://adsmanager.facebook.com/', guide: 'https://www.facebook.com/business/ads/instagram-ad' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'messaging', logo: 'whatsapp', summary: 'Atiende consultas y comparte tu catálogo desde la app de WhatsApp Business.', url: 'https://business.whatsapp.com/', guide: 'https://business.whatsapp.com/' },
];
```

- [ ] **Step 4: Register them** — in `registry.ts` import the 13 constants and set `export const EXTENSIONS: ExtensionRegistry = [googleAnalytics, googleTagManager, microsoftClarity, hotjar, metaPixel, tiktokPixel, pinterestTag, googleAds, googleSearchConsole, bingWebmaster, pinterestVerification, googleShopping, metaCatalog];`.

- [ ] **Step 5: Add the logos** from Simple Icons 16.11.0, the source `public/integrations/README.md` names: `microsoft.svg`, `hotjar.svg`, `pinterest.svg`, `googlesearchconsole.svg`, `microsoftbing.svg`, `google.svg`. For each slug: `curl -fsSL https://cdn.jsdelivr.net/npm/simple-icons@16.11.0/icons/<slug>.svg -o apps/merchant-studio/public/integrations/<slug>.svg`, then add `fill="#<hex>"` to the `<svg>` root with the `hex` of the matching entry in `https://cdn.jsdelivr.net/npm/simple-icons@16.11.0/data/simple-icons.json` (open an existing file such as `meta.svg` to copy its exact format). If a slug returns 404, set that manifest's `logo: null` and say so in the commit message.

- [ ] **Step 6: Run** — `npx jest src/extensions` → PASS.

- [ ] **Step 7: Commit** — `git add apps/api/src/extensions apps/merchant-studio/public/integrations && git commit -m "feat(extensions): 13 extensions — GA4, Tag Manager, Clarity, Hotjar, Meta, TikTok, Pinterest, Google Ads, three site verifications, Google Shopping and Facebook & Instagram Shop — plus guides"`

---

### Task 5: Storefront head from extensions

**Files:**
- Create: `apps/api/src/extensions/storefront-head.ts`
- Test: `apps/api/src/extensions/storefront-head.spec.ts`
- Modify: `apps/api/src/store-seo/store-seo.service.ts` (import at line 7; `document()` return at line 72), `apps/api/src/store-seo/store-analytics.ts`, `apps/api/src/store-seo/store-analytics.spec.ts`, `apps/api/src/store-seo/store-seo.spec.ts` (Prisma fake, if any)

**Interfaces:**
- Consumes: `EXTENSIONS`, `findExtension`, `ExtensionRegistry`, `readSettings`.
- Produces: `type Installation = { extensionId: string; enabled: boolean; settings: unknown }`; `extensionsHead(slug: string, installations: Installation[], registry?: ExtensionRegistry): string`; `verificationHead(installations: Installation[], registry?: ExtensionRegistry): string`; browser globals `PAGOSYA_TRACK(name, data)`, `PAGOSYA_ANALYTICS_AVAILABLE`, `PAGOSYA_ANALYTICS = { slug, extensions: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { extensionsHead, verificationHead } from './storefront-head';

const install = (extensionId: string, settings: Record<string, unknown>, enabled = true) => ({ extensionId, enabled, settings });
const all = [install('google-analytics', { id: 'G-ABC1234567' }), install('google-tag-manager', { id: 'GTM-ABCD123' }), install('meta-pixel', { id: '123456789012345' }), install('tiktok-pixel', { id: 'CJKLMNOP1234' })];

// Runs the gate against a fake window and document: tag() calls are recorded, consent granted or not.
function run(head: string, consent: boolean) {
  const scripts: string[] = [];
  const w: any = { PAGOSYA_PRIVACY: { analyticsAllowed: () => consent }, addEventListener: () => {} };
  const d: any = { createElement: () => ({}), head: { appendChild: (element: any) => scripts.push(element.src) }, documentElement: null };
  const body = head.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  new Function('window', 'document', body)(w, d);
  return { w, scripts };
}

describe('storefront head from extensions', () => {
  it('injects nothing without an enabled, configured script extension', () => {
    expect(extensionsHead('cafe', [])).toBe('');
    expect(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' }, false)])).toBe('');
    expect(extensionsHead('cafe', [install('meta-pixel', {})])).toBe('');
    expect(extensionsHead('cafe', [install('google-search-console', { token: 'A'.repeat(30) })])).toBe('');
  });

  it('is one removable marked script that waits for consent', () => {
    const head = extensionsHead('cafe', all);
    expect(head.match(/<script\b/g)).toHaveLength(1);
    expect(head).toContain('data-pagosya-analytics="gate"');
    expect(head).toContain('PAGOSYA_ANALYTICS_AVAILABLE');
    expect(head.replace(/<script\b[^>]*\bdata-pagosya-analytics=[^>]*>[^]*?<\/script>/gi, '')).toBe('');
    expect(run(head, false).scripts).toEqual([]);
  });

  // Review focus 5: a migrated store loads the same providers it loaded before.
  it('loads the same provider scripts the four migrated IDs loaded before', () => {
    const { scripts, w } = run(extensionsHead('cafe', all), true);
    expect(scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-ABC1234567', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABCD123', 'https://connect.facebook.net/en_US/fbevents.js', 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=CJKLMNOP1234&lib=ttq']);
    expect(w.fbq.queue.slice(0, 2).map((args: IArguments) => [...args])).toEqual([['init', '123456789012345'], ['track', 'PageView']]);
    expect(w.PAGOSYA_ANALYTICS_AVAILABLE).toBe(true);
  });

  // Review focus 1: every pixel reports a sale once, however often the success screen renders.
  it('reports a purchase to every loaded pixel once per order', () => {
    const { w } = run(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' }), install('pinterest-tag', { id: '2612345678901' })]), true);
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 12.5, currency: 'BOB' });
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 12.5, currency: 'BOB' });
    expect(w.fbq.queue.filter((args: IArguments) => args[1] === 'Purchase')).toHaveLength(1);
    expect(w.pintrk.queue.filter((args: unknown[]) => args[1] === 'checkout')).toHaveLength(1);
  });

  it('reports nothing before consent', () => {
    const { w } = run(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' })]), false);
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 1, currency: 'BOB' });
    expect(w.fbq).toBeUndefined();
  });

  it('never embeds a value that fails its pattern, and embeds the slug as inert JSON', () => {
    const head = extensionsHead('</script><b>', [install('meta-pixel', { id: '1234</script>' }), install('hotjar', { id: '1234567' })]);
    expect(head).not.toContain('1234</script>');
    expect(head).not.toContain('</script><b>');
    expect(head).toContain('"1234567"');
  });

  it('renders verification tags outside the gate, escaped and pattern-checked', () => {
    expect(verificationHead([install('google-search-console', { token: 'AbCdEfGhIjKlMnOpQrSt_-123' }), install('bing-webmaster', { token: 'nope' })]))
      .toBe('<meta name="google-site-verification" content="AbCdEfGhIjKlMnOpQrSt_-123">');
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/extensions/storefront-head` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { ExtensionSettings } from './extension';
import { EXTENSIONS, findExtension, type ExtensionRegistry } from './registry';
import { readSettings } from './settings';

export type Installation = { extensionId: string; enabled: boolean; settings: unknown };

/** JSON inside a <script> only needs its terminators hidden to be inert. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/ /g, '\\u2028').replace(/ /g, '\\u2029');
const attr = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function active(installations: Installation[], registry: ExtensionRegistry) {
  return installations.flatMap(item => {
    const manifest = item.enabled ? findExtension(item.extensionId, registry) : undefined;
    if (!manifest) return [];
    const settings = readSettings(manifest, item.settings);
    return manifest.settings.every(field => !field.required || settings[field.key] !== undefined) ? [{ manifest, settings }] : [];
  });
}

/**
 * Every script extension behind the one consent gate the storefront already asks through
 * (packages/storefront-kit/kit/privacy.js). Loaders are first-party code; the only merchant data they see
 * is settings that passed their patterns, embedded as inert JSON. PAGOSYA_TRACK exists before consent,
 * but handlers register only after it, so a purchase before consent is reported to nobody.
 */
export function extensionsHead(slug: string, installations: Installation[], registry: ExtensionRegistry = EXTENSIONS): string {
  const scripts = active(installations, registry).filter(item => item.manifest.storefrontLoader);
  if (!scripts.length) return '';
  const loaders = scripts.map(item => `${embed(item.manifest.id)}:${item.manifest.storefrontLoader}`).join(',');
  const configs: Record<string, ExtensionSettings> = Object.fromEntries(scripts.map(item => [item.manifest.id, item.settings]));
  const gate = `(function(){var s=${embed(slug)},C=${embed(configs)},d=document,w=window,done=false,H={},seen={};`
    + `var L={${loaders}};`
    + `w.PAGOSYA_ANALYTICS_AVAILABLE=true;w.PAGOSYA_ANALYTICS={slug:s,extensions:Object.keys(C)};`
    + `w.PAGOSYA_TRACK=function(n,p){if(n==='purchase'){if(!p||seen[p.orderId])return;seen[p.orderId]=1;}(H[n]||[]).forEach(function(f){try{f(p)}catch(e){}})};`
    + `function on(n,f){(H[n]=H[n]||[]).push(f)}`
    + `function tag(src){var e=d.createElement('script');e.async=true;e.src=src;(d.head||d.documentElement).appendChild(e);}`
    + `function start(){if(done||!(w.PAGOSYA_PRIVACY&&w.PAGOSYA_PRIVACY.analyticsAllowed(s)))return;done=true;`
    + `for(var k in L){try{L[k](C[k],tag,on)}catch(e){}}}`
    + `start();w.addEventListener('pagosya:privacy-change',start);})();`;
  return `<script data-pagosya-analytics="gate">${gate.replace(/<\/script/gi, '<\\/script')}</script>`;
}

/** Ownership tags (Search Console, Bing, Pinterest): no tracking, so no consent needed. */
export function verificationHead(installations: Installation[], registry: ExtensionRegistry = EXTENSIONS): string {
  return active(installations, registry).flatMap(({ manifest, settings }) => {
    const meta = manifest.verificationMeta, value = meta ? settings[meta.settingKey] : undefined;
    return meta && typeof value === 'string' ? [`<meta name="${attr(meta.name)}" content="${attr(value)}">`] : [];
  }).join('');
}
```

A purchase fired before consent marks the order as seen; that matches today's behavior (a sale before consent was never reported).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Wire into `StoreSeoService.document`.** Replace `import { analyticsHead } from './store-analytics';` with `import { extensionsHead, verificationHead } from '../extensions/storefront-head';`. In `document()`, after `const c = await this.context(slug);`:

```ts
    const installations = await this.prisma.storeExtension.findMany({ where: { storeId: c.store.id, enabled: true }, select: { extensionId: true, enabled: true, settings: true } });
```

and make the returned head `seoHead({ …unchanged… }) + verificationHead(installations) + extensionsHead(slug, installations)`. In the comment above that line, change "The merchant's measurement tags ride along" to "The merchant's extensions (measurement tags and site verification) ride along".

- [ ] **Step 6: Trim `store-analytics.ts`.** Delete `analyticsHead`, `embed` and `StoreAnalyticsSettings`; keep `AnalyticsField`, `ANALYTICS_ID_PATTERNS`, `normalizeAnalyticsId`; shorten the header comment to: "Measurement ID patterns, shared by the store DTO and the extensions that replaced these columns (spec 2026-09-27)." In `store-analytics.spec.ts`, delete the `analyticsHead` cases (they now live in `storefront-head.spec.ts`) and keep the pattern/normalization cases.

- [ ] **Step 7: Run** — `npx jest src/store-seo src/extensions` → PASS. If `store-seo.spec.ts` builds a Prisma fake, add `storeExtension: { findMany: jest.fn(async () => []) }`.

- [ ] **Step 8: Storefront renderer** — `cd apps/checkout && node --test server-test/seo.test.mjs` → all PASS.

- [ ] **Step 9: Commit** — `git add apps/api/src/extensions/storefront-head.ts apps/api/src/extensions/storefront-head.spec.ts apps/api/src/store-seo && git commit -m "feat(extensions): the storefront loads every script extension behind the one consent gate, reports purchases once through PAGOSYA_TRACK, and adds verification tags"`

---

### Task 6: Checkout reports purchases through PAGOSYA_TRACK

**Files:**
- Modify: `apps/checkout/src/checkout/payment-result.ts` (`reportPurchase`, lines ~93–107)
- Test: `apps/checkout/test/purchase-tracking.test.ts`

**Interfaces:**
- Consumes: `window.PAGOSYA_TRACK('purchase', { orderId: string; value: number; currency: string })` (Task 5).

- [ ] **Step 1: Add the failing test.** In `purchase-tracking.test.ts`, extend `type Runtime` with `PAGOSYA_TRACK?: unknown;`, add `delete runtime.PAGOSYA_TRACK;` to `beforeEach`, and add:

```ts
it("hands the sale to the storefront's extensions when they are loaded, and to nothing else", () => {
  const track = vi.fn(), gtag = vi.fn();
  runtime.PAGOSYA_TRACK = track; runtime.gtag = gtag;
  renderSuccess(order("pi_ext"));
  expect(track).toHaveBeenCalledWith("purchase", { orderId: "pi_ext", value: 123.45, currency: "BOB" });
  // The gate's own handlers call gtag/fbq/ttq; calling them here too would count the sale twice.
  expect(gtag).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** — `cd apps/checkout && npx vitest run test/purchase-tracking.test.ts` → the new test FAILS.

- [ ] **Step 3: Implement.** In `reportPurchase`, right after `const value = …, currency = …;`:

```ts
  const track = (window as unknown as { PAGOSYA_TRACK?: (name: string, data: unknown) => void }).PAGOSYA_TRACK;
  // Stores on the extensions framework expose one entry point; every installed pixel listens there.
  if (typeof track === "function") { try { track("purchase", { orderId: order.id, value, currency }); } catch {} return; }
```

Keep the three direct calls below as the fallback for pages served without the gate. Update the doc comment's first sentence to: "The sale, reported through the storefront's PAGOSYA_TRACK when present (every installed extension listens there), else to whichever measurement tag is loaded."

- [ ] **Step 4: Run** → all PASS.

- [ ] **Step 5: Commit** — `git add apps/checkout/src/checkout/payment-result.ts apps/checkout/test/purchase-tracking.test.ts && git commit -m "feat(checkout): the success page reports the sale through PAGOSYA_TRACK, so every installed pixel counts it once"`

---

### Task 7: Merchant API for extensions

**Files:**
- Create: `apps/api/src/extensions/dto.ts`, `extensions.service.ts`, `extensions.controller.ts`, `extensions.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `ExtensionsModule` next to `StoreImportModule`, line ~114), `apps/api/src/stores/store-presentation.ts` (the four `dto.analytics…` lines near 684)
- Test: `apps/api/src/extensions/extensions.service.spec.ts`, `apps/api/src/extensions/extensions-module-wiring.spec.ts`

**Interfaces:**
- Consumes: `SecretBox`, `SecretBoxError`, `EXTENSIONS`, `EXTENSION_REGISTRY`, `readSettings`, `validateInput`, `isConfigured`, `GUIDES`, `CATEGORY_LABELS`.
- Produces:
  - `ExtensionsService.list(merchantId: string, storeId: string): Promise<{ extensions: ExtensionView[]; guides: GuideView[] }>`
  - `ExtensionsService.save(merchantId, storeId, extensionId, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }): Promise<ExtensionView>`
  - `ExtensionsService.setEnabled(merchantId, storeId, extensionId, enabled: boolean): Promise<ExtensionView>`
  - `ExtensionsService.remove(merchantId, storeId, extensionId): Promise<{ removed: true }>`
  - `ExtensionView = { kind: 'extension'; id: string; name: string; category: ExtensionCategory; categoryLabel: string; tier: 'free' | 'pro'; logo: string | null; summary: string; description: string; docsUrl: string | null; fields: Array<{ key: string; label: string; type: 'text' | 'select' | 'toggle'; help: string | null; where: string | null; placeholder: string | null; required: boolean; pattern: string | null; options: Array<{ value: string; label: string }> }>; secrets: Array<{ key: string; label: string; help: string | null; configured: boolean }>; installed: boolean; enabled: boolean; configured: boolean; settings: ExtensionSettings; lastError: string | null; lastErrorAt: string | null; capabilities: Array<'script' | 'verification' | 'feed' | 'shipping' | 'events'>; feed: { url: string; platform: 'google' | 'meta'; steps: string[]; skipped?: { noPhoto: number; noPrice: number } } | null }` (`pattern` is `RegExp.source`)
  - `GuideView = { kind: 'guide'; id; name; category; categoryLabel; logo; summary; url; guide }`
  - Routes `GET v1/stores/:storeId/extensions`, `PUT|PATCH|DELETE v1/stores/:storeId/extensions/:extensionId`.
  - Feed URL: `${(process.env.PUBLIC_API_URL || \`http://localhost:${config.get('app.port') || 3001}/v1\`).replace(/\/$/, '')}/stores/public/${slug}/feeds/${id}.xml` (the same base rule as `StoreSeoService.apiBase()`).

- [ ] **Step 1: Write the failing test**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ExtensionManifest } from './extension';
import { ExtensionsService } from './extensions.service';
import { openSecrets, sealSecrets } from './secret-box';

const KEY = 'test-key-0123456789012345678901234';
const withToken: ExtensionManifest = { id: 'with-token', name: 'Con token', category: 'messaging', tier: 'pro', logo: null, summary: 'Resumen suficiente', description: 'Descripción suficientemente larga', settings: [{ key: 'phone', label: 'Teléfono', type: 'text', required: true, pattern: /^[0-9]{8}$/ }], secrets: [{ key: 'token', label: 'Token', pattern: /^[a-z0-9-]{6,}$/ }] };

function setup(row: any = null) {
  const prisma: any = {
    store: { findFirst: jest.fn(async ({ where }: any) => where.merchantId === 'm' ? { id: 's', slug: 'cafe' } : null) },
    storeExtension: {
      findMany: jest.fn(async () => row ? [row] : []), findUnique: jest.fn(async () => row),
      upsert: jest.fn(async ({ create, update }: any) => row ? { ...row, ...update } : create),
      update: jest.fn(async ({ data }: any) => ({ ...row, ...data })), deleteMany: jest.fn(async () => ({ count: row ? 1 : 0 })),
    },
  };
  const box: any = { seal: (value: Record<string, string>) => sealSecrets(KEY, value), open: (value: string) => openSecrets(KEY, value) };
  return { service: new ExtensionsService(prisma, box, { get: () => undefined } as any, [withToken]), prisma };
}

describe('ExtensionsService', () => {
  it('only serves stores the merchant owns', async () => {
    await expect(setup().service.list('other', 's')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists extensions and guides, and never returns a secret value', async () => {
    const { service } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets(KEY, { token: 'abc-123' }), lastError: null, lastErrorAt: null });
    const { extensions, guides } = await service.list('m', 's');
    expect(extensions[0]).toMatchObject({ id: 'with-token', installed: true, configured: true, secrets: [{ key: 'token', configured: true }], tier: 'pro' });
    expect(JSON.stringify(extensions)).not.toContain('abc-123');
    expect(guides.map(guide => guide.id)).toContain('whatsapp-business');
  });

  it('says so when a stored secret cannot be read, instead of failing the page', async () => {
    const { service } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets('another-key-000000000000000000000', { token: 'x' }) });
    const [view] = (await service.list('m', 's')).extensions;
    expect(view).toMatchObject({ configured: false, lastError: 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.' });
  });

  // Review focus 2: an empty secret field keeps the stored secret.
  it('saves validated settings and keeps the stored secret when the field comes back empty', async () => {
    const { service, prisma } = setup({ extensionId: 'with-token', enabled: true, settings: { phone: '70000000' }, secrets: sealSecrets(KEY, { token: 'abc-123' }) });
    await service.save('m', 's', 'with-token', { settings: { phone: '71111111' }, secrets: { token: '' } });
    const saved = prisma.storeExtension.upsert.mock.calls[0][0];
    expect(saved.update.settings).toEqual({ phone: '71111111' });
    expect(openSecrets(KEY, saved.update.secrets)).toEqual({ token: 'abc-123' });
    expect(saved.update.lastError).toBeNull();
  });

  it('refuses unknown extensions and invalid input without writing', async () => {
    const { service, prisma } = setup();
    await expect(service.save('m', 's', 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.save('m', 's', 'with-token', { settings: { phone: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.storeExtension.upsert).not.toHaveBeenCalled();
  });

  it('pauses, resumes and uninstalls', async () => {
    const { service, prisma } = setup({ extensionId: 'with-token', enabled: true, settings: {}, secrets: null });
    await service.setEnabled('m', 's', 'with-token', false);
    expect(prisma.storeExtension.update).toHaveBeenCalledWith({ where: { storeId_extensionId: { storeId: 's', extensionId: 'with-token' } }, data: { enabled: false } });
    await expect(service.remove('m', 's', 'with-token')).resolves.toEqual({ removed: true });
    expect(prisma.storeExtension.deleteMany).toHaveBeenCalledWith({ where: { storeId: 's', extensionId: 'with-token' } });
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/extensions/extensions.service` → FAIL.

- [ ] **Step 3: Implement `dto.ts`**

```ts
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class SaveExtensionDto { @IsOptional() @IsObject() settings?: Record<string, unknown>; @IsOptional() @IsObject() secrets?: Record<string, unknown>; }
export class ToggleExtensionDto { @IsBoolean() enabled!: boolean; }
```

- [ ] **Step 4: Implement `extensions.service.ts`**

```ts
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, StoreExtension } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GUIDES } from './catalog/guides';
import { CATEGORY_LABELS, type ExtensionManifest } from './extension';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from './registry';
import { SecretBox, SecretBoxError } from './secret-box';
import { isConfigured, readSettings, validateInput } from './settings';

type Row = Pick<StoreExtension, 'extensionId' | 'enabled' | 'settings' | 'secrets'> & Partial<Pick<StoreExtension, 'lastError' | 'lastErrorAt'>>;
const UNREADABLE = 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.';

/** Merchant-facing extension settings (spec 2026-09-27 §8). Secrets go in, never come out. */
@Injectable()
export class ExtensionsService {
  private readonly registry: ExtensionRegistry;
  constructor(private readonly prisma: PrismaService, private readonly box: SecretBox, private readonly config: ConfigService, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) { this.registry = registry ?? EXTENSIONS; }

  private async store(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return store;
  }
  private manifest(id: string) {
    const manifest = this.registry.find(item => item.id === id);
    if (!manifest) throw new NotFoundException('Esa extensión no existe.');
    return manifest;
  }
  /** null = stored but unreadable (the key was rotated); the merchant pastes it again. */
  private secretsOf(row: Row | null): Record<string, string> | null {
    if (!row?.secrets) return {};
    try { return this.box.open(row.secrets); } catch (error) { if (error instanceof SecretBoxError) return null; throw error; }
  }
  private feedUrl(slug: string, id: string) {
    const base = (process.env.PUBLIC_API_URL || `http://localhost:${this.config.get('app.port') || 3001}/v1`).replace(/\/$/, '');
    return `${base}/stores/public/${encodeURIComponent(slug)}/feeds/${id}.xml`;
  }

  private view(manifest: ExtensionManifest, row: Row | null, slug: string) {
    const settings = readSettings(manifest, row?.settings);
    const secrets = this.secretsOf(row);
    return {
      kind: 'extension' as const, id: manifest.id, name: manifest.name, category: manifest.category, categoryLabel: CATEGORY_LABELS[manifest.category], tier: manifest.tier,
      logo: manifest.logo, summary: manifest.summary, description: manifest.description, docsUrl: manifest.docsUrl ?? null,
      fields: manifest.settings.map(field => ({ key: field.key, label: field.label, type: field.type, help: field.help ?? null, where: field.where ?? null, placeholder: field.placeholder ?? null, required: Boolean(field.required), pattern: field.pattern?.source ?? null, options: field.options ?? [] })),
      secrets: (manifest.secrets ?? []).map(secret => ({ key: secret.key, label: secret.label, help: secret.help ?? null, configured: Boolean(secrets?.[secret.key]) })),
      installed: Boolean(row), enabled: Boolean(row?.enabled), configured: Boolean(row) && secrets !== null && isConfigured(manifest, settings, secrets), settings,
      lastError: secrets === null ? UNREADABLE : row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ? new Date(row.lastErrorAt).toISOString() : null,
      capabilities: [manifest.storefrontLoader && 'script', manifest.verificationMeta && 'verification', manifest.productFeed && 'feed', manifest.shippingCarrier && 'shipping', manifest.onEvent && 'events'].filter(Boolean) as Array<'script' | 'verification' | 'feed' | 'shipping' | 'events'>,
      feed: manifest.productFeed && row ? { url: this.feedUrl(slug, manifest.id), platform: manifest.productFeed.platform, steps: manifest.productFeed.steps } as { url: string; platform: 'google' | 'meta'; steps: string[]; skipped?: { noPhoto: number; noPrice: number } } : null,
    };
  }

  async list(merchantId: string, storeId: string) {
    const store = await this.store(merchantId, storeId);
    const rows = await this.prisma.storeExtension.findMany({ where: { storeId } });
    return {
      extensions: this.registry.map(manifest => this.view(manifest, rows.find(row => row.extensionId === manifest.id) ?? null, store.slug)),
      guides: GUIDES.map(guide => ({ kind: 'guide' as const, ...guide, categoryLabel: CATEGORY_LABELS[guide.category] })),
    };
  }

  async save(merchantId: string, storeId: string, extensionId: string, input: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> }) {
    const store = await this.store(merchantId, storeId);
    const manifest = this.manifest(extensionId);
    const current = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId, extensionId } } });
    const { settings, secrets } = validateInput(manifest, input, this.secretsOf(current) ?? {});
    const data = { settings: settings as Prisma.InputJsonValue, secrets: Object.keys(secrets).length ? this.box.seal(secrets) : null, lastError: null, lastErrorAt: null };
    const row = await this.prisma.storeExtension.upsert({ where: { storeId_extensionId: { storeId, extensionId } }, create: { storeId, extensionId, ...data }, update: data });
    return this.view(manifest, row, store.slug);
  }

  async setEnabled(merchantId: string, storeId: string, extensionId: string, enabled: boolean) {
    const store = await this.store(merchantId, storeId);
    const manifest = this.manifest(extensionId);
    if (!await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId, extensionId } } })) throw new NotFoundException('Primero configura esta extensión.');
    return this.view(manifest, await this.prisma.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId } }, data: { enabled } }), store.slug);
  }

  async remove(merchantId: string, storeId: string, extensionId: string) {
    await this.store(merchantId, storeId);
    this.manifest(extensionId);
    await this.prisma.storeExtension.deleteMany({ where: { storeId, extensionId } });
    return { removed: true as const };
  }
}
```

- [ ] **Step 5: Controller and module**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { SaveExtensionDto, ToggleExtensionDto } from './dto';
import { ExtensionsService } from './extensions.service';

@Controller('v1/stores/:storeId/extensions') @UseGuards(MerchantAuthGuard)
export class ExtensionsController {
  constructor(private readonly extensions: ExtensionsService) {}
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string) { return this.extensions.list(m.id, storeId); }
  @Put(':extensionId') save(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string, @Body() dto: SaveExtensionDto) { return this.extensions.save(m.id, storeId, id, dto); }
  @Patch(':extensionId') toggle(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string, @Body() dto: ToggleExtensionDto) { return this.extensions.setEnabled(m.id, storeId, id, dto.enabled); }
  @Delete(':extensionId') remove(@CurrentMerchant() m: { id: string }, @Param('storeId') storeId: string, @Param('extensionId') id: string) { return this.extensions.remove(m.id, storeId, id); }
}
```

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ExtensionsController } from './extensions.controller';
import { ExtensionsService } from './extensions.service';
import { SecretBox } from './secret-box';

// DashboardModule and AuthModule carry what MerchantAuthGuard needs (see store-import.module.ts).
@Module({ imports: [DashboardModule, AuthModule], controllers: [ExtensionsController], providers: [ExtensionsService, SecretBox], exports: [ExtensionsService, SecretBox] })
export class ExtensionsModule {}
```

- [ ] **Step 6: Wiring test** — create `extensions-module-wiring.spec.ts` as a copy of `src/store-import/store-import-module-wiring.spec.ts` with `ExtensionsModule`/`ExtensionsController` in place of the store-import ones, and add `ExtensionsModule` to the `imports` of `app.module.ts` right after `StoreImportModule`.

- [ ] **Step 7: Stop writing the old columns.** In `store-presentation.ts`, delete the four `...(dto.analyticsXxx !== undefined && { … normalizeAnalyticsId(…) })` lines and put in their place: `// Measurement IDs moved to extensions (spec 2026-09-27); these Store columns are read by nothing and dropped later.` Remove `normalizeAnalyticsId` from that file's imports if unused. Run `npx jest src/stores`; update any assertion that expected those fields to be written.

- [ ] **Step 8: Run** — `npx jest src/extensions src/stores && npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 9: Commit** — `git add apps/api/src/extensions apps/api/src/app.module.ts apps/api/src/stores/store-presentation.ts && git commit -m "feat(extensions): merchant API to list, configure, pause and uninstall extensions; secrets go in and never come out"`

---

### Task 8: Store events emitted in the same transaction

**Files:**
- Create: `apps/api/src/extensions/store-events.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (after line 197; after the `OrderFulfillmentStatus.PAID` update near line 661), `apps/api/src/shipping/shipments.service.ts` (`advanceOrder`, line ~81), `apps/api/src/consumer/consumer.service.ts` (`updateOrderStatus`, line ~330), `apps/api/src/refunds/refunds.service.ts` (line ~290)
- Test: `apps/api/src/extensions/store-events.integration.spec.ts`

**Interfaces:**
- Consumes: `EXTENSIONS`, `ExtensionRegistry`, `StoreEventType`.
- Produces: `emitStoreEvent(tx: Prisma.TransactionClient, storeId: string, type: StoreEventType, payload: Record<string, unknown> | (() => Promise<Record<string, unknown>>), registry?: ExtensionRegistry): Promise<void>` (a function payload is built only when someone listens); `orderEventPayload(tx: Prisma.TransactionClient, orderId: string): Promise<{ orderId: string; status: string; amount: number; currency: string; livemode: boolean; fulfillmentMethod: string | null; lines: Array<{ name: string; variantName: string | null; quantity: number; unitAmount: number }>; buyer: { name: string | null; email: string | null; phone: string | null }; delivery: { department: string | null; city: string | null; street: string; references: string | null; recipientName: string | null; recipientPhone: string | null } | null }>`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import type { ExtensionManifest } from './extension';
import { emitStoreEvent } from './store-events';

const listener: ExtensionManifest = { id: 'listener', name: 'L', category: 'messaging', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], onEvent: async () => {} };
const scriptOnly: ExtensionManifest = { id: 'script-only', name: 'S', category: 'analytics', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], storefrontLoader: 'function(){}' };

const harness = integrationDatabase('store_events');
harness.describeDb('emitStoreEvent (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient; let storeId: string;
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'C', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'T', slug: `t-${harness.databaseName}` } })).id;
    await db.storeExtension.createMany({ data: [{ storeId, extensionId: 'listener' }, { storeId, extensionId: 'script-only' }, { storeId, extensionId: 'paused', enabled: false }] });
  });
  afterAll(async () => { await harness.drop(); });

  it('queues one delivery per enabled installation that listens to events', async () => {
    await db.$transaction(tx => emitStoreEvent(tx, storeId, 'order.paid', { orderId: 'o1' }, [listener, scriptOnly, { ...listener, id: 'paused' }]));
    const deliveries = await db.extensionDelivery.findMany({ where: { storeId } });
    expect(deliveries.map(item => [item.extensionId, item.status])).toEqual([['listener', 'PENDING']]);
    expect((await db.storeEvent.findUniqueOrThrow({ where: { id: deliveries[0].eventId } })).payload).toEqual({ orderId: 'o1' });
  });

  it('writes nothing, and never builds the payload, when no installation listens', async () => {
    const before = await db.storeEvent.count();
    const build = jest.fn(async () => ({ orderId: 'o2' }));
    await db.$transaction(tx => emitStoreEvent(tx, storeId, 'order.paid', build, [scriptOnly]));
    expect(await db.storeEvent.count()).toBe(before);
    expect(build).not.toHaveBeenCalled();
  });

  it('leaves no event behind when the change that caused it rolls back', async () => {
    const before = await db.storeEvent.count();
    await expect(db.$transaction(async tx => { await emitStoreEvent(tx, storeId, 'order.paid', { orderId: 'o3' }, [listener]); throw new Error('payment failed after all'); })).rejects.toThrow('payment failed');
    expect(await db.storeEvent.count()).toBe(before);
  });
});
```

- [ ] **Step 2: Run** — `npx jest --config jest.integration.config.js src/extensions/store-events` → FAIL.

- [ ] **Step 3: Implement `store-events.ts`**

```ts
import type { Prisma } from '@prisma/client';
import type { StoreEventType } from './extension';
import { EXTENSIONS, type ExtensionRegistry } from './registry';

type Payload = Record<string, unknown>;

/**
 * Outbox for extensions (spec 2026-09-27 §6): called inside the transaction of the change, so the event
 * exists exactly when the change does. Only installations whose extension listens get a delivery, and a
 * function payload is built only then, so a payment pays no query while no extension listens.
 */
export async function emitStoreEvent(tx: Prisma.TransactionClient, storeId: string, type: StoreEventType, payload: Payload | (() => Promise<Payload>), registry: ExtensionRegistry = EXTENSIONS) {
  const listening = registry.filter(manifest => manifest.onEvent).map(manifest => manifest.id);
  if (!listening.length) return;
  const installed = await tx.storeExtension.findMany({ where: { storeId, enabled: true, extensionId: { in: listening } }, select: { extensionId: true } });
  if (!installed.length) return;
  const body = typeof payload === 'function' ? await payload() : payload;
  const event = await tx.storeEvent.create({ data: { storeId, type, payload: body as Prisma.InputJsonValue } });
  await tx.extensionDelivery.createMany({ data: installed.map(item => ({ eventId: event.id, storeId, extensionId: item.extensionId })) });
}

type CartLine = { name?: unknown; variantName?: unknown; quantity?: unknown; unitAmount?: unknown };

/** What an extension may know about an order: what the buyer gave at checkout, nothing else. */
export async function orderEventPayload(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.storeOrder.findUniqueOrThrow({ where: { id: orderId }, include: { paymentIntent: { select: { livemode: true, customerName: true, customerEmail: true, customerPhone: true } } } });
  const lines = (Array.isArray(order.items) ? order.items as CartLine[] : []).map(line => ({ name: String(line.name ?? ''), variantName: typeof line.variantName === 'string' ? line.variantName : null, quantity: Number(line.quantity) || 0, unitAmount: Number(line.unitAmount) || 0 }));
  return {
    orderId: order.id, status: order.status, amount: order.amount, currency: order.currency, livemode: order.paymentIntent.livemode, fulfillmentMethod: order.fulfillmentMethod, lines,
    buyer: { name: order.paymentIntent.customerName, email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone },
    delivery: order.shippingStreet ? { department: order.shippingDepartment, city: order.shippingCity, street: order.shippingStreet, references: order.shippingReferences, recipientName: order.recipientName, recipientPhone: order.recipientPhone } : null,
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Emit at the sites.** Add `import { emitStoreEvent, orderEventPayload } from '../extensions/store-events';` to each file.

`payment-intents.service.ts`, credit path, right after the `tx.storeOrder.update({ … status: 'PAID' … })` at line 197:
```ts
    await emitStoreEvent(tx, order.storeId, 'order.paid', () => orderEventPayload(tx, order.id));
```
Card/QR path, right after `tx.storeOrder.update({ where: { id: order.id }, data: { status: OrderFulfillmentStatus.PAID, … } })` near line 661 (inside `if (order?.status === OrderFulfillmentStatus.AWAITING_PAYMENT)`):
```ts
          await emitStoreEvent(tx, order.storeId, 'order.paid', () => orderEventPayload(tx, order.id));
```
`shipments.service.ts` `advanceOrder`, after `const event = await tx.storeOrderStatusEvent.create(…)`:
```ts
    await emitStoreEvent(tx, order.storeId, 'order.status_changed', async () => {
      const shipment = await tx.shipment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' }, select: { trackingNumber: true } });
      return { orderId: order.id, from: from.length === 1 ? from[0] : null, to, trackingNumber: shipment?.trackingNumber ?? null };
    });
```
`consumer.service.ts` `updateOrderStatus`, after `const statusEvent = await tx.storeOrderStatusEvent.create(…)`:
```ts
      await emitStoreEvent(tx, order.storeId, 'order.status_changed', { orderId: order.id, from: order.status, to: status, trackingNumber: null });
```
`refunds.service.ts`, directly after `await this.webhooks.enqueueEvent(tx, merchantId, "refund.succeeded", …)`:
```ts
    await emitStoreEvent(tx, intent.storeId ?? '', 'refund.succeeded', { paymentIntentId: intent.id, amount: refundTransaction.amount });
```
Before writing the refund line, read the surrounding function: if `intent` has no `storeId`, resolve it with `const refundedOrder = await tx.storeOrder.findUnique({ where: { paymentIntentId: intent.id }, select: { id: true, storeId: true } });` and emit only `if (refundedOrder)`, with `storeId: refundedOrder.storeId` and `orderId: refundedOrder.id` in the payload. Use the real variable names in that function (`intent`, `refundTransaction` per lines 286–293).

- [ ] **Step 6: Unit suites of the touched services** — `npx jest src/payment-intents src/shipping src/consumer src/refunds` → PASS. The production registry has no extension with `onEvent` yet, so `emitStoreEvent` returns before touching `tx`; the existing Prisma fakes need no change. If one fails, the edit is in the wrong place: fix the placement, not the fake.

- [ ] **Step 7: Typecheck and commit** — `npx tsc --noEmit -p tsconfig.json`; `git add apps/api/src/extensions/store-events.ts apps/api/src/extensions/store-events.integration.spec.ts apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/shipping/shipments.service.ts apps/api/src/consumer/consumer.service.ts apps/api/src/refunds/refunds.service.ts && git commit -m "feat(extensions): order paid, order status and refund events written in the same transaction as the change, for extensions that listen"`

---

### Task 9: Delivery worker

**Files:**
- Create: `apps/api/src/extensions/extension-delivery.service.ts`, `apps/api/src/extensions/extension-delivery.worker.ts`
- Modify: `apps/api/src/extensions/extensions.module.ts` (providers)
- Test: `apps/api/src/extensions/extension-delivery.integration.spec.ts`

**Interfaces:**
- Consumes: `SecretBox`, `SecretBoxError`, `readSettings`, `ExtensionRegistry`, `EXTENSION_REGISTRY`, `StoreEventRecord`.
- Produces: `RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]`, `MAX_ATTEMPTS = 6`; `ExtensionDeliveryService.runOnce(now?: Date): Promise<number>`; `ExtensionDeliveryService.cleanup(now?: Date): Promise<number>`; `ExtensionDeliveryWorker.tick()`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import type { ExtensionManifest } from './extension';
import { ExtensionDeliveryService, MAX_ATTEMPTS } from './extension-delivery.service';
import { openSecrets, sealSecrets } from './secret-box';

const KEY = 'k'.repeat(32);
const calls: string[] = [];
const ok: ExtensionManifest = { id: 'ok', name: 'Ok', category: 'messaging', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], secrets: [{ key: 'token', label: 'Token' }], onEvent: async (event, context) => { calls.push(`${event.id}:${context.secrets.token}`); } };
const broken: ExtensionManifest = { ...ok, id: 'broken', onEvent: async () => { throw new Error('Meta rechazó tu token'); } };

const harness = integrationDatabase('extension_delivery');
harness.describeDb('ExtensionDeliveryService (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient; let storeId: string; let service: ExtensionDeliveryService;
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'C', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'T', slug: `t-${harness.databaseName}` } })).id;
    await db.storeExtension.createMany({ data: [{ storeId, extensionId: 'ok', secrets: sealSecrets(KEY, { token: 'tk' }) }, { storeId, extensionId: 'broken' }] });
    service = new ExtensionDeliveryService(db as any, { open: (value: string) => openSecrets(KEY, value) } as any, [ok, broken]);
  });
  afterAll(async () => { await harness.drop(); });

  const event = async () => {
    const created = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: { orderId: 'o' } } });
    await db.extensionDelivery.createMany({ data: [{ eventId: created.id, storeId, extensionId: 'ok' }, { eventId: created.id, storeId, extensionId: 'broken' }] });
    return created;
  };

  // Review focus 3: one failing extension never holds back the others, and gives up with a readable error.
  it('delivers with decrypted secrets, retries a failure with back-off, then gives up and tells the merchant', async () => {
    const created = await event();
    let now = new Date('2026-10-01T12:00:00Z');
    await service.runOnce(now);
    expect(calls).toEqual([`${created.id}:tk`]);
    expect(await db.extensionDelivery.findFirstOrThrow({ where: { eventId: created.id, extensionId: 'ok' } })).toMatchObject({ status: 'DONE', attempts: 1 });
    let failed = await db.extensionDelivery.findFirstOrThrow({ where: { eventId: created.id, extensionId: 'broken' } });
    expect(failed).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'Meta rechazó tu token' });
    expect(failed.nextAttemptAt.getTime() - now.getTime()).toBe(60_000);
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      now = new Date(failed.nextAttemptAt.getTime() + 1);
      await service.runOnce(now);
      failed = await db.extensionDelivery.findFirstOrThrow({ where: { id: failed.id } });
    }
    expect(failed).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
    expect(await db.storeExtension.findFirstOrThrow({ where: { storeId, extensionId: 'broken' } })).toMatchObject({ lastError: 'Meta rechazó tu token' });
    expect(calls).toHaveLength(1);
  });

  it('closes deliveries of a paused or uninstalled extension without calling it', async () => {
    const created = await event();
    await db.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId: 'ok' } }, data: { enabled: false } });
    await db.storeExtension.delete({ where: { storeId_extensionId: { storeId, extensionId: 'broken' } } });
    await service.runOnce(new Date('2026-10-02T00:00:00Z'));
    expect((await db.extensionDelivery.findMany({ where: { eventId: created.id } })).every(row => row.status === 'DONE')).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('takes over a delivery whose lease expired, and never runs one another worker holds', async () => {
    const created = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {} } });
    await db.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId: 'ok' } }, data: { enabled: true } });
    const held = await db.extensionDelivery.create({ data: { eventId: created.id, storeId, extensionId: 'ok', status: 'RUNNING', leaseToken: 'other', leaseUntil: new Date('2026-10-03T00:05:00Z'), attempts: 1 } });
    await service.runOnce(new Date('2026-10-03T00:00:00Z'));
    expect((await db.extensionDelivery.findUniqueOrThrow({ where: { id: held.id } })).status).toBe('RUNNING');
    await service.runOnce(new Date('2026-10-03T00:06:00Z'));
    expect(await db.extensionDelivery.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ status: 'DONE', attempts: 2 });
  });

  it('deletes finished events older than 30 days, keeps anything still pending', async () => {
    const old = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {}, createdAt: new Date('2026-01-01T00:00:00Z') } });
    await db.extensionDelivery.create({ data: { eventId: old.id, storeId, extensionId: 'ok', status: 'DONE' } });
    const pending = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {}, createdAt: new Date('2026-01-01T00:00:00Z') } });
    await db.extensionDelivery.create({ data: { eventId: pending.id, storeId, extensionId: 'ok', status: 'PENDING', nextAttemptAt: new Date('2027-01-01T00:00:00Z') } });
    await service.cleanup(new Date('2026-10-05T00:00:00Z'));
    expect(await db.storeEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.storeEvent.findUnique({ where: { id: pending.id } })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx jest --config jest.integration.config.js src/extensions/extension-delivery` → FAIL.

- [ ] **Step 3: Implement `extension-delivery.service.ts`**

```ts
import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { StoreEventRecord } from './extension';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from './registry';
import { SecretBox, SecretBoxError } from './secret-box';
import { readSettings } from './settings';

export const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const LEASE_MS = 2 * 60_000;
const KEEP_MS = 30 * 24 * 60 * 60_000;
const BATCH = 20;

/** Runs extensions' onEvent for queued deliveries (spec 2026-09-27 §6), leased like store-import. */
@Injectable()
export class ExtensionDeliveryService {
  private readonly registry: ExtensionRegistry;
  constructor(private readonly prisma: PrismaService, private readonly box: SecretBox, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) { this.registry = registry ?? EXTENSIONS; }

  async runOnce(now = new Date()) {
    const due = await this.prisma.extensionDelivery.findMany({
      where: { OR: [{ status: 'PENDING', nextAttemptAt: { lte: now } }, { status: 'RUNNING', leaseUntil: { lt: now } }] },
      orderBy: { nextAttemptAt: 'asc' }, take: BATCH,
    });
    let processed = 0;
    for (const candidate of due) {
      const leaseToken = randomUUID();
      const claimed = await this.prisma.extensionDelivery.updateMany({
        where: { id: candidate.id, status: candidate.status, leaseToken: candidate.leaseToken },
        data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      processed++;
      await this.deliver(candidate.id, leaseToken, candidate.attempts + 1, now);
    }
    return processed;
  }

  private async deliver(id: string, leaseToken: string, attempt: number, now: Date) {
    const delivery = await this.prisma.extensionDelivery.findUniqueOrThrow({ where: { id }, include: { event: true } });
    const finish = (data: Record<string, unknown>) => this.prisma.extensionDelivery.updateMany({ where: { id, leaseToken }, data: { leaseToken: null, leaseUntil: null, ...data } });
    const manifest = this.registry.find(item => item.id === delivery.extensionId);
    const installation = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId: delivery.storeId, extensionId: delivery.extensionId } } });
    if (!manifest?.onEvent || !installation?.enabled) { await finish({ status: 'DONE', doneAt: now }); return; }
    try {
      const event: StoreEventRecord = { id: delivery.event.id, storeId: delivery.storeId, type: delivery.event.type as StoreEventRecord['type'], payload: delivery.event.payload as Record<string, unknown>, createdAt: delivery.event.createdAt };
      await manifest.onEvent(event, { storeId: delivery.storeId, settings: readSettings(manifest, installation.settings), secrets: installation.secrets ? this.box.open(installation.secrets) : {} });
      await finish({ status: 'DONE', doneAt: now, lastError: null });
    } catch (error) {
      const message = error instanceof SecretBoxError ? 'Vuelve a pegar tu clave: no pudimos leer la que guardaste.' : ((error as Error)?.message || 'Error desconocido').slice(0, 300);
      const giveUp = attempt >= MAX_ATTEMPTS;
      await finish(giveUp ? { status: 'FAILED', lastError: message } : { status: 'PENDING', lastError: message, nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempt - 1]) });
      if (giveUp) await this.prisma.storeExtension.updateMany({ where: { storeId: delivery.storeId, extensionId: delivery.extensionId }, data: { lastError: message, lastErrorAt: now } });
    }
  }

  /** Events whose deliveries are all finished are history after 30 days. */
  async cleanup(now = new Date()) {
    const { count } = await this.prisma.storeEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) }, deliveries: { every: { status: { in: ['DONE', 'FAILED'] } } } } });
    return count;
  }
}
```

- [ ] **Step 4: Implement `extension-delivery.worker.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExtensionDeliveryService } from './extension-delivery.service';

/** One batch at a time per API process; a slow provider never blocks a checkout, only this loop. */
@Injectable()
export class ExtensionDeliveryWorker {
  private busy = false;
  private lastCleanup = 0;
  constructor(private readonly deliveries: ExtensionDeliveryService) {}

  @Interval(2000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.deliveries.runOnce();
      if (Date.now() - this.lastCleanup > 24 * 60 * 60_000) { this.lastCleanup = Date.now(); await this.deliveries.cleanup(); }
    } catch { /* The next tick retries; per-delivery failures are recorded on the row. */ }
    finally { this.busy = false; }
  }
}
```

Add `ExtensionDeliveryService` and `ExtensionDeliveryWorker` to `providers` in `extensions.module.ts`.

- [ ] **Step 5: Run** — the integration command → PASS; `npx jest src/extensions` → PASS (wiring included).

- [ ] **Step 6: Commit** — `git add apps/api/src/extensions && git commit -m "feat(extensions): leased delivery worker — retries 1m/5m/30m/2h/12h, then shows the error on the extension; skips paused ones; cleans up after 30 days"`

---

### Task 10: Product feeds

**Files:**
- Create: `apps/api/src/extensions/feeds/product-feed.ts`, `apps/api/src/extensions/feeds/store-feeds.service.ts`, `apps/api/src/extensions/feeds/store-feeds.controller.ts`
- Modify: `apps/api/src/store-seo/store-seo.module.ts`, `apps/api/src/extensions/extensions.module.ts`, `apps/api/src/extensions/extensions.service.ts`
- Test: `apps/api/src/extensions/feeds/product-feed.spec.ts`, `apps/api/src/extensions/feeds/store-feeds.service.spec.ts`

**Interfaces:**
- Consumes: `StoreSeoService.context(slug)` → `{ store: { id, name, … }, home: string, productUrl: (id: string) => string }` (404s for non-public stores via `PUBLIC_STORE_WHERE`); `PublicStoresService.getStorePublic(slug, { trackView: false })` → `{ items }`; `publicImage(url, apiBase)`, `seoPrice(product)` from `store-seo/store-seo.ts`.
- Produces: `FeedItem`; `formatPrice(centavos: number, currency: string): string`; `feedItems(input: { storeName: string; items: PublicItem[]; productUrl: (id: string) => string; image: (url: string) => string | undefined }): { items: FeedItem[]; skipped: { noPhoto: number; noPrice: number } }`; `productFeedXml(title: string, home: string, items: FeedItem[]): string`; `StoreFeedsService.feed(slug: string, file: string): Promise<string>`; `StoreFeedsService.summary(slug: string): Promise<{ skipped: { noPhoto: number; noPrice: number } }>`; route `GET v1/stores/public/:slug/feeds/:file` with `:file` = `<extensionId>.xml`.

- [ ] **Step 1: Write the failing builder test**

```ts
import { feedItems, formatPrice, productFeedXml } from './product-feed';

const item = (over: any = {}) => ({ id: 'p1', name: 'Taza <azul>', description: 'Cerámica & esmalte', imageUrls: ['/v1/uploads/a.png', '/v1/uploads/b.png'], amount: 4550, currency: 'BOB', stock: null, variants: [], discountPercent: 0, ...over });
const input = (items: any[]) => ({ storeName: 'Café & Co', items, productUrl: (id: string) => `https://micafe.com/p/${id}`, image: (url: string) => `https://api.pagosya.bo${url}` });

describe('product feed', () => {
  it('formats centavos with integer math', () => {
    expect(formatPrice(4550, 'BOB')).toBe('45.50 BOB');
    expect(formatPrice(5, 'bob')).toBe('0.05 BOB');
    expect(formatPrice(100000, 'BOB')).toBe('1000.00 BOB');
  });

  // Review focus 4: variants grouped, a sold-out variant marked, a photo-less product skipped and counted.
  it('groups variants, marks sold-out ones, and skips products without a photo or price', () => {
    const { items, skipped } = feedItems(input([
      item({ variants: [{ id: 'v1', name: 'Rojo', amount: 4000, stock: 3, imageUrl: '/v1/uploads/r.png' }, { id: 'v2', name: 'Negro', amount: 4200, stock: 0 }] }),
      item({ id: 'p2', imageUrls: [] }),
      item({ id: 'p3', amount: 0 }),
      item({ id: 'p4', stock: 0 }),
    ]));
    expect(skipped).toEqual({ noPhoto: 1, noPrice: 1 });
    expect(items.map(entry => [entry.id, entry.groupId, entry.available, entry.price])).toEqual([['p1-v1', 'p1', true, 4000], ['p1-v2', 'p1', false, 4200], ['p4', null, false, 4550]]);
    expect(items[0]).toMatchObject({ title: 'Taza <azul> · Rojo', link: 'https://micafe.com/p/p1', imageLinks: ['https://api.pagosya.bo/v1/uploads/r.png', 'https://api.pagosya.bo/v1/uploads/a.png', 'https://api.pagosya.bo/v1/uploads/b.png'] });
  });

  it('writes RSS 2.0 with the g: namespace, escaped, with every required field', () => {
    const xml = productFeedXml('Café & Co', 'https://micafe.com/', feedItems(input([item()])).items);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')).toBe(true);
    for (const field of ['<g:id>p1</g:id>', '<g:title>Taza &lt;azul&gt;</g:title>', '<g:description>Cerámica &amp; esmalte</g:description>', '<g:link>https://micafe.com/p/p1</g:link>', '<g:image_link>https://api.pagosya.bo/v1/uploads/a.png</g:image_link>', '<g:additional_image_link>https://api.pagosya.bo/v1/uploads/b.png</g:additional_image_link>', '<g:availability>in_stock</g:availability>', '<g:price>45.50 BOB</g:price>', '<g:condition>new</g:condition>', '<g:brand>Café &amp; Co</g:brand>', '<g:identifier_exists>no</g:identifier_exists>']) expect(xml).toContain(field);
    expect(xml).not.toContain('<g:item_group_id>');
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/extensions/feeds/product-feed` → FAIL.

- [ ] **Step 3: Implement `product-feed.ts`**

```ts
import { seoPrice } from '../../store-seo/store-seo';

export type FeedItem = { id: string; groupId: string | null; title: string; description: string; link: string; imageLinks: string[]; available: boolean; price: number; currency: string; brand: string };
type PublicVariant = { id: string; name: string; amount: number; stock?: number | null; imageUrl?: string | null };
type PublicItem = { id: string; name: string; description?: string | null; imageUrls: string[]; amount: number; currency: string; stock?: number | null; variants?: PublicVariant[] } & Record<string, unknown>;

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const formatPrice = (centavos: number, currency: string) => `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')} ${currency.toUpperCase()}`;

/** The storefront's own public catalog, as Google Merchant Center and Meta Commerce Manager read it (spec §7.3). */
export function feedItems(input: { storeName: string; items: PublicItem[]; productUrl: (id: string) => string; image: (url: string) => string | undefined }) {
  const skipped = { noPhoto: 0, noPrice: 0 };
  const items: FeedItem[] = [];
  for (const product of input.items) {
    const photos = product.imageUrls.map(input.image).filter((url): url is string => Boolean(url)).slice(0, 11);
    if (!photos.length) { skipped.noPhoto++; continue; }
    const base = { description: String(product.description ?? '').slice(0, 5000), link: input.productUrl(product.id), currency: product.currency, brand: input.storeName };
    const variants = product.variants ?? [];
    if (!variants.length) {
      const price = seoPrice(product);
      if (!(price > 0)) { skipped.noPrice++; continue; }
      items.push({ ...base, id: product.id, groupId: null, title: product.name, imageLinks: photos, available: product.stock !== 0, price });
      continue;
    }
    const priced = variants.filter(variant => seoPrice({ ...product, amount: variant.amount }) > 0);
    if (!priced.length) { skipped.noPrice++; continue; }
    for (const variant of priced) {
      const own = variant.imageUrl ? input.image(variant.imageUrl) : undefined;
      items.push({ ...base, id: `${product.id}-${variant.id}`, groupId: product.id, title: `${product.name} · ${variant.name}`, imageLinks: own ? [own, ...photos.filter(url => url !== own)].slice(0, 11) : photos, available: variant.stock !== 0 && product.stock !== 0, price: seoPrice({ ...product, amount: variant.amount }) });
    }
  }
  return { items, skipped };
}

export function productFeedXml(title: string, home: string, items: FeedItem[]) {
  const entries = items.map(item => '<item>'
    + `<g:id>${xml(item.id)}</g:id>${item.groupId ? `<g:item_group_id>${xml(item.groupId)}</g:item_group_id>` : ''}`
    + `<g:title>${xml(item.title.slice(0, 150))}</g:title><g:description>${xml(item.description || item.title)}</g:description>`
    + `<g:link>${xml(item.link)}</g:link><g:image_link>${xml(item.imageLinks[0])}</g:image_link>`
    + item.imageLinks.slice(1).map(url => `<g:additional_image_link>${xml(url)}</g:additional_image_link>`).join('')
    + `<g:availability>${item.available ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${formatPrice(item.price, item.currency)}</g:price>`
    + `<g:condition>new</g:condition><g:brand>${xml(item.brand)}</g:brand><g:identifier_exists>no</g:identifier_exists></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(title)}</title><link>${xml(home)}</link><description>${xml(`Catálogo de ${title}`)}</description>\n${entries}\n</channel></rss>`;
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Write the failing service test** `store-feeds.service.spec.ts`

```ts
import { NotFoundException } from '@nestjs/common';
import { StoreFeedsService } from './store-feeds.service';

function setup(installation: any) {
  const prisma: any = { storeExtension: { findUnique: jest.fn(async () => installation) } };
  const seo: any = { context: jest.fn(async () => ({ store: { id: 's', name: 'Café' }, home: 'https://micafe.com/', productUrl: (id: string) => `https://micafe.com/p/${id}` })) };
  const publicStores: any = { getStorePublic: jest.fn(async () => ({ items: [{ id: 'p1', name: 'Taza', description: '', imageUrls: ['/v1/uploads/a.png'], amount: 1000, currency: 'BOB', stock: null, variants: [] }] })) };
  return { service: new StoreFeedsService(prisma, seo, publicStores, { get: () => undefined } as any), publicStores };
}

describe('StoreFeedsService', () => {
  it('serves the feed of an installed, enabled feed extension, cached for an hour', async () => {
    const { service, publicStores } = setup({ enabled: true });
    expect(await service.feed('cafe', 'google-shopping.xml')).toContain('<g:id>p1</g:id>');
    await service.feed('cafe', 'google-shopping.xml');
    expect(publicStores.getStorePublic).toHaveBeenCalledTimes(1);
  });

  it('404s when the extension is missing, paused, not a feed, or the file is malformed', async () => {
    await expect(setup(null).service.feed('cafe', 'google-shopping.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: false }).service.feed('cafe', 'meta-catalog.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: true }).service.feed('cafe', 'meta-pixel.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: true }).service.feed('cafe', 'google-shopping')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts what the feed leaves out, for the extension card', async () => {
    await expect(setup({ enabled: true }).service.summary('cafe')).resolves.toEqual({ skipped: { noPhoto: 0, noPrice: 0 } });
  });
});
```

- [ ] **Step 6: Implement the service and controller**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreSeoService } from '../../store-seo/store-seo.service';
import { publicImage } from '../../store-seo/store-seo';
import { PublicStoresService } from '../../stores/public-stores.service';
import { findExtension } from '../registry';
import { feedItems, productFeedXml } from './product-feed';

const TTL_MS = 60 * 60_000;

/** Catalog feeds for Google Shopping and Facebook & Instagram Shop: live data on request, cached an hour (spec §7.3). */
@Injectable()
export class StoreFeedsService {
  private readonly cache = new Map<string, { at: number; body: string }>();
  constructor(private readonly prisma: PrismaService, private readonly seo: StoreSeoService, private readonly publicStores: PublicStoresService, private readonly config: ConfigService) {}
  private apiBase() { return (process.env.PUBLIC_API_URL || `http://localhost:${this.config.get('app.port') || 3001}/v1`).replace(/\/$/, ''); }

  private async build(slug: string) {
    const context = await this.seo.context(slug);
    const data = await this.publicStores.getStorePublic(slug, { trackView: false });
    return { context, ...feedItems({ storeName: context.store.name, items: data.items as never, productUrl: context.productUrl, image: url => publicImage(url, this.apiBase()) }) };
  }

  async feed(slug: string, file: string) {
    const match = /^([a-z0-9-]{1,60})\.xml$/.exec(file);
    const manifest = match ? findExtension(match[1]) : undefined;
    if (!manifest?.productFeed) throw new NotFoundException();
    const context = await this.seo.context(slug);
    const installation = await this.prisma.storeExtension.findUnique({ where: { storeId_extensionId: { storeId: context.store.id, extensionId: manifest.id } }, select: { enabled: true } });
    if (!installation?.enabled) throw new NotFoundException();
    const key = `${context.store.id}:${manifest.id}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
    const { items } = await this.build(slug);
    const body = productFeedXml(context.store.name, context.home, items);
    this.cache.set(key, { at: Date.now(), body });
    return body;
  }

  /** For the extension card: how many products the feed leaves out, and why. */
  async summary(slug: string) {
    try { return { skipped: (await this.build(slug)).skipped }; } catch { return { skipped: { noPhoto: 0, noPrice: 0 } }; }
  }
}
```

```ts
import { Controller, Get, Header, Param } from '@nestjs/common';
import { StoreFeedsService } from './store-feeds.service';

@Controller('v1/stores/public/:slug/feeds')
export class StoreFeedsController {
  constructor(private readonly feeds: StoreFeedsService) {}
  @Get(':file') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'public, max-age=3600')
  feed(@Param('slug') slug: string, @Param('file') file: string) { return this.feeds.feed(slug, file); }
}
```

- [ ] **Step 7: Wire it.** In `store-seo.module.ts`: add `StoreFeedsController` to `controllers`, `StoreFeedsService` to `providers`, and `exports: [StoreFeedsService]`. In `extensions.module.ts`: add `StoreSeoModule` to `imports`. In `ExtensionsService`, add a last constructor parameter `@Optional() private readonly feeds?: StoreFeedsService` (import it from `./feeds/store-feeds.service`) and change `list()` to:

```ts
  async list(merchantId: string, storeId: string) {
    const store = await this.store(merchantId, storeId);
    const rows = await this.prisma.storeExtension.findMany({ where: { storeId } });
    const hasFeed = this.registry.some(manifest => manifest.productFeed && rows.some(row => row.extensionId === manifest.id));
    const summary = hasFeed && this.feeds ? await this.feeds.summary(store.slug) : null;
    return {
      extensions: this.registry.map(manifest => {
        const view = this.view(manifest, rows.find(row => row.extensionId === manifest.id) ?? null, store.slug);
        return view.feed && summary ? { ...view, feed: { ...view.feed, skipped: summary.skipped } } : view;
      }),
      guides: GUIDES.map(guide => ({ kind: 'guide' as const, ...guide, categoryLabel: CATEGORY_LABELS[guide.category] })),
    };
  }
```

- [ ] **Step 8: Run** — `npx jest src/extensions src/store-seo && npx tsc --noEmit -p tsconfig.json` → PASS (wiring spec included).

- [ ] **Step 9: Commit** — `git add apps/api/src/extensions apps/api/src/store-seo && git commit -m "feat(extensions): Google Shopping and Facebook & Instagram Shop feeds from the live public catalog, variants grouped, cached an hour"`

---

### Task 11: Shipping quote step and extension carriers

**Files:**
- Modify: `apps/api/src/shipping/carriers/carrier.ts`, `apps/api/src/shipping/carriers/carrier-registry.ts`
- Test: `apps/api/src/shipping/carriers/carrier-registry.spec.ts` (create)

**Interfaces:**
- Produces: `type QuoteInput = { origin: ShipmentParty; destination: ShipmentParty; weightGrams: number | null; parcel: Parcel | null; declaredAmount: number; currency: string }`; `type CarrierQuote = { service: string; label: string; amount: number; currency: string; days?: { min: number; max: number } }`; optional `CarrierAdapter.quote?(input: QuoteInput, creds: CarrierCredentials | null): Promise<CarrierQuote[]>`; `CarrierRegistry` constructor `(manual: ManualCarrier, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry)`.

- [ ] **Step 1: Write the failing test**

```ts
import { BadRequestException } from '@nestjs/common';
import type { ExtensionManifest } from '../../extensions/extension';
import type { CarrierAdapter } from './carrier';
import { CarrierRegistry } from './carrier-registry';
import { ManualCarrier } from './manual.carrier';

const fake: CarrierAdapter = { code: 'FAKE_EXPRESS', mode: 'API', supportsScheduledPickup: false, book: jest.fn(), cancel: jest.fn(), track: jest.fn(), quote: jest.fn(async () => [{ service: 'EXPRESS', label: 'Express', amount: 9900, currency: 'BOB', days: { min: 2, max: 4 } }]) };
const carrierExtension: ExtensionManifest = { id: 'fake-express', name: 'Fake', category: 'shipping', tier: 'pro', logo: null, summary: 's', description: 'd', settings: [], shippingCarrier: fake };

describe('CarrierRegistry', () => {
  it('serves carriers that extensions bring, by code, with their quote step', async () => {
    const carrier = new CarrierRegistry(new ManualCarrier(), [carrierExtension]).get('FAKE_EXPRESS', 'API');
    expect(carrier).toBe(fake);
    await expect(carrier.quote!({} as never, null)).resolves.toEqual([{ service: 'EXPRESS', label: 'Express', amount: 9900, currency: 'BOB', days: { min: 2, max: 4 } }]);
  });
  it('still answers manual shipping, and refuses unknown couriers in Spanish', () => {
    const registry = new CarrierRegistry(new ManualCarrier(), []);
    expect(registry.get('ANY', 'MANUAL')).toBeInstanceOf(ManualCarrier);
    expect(() => registry.get('NOPE', 'API')).toThrow(BadRequestException);
  });
});
```

Construct `ManualCarrier` the way `manual.carrier.spec.ts` does if its constructor takes arguments.

- [ ] **Step 2: Run** — `npx jest src/shipping/carriers/carrier-registry` → FAIL.

- [ ] **Step 3: Implement.** In `carrier.ts`, after `TrackingUpdate`:

```ts
export type QuoteInput = { origin: ShipmentParty; destination: ShipmentParty; weightGrams: number | null; parcel: Parcel | null; declaredAmount: number; currency: string };
export type CarrierQuote = { service: string; label: string; amount: number; currency: string; days?: { min: number; max: number } };
```

and inside `interface CarrierAdapter`:

```ts
  /** Prices before booking, shown at checkout (FedEx and later carriers). Manual shipping has none. */
  quote?(input: QuoteInput, creds: CarrierCredentials | null): Promise<CarrierQuote[]>;
```

`carrier-registry.ts`:

```ts
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from '../../extensions/registry';
import type { CarrierAdapter } from './carrier';
import { ManualCarrier } from './manual.carrier';

@Injectable()
export class CarrierRegistry {
  // Couriers arrive as extensions (spec 2026-09-27 §7.4); FedEx is the first.
  private readonly api = new Map<string, CarrierAdapter>();
  constructor(private readonly manual: ManualCarrier, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) {
    for (const manifest of registry ?? EXTENSIONS) if (manifest.shippingCarrier) this.api.set(manifest.shippingCarrier.code, manifest.shippingCarrier);
  }
  get(code: string, mode: 'API' | 'MANUAL'): CarrierAdapter {
    if (mode === 'MANUAL') return this.manual;
    const adapter = this.api.get(code);
    if (!adapter) throw new BadRequestException('Este courier no está disponible todavía.');
    return adapter;
  }
}
```

Credentials for extension carriers (from `StoreExtension.secrets` rather than `StoreCarrierAccount`) are wired in the FedEx sub-project, the first to book through one; until then no extension carrier exists.

- [ ] **Step 4: Run** — `npx jest src/shipping` → PASS.

- [ ] **Step 5: Commit** — `git add apps/api/src/shipping/carriers && git commit -m "feat(shipping): carriers can quote before booking, and extensions can bring carriers — ready for FedEx"`

---

### Task 12: Studio "Integraciones" page on extensions

**Files:**
- Create: `apps/merchant-studio/src/extensions-panel.ts`, `apps/merchant-studio/src/extensions-panel.test.ts`
- Modify: `apps/merchant-studio/src/api.ts` (methods near `integrationConnections`, line 183; remove `saveAnalyticsId` at line 230 and `AnalyticsField` at line 36 once unused), `apps/merchant-studio/src/source-business-workspace.ts` (the `kind === 'integrations'` block, lines ~147–236), the stylesheet defining `.integration-card` (`grep -rln "integration-card" apps/merchant-studio/src`)
- Delete: `apps/merchant-studio/src/integration-catalog.ts`

**Interfaces:**
- Consumes: `ExtensionView`, `GuideView` from Task 7/10.
- Produces: Studio API methods `extensions(storeId)`, `saveExtension(storeId, id, body)`, `toggleExtension(storeId, id, enabled)`, `removeExtension(storeId, id)`; panel functions `extensionBadges(view)`, `extensionCard(view, base)`, `guideCard(guide, base)`, `extensionDetail(view, base)`, `readExtensionForm(form, view)`.

- [ ] **Step 1: API client** — in `api.ts`, add the types beside the other exported types and the methods beside `integrationConnections`:

```ts
export type ExtensionFieldView = { key: string; label: string; type: 'text' | 'select' | 'toggle'; help: string | null; where: string | null; placeholder: string | null; required: boolean; pattern: string | null; options: Array<{ value: string; label: string }> };
export type ExtensionView = { kind: 'extension'; id: string; name: string; category: string; categoryLabel: string; tier: 'free' | 'pro'; logo: string | null; summary: string; description: string; docsUrl: string | null; fields: ExtensionFieldView[]; secrets: Array<{ key: string; label: string; help: string | null; configured: boolean }>; installed: boolean; enabled: boolean; configured: boolean; settings: Record<string, string | boolean>; lastError: string | null; lastErrorAt: string | null; capabilities: string[]; feed: { url: string; platform: 'google' | 'meta'; steps: string[]; skipped?: { noPhoto: number; noPrice: number } } | null };
export type GuideView = { kind: 'guide'; id: string; name: string; category: string; categoryLabel: string; logo: string | null; summary: string; url: string; guide: string };
```

```ts
  extensions(storeId: string): Promise<{ extensions: ExtensionView[]; guides: GuideView[] }> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions`); }
  saveExtension(storeId: string, id: string, body: { settings: Record<string, string | boolean>; secrets: Record<string, string> }): Promise<ExtensionView> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }); }
  toggleExtension(storeId: string, id: string, enabled: boolean): Promise<ExtensionView> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); }
  removeExtension(storeId: string, id: string): Promise<{ removed: true }> { return this.request(`/stores/${encodeURIComponent(storeId)}/extensions/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
```

- [ ] **Step 2: Write the failing panel test** `extensions-panel.test.ts` (check how `source-business-workspace.test.ts` gets a DOM; if it uses a per-file directive, put `// @vitest-environment jsdom` on line 1 here too)

```ts
import { describe, expect, it } from 'vitest';
import type { ExtensionView } from './api';
import { extensionBadges, extensionCard, extensionDetail, guideCard, readExtensionForm } from './extensions-panel';

const view = (over: Partial<ExtensionView> = {}): ExtensionView => ({ kind: 'extension', id: 'meta-pixel', name: 'Meta Pixel', category: 'ads', categoryLabel: 'Publicidad', tier: 'free', logo: 'meta', summary: 'Mide tus anuncios.', description: 'Tu pixel <b>registra</b> compras.', docsUrl: 'https://example.com/doc', fields: [{ key: 'id', label: 'ID del pixel', type: 'text', help: null, where: 'Events Manager.', placeholder: '123456789012345', required: true, pattern: '^[0-9]{8,20}$', options: [] }], secrets: [], installed: false, enabled: false, configured: false, settings: {}, lastError: null, lastErrorAt: null, capabilities: ['script'], feed: null, ...over });
const toggle = { key: 'on', label: 'Activo', type: 'toggle' as const, help: null, where: null, placeholder: null, required: false, pattern: null, options: [] };
const token = { key: 'token', label: 'Token', help: null, configured: true };

describe('extensions panel', () => {
  it('labels level, state and errors', () => {
    expect(extensionBadges(view())).toEqual([{ label: 'Gratis', tone: 'plain' }]);
    expect(extensionBadges(view({ tier: 'pro', installed: true, enabled: true, configured: true }))).toEqual([{ label: 'Pro · gratis por ahora', tone: 'pro' }, { label: 'Configurada', tone: 'ready' }]);
    expect(extensionBadges(view({ installed: true, enabled: false, configured: true }))).toContainEqual({ label: 'Pausada', tone: 'plain' });
    expect(extensionBadges(view({ installed: true, enabled: true, configured: true, lastError: 'Meta rechazó tu token' }))).toContainEqual({ label: 'Con error', tone: 'error' });
  });

  it('escapes every string that comes from the API', () => {
    const html = extensionDetail(view({ settings: { id: '"><img src=x>' } }), '/studio/');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('Tu pixel &lt;b&gt;registra&lt;/b&gt; compras.');
  });

  it('builds the form from the manifest fields, and never shows a stored secret', () => {
    const html = extensionDetail(view({ secrets: [token], fields: [...view().fields, toggle] }), '/studio/');
    expect(html).toContain('name="setting:id"');
    expect(html).toContain('pattern="^[0-9]{8,20}$"');
    expect(html).toContain('type="checkbox" name="setting:on"');
    expect(html).toContain('name="secret:token"');
    expect(html).toContain('Configurado ✓');
    expect(html).not.toMatch(/name="secret:token"[^>]*value="/);
  });

  it('shows the feed address, its steps, and what it leaves out', () => {
    const html = extensionDetail(view({ id: 'google-shopping', capabilities: ['feed'], fields: [], installed: true, enabled: true, configured: true, feed: { url: 'https://api/x.xml', platform: 'google', steps: ['Paso uno'], skipped: { noPhoto: 2, noPrice: 0 } } }), '/studio/');
    expect(html).toContain('https://api/x.xml');
    expect(html).toContain('Paso uno');
    expect(html).toContain('2 productos sin foto no aparecen');
  });

  it('reads the form into settings and secrets; an empty secret is sent empty so the API keeps the stored one', () => {
    const current = view({ secrets: [token], fields: [...view().fields, toggle] });
    document.body.innerHTML = extensionDetail(current, '/studio/');
    const form = document.querySelector('form')!;
    (form.elements.namedItem('setting:id') as HTMLInputElement).value = ' 123456789 ';
    (form.elements.namedItem('setting:on') as HTMLInputElement).checked = true;
    expect(readExtensionForm(form, current)).toEqual({ settings: { id: '123456789', on: true }, secrets: { token: '' } });
  });

  it('cards: extensions open their detail, guides link out', () => {
    expect(extensionCard(view(), '/studio/')).toContain('data-open-extension="meta-pixel"');
    expect(guideCard({ kind: 'guide', id: 'instagram-ads', name: 'Instagram Ads', category: 'ads', categoryLabel: 'Publicidad', logo: 'instagram', summary: 'Promociona.', url: 'https://adsmanager.facebook.com/', guide: 'https://g' }, '/studio/')).toContain('href="https://adsmanager.facebook.com/"');
  });
});
```

- [ ] **Step 3: Run** — `cd apps/merchant-studio && npx vitest run src/extensions-panel.test.ts` → FAIL.

- [ ] **Step 4: Implement `extensions-panel.ts`**

```ts
import type { ExtensionView, GuideView } from './api';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const logo = (name: string | null, alt: string, base: string) => `<span class="integration-logo ${name ? '' : 'is-pagosya'}"><img src="${esc(base)}${name ? `integrations/${esc(name)}.svg` : 'logo-mark.png'}" alt="${esc(name ? alt : 'PagosYa')}" width="32" height="32" loading="lazy"></span>`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function extensionBadges(view: ExtensionView): Array<{ label: string; tone: 'ready' | 'pro' | 'error' | 'plain' }> {
  const badges: Array<{ label: string; tone: 'ready' | 'pro' | 'error' | 'plain' }> = [view.tier === 'pro' ? { label: 'Pro · gratis por ahora', tone: 'pro' } : { label: 'Gratis', tone: 'plain' }];
  if (view.installed && !view.enabled) badges.push({ label: 'Pausada', tone: 'plain' });
  else if (view.installed && view.lastError) badges.push({ label: 'Con error', tone: 'error' });
  else if (view.installed && view.configured) badges.push({ label: 'Configurada', tone: 'ready' });
  return badges;
}
const toneClass = { ready: 'is-ready', pro: 'is-pro', error: 'is-error', plain: '' } as const;
const badgeHtml = (view: ExtensionView) => extensionBadges(view).map(badge => `<span class="business-badge ${toneClass[badge.tone]}">${esc(badge.label)}</span>`).join('');

export function extensionCard(view: ExtensionView, base: string) {
  return `<article class="integration-card"><header>${logo(view.logo, view.name, base)}<span class="integration-badges">${badgeHtml(view)}</span></header><h2>${esc(view.name)}</h2><small>${esc(view.categoryLabel)} · Extensión</small><p>${esc(view.summary)}</p><button type="button" data-open-extension="${esc(view.id)}">${view.installed ? 'Editar' : 'Configurar'}</button></article>`;
}

export function guideCard(guide: GuideView, base: string) {
  return `<article class="integration-card is-guide"><header>${logo(guide.logo, guide.name, base)}<span class="business-badge">Guía</span></header><h2>${esc(guide.name)}</h2><small>${esc(guide.categoryLabel)} · Servicio externo</small><p>${esc(guide.summary)}</p><div class="business-actions"><a class="integration-link" href="${esc(guide.url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a><a class="integration-link" href="${esc(guide.guide)}" target="_blank" rel="noopener noreferrer">Guía oficial ↗</a></div></article>`;
}

function fieldHtml(view: ExtensionView, field: ExtensionView['fields'][number]) {
  const value = view.settings[field.key];
  const hint = [field.where, field.help].filter(Boolean).map(text => `<small class="business-help">${esc(text)}</small>`).join('');
  if (field.type === 'toggle') return `<label class="business-switch"><input type="checkbox" name="setting:${esc(field.key)}" ${value === true ? 'checked' : ''}>${esc(field.label)}</label>${hint}`;
  if (field.type === 'select') return `<label>${esc(field.label)}<select name="setting:${esc(field.key)}" ${field.required ? 'required' : ''}><option value="">Elige una opción</option>${field.options.map(option => `<option value="${esc(option.value)}" ${value === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>${hint}`;
  return `<label>${esc(field.label)}<input name="setting:${esc(field.key)}" value="${esc(typeof value === 'string' ? value : '')}" placeholder="${esc(field.placeholder ?? '')}" ${field.pattern ? `pattern="${esc(field.pattern)}"` : ''} ${field.required ? 'required' : ''} spellcheck="false" autocomplete="off" maxlength="200"></label>${hint}`;
}

export function extensionDetail(view: ExtensionView, base: string) {
  const secrets = view.secrets.map(secret => `<label>${esc(secret.label)}<input type="password" name="secret:${esc(secret.key)}" placeholder="${secret.configured ? 'Escribe para reemplazar' : ''}" autocomplete="off" spellcheck="false"></label>${secret.configured ? '<small class="business-help">Configurado ✓</small>' : ''}${secret.help ? `<small class="business-help">${esc(secret.help)}</small>` : ''}`).join('');
  const skipped = view.feed?.skipped;
  const feed = view.feed ? `<section class="integration-feed"><h3>Dirección de tu catálogo</h3><div class="integration-feed-url"><input readonly value="${esc(view.feed.url)}" aria-label="Dirección de tu catálogo"><button type="button" data-copy-feed="${esc(view.feed.url)}">Copiar</button></div><ol>${view.feed.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>${skipped?.noPhoto ? `<p class="business-help">${plural(skipped.noPhoto, 'producto sin foto no aparece', 'productos sin foto no aparecen')} en el catálogo.</p>` : ''}${skipped?.noPrice ? `<p class="business-help">${plural(skipped.noPrice, 'producto sin precio no aparece', 'productos sin precio no aparecen')} en el catálogo.</p>` : ''}</section>` : '';
  const error = view.lastError ? `<p class="integration-report is-error" role="alert">${esc(view.lastError)}</p>` : '';
  const primary = view.installed ? 'Guardar' : view.fields.length || view.secrets.length ? 'Guardar y activar' : 'Activar';
  const actions = `<div class="business-actions"><button class="business-primary" type="submit">${primary}</button>${view.installed ? `<button type="button" data-toggle-extension>${view.enabled ? 'Pausar' : 'Reanudar'}</button><button type="button" data-remove-extension>Quitar</button>` : ''}</div>`;
  return `<section class="business-edit integration-detail" aria-label="${esc(view.name)}"><header>${logo(view.logo, view.name, base)}<div><h2>${esc(view.name)}</h2><p>${badgeHtml(view)}</p></div><button type="button" data-close-integration aria-label="Cerrar detalles">Cerrar</button></header><p>${esc(view.description)}</p>${error}<form class="integration-connect" data-extension-form>${view.fields.map(field => fieldHtml(view, field)).join('')}${secrets}${actions}</form>${feed}${view.docsUrl ? `<div class="business-actions"><a class="integration-link" href="${esc(view.docsUrl)}" target="_blank" rel="noopener noreferrer">Ver guía oficial ↗</a></div>` : ''}</section>`;
}

export function readExtensionForm(form: HTMLFormElement, view: ExtensionView) {
  const settings: Record<string, string | boolean> = {}, secrets: Record<string, string> = {};
  for (const field of view.fields) {
    const input = form.elements.namedItem(`setting:${field.key}`) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) continue;
    if (field.type === 'toggle') settings[field.key] = (input as HTMLInputElement).checked;
    else if (input.value.trim()) settings[field.key] = input.value.trim();
  }
  for (const secret of view.secrets) {
    const input = form.elements.namedItem(`secret:${secret.key}`) as HTMLInputElement | null;
    if (input) secrets[secret.key] = input.value.trim();
  }
  return { settings, secrets };
}
```

- [ ] **Step 5: Run** — panel tests → PASS.

- [ ] **Step 6: Rewire the page** in `source-business-workspace.ts`, `kind === 'integrations'` block:
  1. Import `{ extensionCard, extensionDetail, guideCard, readExtensionForm }` from `./extensions-panel` and the `ExtensionView` type from `./api`. Remove the `externalIntegrations` import.
  2. In the initial `Promise.all`, replace `api.listStores().catch(() => [] as MerchantStore[])` with `api.extensions(storeId)`, bind it as `let extensionData`, and delete the `storeRow`/`analytics` lines and every use of `analytics`, `AnalyticsField`, `field`, `placeholder`, `where` in this block.
  3. Delete `...externalIntegrations.map(…)` from `catalog`. The pagosYa entries stay unchanged. Remove `field`, `placeholder`, `where`, `url`, `guide`, `setup`, `logo` from the local `Integration` type if nothing still uses them.
  4. Add `let selectedExtension: string | undefined;`. In `drawIntegrations()`:
     - filter extensions with the same rules as `catalog`: `category` compares to `categoryLabel`, "Configuradas" means `installed && configured`, search matches `name` + `summary`; filter guides the same way (never "Configuradas");
     - render, in order: the detail (`extensionDetail(current, import.meta.env.BASE_URL)` when `selectedExtension` is set, else the existing `selectedIntegration` detail), the tools row, the status line, then `<h2 class="integration-section">Extensiones</h2><div class="integrations-grid">…extension cards…</div><h2 class="integration-section">Funciones de pagosYa</h2><div class="integrations-grid">…existing catalog cards…</div><h2 class="integration-section">Guías</h2><div class="integrations-grid">…guide cards…</div>`, then `inventorySection()`. Omit a heading whose list is empty after filtering; keep the existing "No hay integraciones para este filtro." when all three are empty;
     - the category `<select>` lists the union of extension `categoryLabel`s, guide `categoryLabel`s and `catalog` categories.
  5. Replace the whole `[data-analytics-form]` handler with:

```ts
                const extensionForm = app.querySelector<HTMLFormElement>('[data-extension-form]');
                const current = extensionData.extensions.find(item => item.id === selectedExtension);
                if (extensionForm && current) {
                    const replace = (next: ExtensionView) => { extensionData.extensions = extensionData.extensions.map(item => item.id === next.id ? next : item); };
                    extensionForm.addEventListener('submit', event => { event.preventDefault(); void run(async () => { replace(await api.saveExtension(storeId, current.id, readExtensionForm(extensionForm, current))); message = 'Guardado. Se aplica en tu tienda publicada.'; }, drawIntegrations); });
                    app.querySelector('[data-toggle-extension]')?.addEventListener('click', () => void run(async () => { replace(await api.toggleExtension(storeId, current.id, !current.enabled)); }, drawIntegrations));
                    app.querySelector('[data-remove-extension]')?.addEventListener('click', () => void run(async () => { await api.removeExtension(storeId, current.id); extensionData = await api.extensions(storeId); selectedExtension = undefined; message = `Quitamos ${current.name}.`; }, drawIntegrations));
                    app.querySelector<HTMLButtonElement>('[data-copy-feed]')?.addEventListener('click', event => { void navigator.clipboard?.writeText((event.currentTarget as HTMLButtonElement).dataset.copyFeed || ''); message = 'Dirección copiada.'; drawIntegrations(); });
                }
                app.querySelectorAll<HTMLButtonElement>('[data-open-extension]').forEach(button => button.addEventListener('click', () => { selectedExtension = button.dataset.openExtension; selectedIntegration = undefined; drawIntegrations(); }));
```

     `run`, `message` and `drawIntegrations` are the helpers this block already uses; if `run`'s signature differs, follow the shape of the removed analytics handler (`void run(async () => { … }, drawIntegrations)`). Make the existing `[data-close-integration]` handler also set `selectedExtension = undefined`, and make `[data-open-integration]` clear `selectedExtension`.
  6. Change the page heading's `<p>` to `Extensiones, funciones de pagosYa y guías para hacer crecer tu tienda.`
  7. Delete `src/integration-catalog.ts`. Remove `saveAnalyticsId` and `AnalyticsField` from `api.ts` if `grep -rn "AnalyticsField\|saveAnalyticsId" apps/merchant-studio/src` finds no other use; leave the `analytics*` fields on `MerchantStore` (the API still returns the columns).

- [ ] **Step 7: Styles** — in the stylesheet that defines `.integration-card`, add (swap the color variables for the ones that file already uses):

```css
.integration-section { margin: 20px 0 8px; font-size: 13px; letter-spacing: .02em; text-transform: uppercase; color: var(--muted, #667085); }
.integration-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.business-badge.is-pro { background: color-mix(in srgb, #7c3aed 14%, transparent); color: #6d28d9; }
.business-badge.is-error { background: color-mix(in srgb, #dc2626 14%, transparent); color: #b91c1c; }
.integration-feed { display: grid; gap: 8px; }
.integration-feed-url { display: flex; gap: 8px; }
.integration-feed-url input { flex: 1; min-width: 0; font-family: inherit; }
```

- [ ] **Step 8: Run Studio tests and typecheck** — `npx vitest run src && npx tsc -p tsconfig.json --noEmit` → PASS. If `source-business-workspace.test.ts` fakes the API for the integrations view, give the fake `extensions: async () => ({ extensions: [], guides: [] })` and replace assertions about `externalIntegrations`/`saveAnalyticsId` with the extensions flow.

- [ ] **Step 9: Rebuild the Studio the dashboard serves** — `cd apps/merchant-dashboard && pnpm run build:studio` → completes; `git status` shows changes under `apps/merchant-dashboard/public/studio`.

- [ ] **Step 10: Commit** — `git add apps/merchant-studio apps/merchant-dashboard/public/studio && git commit -m "feat(studio): Integraciones lists extensions, pagosYa features and guides; each extension's form comes from its manifest, secrets never shown, feeds show their address"`

---

### Task 13: Whole-branch verification

**Files:** none.

- [ ] **Step 1: API unit suites** — `cd apps/api && npx jest src/extensions src/store-seo src/stores src/shipping src/payment-intents src/consumer src/refunds src/store-import` → all PASS.
- [ ] **Step 2: API integration suites** — `npx jest --config jest.integration.config.js src/extensions src/store-import` → all PASS.
- [ ] **Step 3: API typecheck** — `npx tsc --noEmit -p tsconfig.json` → no errors.
- [ ] **Step 4: Checkout** — `cd apps/checkout && npx vitest run && node --test server-test/seo.test.mjs` → all PASS.
- [ ] **Step 5: Studio** — `cd apps/merchant-studio && npx vitest run src && npx tsc -p tsconfig.json --noEmit` → PASS.
- [ ] **Step 6: Lint** — from the repo root: `npx eslint apps/api/src/extensions apps/api/src/store-seo apps/api/src/shipping/carriers apps/checkout/src/checkout/payment-result.ts apps/merchant-studio/src/extensions-panel.ts apps/merchant-studio/src/source-business-workspace.ts` → 0 errors.
- [ ] **Step 7: No database command ran** — the only migration change is `apps/api/prisma/migrations/20260928120000_store_extensions/`; no `prisma migrate|reset|diff|push` was run.
- [ ] **Step 8: Report to the owner** — the migration to apply, `EXTENSIONS_ENCRYPTION_KEY` to set in every environment, and that production gets the migration before this code.
