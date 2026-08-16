import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the MATCHO showcase", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>MATCHO — Matcha frío<\/title>/);
  assert.match(html, /Tienda demostrativa/);
  assert.match(html, /MATCHA GREEN/);
  assert.match(html, /MATCHA STRAWBERRY/);
  assert.match(html, /MATCHA BLACK/);
  assert.match(html, /Un ritual frío, verde y fuera de lo común/);
  assert.match(html, /Cargando MATCHO/);
  assert.match(html, /DECK_CYCLE/);
  assert.match(html, /SYS_01/);
  assert.match(html, /Buscar productos/);
  assert.match(html, /Filtrar por categoría/);
  assert.doesNotMatch(html, /pagosYa|codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the storefront assets and removed starter preview", async () => {
  const [page, layout, css, packageJson, loader] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/card-stack-loader.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const products/);
  assert.match(page, /showDemoNotice/);
  assert.match(layout, /lang="es"/);
  assert.match(css, /@keyframes ticker-move/);
  assert.match(css, /@keyframes entry-loader-progress/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(loader, /AnimatePresence/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));

  for (const asset of ["hero.png", "background.png", "matcha-green.jpg", "matcha-strawberry.jpg", "matcha-black.jpg"]) {
    await access(new URL(`../public/matcho/${asset}`, import.meta.url));
  }
});
