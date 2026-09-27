// "Traer mi tienda de Shopify" (spec 2026-09-27): pure helpers for the import dialog.
const number = (value) => String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const plural = (count, one, many) => `${number(count)} ${count === 1 ? one : many}`;

export function importStep(view) {
  if (view.status === "REVIEW") return "review";
  if (view.status === "QUEUED" || view.status === "RUNNING") return "importing";
  if (view.status === "FAILED") return "failed";
  if (view.designStatus === "QUEUED" || view.designStatus === "RUNNING") return "building";
  if (view.designStatus === "COMPLETED") return "done";
  return "design";
}

export function countsLine(counts) {
  return [
    plural(counts.products, "producto", "productos"),
    counts.variants ? plural(counts.variants, "variante", "variantes") : "",
    counts.collections ? plural(counts.collections, "colección", "colecciones") : "",
    counts.pages ? plural(counts.pages, "página", "páginas") : "",
    counts.policies ? plural(counts.policies, "política", "políticas") : "",
    counts.photos ? plural(counts.photos, "foto", "fotos") : "",
  ].filter(Boolean).join(" · ");
}

export function progressLabel(progress) {
  if (progress?.stage === "photos") return `Copiando fotos: ${number(progress.done ?? 0)} de ${number(progress.total ?? 0)}`;
  if (progress?.stage === "catalog") return "Creando productos, colecciones y páginas…";
  if (progress?.stage === "done") return "Listo";
  return "En cola…";
}

export function parseExchangeRate(text) {
  const value = Number(String(text).trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}

/** What the import did, then every warning the worker recorded (photos not copied, products skipped, redirects over the cap). */
export function summaryLines(summary) {
  if (!summary) return [];
  const { created = 0, updated = 0 } = summary.products || {};
  const extras = [
    summary.collections ? plural(summary.collections, "colección", "colecciones") : "",
    summary.articles ? `${plural(summary.articles, "página", "páginas")} (sin publicar)` : "",
  ].filter(Boolean);
  const lines = [];
  if (created) lines.push(`Importamos ${plural(created, "producto nuevo", "productos nuevos")}${extras.length ? `, ${extras.join(" y ")}` : ""}.`);
  if (updated) lines.push(`Actualizamos precios y fotos de ${plural(updated, "producto", "productos")}.`);
  return [...lines, ...(summary.warnings || [])];
}
