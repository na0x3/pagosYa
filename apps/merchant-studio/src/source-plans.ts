import { ApiError, type MerchantStudioApi, type StudioPlan, type StudioPlanSummary } from './api';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';
import './source-plans.css';

/** Plans 2026-11-07 (owner): «que el gratis no pueda publicar la tienda y cuando toque el botón de publicar le aparezca el plan».
 *  The plans window: what each plan includes, the merchant's YAPI credits this month, and a request ops answers by hand. */
export const PLAN_CODES = new Set(['PLAN_REQUIRED', 'CREDITS_EXHAUSTED']);
export const opensPlans = (error: unknown): error is ApiError => error instanceof ApiError && Boolean(error.code && PLAN_CODES.has(error.code));

const number = (value: number) => new Intl.NumberFormat('es-BO').format(value);
const day = (iso: string) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'long' }).format(new Date(iso));

export function creditsLine(summary: StudioPlanSummary): string {
  const total = summary.monthlyCredits + summary.extraCredits;
  return `Plan ${summary.plan.name} · te quedan ${number(summary.remainingCredits)} de ${number(total)} créditos de YAPI · se renuevan el ${day(summary.renewsAt)}${summary.enforced ? '' : ' · sin cobro (plan ChatGPT)'}`;
}

/** Owner 2026-11-08: Bs 199 / Bs 599 a month, a year for ten months. Older APIs send no price, so the card skips it. */
function price(plan: StudioPlan) {
  if (typeof plan.priceBob !== 'number') return '';
  if (plan.priceBob === 0) return '<p class="plan-card__price"><strong>Bs 0</strong> <span>para siempre</span></p>';
  const yearly = plan.yearlyPriceBob ? `<small>o Bs ${number(plan.yearlyPriceBob)} al año · 2 meses gratis</small>` : '';
  return `<p class="plan-card__price"><strong>Bs ${number(plan.priceBob)}</strong> <span>al mes</span>${yearly}</p>`;
}

function card(plan: StudioPlan, current: StudioPlan['id'], requested: string | null) {
  const mine = plan.id === current;
  return `<article class="plan-card${mine ? ' is-current' : ''}${plan.id === 'EMPRENDEDOR' ? ' is-featured' : ''}">
    <header><h3>${escape(plan.name)}</h3>${mine ? '<span class="plan-card__badge">Tu plan</span>' : plan.id === 'EMPRENDEDOR' ? '<span class="plan-card__badge">Para vender</span>' : ''}</header>
    ${price(plan)}
    <ul>${plan.perks.map(perk => `<li>${escape(perk)}</li>`).join('')}${plan.canPublish ? '' : '<li class="is-missing">No publica la tienda</li>'}</ul>
    ${mine ? '' : requested === plan.id ? '<p class="plan-card__sent" role="status">Pedido enviado. Te escribimos para activarlo.</p>'
      : `<button type="button" class="button ${plan.id === 'EMPRENDEDOR' ? 'primary' : ''}" data-plan-request="${plan.id}">Quiero ${escape(plan.name)}</button>`}
  </article>`;
}

/** Opens the plans; `reason` is the server's message when an action was stopped (publishing on Gratis, credits used up). */
export async function openPlans(api: MerchantStudioApi, reason = '') {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog plans-dialog'; dialog.setAttribute('aria-label', 'Planes de pagosYa');
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando planes…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
  let summary: StudioPlanSummary | null = null; let requested: string | null = null; let note = '';
  const render = () => {
    if (!summary) return;
    dialog.innerHTML = `<header class="plans-dialog__head"><div><h2>Elige tu plan</h2>${reason ? `<p class="plans-dialog__reason">${escape(reason)}</p>` : ''}
        <p class="plans-dialog__credits">${escape(creditsLine(summary))}</p></div><button type="button" class="button" data-plans-close>Cerrar</button></header>
      <div class="plans-dialog__grid">${summary.plans.map(plan => card(plan, summary!.plan.id, requested)).join('')}</div>
      <p class="plans-dialog__foot">1 cambio rápido ≈ 2 créditos · una tienda nueva ≈ 10 a 270 · un pedido al diseñador ≈ 10 a 40. Tu tienda y tus ventas nunca se detienen por los créditos.</p>
      ${note ? `<p class="plans-dialog__note" role="alert">${escape(note)}</p>` : ''}`;
  };
  dialog.addEventListener('click', async event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-plans-close]')) { dialog.close(); return; }
    const button = target.closest<HTMLButtonElement>('[data-plan-request]');
    if (!button || button.disabled) return;
    button.disabled = true; note = '';
    try { requested = (await api.requestPlan(button.dataset.planRequest as StudioPlan['id'])).requested; }
    catch (error) { note = error instanceof Error ? error.message : 'No pudimos enviar tu pedido. Intenta de nuevo.'; }
    render();
  });
  try { summary = await api.plan(); render(); }
  catch (error) { dialog.innerHTML = `<p role="alert">${escape(error instanceof Error ? error.message : 'No pudimos cargar los planes.')}</p><button type="button" class="button" data-plans-close>Cerrar</button>`; }
}
