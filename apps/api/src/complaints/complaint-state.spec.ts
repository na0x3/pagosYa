import { ComplaintStatus } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { assertCan, canDo, nextStatus, type ComplaintAction } from "./complaint-state";

const { RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED } = ComplaintStatus;
const ALL = [RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED];

const allowed: Record<ComplaintAction, ComplaintStatus[]> = {
  take: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  link: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  note: ALL,
  askMerchant: [IN_REVIEW],
  merchantReply: [WAITING_MERCHANT],
  extend: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  answer: [IN_REVIEW, WAITING_MERCHANT],
  buyerMessage: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  refund: ALL,
  pausePayouts: ALL,
};

describe("complaint state table", () => {
  for (const [action, statuses] of Object.entries(allowed) as [ComplaintAction, ComplaintStatus[]][]) {
    for (const status of ALL) {
      it(`${action} from ${status} is ${statuses.includes(status) ? "allowed" : "refused"}`, () => {
        expect(canDo(action, status)).toBe(statuses.includes(status));
      });
    }
  }

  it("moves through the journey", () => {
    expect(nextStatus("take", RECEIVED)).toBe(IN_REVIEW);
    expect(nextStatus("take", WAITING_MERCHANT)).toBe(WAITING_MERCHANT);
    expect(nextStatus("askMerchant", IN_REVIEW)).toBe(WAITING_MERCHANT);
    expect(nextStatus("merchantReply", WAITING_MERCHANT)).toBe(IN_REVIEW);
    expect(nextStatus("answer", WAITING_MERCHANT)).toBe(ANSWERED);
    expect(nextStatus("note", ANSWERED)).toBe(ANSWERED);
  });

  it("refuses with a 409 in Spanish", () => {
    expect(() => assertCan("answer", ANSWERED)).toThrow(ConflictException);
    expect(() => assertCan("answer", ANSWERED)).toThrow("Este reclamo ya fue respondido.");
    expect(() => assertCan("merchantReply", IN_REVIEW)).toThrow("No hay una consulta pendiente para el comercio.");
  });
});
