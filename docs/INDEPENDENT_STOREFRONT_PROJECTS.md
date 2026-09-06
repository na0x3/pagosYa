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

New source projects begin with saved chat questions: business/audience, logo,
existing catalog/featured products, colors/style, then an editable summary and
**Crear mi sitio** confirmation. Answers and selected images are stored in source
message metadata; failed generation can resume from the summary. Setup does not
create products or invent prices; **Administrar productos** opens the real product
form and returning preserves the message. A private, ownership-checked catalog
endpoint refreshes the preview without recording a public storefront view.
Existing source revisions continue directly with editing requests. No SIAT
activation or source publication is implied by this workspace integration.

For the standalone editor, run `pnpm dev:studio`, open `http://127.0.0.1:4312/?source=1`, and sign in with an
existing dashboard account. Use **Sitio a medida** in the existing editor workspace (alongside **Tienda actual**).
Both modes share the login, YAPI composer, icons, monospace typography, amber controls
and split chat/preview layout. Describe the business and site in chat, then continue
with follow-up requests. There is no separate setup form. Optional merchant-owned uploads supply up to six PNG/JPEG/WebP
images of at most 2 MB each, with a 6 MiB combined asset budget checked before generation.

Conversation uses the existing `StoreAgentThread`/`StoreAgentMessage` infrastructure.
A `source` message channel keeps these requests separate from the existing `website`
channel, which remains the default for earlier conversations. Each successful YAPI
reply links to its source revision. Vague requests reuse the existing clarification
choices before generation; failures preserve the request and a failure reply. Recent
conversation and the current source snapshot provide context for follow-up edits.
The latest 100 source messages are returned by the conversation endpoint.

The generator authors complete static HTML, CSS and classic JavaScript. It can
choose the structure and visual identity without using the legacy `siteDocument`
renderer or a list of theme presets. The platform supplies portable catalog/cart
code, public configuration, a dependency-free build script, local server and README.
An edit receives the prior authored files and retains previously bundled assets.

Review a saved revision in desktop/mobile preview, choose an HTML page, inspect and
edit its text files, download its ZIP, or restore an earlier revision. Saving one
text file sends only that file and appends a snapshot with the existing assets.
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
| GET | `/conversation` | Saved source conversation and current first-site setup question |
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
A restrictive CSP blocks fetch/subresource network requests, frames, workers and
forms; the preview flag disables the supplied commerce runtime's payment actions.
Static external links are removed and page selection lives in Studio.

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
