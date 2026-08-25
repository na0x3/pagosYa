"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import CardLoader from "@/components/ui/card-stack-loader";
import { CoverflowCarousel } from "@/components/ui/coverflow-carousel";
import DiagonalMarqueeCarousel from "@/components/ui/great-ui-diagonal-marquee-carousel";
import { Component as InteractiveVideoPortfolioScroller } from "@/components/ui/interactive-video-portfolio-scroller";
import BentoDashboard from "@/components/ui/bento-dashboard";
import FlowArt, { FlowSection } from "@/components/ui/story-scroll";
import { HeroCarousel, type HeroCarouselItem } from "@/components/ui/hero-carousel";
import ImageStreamHero from "@/components/ui/image-stream-hero";
import ScrollExpandMedia from "@/components/ui/scroll-expansion-hero";
import { StaggerTestimonials } from "@/components/ui/stagger-testimonials";
import { BentoCell, BentoGrid, ContainerScale, ContainerScroll } from "@/components/ui/hero-gallery-scroll-animation";
import { ZoomParallax } from "@/components/ui/zoom-parallax";

const WorkPageHero = dynamic(() => import("@/components/ui/work-page-hero").then((module) => module.WorkPageHero), { ssr: false });
const HeroScrollVideoReveal = dynamic(() => import("@/components/ui/hero-scroll-video-pin-reveal").then((module) => module.HeroScrollVideoReveal), { ssr: false });
const ClarityMarquee = dynamic(() => import("@/components/ui/vercep-feature-1").then((module) => module.Component), { ssr: false });
const FullScreenScrollFX = dynamic(() => import("@/components/ui/full-screen-scroll-fx").then((module) => module.FullScreenScrollFX), { ssr: false });
const CursorFloatingTarget = dynamic(() => import("@/components/ui/motion-cursor-floating-target"), { ssr: false });
const FrameSequenceHero = dynamic(() => import("@/components/ui/mac-book-neo-hero").then((module) => module.FrameSequenceHero), { ssr: false });
const InfiniteGallery = dynamic(() => import("@/components/ui/3d-gallery-photography"), { ssr: false });

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

const experienceSlides = [
  { src: "/matcho/matcha-green.jpg", alt: "MATCHO Green", title: "Green", subtitle: "El ritual original" },
  { src: "/matcho/matcha-strawberry.jpg", alt: "MATCHO Strawberry", title: "Strawberry", subtitle: "Fruta y matcha frío" },
  { src: "/matcho/matcha-black.jpg", alt: "MATCHO Black", title: "Black", subtitle: "Una mezcla intensa" },
  { src: "/matcho/gallery-1.jpg", alt: "Detalle de preparación MATCHO", title: "Preparado al momento", subtitle: "Cada vaso empieza aquí" },
  { src: "/matcho/gallery-2.png", alt: "Composición editorial MATCHO", title: "Universo MATCHO", subtitle: "Color, textura y pausa" },
];

const parallaxImages = [
  { src: "/matcho/hero.png", alt: "Matcha frío con pistacho" },
  { src: "/matcho/matcha-green.jpg", alt: "MATCHO Green" },
  { src: "/matcho/matcha-strawberry.jpg", alt: "MATCHO Strawberry" },
  { src: "/matcho/matcha-black.jpg", alt: "MATCHO Black" },
  { src: "/matcho/gallery-1.jpg", alt: "Preparación de una bebida MATCHO" },
  { src: "/matcho/gallery-2.png", alt: "Composición editorial MATCHO" },
  { src: "/matcho/background.png", alt: "Textura visual de la marca MATCHO" },
];

type AnimationStyle =
  | "coverflow-carousel"
  | "hero-carousel"
  | "image-stream"
  | "scroll-expansion"
  | "hero-gallery-scroll"
  | "stagger-testimonials"
  | "story-scroll"
  | "zoom-parallax"
  | "video-pill"
  | "portfolio-scroller"
  | "circle-reveal"
  | "clarity-marquee"
  | "full-screen-chapters"
  | "magnetic-target"
  | "frame-sequence"
  | "3d-gallery";

