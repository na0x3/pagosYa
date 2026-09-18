import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";

/** Unauthenticated by design — this is what a load balancer/orchestrator polls. */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  private async database() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
  }

  @Get("ready")
  async ready() {
    await this.database();
    return { status: "ok", dependencies: { database: "ok" }, timestamp: new Date().toISOString() };
  }

  /** Backwards-compatible alias for existing load-balancer probes. */
  @Get("health")
  async check() {
    await this.database();
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
