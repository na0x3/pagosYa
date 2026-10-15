/**
 * Deadlines of the small side calls (photo descriptions, the voice sheet, tone, controls, kit touch) on the owner's ChatGPT plan.
 * The local bridge serves about two calls at once, so a side call waits behind the design-stage calls (52–122 s each, measured on
 * the 2026-10-15 live demo) and timed out before it was even answered. On the plan these deadlines grow like the design calls'
 * own (60 s → 180 s); metered runs keep the spec's values.
 */
export const PLAN_DEADLINE_FACTOR = 3;
/** All of a run's photo descriptions together, on the plan: one lane frees after the first design call. */
export const PLAN_PHOTO_DESCRIPTION_TIMEOUT_MS = 180_000;
export function sideCallDeadlineMs(ms: number, chatgptPlan: boolean | undefined): number {
  return chatgptPlan ? ms * PLAN_DEADLINE_FACTOR : ms;
}
