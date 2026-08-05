import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

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
      const message = exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${request.url} -> ${status}: ${message}`, stack);
    }

    const body = typeof payload === "string" ? { statusCode: status, message: payload } : payload;
    response.status(status).json(body);
  }
}
