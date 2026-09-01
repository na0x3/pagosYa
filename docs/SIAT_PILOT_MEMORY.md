# SIAT pilot operational memory

This file records the current SIAT certification blocker without storing
credentials or reusable authorization material. Do not add the delegated token,
CUIS, CUFD, system code, authorization codes, packaged XML, or portal password.

## 2026-08-17 — Stage XII purchase reception blocker

System `pagosYa`, version 1, provider type, online-computerized modality, is in
the SIAT pilot test environment. Stages I, II, III, IV, V, VI, VII, and XI are
complete. Stage XII, purchase reception, remains at 0 of 25 tests, leaving the
overall certification progress at 88%.

Endpoint:
`https://pilotosiatservicios.impuestos.gob.bo/v2/ServicioRecepcionCompras`

Last observed failures:

- `verificarComunicacion` returned HTTP 500 with SOAP fault `Fault occurred
  while processing`.
- `consultaCompras`, using valid CUIS and CUFD, returned transaction false,
  code `-1`, description `Error inesperado`.
- `recepcionPaqueteCompras` returned transaction false, code `-1`, description
  `Error inesperado`.

Local validation completed before reception:

- Purchase XML validated against the official `registroCompra.xsd`.
- The XML was placed in a TAR container and compressed with GZIP.
- Document count, Base64 encoding, GZIP integrity, and SHA-256 of the final
  compressed bytes were verified.
- Both the documentation field name `hash` and the live WSDL field name
  `hashArchivo` were tested; both produced the same SIAT code `-1` response.

The evidence bundle is in `tmp/siat/support-evidence-2026-08-17/`. The retry
runner is `tmp/siat/run-pilot-tests.mjs`; it reads saved SIAT configuration from
`apps/api/.env.local` and must never print secrets. The state file is
`tmp/siat/pilot-state.json`. At the time of the blocker, no purchase packages or
purchase cancellations had been accepted.

The support request asks SIAT to verify backend enablement and operation of
`ServicioRecepcionCompras` for pagosYa in the pilot environment. The next safe
retry sequence is: refresh CUFD if needed, run `verify-purchase`, run
`query-purchases`, then run a one-document `purchase-smoke 1 0`. Only run the
full `purchases` batch after the smoke request is accepted.

### Retry on 2026-08-17 at 15:01 -04:00

The safe retry sequence was executed with the saved configuration and still-
valid credentials:

- `verify-purchase`: HTTP 500, SOAP fault `Fault occurred while processing`.
- `query-purchases`: transaction false, code `-1`, `Error inesperado`.
- `purchase-smoke 1 0`: transaction false, code `-1`, `Error inesperado`.

No purchase package was accepted, so the full 25-test purchase batch was not
started. This retry reproduced the original external blocker without changing
the SIAT certification state.

### Retry on 2026-08-17 at 23:04 -04:00

The documented safe sequence was repeated while the saved point-0 CUFD was
still valid:

- `verify-purchase`: HTTP 500, SOAP fault `Fault occurred while processing`.
- `query-purchases`: transaction false, code `-1`, `Error inesperado`.
- `purchase-smoke 1 0`: transaction false, code `-1`, `Error inesperado`.

The smoke package contained one type-1 purchase. No package was accepted, the
purchase-package and cancellation counts remained zero, and the full Stage XII
batch was not started.

### Support-advised self-emitter/self-receptor test on 2026-08-18

SIAT support advised that the certification account should act as both the
factura emitter and receptor for the final Stage XII test. The point-0 CUFD was
refreshed, then one new Compra-Venta factura was emitted with the certification
NIT as both `nitEmisor` and the receptor's `numeroDocumento` (identity type 5,
NIT). SIAT accepted and validated that factura with status 908.

The accepted factura was immediately submitted as a one-document type-1
purchase package. Its exact CUF, invoice number, emission date, emitter NIT,
and monetary amounts were used in `F0_RegistroCompra`; the request-level NIT
was the same NIT, making the account both receptor and emitter. The generated
TAR/GZIP package passed integrity checks and the purchase XML validated against
the official `registroCompra.xsd`.

