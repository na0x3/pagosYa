# pagosYa

Plataforma de pasarela de pagos boliviana, soluciones chatbots personalizados, pagos con tigo money, bancos, mastercard, criptomonedas, etc

## Modelo regulatorio

pagosYa opera bajo el régimen de **APP (Administradora de Pasarela de Pagos)**, no como ETF (Empresa de Tecnología Financiera). Esto significa que actuamos como pasarela de pagos sobre bancos, redes de tarjetas y Tigo Money ya regulados por ASFI — como Libélula — en lugar de sostener nuestra propia licencia financiera completa. Los rieles de pago (tarjetas, Tigo Money, transferencia bancaria, QR) se integran como adaptadores independientes de un banco/adquirente socio.

## Diferenciador: experiencia de integración

Libélula integra vía un manual PDF (v2.7.1, 2020) y plugins de e-commerce, sin documentación de API self-serve ni SDK oficial. pagosYa apuesta por una experiencia de integración moderna, al estilo Stripe:

- Llaves de API de prueba instantáneas
- Documentación interactiva (OpenAPI) generada desde el mismo código
- SDK oficial (`packages/sdk-node`)
- Widget de checkout embebible (`packages/widget-js`) en vez de solo plugins por plataforma

## Arquitectura

Monorepo (pnpm workspaces):

- `apps/api` — backend NestJS + TypeScript + PostgreSQL/Prisma. Núcleo del gateway: cuentas de comercio, `PaymentIntent` (máquina de estados), métodos de pago tokenizados, ledger de doble entrada, webhooks firmados (HMAC) con reintentos, claves de idempotencia, KYC/onboarding, Factura Electrónica (SIN) y payouts.
- `apps/checkout` — página de checkout (Vite + TS) servida en iframe desde el origen de pagosYa; es el único lugar donde los datos de pago tocan el DOM (reducción de alcance PCI estilo SAQ-A).
- `packages/widget-js` — script embebible (`pagosya.js`), análogo a Stripe.js, que monta el iframe de checkout y se comunica vía `postMessage`.
- `packages/sdk-node` — SDK tipado en TypeScript para el backend de los comercios.
- `packages/shared-types` — tipos compartidos entre api, checkout y widget.
- `apps/ops` — consola interna (HTML + JS sin build) para revisar/aprobar KYC. Cada revisor se autentica con su propio token `ops_...` (ver Ops/auditoría abajo), no con un secreto compartido.
- `apps/merchant-dashboard` — dashboard de comercio (HTML + JS sin build): balance, pagos, payouts, estado de KYC/facturación. Login propio (email/contraseña, `MerchantUser`/`MerchantSession`) — la llave secreta nunca toca el navegador; se usa una sola vez, desde el backend del comercio, para crear el login (`POST /v1/dashboard/signup`).

### Onboarding, facturación y payouts

- **KYC** (`apps/api/src/merchants/kyc.service.ts`): un comercio nace en estado `PENDING`, envía sus datos (`POST /v1/merchants/kyc`) y pagosYa los aprueba/rechaza (`POST /v1/merchants/kyc/:id/review`). Solo al aprobar pasa a `ACTIVE` y puede pedir llaves `live` (`POST /v1/merchants/live_keys`).
- **Factura Electrónica** (`apps/api/src/invoicing/`): mismo patrón que los rieles de pago — un `InvoicingProvider` con un mock de SIN/SIAT detrás, y un worker que emite facturas de forma asíncrona (outbox + reintentos) cuando un pago tiene éxito. **No implementa el algoritmo real de CUF/CUFD ni el XML de SIN** — la documentación técnica de SIN no fue accesible al construir esto (cadena de certificados TLS rota en siatinfo.impuestos.gob.bo); hace falta el spec real antes de un adaptador de producción.
- **Payouts** (`apps/api/src/payouts/`): un worker calcula el saldo no pagado de cada comercio `AGGREGATOR` (a partir del ledger) y lo transfiere vía un `PayoutProvider` (mock de un banco real). Los comercios `FACILITATOR` nunca se pagan aquí — sus asientos de `MERCHANT_PAYABLE` son solo informativos porque el riel ya liquidó directo a su cuenta.

### Ops y auditoría (`apps/api/src/ops/`)

