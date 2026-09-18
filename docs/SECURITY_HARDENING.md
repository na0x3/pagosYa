# Security hardening record

Last reviewed: 2026-09-11

This review treats pagosYa as a payment gateway with four primary trust boundaries: public browser/API traffic, merchant and ops credentials, inbound payment-provider callbacks, and outbound merchant webhooks. It is an engineering hardening record, not a regulatory certification or penetration-test attestation.

## Controls implemented

- Outbound webhooks accept public HTTPS destinations only. URL credentials, fragments, non-standard ports, private/loopback/link-local/reserved IPs, and mixed public/private DNS answers are rejected. DNS is checked again by the socket lookup used for the actual connection, redirects are not followed, responses have bounded headers, and requests time out.
- Deactivated webhook endpoints are excluded from pending delivery. HMAC signatures cover the exact serialized envelope, including event id and creation time.
- Refund amounts are reserved under a PostgreSQL row lock before contacting a rail. Pending and successful refunds both count against the remaining refundable balance. Refunds require a stable `Idempotency-Key`.
- Provider payment-method tokens are stored only as SHA-256 fingerprints plus their display suffix; the replayable token is passed to the rail but not persisted.
- Baneco callbacks use a header credential rather than a URL secret and are bound to the expected rail, amount, and currency. Duplicate terminal notifications are acknowledged without duplicating ledger entries.
- Checkout-session API calls use POST bodies, and widget/direct-checkout credentials use a URL fragment that is immediately removed into history state. Cross-window messages are restricted by both origin and iframe/window identity.
- API responses receive security headers and no-store defaults. Static application servers set anti-sniffing, referrer, permissions, framing, cache, and production HSTS policies and have bounded HTTP timeouts/header counts.
- Production startup fails closed on demo/short internal secrets, missing database configuration, insecure browser origins, or incomplete enabled Baneco credentials. API docs are off by default in production.
- CORS allows configured application origins plus active, verified custom storefront domains loaded from the database; arbitrary HTTPS origins are no longer reflected.
- JSON input rejects unknown DTO properties, unsafe object keys, excessive depth/complexity, unexpected content types, and oversized bodies. Uploaded media must match supported file signatures, not merely a multipart MIME claim.
- Authentication misses perform an Argon2 verification against a dummy hash to reduce account-timing enumeration. API-key verification narrows by prefix and last four before Argon2 to avoid linear CPU amplification.
- Error logs remove request queries and redact bearer-shaped secrets. Public 500 responses from the static servers are generic.
- API requests receive a bounded `X-Request-Id` (or a generated one) and unexpected-error logs carry the same identifier without echoing credentials. `/live` stays process-only while `/ready` verifies PostgreSQL for deployment probes.
- Production rate limits use shared Redis state across API replicas; local development keeps the in-memory provider. Storefront view counters are coalesced per process before PostgreSQL updates, and Prisma pool size/timeouts are explicit deployment settings.
- Active custom domains are revalidated periodically for both ownership TXT and storefront routing; a stale hostname is downgraded before it remains publicly resolvable.
- Review moderation uses bounded cursor pagination and status counts instead of an unbounded merchant-side list. Automated email failures persist a redacted provider message, are visible in the merchant retention panel, and are included in the restricted ops delivery-failure report.
- The local Docker database binds to loopback only. CI runs production dependency audits, uses read-only repository permissions, and Dependabot covers workspace packages, the separate Matcho lockfile, and GitHub Actions.

The implementation follows the current [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [NestJS security guidance](https://docs.nestjs.com/security/helmet), and [Express production security guidance](https://expressjs.com/en/advanced/best-practice-security/).

## Required before real-money production

1. Complete an independent penetration test against the deployed edge, API, dashboards, checkout, webhook egress, and cloud metadata controls. Source review cannot validate CDN, TLS, firewall, DNS, IAM, or secret-manager behavior.
2. Put the API and all browser apps behind TLS, set the exact `TRUST_PROXY` hop count, and enforce outbound network policy so the webhook worker cannot reach internal/control-plane networks even if application checks regress.
3. Move KYC identifiers, payout bank accounts, webhook signing secrets, and PaymentIntent client secrets under managed encryption with rotation and audited key access. They remain plaintext application fields today; disk encryption alone is not field-level protection.
4. Add account-plus-IP lockout telemetry and alerting around repeated authentication failures. Shared multi-instance throttling is implemented through `REDIS_URL`, but operational alerting still belongs in deployment observability.
5. Require MFA or hardware-backed identity for ops users and high-risk merchant actions. Current ops tokens are individual and revocable but single-factor.
6. Add tamper-evident/externally retained audit logs and alerts for KYC decisions, credential lifecycle, support access, refund anomalies, repeated authentication failures, webhook SSRF rejections, and exhausted delivery retries.
7. Complete PCI scope analysis with the acquiring bank/QSA before enabling a real card rail. The current checkout accepts mock opaque tokens only; raw PAN/CVV must never transit or persist in this application unless the resulting PCI scope and controls are intentionally accepted.
8. Move email verification and password-reset tokens from query-string links to fragment-to-POST exchanges in the public web application. The API logger now strips queries, but upstream proxy/email-scanner logs are outside this repository's control.
9. Exercise restore procedures, credential rotation, provider-key compromise, webhook-secret compromise, refund reconciliation, and incident-response runbooks in a production-like environment.
10. Configure and test the explicit review-request opt-in, Resend sender/domain verification, and a real delivered-order transition before enabling customer email automation. A passing local queue test does not prove provider acceptance or deliverability.
11. Apply the `20260911120000_add_email_delivery_failure_reason` migration before deploying the email observability changes; alert on exhausted email deliveries and verify that the redacted error is sufficient for provider support without exposing recipient data.

Until those items are closed, this codebase is materially safer but should not be represented as certified or ready to process unrestricted live funds.
