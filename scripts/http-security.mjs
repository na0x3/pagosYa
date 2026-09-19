const RESTRICTED_BROWSER_FEATURES = [
  "camera=()",
  "display-capture=()",
  "microphone=()",
  "payment=()",
  "publickey-credentials-get=()",
  "usb=()",
].join(", ");

// Keep this aligned with packages/storefront-preview/src/source-location.ts.
// srcdoc is permitted by 'self'; map paths also have to pass the child's CSP.
// Leaflet scripts and OSM tiles are not frame destinations.
const STOREFRONT_FRAME_SOURCES = [
  "'self'",
  "https://www.openstreetmap.org/export/embed.html",
  "https://www.google.com/maps",
  "https://www.google.com/maps/",
  "https://maps.google.com/maps",
  "https://maps.google.com/maps/",
].join(" ");

export function applySecurityHeaders(response, { allowEmbedding = false, allowGeolocation = false, storefront = false } = {}) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", `${RESTRICTED_BROWSER_FEATURES}, geolocation=${allowGeolocation ? "(self)" : "()"}`);
  response.setHeader("cross-origin-opener-policy", "same-origin-allow-popups");
  response.setHeader("cross-origin-resource-policy", allowEmbedding ? "cross-origin" : "same-origin");
  response.setHeader(
    "content-security-policy",
    (allowEmbedding
      ? "frame-ancestors https: http://localhost:* http://127.0.0.1:*"
      : "frame-ancestors 'none'; base-uri 'none'")
      + (storefront ? `; frame-src ${STOREFRONT_FRAME_SOURCES}; child-src ${STOREFRONT_FRAME_SOURCES}` : ""),
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
