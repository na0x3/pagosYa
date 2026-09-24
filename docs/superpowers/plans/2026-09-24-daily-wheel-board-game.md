# Ruleta diaria y tablero de Horizonte — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ruleta diaria y un tablero con dado en Horizonte pagosYa entreguen premios reales (XP, créditos de IA, stickers), decididos y guardados por el servidor, con los premios caros más raros y una animación notoria cuando sube el XP.

**Architecture:** Un módulo Nest nuevo, `apps/api/src/rewards`, tiene una política pura (`reward-policy.ts`: pesos, casillas y catálogos), consultas sin estado (`reward-queries.ts`: XP de juegos, saldo y ventas) que también usa `MerchantSessionService` sin crear dependencias circulares entre módulos, y un `RewardsService` que entrega premios dentro de una transacción serializada por comercio con `pg_advisory_xact_lock`. El dashboard (`apps/merchant-dashboard`) pide el premio a la API y solo anima el resultado. Las funciones puras de animación viven en `src/rewards.mjs` y tienen pruebas con `node:test`.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), Jest + supertest (e2e con BD real), JS vanilla en el dashboard, `node:test` + JSDOM, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-daily-wheel-board-game-design.md`

## Global Constraints

- Día y mes se calculan en **hora de Bolivia (UTC−4)**, igual que `boliviaDayStart` en `merchant-session.service.ts`.
- `BOARD_SALES_PER_ROLL = 10`; `BOARD_TILES = 24`; dado uniforme `1..6`.
- `AI_CREDIT_MONTHLY_CAP = 50` créditos por comercio y mes. Pasado el tope, el premio de créditos se entrega como `+200 XP` y se guarda con `convertedFrom = AI_CREDITS`.
- Pesos de la ruleta (suman 100): `STICKER_COMMON 27, XP_25 25, XP_50 14, TIP 13, STICKER_RARE 7, RESPIN 5, XP_200 5, AI_CREDITS_5 3.5, AI_CREDITS_25 0.5`.
- Ventas = `PaymentIntent` con `status SUCCEEDED` y `metadata.storeId = storeId` (la misma consulta que `authoritativeProgressLevel`).
- El navegador **nunca** decide ni guarda premios. Se eliminan las claves de localStorage `pagosya_luck_wheel_*` y `pagosya_luck_album_*`.
- Todos los endpoints nuevos están bajo `v1/dashboard/rewards` con `MerchantSessionGuard`. Una tienda de otro comercio responde **404**.
- Si no hay giro o tiro disponible → **409**. Los premios entregados no se quitan nunca.
- Todo el texto visible está en español (es-BO) y los números se formatean con `toLocaleString("es-BO")`.
- Respetar `prefers-reduced-motion`: sin reflejo, sin latido y sin saltos de a una casilla.
- Estilo del repo: en la API, `src/dashboard` y `src/rewards` usan comillas dobles; `src/storefront-source` y `test/` usan simples. Hay que imitar el archivo que se toca.

## Review Focus

1. **Dos pestañas giran o tiran a la vez** → exactamente un premio y un 409 para el otro. Prueba: Task 4 (ruleta) y Task 5 (tablero), con `Promise.all`.
2. **Cruce de medianoche en Bolivia** (23:59 −04 → 00:01 −04, que en UTC son 03:59 y 04:01) → el giro gratis se vuelve a habilitar a las 00:00 de Bolivia, no a las 00:00 UTC. Prueba: Task 1 (`boliviaDayKey`) y Task 4.
3. **Reembolsos o ventas que dejan de estar `SUCCEEDED` después de tirar** → `rollsAvailable` queda en 0 (no negativo) y no hay un 500. Prueba: Task 5.
4. **Generación de YAPI sin saldo o que no consumió créditos** → no se crea ningún `AiCreditRedemption`, y si el descuento falla la generación termina igual. Prueba: Task 7.
5. **Premio de XP que cruza dos niveles de una vez** (90 → 290 XP con umbrales 100 y 250) → la animación recorre cada nivel y la celebración se dispara por cada uno. Prueba: Task 8 (`xpAnimationSegments`) y Task 9 (`celebrateXpGain`).

---

## Mapa de archivos

**API (`apps/api`)**
- Create `src/rewards/reward-policy.ts`: constantes, pesos, casillas, stickers, consejos, `pickWeighted`, `boliviaDayKey` y `boliviaMonthStart`. Sin dependencias.
- Create `src/rewards/reward-policy.spec.ts`
- Create `src/rewards/reward-queries.ts`: `countStoreSales`, `gameXpForStore`, `aiCreditBalance`, `aiCreditsGrantedSince` y `wheelSpinsToday` (reciben `prisma` o `tx`).
- Create `src/rewards/reward-random.ts`: el token `REWARD_RANDOM` y la implementación con `crypto.randomInt`.
- Create `src/rewards/rewards.service.ts`: `state`, `spinWheel`, `rollBoard`, `redeemForGeneration` y el helper `grant`.
- Create `src/rewards/rewards.controller.ts`, `src/rewards/dto/rewards.dto.ts` y `src/rewards/rewards.module.ts`
- Modify `src/app.module.ts`: registrar `RewardsModule`.
- Modify `src/dashboard/merchant-session.service.ts`: usar `countStoreSales` y `gameXpForStore`; `claimDailyLoginStar` devuelve `wheelAvailable`.
- Modify `src/storefront-source/source-generation.service.ts` y `storefront-source.module.ts`: llamar a `redeemForGeneration`.
- Modify `prisma/schema.prisma` + una migración nueva.
- Create `test/rewards.e2e-spec.ts`

**Dashboard (`apps/merchant-dashboard`)**
- Create `src/rewards.mjs`: `WHEEL_VISUALS`, `wheelRotationFor`, `boardTileCoords`, `boardHopPath`, `xpAnimationSegments`, `rewardCopy` y `celebrateXpGain`.
- Create `src/rewards.test.mjs`
- Modify `src/dashboard.js`: la ruleta pasa al servidor, más el modal, `gameXp` en `gamificationState`, el tablero y las llamadas a `celebrateXpGain`.
- Modify `index.html`: el modal, el anunciador de XP y la nota nueva.
- Modify `src/dashboard.css`: el modal, el tablero y el brillo de las barras.
- Create `tests/rewards.spec.mjs` (Playwright)

---

### Task 1: Política de premios (pura)

**Files:**
- Create: `apps/api/src/rewards/reward-policy.ts`
- Test: `apps/api/src/rewards/reward-policy.spec.ts`

**Interfaces:**
- Produces:
  - `type PrizeKey = "STICKER_COMMON" | "XP_25" | "XP_50" | "TIP" | "STICKER_RARE" | "RESPIN" | "XP_200" | "AI_CREDITS_5" | "AI_CREDITS_25"`
  - `type PrizeKind = "XP" | "AI_CREDITS" | "STICKER" | "TIP" | "RESPIN"`
  - `interface RandomSource { int(maxExclusive: number): number }`
  - `WHEEL_SEGMENTS: readonly { key: PrizeKey; weight: number }[]`. El orden define `segmentIndex`: 0 STICKER_COMMON, 1 XP_25, 2 AI_CREDITS_5, 3 TIP, 4 XP_50, 5 RESPIN, 6 STICKER_RARE, 7 XP_200, 8 AI_CREDITS_25.
  - `BOARD_LAYOUT: readonly PrizeKey[]` (24 elementos)
  - `STICKERS: readonly { id: string; icon: string; name: string; rare: boolean }[]`
  - `TIPS: readonly { id: string; kind: "mission" | "tip"; text: string }[]`
  - `PRIZES: Record<PrizeKey, { kind: PrizeKind; amount: number; rare?: boolean }>`
  - `pickWeighted(random: RandomSource): number`: sortea sobre `random.int(1000)` (los pesos en décimas).
  - `boliviaDayKey(now: Date): string` → `"YYYY-MM-DD"`
  - `boliviaMonthStart(now: Date): Date`
  - `BOARD_TILES = 24`, `BOARD_SALES_PER_ROLL = 10`, `AI_CREDIT_MONTHLY_CAP = 50`, `CAP_FALLBACK_XP = 200` y `WEIGHT_SCALE = 10`

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// apps/api/src/rewards/reward-policy.spec.ts
import { BOARD_LAYOUT, BOARD_TILES, PRIZES, STICKERS, WHEEL_SEGMENTS, WEIGHT_SCALE, boliviaDayKey, boliviaMonthStart, pickWeighted, type RandomSource } from "./reward-policy";

function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return { int: (max) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; } };
}

describe("reward policy", () => {
  it("wheel weights sum to 100", () => {
    expect(WHEEL_SEGMENTS.reduce((sum, s) => sum + s.weight, 0)).toBe(100);
  });

  it("draws each wheel prize within half a point of its weight", () => {
    const random = seeded(42);
    const hits = new Array(WHEEL_SEGMENTS.length).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) hits[pickWeighted(random)]++;
    WHEEL_SEGMENTS.forEach((segment, index) => {
      expect(Math.abs((hits[index] / draws) * 100 - segment.weight)).toBeLessThan(0.5);
    });
  });

  it("maps the extreme rolls onto the first and last segments", () => {
    const total = 100 * WEIGHT_SCALE;
    expect(pickWeighted({ int: () => 0 })).toBe(0);
    expect(pickWeighted({ int: () => total - 1 })).toBe(WHEEL_SEGMENTS.length - 1);
  });

  it("board has 24 tiles with the agreed mix and expensive tiles six apart", () => {
    expect(BOARD_LAYOUT).toHaveLength(BOARD_TILES);
    const count = (key: string) => BOARD_LAYOUT.filter((k) => k === key).length;
    expect({ sc: count("STICKER_COMMON"), x25: count("XP_25"), tip: count("TIP"), x50: count("XP_50"), rare: count("STICKER_RARE"), x200: count("XP_200"), ai5: count("AI_CREDITS_5"), ai25: count("AI_CREDITS_25") })
      .toEqual({ sc: 9, x25: 5, tip: 3, x50: 3, rare: 1, x200: 1, ai5: 1, ai25: 1 });
    const expensive = BOARD_LAYOUT.map((k, i) => (["STICKER_RARE", "XP_200", "AI_CREDITS_5", "AI_CREDITS_25"].includes(k) ? i : -1)).filter((i) => i >= 0);
    expect(expensive).toEqual([3, 9, 15, 21]);
  });

  it("XP and credit prizes carry the agreed amounts", () => {
    expect([PRIZES.XP_25.amount, PRIZES.XP_50.amount, PRIZES.XP_200.amount, PRIZES.AI_CREDITS_5.amount, PRIZES.AI_CREDITS_25.amount]).toEqual([25, 50, 200, 5, 25]);
    expect(STICKERS.filter((s) => s.rare)).toHaveLength(2);
    expect(STICKERS.filter((s) => !s.rare)).toHaveLength(7);
  });

  it("uses the Bolivia calendar day, not UTC", () => {
    expect(boliviaDayKey(new Date("2026-09-25T03:59:00Z"))).toBe("2026-09-24");
    expect(boliviaDayKey(new Date("2026-09-25T04:01:00Z"))).toBe("2026-09-25");
    expect(boliviaMonthStart(new Date("2026-10-01T03:00:00Z")).toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/api && npx jest src/rewards/reward-policy.spec.ts`
Expected: FAIL con "Cannot find module './reward-policy'"

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/rewards/reward-policy.ts
/** Single source of truth for the daily wheel and the Horizonte board. Pure: no Nest, no Prisma. */
export type PrizeKey = "STICKER_COMMON" | "XP_25" | "XP_50" | "TIP" | "STICKER_RARE" | "RESPIN" | "XP_200" | "AI_CREDITS_5" | "AI_CREDITS_25";
export type PrizeKind = "XP" | "AI_CREDITS" | "STICKER" | "TIP" | "RESPIN";
export interface RandomSource { int(maxExclusive: number): number }

export const BOARD_TILES = 24;
export const BOARD_SALES_PER_ROLL = 10;
export const AI_CREDIT_MONTHLY_CAP = 50;
export const CAP_FALLBACK_XP = 200;
/** Weights have one decimal (3.5, 0.5); draws are made over integer tenths. */
export const WEIGHT_SCALE = 10;
const BOLIVIA_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export const PRIZES: Record<PrizeKey, { kind: PrizeKind; amount: number; rare?: boolean }> = {
  STICKER_COMMON: { kind: "STICKER", amount: 0 },
  STICKER_RARE: { kind: "STICKER", amount: 0, rare: true },
  XP_25: { kind: "XP", amount: 25 },
  XP_50: { kind: "XP", amount: 50 },
  XP_200: { kind: "XP", amount: 200 },
  AI_CREDITS_5: { kind: "AI_CREDITS", amount: 5 },
  AI_CREDITS_25: { kind: "AI_CREDITS", amount: 25 },
  TIP: { kind: "TIP", amount: 0 },
  RESPIN: { kind: "RESPIN", amount: 0 },
};

