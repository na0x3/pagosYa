import { PaymentIntentStatus as Status } from "@prisma/client";

export enum PaymentIntentEvent {
  CONFIRM = "CONFIRM",
  AUTHORIZE_START = "AUTHORIZE_START",
  AUTHORIZE_SUCCEEDED = "AUTHORIZE_SUCCEEDED",
  AUTHORIZE_REQUIRES_ACTION = "AUTHORIZE_REQUIRES_ACTION",
  AUTHORIZE_FAILED = "AUTHORIZE_FAILED",
  RAIL_CALLBACK_SUCCEEDED = "RAIL_CALLBACK_SUCCEEDED",
  RAIL_CALLBACK_FAILED = "RAIL_CALLBACK_FAILED",
  CANCEL = "CANCEL",
}

const TRANSITIONS: Record<string, Status> = {
  [`${Status.REQUIRES_PAYMENT_METHOD}:${PaymentIntentEvent.CONFIRM}`]: Status.REQUIRES_CONFIRMATION,
  [`${Status.FAILED}:${PaymentIntentEvent.CONFIRM}`]: Status.REQUIRES_CONFIRMATION,

  [`${Status.REQUIRES_CONFIRMATION}:${PaymentIntentEvent.AUTHORIZE_START}`]: Status.PROCESSING,

  [`${Status.PROCESSING}:${PaymentIntentEvent.AUTHORIZE_SUCCEEDED}`]: Status.SUCCEEDED,
  [`${Status.PROCESSING}:${PaymentIntentEvent.AUTHORIZE_REQUIRES_ACTION}`]: Status.REQUIRES_ACTION,
  [`${Status.PROCESSING}:${PaymentIntentEvent.AUTHORIZE_FAILED}`]: Status.FAILED,

  [`${Status.REQUIRES_ACTION}:${PaymentIntentEvent.RAIL_CALLBACK_SUCCEEDED}`]: Status.SUCCEEDED,
  [`${Status.REQUIRES_ACTION}:${PaymentIntentEvent.RAIL_CALLBACK_FAILED}`]: Status.FAILED,

  [`${Status.REQUIRES_PAYMENT_METHOD}:${PaymentIntentEvent.CANCEL}`]: Status.CANCELED,
  [`${Status.REQUIRES_CONFIRMATION}:${PaymentIntentEvent.CANCEL}`]: Status.CANCELED,
};

export class IllegalStateTransitionError extends Error {
  constructor(from: Status, event: PaymentIntentEvent) {
    super(`Cannot apply event "${event}" to PaymentIntent in state "${from}"`);
    this.name = "IllegalStateTransitionError";
  }
}

export function canTransition(from: Status, event: PaymentIntentEvent): Status | null {
  return TRANSITIONS[`${from}:${event}`] ?? null;
}

export function transition(from: Status, event: PaymentIntentEvent): Status {
  const to = canTransition(from, event);
  if (!to) throw new IllegalStateTransitionError(from, event);
  return to;
}

export const TERMINAL_STATUSES: Status[] = [Status.SUCCEEDED, Status.CANCELED];
