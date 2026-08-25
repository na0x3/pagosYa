# Centro operativo

El centro operativo amplía cada tienda de pagosYa con CRM y puntos, automatizaciones, entregas, proveedores y compras, movimientos de inventario, conciliación, devoluciones, POS, conexiones externas, agenda con Google Calendar y suscripciones. La interfaz vive en **Panel de comercio → Centro operativo**; la API permanece disponible para integraciones más avanzadas.

## Preparación

Aplica la migración y regenera Prisma:

```bash
pnpm --filter @pagosya/api exec prisma migrate deploy
pnpm --filter @pagosya/api prisma:generate
```

Configura `MERCHANT_DASHBOARD_ORIGIN` y un `OPERATIONS_ENCRYPTION_KEY` aleatorio de al menos 32 caracteres. Para Calendar también hacen falta `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALENDAR_REDIRECT_URI`. La URI debe coincidir exactamente con la autorizada en Google Cloud y terminar, por defecto, en `/v1/calendar/google/callback`.

Las rutas bajo `/v1/stores/:storeId/operations` aceptan una sesión `dash_...` o una llave secreta `sk_...`. La API valida que la tienda pertenezca al comercio autenticado.

## Sincronización de stock externo

1. Crea una conexión y guarda el `secret` devuelto; solo se muestra una vez.
2. Importa productos con una columna `sku` y selecciona esa conexión para mapearlos automáticamente, o mapea cada SKU externo manualmente después.
3. El sistema externo envía el stock absoluto al webhook de la conexión.

El SKU puede guardarse en un producto sin configurar todavía su clasificación tributaria del SIN. Dentro de una tienda es único. La importación CSV acepta encabezados como `sku`, `codigo`, `codigo_interno`, `codigo_producto`, `item_code` y `product_code`.

Antes de enviar datos reales, valida la URL y el secreto sin modificar inventario ni suscripciones:

```http
POST /v1/integrations/:connectionId/ping
X-PagosYa-Sync-Secret: sync_REPLACE_ME
```

Una respuesta con `connected: true` confirma que la conexión está activa y que el secreto es correcto.

```http
POST /v1/integrations/:connectionId/stock
X-PagosYa-Sync-Secret: sync_REPLACE_ME
Content-Type: application/json

{
  "items": [
    { "externalSku": "SKU-001", "stock": 14 },
    { "externalSku": "SKU-002", "stock": 0 }
  ]
}
```

Cada sincronización crea un registro de ejecución y un movimiento auditable por producto. Los SKU sin mapeo se omiten; una llave inválida responde `401`.

Hay una base SQLite y un catálogo CSV listos para pruebas en `examples/cafe-aroma/`.

## Sincronización de suscripciones externas

La misma conexión puede recibir clientes y suscripciones. Antes de sincronizar, crea los planes recurrentes en PagosYa y relaciona cada código externo con uno de ellos mediante `POST /v1/stores/:storeId/operations/integrations/:connectionId/subscription-plan-mappings`.

```http
POST /v1/integrations/:connectionId/subscriptions
X-PagosYa-Sync-Secret: sync_REPLACE_ME
Content-Type: application/json

{
  "items": [
    {
      "externalSubscriptionId": "SUB-1001",
      "externalCustomerId": "CLI-001",
      "externalPlanCode": "CAFE-MENSUAL",
      "customerName": "María López",
      "customerEmail": "maria@example.com",
      "status": "ACTIVE",
      "nextBillingAt": "2026-08-22T12:00:00.000Z"
    }
  ]
}
```

Los identificadores externos son idempotentes: reenviar el mismo cliente o la misma suscripción actualiza el registro existente. Una cuota es única por suscripción y fecha de período. Al encontrar una fecha vencida, PagosYa crea un `PaymentIntent`, devuelve un enlace de checkout y lo envía por correo si el cliente tiene email. Un pago confirmado cambia la cuota a `PAID` dentro de la misma transacción que procesa el pago. Una sincronización repetida nunca retrocede `nextBillingAt`, por lo que una base externa desactualizada tampoco vuelve a abrir períodos que PagosYa ya procesó.

Los planes sin mapeo se devuelven en `skipped` y no crean datos parciales. Los estados admitidos son `ACTIVE`, `PAUSED` y `CANCELED`; solo `ACTIVE` genera cuotas. El importe opcional `amount` está expresado en centavos y reemplaza el precio del plan para esa suscripción.

## Superficie de API

| Área | Rutas principales |
| --- | --- |
| CRM y lealtad | `customers`, `customers/sync`, `customers/:id/loyalty` |
| Automatización | `automations`, `automations/run` |
| Entrega | `delivery/zones`, `delivery/couriers`, `delivery/orders/:orderId` |
| Inventario | `suppliers`, `purchase-orders`, `purchase-orders/:id/receive`, `inventory/adjust` |
| Finanzas | `reconciliation`, `pos/sessions`, `pos/sales` |
| Calendario operativo | `calendar/events`, `appointment-services`, `appointments`, `calendar/google/authorize`, `calendar/freebusy` |
| Recurrencia | `subscription-plans`, `subscriptions`, `subscriptions/generate-invoices` |
| Conexiones | `integrations`, `integrations/:id/mappings`, `integrations/:id/subscription-plan-mappings` |
| Autoservicio | `/v1/consumer/operations/favorites` y `/v1/consumer/operations/returns` |

El worker operativo revisa automatizaciones y cobros recurrentes cada 15 minutos. Los recordatorios por email usan el proveedor transaccional existente; sin `RESEND_API_KEY`, el proveedor local solo registra el mensaje. El canal WhatsApp queda almacenado como configuración pero no envía hasta conectar un proveedor de mensajería.

`GET /v1/stores/:storeId/operations/calendar/events?timeMin=...&timeMax=...` no mantiene una segunda copia de los datos. Devuelve una vista normalizada, derivada de citas, llegadas de órdenes de compra, inicios y cierres de descuentos, entregas, cobros recurrentes, facturas vencidas, plazos de devolución y fallos de sincronización. Cada elemento conserva el tipo e identificador de su registro de origen para abrir o ejecutar la acción correspondiente.

Las solicitudes de devolución reciben un plazo operativo de siete días. Recibir una orden de compra desde el calendario completa sus partidas vinculadas, aumenta el stock de cada producto y registra movimientos de inventario dentro de la misma transacción.

## Límites deliberados

- Una conexión de stock es de entrada y usa stock absoluto, evitando duplicar movimientos cuando el sistema externo reintenta.
- Google Calendar es opcional: una cita se conserva en pagosYa aunque Google esté temporalmente caído, registra el error de sincronización y vuelve a actualizar o eliminar el evento cuando el comercio reprograma o cancela la cita.
- Las suscripciones generan obligaciones internas; el cobro automático real necesita un mandato o token reutilizable del adquirente cuando ese riel esté disponible.
- Las importaciones de conciliación aceptan datos estructurados. Los adaptadores bancarios específicos pueden transformar CSV/Excel a ese contrato sin cambiar la lógica de cruce.
