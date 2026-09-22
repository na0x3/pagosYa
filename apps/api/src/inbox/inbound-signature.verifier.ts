import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Svix signs "<id>.<timestamp>.<body>" with a base64 secret and sends one or
 * more space-separated "v1,<sig>" values. Same order as the other webhooks in
 * this codebase: verify before reading anything out of the payload.
 *
 * The signature must be checked against the exact bytes Resend sent, not a
 * re-serialization of the parsed body: JSON.stringify(JSON.parse(raw)) is not
 * guaranteed to equal raw (key order, unicode escaping, whitespace, and this
 * app's own safeJsonReviver in main.ts can all change the string), so this
 * takes the raw body directly and never falls back to reconstructing it.
 */
@Injectable()
export class InboundSignatureVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(headers: Record<string, string>, rawBody: Buffer | undefined) {
    const secret = this.config.get<string>("app.email.inboundSigningSecret");
    if (!secret) throw new UnauthorizedException("Inbound mail is not configured");
    const id = headers["svix-id"], timestamp = headers["svix-timestamp"], signatures = headers["svix-signature"];
    if (!id || !timestamp || !signatures) throw new UnauthorizedException("Missing signature headers");
    // No raw body means main.ts's verify() hook didn't capture it (e.g. the
    // route whitelist stopped matching): reject rather than fall back to a
    // re-serialization, which would silently reintroduce the same bug.
    if (!rawBody) throw new UnauthorizedException("Missing raw body");
    // Reject replays of an old capture.
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new UnauthorizedException("Stale signature");

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody.toString("utf8")}`).digest();
    const ok = signatures.split(" ").some((entry) => {
      const value = entry.split(",")[1];
      if (!value) return false;
      const candidate = Buffer.from(value, "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
    if (!ok) throw new UnauthorizedException("Invalid inbound signature");
  }
}
