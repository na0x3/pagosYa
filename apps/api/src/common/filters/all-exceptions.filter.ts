import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

function redactSecrets(value: string): string {
  return value
    .replace(/\b(?:sk|pk)_(?:test|live)_[0-9A-Za-z_]+\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(?:dash|consumer|ops|whsec)_[0-9A-Za-z_-]+\b/g, "[REDACTED_TOKEN]")
    .replace(/\bpi_[0-9a-z]+_secret_[0-9A-Za-z]+\b/g, "[REDACTED_CLIENT_SECRET]")
    .replace(/([?&](?:client_secret|publishable_key|token)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]");
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

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: "Internal server error" };

    if (!isHttpException || status >= 500) {
      const message = redactSecrets(exception instanceof Error ? exception.message : String(exception));
      const stack = exception instanceof Error && exception.stack ? redactSecrets(exception.stack) : undefined;
      this.logger.error(`${request.method} ${requestPath(request)} -> ${status}: ${message}`, stack);
    }

    // A streaming/download response may already have committed its headers.
    // Attempting to write Nest's JSON error at that point throws a second
    // ERR_HTTP_HEADERS_SENT exception and can destabilize the worker.
    if (response.headersSent) return;

    const body = typeof payload === "string" ? { statusCode: status, message: payload } : payload;
    response.status(status).json(body);
  }
}