/** Order is the wheel's clockwise slice order; the dashboard draws slices in this same order. */
export const WHEEL_SEGMENTS: readonly { key: PrizeKey; weight: number }[] = [
  { key: "STICKER_COMMON", weight: 27 },
  { key: "XP_25", weight: 25 },
  { key: "AI_CREDITS_5", weight: 3.5 },
  { key: "TIP", weight: 13 },
  { key: "XP_50", weight: 14 },
  { key: "RESPIN", weight: 5 },
  { key: "STICKER_RARE", weight: 7 },
  { key: "XP_200", weight: 5 },
  { key: "AI_CREDITS_25", weight: 0.5 },
];

/** Fixed 24-tile ring. Expensive tiles sit at 3, 9, 15 and 21 — six apart, the widest spacing 24 allows. */
export const BOARD_LAYOUT: readonly PrizeKey[] = [
  "STICKER_COMMON", "XP_25", "STICKER_COMMON", "AI_CREDITS_5", "TIP", "STICKER_COMMON",
  "XP_50", "XP_25", "STICKER_COMMON", "STICKER_RARE", "TIP", "STICKER_COMMON",
  "XP_50", "XP_25", "STICKER_COMMON", "XP_200", "STICKER_COMMON", "TIP",
  "XP_25", "STICKER_COMMON", "XP_50", "AI_CREDITS_25", "XP_25", "STICKER_COMMON",
];

export const STICKERS: readonly { id: string; icon: string; name: string; rare: boolean }[] = [
  { id: "parrot", icon: "🦜", name: "Loro fiestero", rare: false },
  { id: "llama", icon: "🦙", name: "Llama viajera", rare: false },
  { id: "cactus", icon: "🌵", name: "Cactus firme", rare: false },
  { id: "pineapple", icon: "🍍", name: "Piña dulce", rare: false },
  { id: "rainbow", icon: "🌈", name: "Arcoíris", rare: false },
  { id: "trumpet", icon: "🎺", name: "Trompeta de ventas", rare: false },
  { id: "coffee", icon: "☕", name: "Cafecito", rare: false },
  { id: "comet", icon: "🌠", name: "Estrella fugaz", rare: true },
  { id: "crown", icon: "👑", name: "Corona del mercado", rare: true },
];

export const TIPS: readonly { id: string; kind: "mission" | "tip"; text: string }[] = [
  { id: "m-whatsapp", kind: "mission", text: "Comparte el enlace de tu tienda en tu estado de WhatsApp." },
  { id: "m-photo", kind: "mission", text: "Cambia la foto principal de tu producto más visto." },
  { id: "m-inbox", kind: "mission", text: "Responde hoy los mensajes pendientes de tu bandeja." },
  { id: "m-referral", kind: "mission", text: "Pídele a un cliente feliz que recomiende tu tienda." },
  { id: "m-copy", kind: "mission", text: "Escribe una descripción más clara para uno de tus productos." },
  { id: "m-group", kind: "mission", text: "Publica tu tienda en un grupo de tu barrio o ciudad." },
  { id: "t-light", kind: "tip", text: "Las fotos con luz natural y fondo liso suelen vender más." },
  { id: "t-shipping", kind: "tip", text: "Un precio con envío claro evita que el cliente abandone el pago." },
  { id: "t-reply", kind: "tip", text: "Responder rápido un mensaje convierte curiosos en compradores." },
  { id: "t-hero", kind: "tip", text: "Destaca tu producto estrella al inicio de tu tienda." },
  { id: "t-discount", kind: "tip", text: "Un descuento corto, de fin de semana, crea urgencia sin regalar tu margen." },
  { id: "t-story", kind: "tip", text: "Cuenta en una línea qué hace especial a tu negocio: la gente compra historias." },
];

export function pickWeighted(random: RandomSource): number {
  const scaled = WHEEL_SEGMENTS.map((segment) => Math.round(segment.weight * WEIGHT_SCALE));
  let roll = random.int(scaled.reduce((sum, weight) => sum + weight, 0));
  for (let index = 0; index < scaled.length; index++) {
    roll -= scaled[index];
    if (roll < 0) return index;
  }
  return scaled.length - 1;
}

