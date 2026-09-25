# Fast Hosted Stores Implementation Plan (sub-project 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published store stops shipping every photo, font and video as base64 text; the hosted page loads them as cacheable files, so it paints quickly.

**Architecture:** The API's public site response replaces binary file contents with an empty `content` and `encoding: 'url'`, and returns an `assetPath` for that revision. A new public route serves those bytes, content-addressed by revision and digest, with immutable caching and CORS for the sandbox's opaque origin. Checkout turns `assetPath` into absolute URLs; the preview builder emits those URLs instead of `data:` URLs and allows exactly that directory in the sandbox's CSP. Studio's own previews are unchanged (they still pass base64).

**Tech Stack:** NestJS 11 on Express 5, Prisma, Jest (API); Vite + Vitest with jsdom (checkout, `@pagosya/storefront-preview`).

**Spec:** `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§1 finding "Hosted stores load extremely slowly", §3 row 0, §5 gate 4).

## Global Constraints

- The platform's CSP stays closed by default: only exact, validated directories are added (`default-src 'none'`, no wildcard hosts).
- Allowed asset origins must be HTTPS or `localhost`/`127.0.0.1` over HTTP, with no credentials, query or hash, the same rule as `uploadImageSource`.
- Only these binary extensions are ever served publicly: `png jpg jpeg webp gif avif mp4 woff woff2 ttf` (the list `publicSite` already exposes).
- Only revisions the public can already see are served: the published revision and an active experiment's control and variant revisions.
- Studio previews (`encoding: 'base64'` files) must render exactly as before.
- Test commands: API `pnpm --filter @pagosya/api exec jest <path>`; preview `pnpm --filter @pagosya/storefront-preview test`; checkout `pnpm --filter @pagosya/checkout exec vitest run <path>`.

## Review Focus

1. A path with `..`, an empty segment, or a non-media extension must return 404, never a file outside the snapshot's media → Task 2 test.
2. A slug reused by a different store must never receive an old store's cached photo: the digest in the URL must match the revision's digest → Task 2 test.
3. Fonts load from the sandbox's `null` origin only with `Access-Control-Allow-Origin: *`; a missing header silently falls back to a system font → Task 2 test asserts the header.
4. A draft revision (not published, not in an experiment) must not be downloadable by guessing its number → Task 2 test.
5. A `url`-encoded file whose URL is outside the validated asset directory must not be emitted into the document → Task 1 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/storefront-preview/src/source-preview.ts` (modify) | Understand `encoding: 'url'`; validate and allow `assetSources` in CSP. |
| `packages/storefront-preview/src/source-preview-hosted-assets.test.ts` (create) | Tests for the above. |
| `apps/api/src/storefront-source/source-publishing.service.ts` (modify) | `publicSite` strips bytes and returns `assetPath`; new `publicAsset`. |
| `apps/api/src/storefront-source/source-publishing.controller.ts` (modify) | New `GET assets/:version/*path` route. |
| `apps/api/src/storefront-source/source-public-assets.spec.ts` (create) | Tests for `publicAsset` and the route headers. |
| `apps/api/src/storefront-source/source-publishing.service.spec.ts` (modify) | Update the MP4 test to the new contract. |
| `apps/checkout/src/source-storefront.ts` (modify) | Resolve `url` files to absolute URLs and pass `assetSources`. |
| `apps/checkout/test/source-storefront.test.ts` (modify) | Test the resolution. |

---

### Task 1: Preview builder emits asset URLs for hosted stores

**Files:**
- Modify: `packages/storefront-preview/src/source-preview.ts` (`SourceFile` at line 9, `uploadImageSource` at line 24, `sourcePreviewDocument` at line 35)
- Create: `packages/storefront-preview/src/source-preview-hosted-assets.test.ts`

