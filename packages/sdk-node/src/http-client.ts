import { PagosYaApiError } from "./errors";

export class HttpClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly defaultAuth: string,
  ) {
    // A base URL without a trailing slash makes `new URL(path, base)` replace
    // the last path segment instead of appending to it (e.g. ".../v1" +
    // "payment_intents" => ".../payment_intents", silently dropping "v1").
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: { body?: unknown; auth?: string; idempotencyKey?: string; query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${options.auth ?? this.defaultAuth}`,
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

    const response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new PagosYaApiError(
        (parsed as { message?: string })?.message ?? `pagosYa API request failed (${response.status})`,
        response.status,
        parsed,
      );
    }

    return parsed as T;
  }
}
