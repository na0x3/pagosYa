import { UnauthorizedException } from "@nestjs/common";
import { InboxWebhookController } from "./inbox-webhook.controller";

const payload = {
  type: "email.received",
  data: {
    to: ["hola@inbound.tienda.test"], from: "ana@gmail.test",
    subject: "Re: Pedido", message_id: "in-1", in_reply_to: "<sent-1@pagosya>",
    references: null, text: "¿Llega a Santa Cruz?", html: null, attachments: [],
  },
};
const rawBody = Buffer.from(JSON.stringify(payload));
const req = { rawBody } as { rawBody?: Buffer };

function controller(overrides: Record<string, unknown> = {}) {
  const inbox = { resolveInboundThread: jest.fn().mockResolvedValue({ id: "thread-1" }), recordInbound: jest.fn() };
  const stores = { findByInboundAddress: jest.fn().mockResolvedValue({ id: "store-1" }) };
  const verifier = { verify: jest.fn() };
  return { inbox, stores, verifier, subject: new InboxWebhookController(inbox as any, stores as any, verifier as any), ...overrides };
}

describe("InboxWebhookController", () => {
  it("rejects a bad signature and writes nothing", async () => {
    const { subject, verifier, inbox } = controller();
    verifier.verify.mockImplementation(() => { throw new UnauthorizedException(); });

    await expect(subject.receive(req, {}, payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("drops a message from a sender with no thread", async () => {
    const { subject, inbox } = controller();
    inbox.resolveInboundThread.mockResolvedValue(null);

    await expect(subject.receive(req, {}, payload as any)).resolves.toEqual({ received: true });
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("records a reply that belongs to a known thread", async () => {
    const { subject, inbox } = controller();

    await subject.receive(req, {}, payload as any);

    expect(inbox.recordInbound).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1", fromEmail: "ana@gmail.test", text: "¿Llega a Santa Cruz?",
    }));
  });

  it("passes the request's raw body straight through to the verifier, not the parsed payload", async () => {
    const { subject, verifier } = controller();

    await subject.receive(req, { "svix-id": "id-1" }, payload as any);

    expect(verifier.verify).toHaveBeenCalledWith({ "svix-id": "id-1" }, rawBody);
  });

  it("rejects when the request carries no raw body", async () => {
    const { subject, verifier, inbox } = controller();
    verifier.verify.mockImplementation(() => { throw new UnauthorizedException("Missing raw body"); });

    await expect(subject.receive({}, {}, payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verify).toHaveBeenCalledWith({}, undefined);
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });
});
