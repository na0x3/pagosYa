"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import CardLoader from "@/components/ui/card-stack-loader";

type Product = {
  id: string;
  name: string;
  description: string;
  image: string;
  category: "MATCHA" | "STRAWBERRY";
  tags: string[];
  price: number;
  variants?: Array<{ id: string; name: string; price: number }>;
};

const products: Product[] = [
  {
    id: "green",
    name: "MATCHA GREEN",
    description: "HECHA NATURALMENTE",
    image: "/matcho/matcha-green.jpg",
    category: "MATCHA",
    tags: ["Popular"],
    price: 290,
    variants: [
      { id: "small", name: "PEQUEÑA", price: 290 },
      { id: "large", name: "GRANDE", price: 350 },
    ],
  },
  {
    id: "strawberry",
    name: "MATCHA STRAWBERRY",
    description: "NATURAL, NO SUGAR",
    image: "/matcho/matcha-strawberry.jpg",
    category: "STRAWBERRY",
    tags: ["Popular"],
    price: 100,
  },
  {
    id: "black",
    name: "MATCHA BLACK",
    description: "NATURAL, NO SUGAR",
    image: "/matcho/matcha-black.jpg",
    category: "MATCHA",
    tags: ["Nuevo", "Favorito"],
    price: 100,
  },
];

const tickerPhrases = ["MATCHA GREEN", "MATCHA STRAWBERRY", "MATCHA BLACK"];

function TickerSequence({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <span className="ticker-sequence" aria-hidden={duplicate || undefined}>
      {tickerPhrases.map((phrase, index) => (
        <span className="ticker-pair" key={phrase}>
          <span className="ticker-symbol" aria-hidden="true">{index === 0 ? "◉" : index === 1 ? "✹" : "●"}</span>
          <span>{phrase}</span>
          <span className="ticker-dot" aria-hidden="true">•</span>
        </span>
      ))}
    </span>
  );
}

