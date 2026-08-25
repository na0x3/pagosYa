import { assetUrl, fetchPublishedStores, PublishedStore } from "./api";

const grid = document.getElementById("directoryGrid")!;
const count = document.getElementById("storeCount")!;
const summary = document.getElementById("resultsSummary")!;
const empty = document.getElementById("directoryEmpty")!;
const error = document.getElementById("directoryError")!;
const loadMore = document.getElementById("loadMoreStores") as HTMLButtonElement;
const form = document.getElementById("directorySearch") as HTMLFormElement;
const searchInput = document.getElementById("storeSearch") as HTMLInputElement;
let currentPage = 1;
let currentSearch = new URLSearchParams(location.search).get("search")?.slice(0, 80) ?? "";
let loading = false;

const modeLabels: Record<PublishedStore["checkoutMode"], string> = {
  payment: "Compra en línea",
  whatsapp: "Pedido por WhatsApp",
  external: "Contacto directo",
};

function safeColor(value: string | null, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function formatPrice(amount: number | null, currency: string): string {
  if (amount === null) return "Ver catálogo";
  return new Intl.NumberFormat("es-BO", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount / 100);
}

function storeCard(store: PublishedStore): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "store-card";
  card.href = `/s/${encodeURIComponent(store.slug)}`;
  card.setAttribute("aria-label", `Abrir la tienda ${store.name}`);
  card.style.setProperty("--store-accent", safeColor(store.accentColor, "#ffbd59"));
  card.style.setProperty("--store-background", safeColor(store.backgroundColor, "#222222"));

  const media = document.createElement("div");
  media.className = "store-card-media";
  const cover = assetUrl(store.coverUrl);
  if (cover) {
    const image = document.createElement("img");
    image.src = cover;
    image.alt = `Imagen de ${store.name}`;
    image.loading = "lazy";
    media.append(image);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "store-card-fallback";
    fallback.textContent = store.name.trim().charAt(0).toLocaleUpperCase("es") || "P";
    media.append(fallback);
  }
  const logo = assetUrl(store.logoUrl);
  if (logo && logo !== cover) {
    const mark = document.createElement("img");
    mark.className = "store-card-mark";
    mark.src = logo;
    mark.alt = "";
    mark.loading = "lazy";
    media.append(mark);
  }

  const body = document.createElement("div");
  body.className = "store-card-body";
  const head = document.createElement("div");
  head.className = "store-card-head";
  const title = document.createElement("h3");
  title.textContent = store.name;
  const mode = document.createElement("span");
  mode.className = "store-card-mode";
  mode.textContent = modeLabels[store.checkoutMode] ?? "Ver tienda";
  head.append(title, mode);
  body.append(head);
  const description = document.createElement("p");
  description.textContent = store.tagline || store.featuredProducts.slice(0, 3).join(" · ") || "Explora el catálogo publicado por este comercio.";
  body.append(description);

  const meta = document.createElement("div");
  meta.className = "store-card-meta";
  const tags = document.createElement("div");
  tags.className = "store-card-tags";
  const categoryLabels = store.categories.length ? store.categories : [`${store.productCount} ${store.productCount === 1 ? "producto" : "productos"}`];
  categoryLabels.slice(0, 3).forEach((label) => {
    const tag = document.createElement("span");
    tag.textContent = label;
    tags.append(tag);
  });
  const price = document.createElement("div");
  price.className = "store-card-price";
  const priceLabel = document.createElement("span");
  priceLabel.textContent = store.minimumAmount === null ? "Catálogo" : "Desde";
  const priceValue = document.createElement("strong");
  priceValue.textContent = formatPrice(store.minimumAmount, store.currency);
  price.append(priceLabel, priceValue);
  meta.append(tags, price);
  body.append(meta);
  card.append(media, body);
  return card;
}

async function loadDirectory(page = 1, append = false) {
  if (loading) return;
  loading = true;
  grid.setAttribute("aria-busy", "true");
  error.hidden = true;
  empty.hidden = true;
  loadMore.hidden = true;
  if (!append) grid.replaceChildren();
  try {
    const result = await fetchPublishedStores(currentSearch, page, 24);
    const cards = result.stores.map(storeCard);
    if (append) grid.append(...cards);
    else grid.replaceChildren(...cards);
    count.textContent = String(result.pagination.total);
    summary.textContent = currentSearch
      ? `${result.pagination.total} ${result.pagination.total === 1 ? "tienda encontrada" : "tiendas encontradas"} para “${currentSearch}”`
      : `${result.pagination.total} ${result.pagination.total === 1 ? "comercio publicado" : "comercios publicados"}`;
    empty.hidden = result.pagination.total > 0;
    loadMore.hidden = !result.pagination.hasMore;
    currentPage = result.pagination.page;
  } catch {
    error.hidden = false;
    summary.textContent = "No se pudo actualizar el directorio.";
  } finally {
    grid.setAttribute("aria-busy", "false");
    loading = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  currentSearch = searchInput.value.trim().slice(0, 80);
  const url = new URL(location.href);
  if (currentSearch) url.searchParams.set("search", currentSearch);
  else url.searchParams.delete("search");
  history.replaceState(null, "", url);
  loadDirectory(1);
});
loadMore.addEventListener("click", () => loadDirectory(currentPage + 1, true));
document.getElementById("retryDirectory")!.addEventListener("click", () => loadDirectory(currentPage || 1, currentPage > 1));
document.getElementById("clearSearch")!.addEventListener("click", () => {
  searchInput.value = "";
  currentSearch = "";
  history.replaceState(null, "", location.pathname);
  loadDirectory(1);
});

searchInput.value = currentSearch;
loadDirectory();
