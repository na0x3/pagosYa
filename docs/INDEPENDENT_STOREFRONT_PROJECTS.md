# Independent storefront projects

## Checkpoint and development boundary

The workspace before this work is committed and pushed as `2101512` on
`session-work-20260827`. New development is on `feature/independent-storefront-projects`.
Switching back to the checkpoint branch restores tracked code. It does not undo
database migrations, upload changes, environment settings, or external operations.
Commit current work before switching so Git can preserve both lines of development.

## First increment: private source and portable exports

A store can now have its own source files, independent of the legacy `siteDocument`
renderer. `StoreSourceProject` tracks the current revision; `StoreSourceVersion`
stores immutable full snapshots. Each snapshot contains a business brief and files.
The brief records business type, audience, primary customer action and visual direction.
It is guidance for future generation, not a fixed list of layout or style enums.

Saving requires the current source revision (0 for the first save). The database
increments it and inserts the immutable snapshot in one transaction. A stale tab
or concurrent first save gets HTTP 409. Restoring revision 1 while revision 3 is
current creates revision 4 with the contents of revision 1; it retains all history.
Source revisions are separate from the existing website draft and publication revisions.

All endpoints use `MerchantAuthGuard` and check store ownership. There is no public
source endpoint. Source strings, imports and package scripts are never evaluated
by the API. Saving and restoring source do not change the published website,
products, inventory, payments, or the existing editor draft.

## API

Base: `/v1/stores/:storeId/source-project`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/` | Current revision and 30 history summaries; use `nextBefore` as `?before=` for the next page |
| PUT | `/` | Save `{ revision, label, brief, files }` as the next revision |
| GET | `/versions/:revision` | Exact source snapshot and digest |
| POST | `/versions/:revision/restore` | Append a restoration; body `{ revision: CURRENT_REVISION }` |
| GET | `/versions/:revision/export` | Download that exact revision as a ZIP attachment |

Each file has `path`, `content`, and optional `encoding` (`utf8` by default, or
`base64` for supported image/font files). The pilot allows 100 files, 180,000
characters per file, 512 KiB of decoded content in total, within the existing
1 MiB HTTP JSON limit. Large photography libraries require the upcoming asset
packaging pipeline; this increment is not a complete media-library exporter.

Paths must be relative and portable. Traversal, case collisions, file/directory
collisions, private configuration, generated output and dependency folders are
rejected. `.env.example` is allowed. Recognized private-key/live-token patterns
are rejected, but this check is not a comprehensive secret scanner. Include only
public browser configuration and example values in source files.

A project must include `package.json` with a build script and a nonempty
`README.md`. Direct dependencies cannot use workspace, local-file or symlink
protocols. These checks establish an artifact contract, not a verified successful
build: dependency resolution, sandbox builds and automated preview review remain
future work. No particular frontend framework is required.

The ZIP contains original files plus `pagosya-project.json`: a canonical source
digest, per-file SHA-256 hashes, business brief, revision and backend-dependency
disclosure. Archives have stable bytes for a given revision. Export verifies the
stored digest before returning a download. Source files and included small assets
are portable; the PagosYa commerce backend and customer data are not included.

## Developer workflow

Apply the checked-in Prisma migration to the intended development environment
using the repository's normal migration workflow, then rebuild/start the API.
The automated HTTP suite applies migrations to its own disposable PostgreSQL
instance; it does not migrate the user's development database.

Set `PAGOSYA_API_URL` to the API base ending in `/v1`, and
`PAGOSYA_MERCHANT_TOKEN` to an existing dashboard session or merchant credential.
Do not put this token in storefront source or pass it as a command-line argument.

```sh
pnpm storefront:source history --store STORE_ID
pnpm storefront:source save --store STORE_ID --input source-project.json
pnpm storefront:source export --store STORE_ID --revision 1 --out storefront.zip
pnpm storefront:source restore --store STORE_ID --target 1 --revision 3
```

The save file follows the API contract above. The CLI refuses credential-bearing
URLs, nonlocal plain HTTP, redirects and overwriting an existing output archive.

## Next increments

1. Author a complete café/restaurant source project with its own information
   architecture and buying flow, connecting the existing public catalog and
   commerce endpoints. Add fashion and service businesses as separate compositions.
2. Give the generator the business brief, verified content and source workspace;
   let it author complete frontend files, saving accepted output through this API.
3. Build generated code in a separate sandbox without merchant credentials; verify
   desktop/mobile renders, navigation and commerce behavior. Never run generated
   package scripts in the API or merchant dashboard process.
4. Add asset packaging, editor source revisions, preview origins, and explicit
   promotion of a verified deployment. Publishing should reference an exact
   source digest, and deployment rollback must be separate from source restoration.

The source pipeline is additive. Existing structured-document storefronts remain
available while independent projects mature. There is no AI source generation,
source editor UI, sandbox preview, deployment or publication switch in this increment.

## Verification

```sh
pnpm --filter @pagosya/api prisma:generate
pnpm --filter @pagosya/api build
pnpm --filter @pagosya/api exec jest --runInBand source-project.spec.ts source-projects.service.spec.ts
pnpm --filter @pagosya/api test:e2e --runInBand source-projects.e2e-spec.ts
```

Unit coverage checks paths, credential patterns, size limits, source digests,
archive CRCs with Python's independent ZIP reader, binary asset round-tripping,
an extracted build outside the monorepo, revision history and failure rollback.
HTTP/PostgreSQL coverage checks nested validation, authentication, cross-merchant
access, concurrent initial saves, public-store isolation, attachment delivery and
restoration with stale-revision rejection.