Cada decisión de revisión de KYC queda atribuida a una persona concreta, no a "quien tuviera el secreto compartido":

- `OpsUser` — credencial por persona (token `ops_...`, ver `OpsUserService`). `INTERNAL_OPS_SECRET` ya solo protege `POST /internal/ops_users` (crear/revocar revisores) — el día a día de revisión usa el token propio de cada revisor (`OpsAuthGuard`).
- `AuditLogEntry` — registro de cada decisión (actor, acción, objetivo, metadata), escrito en la misma transacción que el cambio que audita. Consultable en `GET /internal/audit_log`.
- `pnpm run seed` crea un revisor demo (`ana@pagosya.bo`) e imprime su token la primera vez que corre.

### Login del dashboard de comercio (`apps/api/src/dashboard/`)

`MerchantAuthGuard` acepta llave secreta (`sk_...`) **o** token de sesión (`dash_...`) por prefijo, así que todos los endpoints de solo-lectura/configuración del comercio (`balance`, `payouts`, `payment_intents` list/get, `kyc`, `invoicing_profile`, `live_keys`) funcionan igual desde un backend (llave secreta) o desde `apps/merchant-dashboard` (sesión). Los endpoints que mueven dinero (`POST /v1/payment_intents`, `confirm`, `refunds`) siguen exigiendo llave secreta explícitamente — una sesión de dashboard nunca puede crear pagos.

`POST /v1/dashboard/signup` (con la llave secreta, desde el backend del comercio) crea el login; `POST /v1/dashboard/login` (público, email/contraseña) devuelve el token de sesión; `POST /v1/dashboard/logout` lo revoca.

### Rieles de pago (rails)

Cada riel (tarjeta, Tigo Money, transferencia bancaria, QR) implementa la misma interfaz `PaymentRailAdapter` (`authorize`, `capture`, `refund`, `getStatus`), resuelta en tiempo de ejecución por un `RailRegistry`. Mientras no existan credenciales reales de banco/adquirente/Tigo Money, cada riel corre contra un adaptador simulado (mock) con tokens de prueba deterministas — reemplazar un mock por una integración real implica escribir una nueva clase, sin tocar la lógica central.

### Flujo de pago

El comercio crea un `PaymentIntent` desde su backend con su llave secreta y entrega al navegador solo un `client_secret`. El widget monta un iframe de checkout que nunca expone datos sensibles ni la llave secreta al sitio del comercio. El `PaymentIntent` avanza por una máquina de estados (`requires_payment_method → requires_confirmation → processing → succeeded/failed/requires_action`) y cada cambio de estado exitoso genera asientos en el ledger de doble entrada y eventos de webhook, dentro de la misma transacción (patrón outbox).

## Cómo correrlo localmente

No requiere Docker: `apps/api` usa Postgres embebido (`embedded-postgres`) para desarrollo si no tienes Docker instalado; `docker-compose.yml` es la alternativa si sí lo tienes.

```bash
pnpm install
pnpm dev:db                                    # levanta Postgres local (o: docker compose up -d)
pnpm --filter @pagosya/api exec prisma migrate deploy
pnpm --filter @pagosya/api run seed            # imprime llaves sk_test_/pk_test_ de prueba
pnpm --filter @pagosya/api run start:dev       # API en :3000, docs OpenAPI en /docs
pnpm --filter @pagosya/checkout run dev        # checkout iframe en :5173
pnpm --filter @pagosya/widget-js run build     # genera packages/widget-js/dist/pagosya.js

PAGOSYA_SECRET_KEY=sk_test_... pnpm --filter @pagosya/demo run start   # demo de comercio en :4321
pnpm --filter @pagosya/ops run start                                  # consola de ops en :4322
pnpm --filter @pagosya/merchant-dashboard run start                   # dashboard de comercio en :4323
```

`apps/demo` es el ejemplo end-to-end: un servidor mínimo que hace de "backend del comercio" (usa `@pagosya/sdk-node` para crear el `PaymentIntent`) y sirve una página que monta el widget contra ese pago — el mismo camino que seguiría cualquier integrador real.

`apps/ops` y `apps/merchant-dashboard` llaman a la API directo desde el navegador, así que sus orígenes deben estar en `ADDITIONAL_CORS_ORIGINS` (ver `.env.example`).