export function boliviaDayKey(now: Date): string {
  return new Date(now.getTime() - BOLIVIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export function boliviaMonthStart(now: Date): Date {
  const local = new Date(now.getTime() - BOLIVIA_UTC_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BOLIVIA_UTC_OFFSET_MS);
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/api && npx jest src/rewards/reward-policy.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rewards/reward-policy.ts apps/api/src/rewards/reward-policy.spec.ts
git commit -m "feat(rewards): prize policy for the daily wheel and Horizonte board"
```

---

### Task 2: Modelo de datos y migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modelos nuevos al final; relaciones inversas en `Merchant`, `MerchantUser` y `Store`)
- Create: `apps/api/prisma/migrations/<timestamp>_daily_rewards/migration.sql` (generado)

**Interfaces:**
- Produces: los delegados de Prisma `rewardGrant`, `dailyWheelSpin`, `boardState` y `aiCreditRedemption`; los enums `RewardSource` y `RewardKind`; la relación `DailyWheelSpin.grant`.

- [ ] **Step 1: Agregar los modelos al final de `schema.prisma`**

```prisma
enum RewardSource {
  WHEEL
  BOARD
}

enum RewardKind {
  XP
  AI_CREDITS
  STICKER
  TIP
  RESPIN
}

// Every prize handed out by the daily wheel or the Horizonte board. The only source
// of game XP and stickers; AI credit grants are the positive side of the reward balance.
model RewardGrant {
  id             String          @id @default(cuid())
  merchantId     String
  merchant       Merchant        @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  storeId        String
  store          Store           @relation(fields: [storeId], references: [id], onDelete: Cascade)
  merchantUserId String
  merchantUser   MerchantUser    @relation(fields: [merchantUserId], references: [id], onDelete: Cascade)
  source         RewardSource
  kind           RewardKind
  amount         Int             @default(0)
  stickerId      String?
  tipId          String?
  convertedFrom  RewardKind?
  createdAt      DateTime        @default(now())
  wheelSpin      DailyWheelSpin?

  @@index([storeId, kind])
  @@index([merchantId, kind, createdAt])
  @@index([merchantUserId, stickerId])
}

// One row per wheel spin. attempt 0 is the free daily spin; 1+ are spins won with RESPIN.
model DailyWheelSpin {
  merchantUserId String
  merchantUser   MerchantUser @relation(fields: [merchantUserId], references: [id], onDelete: Cascade)
  day            String
  attempt        Int
  grantId        String       @unique
  grant          RewardGrant  @relation(fields: [grantId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())

  @@id([merchantUserId, day, attempt])
}

model BoardState {
  storeId       String   @id
  store         Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  merchantId    String
  position      Int      @default(0)
  rollsUsed     Int      @default(0)
  lapsCompleted Int      @default(0)
  updatedAt     DateTime @updatedAt
}

// Negative side of the AI reward-credit balance: credits applied to a finished YAPI generation.
model AiCreditRedemption {
  id           String   @id @default(cuid())
  merchantId   String
  merchant     Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  credits      Int
  generationId String   @unique
  createdAt    DateTime @default(now())

  @@index([merchantId])
}
```

Agregar las relaciones inversas:
- En `model Merchant`: `rewardGrants RewardGrant[]` y `aiCreditRedemptions AiCreditRedemption[]`
- En `model MerchantUser` (junto a `progressCelebrations`): `rewardGrants RewardGrant[]` y `wheelSpins DailyWheelSpin[]`
- En `model Store`: `rewardGrants RewardGrant[]` y `boardState BoardState?`

- [ ] **Step 2: Crear y aplicar la migración, y regenerar el cliente**

Run: `cd apps/api && npx prisma migrate dev --name daily_rewards`
Expected: "Your database is now in sync with your schema" y "Generated Prisma Client"

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(rewards): persist reward grants, wheel spins, board state and AI credit redemptions"
```

---

### Task 3: Consultas, servicio base y `GET /dashboard/rewards`

**Files:**
- Create: `apps/api/src/rewards/reward-queries.ts`, `reward-random.ts`, `rewards.service.ts`, `rewards.controller.ts`, `dto/rewards.dto.ts` y `rewards.module.ts`
- Modify: `apps/api/src/app.module.ts` (agregar `RewardsModule` después de `DashboardModule`)
- Modify: `apps/api/src/dashboard/merchant-session.service.ts` (`authoritativeProgressLevel` usa `countStoreSales`)
- Test: `apps/api/test/rewards.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 y Task 2.
- Produces:
  - `type Db = PrismaService | Prisma.TransactionClient`
  - `countStoreSales(db: Db, merchantId: string, storeId: string): Promise<number>`
  - `gameXpForStore(db: Db, storeId: string): Promise<number>`
  - `aiCreditBalance(db: Db, merchantId: string): Promise<number>`
  - `aiCreditsGrantedSince(db: Db, merchantId: string, since: Date): Promise<number>`
  - `wheelSpinsToday(db: Db, merchantUserId: string, day: string): Promise<{ used: number; allowed: number }>`
  - `REWARD_RANDOM` (símbolo de inyección) y `cryptoRandom: RandomSource`
  - `RewardsService.state(merchantId, merchantUserId, storeId, now?: Date)` → `{ wheel: { available, day, spinsUsed, spinsAllowed, segments: PrizeKey[] }, board: { position, rollsUsed, rollsAvailable, salesUntilNextRoll, lapsCompleted, tiles: PrizeKey[] }, bonusXp, stickers: { id, icon, name, rare, owned }[], aiCreditBalance, aiCreditsThisMonth, aiCreditMonthlyCap }`
  - `RewardsService` (protegidos, para Tasks 4, 5 y 7): `assertStore(merchantId, storeId)`, `lockMerchant(tx, merchantId)`, `grant(tx, ctx: GrantContext, key: PrizeKey, source: RewardSource, now: Date): Promise<GrantView>` y `wheelView(day, spins)`
  - `GrantView = { id; prize: PrizeKey; kind: RewardKind; amount; convertedFrom: RewardKind | null; sticker: { id; icon; name; rare; isNew } | null; tip: { id; kind; text } | null }`
  - `StoreRewardsDto { storeId: string }`

- [ ] **Step 1: Escribir la prueba e2e que falla**

```ts
// apps/api/test/rewards.e2e-spec.ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REWARD_RANDOM } from '../src/rewards/reward-random';

// Scripted randomness: each test pushes the exact values the service will draw, in order.
const draws: number[] = [];
const scriptedRandom = { int: (max: number) => { const next = draws.shift(); if (next === undefined) throw new Error('No scripted draw left'); return next % max; } };

describe('Rewards: daily wheel and Horizonte board', () => {
  let app: INestApplication, prisma: PrismaService, merchantId: string, storeId: string, foreignStoreId: string, session: string, merchantUserId: string;
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${session}` });
  let saleSeq = 0;
  const sell = (count: number, target = storeId) => prisma.paymentIntent.createMany({ data: Array.from({ length: count }, () => ({ merchantId, amount: 1000, clientSecret: `pi_secret_rewards_${++saleSeq}_${Date.now()}`, status: 'SUCCEEDED' as const, metadata: { storeId: target } })) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(REWARD_RANDOM).useValue(scriptedRandom).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    const owner = await http().post('/v1/merchants').send({ name: 'Rewards Owner', email: 'rewards-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201);
    merchantId = owner.body.merchant.id;
    storeId = (await http().post('/v1/stores').set({ Authorization: `Bearer ${owner.body.testKeys.secretKey}` }).send({ name: 'Rewards Store' }).expect(201)).body.id;
    const other = await http().post('/v1/merchants').send({ name: 'Rewards Other', email: 'rewards-other@test.example', settlementMode: 'AGGREGATOR' }).expect(201);
    foreignStoreId = (await http().post('/v1/stores').set({ Authorization: `Bearer ${other.body.testKeys.secretKey}` }).send({ name: 'Foreign Store' }).expect(201)).body.id;
    const password = 'Correct-password-2026!';
    merchantUserId = (await prisma.merchantUser.create({ data: { merchantId, email: 'rewards-owner-user@test.example', hashedPassword: await argon2.hash(password), emailVerifiedAt: new Date() } })).id;
    session = (await http().post('/v1/dashboard/login').send({ email: 'rewards-owner-user@test.example', password }).expect(201)).body.token;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => {
    draws.length = 0;
    await prisma.aiCreditRedemption.deleteMany({ where: { merchantId } });
    await prisma.dailyWheelSpin.deleteMany({ where: { merchantUserId } });
    await prisma.rewardGrant.deleteMany({ where: { merchantId } });
    await prisma.boardState.deleteMany({ where: { storeId } });
    await prisma.paymentIntent.deleteMany({ where: { merchantId } });
  });

  it("reports a fresh state and hides other merchants' stores", async () => {
    const state = (await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body;
    expect(state).toMatchObject({ wheel: { available: true, spinsUsed: 0, spinsAllowed: 1 }, board: { position: 0, rollsAvailable: 0, salesUntilNextRoll: 10 }, bonusXp: 0, aiCreditBalance: 0, aiCreditMonthlyCap: 50 });
    expect(state.wheel.segments).toHaveLength(9);
    expect(state.board.tiles).toHaveLength(24);
    expect(state.stickers).toHaveLength(9);
    await http().get(`/v1/dashboard/rewards?storeId=${foreignStoreId}`).set(auth()).expect(404);
    await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).expect(401);
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts`
Expected: FAIL con "Cannot find module '../src/rewards/reward-random'"

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/rewards/reward-random.ts
import { randomInt } from "node:crypto";
import type { RandomSource } from "./reward-policy";

export const REWARD_RANDOM = Symbol("REWARD_RANDOM");
export const cryptoRandom: RandomSource = { int: (maxExclusive) => randomInt(maxExclusive) };
```

```ts
// apps/api/src/rewards/reward-queries.ts
import { PaymentIntentStatus, Prisma, RewardKind } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/** Stateless reads shared by RewardsService and MerchantSessionService (which cannot depend on RewardsModule). */
export type Db = PrismaService | Prisma.TransactionClient;

export function countStoreSales(db: Db, merchantId: string, storeId: string) {
  return db.paymentIntent.count({ where: { merchantId, status: PaymentIntentStatus.SUCCEEDED, metadata: { path: ["storeId"], equals: storeId } } });
}

export async function gameXpForStore(db: Db, storeId: string) {
  const sum = await db.rewardGrant.aggregate({ where: { storeId, kind: RewardKind.XP }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

export async function aiCreditsGrantedSince(db: Db, merchantId: string, since: Date) {
  const sum = await db.rewardGrant.aggregate({ where: { merchantId, kind: RewardKind.AI_CREDITS, createdAt: { gte: since } }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

export async function aiCreditBalance(db: Db, merchantId: string) {
  const granted = await db.rewardGrant.aggregate({ where: { merchantId, kind: RewardKind.AI_CREDITS }, _sum: { amount: true } });
  const redeemed = await db.aiCreditRedemption.aggregate({ where: { merchantId }, _sum: { credits: true } });
  return (granted._sum.amount ?? 0) - (redeemed._sum.credits ?? 0);
}

/** One free spin per Bolivia day, plus one per RESPIN won that day. */
export async function wheelSpinsToday(db: Db, merchantUserId: string, day: string) {
  const spins = await db.dailyWheelSpin.findMany({ where: { merchantUserId, day }, select: { grant: { select: { kind: true } } } });
  const respins = spins.filter((spin) => spin.grant.kind === RewardKind.RESPIN).length;
  return { used: spins.length, allowed: 1 + respins };
}
```

```ts
// apps/api/src/rewards/dto/rewards.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class StoreRewardsDto {
  @ApiProperty()
  @IsString()
  storeId!: string;
}
```

```ts
// apps/api/src/rewards/rewards.service.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RewardKind, RewardSource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AI_CREDIT_MONTHLY_CAP, BOARD_LAYOUT, BOARD_SALES_PER_ROLL, CAP_FALLBACK_XP, PRIZES, STICKERS, TIPS, WHEEL_SEGMENTS, boliviaDayKey, boliviaMonthStart, type PrizeKey, type RandomSource } from "./reward-policy";
import { aiCreditBalance, aiCreditsGrantedSince, countStoreSales, gameXpForStore, wheelSpinsToday, type Db } from "./reward-queries";
import { REWARD_RANDOM } from "./reward-random";

export interface GrantContext { merchantId: string; merchantUserId: string; storeId: string }
export interface GrantView {
  id: string;
  prize: PrizeKey;
  kind: RewardKind;
  amount: number;
  convertedFrom: RewardKind | null;
  sticker: { id: string; icon: string; name: string; rare: boolean; isNew: boolean } | null;
  tip: { id: string; kind: "mission" | "tip"; text: string } | null;
}

/** Draws, stores and reports prizes. The dashboard only ever animates what this returns. */
@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService, @Inject(REWARD_RANDOM) private readonly random: RandomSource) {}

  async state(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const day = boliviaDayKey(now);
    const [spins, board, sales, bonusXp, owned, balance, thisMonth] = await Promise.all([
      wheelSpinsToday(this.prisma, merchantUserId, day),
      this.prisma.boardState.findUnique({ where: { storeId } }),
      countStoreSales(this.prisma, merchantId, storeId),
      gameXpForStore(this.prisma, storeId),
      this.ownedStickers(this.prisma, merchantUserId),
      aiCreditBalance(this.prisma, merchantId),
      aiCreditsGrantedSince(this.prisma, merchantId, boliviaMonthStart(now)),
    ]);
    const rollsUsed = board?.rollsUsed ?? 0;
    return {
      wheel: this.wheelView(day, spins),
      board: {
        position: board?.position ?? 0,
        rollsUsed,
        rollsAvailable: Math.max(0, Math.floor(sales / BOARD_SALES_PER_ROLL) - rollsUsed),
        salesUntilNextRoll: BOARD_SALES_PER_ROLL - (sales % BOARD_SALES_PER_ROLL),
        lapsCompleted: board?.lapsCompleted ?? 0,
        tiles: [...BOARD_LAYOUT],
      },
      bonusXp,
      stickers: STICKERS.map((sticker) => ({ ...sticker, owned: owned.has(sticker.id) })),
      aiCreditBalance: balance,
      aiCreditsThisMonth: thisMonth,
      aiCreditMonthlyCap: AI_CREDIT_MONTHLY_CAP,
    };
  }

  protected wheelView(day: string, spins: { used: number; allowed: number }) {
    return { available: spins.used < spins.allowed, day, spinsUsed: spins.used, spinsAllowed: spins.allowed, segments: WHEEL_SEGMENTS.map((segment) => segment.key) };
  }

  protected async assertStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
  }

  /** Serialises every grant for one merchant so the monthly credit cap, "new sticker first" and roll counts hold under concurrency. */
  protected async lockMerchant(tx: Prisma.TransactionClient, merchantId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${merchantId}))::text`;
  }

  private async ownedStickers(db: Db, merchantUserId: string) {
    const rows = await db.rewardGrant.findMany({ where: { merchantUserId, kind: RewardKind.STICKER }, distinct: ["stickerId"], select: { stickerId: true } });
    return new Set(rows.map((row) => row.stickerId).filter((id): id is string => !!id));
  }

  protected async grant(tx: Prisma.TransactionClient, ctx: GrantContext, key: PrizeKey, source: RewardSource, now: Date): Promise<GrantView> {
    const prize = PRIZES[key];
    let kind = prize.kind as RewardKind;
    let amount = prize.amount;
    let convertedFrom: RewardKind | null = null;
    let sticker: GrantView["sticker"] = null;
    let tip: GrantView["tip"] = null;

    if (kind === RewardKind.AI_CREDITS) {
      const granted = await aiCreditsGrantedSince(tx, ctx.merchantId, boliviaMonthStart(now));
      if (granted + amount > AI_CREDIT_MONTHLY_CAP) { convertedFrom = RewardKind.AI_CREDITS; kind = RewardKind.XP; amount = CAP_FALLBACK_XP; }
    }
    if (kind === RewardKind.STICKER) {
      const owned = await this.ownedStickers(tx, ctx.merchantUserId);
      const pool = STICKERS.filter((candidate) => candidate.rare === !!prize.rare);
      const fresh = pool.filter((candidate) => !owned.has(candidate.id));
      const choices = fresh.length ? fresh : pool;
      const chosen = choices[this.random.int(choices.length)];
      sticker = { ...chosen, isNew: !owned.has(chosen.id) };
    }
    if (kind === RewardKind.TIP) tip = TIPS[this.random.int(TIPS.length)];

    const row = await tx.rewardGrant.create({ data: { ...ctx, source, kind, amount, convertedFrom, stickerId: sticker?.id ?? null, tipId: tip?.id ?? null, createdAt: now } });
    return { id: row.id, prize: key, kind, amount, convertedFrom, sticker, tip };
  }
}
```

```ts
// apps/api/src/rewards/rewards.controller.ts
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { StoreRewardsDto } from "./dto/rewards.dto";
import { RewardsService } from "./rewards.service";

type SessionRequest = { merchant: { id: string }; merchantUser: { id: string } };

@Controller("v1/dashboard/rewards")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  state(@Req() req: SessionRequest, @Query() dto: StoreRewardsDto) {
    return this.rewards.state(req.merchant.id, req.merchantUser.id, dto.storeId);
  }
}
```

```ts
// apps/api/src/rewards/rewards.module.ts
import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { RewardsController } from "./rewards.controller";
import { RewardsService } from "./rewards.service";
import { REWARD_RANDOM, cryptoRandom } from "./reward-random";

@Module({
  imports: [DashboardModule],
  controllers: [RewardsController],
  providers: [RewardsService, { provide: REWARD_RANDOM, useValue: cryptoRandom }],
  exports: [RewardsService],
})
export class RewardsModule {}
```

En `apps/api/src/app.module.ts`, agregar `import { RewardsModule } from "./rewards/rewards.module";` y poner `RewardsModule,` justo después de `DashboardModule,` en `imports`.

En `apps/api/src/dashboard/merchant-session.service.ts`, agregar `import { countStoreSales } from "../rewards/reward-queries";` y, dentro de `authoritativeProgressLevel`, reemplazar el bloque `const paymentCount = await this.prisma.paymentIntent.count({ ... });` por:

```ts
    const paymentCount = await countStoreSales(this.prisma, merchantId, storeId);
```

Después, quitar `PaymentIntentStatus` del import de `@prisma/client` solo si `grep -n PaymentIntentStatus apps/api/src/dashboard/merchant-session.service.ts` ya no encuentra otro uso.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts && npx jest src/dashboard/merchant-session.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rewards apps/api/src/app.module.ts apps/api/src/dashboard/merchant-session.service.ts apps/api/test/rewards.e2e-spec.ts
git commit -m "feat(rewards): rewards state endpoint with shared sales and XP queries"
```

---

### Task 4: Girar la ruleta y `wheelAvailable` en el ingreso diario

**Files:**
- Modify: `apps/api/src/rewards/rewards.service.ts` (agregar `spinWheel`)
- Modify: `apps/api/src/rewards/rewards.controller.ts` (agregar `POST wheel/spin`)
- Modify: `apps/api/src/dashboard/merchant-session.service.ts` (`claimDailyLoginStar` agrega `wheelAvailable`)
- Test: `apps/api/test/rewards.e2e-spec.ts`

**Interfaces:**
- Consumes: `grant`, `lockMerchant`, `assertStore`, `wheelView` y `wheelSpinsToday` (Task 3); `pickWeighted` (Task 1).
- Produces:
  - `RewardsService.spinWheel(merchantId, merchantUserId, storeId, now?: Date): Promise<{ segmentIndex: number; grant: GrantView; wheel: ReturnType<wheelView> }>`
  - `POST /v1/dashboard/rewards/wheel/spin` con body `{ storeId }` → 201, o 409 `"Ya usaste tu giro de hoy."`
  - `POST /v1/dashboard/daily-login-reward` ahora incluye `wheelAvailable: boolean`.

- [ ] **Step 1: Agregar las pruebas que fallan**

Agregar `import { RewardsService } from '../src/rewards/rewards.service';` al principio y esto dentro del `describe`:

```ts
  // pickWeighted draws int(1000). Ranges by segment: STICKER_COMMON 0-269, XP_25 270-519, AI_CREDITS_5 520-554,
  // TIP 555-684, XP_50 685-824, RESPIN 825-874, STICKER_RARE 875-944, XP_200 945-994, AI_CREDITS_25 995-999.
  const WHEEL_DRAW = { STICKER_COMMON: 0, XP_25: 270, AI_CREDITS_5: 520, TIP: 555, XP_50: 685, RESPIN: 825, STICKER_RARE: 875, XP_200: 945, AI_CREDITS_25: 995 } as const;
  const spin = () => http().post('/v1/dashboard/rewards/wheel/spin').set(auth()).send({ storeId });

  it('grants one free spin per Bolivia day and rejects the second', async () => {
    draws.push(WHEEL_DRAW.XP_50);
    const first = (await spin().expect(201)).body;
    expect(first).toMatchObject({ segmentIndex: 4, grant: { prize: 'XP_50', kind: 'XP', amount: 50 }, wheel: { available: false, spinsUsed: 1 } });
    await spin().expect(409);
    expect((await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body.bonusXp).toBe(50);
  });

  it('lets a RESPIN prize unlock exactly one more spin the same day', async () => {
    draws.push(WHEEL_DRAW.RESPIN);
    expect((await spin().expect(201)).body.wheel).toMatchObject({ available: true, spinsUsed: 1, spinsAllowed: 2 });
    draws.push(WHEEL_DRAW.XP_25);
    expect((await spin().expect(201)).body.wheel).toMatchObject({ available: false, spinsUsed: 2 });
    await spin().expect(409);
  });

  it('gives exactly one prize when two tabs spin at once', async () => {
    draws.push(WHEEL_DRAW.XP_25, WHEEL_DRAW.XP_25);
    const statuses = (await Promise.all([spin(), spin()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.rewardGrant.count({ where: { merchantId } })).toBe(1);
  });

  it('hands out a sticker the merchant does not own before repeating one', async () => {
    await prisma.rewardGrant.createMany({ data: ['parrot', 'llama', 'cactus', 'pineapple', 'rainbow', 'trumpet'].map((stickerId) => ({ merchantId, storeId, merchantUserId, source: 'WHEEL' as const, kind: 'STICKER' as const, stickerId })) });
    draws.push(WHEEL_DRAW.STICKER_COMMON, 0);
    expect((await spin().expect(201)).body.grant.sticker).toMatchObject({ id: 'coffee', isNew: true });
  });

  it('converts AI credits to 200 XP once the monthly cap is reached', async () => {
    await prisma.rewardGrant.create({ data: { merchantId, storeId, merchantUserId, source: 'BOARD', kind: 'AI_CREDITS', amount: 48 } });
    draws.push(WHEEL_DRAW.AI_CREDITS_5);
    expect((await spin().expect(201)).body.grant).toMatchObject({ prize: 'AI_CREDITS_5', kind: 'XP', amount: 200, convertedFrom: 'AI_CREDITS' });
  });

  it('tells the dashboard whether to open the wheel after the daily login', async () => {
    expect((await http().post('/v1/dashboard/daily-login-reward').set(auth()).expect(201)).body.wheelAvailable).toBe(true);
    draws.push(WHEEL_DRAW.XP_25);
    await spin().expect(201);
    expect((await http().post('/v1/dashboard/daily-login-reward').set(auth()).expect(201)).body.wheelAvailable).toBe(false);
  });

  it('re-opens the free spin at 00:00 Bolivia, not 00:00 UTC', async () => {
    const service = app.get(RewardsService);
    draws.push(WHEEL_DRAW.XP_25);
    await service.spinWheel(merchantId, merchantUserId, storeId, new Date('2026-09-25T03:59:00Z'));
    expect((await service.state(merchantId, merchantUserId, storeId, new Date('2026-09-25T03:59:30Z'))).wheel.available).toBe(false);
    expect((await service.state(merchantId, merchantUserId, storeId, new Date('2026-09-25T04:00:30Z'))).wheel.available).toBe(true);
  });
```

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts`
Expected: FAIL (404 en `/wheel/spin` y `wheelAvailable` es undefined)

- [ ] **Step 3: Implementar**

En `rewards.service.ts`, agregar `ConflictException` al import de `@nestjs/common`, agregar `pickWeighted` al import de `./reward-policy` y agregar este método:

```ts
  async spinWheel(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const day = boliviaDayKey(now);
    const alreadySpun = () => new ConflictException("Ya usaste tu giro de hoy.");
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockMerchant(tx, merchantId);
      const spins = await wheelSpinsToday(tx, merchantUserId, day);
      if (spins.used >= spins.allowed) throw alreadySpun();
      const segmentIndex = pickWeighted(this.random);
      const grant = await this.grant(tx, { merchantId, merchantUserId, storeId }, WHEEL_SEGMENTS[segmentIndex].key, RewardSource.WHEEL, now);
      await tx.dailyWheelSpin.create({ data: { merchantUserId, day, attempt: spins.used, grantId: grant.id } });
      return { segmentIndex, grant };
    }).catch((error: unknown) => {
      // The (merchantUserId, day, attempt) key is the last line of defence behind the merchant lock.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw alreadySpun();
      throw error;
    });
    return { ...result, wheel: this.wheelView(day, await wheelSpinsToday(this.prisma, merchantUserId, day)) };
  }
```

En `rewards.controller.ts`, agregar `Body` y `Post` a los imports de `@nestjs/common` y este método:

```ts
  @Post("wheel/spin")
  spinWheel(@Req() req: SessionRequest, @Body() dto: StoreRewardsDto) {
    return this.rewards.spinWheel(req.merchant.id, req.merchantUser.id, dto.storeId);
  }
```

En `merchant-session.service.ts`, agregar `wheelSpinsToday` al import de `../rewards/reward-queries` y agregar `import { boliviaDayKey } from "../rewards/reward-policy";`. En `claimDailyLoginStar`, justo antes del `return` dentro de la transacción, agregar:

```ts
      const spins = await wheelSpinsToday(tx, merchantUserId, boliviaDayKey(now));
```

Y en el objeto que devuelve, agregar `wheelAvailable: spins.used < spins.allowed,`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts && npx jest src/dashboard/merchant-session.service.spec.ts`
Expected: PASS. Si la prueba unitaria de `claimDailyLoginStar` usa un `tx` mockeado sin `dailyWheelSpin`, agregarle `dailyWheelSpin: { findMany: jest.fn().mockResolvedValue([]) }` y afirmar `wheelAvailable: true` en su resultado.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rewards apps/api/src/dashboard apps/api/test/rewards.e2e-spec.ts
git commit -m "feat(rewards): server-drawn daily wheel spin with respins and monthly credit cap"
```

---

### Task 5: Tirar el dado del tablero

**Files:**
- Modify: `apps/api/src/rewards/rewards.service.ts` (agregar `rollBoard`)
- Modify: `apps/api/src/rewards/rewards.controller.ts` (agregar `POST board/roll`)
- Test: `apps/api/test/rewards.e2e-spec.ts`

**Interfaces:**
- Consumes: `grant`, `lockMerchant`, `assertStore`, `state` y `countStoreSales`.
- Produces:
  - `RewardsService.rollBoard(merchantId, merchantUserId, storeId, now?: Date): Promise<{ die: number; from: number; to: number; lapCompleted: boolean; grant: GrantView; board: <state().board> }>`
  - `POST /v1/dashboard/rewards/board/roll` con body `{ storeId }` → 201, o 409 `"Todavía no tienes tiros. Cada 10 ventas ganas uno."`

- [ ] **Step 1: Agregar las pruebas que fallan**

Primero, confirmar un estado de `PaymentIntentStatus` distinto de `SUCCEEDED` con `grep -n "enum PaymentIntentStatus" -A12 apps/api/prisma/schema.prisma` y usarlo donde dice `'CANCELED'`.

```ts
  const roll = () => http().post('/v1/dashboard/rewards/board/roll').set(auth()).send({ storeId });
  const boardState = async () => (await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body.board;

  it('earns one roll per 10 successful sales of this store only', async () => {
    await sell(9); await sell(30, foreignStoreId);
    expect(await boardState()).toMatchObject({ rollsAvailable: 0, salesUntilNextRoll: 1 });
    await roll().expect(409);
    await sell(1);
    expect(await boardState()).toMatchObject({ rollsAvailable: 1, salesUntilNextRoll: 10 });
  });

  it('moves by the die and grants the landing tile, wrapping into a new lap', async () => {
    await sell(20);
    draws.push(2); // die = 3 → tile 3 = AI_CREDITS_5
    expect((await roll().expect(201)).body).toMatchObject({ die: 3, from: 0, to: 3, lapCompleted: false, grant: { prize: 'AI_CREDITS_5', kind: 'AI_CREDITS', amount: 5 }, board: { position: 3, rollsAvailable: 1 } });
    await prisma.boardState.update({ where: { storeId }, data: { position: 22 } });
    draws.push(3, 0); // die = 4 → (22 + 4) % 24 = 2 = STICKER_COMMON; the second draw picks the sticker
    expect((await roll().expect(201)).body).toMatchObject({ die: 4, from: 22, to: 2, lapCompleted: true, board: { lapsCompleted: 1, rollsAvailable: 0 } });
    expect((await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body.aiCreditBalance).toBe(5);
  });

  it('allows exactly one of two concurrent rolls when only one is available', async () => {
    await sell(10);
    draws.push(0, 0, 0, 0);
    const statuses = (await Promise.all([roll(), roll()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect((await prisma.boardState.findUniqueOrThrow({ where: { storeId } })).rollsUsed).toBe(1);
  });

  it('never reports negative rolls after sales stop counting', async () => {
    await sell(10);
    draws.push(0);
    await roll().expect(201);
    await prisma.paymentIntent.updateMany({ where: { merchantId }, data: { status: 'CANCELED' } });
    expect((await boardState()).rollsAvailable).toBe(0);
    await roll().expect(409);
  });
```

La venta extra en `foreignStoreId` usa el `merchantId` del dueño a propósito: prueba que se filtra por `metadata.storeId` y no solo por comercio.

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts -t "roll"`
Expected: FAIL con 404 en `/board/roll`

- [ ] **Step 3: Implementar**

En `rewards.service.ts`, agregar `BOARD_TILES` al import de la política y este método:

```ts
  async rollBoard(merchantId: string, merchantUserId: string, storeId: string, now = new Date()) {
    await this.assertStore(merchantId, storeId);
    const noRolls = () => new ConflictException("Todavía no tienes tiros. Cada 10 ventas ganas uno.");
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockMerchant(tx, merchantId);
      const board = await tx.boardState.upsert({ where: { storeId }, create: { storeId, merchantId }, update: {} });
      const sales = await countStoreSales(tx, merchantId, storeId);
      if (Math.floor(sales / BOARD_SALES_PER_ROLL) - board.rollsUsed <= 0) throw noRolls();
      const die = this.random.int(6) + 1;
      const from = board.position;
      const lapCompleted = from + die >= BOARD_TILES;
      const to = (from + die) % BOARD_TILES;
      const moved = await tx.boardState.updateMany({
        where: { storeId, rollsUsed: board.rollsUsed },
        data: { position: to, rollsUsed: { increment: 1 }, ...(lapCompleted ? { lapsCompleted: { increment: 1 } } : {}) },
      });
      if (moved.count !== 1) throw noRolls();
      const grant = await this.grant(tx, { merchantId, merchantUserId, storeId }, BOARD_LAYOUT[to], RewardSource.BOARD, now);
      return { die, from, to, lapCompleted, grant };
    });
    const { board } = await this.state(merchantId, merchantUserId, storeId, now);
    return { ...result, board };
  }
```

En `rewards.controller.ts`:

```ts
  @Post("board/roll")
  rollBoard(@Req() req: SessionRequest, @Body() dto: StoreRewardsDto) {
    return this.rewards.rollBoard(req.merchant.id, req.merchantUser.id, dto.storeId);
  }
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts`
Expected: PASS (todas)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rewards apps/api/test/rewards.e2e-spec.ts
git commit -m "feat(rewards): Horizonte board rolls earned every 10 sales"
```

---

### Task 6: El XP de juegos cuenta para el nivel del servidor

**Files:**
- Modify: `apps/api/src/dashboard/merchant-session.service.ts` (`authoritativeProgressLevel`)
- Test: `apps/api/test/rewards.e2e-spec.ts`

**Interfaces:**
- Consumes: `gameXpForStore` (Task 3).
- Produces: `POST /v1/dashboard/progress-celebrations` ahora cuenta el XP de juegos en `currentLevel`.

- [ ] **Step 1: Agregar la prueba que falla**

```ts
  it('counts game XP toward the server-side companion level', async () => {
    const level = async () => (await http().post('/v1/dashboard/progress-celebrations').set(auth()).send({ storeId }).expect(201)).body.currentLevel;
    expect(await level()).toBe(0);
    await prisma.rewardGrant.create({ data: { merchantId, storeId, merchantUserId, source: 'WHEEL', kind: 'XP', amount: 200 } });
    expect(await level()).toBe(1); // 200 XP ≥ 100 (Capi) and < 250
  });
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts -t "companion level"`
Expected: FAIL con "Expected: 1, Received: 0"

- [ ] **Step 3: Implementar**

En `authoritativeProgressLevel`, reemplazar la línea de `paymentCount` (de Task 3) y la de `xp` por:

```ts
    const [paymentCount, gameXp] = await Promise.all([countStoreSales(this.prisma, merchantId, storeId), gameXpForStore(this.prisma, storeId)]);
    const xp = paymentCount * PROGRESS_XP_PER_SALE + store.viewCount * PROGRESS_XP_PER_VIEW + gameXp;
```

Agregar `gameXpForStore` al import de `../rewards/reward-queries`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts && npx jest src/dashboard/merchant-session.service.spec.ts`
Expected: PASS. Si la prueba unitaria mockea `prisma` sin `rewardGrant`, agregarle `rewardGrant: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) }`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dashboard apps/api/test/rewards.e2e-spec.ts
git commit -m "feat(rewards): game XP counts toward companion level celebrations"
```

---

### Task 7: Los créditos ganados cubren las generaciones de YAPI

**Files:**
- Modify: `apps/api/src/rewards/rewards.service.ts` (agregar `redeemForGeneration`)
- Modify: `apps/api/src/storefront-source/storefront-source.module.ts` (importar `RewardsModule`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`
- Test: `apps/api/test/rewards.e2e-spec.ts`

**Interfaces:**
- Consumes: `aiCreditBalance` y `lockMerchant`.
- Produces:
  - `RewardsService.redeemForGeneration(merchantId: string, generationId: string, credits: number): Promise<number>`: devuelve los créditos cubiertos (puede ser 0) y es idempotente por generación.
  - El recibo `generation` de una generación terminada incluye `rewardCreditsCovered: number`.

- [ ] **Step 1: Agregar las pruebas que fallan**

Agregar `await prisma.storeSourceGeneration.deleteMany({ where: { storeId } });` como primera línea de `beforeEach` (antes de borrar las redenciones, para que no queden referencias). Después, agregar:

```ts
  const generation = (credits: number) => prisma.storeSourceGeneration.create({ data: { storeId, baseRevision: 0, requestedModel: 'auto', model: 'auto', maxCredits: 50, credits, status: 'COMPLETED' } });

  it('covers a finished generation from the reward balance exactly once', async () => {
    const service = app.get(RewardsService);
    await prisma.rewardGrant.create({ data: { merchantId, storeId, merchantUserId, source: 'WHEEL', kind: 'AI_CREDITS', amount: 25 } });
    const small = await generation(8);
    expect(await service.redeemForGeneration(merchantId, small.id, 8)).toBe(8);
    expect(await service.redeemForGeneration(merchantId, small.id, 8)).toBe(0);
    const big = await generation(40);
    expect(await service.redeemForGeneration(merchantId, big.id, 40)).toBe(17);
    expect((await http().get(`/v1/dashboard/rewards?storeId=${storeId}`).set(auth()).expect(200)).body.aiCreditBalance).toBe(0);
  });

  it('records nothing when there is no balance or the run used no credits', async () => {
    const service = app.get(RewardsService);
    const run = await generation(5);
    expect(await service.redeemForGeneration(merchantId, run.id, 5)).toBe(0);
    expect(await service.redeemForGeneration(merchantId, run.id, 0)).toBe(0);
    expect(await prisma.aiCreditRedemption.count({ where: { merchantId } })).toBe(0);
  });
```

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts -t "generation|no balance"`
Expected: FAIL con "service.redeemForGeneration is not a function"

- [ ] **Step 3: Implementar**

En `rewards.service.ts`:

```ts
  /** Applies reward credits to a finished YAPI generation. Idempotent per generation; returns 0 when there is nothing to cover. */
  async redeemForGeneration(merchantId: string, generationId: string, credits: number): Promise<number> {
    if (!(credits > 0)) return 0;
    return this.prisma.$transaction(async (tx) => {
      await this.lockMerchant(tx, merchantId);
      if (await tx.aiCreditRedemption.findUnique({ where: { generationId } })) return 0;
      const covered = Math.min(await aiCreditBalance(tx, merchantId), credits);
      if (covered <= 0) return 0;
      await tx.aiCreditRedemption.create({ data: { merchantId, generationId, credits: covered } });
      return covered;
    });
  }
```

En `storefront-source.module.ts`, agregar `import { RewardsModule } from '../rewards/rewards.module';` y poner `RewardsModule` en `imports`.

En `source-generation.service.ts`:
1. Agregar `import { RewardsService } from '../rewards/rewards.service';`. Si el archivo no tiene logger, agregar `Logger` al import de `@nestjs/common` y el campo `private readonly logger = new Logger(SourceGenerationService.name);`.
2. Agregar al final de los parámetros del constructor: `@Optional() private readonly rewards?: RewardsService`.
3. Agregar el método privado:

```ts
  /** Reward credits are a courtesy discount: a failure here must never fail the merchant's generation. */
  private async coverWithRewardCredits(merchantId: string, generationId: string, credits: number) {
    try { return (await this.rewards?.redeemForGeneration(merchantId, generationId, credits)) ?? 0; }
    catch (error) { this.logger.warn(`Reward credit redemption failed for ${generationId}: ${(error as Error).message}`); return 0; }
  }
```

4. Ubicar las líneas con `grep -n "const receipt = \|if (completed.count !== 1)\|const saved = await this.projects.save" apps/api/src/storefront-source/source-generation.service.ts`.
5. En el literal `const receipt = { ... status: 'COMPLETED', autoRepairs, unusedImagePaths }`, agregar `rewardCreditsCovered: 0` al final.
6. Justo después de `if (completed.count !== 1) throw new ConflictException(...)`, agregar `receipt.rewardCreditsCovered = await this.coverWithRewardCredits(merchantId, run.id, credits);`.
7. Justo después de `const saved = await this.projects.save(...)`, agregar la misma línea.

- [ ] **Step 4: Correr las pruebas y verificar que pasan (incluidas las suites de YAPI)**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts test/source-projects.e2e-spec.ts test/source-design-jobs.e2e-spec.ts`
Expected: sin errores de tipos; PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rewards apps/api/src/storefront-source apps/api/test/rewards.e2e-spec.ts
git commit -m "feat(rewards): reward credits cover finished YAPI generations"
```

---

### Task 8: Funciones puras del dashboard (`rewards.mjs`)

**Files:**
- Create: `apps/merchant-dashboard/src/rewards.mjs`
- Test: `apps/merchant-dashboard/src/rewards.test.mjs`

**Interfaces:**
- Produces:
  - `WHEEL_VISUALS: Record<PrizeKey, { label: string; icon: string; color: string; ink?: string }>`
  - `wheelRotationFor(currentRotation: number, segmentIndex: number, segmentCount: number, { turns = 6, jitter = 0 } = {}): number`
  - `boardTileCoords(index: number): { row: number; col: number }` (perímetro de 7×7, en sentido horario desde arriba a la izquierda, 1-indexado)
  - `boardHopPath(from: number, die: number, tiles = 24): number[]`
  - `xpAnimationSegments(previousXp: number, gainedXp: number, thresholds: number[]): { level: number; fromPct: number; toPct: number }[]`
  - `rewardCopy(grant: GrantView): { icon: string; title: string; message: string }`

- [ ] **Step 1: Escribir la prueba que falla**

```js
// apps/merchant-dashboard/src/rewards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_VISUALS, boardHopPath, boardTileCoords, rewardCopy, wheelRotationFor, xpAnimationSegments } from './rewards.mjs';

test('wheel lands the chosen slice under the top pointer, always spinning forward', () => {
  const next = wheelRotationFor(0, 4, 9, { turns: 6, jitter: 0 });
  const slice = 360 / 9;
  assert.equal(((next % 360) + 360) % 360, (360 - (4 * slice + slice / 2)) % 360);
  assert.ok(next >= 360 * 6);
  assert.ok(wheelRotationFor(next, 0, 9) > next);
});

test('board ring walks the 7x7 perimeter clockwise', () => {
  assert.deepEqual(boardTileCoords(0), { row: 1, col: 1 });
  assert.deepEqual(boardTileCoords(6), { row: 1, col: 7 });
  assert.deepEqual(boardTileCoords(12), { row: 7, col: 7 });
  assert.deepEqual(boardTileCoords(18), { row: 7, col: 1 });
  assert.deepEqual(boardTileCoords(23), { row: 2, col: 1 });
  assert.equal(new Set(Array.from({ length: 24 }, (_, i) => JSON.stringify(boardTileCoords(i)))).size, 24);
});

test('hop path visits every tile and wraps', () => {
  assert.deepEqual(boardHopPath(22, 4), [23, 0, 1, 2]);
});

test('XP animation splits a gain that crosses two levels', () => {
  assert.deepEqual(xpAnimationSegments(90, 200, [0, 100, 250, 450]), [
    { level: 0, fromPct: 90, toPct: 100 },
    { level: 1, fromPct: 0, toPct: 100 },
    { level: 2, fromPct: 0, toPct: 20 },
  ]);
  assert.deepEqual(xpAnimationSegments(10, 25, [0, 100]), [{ level: 0, fromPct: 10, toPct: 35 }]);
});

test('every prize has visuals and converted credits explain themselves', () => {
  for (const key of ['STICKER_COMMON', 'XP_25', 'AI_CREDITS_5', 'TIP', 'XP_50', 'RESPIN', 'STICKER_RARE', 'XP_200', 'AI_CREDITS_25']) assert.ok(WHEEL_VISUALS[key]?.label, key);
  assert.match(rewardCopy({ prize: 'AI_CREDITS_5', kind: 'XP', amount: 200, convertedFrom: 'AI_CREDITS' }).message, /tope/);
  assert.match(rewardCopy({ prize: 'XP_50', kind: 'XP', amount: 50, convertedFrom: null }).title, /\+50 XP/);
  assert.match(rewardCopy({ prize: 'AI_CREDITS_5', kind: 'AI_CREDITS', amount: 5, convertedFrom: null }).title, /5 créditos de IA/);
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/merchant-dashboard && node --test src/rewards.test.mjs`
Expected: FAIL con "Cannot find module"

- [ ] **Step 3: Implementar**

```js
// apps/merchant-dashboard/src/rewards.mjs
// Presentation for server-drawn rewards. The API decides every prize; this module only animates it.
export const WHEEL_VISUALS = {
  STICKER_COMMON: { label: "Sticker", icon: "🎁", color: "#ffc956" },
  XP_25: { label: "+25 XP", icon: "⭐", color: "#7fd3c3" },
  AI_CREDITS_5: { label: "5 IA", icon: "🪄", color: "#b9b4ff" },
  TIP: { label: "Consejo", icon: "💡", color: "#fff5bd" },
  XP_50: { label: "+50 XP", icon: "🌟", color: "#9be2a8" },
  RESPIN: { label: "+1 giro", icon: "🔁", color: "#f27a62" },
  STICKER_RARE: { label: "Raro", icon: "✨", color: "#15352f", ink: "#fff5bd" },
  XP_200: { label: "+200 XP", icon: "🏆", color: "#ff9f43" },
  AI_CREDITS_25: { label: "25 IA", icon: "💎", color: "#3b2a8f", ink: "#fff5bd" },
};

export function wheelRotationFor(currentRotation, segmentIndex, segmentCount, { turns = 6, jitter = 0 } = {}) {
  const slice = 360 / segmentCount;
  const center = segmentIndex * slice + slice / 2;
  const target = (((360 - center + jitter) % 360) + 360) % 360;
  return currentRotation - (currentRotation % 360) + 360 * turns + target;
}

const RING_SIDE = 7;
export function boardTileCoords(index) {
  const edge = RING_SIDE - 1;
  const ring = edge * 4;
  const i = ((index % ring) + ring) % ring;
  if (i < edge) return { row: 1, col: 1 + i };
  if (i < edge * 2) return { row: 1 + (i - edge), col: RING_SIDE };
  if (i < edge * 3) return { row: RING_SIDE, col: RING_SIDE - (i - edge * 2) };
  return { row: RING_SIDE - (i - edge * 3), col: 1 };
}

export function boardHopPath(from, die, tiles = 24) {
  return Array.from({ length: die }, (_, step) => (from + step + 1) % tiles);
}

export function xpAnimationSegments(previousXp, gainedXp, thresholds) {
  const levelOf = (xp) => thresholds.reduce((level, threshold, index) => (xp >= threshold ? index : level), 0);
  const pct = (xp, level) => {
    const ceiling = thresholds[level + 1];
    return ceiling === undefined ? 100 : Math.round(((xp - thresholds[level]) / (ceiling - thresholds[level])) * 100);
  };
  const target = previousXp + gainedXp;
  const segments = [];
  let level = levelOf(previousXp);
  let fromPct = pct(previousXp, level);
  while (level < levelOf(target)) {
    segments.push({ level, fromPct, toPct: 100 });
    level += 1; fromPct = 0;
  }
  segments.push({ level, fromPct, toPct: pct(target, level) });
  return segments;
}

export function rewardCopy(grant) {
  const n = (value) => Number(value).toLocaleString("es-BO");
  const icon = WHEEL_VISUALS[grant.prize]?.icon;
  if (grant.convertedFrom === "AI_CREDITS") return { icon: "🏆", title: `¡+${n(grant.amount)} XP!`, message: " Llegaste al tope de créditos de IA de este mes, así que te lo dimos en XP." };
  if (grant.kind === "XP") return { icon: icon || "⭐", title: `¡+${n(grant.amount)} XP!`, message: " Tu barra de progreso acaba de subir." };
  if (grant.kind === "AI_CREDITS") return { icon: icon || "🪄", title: `¡${n(grant.amount)} créditos de IA!`, message: " YAPI los usará primero en tu próximo diseño." };
  if (grant.kind === "STICKER") return { icon: grant.sticker.icon, title: grant.sticker.isNew ? `¡Sticker nuevo: ${grant.sticker.name}!` : `${grant.sticker.name}, otra vez`, message: grant.sticker.isNew ? " Ya está pegado en tu álbum." : " Ya lo tenías: ¡tu colección sigue brillando!" };
  if (grant.kind === "RESPIN") return { icon: "🔁", title: "¡Otra vuelta!", message: " La suerte te da un giro extra. ¡Dale!" };
  const mission = grant.tip?.kind === "mission";
  return { icon: mission ? "🧭" : "💡", title: mission ? "Misión del día" : "Un consejo para vender más", message: ` ${grant.tip?.text || ""}` };
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd apps/merchant-dashboard && node --test src/rewards.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/rewards.mjs apps/merchant-dashboard/src/rewards.test.mjs
git commit -m "feat(dashboard): pure helpers for wheel, board and XP gain animation"
```

---

### Task 9: Animación de XP (`celebrateXpGain`)

**Files:**
- Modify: `apps/merchant-dashboard/src/rewards.mjs`
- Modify: `apps/merchant-dashboard/src/dashboard.css`
- Modify: `apps/merchant-dashboard/index.html`
- Test: `apps/merchant-dashboard/src/rewards.test.mjs`

**Interfaces:**
- Consumes: `xpAnimationSegments`.
- Produces: `celebrateXpGain({ previousXp, gainedXp, thresholds, bars: { track: HTMLElement; label?: HTMLElement; format?: (xp: number) => string }[], announcer?: HTMLElement, reduceMotion?: boolean, onLevelUp?: (level: number) => void, playSound?: () => void, frame?: (cb) => number, now?: () => number }): Promise<void>`
  - Anima `--xp-progress-scale` (la misma variable que usa `setGamificationProgress` en `dashboard.js`) y `aria-valuenow` en cada `track`.
  - Cuenta el número en `label`.
  - Mientras se llena, pone `.is-xp-gaining` (reflejo y resplandor); al cruzar un nivel, `.is-xp-flash`; al final, `.is-xp-pulse`.
  - Agrega un `<span class="xp-gain-float">+N XP</span>` al track y escribe "Ganaste N XP" en `announcer`.

- [ ] **Step 1: Agregar las pruebas que fallan**

```js
import { JSDOM } from 'jsdom';
import { celebrateXpGain } from './rewards.mjs';

test('celebrateXpGain fills the bar, counts up, announces and flags each level-up', async () => {
  const { window } = new JSDOM('<div id="t" role="progressbar"><span></span></div><strong id="l"></strong><p id="a"></p>');
  globalThis.document = window.document;
  const track = window.document.getElementById('t'); const label = window.document.getElementById('l'); const announcer = window.document.getElementById('a');
  let clock = 0; const levels = [];
  await celebrateXpGain({
    previousXp: 90, gainedXp: 200, thresholds: [0, 100, 250, 450],
    bars: [{ track, label, format: (xp) => `${xp} XP` }], announcer,
    frame: (cb) => { clock += 1000; cb(); return 0; }, now: () => clock,
    onLevelUp: (level) => levels.push(level),
  });
  assert.equal(track.style.getPropertyValue('--xp-progress-scale'), '0.2');
  assert.equal(track.getAttribute('aria-valuenow'), '20');
  assert.equal(label.textContent, '290 XP');
  assert.match(announcer.textContent, /Ganaste 200 XP/);
  assert.deepEqual(levels, [1, 2]);
  assert.ok(track.classList.contains('is-xp-pulse'));
  assert.ok(!track.classList.contains('is-xp-gaining'));
  assert.ok(track.querySelector('.xp-gain-float'));
});

test('celebrateXpGain jumps straight to the end with reduced motion', async () => {
  const { window } = new JSDOM('<div id="t"></div>'); globalThis.document = window.document;
  const track = window.document.getElementById('t'); let frames = 0;
  await celebrateXpGain({ previousXp: 10, gainedXp: 25, thresholds: [0, 100], bars: [{ track }], reduceMotion: true, frame: (cb) => { frames++; cb(); return 0; }, now: () => 0 });
  assert.equal(frames, 0);
  assert.equal(track.style.getPropertyValue('--xp-progress-scale'), '0.35');
  assert.ok(!track.classList.contains('is-xp-gaining'));
});
```

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd apps/merchant-dashboard && node --test src/rewards.test.mjs`
Expected: FAIL con "celebrateXpGain is not a function"

- [ ] **Step 3: Implementar**

Agregar a `rewards.mjs`:

```js
const SEGMENT_MS = 900;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function setBar(track, pct) {
  track.style.setProperty("--xp-progress-scale", String(Math.round(pct) / 100));
  track.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function restartClass(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function tween(duration, onStep, frame, now) {
  return new Promise((resolve) => {
    const start = now();
    const step = () => {
      const t = Math.min(1, (now() - start) / duration);
      onStep(easeOut(t));
      if (t < 1) frame(step); else resolve();
    };
    frame(step);
  });
}

export async function celebrateXpGain({ previousXp, gainedXp, thresholds, bars, announcer, reduceMotion = false, onLevelUp, playSound, frame = (cb) => requestAnimationFrame(cb), now = () => performance.now() }) {
  if (!(gainedXp > 0) || !bars.length) return;
  const segments = xpAnimationSegments(previousXp, gainedXp, thresholds);
  const target = previousXp + gainedXp;
  const label = (xp) => bars.forEach((bar) => { if (bar.label) bar.label.textContent = bar.format ? bar.format(Math.round(xp)) : `${Math.round(xp).toLocaleString("es-BO")} XP`; });
  if (announcer) announcer.textContent = `Ganaste ${gainedXp.toLocaleString("es-BO")} XP`;
  bars.forEach(({ track }) => {
    const float = document.createElement("span");
    float.className = "xp-gain-float"; float.setAttribute("aria-hidden", "true");
    float.textContent = `+${gainedXp.toLocaleString("es-BO")} XP`;
    track.appendChild(float);
    setTimeout(() => float.remove(), reduceMotion ? 2000 : 1400);
  });
  if (reduceMotion) {
    bars.forEach(({ track }) => setBar(track, segments[segments.length - 1].toPct));
    label(target);
    segments.slice(1).forEach((segment) => onLevelUp?.(segment.level));
    return;
  }
  playSound?.();
  bars.forEach(({ track }) => track.classList.add("is-xp-gaining"));
  const xpPerSegment = gainedXp / segments.length;
  for (const [index, segment] of segments.entries()) {
    if (index > 0) { bars.forEach(({ track }) => restartClass(track, "is-xp-flash")); onLevelUp?.(segment.level); }
    await tween(SEGMENT_MS, (p) => {
      bars.forEach(({ track }) => setBar(track, segment.fromPct + (segment.toPct - segment.fromPct) * p));
      label(previousXp + xpPerSegment * (index + p));
    }, frame, now);
  }
  label(target);
  bars.forEach(({ track }) => { track.classList.remove("is-xp-gaining"); restartClass(track, "is-xp-pulse"); });
}
```

Confirmar las clases reales de las tres barras con `grep -n 'role="progressbar"' apps/merchant-dashboard/index.html` y `grep -n 'journey-xp-track' apps/merchant-dashboard/src/dashboard.js`. Después, agregar al final de `dashboard.css` (reemplazando `.gamification-level-track` por la clase real de la barra de la sección de gamificación si se llama distinto):

```css
.gamification-summary-track, .journey-xp-track, .gamification-level-track { position: relative; overflow: visible; }
.is-xp-gaining { box-shadow: 0 0 0 2px rgba(255, 201, 86, .55), 0 0 18px rgba(255, 201, 86, .75); transition: box-shadow .2s; }
.is-xp-gaining > span:first-child { background-image: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, .75) 45%, transparent 70%); background-size: 220% 100%; animation: xp-sheen 900ms linear infinite; }
.is-xp-pulse { animation: xp-pulse 420ms cubic-bezier(.3, 1.6, .5, 1); }
.is-xp-flash { animation: xp-flash 360ms ease-out; }
.xp-gain-float { position: absolute; right: 0; bottom: 100%; font-weight: 800; color: #b7791f; white-space: nowrap; pointer-events: none; animation: adventure-xp-pop 1400ms ease-out forwards; }
@keyframes xp-sheen { from { background-position: 120% 0; } to { background-position: -120% 0; } }
@keyframes xp-pulse { 50% { transform: scale(1.04); } }
@keyframes xp-flash { 0% { filter: brightness(2.2); } 100% { filter: none; } }
@media (prefers-reduced-motion: reduce) { .is-xp-gaining > span:first-child, .is-xp-pulse, .is-xp-flash, .xp-gain-float { animation: none; } }
```

En `index.html`, justo después del `<div class="gamification-summary-track" id="gamificationSummaryTrack" ...>...</div>`, agregar:

```html
<p class="sr-only" id="xpGainAnnouncer" aria-live="polite"></p>
```

Si `grep -n "\.sr-only" apps/merchant-dashboard/src/dashboard.css` no encuentra nada, agregar `.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/merchant-dashboard && node --test src/rewards.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/rewards.mjs apps/merchant-dashboard/src/rewards.test.mjs apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/index.html
git commit -m "feat(dashboard): glowing, counting XP bar animation for reward gains"
```

---

### Task 10: La ruleta pasa al servidor, se abre sola, y el XP de juegos se integra

**Files:**
- Modify: `apps/merchant-dashboard/src/dashboard.js`
- Modify: `apps/merchant-dashboard/index.html`
- Modify: `apps/merchant-dashboard/src/dashboard.css`
- Test: `apps/merchant-dashboard/tests/rewards.spec.mjs` (Playwright)

**Interfaces:**
- Consumes: `WHEEL_VISUALS`, `wheelRotationFor`, `rewardCopy` y `celebrateXpGain` (Tasks 8–9); `GET /dashboard/rewards`, `POST /dashboard/rewards/wheel/spin` y `wheelAvailable` (Tasks 3–4).
- Produces (dentro de `dashboard.js`, usados por Task 11):
  - `let rewardsState` (la respuesta de `GET /dashboard/rewards`)
  - `loadRewardsModule(): Promise<module rewards.mjs>`
  - `loadRewards(): Promise<RewardsState | null>`
  - `currentTotalXp(): number`
  - `announceRewardGrant(grant, previousXp, anchor, { showCard = true } = {}): Promise<void>`
  - `renderRewardsBoard()` (en esta tarea es un stub vacío)
  - `gamificationState()` suma `gameXp` desde `rewardsState.bonusXp`.

- [ ] **Step 1: Escribir la prueba Playwright que falla**

Crear `tests/rewards.spec.mjs` copiando de `tests/merchant-levels.spec.mjs` el objeto `store` y el helper de login mockeado (el `addInitScript` con `pagosya_merchant_session` y el `page.route("http://localhost:3001/v1/**", ...)`, incluidas todas las rutas que ese archivo responde para que el dashboard cargue). Renombrar el helper a `openDashboard(page, options)` y agregar al route handler, antes de su fallback:

```js
    if (path === "/dashboard/daily-login-reward") return route.fulfill({ json: { awarded: true, totalStars: 1, wheelAvailable: options.wheelAvailable } });
    if (path === "/dashboard/rewards") return route.fulfill({ json: options.currentRewards });
    if (path === "/dashboard/rewards/wheel/spin") return route.fulfill(options.spinResponse || { json: { segmentIndex: 4, grant: { id: "g1", prize: "XP_50", kind: "XP", amount: 50, convertedFrom: null, sticker: null, tip: null }, wheel: { ...options.currentRewards.wheel, available: false, spinsUsed: 1 } } });
    if (path === "/dashboard/rewards/board/roll") return route.fulfill(options.rollResponse);
```

Y las pruebas:

```js
const segments = ["STICKER_COMMON", "XP_25", "AI_CREDITS_5", "TIP", "XP_50", "RESPIN", "STICKER_RARE", "XP_200", "AI_CREDITS_25"];
const rewards = (overrides = {}) => ({
  wheel: { available: true, day: "2026-09-24", spinsUsed: 0, spinsAllowed: 1, segments },
  board: { position: 0, rollsUsed: 0, rollsAvailable: 1, salesUntilNextRoll: 10, lapsCompleted: 0, tiles: Array(24).fill("STICKER_COMMON") },
  bonusXp: 0, stickers: [], aiCreditBalance: 0, aiCreditsThisMonth: 0, aiCreditMonthlyCap: 50, ...overrides,
});

test("opens the wheel on the first login of the day and animates the XP bar on a win", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards() });
  const modal = page.locator("#luckWheelModal");
  await expect(modal).toBeVisible();
  await modal.locator("#luckWheelSpin").click();
  await expect(modal.locator("#luckWheelResult")).toContainText("+50 XP", { timeout: 8000 });
  await expect(page.locator("#xpGainAnnouncer")).toHaveText(/Ganaste 50 XP/, { timeout: 4000 });
});

test("does not open the wheel when today's spin is used", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: false, currentRewards: rewards({ wheel: { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments } }) });
  await page.waitForTimeout(800);
  await expect(page.locator("#luckWheelModal")).toBeHidden();
});

test("an API error leaves the wheel still and explains why", async ({ page }) => {
  await openDashboard(page, { wheelAvailable: true, currentRewards: rewards(), spinResponse: { status: 409, json: { message: "Ya usaste tu giro de hoy." } } });
  const before = await page.locator("#luckWheelDisc").evaluate((el) => el.style.transform);
  await page.locator("#luckWheelModal #luckWheelSpin").click();
  await expect(page.locator("#luckWheelModal #luckWheelStatus")).toContainText("Ya usaste tu giro de hoy.");
  expect(await page.locator("#luckWheelDisc").evaluate((el) => el.style.transform)).toBe(before);
});
```

Antes de afirmar el mensaje del 409, revisar con `sed -n 4065,4110p apps/merchant-dashboard/src/dashboard.js` cómo `api()` convierte un error en `error.message`, y ajustar el cuerpo mockeado a ese formato.

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/merchant-dashboard && npx playwright test tests/rewards.spec.mjs`
Expected: FAIL (no existe `#luckWheelModal`)

- [ ] **Step 3: Implementar**

**3a. `index.html`:** agregar al final del `<body>`:

```html
<div class="luck-wheel-modal" id="luckWheelModal" role="dialog" aria-modal="true" aria-labelledby="luckWheelTitle" hidden>
  <div class="luck-wheel-modal-card">
    <button class="luck-wheel-modal-close" id="luckWheelModalClose" type="button" aria-label="Cerrar la ruleta">×</button>
    <div id="luckWheelModalSlot"></div>
  </div>
</div>
```

Cambiar el texto de `<p class="luck-wheel-note">` a: `Premios reales: XP para tu nivel, créditos de IA para YAPI y stickers para tu álbum. Los premios grandes son los más difíciles.`

**3b. `dashboard.css`:**

```css
.luck-wheel-modal { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 16px; background: rgba(21, 53, 47, .55); animation: session-profile-backdrop .2s ease-out; }
.luck-wheel-modal[hidden] { display: none; }
.luck-wheel-modal-card { position: relative; width: min(760px, 100%); max-height: calc(100dvh - 32px); overflow: auto; border-radius: 24px; background: var(--pg-surface, #fff); animation: session-profile-enter .25s ease-out; }
.luck-wheel-modal-close { position: absolute; top: 10px; right: 12px; z-index: 1; width: 36px; height: 36px; border: 0; border-radius: 50%; font-size: 22px; background: transparent; cursor: pointer; }
```

**3c. `dashboard.js`, reemplazar la ruleta:** reemplazar todo desde el comentario `// The wheel is a daily, purely playful loop` hasta `document.getElementById("luckWheelHub")?.addEventListener("click", spinLuckWheel);`, **conservando** `playLuckWheelTick` y `trackLuckWheelTicks`, que quedan entre medio. Se borran `LUCK_WHEEL_STICKERS`, `LUCK_WHEEL_MISSIONS`, `LUCK_WHEEL_TIPS`, `LUCK_WHEEL_SEGMENTS`, `LUCK_WHEEL_SLICE`, `luckWheelMemory`, `luckWheelToday`, `luckWheelKey`, `luckWheelAlbumKey`, `luckWheelState`, `saveLuckWheelState`, `luckWheelAlbum`, `saveLuckWheelAlbum`, `luckWheelPick` y `luckWheelPrize`. En `trackLuckWheelTicks`, cambiar `LUCK_WHEEL_SLICE` por `(360 / Math.max(1, luckWheelSegments().length))`. El código nuevo:

```js
  // The API draws and stores every prize; the wheel only animates to the slice it was told.
  let rewardsModule = null;
  const loadRewardsModule = () => (rewardsModule ||= import("/src/rewards.mjs"));
  let rewardsState = null;
  let luckWheelRotation = 0;
  let luckWheelSpinning = false;
  let luckWheelModalShownThisLoad = false;
  let luckWheelHome = null;

  async function loadRewards() {
    if (!currentStoreId || !sessionToken) return null;
    try { rewardsState = await api(`/dashboard/rewards?storeId=${encodeURIComponent(currentStoreId)}`); }
    catch { rewardsState = null; }
    renderLuckWheel();
    renderRewardsBoard();
    return rewardsState;
  }

  function luckWheelSegments() { return rewardsState?.wheel.segments || []; }

  async function buildLuckWheelDisc() {
    const disc = document.getElementById("luckWheelDisc");
    const segments = luckWheelSegments();
    if (!disc || !segments.length || disc.dataset.segments === segments.join(",")) return;
    const { WHEEL_VISUALS } = await loadRewardsModule();
    const slice = 360 / segments.length;
    const point = (degrees, radius) => [radius * Math.sin(degrees * Math.PI / 180), -radius * Math.cos(degrees * Math.PI / 180)].map((value) => Number(value.toFixed(2)));
    disc.dataset.segments = segments.join(",");
    disc.innerHTML = `<circle r="98" class="luck-wheel-rim"/>${segments.map((key, index) => {
      const visual = WHEEL_VISUALS[key]; const start = index * slice; const end = start + slice; const center = start + slice / 2;
      return `<path d="M0 0 L${point(start, 92).join(" ")} A92 92 0 0 1 ${point(end, 92).join(" ")} Z" fill="${visual.color}"/><g transform="rotate(${center})" fill="${visual.ink || "#15352f"}"><text y="-76" class="luck-wheel-icon">${visual.icon}</text><text x="47" transform="rotate(-90)" class="luck-wheel-label">${esc(visual.label)}</text></g>`;
    }).join("")}${segments.map((_, index) => { const [cx, cy] = point(index * slice, 92); return `<circle cx="${cx}" cy="${cy}" r="3.2" class="luck-wheel-peg"/>`; }).join("")}`;
  }

  function renderLuckWheelAlbum(newStickerId = null) {
    const stickers = rewardsState?.stickers || [];
    document.getElementById("luckWheelAlbumCount").textContent = `${stickers.filter((sticker) => sticker.owned).length} de ${stickers.length}`;
    document.getElementById("luckWheelAlbum").innerHTML = stickers.map((sticker) => {
      const label = sticker.owned ? esc(sticker.name) : "Sticker por descubrir";
      return `<span class="luck-wheel-sticker${sticker.owned ? " is-owned" : ""}${sticker.rare ? " is-rare" : ""}${sticker.id === newStickerId ? " is-new" : ""}" role="img" title="${label}" aria-label="${label}">${sticker.owned ? sticker.icon : "?"}</span>`;
    }).join("");
  }

  function showLuckWheelResult(copy, kind = "") {
    const box = document.getElementById("luckWheelResult");
    if (!copy) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false; box.dataset.kind = kind;
    box.innerHTML = `<span class="luck-wheel-result-icon" aria-hidden="true">${copy.icon}</span><span><strong>${esc(copy.title)}</strong>${esc(copy.message)}</span>`;
  }

  function renderLuckWheel() {
    if (!document.getElementById("luckWheel")) return;
    buildLuckWheelDisc();
    renderLuckWheelAlbum();
    if (luckWheelSpinning) return;
    const wheel = rewardsState?.wheel;
    const canSpin = !!wheel?.available;
    const spin = document.getElementById("luckWheelSpin"); const hub = document.getElementById("luckWheelHub");
    spin.disabled = !canSpin; hub.disabled = !canSpin;
    hub.textContent = canSpin ? "¡Gira!" : "Mañana";
    spin.textContent = canSpin ? (wheel.spinsUsed > 0 ? "Girar otra vez" : "Girar la ruleta") : "Vuelve mañana";
    document.getElementById("luckWheelStatus").textContent = !wheel
      ? "No pudimos cargar la ruleta. Vuelve a intentarlo en un momento."
      : canSpin ? "Una vuelta por día. Gana XP, créditos de IA y stickers." : "Ya usaste tu vuelta de hoy. Mañana (hora de Bolivia) la ruleta vuelve a girar.";
  }

  function openLuckWheelModal() {
    const modal = document.getElementById("luckWheelModal"); const wheel = document.getElementById("luckWheel");
    if (!modal || !wheel) return;
    luckWheelHome ||= { parent: wheel.parentElement, next: wheel.nextSibling };
    document.getElementById("luckWheelModalSlot").appendChild(wheel);
    modal.hidden = false;
    document.getElementById("luckWheelSpin").focus();
  }

  function closeLuckWheelModal() {
    const modal = document.getElementById("luckWheelModal"); const wheel = document.getElementById("luckWheel");
    if (!modal || modal.hidden || luckWheelSpinning) return;
    modal.hidden = true;
    if (luckWheelHome) luckWheelHome.parent.insertBefore(wheel, luckWheelHome.next);
  }
  document.getElementById("luckWheelModalClose")?.addEventListener("click", closeLuckWheelModal);
  document.getElementById("luckWheelModal")?.addEventListener("click", (event) => { if (event.target.id === "luckWheelModal") closeLuckWheelModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLuckWheelModal(); });

  function currentTotalXp() { return lastFinances ? gamificationState(lastFinances).xp : 0; }

  async function announceRewardGrant(grant, previousXp, anchor, { showCard = true } = {}) {
    const { rewardCopy, celebrateXpGain } = await loadRewardsModule();
    if (showCard) showLuckWheelResult(rewardCopy(grant), grant.kind);
    playAdventureTouchSound("open");
    if (anchor) burstConfetti(anchor, { count: ["AI_CREDITS_25", "STICKER_RARE", "XP_200"].includes(grant.prize) ? 90 : 40, spread: 1 });
    await loadRewards();
    if (lastFinances) renderGamification(lastFinances, { announce: false });
    if (grant.kind !== "XP") return;
    const bars = [
      { track: document.getElementById("gamificationSummaryTrack"), label: document.getElementById("gamificationSummaryXp") },
      { track: document.getElementById("adventureXpTrack") },
    ].filter((bar) => bar.track);
    const run = () => celebrateXpGain({
      previousXp, gainedXp: grant.amount, thresholds: ADVENTURE_LEVELS.map((level) => level.xpRequired), bars,
      announcer: document.getElementById("xpGainAnnouncer"),
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      playSound: () => playAdventureTouchSound("open"),
      onLevelUp: () => { if (lastFinances) renderGamification(lastFinances, { announce: true }); },
    });
    const summary = document.getElementById("gamificationSummaryTrack");
    if (!summary || typeof IntersectionObserver === "undefined") return run();
    // Wait until the top bar is on screen so the merchant actually sees it fill.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); run();
    });
    observer.observe(summary);
  }

  async function spinLuckWheel() {
    if (luckWheelSpinning || !rewardsState?.wheel.available) return;
    const spinButton = document.getElementById("luckWheelSpin"); const hub = document.getElementById("luckWheelHub");
    spinButton.disabled = true; hub.disabled = true; spinButton.textContent = "Girando…";
    showLuckWheelResult(null);
    const previousXp = currentTotalXp();
    let result;
    try {
      result = await api("/dashboard/rewards/wheel/spin", { method: "POST", body: JSON.stringify({ storeId: currentStoreId }) });
    } catch (error) {
      await loadRewards();
      document.getElementById("luckWheelStatus").textContent = error?.message || "No pudimos girar la ruleta. Vuelve a intentarlo.";
      return;
    }
    const { wheelRotationFor } = await loadRewardsModule();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = luckWheelSegments().length;
    luckWheelRotation = wheelRotationFor(luckWheelRotation, result.segmentIndex, count, { turns: reduceMotion ? 1 : 6, jitter: (Math.random() - .5) * (360 / count) * .6 });
    luckWheelSpinning = true;
    const disc = document.getElementById("luckWheelDisc");
    document.getElementById("luckWheel").classList.add("is-spinning");
    const duration = reduceMotion ? 500 : 4600;
    disc.style.transition = `transform ${duration}ms cubic-bezier(.12,.72,.14,1)`;
    disc.style.transform = `rotate(${luckWheelRotation}deg)`;
    if (!reduceMotion) requestAnimationFrame(() => trackLuckWheelTicks(disc));
    window.setTimeout(async () => {
      luckWheelSpinning = false;
      document.getElementById("luckWheel").classList.remove("is-spinning");
      if (result.grant.kind === "TIP" && Math.random() < .3) {
        const hero = document.getElementById("gamificationHeroImage");
        hero?.classList.remove("is-dancing"); void hero?.offsetWidth; hero?.classList.add("is-dancing");
      }
      await announceRewardGrant(result.grant, previousXp, document.querySelector(".luck-wheel-stage"));
      renderLuckWheelAlbum(result.grant.sticker?.isNew ? result.grant.sticker.id : null);
    }, duration + 60);
  }
  document.getElementById("luckWheelSpin")?.addEventListener("click", spinLuckWheel);
  document.getElementById("luckWheelHub")?.addEventListener("click", spinLuckWheel);

  function renderRewardsBoard() {}
```

El baile de "fiesta" (30% de los `TIP`) es la variante visual que pide la spec.

**3d. `gamificationState`:** después de `const visitsXp = visits * GAMIFICATION_XP_PER_VISIT;`, agregar `const gameXp = Math.max(0, Number(rewardsState?.bonusXp) || 0);`. Cambiar `const xp = salesXp + visitsXp;` por `const xp = salesXp + visitsXp + gameXp;` y agregar `gameXp` al objeto que devuelve (junto a `salesXp, visitsXp`). Como `rewardsState` se declara con `let` más abajo en el mismo scope, confirmar con `grep -n "function gamificationState" apps/merchant-dashboard/src/dashboard.js` que `gamificationState` nunca se llama antes de que el script termine de evaluarse. Si sí se llama antes, mover `let rewardsState = null;` junto a `let lastFinances = null;`.

**3e. `claimDailyLoginReward`:** dentro del bloque donde se asigna `dailyLoginReward = { ... }` con la respuesta, agregar `wheelAvailable: !!reward.wheelAvailable`. Justo después de esa asignación (antes de `if (!dailyLoginReward.awarded) return;`), agregar:

```js
      await loadRewards();
      if (reward.wheelAvailable && rewardsState?.wheel.available && !luckWheelModalShownThisLoad) { luckWheelModalShownThisLoad = true; openLuckWheelModal(); }
```

**3f. Al cambiar de tienda:** buscar con `grep -n "currentStoreId = " apps/merchant-dashboard/src/dashboard.js` la función que cambia de tienda y vuelve a cargar las finanzas, y llamar a `loadRewards()` después de que las finanzas se carguen.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/merchant-dashboard && npx playwright test tests/rewards.spec.mjs tests/dashboard-smoke.spec.mjs tests/merchant-levels.spec.mjs && node --test src/*.test.mjs unit/*.test.mjs`
Expected: PASS. Si `dashboard-smoke` falla por `/dashboard/rewards` sin mockear, confirmar que `loadRewards` atrapa el error y que la página igual carga (la ruleta muestra "No pudimos cargar la ruleta…").

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/index.html apps/merchant-dashboard/tests/rewards.spec.mjs
git commit -m "feat(dashboard): server-drawn daily wheel that opens on the first login of the day"
```

---

### Task 11: El tablero con dado en Horizonte

**Files:**
- Modify: `apps/merchant-dashboard/src/dashboard.js` (el template de Horizonte con `journey-footer`, `renderRewardsBoard` y `rollRewardsBoard`)
- Modify: `apps/merchant-dashboard/src/dashboard.css`
- Test: `apps/merchant-dashboard/tests/rewards.spec.mjs`

**Interfaces:**
- Consumes: `boardTileCoords`, `boardHopPath`, `WHEEL_VISUALS` y `rewardCopy` (Task 8); `rewardsState`, `loadRewards`, `loadRewardsModule`, `currentTotalXp` y `announceRewardGrant` (Task 10); `POST /dashboard/rewards/board/roll` (Task 5).
- Produces: `#rewardsBoard` (grilla de 7×7 con 24 `.board-tile[data-tile]`), `#rewardsBoardToken[data-tile]`, `#rewardsBoardDie`, `#rewardsBoardRoll`, `#rewardsBoardHint` y `#rewardsBoardResult`.

- [ ] **Step 1: Agregar la prueba que falla**

Primero, ver cómo se llega a Horizonte: `grep -n "journeyViewport\|renderAnimalAdventure(\|adventureMap" apps/merchant-dashboard/src/dashboard.js | head` y `grep -n "data-dashboard-page=\"gamification\"\|data-dashboard-nav" apps/merchant-dashboard/index.html | head`. Poner ese selector en `openHorizonte`.

```js
async function openHorizonte(page) {
  // Replace with the real navigation to the section that renders the Horizonte template.
  await page.locator("[data-dashboard-nav='gamification']").first().click();
  await expect(page.locator("#journeyViewport")).toBeVisible();
}

test("the companion hops along the Horizonte board and the prize is shown", async ({ page }) => {
  const tiles = Array(24).fill("STICKER_COMMON"); tiles[3] = "AI_CREDITS_5";
  const usedWheel = { available: false, day: "2026-09-24", spinsUsed: 1, spinsAllowed: 1, segments };
  await openDashboard(page, {
    wheelAvailable: false,
    currentRewards: rewards({ wheel: usedWheel, board: { position: 0, rollsUsed: 0, rollsAvailable: 1, salesUntilNextRoll: 4, lapsCompleted: 0, tiles } }),
    rollResponse: { json: { die: 3, from: 0, to: 3, lapCompleted: false, grant: { id: "g2", prize: "AI_CREDITS_5", kind: "AI_CREDITS", amount: 5, convertedFrom: null, sticker: null, tip: null }, board: { position: 3, rollsUsed: 1, rollsAvailable: 0, salesUntilNextRoll: 4, lapsCompleted: 0, tiles } } },
  });
  await openHorizonte(page);
  await expect(page.locator("#rewardsBoard .board-tile")).toHaveCount(24);
  await expect(page.locator("#rewardsBoardRoll")).toHaveText(/Tirar dado \(1\)/);
  await page.locator("#rewardsBoardRoll").click();
  await expect(page.locator("#rewardsBoardToken")).toHaveAttribute("data-tile", "3", { timeout: 4000 });
  await expect(page.locator("#rewardsBoardResult")).toContainText("5 créditos de IA");
  await expect(page.locator("#rewardsBoardRoll")).toBeDisabled();
  await expect(page.locator("#rewardsBoardHint")).toContainText("4 ventas");
});
```

Nota: después del tiro, `announceRewardGrant` llama a `loadRewards()`, que vuelve a pedir `GET /dashboard/rewards`. Para que el estado final sea coherente, el mock de `/dashboard/rewards` tiene que devolver el board de `rollResponse.json.board` una vez que se tiró. En el helper, hacer que la ruta de roll haga `options.currentRewards = { ...options.currentRewards, board: options.rollResponse.json.board };` antes del `fulfill`.

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd apps/merchant-dashboard && npx playwright test tests/rewards.spec.mjs -g "hops"`
Expected: FAIL (no existe `#rewardsBoard`)

- [ ] **Step 3: Implementar**

En el template de Horizonte (la cadena que contiene `<footer class="journey-footer">`), justo antes de `<footer class="journey-footer">`, insertar:

```html
<section class="rewards-board-panel" aria-labelledby="rewardsBoardTitle"><div class="rewards-board" id="rewardsBoard" role="list" aria-label="Tablero de premios"><span class="rewards-board-token" id="rewardsBoardToken" data-tile="0" aria-hidden="true"></span><div class="rewards-board-center"><h3 id="rewardsBoardTitle">Tablero de la suerte</h3><span class="rewards-board-die" id="rewardsBoardDie" aria-live="polite">🎲</span><button class="luck-wheel-spin" id="rewardsBoardRoll" type="button">Tirar dado</button><p class="rewards-board-hint" id="rewardsBoardHint"></p><div class="luck-wheel-result" id="rewardsBoardResult" aria-live="polite" hidden></div></div></div></section>
```

Justo después de la línea que asigna ese template al DOM, agregar `renderRewardsBoard();` para que el tablero se pinte cada vez que se vuelve a renderizar Horizonte.

En `dashboard.js`, reemplazar el stub `function renderRewardsBoard() {}` por:

```js
  let rewardsBoardRolling = false;

  function placeBoardToken(token, index, boardTileCoords) {
    const { row, col } = boardTileCoords(index);
    token.style.gridRow = String(row); token.style.gridColumn = String(col); token.dataset.tile = String(index);
  }

  async function renderRewardsBoard() {
    const board = document.getElementById("rewardsBoard");
    if (!board) return;
    const state = rewardsState?.board;
    const button = document.getElementById("rewardsBoardRoll"); const hint = document.getElementById("rewardsBoardHint");
    if (!state) { button.disabled = true; hint.textContent = "No pudimos cargar el tablero."; return; }
    const { WHEEL_VISUALS, boardTileCoords } = await loadRewardsModule();
    if (board.dataset.tiles !== state.tiles.join(",")) {
      board.querySelectorAll(".board-tile").forEach((tile) => tile.remove());
      board.dataset.tiles = state.tiles.join(",");
      state.tiles.forEach((key, index) => {
        const { row, col } = boardTileCoords(index); const visual = WHEEL_VISUALS[key];
        const tile = document.createElement("span");
        tile.className = `board-tile board-tile-${key.toLowerCase()}`;
        tile.dataset.tile = String(index); tile.setAttribute("role", "listitem");
        tile.style.gridRow = String(row); tile.style.gridColumn = String(col); tile.style.setProperty("--tile-color", visual.color);
        tile.setAttribute("aria-label", `Casilla ${index + 1}: ${visual.label}`);
        tile.textContent = visual.icon;
        board.appendChild(tile);
      });
    }
    const token = document.getElementById("rewardsBoardToken");
    const companion = ADVENTURE_LEVELS[selectedGamificationCompanion(lastFinances ? gamificationState(lastFinances).levelIndex : 0)];
    token.style.backgroundImage = `url(${companion.asset})`;
    if (rewardsBoardRolling) return;
    placeBoardToken(token, state.position, boardTileCoords);
    button.disabled = state.rollsAvailable <= 0;
    button.textContent = state.rollsAvailable > 0 ? `Tirar dado (${state.rollsAvailable.toLocaleString("es-BO")})` : "Sin tiros";
    hint.textContent = `Te faltan ${state.salesUntilNextRoll.toLocaleString("es-BO")} ${state.salesUntilNextRoll === 1 ? "venta" : "ventas"} para el próximo tiro · Vueltas completadas: ${state.lapsCompleted.toLocaleString("es-BO")}`;
  }

  async function rollRewardsBoard() {
    if (rewardsBoardRolling || !(rewardsState?.board.rollsAvailable > 0)) return;
    const button = document.getElementById("rewardsBoardRoll"); const die = document.getElementById("rewardsBoardDie");
    const resultBox = document.getElementById("rewardsBoardResult");
    rewardsBoardRolling = true; button.disabled = true; button.textContent = "Tirando…"; resultBox.hidden = true;
    const previousXp = currentTotalXp();
    let result;
    try {
      result = await api("/dashboard/rewards/board/roll", { method: "POST", body: JSON.stringify({ storeId: currentStoreId }) });
    } catch (error) {
      rewardsBoardRolling = false;
      await loadRewards();
      document.getElementById("rewardsBoardHint").textContent = error?.message || "No pudimos tirar el dado. Vuelve a intentarlo.";
      return;
    }
    const { boardHopPath, boardTileCoords, rewardCopy } = await loadRewardsModule();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    die.textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][result.die - 1];
    die.classList.remove("is-rolling"); void die.offsetWidth; if (!reduceMotion) die.classList.add("is-rolling");
    const token = document.getElementById("rewardsBoardToken");
    for (const tile of reduceMotion ? [result.to] : boardHopPath(result.from, result.die)) {
      placeBoardToken(token, tile, boardTileCoords);
      token.classList.remove("is-hopping"); void token.offsetWidth; if (!reduceMotion) token.classList.add("is-hopping");
      playLuckWheelTick();
      await new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 0 : 180));
    }
    const copy = rewardCopy(result.grant);
    resultBox.hidden = false; resultBox.dataset.kind = result.grant.kind;
    resultBox.innerHTML = `<span class="luck-wheel-result-icon" aria-hidden="true">${copy.icon}</span><span><strong>${esc(copy.title)}</strong>${esc(copy.message)}${result.lapCompleted ? " ¡Completaste una vuelta!" : ""}</span>`;
    rewardsBoardRolling = false;
    await announceRewardGrant(result.grant, previousXp, document.getElementById("rewardsBoard"), { showCard: false });
  }
  // Delegated: the Horizonte template is re-rendered, so the button is replaced over time.
  document.addEventListener("click", (event) => { if (event.target.closest?.("#rewardsBoardRoll")) rollRewardsBoard(); });
```

CSS:

```css
.rewards-board-panel { padding: 12px 16px; }
.rewards-board { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(7, minmax(0, 1fr)); gap: 4px; width: min(520px, 100%); aspect-ratio: 1; margin: 0 auto; }
.board-tile { display: grid; place-items: center; border-radius: 10px; font-size: clamp(14px, 3.4vw, 22px); background: var(--tile-color); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .12); }
.board-tile-ai_credits_25, .board-tile-sticker_rare, .board-tile-xp_200, .board-tile-ai_credits_5 { outline: 2px solid #ffd76a; box-shadow: 0 0 12px rgba(255, 201, 86, .7), inset 0 -3px 0 rgba(0, 0, 0, .12); }
.rewards-board-center { grid-row: 2 / 7; grid-column: 2 / 7; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 8px; text-align: center; }
.rewards-board-token { z-index: 2; width: 100%; height: 100%; background: center / 80% no-repeat; filter: drop-shadow(0 4px 4px rgba(0, 0, 0, .3)); pointer-events: none; }
.rewards-board-token.is-hopping { animation: board-hop 180ms ease-out; }
.rewards-board-die { font-size: 40px; line-height: 1; }
.rewards-board-die.is-rolling { animation: button-spin 400ms ease-out; }
.rewards-board-hint { margin: 0; font-size: 13px; }
@keyframes board-hop { 50% { transform: translateY(-40%) scale(1.1); } }
@media (prefers-reduced-motion: reduce) { .rewards-board-token.is-hopping, .rewards-board-die.is-rolling { animation: none; } }
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd apps/merchant-dashboard && npx playwright test tests/rewards.spec.mjs && node --test src/*.test.mjs unit/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/dashboard.css apps/merchant-dashboard/tests/rewards.spec.mjs
git commit -m "feat(dashboard): Horizonte dice board where the companion hops to prizes"
```

---

### Task 12: Verificación completa y revisión visual

**Files:** ninguno nuevo (solo arreglos que aparezcan).

- [ ] **Step 1: Tipos y pruebas de la API**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/rewards src/dashboard && npx jest --config test/jest-e2e.json test/rewards.e2e-spec.ts test/source-projects.e2e-spec.ts test/source-design-jobs.e2e-spec.ts test/security.e2e-spec.ts`
Expected: sin errores; todo PASS

- [ ] **Step 2: Pruebas y tipos del dashboard**

Run: `cd apps/merchant-dashboard && node --test src/*.test.mjs unit/*.test.mjs && npx playwright test && npx tsc -p tsconfig.json --noEmit`
Expected: todo PASS

- [ ] **Step 3: Revisión visual real** (con la skill `visual-qa`)

Levantar la API y el dashboard, y con una sesión real:
1. Borrar los `DailyWheelSpin` de ese usuario y recargar: el modal se abre solo.
2. Girar y ver que la barra de arriba se llene con brillo y el número cuente.
3. Insertar 10 `PaymentIntent` `SUCCEEDED` con `metadata.storeId` de la tienda; el botón dice "Tirar dado (1)"; tirar y ver al compañero saltar casilla por casilla.
4. Revisar a 375 px de ancho (el tablero sin scroll horizontal y el modal entero dentro de la pantalla) y con "reducir movimiento" activado.

- [ ] **Step 4: Commit de los arreglos (si hubo)**

```bash
git add apps/api apps/merchant-dashboard
git commit -m "fix(rewards): polish found in visual QA"
```
