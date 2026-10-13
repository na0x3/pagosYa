import { describe, expect, it } from "vitest";
import { REMINDER_CONSENT_LABEL, reminderConsentHtml } from "./reminder-consent";

describe("reminderConsentHtml", () => {
  it("renders nothing when it is not offered", () => {
    expect(reminderConsentHtml(false, true, "ana@example.com")).toBe("");
  });
  it("is unticked by default and disabled until there is an email", () => {
    const empty = reminderConsentHtml(true, false, " ");
    expect(empty).toContain('id="reminderConsent"'); expect(empty).toContain(" disabled"); expect(empty).not.toContain(" checked");
    expect(empty).toContain(REMINDER_CONSENT_LABEL);
    expect(reminderConsentHtml(true, true, " ")).not.toContain(" checked");
    const typed = reminderConsentHtml(true, true, "ana@example.com");
    expect(typed).not.toContain(" disabled"); expect(typed).toContain(" checked");
  });
});
