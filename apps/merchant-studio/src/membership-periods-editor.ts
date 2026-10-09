import { escapeHtml as escape } from './studio-ui';

/** Period rows of a membership product (spec 2026-10-09 §1): 1–4 distinct lengths, each with its own price. */
export type MembershipPeriodDraft = { months: 1 | 3 | 6 | 12; price: string };
const LENGTHS: Array<[MembershipPeriodDraft['months'], string]> = [[1, 'Mensual'], [3, 'Trimestral'], [6, 'Semestral'], [12, 'Anual']];
const labelOf = (months: number) => LENGTHS.find(([value]) => value === months)?.[1] ?? `Cada ${months} meses`;

export function parseMembershipPeriods(rows: MembershipPeriodDraft[]): { periods: Array<{ months: number; amount: number }>; problem: string } {
  if (!rows.length) return { periods: [], problem: 'Agrega al menos un período con su precio.' };
  if (new Set(rows.map(row => row.months)).size !== rows.length) return { periods: [], problem: 'Cada duración puede aparecer una sola vez.' };
  const periods = rows.map(row => ({ months: row.months, amount: Math.round(Number(row.price) * 100) }));
  if (periods.some(period => !Number.isSafeInteger(period.amount) || period.amount <= 0)) return { periods: [], problem: 'Cada período necesita un precio mayor que cero.' };
  return { periods, problem: '' };
}

export function membershipPeriodsHtml(rows: MembershipPeriodDraft[]): string {
  const row = (draft: MembershipPeriodDraft, index: number) => `<div class="membership-period" data-period-row="${index}">
    <label>Duración<select name="periodMonths">${LENGTHS.map(([months, label]) => `<option value="${months}"${months === draft.months ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Precio (Bs)<input name="periodPrice" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escape(draft.price)}" required></label>
    ${rows.length > 1 ? `<button type="button" class="button" data-period-remove="${index}" aria-label="Quitar período ${index + 1}">Quitar</button>` : ''}
  </div>`;
  return `${rows.map(row).join('')}${rows.length < 4 ? '<button type="button" class="button" data-period-add>Añadir período</button>' : ''}`;
}

/** Reads the rows currently in the DOM, so typed prices survive a re-render. */
export function readMembershipRows(host: HTMLElement): MembershipPeriodDraft[] {
  return [...host.querySelectorAll<HTMLElement>('[data-period-row]')].map(row => ({
    months: Number(row.querySelector<HTMLSelectElement>('[name=periodMonths]')!.value) as MembershipPeriodDraft['months'],
    price: row.querySelector<HTMLInputElement>('[name=periodPrice]')!.value,
  }));
}

export const periodsSummary = (rows: MembershipPeriodDraft[]) => rows.map(row => `${labelOf(row.months)} Bs ${row.price}`).join(' · ');
