import { addBusinessDays, businessDaysBetween, complaintYear } from "./complaint-dates";

// 2026-10-08 is a Thursday. La Paz is UTC-4.
describe("addBusinessDays", () => {
  it("ends at 23:59:59.999 La Paz on the 5th weekday after a Thursday", () => {
    expect(addBusinessDays(new Date("2026-10-08T19:00:00Z"), 5).toISOString()).toBe("2026-10-16T03:59:59.999Z"); // Thu 15 Oct
  });
  it("starts counting on Monday for a complaint filed on Saturday", () => {
    expect(addBusinessDays(new Date("2026-10-10T15:00:00Z"), 5).toISOString()).toBe("2026-10-17T03:59:59.999Z"); // Fri 16 Oct
  });
  it("uses the La Paz date, not the UTC date, near midnight", () => {
    // 03:30Z on the 8th is 23:30 Wednesday the 7th in La Paz.
    expect(addBusinessDays(new Date("2026-10-08T03:30:00Z"), 5).toISOString()).toBe("2026-10-15T03:59:59.999Z"); // Wed 14 Oct
  });
  it("gives the merchant two business days", () => {
    expect(addBusinessDays(new Date("2026-10-08T19:00:00Z"), 2).toISOString()).toBe("2026-10-13T03:59:59.999Z"); // Mon 12 Oct
  });
});

describe("businessDaysBetween", () => {
  it("counts weekdays after the first day up to the last", () => {
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-08T22:00:00Z"))).toBe(0);
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-12T14:00:00Z"))).toBe(2);
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-15T20:00:00Z"))).toBe(5);
  });
});

describe("complaintYear", () => {
  it("is the La Paz year", () => {
    expect(complaintYear(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(complaintYear(new Date("2027-01-01T05:00:00Z"))).toBe(2027);
  });
});
