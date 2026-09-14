# Multiple stores and focused editor — September 14, 2026

The merchant profile can create and select multiple stores. Each retains its catalog, source project, publication state, and public URL. The API continues to restrict management to stores owned by the authenticated merchant.

Mi tienda is a searchable, filterable card library with a permanent creation tile. Saved source designs render in lazy, read-only thumbnails using the authenticated source-version API. Thumbnails do not start AI generation or run preview checks. A new store opens the editor after creation; returning to the library keeps all existing stores available. Store switches preserve the existing unsaved-work guard.

The source editor fills the viewport on desktop: YAPI on the left, the large preview on the right, and a return-to-stores button. On narrow screens the composer sits below the preview with expandable history. Management pages keep the bottom YAPI entry point and Pagosnet colors.

## Database and checkout

Migration `20260914163000_allow_multiple_stores` removes only the unique merchant index and was applied to the local database. The existing merchant lookup index and ownership foreign key remain. The migration README explains why restoring the unique rule requires an explicit ownership policy once multiple stores exist.

Checkout branding now looks up an explicitly selected store within the payment intent's authenticated merchant. An unscoped payment falls back only when that merchant has exactly one store, preventing one shop's checkout from using another shop's design.

## Verification

- 63 store-service and checkout-branding unit tests passed.
- 3 HTTP integration tests passed against disposable PostgreSQL, including applying the migration, concurrent creation, archived-store retention, separate catalogs, cross-account access denial, and preserving other stores after deletion.
- API, dashboard, and Studio TypeScript checks and the embedded Studio build passed; dashboard inline JavaScript syntax and git diff whitespace checks passed.
- Browser checks with an isolated local fixture covered saved-design thumbnails, full-viewport desktop editor, creating another store, returning to the library, store selection, search, and a phone-width creation dialog without horizontal overflow.
- The corresponding Playwright scenarios were updated; the full browser suite was not run in this session.

No production deployment or changes to existing merchant store content were made.

## Media, content and guided products (2026-09-14)

- `#dashboard-media` and `#dashboard-content` are independent management pages. Both keep the store picker and sidebar visible and use the selected store's authenticated API data. Navigation has matching SVG image/document icons.
- Media combines saved source images/videos/audio/icons, inline SVG, HTML/CSS references, configured section assets and catalog/variant photos. Search and type filters operate on this store's collection. Content lists inertly parsed page text, section/product text and articles; article/review management opens within Content.
- Store-card thumbnails now inherit the dashboard API base even when mounted before the design editor. This fixes the blank card caused by requesting the default `/api/v1` instead of the configured API.
- Products opens a fixed YAPI guide. Creation and editing use seven questions: name, description, price, photos, custom options, stock and review. Previous answers are editable. Data is written only when saving the review. Source Studio's Create product suggestion uses the same guide.
- Product edits preserve variant IDs and omitted metadata, reuse existing photos, and omit unchanged stock so an unrelated edit does not replace inventory with an old value. Store switching checks unfinished answers; save failures preserve the form and successful uploads for retry. Media/content refresh after catalog saves.
- Resource frames follow the dashboard theme without changing its preference or the storefront theme.

Validation: 8 focused Vitest tests cover resource collection, unsafe URL exclusion, the thumbnail API connection, question validation, review-before-save, retry, independent combination stock and preserving existing variant IDs/photos/stock. Studio and dashboard TypeScript checks, dashboard inline script syntax, and embedded build pass. The existing source-product browser spec was updated for seven steps; live visual verification could not be completed because Chrome's automation connection repeatedly timed out.
