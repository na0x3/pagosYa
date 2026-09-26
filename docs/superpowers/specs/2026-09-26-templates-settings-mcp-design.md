# Plantillas preview & swap, one Ajustes page, and the pagosYa MCP — design

Date: 2026-09-26. Status: designed with the owner in conversation. Owner decisions, verbatim where short:
"make the template menu better looking"; "is the ajustes tab really neccesary?" → keep one Ajustes page as the only
place for store settings; "let the user change templates before making any changes"; swaps are adapted for free up
to 3 times (option a); "create mcp so people can connect also their own ai" with access **"Build, not publish"**.
Builds on `2026-09-26-yapi-from-templates-design.md`.

## Part 1 — Plantillas gallery, live preview, swapping

### 1.1 Gallery look (Studio `source-templates.ts` / `.css`)
- The dialog uses the Studio's sans UI font (not the monospace operator chrome), a quieter header ("Elige una
  plantilla" + one line) and a close icon button.
- Category chips sit on **one horizontally scrollable row**, each with its count ("Comida y bebidas 4").
- Cards: desktop capture with the phone capture overlapping the lower-right corner, name + category chip, a
  two-line clamped description; the whole card is one button with hover lift and a visible focus ring.
- At 390 px: one column, chips scroll, nothing overflows sideways.

### 1.2 Live preview with the merchant's store
- Clicking a card opens a **preview view inside the dialog**: that template rendered with the store's own name,
  products, prices and photos, in the Studio's existing sandboxed preview iframe; desktop/phone toggle; ← →
  (buttons and arrow keys) move through the templates of the current category; "Usar esta plantilla"; "Volver".
- Nothing is saved by previewing. API: `GET /v1/stores/:storeId/source-project/templates/:templateId/preview`
  → the prepared snapshot of `assembleTemplateRevision` for this store (the same pieces `apply` saves, run through
  `SourceProjectsService.prepare`), never persisted. Merchant-authenticated like `apply`.

### 1.3 Swapping before any change
- A store is **untouched** when its current revision is the one a template produced: the apply, or the free
  adaptation that followed it. The brief records it: `templateRevision` (server-set, carried forward by later
  edits, so any later edit makes `current.revision !== templateRevision`).
- Untouched → choosing another template (gallery or YAPI card) swaps without the "tu diseño actual queda en el
  historial" note; the YAPI cards stay tappable while untouched (today: only at revision 0).
- **Free adaptation on swaps (option a):** a template applied to a store whose design came from the YAPI flow
  (its brief carries `businessInformation` from the conversation) is adapted for free when the store has at most
  **4 template versions** (versions labelled `Plantilla: …`: the first pick + 3 swaps). Counted from
  `StoreSourceVersion` rows, which the merchant cannot delete, so the count cannot be reset. Beyond that the swap
  applies without adaptation and YAPI says the merchant can ask for it (a normal paid edit).
- Gallery swaps of a YAPI-flow store therefore run the adaptation too; the gallery shows "Aplicando y adaptando…"
  while it runs. Gallery picks on stores that never went through the YAPI flow stay instant (no AI), as today.
- The orchestration (apply → adaptation → chat message) lives in one place, `SourceChatService.useTemplate`,
  called by both the chat and the gallery apply endpoint.

## Part 2 — One Ajustes page

- The sidebar's "Ajustes" moves out of "Tu tienda" to the **bottom of the sidebar**, as the single home for store
  settings of the selected store.
- The Ajustes page gains three sections below the existing five (Identidad, Cómo termina el pedido, Contacto,
  Políticas, Ubicaciones e inventario): **Marca** (brand profile: colors, fonts, voice — the Studio's
  `openBrandProfile` panel), **Envíos y retiro** (`openShippingSettings`), **Dominio** (`openDomainShop`), each
  rendered by the Studio in an embedded frame (`library=settings&section=…`), like Integraciones today.
- In the Studio's Mi tienda menu, "Identidad de mi marca", "Envíos y retiro" and "Tu propio dominio" open the
  matching Ajustes section (`#dashboard-store-settings` + section anchor) instead of Integraciones.
- Integraciones keeps only integrations (analytics, ads, inventory connections).

