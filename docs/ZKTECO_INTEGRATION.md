# ZKTeco SpeedFace-V5 integration boundary

Target hardware: **ZKTeco SpeedFace-V5**

Status: real adapter intentionally blocked pending official vendor documentation.

This document does not claim compatibility with a particular SpeedFace-V5 firmware, PUSH/ADMS server, SDK, port, command, or payload. No undocumented endpoint or command exists in the codebase.

## Confirmed

- The product target selected by the project owner is ZKTeco SpeedFace-V5.
- PagosYa exposes a vendor-neutral `AccessControlProvider` in `packages/access-control`.
- `MockAccessControlProvider` supports enrollment, deletion, roster sync, health, normalized events, unknown faces, spoof rejection, online/offline changes, enrollment failure, and duplicate input.
- `ZKTecoSpeedFaceProvider` is an isolated fail-closed skeleton. Every operation raises `ZKTecoDocumentationRequiredError`.
- The application consumes `NormalizedDeviceEvent`; vendor payloads never enter access policy code.
- PagosYa maps an event/device-specific `externalPersonId` to a central `BiometricIdentity`, then resolves the event-specific authorization and admission.
- SpeedFace devices are treated as temporary event-roster cache targets. The central identity can outlive a device mapping only when the customer explicitly selected reusable consent.
- PagosYa's database is authoritative for payment validity, admission state, presence, capacity, re-entry, and anti-passback.
- Provider selection uses `ZKTECO_INTEGRATION_MODE=mock|push|sdk`. The `push` and `sdk` values select the documented skeleton and cannot communicate with hardware yet.
- `apps/edge` is executable in local-only or cloud-forwarding mode and persists normalized events in an owner-only queue file. This confirms the PagosYa replay boundary, not any SpeedFace transport behavior.

## Unconfirmed

The following are deliberately **UNCONFIRMED** and must not be inferred from other ZKTeco product families:

- Whether the selected SpeedFace-V5 variant supports standalone PUSH, ADMS, a particular SDK, or more than one of them.
- Firmware family/version and regional variant.
- Default or configurable device ports.
- Transport security/TLS support and certificate behavior.
- Authentication and session establishment.
- Person/user record schema and identifier constraints.
- Whether face templates or other enrollment artifacts are portable between the exact selected devices, firmware, and algorithm versions.
- Whether a supported server-side identity/reference can be synchronized without transferring a template through PagosYa.
- Face enrollment command, whether enrollment can be initiated remotely, and where liveness/quality results are exposed.
- Recognition/access event schema, delivery guarantees, ordering, retry, and acknowledgement behavior.
- Event identifiers suitable for idempotency.
- Deletion semantics for a person versus a face credential.
- Event-specific roster capacity and batching limits.
- Health/status command and firmware discovery.
- Door-unlock command and authorization requirements.
- Offline event retention and retrieval behavior.

## Requires vendor documentation

Supply official documentation matching the exact device and firmware:

1. Full product identifier, hardware revision, regional suffix, and firmware version.
2. Official SDK package and programming guide, including supported operating systems/runtimes and license terms, if SDK mode is intended.
3. Official PUSH/ADMS protocol guide matching that firmware, if PUSH/ADMS mode is intended.
4. Network topology and configuration guide: device-to-server/server-to-device direction, ports, DNS requirements, time synchronization, proxy support, LAN/firewall rules, and TLS capability.
5. Authentication/credential provisioning and rotation guide.
6. Official person creation, face enrollment, update, roster synchronization, and deletion contracts.
7. Official real-time recognition, unknown-face, liveness/spoof, entry/exit, and device status event contracts.
8. Retry, acknowledgement, event ordering, event ID, pagination, and offline backlog semantics.
9. Device capacity and performance limits for face templates, event history, and concurrent synchronization.
10. Privacy/security documentation describing template storage, encryption, export controls, secure erase, auditability, and factory-reset behavior.

## Proposed integration mapping (application-side only)

| PagosYa concept | Provider boundary | Status |
|---|---|---|
| Device health | `healthCheck(device)` | Mock confirmed; SpeedFace requires docs |
| Enrollment | `enrollPerson(input)` | Mock confirmed; SpeedFace requires docs |
| Delete credential/person | `deletePerson(input)` | Mock confirmed; SpeedFace requires docs |
| Event roster | `syncEventRoster(input)` | Mock confirmed; SpeedFace requires docs |
| Remove event roster | `removeEventRoster(input)` | Mock confirmed; SpeedFace requires docs |
| Recognition events | `listenForEvents` / `getRecentEvents` | Mock confirmed; SpeedFace requires docs |
| Optional unlock | `unlockDoor(input)` | Mock acknowledgement only; SpeedFace requires docs |

`externalPersonId` is opaque to PagosYa and namespaced by device + event in `DevicePersonMapping`. It must not be a CI, email, phone, admission code, or other personal identifier. The same `BiometricIdentity` may have a different external ID on every terminal. Vendor constraints on its format are pending documentation.

`faceCapacity`, `algorithmVersion`, and `providerCapabilities` are configuration fields, not product claims. Production values must come from the exact hardware/firmware documentation or an approved hardware acceptance test. The application does not hardcode a SpeedFace-V5 capacity.

## Network and deployment

The optional `apps/edge` process is intended to run on a venue computer on the same LAN as access devices. It queues normalized events by globally unique `externalEventId` and retries cloud delivery. Cloud ingestion is idempotent. This architecture does not imply that the SpeedFace device supports any specific LAN protocol.

Edge configuration is independent from device credentials: `EDGE_CLOUD_EVENTS_URL`, `EDGE_CLOUD_TOKEN`, `EDGE_INGEST_TOKEN`, `EDGE_QUEUE_FILE`, `EDGE_PORT`, and `EDGE_FLUSH_INTERVAL_MS`. Never reuse `ZKTECO_PASSWORD` as an edge/cloud token.

Before deployment, document and test:

- static DHCP reservation or other supported device addressing;
- an isolated device VLAN;
- deny-by-default firewall rules;
- NTP/timezone behavior (`America/La_Paz` application default);
- TLS or a compensating secured LAN tunnel if the official device protocol lacks TLS;
- credential rotation and secure secret injection;
- failure mode when cloud or edge is unavailable;
- device roster deletion after the event retention window.

## Acceptance gate for real adapter work

Real implementation starts only when documentation proves every transport method, route/command, field, and acknowledgement used. Add protocol fixtures copied or derived from official examples, adapter contract tests, a hardware-in-the-loop test plan, and a security review. If a behavior is absent from the supplied documentation, it remains unsupported.
