# Independent storefront projects

## Checkpoints and rollback

The original workspace is committed and pushed as `2101512` on
`session-work-20260827`. Development continues on
`feature/independent-storefront-projects`; the source storage foundation is `d1443b3`.
Switching branches restores tracked code. It does not undo database migrations,
uploads, environment settings or deployments. Save current work before switching.

Source restoration appends a revision: restoring revision 1 while revision 3 is
current creates revision 4, preserving every previous snapshot. Source revisions
are separate from the existing website drafts and published storefronts.

## Merchant Studio

The normal merchant dashboard now opens this editor when a merchant selects or
creates a store, or chooses **Mi tienda** / **Configurar sitio con IA**. Chat and
preview fill the viewport; the purple **Menú** button opens the existing dashboard
navigation above the editor. A shared
store navigation keeps **Sitio · YAPI**, products, categories, operations, payments,
collection tools, and the existing invoicing/account controls together. Products
use the original CRUD, inventory, upload, variant, and fiscal mapping APIs.

Dashboard `dev` and `build` compile Studio into `public/studio` with base `/studio/`.
The dashboard serves it at the same origin and reuses the merchant session and API
configuration. The embedded editor stays mounted across workspace tabs. Switching
stores or logging out checks for active generation and unsaved work. Parent/frame
messages require both the exact origin and the exact frame window; generated code
remains in a separate opaque sandbox and receives no merchant credentials.
After editing Studio during a dashboard-only dev session, run
`pnpm --filter @pagosya/merchant-dashboard run build:studio` and reload. The normal
build also copies the embedded assets into dashboard `dist/studio`.

New source projects begin with a short required conversation. YAPI asks two contextual
questions across two turns about the business/customer action and visual direction,
then generates once the merchant's answers or delegated choices give a usable brief.
The server enforces this minimum even for legacy quick/build requests, and the direct
`/generate` route requires an existing revision. Brand form saves never generate a site.
Normal messages can ask questions or correct earlier details. Uploads and technical
brand settings remain optional. Confirmed facts, discovery progress, pending questions
and image roles survive reloads and failed requests. Legacy drafts retain their facts
and uploads but must complete the new conversation before first generation.
YAPI inspects attached image pixels and distinguishes logos, product/business photos
and design references; an unexplained attachment is never automatically labeled a logo.
Existing sites use the same interpretation before edits. A private, ownership-checked
catalog endpoint refreshes the preview without recording a public storefront view.
No SIAT activation or source publication is implied by this workspace integration.

For the standalone editor, run `pnpm dev:studio`, open `http://127.0.0.1:4312/?source=1`, and sign in with an
existing dashboard account. Use **Sitio a medida** in the existing editor workspace (alongside **Tienda actual**).
Both modes share the login, YAPI composer, icons, monospace typography, amber controls
and split chat/preview layout. Describe the business and site in chat, then continue
with follow-up requests. There is no separate setup form. Optional merchant-owned uploads supply up to 24 PNG/JPEG/WebP
images of at most 2 MB each, with a 6 MiB combined asset budget checked before generation.

Conversation uses the existing `StoreAgentThread`/`StoreAgentMessage` infrastructure.
A `source` message channel keeps these requests separate from the existing `website`
channel, which remains the default for earlier conversations. Each successful YAPI
reply links to its source revision. Vague requests reuse the existing clarification
choices before generation; failures preserve the request and a failure reply. Recent
conversation and the current source snapshot provide context for follow-up edits.
The latest 100 source messages are returned by the conversation endpoint.