const animationOptions: Array<{ value: AnimationStyle; label: string; description: string }> = [
  { value: "coverflow-carousel", label: "Carrusel en profundidad", description: "Recorre productos como portadas superpuestas." },
  { value: "hero-carousel", label: "Portada editorial", description: "Una imagen protagonista cambia por capítulos." },
  { value: "video-pill", label: "Video que se abre", description: "Una ventana de video crece hasta ocupar la escena." },
  { value: "circle-reveal", label: "Revelado circular", description: "El video nace en el centro y descubre la historia." },
  { value: "portfolio-scroller", label: "Menú de momentos", description: "Cada tramo del scroll activa un video y su relato." },
  { value: "full-screen-chapters", label: "Capítulos a pantalla completa", description: "Palabras e imágenes avanzan como una secuencia dirigida." },
  { value: "frame-sequence", label: "Secuencia por fotogramas", description: "El desplazamiento controla cada paso de preparación." },
  { value: "3d-gallery", label: "Galería tridimensional", description: "Las fotos atraviesan el espacio con rueda, teclado o gesto." },
  { value: "magnetic-target", label: "Llamado magnético", description: "Una invitación responde al cursor sin mover el contenido." },
  { value: "clarity-marquee", label: "Preguntas en movimiento", description: "Las dudas frecuentes forman un ritmo editorial continuo." },
  { value: "image-stream", label: "Corriente de imágenes", description: "La fotografía rodea un mensaje central." },
  { value: "scroll-expansion", label: "Expansión de imagen", description: "Una foto se abre a medida que la persona avanza." },
  { value: "hero-gallery-scroll", label: "Galería recompuesta", description: "Cinco piezas se ordenan en una sola composición." },
  { value: "stagger-testimonials", label: "Reseñas escalonadas", description: "Testimonios breves aparecen con jerarquía legible." },
  { value: "story-scroll", label: "Historia por escenas", description: "Tres capítulos conectan origen, mezcla y momento." },
  { value: "zoom-parallax", label: "Profundidad fotográfica", description: "La galería usa escala para marcar distancia." },
];

const fullScreenSections = experienceSlides.slice(0, 4).map((slide) => ({
  id: slide.title,
  leftLabel: slide.title,
  title: slide.subtitle,
  rightLabel: slide.title,
  background: slide.src,
}));

const sequenceFrames = Array.from({ length: 35 }, (_, index) => parallaxImages[Math.floor(index / 5) % parallaxImages.length].src);
const matchoFramePath = (index: number) => sequenceFrames[(index - 1 + sequenceFrames.length) % sequenceFrames.length];
const sequenceSteps = [
  { from: 0.04, to: 0.28, color: "#ad8a49", num: "01", total: "04", title: "La hoja.", description: "El origen se presenta antes de hablar de sabores o variantes.", label: "Origen" },
  { from: 0.28, to: 0.53, color: "#d9828b", num: "02", total: "04", title: "La mezcla.", description: "Fresa, hielo y matcha se conectan en una secuencia corta y directa.", label: "Mezcla" },
  { from: 0.53, to: 0.78, color: "#7ca484", num: "03", total: "04", title: "La textura.", description: "La imagen cambia al mismo ritmo que la explicación del producto.", label: "Detalle" },
  { from: 0.78, to: 1.01, color: "#f3eee5", num: "04", total: "04", title: "Tu pausa.", description: "El recorrido termina con una decisión clara y un producto reconocible.", label: "Momento" },
];

const heroItems: HeroCarouselItem[] = experienceSlides.map((slide, index) => ({
  id: slide.title,
  title: slide.title,
  image: slide.src,
  credit: "MATCHO",
  meta: [slide.subtitle],
  accent: ["#183524", "#a34853", "#171717", "#ad8a49", "#274c43"][index],
}));

const testimonialItems = experienceSlides.slice(0, 4).map((slide, index) => ({
  id: slide.title,
  testimonial: ["Fresco, claro y hecho al momento.", "Una mezcla distinta que sí volvería a pedir.", "La carta se entiende en segundos.", "Mi nueva pausa favorita."][index],
  by: ["Ana, cliente frecuente", "María, La Paz", "Diego, cliente", "Sofía, cliente"][index],
  imgSrc: slide.src,
}));

