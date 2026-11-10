import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { favouriteQuestionFor, interestsFor, popupShapeFor, type PopupInterests, type PopupShape, createGameToken, DEFAULT_PRIZES, drawPrize, prizeLabel, prizePercent, questionFor, readGame, readGameToken, rebalance, winnerCode, type GamePrize, type GameQuestion, type PopupGame, type PopupGameSettings } from './popup-games';

const TOKEN_MS = 30 * 60_000;
const EXPIRED = 'Tu premio venció; vuelve a jugar.';

/** Spec 2026-11-09 popup games (+ addendum: single-use codes): prizes are percents; the server draws and signs one; a valid claim
 *  creates the winner's own one-use code, so no shared prize code can be guessed or passed around. */
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
  private async prizes(storeId: string): Promise<GamePrize[]> {
    const settings = await this.stored(storeId);
    if (!readGame(settings.popupGame)) return [];
    return ((settings.popupGamePrizes as GamePrize[] | undefined) ?? []).filter(prize => prizePercent(prize) > 0);
  }
  private prizesFor(percents: number[]): GamePrize[] {
    const chances = rebalance(percents);
    return percents.map((percent, i) => ({ percent, label: prizeLabel(percent), chance: chances[i] }));
  }

  /** The labels the page shows; fewer than two → the plain popup. */
  async activeSlices(storeId: string): Promise<string[]> { return (await this.prizes(storeId)).map(p => p.label); }
  async play(storeId: string, roll = randomInt(0, 100)) {
    const prizes = await this.prizes(storeId);
    if (prizes.length < 2) return null;
    const sum = prizes.reduce((total, p) => total + p.chance, 0) || 1;
    const scaled = prizes.map(p => ({ ...p, chance: (p.chance * 100) / sum }));
    const prize = drawPrize(scaled, roll)!;
    return { prize: { label: prize.label }, gameToken: createGameToken(storeId, prizePercent(prize), Date.now() + TOKEN_MS, this.secret()), slices: prizes.map(p => p.label), at: scaled.indexOf(prize) };
  }
  /** Checked before any signup, so an expired or edited prize subscribes nobody (review 2026-11-09). */
  async validPrize(storeId: string, token: string): Promise<boolean> { return readGameToken(token, storeId, this.secret()) !== null; }
  /** The winner's own code: one use, not shown in emails or the assistant; once per email. */
  async claim(storeId: string, token: string, wasSubscribed: boolean): Promise<{ code?: string; message?: string }> {
    if (wasSubscribed) return { message: 'Este correo ya recibió su premio.' };
    const percent = readGameToken(token, storeId, this.secret());
    if (percent === null) return { message: EXPIRED };
    const game = readGame((await this.stored(storeId)).popupGame) ?? 'wheel';
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.promoCode.create({ data: { storeId, code: winnerCode(game, percent), discountType: 'PERCENT', discountValue: percent, maxUses: 1, isActive: true, showInEmails: false, showInAssistant: false } });
        return { code: row.code };
      } catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error; }
    }
    return { message: EXPIRED };
  }
  async enable(storeId: string, game: PopupGame) {
    const settings = await this.stored(storeId);
    const categories = await this.prisma.category.findMany({ where: { storeId }, select: { name: true }, orderBy: { sortOrder: 'asc' }, take: 8 });
    const names = categories.map((c: { name: string }) => c.name);
    // Spec 2026-11-10 rasca y elige: the card's shape, the interests and the favourite question come from the store's own words.
    const store = await this.prisma.store?.findUnique({ where: { id: storeId }, select: { name: true, onboarding: true } }).catch(() => null);
    const products: Array<{ name: string }> = await this.prisma.paymentLink?.findMany({ where: { storeId }, select: { name: true }, take: 12 }).catch(() => []) ?? [];
    const words = [(store?.onboarding as { what?: string } | null)?.what ?? '', ...names, ...products.map(product => product.name)].join(' ');
    return this.write(storeId, { popupGame: game, popupGamePrizes: this.prizesFor([...DEFAULT_PRIZES]),
      popupQuestion: (settings.popupQuestion as GameQuestion | null | undefined) ?? questionFor(names),
      popupShape: settings.popupShape !== undefined ? settings.popupShape as string | null : popupShapeFor(words),
      popupInterests: settings.popupInterests !== undefined ? settings.popupInterests : interestsFor(words, names),
      popupFavourite: settings.popupFavourite !== undefined ? settings.popupFavourite as { text: string } | null : { text: favouriteQuestionFor(words, products.length) },
      popupContact: (settings.popupContact as string | undefined) ?? 'whatsapp' });
  }
  setShape(storeId: string, shape: PopupShape | null) { return this.write(storeId, { popupShape: shape }); }
  setContact(storeId: string, contact: 'whatsapp' | 'email') { return this.write(storeId, { popupContact: contact }); }
  setInterests(storeId: string, interests: PopupInterests | null) { return this.write(storeId, { popupInterests: interests }); }
  disable(storeId: string) { return this.write(storeId, { popupGame: null }); }
  async setTopPrize(storeId: string, percent: number) {
    const saved = ((await this.stored(storeId)).popupGamePrizes as GamePrize[] | undefined) ?? [];
    const percents = (saved.length ? saved.map(prizePercent) : [5, 10, 15]).sort((a, b) => a - b);
    // The new top is really the top — up to three smaller prizes stay (never fewer than two prizes in all).
    const below = percents.filter(p => p < percent).slice(-3);
    return this.write(storeId, { popupGamePrizes: this.prizesFor(below.length ? [...below, percent] : [Math.max(1, Math.floor(percent / 2)), percent]) });
  }
  /** Owner 2026-11-09: all prizes at once (2–6, 1–50 %); the given chances when they all come (summing 100), else bigger ones rarer. */
  setPrizes(storeId: string, prizes: Array<{ percent: number; chance?: number }>) {
    const sorted = [...prizes].sort((a, b) => a.percent - b.percent);
    const given = sorted.every(p => Number.isInteger(p.chance)) && sorted.reduce((sum, p) => sum + (p.chance ?? 0), 0) === 100;
    const chances = given ? sorted.map(p => p.chance!) : rebalance(sorted.map(p => p.percent));
    return this.write(storeId, { popupGamePrizes: sorted.map((p, i) => ({ percent: p.percent, label: prizeLabel(p.percent), chance: chances[i] })) });
  }
  setQuestion(storeId: string, question: GameQuestion | null) { return this.write(storeId, { popupQuestion: question }); }
}