`recepcionPaqueteCompras` still returned transaction false, code `-1`,
description `Error inesperado`. No purchase package was accepted, so the full
Stage XII batch was not started. At that point this appeared to isolate the
remaining failure to the purchase-reception service rather than the factura
identity or XML/package construction.

### Retry on 2026-08-18 at 14:02 -04:00

The documented safe sequence was repeated against the exact
`RECEPCIÓN - INTERNO/ACTIVIDADES GRAVADAS` test-case parameters, using a
freshly refreshed point-0 CUFD:

- `refresh-cufd 0`: succeeded, new CUFD valid until 2026-08-19T13:58:41-04:00.
- `verify-purchase`: HTTP 500, SOAP fault `Fault occurred while processing`.
- `query-purchases`: transaction false, code `-1`, `Error inesperado`.
- `self-purchase-smoke`: emitted a brand-new self-emitter/self-receptor
  factura 252 at point 0, accepted and validated with status 908, then
  immediately submitted that exact factura as a one-document type-1 purchase
  package. `recepcionPaqueteCompras` still returned transaction false, code
  `-1`, `Error inesperado`.

Factura emission and validation continue to work normally on this account.
Both payload-independent purchase-service checks
(`verificarComunicacion`, `consultaCompras`) and a freshly generated,
correctly-identified purchase package all fail with the same signature as the
prior two days. No purchase package was accepted, and the full Stage XII
batch was not started. This retry reproduces the same external
purchase-service backend blocker with no change in symptoms.

### SIAT clarification and exact regeneration test

SIAT clarified that the purchase-module instruction applies to this system's
authorized Computarizada en Línea modality: the certification NIT must appear
as both emitter and customer in newly generated source facturas before their
data is submitted to Compras. In this support context, "facturas electrónicas"
was not an instruction to change the `pagosYa` system from modality 2 to
modality 1.

The authorization report `visor (1).pdf` lists `COMPUTARIZADA EN LÍNEA` for
`pagosYa`. A separate modality-1 CUIS probe returned transaction false, code
912, `EL SISTEMA NO ESTA ASOCIADO AL CONTRIBUYENTE`; no CUIS or factura was
created by that probe.

Following the clarified procedure literally, facturas 1, 2, 3, and 4 were
regenerated at point 0 with the certification NIT as both `nitEmisor` and the
customer `numeroDocumento`. SIAT accepted and validated every factura with
status 908. After all four existed, one purchase package was built from their
exact CUFs, invoice numbers, emission dates, emitter NIT, and monetary values.
All four `F*_RegistroCompra` files validated against `registroCompra.xsd`; the
TAR/GZIP package also passed integrity checks.

`recepcionPaqueteCompras` still returned transaction false, code `-1`,
description `Error inesperado`. A preceding immediate one-document attempt for
the newly regenerated factura 1 returned the same result. No purchase package
was accepted, so the full Stage XII batch was not started.

### Exact `RECEPCIÓN - INTERNO/ACTIVIDADES GRAVADAS` parameter retry

The support-provided test-case parameters were applied to the regenerated,
self-emitter/self-receptor facturas 1-4. `tipoCompra=1` remained inside every
`registroCompra`, `cantidadFacturas=4` satisfied the less-than-10 constraint,
and the saved valid CUIS/CUFD, period 8, management year 2026, send timestamp,
system code, NIT, compressed archive, and SHA-256 archive hash were used.

The live WSDL rejected `descripcion` as an unexpected SOAP element and showed
that outer `tipoCompra` is also not part of `SolicitudRecepcionCompras`; those
values describe the certification case and purchase XML rather than additional
SOAP fields. Omitting the non-applicable branch and point fields reached the
service but returned code 914, `CODIGO UNICO DE FACTURACION DIARIA (CUFD)
INVALIDO-R`. Sending both fields explicitly as `xsi:nil`, the closest SOAP
representation of `no aplica`, returned transaction false, code `-1`,
`Error inesperado`. No purchase package was accepted.

### Official-contract audit and unreported-source retry