**Interfaces:**
- Produces: `SourceFile.encoding` gains `'url'` (content holds an absolute URL); `hostedAssetSource(value: string): string | null`; `sourcePreviewDocument(..., navigation)` accepts `assetSources?: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/storefront-preview/src/source-preview-hosted-assets.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hostedAssetSource, sourcePreviewDocument } from './source-preview';

const base = 'https://api.pagosya.test/v1/stores/public/tienda/source-site/assets/3-0123456789ab/';
const snapshot = { schemaVersion: 1, brief: {} as any, files: [
  { path: 'index.html', content: '<html><head><link rel="stylesheet" href="styles.css"></head><body><img src="assets/hero.jpg" alt=""><script src="config.js"></script></body></html>' },
  { path: 'styles.css', content: "@font-face{font-family:X;src:url('assets/x.ttf')}body{background:url(assets/hero.jpg)}" },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"hero":"assets/hero.jpg"};' },
  { path: 'assets/hero.jpg', encoding: 'url' as const, content: base + 'assets/hero.jpg' },
  { path: 'assets/x.ttf', encoding: 'url' as const, content: base + 'assets/x.ttf' },
] };

describe('hosted stores load bundled assets as files', () => {
  it('accepts only a local or HTTPS source-site asset directory', () => {
    expect(hostedAssetSource(base)).toBe(base);
    expect(hostedAssetSource('http://localhost:3001/v1/stores/public/t/source-site/assets/1-0123456789ab/')).not.toBeNull();
    for (const bad of ['http://evil.test/v1/stores/public/t/source-site/assets/1-0123456789ab/', 'https://api.test/v1/uploads/', base + '?x=1', 'https://u:p@api.test/v1/stores/public/t/source-site/assets/1-0123456789ab/', 'nonsense'])
      expect(hostedAssetSource(bad)).toBeNull();
  });

  it('emits URLs instead of base64 for images, CSS urls, fonts and config paths, and allows only that directory', () => {
    const html = sourcePreviewDocument(snapshot as any, 'index.html', { hosted: true, assetSources: [base] });
    expect(html).toContain(`src="${base}assets/hero.jpg"`);
    expect(html).not.toMatch(/data:image\/jpeg;base64/);
    expect(html).toContain(`img-src data: blob: ${base}`);
    expect(html).toContain(`font-src data: ${base}`);
    expect(html).toContain(`media-src data: blob: ${base}`);
    // The stylesheet is still inlined as a data: URL; decode it to check its font and background references.
    const css = atob(/href="data:text\/css;base64,([^"]+)"/.exec(html)![1]);
    expect(css).toContain(`url("${base}assets/x.ttf")`);
    expect(css).toContain(`url("${base}assets/hero.jpg")`);
    const config = atob(/src="data:text\/javascript;base64,([^"]+)"/.exec(html)![1]);
    expect(config).toContain(`"${base}assets/hero.jpg"`);
  });

  it('drops a url-encoded file that points outside the allowed asset directory', () => {
    const tampered = structuredClone(snapshot);
    tampered.files[3].content = 'https://evil.test/hero.jpg';
    const html = sourcePreviewDocument(tampered as any, 'index.html', { hosted: true, assetSources: [base] });
    expect(html).not.toContain('evil.test');
  });

  it('keeps Studio previews (base64 files, no asset sources) exactly as data: URLs', () => {
    const studio = { ...snapshot, files: snapshot.files.map(f => f.encoding === 'url' ? { path: f.path, encoding: 'base64' as const, content: btoa('bytes') } : f) };
    const html = sourcePreviewDocument(studio as any, 'index.html', {});
    expect(html).toContain('src="data:image/jpeg;base64,Ynl0ZXM="');
    expect(html).toContain('font-src data:;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pagosya/storefront-preview test -- source-preview-hosted-assets`
Expected: FAIL, `hostedAssetSource` is not exported.

- [ ] **Step 3: Implement**

In `source-preview.ts`:

1. Widen the file type (line 9):

```ts
export interface SourceFile { path: string; content: string; encoding?: "utf8" | "base64" | "url" }
```

2. Add the validator below `uploadImageSource`:

```ts
/** A published revision's own asset directory, served by the API. Same origin rules as uploads. */
export function hostedAssetSource(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || !/\/source-site\/assets\/\d+-[a-f0-9]{12}\/$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
```

3. In `sourcePreviewDocument`, widen the navigation type with `assetSources?: string[]`, then replace the `data` helper so URL files resolve to their URL only when it sits under an allowed source:

