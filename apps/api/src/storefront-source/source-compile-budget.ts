import { createHash } from 'node:crypto';
import { Injectable, SetMetadata, applyDecorators } from '@nestjs/common';
import { ThrottlerGuard, Throttle, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';

/**
 * A ceiling on how much compiling one merchant can ask for in an hour.
 *
 * Saving a React storefront recompiles it: validateNextSources, the TypeScript
 * program, Tailwind through postcss and an esbuild bundle per page. Measured on
 * the fixture project that is ~1 second of CPU per save, and postcss and the
 * TypeScript program are synchronous, so the cost lands on the event loop and
 * every other request waits behind it.
 *
 * The per-minute limits already on these routes bound a burst but not a day:
 * twelve saves a minute, kept up, is twelve seconds of CPU every minute forever.
 * PATCH motion had no route limit at all and recompiles the whole project on a
 * four-value toggle, so it sat at the global 120/min.
 *
 * Two things make the ceiling real:
 *
 *   The budget is one bucket for the whole controller, not one per route, so it
 *   cannot be multiplied by rotating between save, motion, visual-edit and file.
 *
 *   It is counted per merchant, not per IP. The global guard keys on the address,
 *   which charges a shared office NAT for its neighbours and gives anyone with a
 *   handful of addresses a matching multiple of the budget. This guard runs after
 *   MerchantAuthGuard, so the merchant is already known.
 */

/** ~3.5 CPU-minutes an hour. Far above a person editing; far below a script. */
export const SUSTAINED_COMPILES_PER_HOUR = 200;
const COMPILE_BUDGET = 'pagosya:compile-budget';

/** Marks a route as recompiling the project, and puts it on the shared hourly budget. */
export const CompileBudget = () =>
  applyDecorators(
    SetMetadata(COMPILE_BUDGET, true),
    Throttle({ sustained: { limit: SUSTAINED_COMPILES_PER_HOUR, ttl: 3_600_000 } }),
  );

@Injectable()
export class MerchantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.merchant?.id ? `merchant:${req.merchant.id}` : `ip:${req.ip ?? 'unknown'}`;
  }

  /**
   * Routes that declared a compile budget share one key; everything else keeps the
   * per-route key, so a cheap read never spends what a recompile is allowed.
   */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const shared = name === 'sustained' && this.reflector.getAllAndOverride<boolean>(COMPILE_BUDGET, [context.getHandler(), context.getClass()]);
    // Hashed like the key the package builds, so no merchant id lands in Redis.
    return shared ? createHash('sha256').update(`${context.getClass().name}-compile-budget-${suffix}`).digest('hex') : super.generateKey(context, suffix, name);
  }

  protected async getErrorMessage(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<string> {
    // timeToExpire is zero once the window is blocked; timeToBlockExpire is the wait.
    const minutes = Math.max(1, Math.ceil(Math.max(detail.timeToBlockExpire, detail.timeToExpire) / 60));
    return `Hiciste muchos cambios seguidos en el sitio. Tu revisión sigue guardada; vuelve a intentar en ${minutes} minuto(s).`;
  }
}
