import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, of } from "rxjs";
import { tap } from "rxjs/operators";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

function hashRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method}:${path}:${JSON.stringify(body ?? {})}`).digest("hex");
}

/**
 * Idempotency-Key support for mutating requests. Backed by Postgres (not a
 * separate cache) so there is one source of truth for "did this write already
 * happen" — no window where a cache and the DB can disagree.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const rawKey = request.headers["idempotency-key"];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key || !request.merchant) {
      return next.handle();
    }

    const merchantId: string = request.merchant.id;
    const requestHash = hashRequest(request.method, request.originalUrl ?? request.url, request.body);

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { merchantId_key: { merchantId, key } },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException("Idempotency-Key was reused with a different request payload");
      }
      if (existing.status === "COMPLETED") {
        response.status(existing.responseStatus ?? 200);
        return of(existing.responseBody);
      }
      throw new ConflictException("A request with this Idempotency-Key is already in progress");
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: { merchantId, key, requestHash, status: "IN_PROGRESS" },
      });
    } catch {
      throw new ConflictException("A request with this Idempotency-Key is already in progress");
    }

    return next.handle().pipe(
      tap({
        next: async (body) => {
          await this.prisma.idempotencyKey.update({
            where: { merchantId_key: { merchantId, key } },
            data: {
              status: "COMPLETED",
              responseStatus: response.statusCode,
              responseBody: body as object,
              completedAt: new Date(),
            },
          });
        },
        error: async () => {
          // Let the caller retry with the same key on failure.
          await this.prisma.idempotencyKey.delete({ where: { merchantId_key: { merchantId, key } } });
        },
      }),
    );
  }
}
