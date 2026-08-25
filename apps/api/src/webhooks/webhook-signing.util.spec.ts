import { createHmac } from "node:crypto";
import { signWebhookBody } from "./webhook-signing.util";

describe("signWebhookBody", () => {
  it("signs the exact serialized HTTP body", () => {
    const body = '{"id":"evt_1","type":"payment_intent.succeeded","data":{"id":"pi_1"}}';
    const timestamp = 1_723_982_400_000;
    const expected = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    expect(signWebhookBody("whsec_test", body, timestamp)).toBe(`t=${timestamp},v1=${expected}`);
  });
});
