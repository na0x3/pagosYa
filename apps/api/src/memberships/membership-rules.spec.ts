import { BadRequestException } from "@nestjs/common";
import {
  accessAfterPayment, blocksRejoin, hasMembershipAccess, membershipKey, membershipState, membershipTermsPeriod,
  normalizeMembershipPeriods, periodLabel, periodSuffix,
} from "./membership-rules";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("normalizeMembershipPeriods", () => {
  it("keeps up to four distinct lengths with positive integer prices, in the order given", () => {
    expect(normalizeMembershipPeriods([{ months: 12, amount: 48000 }, { months: 1, amount: 5000 }])).toEqual([{ months: 12, amount: 48000 }, { months: 1, amount: 5000 }]);
  });
  it.each([
    [[]],
    [[{ months: 2, amount: 100 }]],
    [[{ months: 1, amount: 0 }]],
    [[{ months: 1, amount: 10.5 }]],
    [[{ months: 1, amount: 100 }, { months: 1, amount: 200 }]],
    [[{ months: 1, amount: 1 }, { months: 3, amount: 1 }, { months: 6, amount: 1 }, { months: 12, amount: 1 }, { months: 1, amount: 2 }]],
    ["mensual"],
  ])("rejects %j", (value) => {
    expect(() => normalizeMembershipPeriods(value)).toThrow(BadRequestException);
  });
});

describe("labels", () => {
  it("names the four lengths", () => {
    expect([1, 3, 6, 12].map(periodLabel)).toEqual(["Mensual", "Trimestral", "Semestral", "Anual"]);
    expect([1, 3, 6, 12].map(periodSuffix)).toEqual(["/ mes", "/ 3 meses", "/ 6 meses", "/ año"]);
  });
});

describe("accessAfterPayment", () => {
  it("extends from the old end date, never from the payment date", () => {
    expect(accessAfterPayment(day("2026-11-12"), 1, day("2026-11-12"))).toEqual(day("2026-12-12"));
  });
  it("never shortens access already granted", () => {
    expect(accessAfterPayment(day("2026-11-12"), 1, day("2027-01-12"))).toEqual(day("2027-01-12"));
  });
  it("clamps month ends: 31 January + 1 month is the last day of February", () => {
    expect(accessAfterPayment(day("2027-01-31"), 1, null)).toEqual(day("2027-02-28"));
    expect(accessAfterPayment(day("2028-01-31"), 1, null)).toEqual(day("2028-02-29"));
  });
});

describe("membershipState", () => {
  const now = day("2026-11-15");
  it("is ACTIVE before accessUntil, GRACE inside the grace days, LAPSED after", () => {
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-20") }, 7, now)).toBe("ACTIVE");
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-10") }, 7, now)).toBe("GRACE");
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-01") }, 7, now)).toBe("LAPSED");
    expect(membershipState({ status: "LAPSED", accessUntil: day("2026-11-20") }, 7, now)).toBe("LAPSED");
  });
  it("keeps a canceled member's paid access until accessUntil", () => {
    expect(membershipState({ status: "CANCELED", accessUntil: day("2026-11-20") }, 7, now)).toBe("CANCELED_ACTIVE");
    expect(membershipState({ status: "CANCELED", accessUntil: day("2026-11-10") }, 7, now)).toBe("CANCELED");
  });
  it("derives access and rejoin rules from the state", () => {
    expect(hasMembershipAccess({ status: "ACTIVE", accessUntil: day("2026-11-10") }, 7, now)).toBe(true);
    expect(hasMembershipAccess({ status: "CANCELED", accessUntil: day("2026-11-10") }, 7, now)).toBe(false);
    expect(blocksRejoin({ status: "CANCELED", accessUntil: day("2026-11-20") }, 7, now)).toBe(true);
    expect(blocksRejoin({ status: "LAPSED", accessUntil: day("2026-11-20") }, 7, now)).toBe(false);
  });
});

describe("membershipKey and membershipTermsPeriod", () => {
  it("is stable per store, product and account", () => {
    expect(membershipKey("s", "p", "c")).toBe(membershipKey("s", "p", "c"));
    expect(membershipKey("s", "p", "c")).not.toBe(membershipKey("s", "p", "d"));
    expect(membershipKey("s", "p", "c")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("bills the locked price, or the pending period's current price when switching", () => {
    const periods = new Map([["m1", { months: 1, amount: 5000 }], ["m12", { months: 12, amount: 48000 }]]);
    expect(membershipTermsPeriod({ membershipPeriodId: "m1", pendingPeriodId: null, unitAmount: 4500 }, periods)).toEqual({ months: 1, amount: 4500, switching: false });
    expect(membershipTermsPeriod({ membershipPeriodId: "m1", pendingPeriodId: "m12", unitAmount: 4500 }, periods)).toEqual({ months: 12, amount: 48000, switching: true });
    expect(membershipTermsPeriod({ membershipPeriodId: "gone", pendingPeriodId: null, unitAmount: 4500 }, periods)).toBeNull();
  });
});
