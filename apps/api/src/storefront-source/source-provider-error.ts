import { ServiceUnavailableException } from '@nestjs/common';

export class SourceProviderQuotaException extends ServiceUnavailableException {
  constructor(provider = 'OpenAI') {
    super(`YAPI no puede continuar: la cuenta de IA del servidor agotó su saldo en ${provider}. El administrador debe recargar esa cuenta antes de reintentar. Tu sitio sigue guardado.`);
  }
}

/** An exhausted balance cannot recover through a repair or a model switch. */
export function checkSourceProviderQuota(status: number, body: any, provider = 'OpenAI'): void {
  if (provider === 'ChatGPT plan') {
    const code = body?.error?.code;
    const detail = code === 'chatgpt_authentication_unavailable' ? 'ChatGPT no pudo renovar la sesión en este momento. La sesión guardada se conserva; inténtalo cuando el servicio se recupere.'
      : code === 'chatgpt_authentication_rejected' || status === 401 || status === 403 ? 'ChatGPT rechazó la autorización. Vuelve a conectar tu cuenta de ChatGPT.'
      : status === 429 ? 'ChatGPT indicó un límite de uso. Revisa ChatGPT → Ajustes → Uso antes de reintentar.'
      : code === 'chatgpt_connection_unavailable' ? 'No se pudo conectar con ChatGPT. Comprueba la conexión antes de reintentar.'
      : code === 'chatgpt_request_timeout' ? 'ChatGPT no respondió dentro del tiempo disponible.'
      : typeof code === 'string' && code.startsWith('chatgpt_stream_') ? 'La respuesta de ChatGPT se interrumpió antes de completarse.' : null;
    if (detail) throw new ServiceUnavailableException(`YAPI no pudo continuar: ${detail} No se cambió a una API de pago. Tu sitio sigue guardado.`);
  }
  if (status === 429 && (body?.error?.code === 'credit_balance_exhausted'
    || body?.error?.code === 'insufficient_quota' || body?.error?.type === 'insufficient_quota')) {
    throw new SourceProviderQuotaException(provider);
  }
}

/** The ChatGPT-plan refusals that a second try can clear: the bridge refuses a call beyond its ~2 concurrent ones this way. */
const PLAN_REJECTION = /ChatGPT rechazó la autorización|ChatGPT indicó un límite de uso/;

/** A provider refusal (quota, ChatGPT authorization rejected, usage limit), also when it is the cause of a wrapped error.
 * A validation failure, a timeout or an abort is not one. */
export function isProviderRejection(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  if (error instanceof SourceProviderQuotaException) return true;
  if (error instanceof Error && PLAN_REJECTION.test(error.message)) return true;
  return isProviderRejection((error as { cause?: unknown }).cause, depth + 1);
}

/** How long a rejected style-lane call waits before its one retry (spec 2026-10-11 amendment "two cards"). */
export const PROVIDER_RETRY_DELAY_MS = 3000;

/** The 3 s pause before that one retry; an abort ends it at once (it rejects with the signal's reason). */
export const providerRetryPause = (signal?: AbortSignal, ms = PROVIDER_RETRY_DELAY_MS) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const onAbort = () => { clearTimeout(timer); reject(signal!.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

/** Runs `call`; when the provider rejects it, waits 3 s and runs it once more. Anything else (or an abort) is thrown as is. */
export async function retryProviderRejection<T>(call: () => Promise<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
  try { return await call(); } catch (error) {
    if (!isProviderRejection(error) || options.signal?.aborted) throw error;
    await providerRetryPause(options.signal);
    return call();
  }
}