export default function Home() {
  const [entering, setEntering] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | Product["category"]>("ALL");
  const [sort, setSort] = useState("featured");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [variant, setVariant] = useState("small");
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const demoDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 1350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const dialog = demoDialogRef.current;
    if (!showDemoNotice || !dialog || dialog.open) return;
    dialog.showModal();
  }, [showDemoNotice]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = products.filter(
      (product) =>
        (category === "ALL" || product.category === category) &&
        (!normalizedQuery || `${product.name} ${product.description}`.toLowerCase().includes(normalizedQuery)),
    );
    if (sort === "price-asc") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") return [...filtered].sort((a, b) => b.price - a.price);
    return filtered;
  }, [category, query, sort]);

  const cartCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const cartTotal = products.reduce((sum, product) => {
    const unitPrice = product.id === "green" ? product.variants?.find((item) => item.id === variant)?.price ?? product.price : product.price;
    return sum + unitPrice * (quantities[product.id] ?? 0);
  }, 0);

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities((current) => ({ ...current, [productId]: Math.max(0, (current[productId] ?? 0) + delta) }));
  };

  return (
    <main>
      <div className={`entry-loader ${entering ? "" : "is-leaving"}`} role="status" aria-label="Cargando MATCHO">
        <CardLoader />
      </div>

      <aside className="ticker" aria-label="Productos MATCHO">
        <span className="sr-only">MATCHA GREEN, MATCHA STRAWBERRY y MATCHA BLACK</span>
        <div className="ticker-track" aria-hidden="true">
          <TickerSequence />
          <TickerSequence duplicate />
        </div>
      </aside>

      <div className="store-shell">
        <header className="store-header">
          <a href="#top" className="wordmark" aria-label="MATCHO, inicio">MATCHO</a>
          <span className="demo-chip">Tienda demostrativa</span>
        </header>

        <section className="hero" id="top" aria-label="MATCHO">
          <Image src="/matcho/hero.png" alt="Matcha frío servido con pistachos y hojas de té" fill priority sizes="(max-width: 760px) 100vw, 1200px" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-copy">
            <p>Preparado al momento</p>
            <h1>Un ritual frío, verde y fuera de lo común.</h1>
            <a href="#productos">Ver sabores</a>
          </div>
        </section>

        <section className="catalog" id="productos" aria-labelledby="catalog-title">
          <div className="catalog-heading">
            <h2 id="catalog-title">Elige tu MATCHO</h2>
            <p>Tres mezclas. Una pausa que se siente distinta.</p>
          </div>

          <div className="store-toolbar">
            <label className="search-field">
              <span className="sr-only">Buscar productos</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos…" />
            </label>
            <label className="sort-field">
              <span className="sr-only">Ordenar productos</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="featured">Destacados</option>
                <option value="price-asc">Precio: menor a mayor</option>
                <option value="price-desc">Precio: mayor a menor</option>
              </select>
            </label>
            <div className="category-tabs" aria-label="Filtrar por categoría">
              {(["ALL", "STRAWBERRY", "MATCHA"] as const).map((value) => (
                <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value)} type="button">
                  {value === "ALL" ? "Todos" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => {
              const quantity = quantities[product.id] ?? 0;
              const displayedPrice = product.id === "green" ? product.variants?.find((item) => item.id === variant)?.price ?? product.price : product.price;
              return (
                <article className="product-card" key={product.id}>
                  <div className="product-image-wrap">
                    <Image src={product.image} alt={product.name} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 380px" />
                    <div className="product-tags">
                      {product.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  </div>
                  <div className="product-copy">
                    <div>
                      <p className="product-category">{product.category}</p>
                      <h3>{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                    </div>
                    {product.variants && (
                      <label className="variant-field">
                        <span>Elige un tamaño</span>
                        <select value={variant} onChange={(event) => setVariant(event.target.value)}>
                          {product.variants.map((item) => <option key={item.id} value={item.id}>{item.name} — Bs {item.price}</option>)}
                        </select>
                      </label>
                    )}
                    <div className="product-actions">
                      <strong>Bs {displayedPrice}</strong>
                      <div className="stepper" aria-label={`Cantidad de ${product.name}`}>
                        <button type="button" onClick={() => updateQuantity(product.id, -1)} disabled={quantity === 0} aria-label={`Quitar ${product.name}`}>−</button>
                        <span aria-live="polite">{quantity}</span>
                        <button type="button" onClick={() => updateQuantity(product.id, 1)} aria-label={`Agregar ${product.name}`}>+</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleProducts.length === 0 && (
            <div className="empty-state">
              <h3>No encontramos ese MATCHO.</h3>
              <button type="button" onClick={() => { setQuery(""); setCategory("ALL"); }}>Ver todos</button>
            </div>
          )}
        </section>

        <section className="story" aria-labelledby="story-title">
          <div className="story-copy">
            <h2 id="story-title">Matcha sin ceremonia complicada.</h2>
            <p>Una carta corta, ingredientes reconocibles y bebidas hechas para disfrutarse frías. Este escaparate demuestra la apariencia que una plataforma de tiendas generadas puede producir.</p>
          </div>
          <div className="story-gallery">
            <Image src="/matcho/gallery-1.jpg" alt="Detalle de una bebida MATCHO" width={735} height={985} sizes="(max-width: 760px) 50vw, 590px" />
            <Image src="/matcho/gallery-2.png" alt="Composición editorial de MATCHO" width={1536} height={1024} sizes="(max-width: 760px) 50vw, 590px" />
          </div>
        </section>

        <footer>
          <p>Una demostración de la experiencia que una tienda generada puede ofrecer.</p>
          <a href="https://www.instagram.com/adrillesjorge/" target="_blank" rel="noreferrer">Ver MATCHO en Instagram</a>
        </footer>
      </div>

      <div className={`cart-dock ${cartCount ? "visible" : ""}`} aria-hidden={!cartCount}>
        <div>
          <span>{cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
          <strong>Bs {cartTotal}</strong>
        </div>
        <button type="button" onClick={() => setShowDemoNotice(true)}>Continuar</button>
      </div>

      {showDemoNotice && (
        <dialog
          ref={demoDialogRef}
          className="modal-backdrop"
          aria-labelledby="demo-title"
          onCancel={(event) => { event.preventDefault(); setShowDemoNotice(false); }}
        >
          <button className="modal-backdrop-dismiss" type="button" tabIndex={-1} aria-label="Cerrar demostración" onClick={() => setShowDemoNotice(false)} />
          <section className="demo-modal">
            <button className="modal-close" type="button" onClick={() => setShowDemoNotice(false)}>Cerrar</button>
            <h2 id="demo-title">Esta compra es una demostración.</h2>
            <p>La tienda ya puede mostrar productos, variantes y carrito. El cobro real se activa al conectar las credenciales de producción de la plataforma.</p>
            <button className="modal-primary" type="button" onClick={() => setShowDemoNotice(false)}>Seguir explorando</button>
          </section>
        </dialog>
      )}
    </main>
  );
}
