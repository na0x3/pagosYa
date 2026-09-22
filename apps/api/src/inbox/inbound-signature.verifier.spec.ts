import { UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { InboundSignatureVerifier } from "./inbound-signature.verifier";

const SECRET_B64 = Buffer.from("test-svix-secret").toString("base64");

function verifierWithSecret(secretB64: string | undefined = SECRET_B64) {
  const config = { get: jest.fn().mockReturnValue(secretB64) };
  return new InboundSignatureVerifier(config as any);
}

function sign(secretB64: string, id: string, timestamp: string, raw: string) {
  const key = Buffer.from(secretB64, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64")}`;
}

describe("InboundSignatureVerifier", () => {
  it("verifies over the exact raw bytes, even when JSON.stringify(JSON.parse(raw)) differs from raw", () => {
    const verifier = verifierWithSecret();
    // Pretty-printed with real newlines and indentation. JSON.parse followed by
    // JSON.stringify collapses all of that insignificant whitespace, so a
    // signature computed over the re-serialized string would not match one
    // computed over these actual bytes. This fixture exercises that whitespace
    // difference specifically (key order is not a useful differentiator here:
    // JS preserves string-key insertion order through parse/stringify).
    const raw = '{\n  "type": "email.received",\n  "data": {\n    "from": "ana@gmail.test",\n    "text": "hola"\n  }\n}';
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(reserialized).not.toBe(raw); // sanity check the fixture actually exercises the bug

    const id = "msg_1", timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": sign(SECRET_B64, id, timestamp, raw) };

    expect(() => verifier.verify(headers, Buffer.from(raw))).not.toThrow();
    // A signature computed over the re-serialized string is a different value
    // and must NOT verify against the raw bytes — this is what would let a
    // JSON.stringify(payload)-based implementation both send and accept a
    // signature for the wrong string.
    const wrongHeaders = { ...headers, "svix-signature": sign(SECRET_B64, id, timestamp, reserialized) };
    expect(() => verifier.verify(wrongHeaders, Buffer.from(raw))).toThrow(UnauthorizedException);
  });

  it("rejects when the request carried no raw body, without falling back to any reconstruction", () => {
    const verifier = verifierWithSecret();
    const id = "msg_1", timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1,irrelevant" };

    expect(() => verifier.verify(headers, undefined)).toThrow(UnauthorizedException);
  });

  it("rejects a stale timestamp even with a raw body present", () => {
    const verifier = verifierWithSecret();
    const raw = '{"type":"email.received"}';
    const id = "msg_1", staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const headers = { "svix-id": id, "svix-timestamp": staleTimestamp, "svix-signature": sign(SECRET_B64, id, staleTimestamp, raw) };

    expect(() => verifier.verify(headers, Buffer.from(raw))).toThrow(UnauthorizedException);
  });

  it("rejects when inbound mail is not configured", () => {
    const verifier = verifierWithSecret("");
    const headers = { "svix-id": "id", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,x" };

    expect(() => verifier.verify(headers, Buffer.from("{}"))).toThrow(UnauthorizedException);
  });
});