export default function Home() {
  const [entering, setEntering] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | Product["category"]>("ALL");
  const [sort, setSort] = useState("featured");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [variant, setVariant] = useState("small");
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const [animationStyles, setAnimationStyles] = useState<AnimationStyle[]>(["coverflow-carousel"]);
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
    <main id="main-content">
      <a className="skip-link" href="#top">Saltar al contenido</a>
      <div className={`entry-loader ${entering ? "" : "is-leaving"}`} role="status" aria-label="Cargando MATCHO">
        <CardLoader />
      </div>

      <nav className="flavor-rail" aria-label="Sabores MATCHO">
        <a href="#productos">MATCHA GREEN</a>
        <a href="#productos">MATCHA STRAWBERRY</a>
        <a href="#productos">MATCHA BLACK</a>
      </nav>

      <div className="store-shell">
        <header className="store-header">
          <a href="#top" className="wordmark" aria-label="MATCHO, inicio">MATCHO</a>
          <span className="demo-chip">Tienda demostrativa</span>
        </header>

        <section className="hero" id="top" aria-label="MATCHO">
          <Image src="/matcho/hero.png" alt="Matcha frío servido con pistachos y hojas de té" fill priority sizes="(max-width: 760px) 100vw, 1200px" />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-copy">
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
                  </div>
                  <div className="product-copy">
                    <div>
                      <p className="product-category">{product.category}</p>
                      <h3>{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                      <div className="product-tags" aria-label="Características">
                        {product.tags.map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    </div>
                    {product.variants && (
                      <label className="variant-field">
                        <span>Elige un tamaño</span>
                        <select value={variant} onChange={(event) => setVariant(event.target.value)}>
                          {product.variants.map((item) => <option key={item.id} value={item.id}>{item.name} - Bs {item.price}</option>)}
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

        <section className="coverflow-story" aria-labelledby="coverflow-title">
          <div className="experience-heading">
            <h2 id="coverflow-title">La historia sigue más allá del catálogo.</h2>
          </div>
          <CoverflowCarousel slides={experienceSlides} showCaption showNavigation showPagination cardWidth="clamp(180px, 27vw, 330px)" />
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

        <section className="motion-duo-intro" aria-labelledby="motion-duo-title">
          <span>Movimientos combinables · una misma historia</span>
          <h2 id="motion-duo-title">De la hoja al vaso, sin cortar el ritmo.</h2>
          <p>La IA convierte las fotos y palabras reales de cada comercio en capítulos editables. Aquí el relato gira al avanzar y luego se abre en profundidad.</p>
        </section>
      </div>

      <section className="animation-builder" aria-labelledby="animation-builder-title">
        <div className="animation-builder-copy">
          <h2 id="animation-builder-title">Elige una o varias formas de mover la historia.</h2>
          <p>Combina las opciones con las mismas fotos y textos reales. Cada vista explica qué cambia; las experiencias pesadas se cargan solamente cuando las eliges.</p>
          <div className="animation-selection-summary" aria-live="polite">
            <strong>{animationStyles.length}</strong>
            <span>{animationStyles.length === 1 ? "experiencia activa" : "experiencias activas"}</span>
          </div>
        </div>
        <div className="animation-option-list" role="group" aria-label="Animación de muestra">
          {animationOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={animationStyles.includes(option.value)}
              onClick={() => setAnimationStyles((current) => current.includes(option.value)
                ? current.length === 1 ? current : current.filter((value) => value !== option.value)
                : [...current, option.value])}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      {animationStyles.includes("story-scroll") ? (
        <FlowArt className="matcho-flow" aria-label="El ritual MATCHO en tres capítulos">
          <FlowSection aria-label="Origen" className="bg-[#ad8a49] text-[#0b2116]"><div className="matcho-flow-grid"><div><h2>Verde<br />desde<br />el inicio.</h2><p>Matcha reconocible, una carta breve y una preparación que deja hablar al ingrediente.</p></div><img src="/matcho/matcha-green.jpg" alt="MATCHO Green servido frío" /></div></FlowSection>
          <FlowSection aria-label="Mezcla" className="bg-[#0b2116] text-[#fffdf6]"><div className="matcho-flow-grid"><div><h2>Fruta,<br />hielo,<br />pausa.</h2><p>Fresa para lo brillante, black para lo intenso.</p></div><img src="/matcho/matcha-strawberry.jpg" alt="MATCHO Strawberry" /></div></FlowSection>
          <FlowSection aria-label="Momento" className="bg-[#f3eee5] text-[#0b2116]"><div className="matcho-flow-grid"><div><h2>Hecho<br />para<br />tu ritmo.</h2><p>Un ritual cotidiano, frío y directo.</p></div><img src="/matcho/gallery-1.jpg" alt="Detalle del ritual MATCHO" /></div></FlowSection>
        </FlowArt>
      ) : null}
      {animationStyles.includes("coverflow-carousel") ? <section className="animation-stage"><CoverflowCarousel slides={experienceSlides} showCaption showNavigation showPagination cardWidth="clamp(190px, 28vw, 350px)" /></section> : null}
      {animationStyles.includes("hero-carousel") ? <section className="animation-stage full-bleed"><HeroCarousel items={heroItems} defaultIndex={1} brand="MATCHO" className="h-[720px]" /></section> : null}
      {animationStyles.includes("video-pill") ? <WorkPageHero /> : null}
      {animationStyles.includes("circle-reveal") ? <HeroScrollVideoReveal /> : null}
      {animationStyles.includes("portfolio-scroller") ? <InteractiveVideoPortfolioScroller className="my-0" /> : null}
      {animationStyles.includes("clarity-marquee") ? <ClarityMarquee /> : null}
      {animationStyles.includes("full-screen-chapters") ? (
        <FullScreenScrollFX
          sections={fullScreenSections}
          header={<><span className="block">El ritual</span><span className="block">MATCHO</span></>}
          footer={<p className="m-0 text-xs font-bold tracking-[0.16em] uppercase">Desplázate para cambiar de capítulo</p>}
        />
      ) : null}
      {animationStyles.includes("magnetic-target") ? <CursorFloatingTarget /> : null}
      {animationStyles.includes("frame-sequence") ? (
        <FrameSequenceHero
          frameCount={sequenceFrames.length}
          framePath={matchoFramePath}
          eagerCount={10}
          scrollHeight="480vh"
          brand={<><span className="size-3 rounded-full bg-[#ad8a49]" /> MATCHO</>}
          navLinks={[{ label: "Origen", href: "#top" }, { label: "Sabores", href: "#productos" }]}
          ctaLabel="Ver carta"
          title={<>MATCHO<br />en secuencia.</>}
          subtitle="Desplázate para preparar la historia"
          steps={sequenceSteps}
        />
      ) : null}
      {animationStyles.includes("3d-gallery") ? (
        <section className="relative h-screen min-h-[620px] overflow-hidden bg-[#0b2116] text-white">
          <InfiniteGallery images={parallaxImages} speed={1.1} zSpacing={3} visibleCount={10} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-5 text-center mix-blend-difference">
            <h2 className="max-w-[13ch] font-serif text-[clamp(2.5rem,7vw,6rem)] leading-[0.95] tracking-[-0.04em]"><em>La imagen se acerca;</em><br />el producto se entiende.</h2>
          </div>
          <p className="pointer-events-none absolute inset-x-4 bottom-7 text-center text-xs font-bold tracking-[0.14em] uppercase">Rueda, flechas o gesto · el movimiento vuelve solo después de 3 segundos</p>
        </section>
      ) : null}
      {animationStyles.includes("image-stream") ? <ImageStreamHero images={parallaxImages} className="h-[680px] w-full bg-[#e5dfd4]"><div className="relative z-10 grid h-full place-items-center px-6 text-center"><h2 className="max-w-[10ch] text-5xl font-semibold tracking-tight text-[#0b2116] sm:text-7xl">La marca sigue en movimiento.</h2></div></ImageStreamHero> : null}
      {animationStyles.includes("scroll-expansion") ? <ScrollExpandMedia mediaType="image" mediaSrc="/matcho/hero.png" bgImageSrc="/matcho/background.png" title="El ritual MATCHO" date="Hecho al momento" scrollToExpand="Desplázate para abrir la imagen" textBlend /> : null}
      {animationStyles.includes("stagger-testimonials") ? <section className="animation-stage"><StaggerTestimonials testimonials={testimonialItems} /></section> : null}
      {animationStyles.includes("hero-gallery-scroll") ? (
        <ContainerScroll className="h-[280svh] bg-[#e5dfd4]">
          <BentoGrid className="sticky left-0 top-0 h-svh w-full p-4">{parallaxImages.slice(0, 5).map((image) => <BentoCell key={image.src} className="overflow-hidden rounded-xl shadow-xl"><img src={image.src} alt={image.alt} className="size-full object-cover" /></BentoCell>)}</BentoGrid>
          <ContainerScale className="z-10 text-center text-[#0b2116]"><h2 className="max-w-xl text-5xl font-bold tracking-tighter">La galería se abre contigo.</h2><p className="mx-auto mt-5 max-w-md">Cinco imágenes reales se recomponen sin bloquear el desplazamiento.</p></ContainerScale>
        </ContainerScroll>
      ) : null}
      {animationStyles.includes("zoom-parallax") ? <ZoomParallax images={parallaxImages} /> : null}

      <div className="store-shell store-shell-after-motion">

        <section className="moving-gallery" aria-label="Galería MATCHO en movimiento">
          <div className="moving-gallery-copy"><h2>Sabores que se mueven contigo.</h2></div>
          <DiagonalMarqueeCarousel className="h-[720px]" cardClassName="h-[220px] w-[310px]" />
        </section>

        <section className="showcase-finances" aria-labelledby="showcase-finances-title">
          <div className="experience-heading"><h2 id="showcase-finances-title">Una lectura clara del negocio.</h2></div>
          <BentoDashboard />
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