The current official SIAT documentation and the live pilot WSDL were retrieved
and compared with the runner. They confirm that Computarizada en Línea emits
valid Facturas Digitales, unused `codigoPuntoVenta` must be sent as 0,
`codigoSucursal=0` identifies casa matriz, and every field in the live
`solicitudCompras` base type is required and non-nillable. The official
`registroCompra.zip` example and XSD match the local element ordering and
package construction. Local copies of the public reference artifacts are
`tmp/siat/official-registroCompra.zip`,
`tmp/siat/ServicioRecepcionCompras.wsdl`, and
`tmp/siat/ServicioFacturacionCompras.wsdl`.

The official service description says `recepcionPaqueteCompras` registers
purchases not declared by their emitters. A new four-document package was
therefore generated with fresh self-emitter/self-customer CUFs but without
first submitting those source facturas through `recepcionFactura`. With point
and branch restored to 0 and every transport field matching the WSDL, the
service still returned transaction false, code `-1`, `Error inesperado`.

Two payload-independent checks then reproduced the backend failure:
`consultaCompras` returned transaction false, code `-1`, no archive, and
`verificarComunicacion` returned HTTP 500 with server fault `Fault occurred
while processing`. Because neither operation contains a purchase XML/package,
these results demonstrate that the remaining blocker is purchase-service
backend enablement or operation for this pilot system, not a locally correctable
invoice, TAR/GZIP, hash, branch, point, or `registroCompra` field.

### Live WSDL re-verification and internal backend fingerprint on 2026-08-18

The live `ServicioRecepcionCompras` WSDL (including the imported base
`ServicioFacturacion.wsdl` types) was fetched fresh and compared field-by-field
against the runner's request builder for `solicitudCompras` and
`solicitudRecepcionCompras`. Every field, type, and sequence order matched
exactly, with nothing missing or extra. The purchase XML generated by that
same run was independently validated with `xmllint --schema` against
`registroCompra.xsd` and passed.

A raw, fully empty `verificarComunicacion` call (its schema is `<xs:sequence/>`,
so no field can be malformed) was sent directly and its full response headers
captured. It returned HTTP 500 with the same generic SOAP fault, and the
response headers exposed the internal Envoy/Kubernetes backend identity:
`x-envoy-decorator-operation: sre-sfe-rvcc-com-v2-soap.piloto.svc.cluster.local:39440/*`,
with `x-envoy-upstream-service-time: 4` (4 milliseconds). A parameterless
request failing in 4ms points to an unhandled exception in that specific
backend pod before any request processing, not a data-validation rejection.

### Fresh same-day repeat of the support-instructed self-emitter/self-receptor procedure

Following support's guidance (received the same day) to act as both emitter
and receptor, the procedure already on record in this file was repeated with
entirely new invoices rather than reusing old ones, using a freshly refreshed
point-0 CUFD:

- Four new self-emitter/self-receptor facturas were emitted at point 0
  (invoice numbers 254-257), each with the certification NIT as both
  `nitEmisor` and the customer `numeroDocumento`. All four were accepted and
  validated by SIAT with status 908.
- Those four facturas were packaged into a single `tipoCompra=1`,
  `cantidadFacturas=4` purchase submission, built from their exact CUFs,
  invoice numbers, emission dates, and monetary values.
- `recepcionPaqueteCompras` again returned transaction false, code `-1`,
  `Error inesperado`. No purchase package was accepted.

This reproduces the identical failure with same-day, freshly validated
facturas and a freshly refreshed CUFD, confirming the support-provided
procedure was already being followed correctly and that repeating it changes
nothing. Combined with the WSDL/XSD re-verification and the
`sre-sfe-rvcc-com-v2-soap` backend fingerprint above, the blocker is confirmed
external to this system's request construction.

### Retry on 2026-08-19 at 17:16 -04:00

The safe Stage XII sequence was repeated once more with a newly refreshed
point-0 CUFD:

- `refresh-cufd 0` succeeded; the new CUFD is valid until
  2026-08-20T17:16:38-04:00.
- `verify-purchase` returned HTTP 500 with SOAP fault `Fault occurred while
  processing`.
- `query-purchases` returned transaction false, code `-1`, `Error inesperado`,
  with no archive.
