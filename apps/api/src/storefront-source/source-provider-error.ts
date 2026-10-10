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
