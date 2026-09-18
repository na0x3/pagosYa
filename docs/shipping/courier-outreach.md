# Courier outreach: messages to send

These are ready-to-send drafts (Spanish) for the business steps the shipping integration needs.
Replace the `[…]` parts before sending. Track answers in the table at the bottom; the numbers go
straight into the merchant rate tables (phase 1) and into the carrier size limits in
`apps/api/src/shipping/parcel.ts` (`SIZE_LIMITS`).

## 1. Rate quote request: Servientrega Bolivia, OCS Bolivia, BoA Cargo (also Pakex, BC Plus, Cargo Express)

**Asunto:** Solicitud de tarifas corporativas para envíos de comercio electrónico

> Estimados, les saluda [nombre], de PagosYa ([sitio web]), una plataforma boliviana de pagos y
> tiendas en línea. Nuestros comercios envían pedidos dentro de la ciudad y entre departamentos, y
> queremos ofrecer su servicio en el checkout con la guía y el número de seguimiento integrados.
>
> ¿Podrían enviarnos sus tarifas corporativas para estos casos?
>
> 1. La Paz → Santa Cruz, Cochabamba y El Alto: caja de 1 kg y caja de 5 kg.
> 2. Santa Cruz → La Paz y Cochabamba: caja de 1 kg y caja de 5 kg.
> 3. Entrega dentro de la misma ciudad (La Paz, Santa Cruz, Cochabamba).
> 4. Costo por kilo adicional y cómo calculan el peso volumétrico.
> 5. Recargo por mercadería frágil y medidas/peso máximos por paquete.
> 6. Tiempos de entrega por ruta y horarios de recojo a domicilio.
> 7. Descuentos por volumen (estimamos [N] envíos al mes al inicio).
> 8. Si cuentan con alguna API, sistema web o archivo para registrar guías y consultar el
>    estado de los envíos.
>
> Quedamos atentos. Saludos, [nombre, cargo, teléfono].

## 2. DHL Express Bolivia: business account + MyDHL API

Open the account at https://mydhl.express.dhl/bo/es/home.html → "Abrir una cuenta", or contact the
Santa Cruz / La Paz office. Once the account exists, request MyDHL API credentials at
https://developer.dhl.com (product: "MyDHL API").

**Asunto:** Apertura de cuenta corporativa y acceso a MyDHL API

> Estimados, somos PagosYa ([sitio web]), plataforma boliviana de pagos y tiendas en línea.
> Queremos abrir una cuenta corporativa de DHL Express para envíos nacionales e internacionales de
> nuestros comercios, e integrar la MyDHL API (tarifas, creación de envíos y etiquetas, recojo y
> seguimiento) en nuestro checkout.
>
> ¿Qué requisitos necesitan para abrir la cuenta, qué tarifas nacionales ofrecen (La Paz ↔ Santa
> Cruz, 1 kg y 5 kg), y habilitan envíos domésticos dentro de Bolivia por la API?
>
> Saludos, [nombre, cargo, teléfono].

## 3. Patio Service / MotoClick: API access

Contact: https://www.patioservicedelivery.com/ (Servicios / Comercios) or their LinkedIn page.

**Asunto:** Integración de MotoClick en checkout de tiendas en línea

> Hola, les escribe [nombre] de PagosYa, plataforma boliviana de pagos y tiendas en línea. Nos
> interesa ofrecer sus entregas dentro de la ciudad directamente en el checkout de nuestros
> comercios: cotización al momento, reserva automática al confirmarse el pago y seguimiento.
>
> ¿Tienen una API (o planean abrirla) para cotizar, crear y rastrear envíos? Necesitamos:
> cotizar por dirección/coordenadas, programar el recojo, elegir moto o auto según el tamaño del
> paquete, cancelar, y recibir cambios de estado (webhook). ¿En qué ciudades y con qué tarifas?
>
> Saludos, [nombre, cargo, teléfono].

## 4. Uber Direct: is it available in Bolivia?

Sign-up form: https://merchants.ubereats.com/us/en/s/signup/direct/

**Subject:** Uber Direct availability in Bolivia (La Paz, Santa Cruz, Cochabamba)

> Hello, I'm [name] from PagosYa, a Bolivian payments and online-store platform. We'd like to
> integrate the Uber Direct API into our merchants' checkout. Is Uber Direct available in Bolivia
> (La Paz, Santa Cruz, Cochabamba), or is it planned? If so, what are the onboarding requirements
> and pricing? Thank you, [name, role, phone].

## Answers tracker

| Courier | Sent | Answered | 1 kg LPZ→SCZ | 5 kg LPZ→SCZ | Same city | Max size / weight | Fragile surcharge | API? |
|---|---|---|---|---|---|---|---|---|
| Servientrega Bolivia | | | | | | | | |
| OCS Bolivia | | | | | | | | |
| BoA Cargo | | | | | | | | |
| DHL Express | | | | | | | | |
| Patio Service | | | | | | | | |
| Uber Direct | | | | | | | | |

## Decisions already made

- PagosYa margin on platform-account shipments: **0%** at launch (`ShippingCarrier.platformMarginBps = 0`); ops can change it per carrier later.
- Platform-account shipping only for **AGGREGATOR** merchants (FACILITATOR merchants settle directly to their bank).
