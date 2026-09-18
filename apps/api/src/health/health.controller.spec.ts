import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("keeps liveness independent from the database", () => {
    const controller = new HealthController({ $queryRaw: jest.fn() } as any);
    expect(controller.live().status).toBe("ok");
  });

  it("reports database readiness without leaking connection details", async () => {
    const query = jest.fn().mockResolvedValue([{ ok: 1 }]);
    const controller = new HealthController({ $queryRaw: query } as any);
    await expect(controller.ready()).resolves.toMatchObject({ status: "ok", dependencies: { database: "ok" } });
    expect(query).toHaveBeenCalled();
  });

  it("fails readiness when the database is unavailable", async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) } as any);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
