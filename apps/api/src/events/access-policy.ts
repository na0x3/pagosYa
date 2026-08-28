export type AccessPolicyInput = {
  admissionStatus: string;
  paymentStatus: string;
  biometricEnrollmentStatus: string;
  presenceStatus: "NEVER_ENTERED" | "OUTSIDE" | "INSIDE";
  direction: "ENTRY" | "EXIT";
  allowReentry: boolean;
  ticketReentryAllowed: boolean;
  occurredAt: Date;
  doorsOpenAt: Date;
  lastEntryAt: Date;
  manual: boolean;
  insideCount: number;
  capacity: number;
  capacityContribution: number;
};

export type AccessPolicyDecision =
  | { decision: "ALLOW"; nextPresence: "INSIDE" | "OUTSIDE" }
  | { decision: "DENY" | "IGNORED"; reason: string };

/** Pure authorization policy. Persistence and locking stay in EventsService. */
export function evaluateAccess(input: AccessPolicyInput): AccessPolicyDecision {
  if (!["ACTIVE", "VALID"].includes(input.admissionStatus)) return { decision: "DENY", reason: `ADMISSION_${input.admissionStatus}` };
  if (input.paymentStatus !== "PAID") return { decision: "DENY", reason: `PAYMENT_${input.paymentStatus}` };
  if (input.biometricEnrollmentStatus !== "ENROLLED" && !input.manual) return { decision: "DENY", reason: "BIOMETRIC_NOT_ENROLLED" };
  if (input.direction === "ENTRY" && input.presenceStatus === "INSIDE") return { decision: "DENY", reason: "ALREADY_INSIDE" };
  if (input.direction === "ENTRY" && input.presenceStatus === "OUTSIDE" && (!input.allowReentry || !input.ticketReentryAllowed)) return { decision: "DENY", reason: "REENTRY_NOT_ALLOWED" };
  if (input.direction === "ENTRY" && (input.occurredAt < input.doorsOpenAt || input.occurredAt > input.lastEntryAt)) return { decision: "DENY", reason: "ENTRY_WINDOW_CLOSED" };
  if (input.direction === "EXIT" && input.presenceStatus !== "INSIDE") return { decision: "IGNORED", reason: "ALREADY_OUTSIDE" };
  if (input.direction === "ENTRY" && input.insideCount + input.capacityContribution > input.capacity) return { decision: "DENY", reason: "CAPACITY_REACHED" };
  return { decision: "ALLOW", nextPresence: input.direction === "ENTRY" ? "INSIDE" : "OUTSIDE" };
}
