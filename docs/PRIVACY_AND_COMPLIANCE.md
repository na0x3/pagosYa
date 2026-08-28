# Biometric privacy and compliance notes

This document describes engineering safeguards, not a claim of legal compliance. **Qualified Bolivian legal/privacy review is required before production launch**, including the exact consent text, lawful basis, notice, retention, data-subject rights, processor/vendor terms, incident duties, cross-border transfers, minors, and venue-specific operating procedures.

## Purpose limitation

PagosYa Events uses a facial identity only to associate an enrolled customer/attendee with a valid event admission and evaluate venue access. Payment method is never a biometric credential. Payment and biometric records remain in separate models and code boundaries. A reusable identity belongs to the existing PagosYa `ConsumerUser`, not to a Payment, ticket, or merchant.

The platform does not implement facial recognition or liveness algorithms. The approved terminal/provider performs recognition. PagosYa processes opaque identifiers and authorization state.

## Data minimized by design

Persisted application data includes:

- consent version, purpose, timestamp, revocation, and retention deadline;
- central identity, event-local attendee, admission, and authorization relationships;
- provider and opaque external credential/person identifiers;
- enrollment/deletion timestamps and non-biometric operational metadata;
- allowed/denied access decisions and reasons.

The ordinary schema does **not** contain face images or templates. Logs, audit metadata, support views, promoter views, payment records, and dashboards must never contain them. Raw vendor event bodies are not stored; only an optional non-sensitive vendor event reference is accepted.

## Consent scopes and enrollment lifecycle

1. Staff or an authenticated customer creates a random, six-digit, 15-minute, single-use enrollment session. The code identifies the session and contains no attendee or biometric information. Its HMAC digest—not the code—is stored.
2. The attendee receives a purpose notice and affirmatively chooses `EVENT_ONLY` or `REUSABLE` consent. Reusable consent requires an authenticated PagosYa customer account and is never inferred.
3. Device-side enrollment is preferred.
4. The platform stores only the minimum opaque/encrypted provider references required by the selected, documented integration.
5. Event-only consent receives `retentionUntil = event endsAt + retentionHours`. Reusable consent remains active only under its versioned notice and any configured expiry; every physical terminal copy remains event-scoped.
6. Revocation or expiry creates an auditable deletion job that deletes device mappings/provider records before clearing central provider references.

At event end, device roster copies are removed regardless of consent scope. The central identity is retained only for explicit reusable consent. A legacy credential migrated from the earlier admission-bound design is event-only by default.

If a future approved provider requires temporary imagery, that implementation must use encrypted temporary object storage, narrowly scoped service access, asynchronous processing, deletion immediately after processing, a hard lifecycle policy, and an explicit data-flow update to this document. It must never reuse the normal media/upload path casually.

## Access control

- Merchant identity reuses PagosYa's expiring, revocable dashboard session.
- Event staff roles are server-enforced.
- Cashiers and door staff receive only operational admission data.
- Promoters must never receive biometric credential IDs, device mappings, consent details beyond an operational enrolled/not-enrolled aggregate, or access to deletion/provider endpoints.
- Device secrets are stored only in an encrypted envelope and are redacted from API responses.
- Manual access requires an authorized user, explicit reason, timestamp, decision, and audit record.

## Retention and deletion

Each event has configurable `retentionHours` (24 by default; 48, 72, or a reviewed custom value are supported by the model). A scheduled production worker should find ended-event device mappings and event-only identities whose `retentionUntil` has passed and enqueue `BiometricDeletionJob` records. The current implementation also exposes explicit event cleanup and customer deletion actions.

Deletion must:

1. remove the event-specific person/face from every currently mapped terminal;
2. mark mappings `REMOVED` and record failures for retry;
3. revoke the central identity, consent, and event authorizations when central deletion was requested;
4. remove encrypted/opaque provider references and optional credential metadata;
5. mark related admission enrollment `DELETED` without deleting the admission;
6. preserve only the minimal auditable fact that deletion occurred;
7. retry failures and alert operators without logging biometric material.

Financial transactions, admission history, access decisions, and audit records have different legal/operational retention needs and are not erased merely because the biometric credential is deleted. Counsel must approve those schedules.

## Security and incident readiness

- HTTPS is assumed for public/cloud traffic.
- Venue device LANs should be isolated and firewall-restricted.
- Secrets are supplied through environment/secret management, never committed.
- Structured logs identify event/device/error category but exclude face payloads, templates, images, and secret configuration.
- Unknown-face and spoof-rejection counts are operational metrics, not reusable biometric datasets.
- Access to production databases, edge machines, device configuration, and backups must be least-privilege and auditable.
- Backups and replicas must honor deletion policy or use documented cryptographic erasure/expiry controls.
- Incident procedures must cover compromised terminal credentials, stolen edge hardware, vendor breach, unauthorized roster export, and deletion failures.

## Before production launch

- Complete legal review and Spanish consent/notice copy.
- Complete a data-protection impact/risk assessment.
- Sign and review vendor processor/security terms.
- Confirm the exact ZKTeco template and secure-deletion behavior from official documentation.
- Enable an encrypted secret manager and tested key rotation.
- Implement/operate the scheduled retention worker and deletion-failure alerting.
- Define support and attendee rights-request procedures.
- Conduct penetration, authorization, concurrency, offline/replay, and hardware-in-the-loop testing.
- Train venue staff on consent, fallback entry, manual overrides, privacy, and incident escalation.
