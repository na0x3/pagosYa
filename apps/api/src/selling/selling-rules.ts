/**
 * «La tienda que vende sola» (spec 2026-11-16): the pure rules. A store tries one small selling change at a time as an A/B test
 * and keeps it only when add-to-cart per visit is at least 5% better and orders per visit do not drop; a real drop in weekly orders
 * undoes the newest kept change. Never prices, offers or codes; never removes a section.
 */
export type SellingKind = 'order' | 'best' | 'buyWord' | 'stickyBuy';
export type SellingSwitches = { order?: string[]; best?: string; buyWord?: string; stickyBuy?: boolean };
export type SellingChangeRow = { kind: string; status: string; settings: unknown; endedAt: Date | null };
export type SideStats = { visits: number; adds: number; orders: number };
export type SellingSignals = { bestSellers: Array<{ productId: string; name: string; orders: number }>; sections: Array<{ index: number; views: number; clicks: number }>; sectionNames?: Record<number, string> };
export type NextChange = { kind: SellingKind; settings: SellingSwitches; summary: string };

export const KEEP_LIFT = 0.05;
export const TEST_DAYS = 14;
export const TEST_VISITS = 300;
export const BUY_WORDS = ['Agregar', 'Comprar ahora', 'Lo quiero'] as const;
const RETRY_DAYS = 60;
const DAY = 86_400_000;

/** Only the switches the kit knows, with values it can use. */
export function cleanSwitches(raw: unknown): SellingSwitches {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const out: SellingSwitches = {};
  if (Array.isArray(input.order)) { const order = input.order.filter((value): value is string => typeof value === 'string' && /^s\d{1,2}$/.test(value)).slice(0, 40); if (order.length) out.order = order; }
  if (typeof input.best === 'string' && /^[\w-]{1,64}$/.test(input.best)) out.best = input.best;
  if (typeof input.buyWord === 'string' && (BUY_WORDS as readonly string[]).includes(input.buyWord)) out.buyWord = input.buyWord;
  if (input.stickyBuy === true) out.stickyBuy = true;
  return out;
}

/** The store's kept changes as one set of switches; a newer kept change of the same kind wins. */
export function mergeKept(changes: readonly SellingChangeRow[]): SellingSwitches {
  return changes.filter(change => change.status === 'KEPT')
    .sort((a, b) => (a.endedAt?.getTime() ?? 0) - (b.endedAt?.getTime() ?? 0))
    .reduce<SellingSwitches>((all, change) => ({ ...all, ...cleanSwitches(change.settings) }), {});
}

/** What one visitor gets: the kept switches, plus B's switches when they are on side B of a running selling test. */
export function visitorSelling(kept: SellingSwitches, experiment: { kind: string; variantSettings: unknown } | null, variant: string | undefined): SellingSwitches {
  return experiment?.kind === 'selling' && variant === 'B' ? { ...kept, ...cleanSwitches(experiment.variantSettings) } : kept;
}

/** Keep, undo or wait. `lift` is B's add-to-cart rate over A's, minus one (always a finite number). */
export function decide(stats: { days: number; a: SideStats; b: SideStats }): { decision: 'KEEP' | 'UNDO' | 'WAIT'; lift: number } {
  const { a, b } = stats;
  const ready = stats.days >= TEST_DAYS || a.visits >= TEST_VISITS && b.visits >= TEST_VISITS;
  const rate = (side: SideStats, key: 'adds' | 'orders') => side.visits > 0 ? side[key] / side.visits : 0;
  const lift = rate(a, 'adds') > 0 ? rate(b, 'adds') / rate(a, 'adds') - 1 : rate(b, 'adds') > 0 ? 1 : 0;
  if (!ready) return { decision: 'WAIT', lift };
  if (!a.visits || !b.visits) return { decision: 'UNDO', lift };
  const ordersKept = rate(b, 'orders') >= rate(a, 'orders');
  return { decision: lift >= KEEP_LIFT && ordersKept ? 'KEEP' : 'UNDO', lift };
}

/** Last week's paid orders below 80% of the weekly average of the four weeks before (and that average at least 3 a week, so one
 *  quiet week of a tiny store is not a drop). */
export function ordersDropped(lastWeek: number, previousFourWeeks: number): boolean {
  const average = previousFourWeeks / 4;
  return average >= 3 && lastWeek < average * 0.8;
}

const same = (a: SellingSwitches, b: SellingSwitches) => JSON.stringify(a) === JSON.stringify(b);

/** The next change worth trying, or null: the best seller, then a section order, then the buy word, then the sticky bar. A change
 *  equal to one undone in the last 60 days, or to what is already kept, is skipped. */
export function nextChange(signals: SellingSignals, history: readonly SellingChangeRow[], kept: SellingSwitches, now = new Date()): NextChange | null {
  const recentlyUndone = history.filter(change => change.status === 'UNDONE' && change.endedAt && now.getTime() - change.endedAt.getTime() < RETRY_DAYS * DAY).map(change => cleanSwitches(change.settings));
  const fresh = (settings: SellingSwitches) => !recentlyUndone.some(undone => same(undone, settings));
  const candidates: NextChange[] = [];
  const top = [...signals.bestSellers].sort((a, b) => b.orders - a.orders)[0];
  if (top && top.orders >= 3 && kept.best !== top.productId) candidates.push({ kind: 'best', settings: { best: top.productId }, summary: `«${top.name}» primero como Más vendido` });
  const known = signals.sections.filter(section => section.index >= 1 && section.views >= 100);
  if (known.length >= 2) {
    const indexes = known.map(section => section.index).sort((x, y) => x - y);
    const keptOrder = (kept.order ?? []).map(value => Number(value.slice(1))).filter(index => indexes.includes(index));
    const current = [...new Set([...keptOrder, ...indexes])];
    const rate = (index: number) => { const section = known.find(entry => entry.index === index)!; return section.clicks / section.views; };
    for (let i = 1; i < current.length; i++) {
      if (rate(current[i]) >= rate(current[i - 1]) * 1.2 && rate(current[i]) > 0) {
        const order = [...current]; [order[i - 1], order[i]] = [order[i], order[i - 1]];
        const name = signals.sectionNames?.[current[i]];
        candidates.push({ kind: 'order', settings: { order: order.map(index => `s${index}`) }, summary: `Subimos ${name ? `«${name}»` : `la sección ${current[i] + 1}`} un lugar` });
        break;
      }
    }
  }
  for (const word of BUY_WORDS.filter(word => word !== (kept.buyWord ?? 'Agregar') && word !== 'Agregar')) candidates.push({ kind: 'buyWord', settings: { buyWord: word }, summary: `Botón «${word}»` });
  if (!kept.stickyBuy) candidates.push({ kind: 'stickyBuy', settings: { stickyBuy: true }, summary: 'Barra de compra fija en la página de producto' });
  return candidates.find(candidate => fresh(candidate.settings)) ?? null;
}

/** The merchant's line for a finished test, e.g. «Botón «Lo quiero» — agregados +12%». */
export function finishedSummary(summary: string, decision: 'KEEP' | 'UNDO', lift: number): string {
  const percent = Math.round(lift * 100);
  return decision === 'KEEP' ? `${summary} — agregados ${percent >= 0 ? '+' : ''}${percent}%` : `${summary} — no vendió más, lo deshicimos`;
}
