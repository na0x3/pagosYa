/**
 * What Studio does with text handed over by the dashboard (sub-project 6 of
 * docs/superpowers/specs/2026-09-26-yapi-agent-design.md). The YAPI box on any dashboard tab is already a send: the
 * merchant asked YAPI something ("hazme una tienda"), so Studio sends it and YAPI starts working. A Crecimiento
 * suggestion or a «Pídele a YAPI» line is only a draft the merchant reviews, and nothing is sent while YAPI is busy or
 * edits are unsaved.
 */
export function composeActionMode(action: { text: string; origin?: string }, state: { busy: boolean; blocked: boolean }): 'send' | 'compose' {
  // «Pídele a YAPI» (origin 'ask', spec 2026-10-21 A3) writes only the start of a request: the merchant adds the details.
  if (!action.text.trim() || action.origin === 'growth' || action.origin === 'ask' || state.busy || state.blocked) return 'compose';
  return 'send';
}