## Part 3 — pagosYa MCP server ("Conecta tu IA")

### 3.1 What it is
A remote MCP server on the API at `POST /v1/mcp` (Streamable HTTP, stateless, `@modelcontextprotocol/sdk`), so a
merchant adds pagosYa to Claude (custom connector), Codex, Cursor or any MCP client with a URL and a key. Their AI
works with their store using **their own model**: no YAPI credits are spent by MCP calls.

### 3.2 Access: build, not publish
Allowed: read stores and products; create and update products; list, preview and apply templates; read the
design's files; write files (a new revision, through the same validation, compile and commerce contract as the
Studio's code editor); screenshot the store in the server sandbox. **Not exposed:** publishing, unpublishing,
domains purchase, payments, refunds, payouts, API keys, account settings. A tool cannot reach another merchant's
data: every tool resolves `storeId` through the key's merchant.

### 3.3 Keys
- New `ApiKeyType` value `MCP` (Prisma enum; migration file `…_api_key_type_mcp` adding the value — applied by the
  owner with `prisma migrate deploy`; nothing runs `migrate dev`, `reset` or `db push`).
- Issued, listed and revoked in **Ajustes → Conecta tu IA** (Part 2's page): "Crear clave", shown once, copy
  button, per-client setup snippets (Claude, Codex, Cursor), revoke. Reuses `ApiKeyService.issue/list/revoke`.
- An MCP key authenticates only `/v1/mcp` (`McpApiKeyGuard`, via `ApiKeyService.verify(key, 'MCP')`); secret and
  publishable keys are rejected there, and MCP keys are rejected by the existing guards (they check their type).
- Rate limit per key with the existing throttler.

### 3.4 Tools
| Tool | Does | Reuses |
|---|---|---|
| `list_stores` | the merchant's stores: id, name, slug, has design, published | `StoresService.listForMerchant` |
| `get_store` | one store: purpose, current revision, template id, product count, publication state | `SourceProjectsService.current` |
| `list_products` | products of a store (name, price, stock, options, photos) | `PaymentLinksService.listForStore` |
| `create_product` / `update_product` | same fields and validation as the dashboard form | `PaymentLinksService.create/update` |
| `list_templates` | the 21 Plantillas: id, name, category, description | `@pagosya/store-templates` |
| `apply_template` | applies a template (swap rules of §1.3, no AI adaptation — their AI adapts it) | `SourceTemplatesService.apply` |
| `get_design_files` | the current revision's text files (paths + contents; binaries listed by path) | `SourceProjectsService.version` |
| `write_design_files` | saves changed text files as a new revision; returns validation errors verbatim-safe | `SourceProjectsService.save` (same path as the code editor) |
| `screenshot_store` | PNG of the current revision at 1280 or 390, top of a page | `withVisualSandbox` (as the preview tool) |

Tool descriptions explain the store's source format (React components, `@pagosya/ui`, commerce hooks the platform
owns) in a few lines each, and point to `get_design_files` for the real structure.

### 3.5 Errors
Tools return MCP tool errors with the same merchant-facing messages the API uses (never stack traces or provider
diagnostics). A revision conflict tells the AI to re-read the files.

## Testing
- Part 1: API unit tests for `preview` (not persisted, uses the store's products), `templateRevision` set by apply
  and adaptation and carried by edits, untouched detection, swap adaptation allowed up to 4 template versions and
  not after, gallery apply on a YAPI-flow store runs the adaptation; Studio tests for chips row, card markup,
  preview navigation (arrows), no swap warning when untouched; browser check at 1280 and 390.
- Part 2: dashboard test that Ajustes renders the new sections and the nav item sits at the bottom; Studio test
  that the three menu items route to Ajustes sections.
- Part 3: unit tests per tool (ownership enforced, publish-like operations absent from `tools/list`), guard tests
  (MCP key accepted only on `/v1/mcp`; secret key rejected there; MCP key rejected by secret guard), an
  end-to-end test with the SDK client over HTTP: list_stores → get_design_files → write_design_files → screenshot.

## Out of scope
Publishing or money through MCP; OAuth sign-in for MCP clients (keys first; OAuth later if clients require it);
per-key store restriction; YAPI-credit-spending tools over MCP.
