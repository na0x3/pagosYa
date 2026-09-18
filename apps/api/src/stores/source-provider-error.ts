import { ServiceUnavailableException } from '@nestjs/common';

export class SourceProviderQuotaException extends ServiceUnavailableException {
  constructor(provider = 'OpenAI') {
    super(`YAPI no puede continuar: la cuenta de IA del servidor agotó su saldo en ${provider}. El administrador debe recargar esa cuenta antes de reintentar. Tu sitio sigue guardado.`);
  }
}

/** An exhausted balance cannot recover through a repair or a model switch. */
export function checkSourceProviderQuota(status: number, body: any, provider = 'OpenAI'): void {
  if ((provider === 'DeepSeek' && status === 402) || status === 429 && (body?.error?.code === 'credit_balance_exhausted'
    || body?.error?.code === 'insufficient_quota' || body?.error?.type === 'insufficient_quota')) {
    throw new SourceProviderQuotaException(provider);
  }
}
