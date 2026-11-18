# Popup games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant can turn the signup popup into a «rasca y gana» (scratch card) or «ruleta» (wheel): the shopper plays, sees the
exact real prize, answers one tap question, gives an email and gets the code; a «Prueba tu suerte ×» corner tab reopens it.

**Architecture:** Settings live in `StoreRetention.settings` (`popupGame`, `popupGamePrizes`, `popupQuestion`). The API draws the prize
(`POST …/retention/play`) and signs it (HMAC token, 30 min); `subscribe` turns a valid token into the prize code. `retention.js` draws
the game inside the store's popup look (in the `pya-form` slot). A `PopupGameService` turns games on (creating four real codes) and
edits prizes and the question; the Studio and YAPI call it.

**Tech Stack:** NestJS + Prisma, plain JS kit (retention.js), Playwright render harness, Vite Studio, the hosted checkout parent (apps/checkout).

**Spec:** `docs/superpowers/specs/2026-11-09-popup-games-design.md` (built on `2026-11-09-popup-looks-design.md`)

## Global Constraints

- Everyone wins; the reveal shows the exact prize («¡Ganaste 15 % de descuento!»); never «hasta X %», never a fake near-miss.
- Default prizes: four PERCENT codes `RASCA5/10/15/20` (wheel: `RULETA5/10/15/20`), chances 40/30/20/10; 2–6 prizes; chances sum to 100.
- Shared codes (one per prize). The code itself never reaches the page before a valid claim; public settings carry labels only.
- Token: HMAC-SHA256 over `game:{storeId}:{promoCodeId}:{exp}` with `app.orderTrackingSecret`; 30 minutes.
- One play per device (`localStorage pagosya:game:{slug}`, 30 min); an email already subscribed before the claim gets no prize.
- Off by default; Studio or chat turns it on. Demo stores and the Studio preview draw locally and never send.
- Rulings (deviations from the spec): (1) the tap question is written from the store's categories without a model call (games stay
  free and instant, like the looks); (2) game settings have their own endpoint `PUT /v1/stores/:id/retention/game` instead of widening
  the Ajustes DTO (which refuses unknown fields).
- Dev rules: one spec file per jest run; Edit tool on apps/api; commit only when the owner asks.

## Review Focus

1. **Replay to fish for the top prize.** Reload, a private window or cleared storage must not let one email collect two prizes — the
   server refuses a second claim per email (Task 2 test).
