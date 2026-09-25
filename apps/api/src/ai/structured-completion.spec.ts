import { BadGatewayException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { StructuredCompletionService } from "./structured-completion";

const schema = { name: "pagosya_proposal", schema: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string" } } } };
const options = { storeId: "store_1", stage: "proposal-draft", system: "Redacta una propuesta.", user: "Diseño de logo para una cafetería", schema };

function setup(values: Record<string, string | undefined> = { "app.openAi.apiKey": "sk-test", "app.openAi.conversationModel": "gpt-5.6-luna" }) {
  const usage = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => values[key] };
  return { usage, service: new StructuredCompletionService(config as any, usage as any) };
}

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const completed = { id: "resp_1", status: "completed", usage: { input_tokens: 10, output_tokens: 5 }, output: [{ content: [{ type: "output_text", text: "{\"title\":\"Logo\"}" }] }] };

describe("StructuredCompletionService", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock as any; });
  afterAll(() => { global.fetch = originalFetch; });

  it("asks for strict JSON with store:false, the default model and an untrusted-input rule", async () => {
    const { service, usage } = setup();
    fetchMock.mockResolvedValue(response(completed));
    const result = await service.structuredCompletion<{ title: string }>(options);

    expect(result).toEqual(expect.objectContaining({ data: { title: "Logo" }, model: "gpt-5.6-luna", responseId: "resp_1" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: "Bearer sk-test" }));
    expect(init.signal).toBeDefined();
    const body = JSON.parse(init.body);
    expect(body).toEqual(expect.objectContaining({
      model: "gpt-5.6-luna",
      store: false,
      max_output_tokens: 8000,
      text: { format: { type: "json_schema", name: "pagosya_proposal", strict: true, schema: schema.schema } },
    }));
    expect(body.input[0].role).toBe("developer");
    expect(body.input[0].content[0].text).toContain("Redacta una propuesta.");
    expect(body.input[0].content[0].text).toMatch(/datos no confiables/i);
    expect(body.input[1]).toEqual({ role: "user", content: [{ type: "input_text", text: options.user }] });
    expect(usage.record).toHaveBeenCalledWith("store_1", "proposal-draft", "gpt-5.6-luna", completed, expect.any(Number), "COMPLETED");
  });

  it("uses an explicitly requested model", async () => {
    const { service, usage } = setup();
    fetchMock.mockResolvedValue(response(completed));
    await service.structuredCompletion({ ...options, model: "gpt-5.6-sol", maxOutputTokens: 1200 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expect.objectContaining({ model: "gpt-5.6-sol", max_output_tokens: 1200 }));
    expect(usage.record.mock.calls[0][2]).toBe("gpt-5.6-sol");
  });

  it("maps a refusal to a 400 and meters it as failed", async () => {
    const { service, usage } = setup();
    const refused = { id: "resp_2", status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] };
    fetchMock.mockResolvedValue(response(refused));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadRequestException);
    expect(usage.record).toHaveBeenCalledWith("store_1", "proposal-draft", "gpt-5.6-luna", refused, expect.any(Number), "FAILED");
  });

  it("treats a truncated (incomplete) response as a 502", async () => {
    const { service, usage } = setup();
    fetchMock.mockResolvedValue(response({ ...completed, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadGatewayException);
    expect(usage.record.mock.calls[0][5]).toBe("FAILED");
  });

  it("treats invalid JSON and missing output as a 502", async () => {
    const { service } = setup();
    fetchMock.mockResolvedValueOnce(response({ ...completed, output: [{ content: [{ type: "output_text", text: "{not json" }] }] }));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadGatewayException);
    fetchMock.mockResolvedValueOnce(response({ ...completed, output: [] }));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadGatewayException);
  });

  it("treats an HTTP error as a 502 and meters it", async () => {
    const { service, usage } = setup();
    fetchMock.mockResolvedValue(response({ error: { message: "rate limited" } }, false, 429));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadGatewayException);
    expect(usage.record.mock.calls[0][5]).toBe("FAILED");
  });

  it("treats a network failure or timeout as a 502 and meters it with no body", async () => {
    const { service, usage } = setup();
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    await expect(service.structuredCompletion(options)).rejects.toThrow(BadGatewayException);
    expect(usage.record).toHaveBeenCalledWith("store_1", "proposal-draft", "gpt-5.6-luna", null, expect.any(Number), "FAILED");
  });

  it("refuses with a 503 before calling out when no key is configured", async () => {
    const { service, usage } = setup({});
    await expect(service.structuredCompletion(options)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usage.record).not.toHaveBeenCalled();
  });
});
