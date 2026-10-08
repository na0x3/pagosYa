import { createComplaintToken, readComplaintToken } from "./complaint-token";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";

describe("complaint tracking token", () => {
  const id = "cmg1abcdefghijklmnopqrstu";
  it("round-trips", () => {
    expect(readComplaintToken(createComplaintToken(id, "s3cret"), "s3cret")).toBe(id);
  });
  it("rejects another secret, a tampered id and junk", () => {
    const token = createComplaintToken(id, "s3cret");
    expect(readComplaintToken(token, "other")).toBeNull();
    const [, sig] = token.split(".");
    expect(readComplaintToken(`${Buffer.from("cmg1zzzzzzzzzzzzzzzzzzzzz").toString("base64url")}.${sig}`, "s3cret")).toBeNull();
    expect(readComplaintToken("nope", "s3cret")).toBeNull();
    expect(readComplaintToken("a.b.c", "s3cret")).toBeNull();
  });
  it("is not interchangeable with an order tracking token for the same id", () => {
    expect(createComplaintToken(id, "s3cret")).not.toBe(createOrderTrackingToken(id, "s3cret"));
  });
});