```ts
  const assetSources = (navigation.assetSources || []).map(hostedAssetSource).filter((source): source is string => Boolean(source));
  const inline = (file: SourceFile, content?: string) => `data:${mediaTypes[file.path.split(".").pop() || ""] || "application/octet-stream"};base64,${content !== undefined ? base64(content) : file.encoding === "base64" ? file.content : base64(file.content)}`;
  // Hosted stores hand us URLs for binary files; anything outside the validated directory resolves to nothing.
  const data = (file: SourceFile, content?: string) => file.encoding === 'url'
    ? (assetSources.some(source => file.content.startsWith(source)) ? file.content : '')
    : inline(file, content);
```

4. Scripts and stylesheets are text, never `url` files, so their existing `data(file, content)` calls keep inlining. Change the config substitution (line 64) so it also covers `url` files:

```ts
      for (const asset of snapshot.files.filter((f) => f.encoding === "base64" || f.encoding === "url")) content = content.split(JSON.stringify(asset.path)).join(JSON.stringify(data(asset)));
```

5. In the `img,source,video` loop, an empty `data()` result must remove the attribute rather than write `src=""`:

```ts
    if (file) { const value = data(file); if (value) el.setAttribute("src", value); else el.removeAttribute("src"); }
```

In the `video[poster]` loop, use the same rule: `const value = poster ? data(poster) : ''; if (value) el.setAttribute('poster', value); else el.removeAttribute('poster');`.

6. Add the directory to the CSP (the `policy.content` line). Keep every other directive exactly as it is, and change only these three:

```ts
  const assets = assetSources.length ? ' ' + assetSources.join(' ') : '';
```

Then in the template: `img-src data: blob:${assets}${imageSources.length ? ' ' + imageSources.join(' ') : ''}; font-src data:${assets}; media-src data: blob:${assets};`.

