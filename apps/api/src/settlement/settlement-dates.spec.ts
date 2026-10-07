import { laPazDateKey, laPazDayStart, nextPayoutBatch } from "./settlement-dates";

describe("settlement dates (America/La_Paz, UTC-4)", () => {
  it("counts days from the La Paz calendar day of the capture", () => {
    // Monday 2026-10-05 15:00 La Paz = 19:00Z; 3 days -> Thursday 00:00 La Paz.
    expect(laPazDayStart(new Date("2026-10-05T19:00:00Z"), 3).toISOString()).toBe("2026-10-08T04:00:00.000Z");
  });

  it("treats 23:30 La Paz as the same La Paz day even though UTC has rolled over", () => {
    // 2026-10-05 23:30 La Paz = 2026-10-06T03:30Z, still October 5th in La Paz.
    expect(laPazDayStart(new Date("2026-10-06T03:30:00Z"), 1).toISOString()).toBe("2026-10-06T04:00:00.000Z");
  });

  it("returns the start of the same La Paz day for 0 days", () => {
    expect(laPazDayStart(new Date("2026-10-05T19:00:00Z"), 0).toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("gives the next 10:00 La Paz batch strictly after now", () => {
    expect(nextPayoutBatch(new Date("2026-10-07T13:59:00Z")).toISOString()).toBe("2026-10-07T14:00:00.000Z");
    expect(nextPayoutBatch(new Date("2026-10-07T14:00:00Z")).toISOString()).toBe("2026-10-08T14:00:00.000Z");
    // 03:00Z is 23:00 La Paz the day before, so the next batch is that same UTC day at 14:00Z.
    expect(nextPayoutBatch(new Date("2026-10-07T03:00:00Z")).toISOString()).toBe("2026-10-07T14:00:00.000Z");
  });

  it("formats the La Paz date key", () => {
    expect(laPazDateKey(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05");
    expect(laPazDateKey(new Date("2026-10-08T04:00:00Z"))).toBe("2026-10-08");
  });
});
