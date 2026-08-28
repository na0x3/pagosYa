import { evaluateAccess, type AccessPolicyInput } from "./access-policy";

const now = new Date("2026-08-27T23:00:00.000Z");
const base: AccessPolicyInput = {
  eventStatus: "ACTIVE", admissionStatus: "ACTIVE", paymentStatus: "PAID", biometricEnrollmentStatus: "ENROLLED",
  presenceStatus: "OUTSIDE", direction: "ENTRY", allowReentry: true, ticketReentryAllowed: true,
  occurredAt: now, doorsOpenAt: new Date(now.getTime() - 60_000), lastEntryAt: new Date(now.getTime() + 60_000),
  manual: false, insideCount: 10, capacity: 900, capacityContribution: 1,
};

describe("event access policy", () => {
  it("allows an enrolled outside attendee to enter", () => expect(evaluateAccess(base)).toEqual({ decision: "ALLOW", nextPresence: "INSIDE" }));
  it("accepts legacy VALID admissions", () => expect(evaluateAccess({ ...base, admissionStatus: "VALID" }).decision).toBe("ALLOW"));
  it("denies atomic anti-passback state", () => expect(evaluateAccess({ ...base, presenceStatus: "INSIDE" })).toEqual({ decision: "DENY", reason: "ALREADY_INSIDE" }));
  it("allows an inside attendee to exit", () => expect(evaluateAccess({ ...base, direction: "EXIT", presenceStatus: "INSIDE" })).toEqual({ decision: "ALLOW", nextPresence: "OUTSIDE" }));
  it("ignores an exit while already outside", () => expect(evaluateAccess({ ...base, direction: "EXIT" })).toEqual({ decision: "IGNORED", reason: "ALREADY_OUTSIDE" }));
  it("allows re-entry when event and ticket allow it", () => expect(evaluateAccess({ ...base, presenceStatus: "OUTSIDE" }).decision).toBe("ALLOW"));
  it("denies re-entry when event disables it", () => expect(evaluateAccess({ ...base, allowReentry: false })).toEqual({ decision: "DENY", reason: "REENTRY_NOT_ALLOWED" }));
  it("denies revoked admission", () => expect(evaluateAccess({ ...base, admissionStatus: "REVOKED" })).toEqual({ decision: "DENY", reason: "ADMISSION_REVOKED" }));
  it("denies refunded payment independently of admission state", () => expect(evaluateAccess({ ...base, paymentStatus: "REFUNDED" })).toEqual({ decision: "DENY", reason: "PAYMENT_REFUNDED" }));
  it("requires enrollment unless an audited manual action is used", () => {
    expect(evaluateAccess({ ...base, biometricEnrollmentStatus: "PENDING" })).toEqual({ decision: "DENY", reason: "BIOMETRIC_NOT_ENROLLED" });
    expect(evaluateAccess({ ...base, biometricEnrollmentStatus: "PENDING", manual: true }).decision).toBe("ALLOW");
  });
  it("enforces event entry time", () => expect(evaluateAccess({ ...base, occurredAt: new Date(now.getTime() + 120_000) })).toEqual({ decision: "DENY", reason: "ENTRY_WINDOW_CLOSED" }));
  it("stops new entry when an event has ended", () => expect(evaluateAccess({ ...base, eventStatus: "ENDED" })).toEqual({ decision: "DENY", reason: "EVENT_NOT_ACTIVE" }));
  it("enforces server-side capacity", () => expect(evaluateAccess({ ...base, insideCount: 900 })).toEqual({ decision: "DENY", reason: "CAPACITY_REACHED" }));
});
