# Inbox del comercio

**Fecha:** 2026-09-21
**Estado:** diseño aprobado a nivel de enfoque; pendiente revisión del spec

## Problema

Un comprador escribe a la tienda —por el formulario del sitio o respondiendo el
correo de su pedido— y esa conversación vive fuera de pagosYa. El comercio la
atiende desde su Gmail y el panel nunca se entera. No hay historial, no hay
forma de que un segundo empleado retome el hilo, y el comercio tiene que saltar
entre dos aplicaciones para operar su tienda.

## Restricción que define el diseño

Para que pagosYa **reciba** la respuesta del comprador, esa respuesta tiene que
llegar a una dirección cuyo registro MX controlemos. De ahí sale un triángulo
donde solo caben dos de tres:

1. El comprador nunca ve una dirección `@pagosya.bo`
2. La conversación vive en el panel
3. Funciona en tiendas sin dominio propio

- Dirección en dominio de pagosYa → rompe (1)
- Dirección en el dominio del comercio → rompe (3)
- Su Gmail, que no podemos leer sin la auditoría CASA de Google → rompe (2)

Shopify renuncia a (2): su formulario es un relevo que manda el mensaje al
correo del comercio con `Reply-To` del cliente, y la conversación se va a Gmail.

**Decisión: renunciamos a (3).** El inbox exige dominio propio. Las tiendas sin
dominio se quedan en el relevo estilo Shopify, que ya funciona. Esto además
encaja con que pagosYa ya vende dominios (`apps/api/src/domains/`).

## Nivel 1 — relevo estilo Shopify (implementado)

Ya existía casi entero y se completó el hueco:

| Pieza | Dónde | Estado |
|---|---|---|
| Consulta del form → correo al comercio con `Reply-To` del cliente | `store-checkout.service.ts:459` | ya existía |
| Consultas visibles en Pagos con su texto y botón de correo | `dashboard.js` `renderPaymentRows` | ya existía |
| Notificación de pedido nuevo **respondible** | `email-workspace.config.ts` | añadido |
| `StoreEmailDelivery.replyTo` | migración `20260922020000` | añadido |

El comercio sin dominio opera así y el comprador solo ve la dirección real de la
tienda. No hay mención de pagosYa.

## Nivel 2 — inbox en el panel

### Alcance

Solo dos fuentes de hilo, que son las únicas entradas que existen hoy:

- `StoreLead` — consultas del formulario del sitio
- `StoreOrder` + `PaymentIntent.customerEmail` — compradores

El comprador nunca inicia un hilo desde cero: siempre cuelga de una consulta o
de un pedido. Eso acota el spam y hace que cada hilo tenga contexto comercial.

### Identidad de correo

Requisito: dominio verificado en el workspace de correo de la tienda
(`workspaceSender`, `email-workspace.config.ts:43`).

- **Envío:** `Nombre de la tienda <hola@sutienda.com>` — ya funciona
- **Recepción:** `hola@inbound.sutienda.com`, con el MX de ese subdominio
  apuntado a Resend
- **Correlación de hilo:** cabecera `Message-ID` propia por mensaje enviado, y
  correlación por `In-Reply-To` / `References` al recibir. Se prefiere esto
  sobre un token en la dirección (`+tag`) porque mantiene la dirección limpia,
  que es el requisito de marca. Como respaldo, si faltan esas cabeceras, se
  correlaciona por dirección del remitente contra el hilo abierto más reciente
  de esa tienda.

### Modelo de datos

```
StoreInboxThread
  id, storeId, merchantId
  subject
  customerEmail, customerName
  leadId?      -> StoreLead
  orderId?     -> StoreOrder
  status       OPEN | SNOOZED | CLOSED
  lastMessageAt, unreadForMerchant
  @@index([storeId, status, lastMessageAt])
  @@unique([storeId, customerEmail, leadId, orderId])

StoreInboxMessage
  id, threadId
  direction    INBOUND | OUTBOUND
  fromEmail, toEmail
  body         (texto plano; el HTML entrante se sanea a texto)
  messageId, inReplyTo
  deliveryId?  -> StoreEmailDelivery   (solo salientes)
  createdAt
  @@index([threadId, createdAt])
```

Salida reutiliza `StoreEmailDelivery` tal cual: cola, reintentos, dedupe y
dominio verificado ya resueltos. El inbox solo añade el hilo.

### Entrada

Un webhook público `POST /v1/email/inbound`, fuera de `MerchantAuthGuard`,
protegido por firma del proveedor — mismo patrón que
`baneco-qr-webhook.controller.ts` y `dlocal-webhook.controller.ts`, que ya
existen y verifican firma.

Pasos: verificar firma → resolver la tienda por el dominio del destinatario →
correlacionar el hilo → guardar `StoreInboxMessage` INBOUND → marcar el hilo
como no leído.

**Proveedor: Resend Inbound** (resuelto 2026-09-21). Disponible en general
desde finales de 2025, por webhook, con almacenamiento de 30 días. Se activa con
un solo registro MX en el host `inbound`, es decir sobre el subdominio
`inbound.sutienda.com`, así que **no puede tocar el correo principal del
comercio**. El webhook trae solo metadatos; el cuerpo y los adjuntos se piden
después por API.

### Abuso y privacidad

- Rechazar remitentes sin hilo previo: la dirección es pública, y sin esta regla
  el inbox es un buzón abierto a spam.
- Límite de tamaño y de adjuntos; en la primera versión **no** se aceptan
  adjuntos entrantes, solo se registra que venían.
- Sanear todo HTML entrante a texto antes de guardarlo. El contenido del
  comprador se renderiza siempre como texto en el panel, nunca como HTML.
- Aplicar límite de tasa por tienda.

### Interfaz

Una entrada **Inbox** en la barra lateral, dentro del grupo Cobrar. Lista de
hilos a la izquierda, conversación a la derecha, y al costado el pedido o la
consulta que originó el hilo con enlace a su fila en Pagos.

Ojo con el defecto de sección colapsada: `initDashboardSections` abre por
defecto solo las páginas de un bloque. La página de Inbox debe cumplir eso o
nacerá colapsada, que es el fallo que ya se corrigió en Pagos.

### Qué queda fuera de esta versión

- Adjuntos entrantes y salientes
- Respuestas guardadas y plantillas
- Asignación entre varios empleados
- Búsqueda de texto completo dentro de los hilos
- Cualquier canal que no sea correo

## Pruebas

- Unitaria: correlación de hilo por `In-Reply-To`, y por remitente cuando la
  cabecera falta
- Unitaria: un remitente sin hilo previo se rechaza
- Unitaria: el HTML entrante queda saneado a texto
- Integración: webhook con firma inválida responde 401 y no escribe nada
- Playwright: responder desde el panel encola una salida en `StoreEmailDelivery`
  con el remitente del dominio de la tienda
- Playwright: la página de Inbox abre su contenido sin un clic extra

## Preguntas abiertas

1. ~~¿Resend inbound está disponible?~~ Resuelto: sí, ver arriba.
2. ¿Conviene que pagosYa administre los nameservers de los dominios que vende?
   Hoy registra por Name.com sin manejar el DNS, y la integración de Cloudflare
   usa `custom_hostnames`, no propiedad de la zona. Si los administrara, podría
   poner el MX automáticamente y el inbox quedaría en un clic.
