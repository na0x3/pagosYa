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

- `apps/api` — backend NestJS + TypeScript + PostgreSQL/Prisma. Núcleo del gateway: cuentas de comercio, `PaymentIntent` (máquina de estados), métodos de pago tokenizados, ledger de doble entrada, webhooks firmados (HMAC) con reintentos, claves de idempotencia.
- `apps/checkout` — página de checkout (Vite + TS) servida en iframe desde el origen de pagosYa; es el único lugar donde los datos de pago tocan el DOM (reducción de alcance PCI estilo SAQ-A).
- `packages/widget-js` — script embebible (`pagosya.js`), análogo a Stripe.js, que monta el iframe de checkout y se comunica vía `postMessage`.
- `packages/sdk-node` — SDK tipado en TypeScript para el backend de los comercios.
- `packages/shared-types` — tipos compartidos entre api, checkout y widget.

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
```

`apps/demo` es el ejemplo end-to-end: un servidor mínimo que hace de "backend del comercio" (usa `@pagosya/sdk-node` para crear el `PaymentIntent`) y sirve una página que monta el widget contra ese pago — el mismo camino que seguiría cualquier integrador real.
