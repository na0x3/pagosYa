const RESTRICTED_BROWSER_FEATURES = [
  "camera=()",
  "display-capture=()",
  "microphone=()",
  "payment=()",
  "publickey-credentials-get=()",
  "usb=()",
].join(", ");

export function applySecurityHeaders(response, { allowEmbedding = false, allowGeolocation = false } = {}) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", `${RESTRICTED_BROWSER_FEATURES}, geolocation=${allowGeolocation ? "(self)" : "()"}`);
  response.setHeader("cross-origin-opener-policy", "same-origin-allow-popups");
  response.setHeader("cross-origin-resource-policy", allowEmbedding ? "cross-origin" : "same-origin");
  response.setHeader(
    "content-security-policy",
    allowEmbedding
      ? "frame-ancestors https: http://localhost:* http://127.0.0.1:*"
      : "frame-ancestors 'none'; base-uri 'none'",
  );
  if (!allowEmbedding) response.setHeader("x-frame-options", "DENY");
  if (process.env.NODE_ENV === "production") {
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

export function hardenHttpServer(server) {
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
}
