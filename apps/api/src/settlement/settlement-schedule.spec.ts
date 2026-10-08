import { SettlementHoldStatus } from "@prisma/client";
import { buildReleaseSchedule } from "./settlement-schedule";

const base = { currency: "BOB", pendingAmount: 0, reserveAmount: 0 };

describe("buildReleaseSchedule", () => {
  it("groups by La Paz date and currency, splitting pending into available and reserve", () => {
    const releases = buildReleaseSchedule([
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 9750, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00Z") },
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 1000, reserveAmount: 0, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-10-08T04:00:00Z") },
      { ...base, status: SettlementHoldStatus.RESERVE_HELD, reserveAmount: 500, availableAt: new Date("2026-09-01T04:00:00Z"), reserveReleaseAt: new Date("2026-10-08T04:00:00Z") },
    ], new Date("2026-12-31T00:00:00Z"));
    expect(releases).toEqual([
      { date: "2026-10-08", currency: "BOB", toAvailable: 9775, fromReserve: 500 },
      { date: "2026-11-30", currency: "BOB", toAvailable: 0, fromReserve: 975 },
    ]);
  });

  it("caps a planned reserve at what is still pending, and drops dates past the window", () => {
    const releases = buildReleaseSchedule([
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 100, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2027-02-01T04:00:00Z") },
    ], new Date("2026-12-07T00:00:00Z"));
    // 100 pending, planned reserve capped to 100 -> nothing to available; the reserve date is past the window.
    expect(releases).toEqual([]);
  });
});
