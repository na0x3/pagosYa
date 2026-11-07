import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { IllegalStateTransitionError } from "../../payment-intents/payment-intent.state-machine";

function redactSecrets(value: string): string {
  return value
    .replace(/(\/mcp\/k\/)[^/?#\s]+/g, "$1[REDACTED]")
    .replace(/\b(?:sk|pk|mk)_(?:test|live)_[0-9A-Za-z_]+\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(?:dash|consumer|ops|whsec)_[0-9A-Za-z_-]+\b/g, "[REDACTED_TOKEN]")
    .replace(/\bpi_[0-9a-z]+_secret_[0-9A-Za-z]+\b/g, "[REDACTED_CLIENT_SECRET]")
    .replace(/([?&](?:client_secret|publishable_key|token)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]");
}

/** ISO security test 2026-11-07: Express's body parser rejects a body over the limit (413), malformed JSON (400) or a bad
 *  charset (415) with a plain error that carries its 4xx status; it used to come back as a 500 and log as a crash. */
const PARSER_MESSAGES: Record<string, string> = {
  "entity.too.large": "Request body is too large",
  "entity.parse.failed": "Malformed JSON body",
  "encoding.unsupported": "Unsupported body encoding",
  "charset.unsupported": "Unsupported body charset",
  "request.aborted": "Request aborted",
  "request.size.invalid": "Request size did not match Content-Length",
};
function parserRejection(exception: unknown): { status: number; message: string } | null {
  if (!exception || typeof exception !== "object") return null;
  const { type, status, expose } = exception as { type?: unknown; status?: unknown; expose?: unknown };
  if (typeof type !== "string" || !(type in PARSER_MESSAGES) || expose !== true) return null;
  if (typeof status !== "number" || status < 400 || status > 499) return null;
  return { status, message: PARSER_MESSAGES[type] };
}

function requestPath(request: Request): string {
  if (request.path) return request.path;
  try {
    return new URL(request.url, "http://localhost").pathname;
  } catch {
    return request.url.split("?", 1)[0];
  }
}

/**
 * Global safety net: every response still goes out in NestJS's normal
 * HttpException shape, but anything that ISN'T a well-formed HttpException
 * (or that is one but with a 5xx status) gets logged loudly with a stack
 * trace first. Without this, an unexpected error in a request handler — or
 * in one of the four background workers' request-adjacent code paths —
 * could silently become "just a 500" with nothing in the logs pointing at
 * why.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("UnhandledException");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.get?.("x-request-id") || "unknown";

    const rejected = parserRejection(exception);
    if (rejected) {
      if (!response.headersSent) response.status(rejected.status).json({ statusCode: rejected.status, message: rejected.message });
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const isStateConflict = exception instanceof IllegalStateTransitionError;
    const status = isHttpException
      ? exception.getStatus()
      : isStateConflict
        ? HttpStatus.CONFLICT
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException
      ? exception.getResponse()
      : isStateConflict
        ? { statusCode: status, message: "PaymentIntent state changed; refresh and retry" }
        : { statusCode: status, message: "Internal server error" };

    if ((!isHttpException && !isStateConflict) || status >= 500) {
      const message = redactSecrets(exception instanceof Error ? exception.message : String(exception));
      const stack = exception instanceof Error && exception.stack ? redactSecrets(exception.stack) : undefined;
      this.logger.error(`[${requestId}] ${request.method} ${redactSecrets(requestPath(request))} -> ${status}: ${message}`, stack);
    }

    // A streaming/download response may already have committed its headers.
    // Attempting to write Nest's JSON error at that point throws a second
    // ERR_HTTP_HEADERS_SENT exception and can destabilize the worker.
    if (response.headersSent) return;

    const body = typeof payload === "string" ? { statusCode: status, message: payload } : payload;
    response.status(status).json(body);
  }
}