New sites and full redesigns now use Next.js, React, TypeScript and Tailwind CSS; see [the current framework contract](source-design-generation.md#nextjs-source-and-previews). Ordinary edits preserve existing static projects. The legacy static generator authors HTML, CSS and classic JavaScript. It can
choose the structure and visual identity without using the legacy `siteDocument`
renderer or a list of theme presets. The platform supplies portable catalog/cart
code, public configuration, a dependency-free build script, local server and README.
An edit receives the prior authored files and retains previously bundled assets.
For an existing revision the model returns exact local search/replacement edits
and optional new files, rather than regenerating existing files. The server applies
those edits to a copy, preserves omitted files, and rejects ambiguous matches,
whole-file replacements and attempts to overwrite an existing file as a new one.
The complete merged project still goes through source validation and optimistic
revision checks. The edit instructions preserve unrelated design and distinguish
the latest request from conversation history. This constrains changes mechanically;
it does not prove that every local change is semantically within the requested scope.

Catalog cards open a product detail dialog by default. It shows the description,
price and all available product photos, with thumbnails, previous/next controls,
keyboard navigation and horizontal swipe on mobile. Adding to the order respects
stock and purchase limits; products with variants/extras link to the hosted option
selector outside preview. A single photo stays a single photo; no extra images are
invented. Merchants can upload up to ten product photos in the product form.

Review a saved revision in desktop/mobile preview, choose an HTML page, inspect and
edit its text files, download its ZIP, or restore an earlier revision. Saving one
text file sends only that file and appends a snapshot with the existing assets.
**Ver en navegador** opens the selected saved revision in a separate tab, with a
full-window preview and page selector. The tab supports reload, uses the current
catalog for the latest revision, and preserves historical revision data. It inherits
the editor session without putting credentials in the URL, severs its opener,
and keeps generated source in the same opaque iframe sandbox with test orders.
Save or discard code edits before opening a browser preview.
Unsaved edits disable revision changes and downloads. This increment has no
publication switch: an exported site's static `dist/` can be deployed separately.

## Café example

`examples/independent-cafe` is a standalone, individually designed café storefront:
local serif/sans fonts, an original generated breakfast photo, responsive menu,
category filters and an order sidebar. It has no workspace imports or dependencies.

```sh
pnpm dev:independent-cafe
# http://127.0.0.1:4315
```

The example uses an eight-product demonstration catalog. Demo orders never create
payments. A real export refreshes the public catalog before enabling purchases;
the API determines final stock and prices. Variants/extras use the existing hosted
product-detail flow. Payments use the existing hosted checkout; WhatsApp and
external contact checkout modes are supported. Commerce and customer data remain
on PagosYa. This is portable frontend source, not an exported payments backend.

To package the café for the existing source-save API:

```sh
node scripts/pack-storefront.mjs --dir examples/independent-cafe \
  --brief examples/independent-cafe/brief.json --out /tmp/cafe-source.json
pnpm storefront:source save --store STORE_ID --input /tmp/cafe-source.json
```

Review `config.js` before importing. It intentionally starts in demo mode.
The packer refuses overwriting output and limits imports to the existing HTTP body
limit. Large images should use Studio uploads and the generation endpoint.

## Server configuration

Apply the checked-in Prisma migrations and rebuild the API. The local development
source migration was applied on 2026-09-05; test suites use a disposable database.
Generation uses `OPENAI_API_KEY`, `OPENAI_VISUAL_STUDIO_ENABLED` and
`OPENAI_DESIGN_MODEL`. Set `PUBLIC_API_URL` to the public API base ending in `/v1`
(HTTPS in production) and `CHECKOUT_ORIGIN` to the checkout application. Allow each
deployed storefront origin in the API CORS configuration. Credentials belong only
on the server, never in exported configuration.

The production build copies `src/stores/source-kit` into the API distribution.
Generated scripts are parsed for syntax, never executed by the API. The supplied
build script copies static files and checks classic JavaScript syntax without
running storefront scripts. It requires Node 20+ and no dependency installation.

## API and storage

All routes require `MerchantAuthGuard` and store ownership.
Base: `/v1/stores/:storeId/source-project`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/` | Current revision and 30 summaries; paginate with `?before=nextBefore` |
| PUT | `/` | Save `{ revision, label, brief, files }` as the next revision |
| GET | `/conversation` | Saved source conversation and optional first-site welcome |
| GET | `/catalog` | Current public catalog projection, authenticated owner only; no view tracking |
| POST | `/messages` | Send `{ revision, instruction, assetUrls? }`; returns messages and an optional generated revision |
| POST | `/generate` | Generate from `{ revision, brief, instruction, assetUrls? }` |
| PATCH | `/file` | Edit `{ revision, path, content }`, preserving other files |
| GET | `/versions/:revision` | Exact source snapshot and digest |
| POST | `/versions/:revision/restore` | Append restoration; body `{ revision: CURRENT_REVISION }` |
| GET | `/versions/:revision/export` | Download exact revision as a ZIP attachment |

The brief contains businessType, audience, primaryAction and visualDirection.
Each file has path, content and optional encoding (`utf8` or supported image/font
`base64`). Limits: 100 files, 180,000 characters per text file, 2,800,000 encoded
characters per binary file, 8 MiB decoded total. Direct PUT imports still use the
existing 1 MiB HTTP JSON limit. Generation packages owned uploads server-side;
PATCH edits one text file without retransmitting binary content.

`StoreSourceProject` tracks the current revision; `StoreSourceVersion` stores
immutable full snapshots. Saving compares and increments the revision in the same
transaction as inserting the snapshot. Stale or conflicting requests return 409,
including generation when another tab saves while the model is running.

Paths must be relative and portable. Traversal, case and directory collisions,
private configuration, generated output/dependency folders, recognized private
credential patterns and nonportable direct dependency protocols are rejected.
This is not a comprehensive secret scanner or a security audit of customer code.
Every project needs package.json with a build script and a nonempty README.md.

The ZIP includes `pagosya-project.json`: source digest, per-file SHA-256 hashes,
brief, revision and backend-dependency disclosure. Exports verify the stored digest
and have stable bytes for a given revision. Selected uploaded images are bundled;
other product images may still depend on the API. Font licensing travels with the
café example. Custom fonts for AI-generated sites are not currently auto-bundled.

## Preview boundary and current limits

Studio loads source into an opaque iframe with only `sandbox="allow-scripts"`,
never `allow-same-origin`. Local scripts, styles, images and fonts become data URLs.
Studio also fetches catalog upload images from its configured platform API and
embeds them as data URLs before rendering. These fetches omit credentials, reject
redirects and non-image responses, and never contact merchant-authored hosts.
Successful uploads are cached during the Studio session; failed images can retry
on the next render. Saved source snapshots and historical image references remain
unchanged.
A restrictive CSP blocks fetch/subresource network requests, frames, workers and
forms; the preview flag disables the supplied commerce runtime's payment actions.
Static external links are removed. Local HTML links navigate through Studio's
trusted shell, carrying only product IDs/quantities and the page query/fragment.
The shell verifies the sending iframe and destination against the current snapshot;
the source sandbox still cannot access the session or network. Internal links with
`target="_blank"` open a separate preview tab. Page scripts read query parameters
from `window.PAGOSYA_PREVIEW_QUERY || window.location.search`.

The checkout button opens a review screen with editable quantities and fulfillment
choices. Preview users can continue through a clearly labeled test-payment screen
and return to the store; no real order or payment is created. Live exports continue
to the existing hosted checkout after review. Their cart persists across pages and
tabs using storage scoped to the store slug; preview navigation transfers a separate
cart without enabling live API writes.

Arbitrary customer JavaScript is untrusted. Browser sandboxing does not impose a
CPU/time limit, and script-driven self-navigation is not a comprehensive network
isolation boundary. Source must never be served on the merchant dashboard origin.
The preview is a review tool, not an assurance that arbitrary code is safe to deploy.

Still to build: automated visual/interaction review of every generated revision,
managed per-store deployment origins with exact-digest promotion and deployment
rollback, and more distinct business examples. This static pilot does not install
or execute arbitrary generated React/npm build systems. Manual source storage can
hold other frameworks, but the current preview/build kit targets static projects.

## Verification

```sh
pnpm --filter @pagosya/api build
pnpm --filter @pagosya/merchant-studio build
pnpm --filter @pagosya/api test --runInBand source-project source-generation source-chat store-agent.service
pnpm --filter @pagosya/api test:e2e --runInBand source-projects
pnpm --filter @pagosya/merchant-studio test:e2e
```

Tests cover paths, credential patterns, decoded size, binary preservation, ZIP
integrity and extracted builds, immutable history, conflict rollback, ownership,
HTTP validation, asset ownership before reads/model calls, generated-source syntax,
model failures, preview access to parent sessions/network, generation/edit/restore/
download UI, responsive overflow, catalog refresh, stock limits and checkout payloads.
The browser flow uses deterministic API responses; provider availability is checked
separately with a real generation smoke test.

## Account store limit

Each merchant account owns at most one store, including archived stores. The
`Store.merchantId` unique index enforces this across sessions and concurrent
requests; a second `POST /v1/stores` returns HTTP 409 with a Spanish explanation.
Deleting the store allows the account to create a replacement. The dashboard
shows the creation form only for an empty account, and Studio displays the store
name without a store selector. The list API remains an array with zero or one item.

Apply migration `20260906021000_one_store_per_merchant` with this release.
Databases with multiple stores per account must resolve those duplicates before
applying it; the migration does not delete or merge existing stores.

The retired four-step dashboard wizard has been removed. CSV imports stay on the
Products screen after confirmation; they never open design proposals. The AI
setup shortcut opens the independent Studio conversation with YAPI.
