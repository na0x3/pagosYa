import { EventEmitter } from "node:events";

jest.mock("node:https", () => ({ request: jest.fn() }));

import { request } from "node:https";
import { WebhookHttpClient } from "./webhook-http.client";

describe("WebhookHttpClient redirect handling", () => {
  it("treats redirects as failed deliveries and never follows the Location target", async () => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: 302,
      headers: { location: "https://127.0.0.1/internal" },
      destroy: jest.fn(),
    });
    const outgoing = Object.assign(new EventEmitter(), {
      setTimeout: jest.fn(),
      end: jest.fn(function end() {
        const callback = (request as jest.Mock).mock.calls[0][2];
        callback(response);
      }),
    });
    (request as jest.Mock).mockReturnValue(outgoing);

    await expect(new WebhookHttpClient().post("https://8.8.8.8/hook", "{}", {})).resolves.toEqual({
      ok: false,
      status: 302,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(response.destroy).toHaveBeenCalledTimes(1);
  });
});
