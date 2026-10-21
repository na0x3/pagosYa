import { escapeHtml as esc } from "./html.mjs";

/**
 * Por reponer (2026-10-21): on Inicio, the active products — or the variant of one — with 3 units or fewer, the emptiest
 * first, so the merchant restocks before customers find them sold out. Unlimited stock (null) is never low.
 */
export const LOW_STOCK = 3;

/** @param {Array<{ id: string, name: string, status?: string, stock?: number | null, variants?: Array<{ name: string, stock?: number | null }> }>} links */
export function lowStock(links, limit = 5) {
  const items = [];
  for (const link of links || []) {
    if (link.status && link.status !== "ACTIVE") continue;
    const variants = Array.isArray(link.variants) ? link.variants.filter((v) => typeof v.stock === "number") : [];
    if (variants.length) {
      const lowest = variants.reduce((min, v) => (v.stock < min.stock ? v : min));
      if (lowest.stock <= LOW_STOCK) items.push({ id: link.id, name: `${link.name} · ${lowest.name}`, stock: lowest.stock });
    } else if (typeof link.stock === "number" && link.stock <= LOW_STOCK) {
      items.push({ id: link.id, name: link.name, stock: link.stock });
    }
  }
  return items.sort((a, b) => a.stock - b.stock).slice(0, limit);
}

/** The card's inside, or "" when nothing runs low (the card then stays hidden). */
export function renderRestock(items) {
  if (!items.length) return "";
  const rows = items.map((item) => `<li class="restock-row"><span class="restock-name">${esc(item.name)}</span><span class="restock-left ${item.stock === 0 ? "is-out" : ""}">${item.stock === 0 ? "Agotado" : `Quedan ${item.stock}`}</span><button type="button" class="ghost" data-restock-id="${esc(item.id)}">Reponer</button></li>`).join("");
  return `<h2 id="overviewRestockTitle">Por reponer</h2><p class="muted">Productos con ${LOW_STOCK} unidades o menos.</p><ul class="restock-list">${rows}</ul>`;
}
