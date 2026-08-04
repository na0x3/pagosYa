import { PaymentIntentStatus as Status } from "@prisma/client";
import { canTransition, IllegalStateTransitionError, PaymentIntentEvent, transition } from "./payment-intent.state-machine";

describe("PaymentIntent state machine", () => {
  const legal: [Status, PaymentIntentEvent, Status][] = [
    [Status.REQUIRES_PAYMENT_METHOD, PaymentIntentEvent.CONFIRM, Status.REQUIRES_CONFIRMATION],
    [Status.FAILED, PaymentIntentEvent.CONFIRM, Status.REQUIRES_CONFIRMATION],
    [Status.REQUIRES_CONFIRMATION, PaymentIntentEvent.AUTHORIZE_START, Status.PROCESSING],
    [Status.PROCESSING, PaymentIntentEvent.AUTHORIZE_SUCCEEDED, Status.SUCCEEDED],
    [Status.PROCESSING, PaymentIntentEvent.AUTHORIZE_REQUIRES_ACTION, Status.REQUIRES_ACTION],
    [Status.PROCESSING, PaymentIntentEvent.AUTHORIZE_FAILED, Status.FAILED],
    [Status.REQUIRES_ACTION, PaymentIntentEvent.RAIL_CALLBACK_SUCCEEDED, Status.SUCCEEDED],
    [Status.REQUIRES_ACTION, PaymentIntentEvent.RAIL_CALLBACK_FAILED, Status.FAILED],
    [Status.REQUIRES_PAYMENT_METHOD, PaymentIntentEvent.CANCEL, Status.CANCELED],
    [Status.REQUIRES_CONFIRMATION, PaymentIntentEvent.CANCEL, Status.CANCELED],
  ];

  it.each(legal)("allows %s + %s -> %s", (from, event, to) => {
    expect(canTransition(from, event)).toBe(to);
    expect(transition(from, event)).toBe(to);
  });

  const illegal: [Status, PaymentIntentEvent][] = [
    [Status.SUCCEEDED, PaymentIntentEvent.CONFIRM],
    [Status.CANCELED, PaymentIntentEvent.CONFIRM],
    [Status.PROCESSING, PaymentIntentEvent.CANCEL],
    [Status.REQUIRES_ACTION, PaymentIntentEvent.CANCEL],
    [Status.REQUIRES_PAYMENT_METHOD, PaymentIntentEvent.AUTHORIZE_SUCCEEDED],
    [Status.SUCCEEDED, PaymentIntentEvent.RAIL_CALLBACK_SUCCEEDED],
  ];

  it.each(illegal)("rejects %s + %s", (from, event) => {
    expect(canTransition(from, event)).toBeNull();
    expect(() => transition(from, event)).toThrow(IllegalStateTransitionError);
  });
});
