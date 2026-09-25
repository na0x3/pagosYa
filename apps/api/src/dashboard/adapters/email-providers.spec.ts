import { Logger } from "@nestjs/common";
import { MockEmailProvider } from "./mock-email.provider";
import { ResendEmailProvider } from "./resend-email.provider";

const send = jest.fn();
jest.mock("resend", () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }));

const config = { get: (key: string) => ({ "app.email.resendApiKey": "re_test", "app.email.fromAddress": "PagosYa <hola@pagosya.bo>" } as Record<string, string>)[key] };
const pdf = { filename: "COB-0001.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.3").toString("base64") };

describe("ResendEmailProvider", () => {
  beforeEach(() => send.mockReset().mockResolvedValue({ error: null }));

  it("passes an HTML body and attachments through, keeping the text body", async () => {
    await new ResendEmailProvider(config as any).send({ to: "ana@example.com", subject: "Cobro", body: "texto", html: "<p>hola</p>", attachments: [pdf] });
    expect(send.mock.calls[0][0]).toEqual(expect.objectContaining({
      to: "ana@example.com",
      text: "texto",
      html: "<p>hola</p>",
      attachments: [{ filename: "COB-0001.pdf", content: pdf.content, contentType: "application/pdf" }],
    }));
  });

  it("sends a text-only request exactly as before", async () => {
    await new ResendEmailProvider(config as any).send({ to: "ana@example.com", subject: "Hola", body: "texto" });
    const payload = send.mock.calls[0][0];
    expect(payload).not.toHaveProperty("html");
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).toEqual({ from: "PagosYa <hola@pagosya.bo>", to: "ana@example.com", subject: "Hola", text: "texto" });
  });
});

describe("MockEmailProvider", () => {
  beforeEach(() => jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("records HTML and attachments so local runs and tests can read them", async () => {
    const mock = new MockEmailProvider();
    await mock.send({ to: "ana@example.com", subject: "Cobro", body: "texto", html: "<p>hola</p>", attachments: [pdf] });
    expect(mock.recent).toHaveLength(1);
    expect(mock.recent[0]).toEqual(expect.objectContaining({ html: "<p>hola</p>", attachments: [pdf] }));
    expect((Logger.prototype.log as jest.Mock).mock.calls[0][0]).toContain("attachments=COB-0001.pdf");
  });

  it("keeps only the last 20 messages", async () => {
    const mock = new MockEmailProvider();
    for (let i = 0; i < 25; i += 1) await mock.send({ to: `c${i}@example.com`, subject: "s", body: "b" });
    expect(mock.recent).toHaveLength(20);
    expect(mock.recent[0].to).toBe("c5@example.com");
  });
});