7. The runtime's `mediaAssets` map (line 110) calls `data(file)` and now gets URLs for hosted stores. Nothing else to change there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pagosya/storefront-preview test`
Expected: PASS, including the existing `source-preview-hosted-images.test.ts`. Its CSP assertion `img-src data: blob: https://api.pagosya.test/v1/uploads/;` still holds because it passes no `assetSources`.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-preview/src/source-preview.ts packages/storefront-preview/src/source-preview-hosted-assets.test.ts
git commit -m "feat(preview): hosted stores reference bundled assets by URL instead of inlining them"
```

---

### Task 2: API serves published assets and stops shipping their bytes in the site JSON

**Files:**
- Modify: `apps/api/src/storefront-source/source-publishing.service.ts` (`publicSite` at line 163)
- Modify: `apps/api/src/storefront-source/source-publishing.controller.ts` (`SourceSiteController` at line 75)
- Create: `apps/api/src/storefront-source/source-public-assets.spec.ts`
- Modify: `apps/api/src/storefront-source/source-publishing.service.spec.ts:17-28` (the MP4 test)

**Interfaces:**
- Produces: the `publicSite()` response adds `assetPath: string`, relative to the API base (e.g. `/stores/public/tienda/source-site/assets/3-0123456789ab/`). Binary files come back as `{ path, encoding: 'url', content: '' }`. New method `SourcePublishingService.publicAsset(slug: string, version: string, path: string): Promise<{ bytes: Buffer; contentType: string; etag: string }>`. New route `GET /v1/stores/public/:slug/source-site/assets/:version/*path`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-public-assets.spec.ts
import { NotFoundException } from '@nestjs/common';
import { SourcePublishingService } from './source-publishing.service';
import { SourceSiteController } from './source-publishing.controller';

const png = Buffer.from('fake-png-bytes');
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
  { path: 'index.html', content: '<img src="assets/a.png">', encoding: 'utf8' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};', encoding: 'utf8' },
  { path: 'assets/a.png', content: png.toString('base64'), encoding: 'base64' },
  { path: 'server.mjs', content: 'private', encoding: 'utf8' },
] };
const digest = 'a'.repeat(64);

function harness(opts: { experiment?: { controlRevision: number; variantRevision: number } | null } = {}) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 3, publishedRuntimeDigest: null }) },
    storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(opts.experiment ?? null) },
    storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest }) },
  };
  const service = new SourcePublishingService(prisma);
  const loads = jest.spyOn(service, 'snapshot').mockImplementation(async () => structuredClone(snapshot) as any);
  return { service, prisma, loads };
}

describe('published source assets', () => {
  it('publicSite returns URL placeholders and an assetPath instead of bytes', async () => {
    const { service } = harness();
    const site: any = await service.publicSite('tienda');
    expect(site.assetPath).toBe('/stores/public/tienda/source-site/assets/3-aaaaaaaaaaaa/');
    expect(site.snapshot.files.find((f: any) => f.path === 'assets/a.png')).toEqual({ path: 'assets/a.png', encoding: 'url', content: '' });
    expect(site.snapshot.files.some((f: any) => f.path === 'server.mjs')).toBe(false);
  });

  it('serves the bytes with the right type and an ETag, and caches the revision in memory', async () => {
    const { service, loads } = harness();
    const file = await service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png');
    expect(file.bytes.equals(png)).toBe(true);
    expect(file.contentType).toBe('image/png');
    expect(file.etag).toMatch(/^"[\w-]+"$/);
    await service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png');
    expect(loads).toHaveBeenCalledTimes(1);
  });

  it('refuses unpublished revisions, a wrong digest, traversal and non-media paths', async () => {
    const { service } = harness();
    for (const [version, path] of [['2-aaaaaaaaaaaa', 'assets/a.png'], ['3-bbbbbbbbbbbb', 'assets/a.png'], ['3-aaaaaaaaaaaa', '../assets/a.png'], ['3-aaaaaaaaaaaa', 'assets//a.png'], ['3-aaaaaaaaaaaa', 'server.mjs'], ['3-aaaaaaaaaaaa', 'assets/missing.png'], ['x', 'assets/a.png']])
      await expect(service.publicAsset('tienda', version, path)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves an active experiment variant revision', async () => {
    const { service } = harness({ experiment: { controlRevision: 3, variantRevision: 4 } });
    await expect(service.publicAsset('tienda', '4-aaaaaaaaaaaa', 'assets/a.png')).resolves.toMatchObject({ contentType: 'image/png' });
  });

  it('the route sets immutable caching, nosniff, cross-origin and CORS for the sandbox', async () => {
    const { service } = harness();
    const controller = new SourceSiteController(service);
    const headers: Record<string, string> = {};
    const res: any = { set: (h: Record<string, string>) => Object.assign(headers, h), status: jest.fn() };
    const body = await controller.asset('tienda', '3-aaaaaaaaaaaa', ['assets', 'a.png'], res);
    expect(body).toBeDefined();
    expect(headers).toMatchObject({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable' });
    const notModified = await controller.asset('tienda', '3-aaaaaaaaaaaa', ['assets', 'a.png'], res, headers.ETag);
    expect(notModified).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(304);
  });
});
```

Update the existing MP4 test in `source-publishing.service.spec.ts` (lines 17–28):
- Add `storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'a'.repeat(64) }) }` to its `prisma` mock.
- Change `mockResolvedValue` on the `snapshot` spy to `mockImplementation(async () => ({ ...same object... }))`, so each call gets a fresh copy.
- Replace its first `expect` with:

```ts
  expect(site.snapshot?.files.find(f => f.path === 'assets/ritual.mp4')).toEqual({ path: 'assets/ritual.mp4', encoding: 'url', content: '' });
  await expect(service.publicAsset('demo', '1-aaaaaaaaaaaa', 'assets/ritual.mp4')).resolves.toMatchObject({ contentType: 'video/mp4' });
```

- Rename the test to `'serves merchant MP4 video bytes from the asset route while omitting private export tools'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pagosya/api exec jest src/storefront-source/source-public-assets.spec.ts src/storefront-source/source-publishing.service.spec.ts`
Expected: FAIL, `publicAsset` is not a function and `assetPath` is undefined.

- [ ] **Step 3: Implement the service**

In `source-publishing.service.ts`, add after the imports:

```ts
const PUBLIC_ASSET = /\.(png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i;
const ASSET_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };
/** Published revisions are immutable, so their decoded media can be cached by store and revision. */
const ASSET_CACHE_REVISIONS = 12;
```

Add to the class:

```ts
  private readonly assetCache = new Map<string, Map<string, Buffer>>();

  /** Revisions a visitor can already see: the published one and a running experiment's arms. */
  private async servableRevisions(storeId: string, published: number): Promise<number[]> {
    const experiment = await this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } });
    return [published, ...(experiment ? [experiment.controlRevision, experiment.variantRevision] : [])];
  }

  private async assetVersion(storeId: string, revision: number): Promise<string> {
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { digest: true } });
    if (!version) throw new NotFoundException('Revisión no encontrada');
    return `${revision}-${version.digest.slice(0, 12)}`;
  }

  async publicAsset(slug: string, version: string, path: string): Promise<{ bytes: Buffer; contentType: string; etag: string }> {
    const missing = () => new NotFoundException('Archivo no encontrado');
    const match = /^(\d+)-([a-f0-9]{12})$/.exec(version);
    if (!match || !PUBLIC_ASSET.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw missing();
    const revision = Number(match[1]);
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, publishedSourceRevision: true } });
    if (!store?.publishedSourceRevision || !(await this.servableRevisions(store.id, store.publishedSourceRevision)).includes(revision)) throw missing();
    // The digest pins the URL to this store's exact revision, so a reused slug never inherits cached media.
    if (await this.assetVersion(store.id, revision) !== version) throw missing();
    const key = `${store.id}:${revision}`;
    let files = this.assetCache.get(key);
    if (!files) {
      const snapshot = await this.snapshot(store.id, revision);
      files = new Map(snapshot.files.filter(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path)).map(f => [f.path, Buffer.from(f.content, 'base64')]));
      this.assetCache.set(key, files);
      while (this.assetCache.size > ASSET_CACHE_REVISIONS) this.assetCache.delete(this.assetCache.keys().next().value!);
    }
    const bytes = files.get(path);
    if (!bytes) throw missing();
    return { bytes, contentType: ASSET_TYPES[path.split('.').pop()!.toLowerCase()], etag: `"${createHash('sha1').update(bytes).digest('base64url')}"` };
  }
