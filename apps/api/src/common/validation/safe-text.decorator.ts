import { Matches, ValidationOptions } from "class-validator";

// Keep merchant-authored content as ordinary text. Tabs/newlines remain valid,
// while invisible controls and bidi override/isolate characters are rejected:
// those characters have no storefront use and can disguise URLs, logs, or copy.
export const SAFE_TEXT_PATTERN = /^(?!.*[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]).*$/su;

export function IsSafeText(validationOptions: ValidationOptions = {}): PropertyDecorator {
  return Matches(SAFE_TEXT_PATTERN, {
    message: "must not contain invisible control or text-direction characters",
    ...validationOptions,
  });
}
