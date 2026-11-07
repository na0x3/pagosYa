import { ConflictException } from "@nestjs/common";
import { ComplaintStatus } from "@prisma/client";

const { RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED } = ComplaintStatus;
const OPEN = [RECEIVED, IN_REVIEW, WAITING_MERCHANT];
const ALL = [...OPEN, ANSWERED];

export type ComplaintAction =
  | "take" | "link" | "note" | "askMerchant" | "merchantReply" | "extend" | "answer" | "buyerMessage" | "refund" | "pausePayouts";

const RULES: Record<ComplaintAction, { from: ComplaintStatus[]; to?: (from: ComplaintStatus) => ComplaintStatus }> = {
  take: { from: OPEN, to: (from) => (from === RECEIVED ? IN_REVIEW : from) },
  link: { from: OPEN },
  note: { from: ALL },
  askMerchant: { from: [IN_REVIEW], to: () => WAITING_MERCHANT },
  merchantReply: { from: [WAITING_MERCHANT], to: () => IN_REVIEW },
  extend: { from: OPEN },
  answer: { from: [IN_REVIEW, WAITING_MERCHANT], to: () => ANSWERED },
  buyerMessage: { from: OPEN },
  refund: { from: ALL },
  pausePayouts: { from: ALL },
};

export function canDo(action: ComplaintAction, status: ComplaintStatus): boolean {
  return RULES[action].from.includes(status);
}

export function nextStatus(action: ComplaintAction, status: ComplaintStatus): ComplaintStatus {
  return RULES[action].to?.(status) ?? status;
}

export function assertCan(action: ComplaintAction, status: ComplaintStatus): void {
  if (canDo(action, status)) return;
  if (status === ANSWERED) throw new ConflictException("Este reclamo ya fue respondido.");
  if (action === "merchantReply") throw new ConflictException("No hay una consulta pendiente para el comercio.");
  if (action === "askMerchant") throw new ConflictException("Toma el reclamo antes de consultar al comercio.");
  if (action === "answer") throw new ConflictException("Toma el reclamo antes de responderlo.");
  throw new ConflictException("Esta acción no está disponible en el estado actual del reclamo.");
}
