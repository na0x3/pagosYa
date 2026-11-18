import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ComplaintRefundDto } from "./ops-complaint.dto";

const errors = (body: object) => validateSync(plainToInstance(ComplaintRefundDto, body)).map((e) => e.property);

describe("ComplaintRefundDto", () => {
  it("reads an absent amount as a full refund", () => {
    expect(errors({ requestId: "req_12345678" })).toEqual([]);
  });

  it("refuses null, zero, fractions and text instead of treating them as a full refund", () => {
    for (const amount of [null, 0, -5, 12.5, "50 Bs"]) expect(errors({ requestId: "req_12345678", amount })).toEqual(["amount"]);
  });

  it("requires a request id from the console", () => {
    expect(errors({ amount: 2500 })).toEqual(["requestId"]);
  });
});
