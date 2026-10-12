import { HttpException } from '@nestjs/common';

/** The deadline of each interpretation attempt (the first call and its one retry or repair). */
export const SOURCE_CONVERSATION_TIMEOUT_MS = 120_000;
export const CONVERSATION_FAILURE_CODES = ['timeout', 'network', 'provider_http', 'provider_quota', 'incomplete_response', 'invalid_response'] as const;
export type ConversationFailureCode = typeof CONVERSATION_FAILURE_CODES[number];
export type ConversationDiagnostic = {
  code: ConversationFailureCode;
  attempt: number;
  timeoutMs: number;
  httpStatus?: number;
  requestId?: string;
  providerStatus?: string;
  providerCode?: string;
  upstreamStatus?: number;
  incompleteReason?: string;
};

export class SourceConversationFailure extends HttpException {
  constructor(readonly diagnostic: ConversationDiagnostic) {
    const messages: Record<ConversationFailureCode, string> = {
      timeout: `El modelo no respondió dentro de los ${diagnostic.timeoutMs / 1000} segundos de espera. La generación del sitio no comenzó. Puedes volver a intentarlo.`,
      network: 'No pudimos recibir la respuesta del proveedor de IA por un problema de conexión. La generación del sitio no comenzó. Puedes volver a intentarlo.',
      provider_http: 'El proveedor de IA rechazó la solicitud o no está disponible. La generación del sitio no comenzó. Intenta de nuevo más tarde.',
      provider_quota: 'El proveedor de IA no tiene saldo o cuota disponible.',
      incomplete_response: 'El modelo devolvió una respuesta incompleta. La generación del sitio no comenzó. Puedes volver a intentarlo.',
      invalid_response: 'YAPI no pudo interpretar la respuesta del modelo. La generación del sitio no comenzó. Puedes volver a intentarlo.',
    };
    const providerMessage = diagnostic.providerCode === 'chatgpt_authentication_unavailable' ? 'ChatGPT no pudo renovar la sesión. La sesión y el borrador se conservan. Intenta de nuevo cuando el servicio se recupere; no se usó una API de pago.' : diagnostic.providerCode === 'chatgpt_authentication_rejected' ? 'ChatGPT rechazó la autorización. Vuelve a conectar tu cuenta; tu sitio sigue guardado.' : undefined;
    super({ statusCode: diagnostic.code === 'timeout' ? 504 : 502, code: `conversation_${diagnostic.code}`, message: providerMessage || messages[diagnostic.code] }, diagnostic.code === 'timeout' ? 504 : 502);
  }
}

/** Whitelist telemetry fields: never retain provider bodies, prompts or arbitrary errors. */
export function safeConversationDiagnostic(value: ConversationDiagnostic) {
  return {
    code: CONVERSATION_FAILURE_CODES.includes(value.code) ? value.code : 'invalid_response',
    attempt: value.attempt === 2 ? 2 : 1,
    timeoutMs: SOURCE_CONVERSATION_TIMEOUT_MS,
    ...(Number.isInteger(value.httpStatus) && value.httpStatus! >= 100 && value.httpStatus! <= 599 ? { httpStatus: value.httpStatus } : {}),
    ...(typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.requestId) ? { requestId: value.requestId } : {}),
    ...(['chatgpt_authentication_unavailable','chatgpt_authentication_rejected','chatgpt_connection_unavailable','chatgpt_request_timeout','chatgpt_stream_interrupted','chatgpt_request_cancelled'].includes(value.providerCode || '') ? { providerCode: value.providerCode } : {}),
    ...(Number.isInteger(value.upstreamStatus) && value.upstreamStatus! >= 400 && value.upstreamStatus! <= 599 ? { upstreamStatus: value.upstreamStatus } : {}),
    ...(['completed', 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress'].includes(value.providerStatus || '') ? { providerStatus: value.providerStatus } : {}),
    ...(['max_output_tokens', 'content_filter'].includes(value.incompleteReason || '') ? { incompleteReason: value.incompleteReason } : {}),
  };
}
