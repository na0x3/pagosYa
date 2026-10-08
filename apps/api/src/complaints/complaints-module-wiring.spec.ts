import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration from "../config/configuration";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ComplaintsModule } from "./complaints.module";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { ComplaintOpsService } from "./complaint-ops.service";

/** Compiles the real ComplaintsModule so a missing import (ops guard, refunds, settlement admin) fails here, not at boot. */
describe("ComplaintsModule wiring", () => {
  it("resolves every complaints provider and controller", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ThrottlerModule.forRoot([]), PrismaModule, ComplaintsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ComplaintIntakeService)).toBeInstanceOf(ComplaintIntakeService);
    expect(moduleRef.get(ComplaintOpsService)).toBeInstanceOf(ComplaintOpsService);
  });
});
