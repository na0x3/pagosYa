# Integraciones configurables desde el dashboard

**Fecha:** 2026-09-21
**Estado:** fases 1 y 2 implementadas y verificadas

## Problema

La sección *Integraciones* del dashboard mezcla dos cosas en una sola grilla:

- **12 funciones de PagosYa** (contacto, Comeback, correos, reseñas, envíos, tarjetas
  de regalo, archivos digitales, recomendaciones, catálogo, marca, dominio,
  redirecciones) que **sí** se configuran ahí.
- **8 servicios externos** (`apps/merchant-studio/src/integration-catalog.ts`) que son
  sólo `url` + `guide`. El panel de detalle dice literalmente que conectar cuentas e
  instalar etiquetas "todavía no están disponibles desde PagosYa".

No existe ningún campo en `schema.prisma` para guardar un ID de medición, ni
`packages/storefront-kit/` inyecta etiqueta alguna. El merchant no puede medir nada.

## Hallazgo que define la arquitectura

Todo el HTML que ve un comprador —tienda clásica y sitio generado por YAPI, en dominio
propio o en `/s/:slug`— pasa por un único punto:

`apps/checkout/storefront-seo.mjs` pide `/stores/public/:slug/seo` y ejecuta
`applySeoDocument`, que inserta `document.head` antes de `</head>`.

Ese `head` lo produce `StoreSeoService.document()` (`store-seo.service.ts:66`) llamando a
`seoHead()`. **Añadir las etiquetas ahí las pone en todas las páginas de todas las
tiendas publicadas, sin tocar el pipeline de publicación ni las tiendas ya publicadas.**

## Decisión: IDs pegados, no OAuth

Investigación de proveedores: GA4, Meta, TikTok y GTM se activan en el navegador con un
**ID público**. Ninguno exige que PagosYa se registre como app. Shopify hace lo mismo para
el caso común (*custom pixels*); su OAuth es sólo para las apps oficiales.

Por tanto fase 1 = campos de texto validados. Sin OAuth, sin tokens, sin secretos.

## Fase 1 — Etiquetas

### Datos

Campos nuevos en `Store`, todos `String?`:

| Campo | Formato aceptado |
|---|---|
| `analyticsGa4Id` | `G-` + 4-20 alfanuméricos |
| `analyticsGtmId` | `GTM-` + 4-20 alfanuméricos |
| `analyticsMetaPixelId` | 8-20 dígitos |
| `analyticsTiktokPixelId` | 10-30 alfanuméricos |
| `whatsappNumber` | `+` opcional + 8-15 dígitos |

### Seguridad — el punto crítico

Estos valores los escribe el merchant y terminan dentro de un `<script>` en el `<head>`.
Es un vector de XSS directo. La defensa es **validación por lista blanca con expresión
regular estricta en el DTO y de nuevo antes de inyectar**. Nunca se interpola un valor
que no haya pasado su regex. Un valor inválido no se guarda y no se inyecta. El `slug`,
que no tiene patrón, viaja como JSON con sus terminadores de script neutralizados.

### Consentimiento — hallazgo que corrigió el diseño

Durante la implementación apareció `packages/storefront-kit/kit/privacy.js`: la tienda
**ya pide consentimiento**, respeta Global Privacy Control, guarda la decisión por 180
días y emite `pagosya:privacy-change`. Inyectar los pixels directamente habría pasado por
encima de esa capa.

El diseño corregido: el `<head>` **no lleva ninguna etiqueta de proveedor**. Lleva una
sola *puerta* que carga GA4, GTM, Meta y TikTok únicamente cuando
`PAGOSYA_PRIVACY.analyticsAllowed(slug)` es verdadero, y que escucha un cambio de opinión
posterior para cargarlos sin recargar la página. Si esa capa no existe, la puerta no abre.

Además la puerta expone `PAGOSYA_ANALYTICS_AVAILABLE`, que hace que el panel de privacidad
se abra por sí solo: ahora hay algo real que preguntar.

### URLs privadas

`apps/checkout/storefront-seo.mjs` retira la puerta en URLs que llevan `client_secret`,
`recover`, `comeback` y demás claves privadas, porque toda etiqueta reporta la URL actual
a su proveedor. Una página que el merchant marcó `noindex` **sí** conserva la medición: no
indexar no es razón para no medir.

### Componentes

- `apps/api/src/store-seo/store-analytics.ts` — función pura
  `analyticsHead(settings) -> string`. Sin dependencias de Nest ni Prisma; testeable sola.
- `StoreSeoService.document()` — concatena `analyticsHead(store)` al `head`.
- DTO + `storeUpdateData()` — persistencia por el `PATCH /v1/stores/:id` existente.
- Studio: las tarjetas externas pasan de sólo-enlace a formulario con su campo, botón
  de guardar y estado "Configurada".

## Fase 2 — Eventos de ecommerce

`commerce.js` ya tenía un `track()` propio para su embudo con los eventos
`product_view`, `add_to_cart` y `checkout_started`. Se extendió ese mismo punto en lugar
de añadir un mecanismo paralelo: ahora reenvía a `gtag`/`fbq`/`ttq` con importe y moneda.
La venta se reporta desde `renderSuccess` en `payment-result.ts`, una vez por pedido.

Los importes son centavos enteros en pagosYa y unidades mayores para los proveedores.
La ausencia de `gtag`/`fbq`/`ttq` significa "no me rastrees", así que el evento se
descarta en silencio.

## Fuera de alcance

- **Fase 3**: marketplace de terceros con OAuth, webhooks y permisos. Decisión de negocio.
- **Conversions API / Events API** (server-side, tokens secretos).
- **Banner de consentimiento propio.** Ya no hace falta: se reutiliza el existente.
- **Un visitante que aterriza directamente en una URL con `client_secret`** no tiene las
  etiquetas cargadas, así que su compra no se reporta. En el recorrido normal (tienda →
  pago, sin recargar) sí se reporta. Cerrarlo del todo exige Conversions API server-side.