2. **Forged or edited tokens** (changed code id, store, or expiry): signup works, no code (Task 1/2 tests).
3. **A prize code switched off after the draw:** no code and «Tu premio venció; vuelve a jugar.» (Task 2 test).
4. **Published (hosted) stores:** the parent must forward `play` and keep `gameToken`/`answer` (Task 5 test).
5. **Phones and keyboards:** scratch by touch, a «Rascar» button for keyboard and screen readers, reduced motion stops the spin (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/store-popups/popup-games.ts` (create) | types, `readGame`, `drawPrize`, game token sign/read, default prizes, question from categories, `rebalance` |
| `apps/api/src/store-popups/popup-game.service.ts` (create) | `play`, `claim`, `enable`, `disable`, `setTopPrize`, `setQuestion` |
| `apps/api/src/retention/retention.dto.ts`, `retention.service.ts`, `retention.controller.ts`, `retention.module.ts` (modify) | `gameToken`/`answer` in subscribe; play + game routes; public game settings; kept keys |
| `packages/storefront-kit/kit/retention.js` (modify) | scratch, wheel, reveal, question, claim, corner tab |
| `apps/api/src/store-popups/popup-render.ts` (modify) | measures the game step; runs play/claim/close actions |
| `apps/checkout/src/source-storefront.ts` (modify) | hosted parent forwards `play` |
| `apps/api/src/storefront-source/source-store-edit.ts`, `source-chat.service.ts` (modify) | chat ops `game`, `prize`, `question` |
| `apps/merchant-studio/src/retention.ts`, `api.ts` (modify) | «Juego» panel |

---

### Task 1: Game rules (pure)

**Files:** Create `apps/api/src/store-popups/popup-games.ts`; Test `apps/api/src/store-popups/popup-games.spec.ts`

**Interfaces — Produces:** `POPUP_GAMES`, `type PopupGame`, `readGame(v): PopupGame | null`; `type GamePrize = { promoCodeId: string; label: string; chance: number }`;
`type GameQuestion = { text: string; answers: string[] }`; `type PopupGameSettings = { popupGame?: string | null; popupGamePrizes?: GamePrize[]; popupQuestion?: GameQuestion | null }`;
`drawPrize(prizes, roll 0..99): GamePrize | null`; `createGameToken(storeId, promoCodeId, expMs, secret)`; `readGameToken(token, storeId, secret, now?): string | null`;
`DEFAULT_PRIZES`; `prizeCode(game, percent)`; `prizeLabel(percent)`; `questionFor(categories)`; `rebalance(percents): number[]`.

- [ ] **Step 1: Tests**

```ts
import { createGameToken, drawPrize, prizeCode, prizeLabel, questionFor, readGame, readGameToken, rebalance } from './popup-games';

const PRIZES = [{ promoCodeId: 'a', label: '5 %', chance: 40 }, { promoCodeId: 'b', label: '10 %', chance: 30 }, { promoCodeId: 'c', label: '15 %', chance: 20 }, { promoCodeId: 'd', label: '20 %', chance: 10 }];
describe('popup games', () => {
  it('reads the two games only', () => {
    expect(readGame('scratch')).toBe('scratch'); expect(readGame('wheel')).toBe('wheel'); expect(readGame('slots')).toBeNull();
  });
  it('draws by chance: rolls 0–39 the first prize, 90–99 the last', () => {
    expect(drawPrize(PRIZES, 0)!.promoCodeId).toBe('a'); expect(drawPrize(PRIZES, 39)!.promoCodeId).toBe('a');
    expect(drawPrize(PRIZES, 40)!.promoCodeId).toBe('b'); expect(drawPrize(PRIZES, 99)!.promoCodeId).toBe('d');
    expect(drawPrize([], 5)).toBeNull();
  });
  it('signs a prize for one store and 30 minutes; any change or expiry fails', () => {
    const now = 1_000_000; const token = createGameToken('s1', 'c', now + 1_800_000, 'secret');
    expect(readGameToken(token, 's1', 'secret', now)).toBe('c');
    expect(readGameToken(token, 's2', 'secret', now)).toBeNull();
    expect(readGameToken(token, 's1', 'other', now)).toBeNull();
    expect(readGameToken(token, 's1', 'secret', now + 1_800_001)).toBeNull();
    expect(readGameToken(`${Buffer.from(`d.${now + 1_800_000}`).toString('base64url')}.${token.split('.')[1]}`, 's1', 'secret', now)).toBeNull();
    expect(readGameToken('garbage', 's1', 'secret', now)).toBeNull();
  });
  it('names codes and labels', () => {
    expect(prizeCode('scratch', 10)).toBe('RASCA10'); expect(prizeCode('wheel', 20)).toBe('RULETA20'); expect(prizeLabel(15)).toBe('15 % de descuento');
  });
  it('writes the question from the categories, else asks who it is for', () => {
    expect(questionFor(['Gelatos', 'Copas', 'Para regalar', 'Para compartir', 'Extra'])).toEqual({ text: '¿Qué se te antoja más?', answers: ['Gelatos', 'Copas', 'Para regalar', 'Para compartir'] });
    expect(questionFor(['Pan'])).toEqual({ text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar', 'Para compartir'] });
  });
  it('rebalances chances to 100 with larger prizes rarer', () => {
    expect(rebalance([5, 10, 15, 20])).toEqual([40, 30, 20, 10]);
    const three = rebalance([10, 20, 30]); expect(three.reduce((a, b) => a + b, 0)).toBe(100); expect(three[0]).toBeGreaterThan(three[2]);
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/store-popups/popup-games.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Spec 2026-11-09 popup games: rasca y gana and ruleta; everyone wins a real prize, drawn and signed by the server. */
export const POPUP_GAMES = ['scratch', 'wheel'] as const;
export type PopupGame = (typeof POPUP_GAMES)[number];
export type GamePrize = { promoCodeId: string; label: string; chance: number };
export type GameQuestion = { text: string; answers: string[] };
export type PopupGameSettings = { popupGame?: string | null; popupGamePrizes?: GamePrize[]; popupQuestion?: GameQuestion | null };
export const readGame = (value: unknown): PopupGame | null => ((POPUP_GAMES as readonly unknown[]).includes(value) ? value as PopupGame : null);

/** roll is 0..99; prizes are in order and their chances sum to 100. */
export function drawPrize(prizes: GamePrize[], roll: number): GamePrize | null {
  let edge = 0;
  for (const prize of prizes) { edge += prize.chance; if (roll < edge) return prize; }
  return prizes.at(-1) ?? null;
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`game:${payload}`).digest('base64url');
export function createGameToken(storeId: string, promoCodeId: string, expMs: number, secret: string): string {
  const body = Buffer.from(`${promoCodeId}.${expMs}`).toString('base64url');
  return `${body}.${sign(`${storeId}:${promoCodeId}:${expMs}`, secret)}`;
}
export function readGameToken(token: string, storeId: string, secret: string, now = Date.now()): string | null {
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const [promoCodeId, exp] = Buffer.from(body, 'base64url').toString().split('.');
  const expMs = Number(exp);
  if (!promoCodeId || !Number.isFinite(expMs) || expMs < now) return null;
  const expected = Buffer.from(sign(`${storeId}:${promoCodeId}:${expMs}`, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? promoCodeId : null;
}

export const DEFAULT_PRIZES = [5, 10, 15, 20] as const;
export const prizeCode = (game: PopupGame, percent: number) => `${game === 'scratch' ? 'RASCA' : 'RULETA'}${percent}`;
export const prizeLabel = (percent: number) => `${percent} % de descuento`;
/** Larger prizes rarer: weights n…1 by size, scaled to 100 (the remainder goes to the smallest prize). */
export function rebalance(percents: number[]): number[] {
  const order = percents.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const weights = order.map((_, rank) => order.length - rank);
  const total = weights.reduce((a, b) => a + b, 0);
  const chances = weights.map(w => Math.floor((w * 100) / total));
  chances[0] += 100 - chances.reduce((a, b) => a + b, 0);
  const out = new Array<number>(percents.length);
  order.forEach(([, index], rank) => { out[index] = chances[rank]; });
  return out;
}
export function questionFor(categories: string[]): GameQuestion {
  const names = categories.map(name => name.trim()).filter(name => name && name.length <= 40);
  return names.length >= 3 ? { text: '¿Qué se te antoja más?', answers: names.slice(0, 4) } : { text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar', 'Para compartir'] };
}
```

- [ ] **Step 4: Run** → PASS (6 tests).

---

### Task 2: Server — play, claim, game settings

**Files:**
- Create `apps/api/src/store-popups/popup-game.service.ts`, `popup-game.service.spec.ts`
- Modify `apps/api/src/store-popups/store-popup.module.ts` (provide/export `PopupGameService`)
- Modify `apps/api/src/retention/retention.dto.ts`, `retention.service.ts`, `retention.controller.ts`, `retention.module.ts` (import `StorePopupModule`)

**Interfaces — Produces:**
- `PopupGameService.play(storeId, roll?): Promise<{ prize: { label: string }; gameToken: string; slices: string[]; at: number } | null>`
- `PopupGameService.claim(storeId, gameToken, wasSubscribed): Promise<{ code?: string; message?: string }>`
- `PopupGameService.enable(storeId, game)`, `disable(storeId)`, `setTopPrize(storeId, percent)`, `setQuestion(storeId, q | null)` → saved `PopupGameSettings`.
- `publicRetentionSettings` adds `popupGame`, `popupGameSlices`, `popupQuestion` (game on and ≥ 2 prizes).

- [ ] **Step 1: Service tests** (`popup-game.service.spec.ts`)

```ts
import { PopupGameService } from './popup-game.service';
import { createGameToken } from './popup-games';

function setup() {
  let settings: Record<string, unknown> | null = null;
  const codes: Array<{ id: string; storeId: string; code: string; discountType: string; discountValue: number; isActive: boolean }> = [];
  const prisma: any = {
    storeRetention: { findUnique: jest.fn(async () => (settings ? { settings } : null)), upsert: jest.fn(async ({ update }: any) => { settings = update.settings; }) },
    category: { findMany: jest.fn(async () => [{ name: 'Gelatos' }, { name: 'Copas' }, { name: 'Para regalar' }]) },
    promoCode: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const found = codes.find(c => c.storeId === where.storeId_code.storeId && c.code === where.storeId_code.code);
        if (found) { Object.assign(found, update); return found; }
        const row = { id: `id-${create.code}`, ...create }; codes.push(row); return row;
      }),
      findMany: jest.fn(async ({ where }: any) => codes.filter(c => c.storeId === where.storeId && where.id.in.includes(c.id) && c.isActive === where.isActive)),
      findFirst: jest.fn(async ({ where }: any) => codes.find(c => c.id === where.id && c.storeId === where.storeId && c.isActive === where.isActive) ?? null),
    },
  };
  const config = { get: jest.fn(() => 'secret') };
  return { service: new PopupGameService(prisma, config as never), codes, read: () => settings };
}

describe('PopupGameService', () => {
  it('turns a game on with four real codes, chances 40/30/20/10 and a question from the categories', async () => {
    const { service, codes, read } = setup();
    await service.enable('s1', 'scratch');
    expect(codes.map(c => [c.code, c.discountType, c.discountValue, c.isActive])).toEqual([['RASCA5', 'PERCENT', 5, true], ['RASCA10', 'PERCENT', 10, true], ['RASCA15', 'PERCENT', 15, true], ['RASCA20', 'PERCENT', 20, true]]);
    expect(read()).toMatchObject({ popupGame: 'scratch', popupQuestion: { text: '¿Qué se te antoja más?', answers: ['Gelatos', 'Copas', 'Para regalar'] } });
    expect((read()!.popupGamePrizes as any[]).map(p => [p.label, p.chance])).toEqual([['5 % de descuento', 40], ['10 % de descuento', 30], ['15 % de descuento', 20], ['20 % de descuento', 10]]);
  });
  it('plays: draws a usable prize, signs it, returns the slices and its index — never the code', async () => {
    const { service } = setup();
    await service.enable('s1', 'wheel');
    const result = (await service.play('s1', 45))!;
    expect(result.prize.label).toBe('10 % de descuento');
    expect(result.slices).toHaveLength(4); expect(result.at).toBe(1);
    expect(JSON.stringify(result)).not.toContain('RULETA');
  });
  it('skips switched-off codes and refuses to play with fewer than two usable prizes', async () => {
    const { service, codes } = setup();
    await service.enable('s1', 'scratch');
    codes.slice(1).forEach(c => { c.isActive = false; });
    await expect(service.play('s1', 10)).resolves.toBeNull();
  });
  it('claims once per email; forged, expired or switched-off prizes give a message', async () => {
    const { service, codes } = setup();
    await service.enable('s1', 'scratch');
    const token = createGameToken('s1', 'id-RASCA10', Date.now() + 60_000, 'secret');
    await expect(service.claim('s1', token, false)).resolves.toEqual({ code: 'RASCA10' });
    await expect(service.claim('s1', token, true)).resolves.toEqual({ message: 'Este correo ya recibió su premio.' });
    await expect(service.claim('s1', 'bad.token', false)).resolves.toEqual({ message: 'Tu premio venció; vuelve a jugar.' });
    codes.find(c => c.code === 'RASCA10')!.isActive = false;
    await expect(service.claim('s1', token, false)).resolves.toEqual({ message: 'Tu premio venció; vuelve a jugar.' });
  });
  it('moves the top prize and keeps chances summing to 100', async () => {
    const { service, codes, read } = setup();
    await service.enable('s1', 'scratch');
    await service.setTopPrize('s1', 25);
    expect(codes.some(c => c.code === 'RASCA25' && c.discountValue === 25)).toBe(true);
    const prizes = read()!.popupGamePrizes as Array<{ label: string; chance: number }>;
    expect(prizes.map(p => p.label)).toContain('25 % de descuento');
    expect(prizes.reduce((sum, p) => sum + p.chance, 0)).toBe(100);
  });
});
```

  Run `npx jest src/store-popups/popup-game.service.spec.ts` → FAIL.

- [ ] **Step 2: Implement `popup-game.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { createGameToken, DEFAULT_PRIZES, drawPrize, prizeCode, prizeLabel, questionFor, readGame, readGameToken, rebalance, type GamePrize, type GameQuestion, type PopupGame, type PopupGameSettings } from './popup-games';

const TOKEN_MS = 30 * 60_000;
const EXPIRED = 'Tu premio venció; vuelve a jugar.';
const percentOf = (label: string) => Number(/^(\d+)/.exec(label)?.[1] ?? 0);

@Injectable()
export class PopupGameService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private secret() { return this.config.get<string>('app.orderTrackingSecret') ?? ''; }
  private async stored(storeId: string): Promise<Record<string, unknown>> {
    return ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings as Record<string, unknown> | undefined) ?? {};
  }
  /** Only the game keys are added to the stored row (the defaults are never written — review 2026-11-09). */
  private async write(storeId: string, change: PopupGameSettings): Promise<PopupGameSettings> {
    const next = { ...(await this.stored(storeId)), ...change };
    await this.prisma.storeRetention.upsert({ where: { storeId }, create: { storeId, settings: next as never }, update: { settings: next as never } });
    return { popupGame: next.popupGame as string | null, popupGamePrizes: next.popupGamePrizes as GamePrize[], popupQuestion: next.popupQuestion as GameQuestion | null };
  }
  private async usable(storeId: string, prizes: GamePrize[]): Promise<GamePrize[]> {
    const active = await this.prisma.promoCode.findMany({ where: { storeId, id: { in: prizes.map(p => p.promoCodeId) }, isActive: true }, select: { id: true } });
    return prizes.filter(p => active.some((code: { id: string }) => code.id === p.promoCodeId));
  }
  private async prizesFor(storeId: string, game: PopupGame, percents: number[]): Promise<GamePrize[]> {
    const chances = rebalance(percents);
    const prizes: GamePrize[] = [];
    for (const [i, percent] of percents.entries()) {
      const code = prizeCode(game, percent);
      const row = await this.prisma.promoCode.upsert({ where: { storeId_code: { storeId, code } }, create: { storeId, code, discountType: 'PERCENT', discountValue: percent, isActive: true }, update: { isActive: true } });
      prizes.push({ promoCodeId: row.id, label: prizeLabel(percent), chance: chances[i] });
    }
    return prizes;
  }

  async play(storeId: string, roll = randomInt(0, 100)) {
    const settings = await this.stored(storeId);
    if (!readGame(settings.popupGame)) return null;
    const prizes = await this.usable(storeId, (settings.popupGamePrizes as GamePrize[] | undefined) ?? []);
    if (prizes.length < 2) return null;
    const sum = prizes.reduce((total, p) => total + p.chance, 0) || 1;
    const scaled = prizes.map(p => ({ ...p, chance: (p.chance * 100) / sum }));
    const prize = drawPrize(scaled, roll)!;
    const at = scaled.indexOf(prize);
    return { prize: { label: prize.label }, gameToken: createGameToken(storeId, prize.promoCodeId, Date.now() + TOKEN_MS, this.secret()), slices: prizes.map(p => p.label), at };
  }
  async claim(storeId: string, token: string, wasSubscribed: boolean): Promise<{ code?: string; message?: string }> {
    if (wasSubscribed) return { message: 'Este correo ya recibió su premio.' };
    const id = readGameToken(token, storeId, this.secret());
    if (!id) return { message: EXPIRED };
    const code = await this.prisma.promoCode.findFirst({ where: { id, storeId, isActive: true } });
    return code ? { code: code.code } : { message: EXPIRED };
  }
  async enable(storeId: string, game: PopupGame) {
    const settings = await this.stored(storeId);
    const categories = await this.prisma.category.findMany({ where: { storeId }, select: { name: true }, orderBy: { sortOrder: 'asc' }, take: 8 });
    return this.write(storeId, { popupGame: game, popupGamePrizes: await this.prizesFor(storeId, game, [...DEFAULT_PRIZES]),
      popupQuestion: (settings.popupQuestion as GameQuestion | null | undefined) ?? questionFor(categories.map((c: { name: string }) => c.name)) });
  }
  disable(storeId: string) { return this.write(storeId, { popupGame: null }); }
  async setTopPrize(storeId: string, percent: number) {
    const settings = await this.stored(storeId);
    const game = readGame(settings.popupGame) ?? 'scratch';
    const percents = ((settings.popupGamePrizes as GamePrize[] | undefined) ?? []).map(p => percentOf(p.label)).sort((a, b) => a - b);
    const next = [...new Set([...(percents.length ? percents.slice(0, -1) : [5, 10, 15]), percent])].sort((a, b) => a - b);
    return this.write(storeId, { popupGamePrizes: await this.prizesFor(storeId, game, next) });
  }
  setQuestion(storeId: string, question: GameQuestion | null) { return this.write(storeId, { popupQuestion: question }); }
}
```

  Module: `providers: [PopupLookService, PopupGameService], exports: [PopupLookService, PopupGameService]` (ConfigModule is global in this app — check `app.module.ts` for `ConfigModule.forRoot({ isGlobal: true })`; if not, import it). Run → PASS (5 tests).

- [ ] **Step 3: Retention wiring tests** — append to `retention-popup.spec.ts` (the `service()` helper there builds `s` with `Object.create(RetentionService.prototype)`; set `s.games = { claim: jest.fn(async () => ({ code: 'RASCA10' })) }` and `prisma.storeNewsletterSubscriber = { findUnique: jest.fn(async () => null) }`):

```ts
describe('popup games (spec 2026-11-09)', () => {
  const PRIZES = [{ promoCodeId: 'p5', label: '5 % de descuento', chance: 60 }, { promoCodeId: 'p10', label: '10 % de descuento', chance: 40 }];
  it('tells the page the game, its prize labels and the question — never the codes', () => {
    const shown = publicRetentionSettings({ ...DEFAULT_RETENTION, popupGame: 'wheel', popupGamePrizes: PRIZES, popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } } as never, 'miga') as Record<string, unknown>;
    expect(shown).toMatchObject({ popupGame: 'wheel', popupGameSlices: ['5 % de descuento', '10 % de descuento'], popupQuestion: { text: '¿Para quién?' } });
    expect(JSON.stringify(shown)).not.toMatch(/p5|p10|popupGamePrizes/);
    expect(publicRetentionSettings({ ...DEFAULT_RETENTION, popupGame: 'wheel', popupGamePrizes: PRIZES.slice(0, 1) } as never, 'miga')).not.toHaveProperty('popupGame');
  });
  it('keeps the game when Ajustes saves', async () => {
    const { s, tx } = service();
    tx.storeRetention.findUnique.mockResolvedValue({ settings: { ...DEFAULT_RETENTION, popupGame: 'scratch', popupGamePrizes: PRIZES, popupQuestion: null }, revision: 3 } as never);
    await s.save('m1', 's1', dto({ revision: 3 }));
    expect((tx.storeRetention.updateMany.mock.calls[0] as any)[0].data.settings).toMatchObject({ popupGame: 'scratch', popupGamePrizes: PRIZES });
  });
  it('a game signup returns the prize code and stores a valid answer', async () => {
    const { s, prisma, tx } = service({ popupGame: 'scratch', popupGamePrizes: PRIZES, popupQuestion: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] } });
    (s as any).games = { claim: jest.fn(async () => ({ code: 'RASCA10' })) };
    (prisma as any).storeNewsletterSubscriber = { findUnique: jest.fn(async () => null) };
    expect(await s.subscribe(store, 'ana@example.com', { source: 'popup', gameToken: 't', answer: 'Para regalar' } as never)).toEqual({ subscribed: true, code: 'RASCA10' });
    expect((s as any).games.claim).toHaveBeenCalledWith('s1', 't', false);
    expect(tx.storeNewsletterSubscriber.upsert.mock.calls[0][0].create.interests).toEqual(['Para regalar']);
  });
});
```

  Run `npx jest src/retention/retention-popup.spec.ts` → FAIL.

- [ ] **Step 4: Implement**
  - DTO `RetentionSubscribeDto`: `@IsOptional() @IsString() @MaxLength(400) gameToken?: string;` `@IsOptional() @IsString() @MaxLength(40) answer?: string;`
    New DTOs: `class GameQuestionDto { @IsString() @MinLength(1) @MaxLength(80) text!: string; @IsArray() @ArrayMinSize(2) @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(40, { each: true }) answers!: string[]; }`
    `export class PopupGameDto { @IsOptional() @IsIn(['scratch', 'wheel', 'off']) game?: string; @IsOptional() @IsInt() @Min(5) @Max(50) topPrize?: number; @IsOptional() @ValidateIf((_, v) => v !== null) @ValidateNested() @Type(() => GameQuestionDto) question?: GameQuestionDto | null; }`
  - `publicRetentionSettings(s: RetentionSettings & PopupLookSettings & PopupGameSettings, slug?)` adds
    `...(readGame(s.popupGame) && (s.popupGamePrizes?.length ?? 0) >= 2 ? { popupGame: s.popupGame, popupGameSlices: s.popupGamePrizes!.map(p => p.label), ...(s.popupQuestion ? { popupQuestion: s.popupQuestion } : {}) } : {})`.
  - `KEPT_SETTINGS` adds `'popupGame', 'popupGamePrizes', 'popupQuestion'`.
  - `RetentionService` constructor gains `@Optional() private readonly games?: PopupGameService`. In `subscribe`: profile type adds `gameToken`, `answer`; before the transaction `const existed = profile.gameToken ? Boolean(await this.prisma.storeNewsletterSubscriber.findUnique({ where: { storeId_email: { storeId: store.id, email } }, select: { id: true } })) : false;`;
    the answer joins `details.interests` when `(settings as PopupGameSettings).popupQuestion?.answers.includes(profile.answer)` (skip the category check for it); after the transaction:
    `if (profile.gameToken && this.games) return { subscribed: true, ...(await this.games.claim(store.id, profile.gameToken, existed)) };` (before the welcome-code lookup).
  - Controller (`RetentionPublicController`): inject `PopupGameService`; `@Post('play') @Throttle({ default: { limit: 10, ttl: 60000 } }) async play(@Param('slug') slug: string) { const store = await findActiveStoreBySlug(this.prisma, slug); const result = await this.games.play(store.id); if (!result) throw new BadRequestException('Este juego no está disponible.'); return result; }`
    and pass `gameToken`/`answer` through in `subscribe`. `RetentionController`: `@Put('game') async game(@CurrentMerchant() m, @Param('storeId') id, @Body() dto: PopupGameDto)` → `await this.retention.owner(m.id, id)`; `game === 'off'` → `disable`; `'scratch'|'wheel'` → `enable`; then `topPrize` → `setTopPrize`; `question !== undefined` → `setQuestion`; return the last result.
  - `retention.module.ts`: import `StorePopupModule`.
  Run both specs → PASS.

---

### Task 3: Render harness reads the game

**Files:** Modify `apps/api/src/store-popups/popup-render.ts`.

- [ ] Add to `PopupMeasure`: `game?: { step: string | null; play: PopupBox | null; tab: PopupBox | null }` from `[data-game-step]` (its value), `[data-game-play]` and `.pagosya-game-tab`. Add `actions?: Array<'play' | 'claim' | 'close'>` to `PopupRenderInput`, run after the popup opens: `play` → click `[data-game-action=play]`, then wait for `[data-game-step=reveal]` (5 s); `claim` → click `[data-game-action=claim]`; `close` → click `.signup-close`. Measure after the last action. (Its tests are Task 4's.)

---

### Task 4: retention.js — scratch, wheel, reveal, question, claim, tab

**Files:** Modify `packages/storefront-kit/kit/retention.js`; Test `apps/api/src/store-popups/popup-render.spec.ts`

- [ ] **Step 1: Tests**

```ts
describe('popup games render (spec 2026-11-09)', () => {
  const SLICES = ['5 % de descuento', '10 % de descuento', '15 % de descuento', '20 % de descuento'];
  for (const game of ['scratch', 'wheel'] as const) for (const look of POPUP_LOOK_IDS) {
    it(`${game} in ${look}: the game shows at desktop and phone width`, async () => {
      const measures = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: look, popupGame: game, popupGameSlices: SLICES }, look: LIGHT, photo: PHOTO }))!;
      for (const m of measures) { expect(m.game?.step).toBe('play'); expect(m.game?.play?.visible).toBe(true); expect(m.game!.play!.height).toBeGreaterThanOrEqual(160); expect(m.smallText).toEqual([]); }
    });
  }
  it('reveals the exact prize, then asks the question', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'clasica', popupGame: 'wheel', popupGameSlices: SLICES.slice(0, 2), popupQuestion: { text: '¿Para quién compras?', answers: ['Para mí', 'Para regalar'] } }, look: LIGHT, photo: PHOTO, actions: ['play', 'claim'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.step).toBe('question');
  });
  it('leaves the corner tab after closing without claiming', async () => {
    const [m] = (await measurePopup({ storeName: 'Miga Dorada', settings: { ...WORDS, popupLook: 'portada', popupGame: 'scratch', popupGameSlices: SLICES.slice(0, 2) }, look: LIGHT, photo: PHOTO, actions: ['close'] }, [{ width: 390, height: 844 }]))!;
    expect(m.game?.tab?.visible).toBe(true);
  });
});
```

  Run → FAIL.

- [ ] **Step 2: Implement** in retention.js (inside the IIFE; `mountSignup` uses it when `['scratch','wheel'].includes(settings.popupGame) && settings.popupGameSlices?.length >= 2`):
  - `gameHtml` replaces `formHtml` in the `pya-form` slot (and in the built-in layout): `<div class="pagosya-game" data-game-step="play">…</div>`, re-rendered per step by a `renderGame(step)` function:
    - **play** — scratch: `<div class="game-scratch" data-game-play><p class="game-prize"></p><canvas width="320" height="180" aria-hidden="true"></canvas></div><button type="button" class="signup-submit" data-game-action="play">Rascar</button>`;
      wheel: `<div class="game-wheel" data-game-play>${wheelSvg(slices)}<span class="game-pointer" aria-hidden="true"></span></div><button type="button" class="signup-submit" data-game-action="play">Girar</button>`;
    - **reveal** — `<p class="game-won" role="status">¡Ganaste <strong>${escape(label)}</strong>!</p><button type="button" class="signup-submit" data-game-action="claim">Reclamar</button>`;
    - **question** (only when `settings.popupQuestion`) — `<p class="game-question">${escape(text)}</p><div class="game-answers">${answers.map(a => `<button type="button" class="game-answer" data-game-answer="${escape(a)}">${escape(a)}</button>`)}</div><button type="button" class="game-skip" data-game-answer="">Saltar</button>`;
    - **email** — the looks' short form; its submit sends `{ email, consent: true, source: 'popup', gameToken, ...(answer ? { answer } : {}) }` (demo: no network, «Prueba completada…»);
    - **done** — the existing code line with «Copiar» (or the server's `message`).
  - Draw on «play»: saved `localStorage pagosya:game:{slug}` (unexpired) is reused; else non-demo `await api('play')`, demo/preview a local `{ prize: { label: slices[r] }, gameToken: '', slices, at: r }`; save `{ prize, gameToken, at, exp: Date.now() + 1_800_000 }`.
  - Scratch: fill the canvas with the accent mixed toward gold (`color-mix(in srgb, var(--signup-accent), #d4af37 60%)` read via `getComputedStyle`) and «Rasca aquí» (20px); pointer/touch `pointermove` draws `destination-out` circles r=22; every 12 moves sample `getImageData` alpha; ≥ 45 % clear → reveal. The «Rascar» button clears at once.
  - Wheel: `wheelSvg` — slices as `path` sectors from the centre, fills alternating `var(--signup-accent)` / `var(--signup-paper)`, label `text` 13px in the opposite colour; spin by `style.transform = rotate(${1800 + 360 - (at + 0.5) * (360 / n)}deg)` with `transition: transform 4s cubic-bezier(.17,.67,.2,1)`; `matchMedia('(prefers-reduced-motion: reduce)')` → no transition; `transitionend` (or at once) → reveal.
  - Corner tab: on dialog close while step ∉ {done}, set `localStorage pagosya:game-tab:{slug} = '1'`; on mount, when set, not dismissed (`pagosya:game-tab-off:{slug}` within 30 days) and not on checkout/receipt/recovery pages, append `<div class="pagosya-game-tab"><button type="button" data-game-tab>Prueba tu suerte</button><button type="button" data-game-tab-off aria-label="Ocultar">×</button></div>` fixed bottom-left (z-index 40); click → open the dialog at its saved step; × → hide for 30 days.
  - CSS (signup style string): `.pagosya-game{display:grid;gap:14px;justify-items:center;text-align:center}.game-scratch,.game-wheel{position:relative;width:min(320px,100%);min-height:180px}.game-scratch canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:12px;touch-action:none}.game-prize{display:grid;place-items:center;height:180px;margin:0;font:700 22px/1.2 var(--signup-heading)}.game-wheel svg{width:100%;height:auto;aspect-ratio:1}.game-pointer{position:absolute;top:-6px;left:50%;translate:-50% 0;border:12px solid transparent;border-top:18px solid var(--signup-ink)}.game-answers{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.game-answer{min-height:44px;padding:0 16px;border:1.5px solid var(--signup-ink);border-radius:999px;background:transparent;color:inherit;font:600 14px var(--signup-body)}.game-skip{background:none;border:0;color:inherit;text-decoration:underline;font:13px var(--signup-body)}.pagosya-game-tab{position:fixed;left:16px;bottom:16px;z-index:40;display:flex;background:var(--signup-ink);color:var(--signup-paper);border-radius:4px}.pagosya-game-tab button{background:none;border:0;color:inherit;font:700 13px/1 var(--signup-body);letter-spacing:.08em;text-transform:uppercase;padding:14px 12px;min-height:44px}`
  Run the render spec → PASS; `node kit/check-runtimes.mjs` → parsed.

---

### Task 5: Hosted parent forwards play

**Files:** Modify `apps/checkout/src/source-storefront.ts` (the `write` list near line 258); Test: the checkout test that covers hosted retention requests (`grep -ln "hosted-request" apps/checkout/src/*.test.ts`).

- [ ] Test: a hosted `retention` request with `path: 'play'` and no payload is sent as `POST …/retention/play`; a `subscribe` payload keeps `gameToken` and `answer`. Run → FAIL.
- [ ] `const write = ['subscribe', 'cards', 'carts', 'play'].includes(path) || …` (`play` stays non-interactive: no trusted form). Run → PASS.

---

### Task 6: YAPI chat — game, prize, question

**Files:** Modify `apps/api/src/storefront-source/source-store-edit.ts`, `source-store-edit.spec.ts`, `source-chat.service.ts`.

- [ ] **Tests** (in `source-store-edit.spec.ts`):

```ts
  it('turns the popup into a game, moves the top prize, sets or drops the question (spec 2026-11-09)', () => {
    expect(applyStoreOps(state(), [op('popup', 'game', 'scratch')]).change.popupGame).toEqual({ action: 'game', game: 'scratch' });
    expect(applyStoreOps(state(), [op('popup', 'game', 'wheel')]).done).toEqual(['tu ventana de suscripción ahora es una ruleta con premios de 5 %, 10 %, 15 % y 20 % de descuento']);
    expect(applyStoreOps(state(), [op('popup', 'game', 'off')]).change.popupGame).toEqual({ action: 'game', game: 'off' });
    expect(applyStoreOps(state(), [op('popup', 'prize', '25 %')]).change.popupGame).toEqual({ action: 'topPrize', percent: 25 });
    expect(applyStoreOps(state(), [op('popup', 'prize', '80')]).refused).toEqual(['El premio mayor va de 5 % a 50 %.']);
    expect(applyStoreOps(state(), [op('popup', 'question', 'sin pregunta')]).change.popupGame).toEqual({ action: 'question', question: null });
    expect(applyStoreOps(state(), [op('popup', 'question', '¿Cuál es tu sabor favorito?|Chocolate|Vainilla|Frutilla')]).change.popupGame).toEqual({ action: 'question', question: { text: '¿Cuál es tu sabor favorito?', answers: ['Chocolate', 'Vainilla', 'Frutilla'] } });
    expect(readStoreOps([op('popup', 'game', 'wheel'), op('popup', 'prize', '20'), op('popup', 'question', 'x|a|b')])).toHaveLength(3);
  });
```

  Run → FAIL.
- [ ] **Implement:** `STORE_FIELDS` += `'game', 'prize', 'question'`; `StoreChange.popupGame?: { action: 'game'; game: 'scratch' | 'wheel' | 'off' } | { action: 'topPrize'; percent: number } | { action: 'question'; question: { text: string; answers: string[] } | null }`; `storeChangeEmpty` checks it; prompt rule: `field game (value scratch = «rasca y gana», wheel = «ruleta», off = sin juego); field prize (value = el premio mayor, «25 %»); field question (value = «pregunta|respuesta|respuesta…», 2 a 4 respuestas, o «sin pregunta»).`; branches:
  game → readGame or 'off' else refused «Los juegos son rasca y gana y ruleta.»; done texts «…ahora es un rasca y gana con premios de 5 %, 10 %, 15 % y 20 % de descuento» / «…una ruleta…» / «quité el juego de tu ventana de suscripción»;
  prize → integer 5–50 else «El premio mayor va de 5 % a 50 %.», done «el premio mayor de tu juego ahora es {n} % de descuento»;
  question → «sin pregunta» → null; else split `|`, text ≤ 80, 2–4 answers ≤ 40 each, else refused «Escribe la pregunta y 2 a 4 respuestas.».
  Chat service `writeStoreChange`: inject `@Optional() popupGames?: PopupGameService`; game → `enable`/`disable`, topPrize → `setTopPrize`, question → `setQuestion`.
  Run `source-store-edit.spec.ts` and `source-chat-store-edit.spec.ts` → PASS.

---

### Task 7: Studio «Juego»

**Files:** Modify `apps/merchant-studio/src/api.ts`, `retention.ts`; Test `apps/merchant-studio/src/retention.test.ts`.

- [ ] **Tests:**

```ts
  it('turns a game on and moves its top prize (spec 2026-11-09)', async () => {
    (api as any).popupGame = vi.fn().mockResolvedValue({ popupGame: 'wheel', popupGamePrizes: [], popupQuestion: null });
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    host.querySelector<HTMLSelectElement>('[name=popupGame]')!.value = 'wheel';
    host.querySelector<HTMLButtonElement>('[data-save-game]')!.click();
    await vi.waitFor(() => expect((api as any).popupGame).toHaveBeenCalledWith('s1', { game: 'wheel' }));
    host.querySelector<HTMLInputElement>('[name=topPrize]')!.value = '25';
    host.querySelector<HTMLButtonElement>('[data-save-game]')!.click();
    await vi.waitFor(() => expect((api as any).popupGame).toHaveBeenLastCalledWith('s1', { game: 'wheel', topPrize: 25 }));
  });
```

  Run `cd apps/merchant-studio && npx vitest run src/retention.test.ts` → FAIL.
- [ ] **Implement:** `api.ts`: `popupGame(storeId: string, body: Record<string, unknown>) { return this.request(`/stores/${encodeURIComponent(storeId)}/retention/game`, { method: 'PUT', body: JSON.stringify(body) }); }`.
  `retention.ts` section 02, after «Estilo de la ventana»: `<div class="brand-fields" data-game-panel><label>Juego<select name="popupGame">` (Ninguno `off` / Rasca y gana `scratch` / Ruleta `wheel`, selected from `s.popupGame`) `</select></label><label>Premio mayor (%)<input name="topPrize" type="number" min="5" max="50" value="${maxPercent(s.popupGamePrizes)}"></label><button type="button" data-save-game>Guardar juego</button></div>` plus a read-only list of the prizes «10 % de descuento · 30 %». Handler: `body = { game }` and, when `topPrize` differs from the shown top prize and game ≠ off, `topPrize: Number(value)`; `await api.popupGame(storeId, body)`; then reload the state and re-render (as `run` does).
  Run → PASS; `npx tsc -p tsconfig.json --noEmit --incremental false`; `npx vite build --mode embedded`.

---

### Task 8: Live check

- [ ] With the dev stack up: on dooboo-pop3 «pon una ruleta en la ventana de suscripción» by chat; on miga-pop1 «Rasca y gana» in the Studio; play both as a shopper at 1280 (mouse) and 390 (touch); claim with a new email → code shown, and it applies at checkout; claim again with the same email → «Este correo ya recibió su premio.»; close without claiming → the corner tab on the next page; screenshots to ~/Desktop/popup-looks/juegos.
