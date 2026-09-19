# Store settings page (replaces the old Apariencia editor)

Decided 2026-09-19. The owner asked to delete everything that is no longer used —
"the old editor with fixed animations, etc." — keep SIAT, and restore the NIT
redirect.

## Why

The storefront is designed in YAPI (`Diseñar sitio`, Merchant Studio). The old
Apariencia view lost its sidebar entry in 1e82fbe and survived only behind
`#dashboard-appearance`. It still carried the only controls for settings the
live checkout reads, so those move to a small page and the rest is deleted.

## Kept — new "Configuración de la tienda" page, saved directly

Saved with `PATCH /v1/stores/:id` (live; no draft and no publish step) and
`PUT /v1/stores/:id/links`.

| Setting | Field(s) | Read by |
|---|---|---|
| Name, short description, logo | `name`, `tagline`, `logoUrl` | payment form, order tracking, branding, store directory |
| How the order ends | `checkoutMode`, `contactPhone` (WhatsApp), `leadCaptureUrl` | source storefront, cart review |
| Show low stock | `showLowStockToCustomers` | cart review |
| Support email | `contactEmail` | payment result, order tracking, debt collection |
| Pickup/delivery locations | `locations` | cart review (fulfilment) |
| Links | store links | source storefront, digital downloads |
| Custom domain + domain shop | domains API | public routing |

After saving a switch from lead-only to integrated payments without a CUIS,
the dashboard opens Facturación with KYC and invoicing expanded and says
"Pagos activados. Completa KYC y registra tu NIT para empezar a cobrar."
(this redirect was lost in 2101512).

## Deleted from the dashboard

Live preview and click-to-edit canvas, the Yapi visual studio for the legacy
site, content order and pages, animations, style (fonts, buttons, colours,
backgrounds), announcement bar, opening promotion, About/Catalog/Gallery
copy, banner, contact form, website draft/publish, cart recommendations
(Merchant Studio owns them).

Data already saved for these is untouched: the API and the checkout's legacy
template keep rendering it for stores that have not published a YAPI site.

## Also removed in this series

- Inline product form (scheduled discounts, photo framing, free extras).
- Floating Yapi assistant (alerts, goal, notes, chat, support tab).
- SIAT product classification moves into the YAPI product guide.