```

In `publicSite`, replace the final `return` (line 191), which today reads:

```ts
    return { published: true, revision, visitToken, analyticsAvailable: true, snapshot: { ...snapshot, brief: {}, files: files.filter(f => /\.(html|css|js|png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i.test(f.path) && !['server.mjs', 'build.mjs'].includes(f.path)) } };
```

with this. The filter is unchanged; the `.map(...)` and `assetPath` are new:

```ts
    const assetPath = `/stores/public/${encodeURIComponent(slug)}/source-site/assets/${await this.assetVersion(store.id, revision)}/`;
    const publicFiles = files
      .filter(f => /\.(html|css|js|png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i.test(f.path) && !['server.mjs', 'build.mjs'].includes(f.path))
      // Binary media is served by publicAsset; the site JSON only names it.
      .map(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path) ? { path: f.path, encoding: 'url' as const, content: '' } : f);
    return { published: true, revision, visitToken, analyticsAvailable: true, assetPath, snapshot: { ...snapshot, brief: {}, files: publicFiles } };
```

- [ ] **Step 4: Implement the route**

In `source-publishing.controller.ts`, add `Headers`, `Res` and `StreamableFile` to the `@nestjs/common` import, add `import type { Response } from 'express';`, and add to `SourceSiteController`:

```ts
  /** Public media of a visible revision. Content-addressed by revision and digest, so it may be cached forever. */
  @Get('assets/:version/*path')
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  async asset(@Param('slug') slug: string, @Param('version') version: string, @Param('path') path: string[] | string, @Res({ passthrough: true }) res: Response, @Headers('if-none-match') ifNoneMatch?: string) {
    const file = await this.publishing.publicAsset(slug, version, Array.isArray(path) ? path.join('/') : path);
    res.set({
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // The storefront sandbox has an opaque origin; fonts are fetched in CORS mode and need this.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: file.etag,
    });
    if (ifNoneMatch?.split(',').some(value => value.trim().replace(/^W\//, '') === file.etag)) { res.status(304); return undefined; }
    res.set({ 'Content-Length': String(file.bytes.length) });
    return new StreamableFile(file.bytes);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @pagosya/api exec jest src/storefront-source`
Expected: PASS.

- [ ] **Step 6: Check the real route answers**

With the local API rebuilt and running, get a real asset path, then request it:

```bash
curl -s http://localhost:3001/v1/stores/public/<slug>/source-site | jq -r '.assetPath, (.snapshot.files[] | select(.encoding=="url") | .path)' | head -2
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3001/v1<assetPath><path>"
```

Expected: `200 image/jpeg` (or the asset's own type).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/source-publishing.service.ts apps/api/src/storefront-source/source-publishing.controller.ts apps/api/src/storefront-source/source-public-assets.spec.ts apps/api/src/storefront-source/source-publishing.service.spec.ts
git commit -m "feat(api): serve published store media as cacheable files instead of base64 in the site JSON"
```

---

### Task 3: Checkout hosts stores with asset URLs

**Files:**
- Modify: `apps/checkout/src/source-storefront.ts` (after `const snapshot: SourceSnapshot = site.snapshot;` near line 87, and `show` near line 114)
- Modify: `apps/checkout/test/source-storefront.test.ts`

**Interfaces:**
- Consumes: `assetPath` and `encoding: 'url'` files from Task 2; `sourcePreviewDocument(..., { assetSources })` from Task 1.

- [ ] **Step 1: Write the failing test**

Append to `apps/checkout/test/source-storefront.test.ts`:

```ts
it('loads bundled media from the published asset directory instead of inlining it', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  const hosted = site() as any;
  hosted.assetPath = '/stores/public/tienda/source-site/assets/3-0123456789ab/';
  hosted.snapshot.files[0].content = '<img src="assets/hero.jpg" alt=""><script src="config.js"></script>';
  hosted.snapshot.files.push({ path: 'assets/hero.jpg', encoding: 'url', content: '' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => hosted }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  const srcdoc = document.querySelector('iframe')!.srcdoc;
  expect(srcdoc).toContain('/v1/stores/public/tienda/source-site/assets/3-0123456789ab/assets/hero.jpg');
  expect(srcdoc).not.toContain('data:image/jpeg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pagosya/checkout exec vitest run test/source-storefront.test.ts`
Expected: FAIL. The `<img>` has no `src`, because the empty `url` file resolves to nothing.

- [ ] **Step 3: Implement**

In `source-storefront.ts`, right after `const snapshot: SourceSnapshot = site.snapshot;`, add:

```ts
  // Published media arrives as named files; the API serves their bytes from this revision's directory.
  const assetSource = typeof site.assetPath === 'string' ? new URL(`${API_BASE_URL}${site.assetPath}`, location.href).href : null;
  if (assetSource) for (const file of snapshot.files) if (file.encoding === 'url') file.content = assetSource + file.path.split('/').map(encodeURIComponent).join('/');
```

Change `show` to pass the source:

```ts
  const show = (page = 'index.html') => { frame.srcdoc = sourcePreviewDocument(prepared, page, { ...navigation, hosted: true, imageSources: [imageSource], assetSources: assetSource ? [assetSource] : [] }); };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pagosya/checkout run test`
Expected: PASS (all checkout tests).

- [ ] **Step 5: Commit**

```bash
git add apps/checkout/src/source-storefront.ts apps/checkout/test/source-storefront.test.ts
git commit -m "feat(checkout): hosted stores load their media from the published asset directory"
```

---

### Task 4: Measure the result in a real browser

**Files:** none changed. Evidence goes into the handoff.

- [ ] **Step 1: Rebuild and restart the local API** so the new route is live (`pnpm --filter @pagosya/api run build`, then restart the process on its current port and `CHECKOUT_ORIGIN`).

- [ ] **Step 2: Open a published store with photos**, e.g. `/s/bme3aw55` (cuadraa), in a storefront dev server whose port matches the API's `CHECKOUT_ORIGIN`.

- [ ] **Step 3: Measure.** In the page, run `document.querySelector('iframe').srcdoc.length`. Record the site JSON size from the network panel, and when the hero first appears.
Expected:
- srcdoc under 1 MB (it was 5,781,785 for cuadraa);
- site JSON under 1 MB;
- hero visible within about 2 seconds locally;
- photos and fonts show, with no fallback font and no broken images;
- no CSP violations in the console.

- [ ] **Step 4: Run the full suites**

Run: `pnpm --filter @pagosya/storefront-preview test && pnpm --filter @pagosya/checkout run test && pnpm --filter @pagosya/api exec jest src/storefront-source && pnpm --filter @pagosya/merchant-studio exec playwright test tests/cross-sell-kit.spec.ts`
Expected: all PASS. The Studio check confirms previews that still use base64 are unaffected.
