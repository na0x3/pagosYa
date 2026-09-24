import { UnauthorizedException } from "@nestjs/common";
import { InboxWebhookController } from "./inbox-webhook.controller";

/**
 * The payload is metadata only — that is the whole point of these fixtures.
 * Resend's email.received event has no `text`, no `html` and no `in_reply_to`;
 * anything the controller needs out of the message comes from the fetcher.
 */
const payload = {
  type: "email.received",
  data: {
    to: ["hola@inbound.tienda.test"], from: "ana@gmail.test",
    subject: "Re: Pedido", email_id: "resend-email-1", attachments: [],
  },
};
const rawBody = Buffer.from(JSON.stringify(payload));
const req = { rawBody } as { rawBody?: Buffer };

const fetched = {
  html: null as string | null,
  text: "¿Llega a Santa Cruz?" as string | null,
  headers: {
    "in-reply-to": "<sent-1@pagosya>",
    "message-id": "<in-1@gmail.test>",
    references: "<sent-1@pagosya>",
  } as Record<string, string>,
};

function controller() {
  const inbox = { resolveInboundThread: jest.fn().mockResolvedValue({ id: "thread-1" }), recordInbound: jest.fn() };
  const stores = { findByInboundAddress: jest.fn().mockResolvedValue({ id: "store-1" }) };
  const verifier = { verify: jest.fn() };
  const mail = { fetch: jest.fn().mockResolvedValue(fetched) };
  return { inbox, stores, verifier, mail, subject: new InboxWebhookController(inbox as any, stores as any, verifier as any, mail as any) };
}

describe("InboxWebhookController", () => {
  it("rejects a bad signature and writes nothing", async () => {
    const { subject, verifier, inbox, mail } = controller();
    verifier.verify.mockImplementation(() => { throw new UnauthorizedException(); });

    await expect(subject.receive(req, {}, payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mail.fetch).not.toHaveBeenCalled();
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("drops a message from a sender with no thread", async () => {
    const { subject, inbox } = controller();
    inbox.resolveInboundThread.mockResolvedValue(null);

    await expect(subject.receive(req, {}, payload as any)).resolves.toEqual({ received: true });
    expect(inbox.recordInbound).not.toHaveBeenCalled();
  });

  it("fetches the body by email_id, because the webhook payload has none", async () => {
    const { subject, mail } = controller();

    await subject.receive(req, {}, payload as any);

    expect(mail.fetch).toHaveBeenCalledWith("resend-email-1");
  });

  it("records the fetched body, not anything read off the payload", async () => {
    const { subject, inbox } = controller();

    await subject.receive(req, {}, payload as any);

    expect(inbox.recordInbound).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1", fromEmail: "ana@gmail.test", text: "¿Llega a Santa Cruz?",
      messageId: "in-1@gmail.test", inReplyTo: "sent-1@pagosya",
    }));
  });

  it("correlates on the FETCHED In-Reply-To and References headers", async () => {
    const { subject, inbox } = controller();

    await subject.receive(req, {}, payload as any);

    expect(inbox.resolveInboundThread).toHaveBeenCalledWith(
      "store-1",
      { inReplyTo: "<sent-1@pagosya>", references: "<sent-1@pagosya>" },
      "ana@gmail.test",
    );
  });

  it("reads headers case-insensitively via the fetcher's lowercased map", async () => {
    const { subject, inbox, mail } = controller();
    mail.fetch.mockResolvedValue({ html: "<p>hola</p>", text: null, headers: {} });

    await subject.receive(req, {}, payload as any);

    expect(inbox.resolveInboundThread).toHaveBeenCalledWith("store-1", { inReplyTo: null, references: null }, "ana@gmail.test");
    expect(inbox.recordInbound).toHaveBeenCalledWith(expect.objectContaining({ html: "<p>hola</p>", messageId: null, inReplyTo: null }));
  });

  it("acknowledges without writing a half-record when the body cannot be fetched", async () => {
    const { subject, inbox, mail } = controller();
    mail.fetch.mockResolvedValue(null);

    await expect(subject.receive(req, {}, payload as any)).resolves.toEqual({ received: true });
    expect(inbox.resolveInboundThread).not.toHaveBeenCalled();
    expect(inbox.recordInbound).not.toHaveBeenCalled();
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