- `self-purchase-smoke` emitted a new self-emitter/self-receptor factura 258 at
  point 0. SIAT accepted and validated it with status 908. The immediate
  one-document type-1 purchase submission for that exact factura returned
  transaction false, code `-1`, `Error inesperado`.

No purchase package was accepted, so the full 25-test Stage XII batch was not
started. The purchase service retains the same payload-independent backend
failure signature observed on the prior retries.

### Forced 25-test batch attempt on 2026-08-19 at 17:20 -04:00

At the operator's explicit direction, the smoke-test gate was overridden and
the Stage XII batch was attempted on a best-effort basis despite the persistent
purchase-service failures.

- Fifty-five new self-emitter/self-receptor source facturas (259-313) were
  emitted at point 0. SIAT accepted and validated all 55 with status 908.
- All ten independent reception cases were submitted: purchase types 1-5,
  each as both a one-document package and a ten-document package.
- Every one of the ten `recepcionPaqueteCompras` calls returned transaction
  false, code `-1`, `Error inesperado`.
- SIAT issued no purchase reception code. Consequently, none of the ten
  dependent validation calls could be formed, and none of the five dependent
  cancellation calls could be formed; those operations require an accepted
  and validated purchase respectively.

The batch therefore attempted every independently executable Stage XII case,
but achieved 0 of 25 certification results. The sanitized machine-readable
result is `tmp/siat/purchase-batch-last.json`. The retry runner now provides a
`purchases-force` command that continues across reception failures and records
which dependent cases SIAT leaves unreachable.

### Retry on 2026-08-28 at 20:49 -04:00

The safe Stage XII sequence was attempted again with a newly refreshed point-0
CUFD:

- `refresh-cufd 0` succeeded; the new CUFD is valid until
  2026-08-29T20:49:23-04:00.
- `verify-purchase` returned HTTP 500 with SOAP fault `Fault occurred while
  processing`.
- `query-purchases` returned transaction false, code `-1`, `Error inesperado`,
  with no archive.
- `self-purchase-smoke` emitted a new self-emitter/self-receptor factura 314 at
  point 0. SIAT accepted and validated it with status 908. The immediate
  one-document type-1 purchase submission for that exact factura returned
  transaction false, code `-1`, `Error inesperado`.

SIAT issued no purchase reception code. The full batch was therefore not
started, because its ten validation and five cancellation cases would remain
unreachable and it would only create additional source facturas. Stage XII
remains at 0 of 25 with the same payload-independent backend failure signature.

### Support-requested package resubmission on 2026-08-28 at 20:53 -04:00

After SIAT support explicitly requested that the packages be sent again, the
complete best-effort Stage XII batch was repeated despite the failed smoke
gate:

- A new preliminary self-emitter/self-receptor factura 315 was accepted and
  validated with status 908; its immediate one-document purchase reception
  returned transaction false, code `-1`, `Error inesperado`.
- Fifty-five additional self-emitter/self-receptor source facturas (316-370)
  were generated at point 0. SIAT accepted and validated all 55 with status
  908.
- All ten independent reception cases were resubmitted: purchase types 1-5,
  each as both a one-document and a ten-document package.
- Every `recepcionPaqueteCompras` request returned transaction false, code
  `-1`, `Error inesperado`; SIAT issued no purchase reception code.
- The ten dependent validations and five dependent cancellations could not be
  formed because no reception was accepted.

The regenerated source facturas therefore satisfy the support instruction,
but the result remains 0 of 25. The sanitized batch result in
`tmp/siat/purchase-batch-last.json` was replaced with this latest run.

### Compression audit after SIAT support response

SIAT support subsequently stated that it could not correctly recover the XML
from the compressed file. The latest purchase package was audited again
against the official procedure and artifacts:

- The official service page requires individual `F*_RegistroCompra` XML files
  inside a TAR container, followed by GZIP compression of the TAR.
- Standard `gzip` and `tar` tools successfully decompressed and extracted every
  locally generated package entry.
- Every extracted XML was recognized as UTF-8 XML and validated against the
  official `registroCompra.xsd`.
- The TAR used the USTAR signature and the same extensionless entry names as
  the official `F0_RegistroCompra` example.

