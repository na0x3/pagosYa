import type { MerchantPlan } from '@prisma/client';

/** Plans 2026-11-07 (owner): three plans, set by hand by ops. One YAPI credit is US$0.01 of AI cost (CREDIT_MICRO_USD).
 *  Measured the same month: a new store ≈ 11 credits (worst 10 % ≈ 270), a quick edit ≈ 2, a designer request 10–40.
 *  FREE builds and edits but cannot publish. The shopper assistant has its own monthly conversations, never these credits.
 *  Prices 2026-11-08 (owner): Bs 199 / Bs 599 a month, a year = 10 months. A merchant who spends every credit still costs
 *  less in AI than the plan (1.500 ≈ Bs 177 of Bs 199, 5.000 ≈ Bs 590 of Bs 599 at Bs 11,81 per US$). */
export type PlanDetails = { id: MerchantPlan; name: string; monthlyCredits: number; canPublish: boolean; customDomain: boolean;
  /** Store emails a month (Resend). Receipts, order notices, replies and staff notices always go out; promotions stop at the cap. */
  emailsPerMonth: number; assistantConversations: number; perks: string[];
  /** Bolivianos a month, and for a year paid at once (two months free). */
  priceBob: number; yearlyPriceBob: number };

export const PLANS: Record<MerchantPlan, PlanDetails> = {
  FREE: { id: 'FREE', name: 'Gratis', monthlyCredits: 300, canPublish: false, customDomain: false, emailsPerMonth: 100, assistantConversations: 0, priceBob: 0, yearlyPriceBob: 0,
    perks: ['Crea tu tienda con YAPI', '300 créditos de YAPI al mes', 'Vista previa de tu tienda en el editor'] },
  EMPRENDEDOR: { id: 'EMPRENDEDOR', name: 'Emprendedor', monthlyCredits: 1500, canPublish: true, customDomain: true, emailsPerMonth: 2000, assistantConversations: 1000, priceBob: 199, yearlyPriceBob: 1990,
    perks: ['Publica tu tienda y cobra en línea', '1.500 créditos de YAPI al mes', 'Tu propio dominio (conéctalo o cómpralo aquí)', 'Hasta 2.000 correos al mes a tus clientes', 'Asistente de ventas: 1.000 conversaciones al mes'] },
  PRO: { id: 'PRO', name: 'Pro', monthlyCredits: 5000, canPublish: true, customDomain: true, emailsPerMonth: 10000, assistantConversations: 3000, priceBob: 599, yearlyPriceBob: 5990,
    perks: ['Todo lo de Emprendedor', '5.000 créditos de YAPI al mes', 'Hasta 10.000 correos al mes a tus clientes', 'Asistente de ventas: 3.000 conversaciones al mes'] },
};

export const PLAN_ORDER: MerchantPlan[] = ['FREE', 'EMPRENDEDOR', 'PRO'];

/** The error codes the Studio reads to open the plans instead of showing a plain error. */
export const PLAN_REQUIRED = 'PLAN_REQUIRED';
export const CREDITS_EXHAUSTED = 'CREDITS_EXHAUSTED';
