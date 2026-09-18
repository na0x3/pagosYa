# Product options and merchant workspace

The dashboard at `http://localhost:4323/#dashboard-products` now uses Pagosnet's cream, yellow, and lavender palette, outlined cards, and a persistent desktop sidebar. On phones the sidebar opens from **Menú**. **Medios** and **Contenido** open the existing Studio tools, and **Descuentos** has its own section.

YAPI stays at the bottom of management pages and moves beside the preview inside the editor. Outside the editor, **Abrir con YAPI** transfers the draft into the connected Studio conversation; it does not spend credits or send the message automatically. The Studio composer sends through the existing API. The editor uses a full-width workspace with YAPI on the left and a large preview on the right. On phones the conversation can expand above the composer. Dashboard theme changes also update the embedded Studio.

## Create options

1. Open **Productos → Añadir producto**, or **Crear producto** in Studio.
2. Enable customer options and enter your own group names and values, for example `Color: Azul, Blanco` and `Talla: S, M`.
3. Generate combinations, then set the price, stock, and optional product photo for each row. New rows start at stock **0**; blank stock means unlimited. Bulk edits apply only to visible, filtered rows.
4. Save. The storefront enables purchases only for the exact selected combination. Blue/S and White/S have independent inventory.

Up to six option groups and 256 combinations per product are supported. Option values can describe material, finish, flavor, capacity, or other merchant-defined attributes. This uses the existing variant JSON model and needs no new database migration. Existing variant IDs and unchanged stock are preserved on edits, including purchases made while an editor is open. Removing saved combinations requires reviewing the removal count and applying it explicitly.

## Local demonstration

With the checkout dev server running, open:

`http://localhost:5175/@fs/Users/saramia/pagosYa/examples/product-options/index.html`

This fixture uses the real option editor, Studio create-product form, and portable storefront selector, with local example data. It does not modify a merchant catalog or charge a customer.

## Verification — September 14, 2026

- 148 checkout/editor/availability tests passed.
- 47 API variant and option-schema tests passed.
- One targeted HTTP integration test passed against disposable PostgreSQL: product creation, public option availability, invalid/sold-out selection rejection, quantity limits, and preserving concurrently changed stock during edits.
- API, checkout, dashboard, and Studio TypeScript checks passed; embedded Studio build and dashboard inline-script syntax checks passed.
- Browser checks with isolated fixtures: create Color × Talla combinations, save Blue/S at 0 and White/S at 5, create a custom Material option through Studio, open Media, transfer a YAPI draft, retain theme across navigation, and navigate at 390px without horizontal overflow.
- The broader payment-links service suite has an existing, unrelated CSV model-selection expectation mismatch (`gpt-5.6-sol` expected, `gpt-5.6-luna` returned). It was not changed for this feature.

The workspace Playwright assertions were adjusted for the persistent sidebar and collapsed product form; that complete browser suite was not run in this session.