As an additional compatibility test, the GZIP operating-system header byte was
normalized to 0, matching the Java `GZIPOutputStream` reference implementation
published by SIAT. A new self-emitter/self-receptor factura 371 was accepted and
validated with status 908, and its one-document purchase package again passed
local GZIP, TAR, and XSD validation. `recepcionPaqueteCompras` nevertheless
returned transaction false, code `-1`, `Error inesperado`.

The compression claim also cannot account for the independent HTTP 500 from
the parameterless `verificarComunicacion` operation or code `-1` from
`consultaCompras`, neither of which carries a compressed purchase archive.

### Alternative package variants and enablement hypothesis

After SIAT confirmed that Computarizada en Línea is accepted for the purchase
module, three additional one-document submissions were made with newly
generated self-emitter/self-receptor source facturas. SIAT accepted and
validated source facturas 372-374 with status 908. The purchase submissions
tested:

- USTAR and GZIP produced entirely by the operating system's native `tar` and
  `gzip` executables, independently of the JavaScript archive builder.
- The same native archive with an explicit `.xml` extension on the internal
  `F0_RegistroCompra.xml` entry.
- Direct GZIP compression of the XML without a TAR layer, to test support's
  apparent expectation even though this contradicts the published service
  procedure.

All three variants returned transaction false, code `-1`, `Error inesperado`.
This rules out the custom TAR builder, the missing `.xml` suffix, and the
extra TAR extraction step as causes.

### Fresh authorization attempt on 2026-08-28

A completely new Computarizada en Línea authorization process was started on
2026-08-28 at 21:25. It received its own system code and delegated token. The
previous authorization attempt, its evidence, and its CAFC were left intact.
The CAFC was deliberately retained and was successfully accepted in the new
process for contingency package reasons 5, 6, and 7.

The following stages were completed and confirmed in the portal:

- Stage I: 2/2 CUIS (point of sale 1 and head office 0).
- Stage II: 1800/1800 catalog synchronizations (18 operations, 50 calls for
  each of the two points).
- Stage III: 200/200 CUFD requests.
- Stage IV: 250/250 individual electronic facturas, all accepted with status
  908.
- Stage V: 70/70 significant events after creating a distinct event CUFD and
  current CUFD for each point.
- Stage VI: 280/280 package cases. Every package was received as 901 and later
  validated as 908, including the CAFC-backed contingency cases.
- Stage IX: 80/80 massive-reception cases, covering quantities of exactly 1000
  and less than 1000 for both points, with every validation reaching 908.

The portal showed 70% overall after these seven stages. The isolated local
state is `tmp/siat/pilot-state-2026-08-28.json`; it does not replace the state
from the earlier attempt.

Stage VII remained blocked by the invoice-cancellation backend. Normal and
self-receptor facturas, from both point 1 and head office 0, were first verified
as valid (status 690) but `anulacionFactura` consistently returned status 906,
transaction false, message 999, `ERROR EN LA EJECUCION DEL SERVICIO (RCV)`.
No cancellation was applied, so Stage XI could not yet be exercised.

For Stage XII, 55 new electronic source facturas were generated with the same
NIT as emitter and customer; all 55 were accepted with status 908. Ten official
purchase receptions were then attempted (types 1-5, with quantities 1 and 10).
All ten returned transaction false, code -1, `Error inesperado`, without a
reception code. The parameterless `verificarComunicacion` operation still
returned HTTP 500. Additional single-document variants with a nillable
`codigoControl` and with the CUF-derived control code also returned code -1.
The portal's `Registro de Compras` action was disabled because Stage XII was
already present, ruling out an omitted portal action in this new process.

These results reproduce the purchase-service failure under a fresh system,
token, CUIS, CUFD, and authorization process while all other invoice and
package services work. This further isolates the blocker to the SIN purchase
backend rather than source factura modality, self-receptor data, CAFC,
compression, TAR layout, XML schema, or stale credentials.

The portal check was completed in the fresh authorization attempt. `Registro
de Compras` was disabled because Stage XII was already part of the process, but
the parameterless service still returned HTTP 500. No reset or additional
portal action remains available to correct that backend state.
