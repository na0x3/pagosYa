import { Store, assetUrl, type StoreAnimation } from "../api";
import { storeEditorMode } from "../preview-mode";
import { discountedProductAmount, salePriceHtml } from "../cart/cart";
import { escapeHtml, initials } from "../ui/html";
import { ICON_ARROW_LEFT, ICON_ARROW_RIGHT } from "../ui/icons";
import { isVideoMediaUrl } from "../ui/media";
import { productPageUrl } from "./routes";
import { productImagePosition } from "./catalog";
import { STORE_MOTION_EXPERIENCES, storeAnimationMediaRequirement } from "./motion";
import type { FidelityImageHtml } from "./store-fidelity-media";

const technicalAnimationTerms = STORE_MOTION_EXPERIENCES.map((type) => type.toLowerCase());
const generatedAnimationDescriptions = new Set([
  "Conoce la selección y encuentra lo que buscas.",
  "Una experiencia visual creada con las imágenes reales de la marca.",
  "Capítulos visuales de la marca.",
  "Una selección visual para explorar.",
  "Escenas elegidas de la tienda.",
  "Imágenes de la marca en movimiento.",
  "Una escena que se abre mientras avanzas.",
  "Una composición creada con imágenes de la tienda.",
  "Experiencias compartidas por quienes ya nos eligieron.",
  "Una mirada en profundidad a la marca.",
  "Una historia visual que crece hasta ocupar la pantalla.",
  "Recorre cada escena y descubre su historia.",
  "Una imagen que revela poco a poco el universo de la marca.",
  "Ideas clave que mantienen el ritmo de la historia.",
  "Escenas completas que avanzan con el recorrido.",
  "Una invitación viva para continuar hacia la colección.",
  "Cada movimiento descubre un nuevo momento.",
  "Explora las imágenes con rueda, teclado o gesto.",
]);
const technicalAnimationTitles = new Set([
  "story scroll", "hero editorial", "image stream", "scroll expansion", "hero gallery",
  "reseñas", "menú de momentos", "revelado circular", "preguntas en movimiento", "texto en capas",
  "texto mecanografiado", "texto revelado", "revelado por bloques", "texto en recorrido",
  "capítulos a pantalla completa", "capítulos completos", "llamado magnético", "secuencia por fotogramas",
  "secuencia de cuadros", "galería tridimensional", "video de fondo",
  "tarjetas arrastrables", "carrusel con perspectiva", "vista previa de enlace", "video revelado",
  "galería acordeón", "relato dividido", "galería fija", "historia fija", "texto en paralaje",
]);
export const renderedCopyKey = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export type StoreMotionSectionContext = {
  slug: string;
  store: Store;
  fidelityImageHtml: FidelityImageHtml;
  catalogTitleKey: string;
  catalogBodyKey: string;
};

/** One saved animation as its [section key, section html] entry; html is empty when the animation can't render. */
export function storeMotionSectionEntry(animation: StoreAnimation, { slug, store, fidelityImageHtml, catalogTitleKey, catalogBodyKey }: StoreMotionSectionContext) {
  const rawDescription = animation.subtitle?.trim() || "";
  const publicDescription = generatedAnimationDescriptions.has(rawDescription)
    || technicalAnimationTerms.some((term) => rawDescription.toLowerCase().includes(term))
    || (!!catalogBodyKey && renderedCopyKey(rawDescription) === catalogBodyKey)
    ? ""
    : rawDescription;
  const accessibleLabel = animation.name?.trim() || "Animación visual";
  const selectedProduct = animation.productId
    ? store.items.find((item) => item.id === animation.productId)
    : undefined;
  const configuredMotionImages = (animation.media ?? [])
    .map((image) => ({
      mediaUrl: assetUrl(image.imageUrl),
      sourceUrl: image.imageUrl,
      title: image.title?.trim() || "",
      caption: image.caption?.trim() || "",
      body: image.body?.trim() || "",
      textPositionX: image.textPositionX,
      textPositionY: image.textPositionY,
      textScale: image.textScale,
      textWidthPercent: image.textWidthPercent,
      textAlign: image.textAlign,
	        textColor: image.textColor,
	        fontStyle: image.fontStyle,
      productId: image.productId,
    }))
    .filter((image): image is typeof image & { mediaUrl: string } => !!image.mediaUrl)
    .slice(0, 8);
  const productSourceUrl = selectedProduct?.imageUrls?.[0] || "";
  const productMediaUrl = assetUrl(productSourceUrl);
  const productMotionImage = selectedProduct && productMediaUrl
    ? {
        mediaUrl: productMediaUrl,
        sourceUrl: productSourceUrl,
        title: selectedProduct.name,
        caption: selectedProduct.tags?.[0] || "Producto destacado",
        body: selectedProduct.description || publicDescription,
        textPositionX: undefined,
        textPositionY: undefined,
        textScale: undefined,
        textWidthPercent: undefined,
        textAlign: undefined,
        textColor: undefined,
        fontStyle: undefined,
        productId: selectedProduct.id,
      }
    : null;
  const mediaLimit = animation.type === "clarity-marquee"
    ? 0
    : ["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(animation.type) ? 1 : 8;
  const fallbackProductMotionImage = !["video-background", "video-pin-reveal"].includes(animation.type) && configuredMotionImages.length === 0 ? productMotionImage : null;
  const motionImages = [
    ...(fallbackProductMotionImage ? [fallbackProductMotionImage] : []),
    ...configuredMotionImages,
  ].slice(0, mediaLimit);
  const motionStories = motionImages.map((image) => ({ ...image, isVideo: isVideoMediaUrl(image.mediaUrl) }));
  const motionMediaLabel = (image: (typeof motionImages)[number], index: number) => image.title || image.caption || `Imagen ${index + 1}`;
  const motionAutoplay = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : " autoplay";
  const motionProductFor = (image: (typeof motionImages)[number]) => image.productId
    ? store.items.find((item) => item.id === image.productId)
    : undefined;
  const motionMediaHtml = (image: (typeof motionImages)[number], index: number, { controls = false, decorative = false, allowProductLink = true } = {}) => {
    const media = isVideoMediaUrl(image.mediaUrl)
      ? `<video class="store-motion-video" src="${escapeHtml(image.mediaUrl)}"${decorative ? " aria-hidden=\"true\"" : ` aria-label="${escapeHtml(motionMediaLabel(image, index))}"`} muted loop playsinline preload="metadata"${motionAutoplay}${controls ? " controls" : ""}></video>`
      : fidelityImageHtml(image.mediaUrl, image.sourceUrl, decorative ? "" : image.caption);
    const product = !isVideoMediaUrl(image.mediaUrl) && !decorative && allowProductLink ? motionProductFor(image) : undefined;
    if (!product || storeEditorMode) return media;
    return `<a class="store-animation-media-product-link product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" aria-label="Ver ${escapeHtml(product.name)}">${media}<span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`;
  };
  const motionProductActionHtml = (image: (typeof motionImages)[number]) => {
    const product = motionProductFor(image);
    return product && !storeEditorMode
      ? `<a class="store-animation-scene-cta product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</a>`
      : "";
  };
  const motionHeadingHtml = (value: string, attributes = "") => value ? `<h3 data-animation-copy-field="title"${attributes}>${escapeHtml(value)}</h3>` : "";
  const motionParagraphHtml = (value: string, attributes = "") => value ? `<p data-animation-copy-field="body"${attributes}>${escapeHtml(value)}</p>` : "";
  const motionCaptionHtml = (value: string) => value ? `<span data-animation-copy-field="caption">${escapeHtml(value)}</span>` : "";
  const motionSceneDataAttributes = (image: (typeof motionImages)[number], index: number) => {
    const hasLayout = Number.isInteger(image.textPositionX)
      || Number.isInteger(image.textPositionY)
      || Number.isInteger(image.textScale)
      || Number.isInteger(image.textWidthPercent)
      || !!image.textAlign
      || !!image.textColor;
    const sceneScale = Number.isInteger(image.textScale) ? image.textScale! : 100;
    return ` data-animation-media-index="${index}"${hasLayout ? " data-animation-copy-custom-layout" : ""}`
      + ` data-animation-text-x="${Number.isInteger(image.textPositionX) ? image.textPositionX : 18}"`
      + ` data-animation-text-y="${Number.isInteger(image.textPositionY) ? image.textPositionY : 76}"`
      + ` data-animation-text-scale="${sceneScale}"`
      + ` data-animation-text-width-percent="${Number.isInteger(image.textWidthPercent) ? image.textWidthPercent : 62}"`
      + ` data-animation-text-align="${image.textAlign || "left"}"`
	        + `${image.textColor ? ` data-animation-text-color="${image.textColor}"` : ""}`
	        + `${image.fontStyle ? ` data-animation-font-style="${image.fontStyle}"` : ""}`;
  };
  const motionCopyAttributes = (image: (typeof motionImages)[number], index: number) => `data-animation-copy${motionSceneDataAttributes(image, index)}`;
  const motionFigureCaptionHtml = (image: (typeof motionImages)[number], index: number) => {
    const hasCopy = !!(image.title || image.caption || image.body);
    return `<figcaption ${motionCopyAttributes(image, index)}${hasCopy ? "" : " hidden"}><strong data-animation-copy-field="title"${image.title ? "" : " hidden"}>${escapeHtml(image.title)}</strong><span data-animation-copy-field="caption"${image.caption ? "" : " hidden"}>${escapeHtml(image.caption)}</span><p data-animation-copy-field="body"${image.body ? "" : " hidden"}>${escapeHtml(image.body)}</p></figcaption>`;
  };
  const hasCustomTextLayout = Number.isInteger(animation.textPositionX)
    || Number.isInteger(animation.textPositionY)
    || Number.isInteger(animation.textScale)
    || Number.isInteger(animation.textWidthPercent)
    || !!animation.textAlign
    || !!animation.textSize
    || !!animation.textWidth;
  const textPositionX = Number.isInteger(animation.textPositionX) ? animation.textPositionX! : 18;
  const textPositionY = Number.isInteger(animation.textPositionY) ? animation.textPositionY! : 76;
  const textAlign = animation.textAlign || "left";
  const textSize = animation.textSize || "medium";
  const textWidth = animation.textWidth || "medium";
  const textScale = Number.isInteger(animation.textScale)
    ? animation.textScale!
    : ({ small: 80, medium: 100, large: 135 } as const)[textSize];
  const textWidthPercent = Number.isInteger(animation.textWidthPercent)
    ? animation.textWidthPercent!
    : ({ narrow: 42, medium: 62, wide: 86 } as const)[textWidth];
  const scale = textScale / 100;
	    const animationStyle = [
    `--animation-text-x:${textPositionX}%`,
    `--animation-text-y:${textPositionY}%`,
    `--animation-copy-width:${textWidthPercent}%`,
    `--animation-heading-size:clamp(${Math.round(40 * scale)}px,${(6.5 * scale).toFixed(2)}vw,${Math.round(88 * scale)}px)`,
    `--animation-card-copy-size:clamp(${Math.round(20 * scale)}px,${(2.6 * scale).toFixed(2)}vw,${Math.round(26 * scale)}px)`,
    `--animation-body-size:clamp(${Math.round(15 * scale)}px,${(1.7 * scale).toFixed(2)}vw,${Math.round(20 * scale)}px)`,
    ...(animation.textColor ? [`--animation-text-color:${animation.textColor}`] : []),
	      ...(animation.backgroundColor ? [`--animation-background:${animation.backgroundColor}`] : []),
	    ].join(";");
	    const animationAttributes = `${hasCustomTextLayout ? " data-animation-custom-layout" : ""} data-animation-text-x="${textPositionX}" data-animation-text-y="${textPositionY}" data-animation-text-align="${textAlign}" data-animation-text-size="${textSize}" data-animation-text-width="${textWidth}" data-animation-text-scale="${textScale}" data-animation-text-width-percent="${textWidthPercent}" data-animation-text-color="${animation.textColor || "#171717"}" data-animation-background="${animation.backgroundColor || "#ffffff"}"${animation.fontStyle ? ` data-animation-font-style="${animation.fontStyle}"` : ""}${animation.textColor ? " data-animation-has-text-color" : ""}${animation.backgroundColor ? " data-animation-has-background" : ""} style="${animationStyle}"`;
	    const sectionKey = `animation-${animation.id}`;
	    const extraTextHtml = (animation.textBlocks ?? []).map((block) => {
	      const blockScale = Number.isInteger(block.textScale) ? block.textScale! : block.role === "title" ? 100 : 82;
	      const blockX = Number.isInteger(block.textPositionX) ? block.textPositionX! : 18;
	      const blockY = Number.isInteger(block.textPositionY) ? block.textPositionY! : block.role === "title" ? 30 : 48;
	      const blockWidth = Number.isInteger(block.textWidthPercent) ? block.textWidthPercent! : 62;
	      const blockAlign = block.textAlign || "left";
	      const blockColor = block.textColor || animation.textColor || "#ffffff";
	      const tag = block.role === "title" ? "h3" : "p";
	      const blockRatio = blockScale / 100;
	      return `<div class="store-animation-free-text" data-animation-copy data-animation-copy-custom-layout data-animation-text-block="${escapeHtml(block.id)}" data-animation-text-x="${blockX}" data-animation-text-y="${blockY}" data-animation-text-scale="${blockScale}" data-animation-text-width-percent="${blockWidth}" data-animation-text-align="${blockAlign}" data-animation-text-color="${blockColor}"${block.fontStyle ? ` data-animation-font-style="${block.fontStyle}"` : ""} style="--animation-text-x:${blockX}%;--animation-text-y:${blockY}%;--animation-copy-width:${blockWidth}%;--animation-copy-align:${blockAlign};--animation-copy-translate:${blockAlign === "right" ? "-100%" : blockAlign === "center" ? "-50%" : "0"} -50%;--animation-scene-text-color:${blockColor};--animation-heading-size:clamp(${Math.round(40 * blockRatio)}px,${(6.5 * blockRatio).toFixed(2)}vw,${Math.round(88 * blockRatio)}px);--animation-body-size:clamp(${Math.round(15 * blockRatio)}px,${(1.7 * blockRatio).toFixed(2)}vw,${Math.round(20 * blockRatio)}px)"><${tag} data-animation-copy-field="textBlock">${escapeHtml(block.text)}</${tag}></div>`;
	    }).join("");
  const hasMotionImages = (minimum: number) => motionImages.length >= minimum;
  const hasMotionStories = (minimum: number) => motionStories.length >= minimum;
  const textAnimationTypes = ["clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"];
  const isTextAnimation = animation.type !== "clarity-marquee" && textAnimationTypes.includes(animation.type);
  const textPhrases = [...new Set([
    animation.title?.includes("|") ? null : animation.title,
    ...(animation.title?.split("|") ?? []),
    animation.subtitle,
    selectedProduct?.name,
    ...(selectedProduct?.tags ?? []),
    ...store.items.slice(0, 6).map((item) => item.name),
    store.storeName,
  ].map((phrase) => phrase?.trim()).filter((phrase): phrase is string => !!phrase))].slice(0, 8);
  const primaryText = animation.title?.split("|")[0]?.trim() || textPhrases[0] || store.storeName;
  const secondaryText = animation.subtitle?.trim() || textPhrases[1] || store.storeName;
  let blockHtml = "";
  if (animation.type === "video-background") {
    const scene = motionStories[0];
    if (scene?.isVideo) {
      const overlayTitle = animation.title?.trim() || scene.title;
      const overlayBody = animation.subtitle?.trim() || scene.body || scene.caption;
      const overlay = overlayTitle || overlayBody
        ? `<div class="store-video-background-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(overlayTitle)}${motionParagraphHtml(overlayBody)}</div>`
        : "";
      blockHtml = `<div class="store-video-background" aria-label="${escapeHtml(accessibleLabel)}"><video class="store-motion-video" src="${escapeHtml(scene.mediaUrl)}" aria-label="${escapeHtml(motionMediaLabel(scene, 0))}" muted loop playsinline preload="metadata"${motionAutoplay}></video><span class="store-video-background-shade" aria-hidden="true"></span>${overlay}</div>`;
    } else if (storeEditorMode) {
      blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status"><span class="store-animation-incomplete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v14H4zM10 9l5 3-5 3z"/></svg></span><div><strong>Agrega un video</strong><p>Sube un archivo MP4 o WebM para usarlo como fondo.</p><small>Se reproducirá sin sonido, en bucle y respetará la preferencia de movimiento reducido.</small></div></div>`;
    }
  } else if (animation.type === "video-pin-reveal") {
    const scene = motionStories[0];
    if (scene?.isVideo) {
      const copy = scene.title || scene.body || animation.title || animation.subtitle
        ? `<div class="store-video-pin-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(animation.title?.trim() || scene.title)}${motionParagraphHtml(animation.subtitle?.trim() || scene.body || scene.caption)}</div>`
        : "";
      blockHtml = `<div class="store-video-pin" data-video-pin-reveal style="--video-pin-progress:0" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-video-pin-sticky"><div class="store-video-pin-media">${motionMediaHtml(scene, 0)}</div>${copy}</div></div>`;
    } else if (storeEditorMode) {
      blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status"><div><strong>Agrega un video</strong><p>Sube un MP4 o WebM para crear el revelado al desplazarse.</p></div></div>`;
    }
  } else if (animation.type === "draggable-cards" && hasMotionImages(2)) {
    blockHtml = `<div class="store-draggable-cards" data-draggable-cards aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => `<figure data-draggable-card="${index}" tabindex="0" style="--card-index:${index};--card-rotate:${((index % 5) - 2) * 2}deg">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div>`;
  } else if (animation.type === "perspective-carousel" && hasMotionImages(2)) {
    blockHtml = `<div class="store-perspective-carousel" data-perspective-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-perspective-stage">${motionImages.map((image, index) => `<figure data-perspective-slide="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div><div class="store-experience-controls"><button type="button" data-perspective-step="-1" aria-label="Ver escena anterior">${ICON_ARROW_LEFT}</button><span data-perspective-status aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-perspective-step="1" aria-label="Ver escena siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
  } else if (animation.type === "link-preview" && motionImages.length >= 1) {
    const scene = motionImages[0];
    const previewProduct = motionProductFor(scene) || selectedProduct;
    const previewHref = previewProduct ? productPageUrl(slug, previewProduct.id) : "#store-grid";
    blockHtml = `<div class="store-link-preview" data-link-preview><div class="store-link-preview-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(scene.title || animation.title || store.storeName)}${motionParagraphHtml(scene.body || scene.caption || animation.subtitle || "Descubre la colección.")}<a href="${escapeHtml(previewHref)}" data-link-preview-trigger aria-describedby="store-link-preview-${escapeHtml(animation.id)}">Explorar ${ICON_ARROW_RIGHT}</a></div><figure id="store-link-preview-${escapeHtml(animation.id)}" role="tooltip">${motionMediaHtml(scene, 0)}</figure></div>`;
  } else if (animation.type === "gallery-accordion" && hasMotionImages(3)) {
    blockHtml = `<div class="store-gallery-accordion" data-gallery-accordion aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => {
      const product = motionProductFor(image);
      const action = product && !storeEditorMode
        ? `<a class="store-gallery-accordion-action product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" aria-label="Ver ${escapeHtml(product.name)}"><span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`
        : `<button type="button" aria-label="Ampliar ${escapeHtml(motionMediaLabel(image, index))}" data-gallery-accordion-open="${index}"></button>`;
      return `<figure data-gallery-accordion-item="${index}" class="${index === 0 ? "active" : ""}">${motionMediaHtml(image, index, { allowProductLink: false })}${action}${motionFigureCaptionHtml(image, index)}</figure>`;
    }).join("")}<div class="store-gallery-modal" data-gallery-modal hidden role="dialog" aria-modal="true" aria-label="Imagen ampliada"><button type="button" data-gallery-modal-close aria-label="Cerrar imagen">×</button><div data-gallery-modal-content></div></div></div>`;
  } else if (animation.type === "split-scroll" && hasMotionStories(3)) {
    blockHtml = `<div class="store-split-scroll" data-split-scroll aria-label="${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<article data-split-scroll-item="${index}"><figure>${motionMediaHtml(scene, index)}</figure><div ${motionCopyAttributes(scene, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body || scene.caption)}</div></article>`).join("")}</div>`;
  } else if (animation.type === "sticky-gallery" && hasMotionImages(3)) {
    blockHtml = `<div class="store-sticky-gallery" data-sticky-gallery aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => `<figure style="--sticky-gallery-index:${index}">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div>`;
  } else if (animation.type === "sticky-story" && hasMotionStories(2)) {
    blockHtml = `<div class="store-sticky-story" data-sticky-story aria-label="${escapeHtml(accessibleLabel)}"><div class="store-sticky-story-media">${motionStories.map((scene, index) => `<figure data-sticky-story-media="${index}" class="${index === 0 ? "active" : ""}">${motionMediaHtml(scene, index)}</figure>`).join("")}</div><div class="store-sticky-story-copy">${motionStories.map((scene, index) => `<article data-sticky-story-item="${index}" ${motionCopyAttributes(scene, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body || scene.caption)}</article>`).join("")}</div></div>`;
  } else if (animation.type === "text-parallax" && hasMotionStories(2)) {
    blockHtml = `<div class="store-text-parallax" data-text-parallax aria-label="${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<article data-text-parallax-item="${index}" style="--text-parallax-progress:0"><div class="store-text-parallax-sticky"><figure>${motionMediaHtml(scene, index)}</figure><div ${motionCopyAttributes(scene, index)}>${motionCaptionHtml(scene.caption)}${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div></div></article>`).join("")}</div>`;
  } else if (animation.type === "story-scroll" && hasMotionStories(2)) {
    blockHtml = `<div class="store-flow-art" data-motion-flow aria-label="Story Scroll">${motionStories.map((entry, index) => `<article class="store-flow-section" style="--flow-index:${index}"><div class="store-flow-inner"><div class="store-flow-copy" ${motionCopyAttributes(entry, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(entry.title)}${motionParagraphHtml(entry.body)}</div><figure>${motionMediaHtml(entry, index, { controls: entry.isVideo })}</figure></div></article>`).join("")}</div>`;
  } else if (animation.type === "hero-carousel" && hasMotionImages(2)) {
    const heroSceneControls = motionImages.map((image, index) => {
      const product = motionProductFor(image);
      const attributes = `data-motion-hero-to="${index}" data-motion-title="${escapeHtml(image.title)}" data-motion-caption="${escapeHtml(image.caption)}"${motionSceneDataAttributes(image, index)} aria-current="${index === 0}"`;
      const media = motionMediaHtml(image, index, { allowProductLink: false });
      return product && !storeEditorMode
        ? `<a class="store-motion-scene-product-link product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" ${attributes} aria-label="Ver ${escapeHtml(product.name)}">${media}<span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`
        : `<button type="button" ${attributes} aria-label="Ver ${escapeHtml(motionMediaLabel(image, index))}">${media}</button>`;
    }).join("");
    blockHtml = `<div class="store-motion-hero" data-motion-hero role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}" tabindex="0"><div class="store-motion-hero-backgrounds" aria-hidden="true">${motionImages.map((image, index) => isVideoMediaUrl(image.mediaUrl) ? `<video class="store-motion-video ${index === 0 ? "active" : ""}" src="${escapeHtml(image.mediaUrl)}" data-motion-hero-background="${index}" muted loop playsinline preload="metadata"${motionAutoplay}></video>` : `<img src="${escapeHtml(image.mediaUrl)}" alt="" data-motion-hero-background="${index}" class="${index === 0 ? "active" : ""}">`).join("")}</div><div class="store-motion-hero-copy" ${motionCopyAttributes(motionImages[0], 0)}><h3 data-animation-copy-field="title" data-motion-hero-title ${motionImages[0].title ? "" : "hidden"}>${escapeHtml(motionImages[0].title)}</h3><p data-animation-copy-field="caption" data-motion-hero-caption ${motionImages[0].caption ? "" : "hidden"}>${escapeHtml(motionImages[0].caption)}</p></div><div class="store-motion-filmstrip">${heroSceneControls}</div><div class="store-motion-hero-rail"><span data-motion-hero-status>01</span><span>${String(motionImages.length).padStart(2, "0")}</span></div></div>`;
  } else if (animation.type === "image-stream" && hasMotionImages(2)) {
    const streamColumns = Math.min(4, motionImages.length);
    blockHtml = `<div class="store-image-stream" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-image-stream-grid" data-image-count="${motionImages.length}" style="--image-stream-columns:${streamColumns}">${motionImages.map((image, index) => `<figure>${motionMediaHtml(image, index)}</figure>`).join("")}</div></div>`;
  } else if (animation.type === "scroll-expansion" && hasMotionImages(2)) {
    const image = motionImages[0];
    const background = motionImages[1] ?? image;
    const copy = image.title || image.body ? `<div class="store-scroll-expansion-copy" ${motionCopyAttributes(image, 0)}>${motionHeadingHtml(image.title)}${motionParagraphHtml(image.body)}</div>` : "";
    blockHtml = `<div class="store-scroll-expansion" data-scroll-expansion style="--expansion-progress:0" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-scroll-expansion-sticky"><div class="store-scroll-expansion-background" aria-hidden="true">${motionMediaHtml(background, 1, { decorative: true })}</div><figure>${motionMediaHtml(image, 0)}</figure>${copy}</div></div>`;
  } else if (animation.type === "hero-gallery-scroll" && hasMotionImages(3)) {
    blockHtml = `<div class="store-gallery-scroll" data-gallery-scroll aria-label="${escapeHtml(accessibleLabel)}"><div class="store-gallery-scroll-sticky"><div class="store-gallery-scroll-grid">${motionImages.slice(0, 5).map((image, index) => `<figure data-gallery-scroll-cell="${index}">${motionMediaHtml(image, index)}</figure>`).join("")}</div></div></div>`;
  } else if (animation.type === "stagger-testimonials" && hasMotionImages(2)) {
    blockHtml = `<div class="store-testimonials" data-testimonials tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-testimonials-stage">${motionImages.map((image, index) => `<article class="store-testimonial-card" data-testimonial-index="${index}" style="--testimonial-offset:${index}" aria-hidden="${index !== 0}">${motionMediaHtml(image, index)}<div class="store-testimonial-copy" ${motionCopyAttributes(image, index)}>${image.body ? `<blockquote data-animation-copy-field="body">“${escapeHtml(image.body)}”</blockquote>` : ""}${image.caption ? `<p data-animation-copy-field="caption">— ${escapeHtml(image.caption)}</p>` : ""}</div></article>`).join("")}</div><div class="store-experience-controls"><button type="button" data-testimonial-step="-1" aria-label="Ver reseña anterior">${ICON_ARROW_LEFT}</button><span class="store-testimonial-status" aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-testimonial-step="1" aria-label="Ver reseña siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
  } else if (animation.type === "portfolio-scroller" && hasMotionStories(2)) {
    blockHtml = `<div class="store-portfolio" data-portfolio-scroller tabindex="0" role="region" aria-label="${escapeHtml(accessibleLabel)}"><nav aria-label="Escenas de ${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<button type="button" data-portfolio-to="${index}" aria-label="Ver ${escapeHtml(motionMediaLabel(scene, index))}" aria-current="${index === 0}"><span>${String(index + 1).padStart(2, "0")}</span>${scene.title ? `<strong>${escapeHtml(scene.title)}</strong>` : ""}</button>`).join("")}</nav><div class="store-portfolio-stage">${motionStories.map((scene, index) => `<article data-portfolio-panel="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><div class="store-portfolio-media">${motionMediaHtml(scene, index)}</div>${scene.title || scene.body ? `<div class="store-portfolio-copy" ${motionCopyAttributes(scene, index)}>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : ""}</article>`).join("")}</div></div>`;
  } else if (animation.type === "circle-reveal" && motionStories.length >= 1) {
    const scene = motionStories[0];
    const copy = scene.title || scene.body ? `<div class="store-circle-reveal-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : "";
    blockHtml = `<div class="store-circle-reveal" data-circle-reveal aria-label="${escapeHtml(accessibleLabel)}"><div class="store-circle-reveal-sticky"><div class="store-circle-reveal-media">${motionMediaHtml(scene, 0)}</div>${copy}</div></div>`;
  } else if (animation.type === "clarity-marquee") {
    const authoredPhrases = (animation.title?.split("|") ?? [])
      .map((phrase) => phrase.trim())
      .filter((phrase) => {
        const normalized = phrase.toLocaleLowerCase();
        return !!phrase && normalized !== accessibleLabel.toLocaleLowerCase() && !technicalAnimationTitles.has(normalized);
      });
    const phrases = [...new Set([
      ...authoredPhrases,
      animation.subtitle?.trim(),
      selectedProduct?.name,
      ...(selectedProduct?.tags ?? []),
      ...store.items.map((item) => item.name),
      store.storeName,
    ].map((phrase) => phrase?.trim()).filter((phrase): phrase is string => !!phrase))].slice(0, 8);
    const phraseHtml = phrases.map((phrase, index) => `<span data-animation-copy-field="${index === 0 ? "title" : "body"}"><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(phrase)}</span>`).join("");
    blockHtml = `<div class="store-clarity-marquee" data-clarity-marquee data-animation-copy aria-label="${escapeHtml(accessibleLabel)}"><div class="store-clarity-rail"><div>${phraseHtml}</div><div aria-hidden="true">${phraseHtml}</div></div></div>`;
  } else if (animation.type === "layered-text") {
    const authoredLayeredPhrases = (animation.title?.split("|") ?? []).map((phrase) => phrase.trim()).filter(Boolean);
    const layeredPhrases = [...new Set([
      ...(authoredLayeredPhrases.length > 1 ? authoredLayeredPhrases : [primaryText]),
      secondaryText,
    ])].slice(0, 5);
    const layeredLines = Array.from({ length: Math.min(7, Math.max(4, layeredPhrases.length + 1)) }, (_, index) => {
      const top = index === 0 ? "\u00a0" : layeredPhrases[(index - 1) % layeredPhrases.length];
      const bottom = index === Math.min(7, Math.max(4, layeredPhrases.length + 1)) - 1 ? "\u00a0" : layeredPhrases[index % layeredPhrases.length];
      return `<li style="--layer-index:${index}"><span data-animation-copy-field="title">${escapeHtml(top)}</span><span data-animation-copy-field="body">${escapeHtml(bottom)}</span></li>`;
    }).join("");
    blockHtml = `<div class="store-layered-text" data-layered-text data-animation-copy tabindex="0" aria-label="${escapeHtml(accessibleLabel)}"><ul>${layeredLines}</ul></div>`;
  } else if (animation.type === "text-rotate") {
    const authoredRotatingValues = (animation.title?.split("|") ?? []).map((phrase) => phrase.trim()).filter(Boolean);
    const typewriterPrefix = animation.subtitle?.trim() || "Descubre";
    const normalizedPrefix = typewriterPrefix.toLocaleLowerCase();
    const rotatingValues = [...new Set([
      ...(authoredRotatingValues.length > 1 ? authoredRotatingValues : [primaryText]),
      ...textPhrases.filter((phrase) => phrase !== animation.subtitle?.trim()),
      ...store.items.map((item) => item.name.trim()).filter(Boolean),
    ])].filter((phrase) => phrase.toLocaleLowerCase() !== normalizedPrefix).slice(0, 8);
    blockHtml = `<div class="store-text-rotate" data-text-rotate data-text-rotate-values="${escapeHtml(rotatingValues.join("\u001f"))}" aria-label="${escapeHtml(accessibleLabel)}"><p data-animation-copy><span class="store-text-rotate-prefix" data-animation-copy-field="body">${escapeHtml(typewriterPrefix)}</span><span class="store-text-rotate-window"><span data-text-rotate-current data-animation-copy-field="title">${escapeHtml(rotatingValues[0] || "")}</span><span class="store-text-typewriter-cursor" aria-hidden="true">_</span></span></p></div>`;
  } else if (animation.type === "text-glitch") {
    blockHtml = `<div class="store-text-glitch" data-text-glitch data-animation-copy tabindex="0" data-hover-text="${escapeHtml(secondaryText)}" aria-label="${escapeHtml(accessibleLabel)}"><span class="store-text-glitch-base" data-animation-copy-field="title">${escapeHtml(primaryText)}</span><span class="store-text-glitch-hover" data-text-glitch-hover data-animation-copy-field="body" aria-hidden="true">${escapeHtml(secondaryText)}</span></div>`;
  } else if (animation.type === "text-reveal-block") {
    blockHtml = `<div class="store-text-reveal" data-text-reveal data-animation-copy aria-label="${escapeHtml(accessibleLabel)}"><span class="store-text-reveal-line"><strong data-animation-copy-field="title">${escapeHtml(primaryText)}</strong></span><span class="store-text-reveal-line"><span data-animation-copy-field="body">${escapeHtml(secondaryText)}</span></span></div>`;
  } else if (animation.type === "text-along-path") {
    const pathId = `store-text-path-${animation.id.replace(/[^a-z0-9_-]/gi, "")}`;
    const pathText = `${primaryText} · ${secondaryText} · ${primaryText} · ${secondaryText} · `;
    blockHtml = `<div class="store-text-path" data-text-along-path data-animation-copy data-animation-style-target aria-label="${escapeHtml(accessibleLabel)}"><svg viewBox="0 0 1000 360" role="img" aria-labelledby="${pathId}-title" preserveAspectRatio="xMidYMid meet"><title id="${pathId}-title">${escapeHtml(primaryText)}</title><path id="${pathId}" d="M70 180 C180 20 360 20 500 180 S820 340 930 180" fill="none"/><text><textPath href="#${pathId}" startOffset="0%"><animate attributeName="startOffset" from="-100%" to="100%" dur="18s" repeatCount="indefinite"/>${escapeHtml(pathText)}</textPath></text></svg><span class="sr-only" data-animation-copy-field="title">${escapeHtml(primaryText)}</span><span class="sr-only" data-animation-copy-field="body">${escapeHtml(secondaryText)}</span></div>`;
  } else if (animation.type === "full-screen-chapters" && hasMotionStories(2)) {
    blockHtml = `<div class="store-full-chapters" data-full-chapters role="region" aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(220, motionStories.length * 90)}svh"><div class="store-full-chapters-sticky"><div class="store-full-chapter-backgrounds" aria-hidden="true">${motionStories.map((scene, index) => `<div data-full-chapter-bg="${index}" class="${index === 0 ? "active" : ""}">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" muted loop playsinline preload="metadata"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, "")}</div>`).join("")}</div><div class="store-full-chapter-copy">${motionStories.map((scene, index) => `<article data-full-chapter-copy="${index}" ${motionCopyAttributes(scene, index)} class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><span>${String(index + 1).padStart(2, "0")} / ${String(motionStories.length).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}${motionProductActionHtml(scene)}</article>`).join("")}</div><div class="store-full-chapter-progress" aria-hidden="true"><span></span></div></div></div>`;
  } else if (animation.type === "magnetic-target" && motionImages.length >= 1) {
    const scene = motionImages[0];
    const magneticProduct = motionProductFor(scene) || selectedProduct;
    const magneticHref = magneticProduct ? productPageUrl(slug, magneticProduct.id) : "#store-grid";
    const magneticLabel = magneticProduct ? `Ver ${magneticProduct.name}` : "Explorar colección";
    const copy = scene.caption || scene.title || scene.body ? `<div class="store-magnetic-copy" ${motionCopyAttributes(scene, 0)}>${motionCaptionHtml(scene.caption)}${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : "";
    blockHtml = `<div class="store-magnetic" data-magnetic-target${isVideoMediaUrl(scene.mediaUrl) ? "" : ` style="--magnetic-image:url(&quot;${escapeHtml(scene.mediaUrl)}&quot;)"`}>${isVideoMediaUrl(scene.mediaUrl) ? motionMediaHtml(scene, 0, { decorative: true }) : ""}${copy}<a href="${escapeHtml(magneticHref)}" data-magnetic-link><span>${escapeHtml(magneticLabel)}</span>${ICON_ARROW_RIGHT}</a></div>`;
  } else if (animation.type === "frame-sequence" && hasMotionImages(2)) {
    blockHtml = `<div class="store-frame-sequence" data-frame-sequence aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(200, motionImages.length * 55)}svh"><div class="store-frame-sticky"><div class="store-frame-media">${motionImages.map((image, index) => `<div data-frame="${index}" data-frame-title-value="${escapeHtml(image.title)}" data-frame-body-value="${escapeHtml(image.body)}"${motionSceneDataAttributes(image, index)} class="${index === 0 ? "active" : ""}">${motionMediaHtml(image, index)}</div>`).join("")}</div><div class="store-frame-copy" ${motionCopyAttributes(motionImages[0], 0)}><span data-frame-status>01 / ${String(motionImages.length).padStart(2, "0")}</span><h3 data-animation-copy-field="title" data-frame-title ${motionImages[0].title ? "" : "hidden"}>${escapeHtml(motionImages[0].title)}</h3><p data-animation-copy-field="body" data-frame-body ${motionImages[0].body ? "" : "hidden"}>${escapeHtml(motionImages[0].body)}</p></div></div></div>`;
  }
  if (!blockHtml && storeEditorMode) {
    const requirement = storeAnimationMediaRequirement(animation.type);
    const missing = Math.max(0, requirement.min - motionImages.length);
    blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status">
      <span class="store-animation-incomplete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9h.01"/></svg></span>
      <div><strong>Completa ${escapeHtml(accessibleLabel)}</strong><p>${missing ? `Agrega ${missing} ${missing === 1 ? "archivo" : "archivos"} para activar esta animación.` : "Agrega contenido para activar esta animación."}</p><small>Tócala para abrir sus opciones. Puedes usar imágenes, GIF, MP4 o WebM.</small></div>
    </div>`;
  }
  const productCardImageUrl = selectedProduct?.imageUrls?.[0] ? assetUrl(selectedProduct.imageUrls[0]) : null;
  const productActionHtml = selectedProduct
    ? `<a class="store-motion-product-link store-motion-product-card product-page-link" data-animation-product-card href="${escapeHtml(productPageUrl(slug, selectedProduct.id))}" aria-label="Ver ${escapeHtml(selectedProduct.name)}">
        <span class="store-motion-product-media">${productCardImageUrl
          ? `<img src="${escapeHtml(productCardImageUrl)}" alt="" style="object-position:${productImagePosition(selectedProduct, 0)}">`
          : `<span aria-hidden="true">${escapeHtml(initials(selectedProduct.name))}</span>`}</span>
        <span class="store-motion-product-copy">
          <small>Producto en esta animación</small>
          <strong>${escapeHtml(selectedProduct.name)}</strong>
          ${selectedProduct.description ? `<span class="store-motion-product-description">${escapeHtml(selectedProduct.description)}</span>` : ""}
          ${salePriceHtml(selectedProduct, discountedProductAmount(selectedProduct, selectedProduct.amount), selectedProduct.amount, "store-motion-product-price")}
        </span>
        <span class="store-motion-product-action"><span>Ver producto</span>${ICON_ARROW_RIGHT}</span>
      </a>`
    : "";
  const buttonLabel = animation.buttonLabel?.trim() || "";
  const buttonPositionX = Number.isInteger(animation.buttonPositionX) ? animation.buttonPositionX! : 18;
  const buttonPositionY = Number.isInteger(animation.buttonPositionY) ? animation.buttonPositionY! : 86;
  const buttonHref = selectedProduct ? productPageUrl(slug, selectedProduct.id) : "#store-products";
  const buttonActionHtml = buttonLabel
    ? `<a class="store-animation-cta" href="${escapeHtml(buttonHref)}" data-animation-button-layout-target data-animation-button-x="${buttonPositionX}" data-animation-button-y="${buttonPositionY}" style="--animation-button-x:${buttonPositionX}%;--animation-button-y:${buttonPositionY}%"><span class="store-animation-cta-label">${escapeHtml(buttonLabel)}</span>${ICON_ARROW_RIGHT}</a>`
    : "";
  const hasSceneCopy = !["image-stream", "hero-gallery-scroll", ...textAnimationTypes].includes(animation.type);
  const generalTitle = animation.title?.trim() || "";
  const normalizedGeneralTitle = generalTitle.toLocaleLowerCase();
  const publicTitle = normalizedGeneralTitle === accessibleLabel.toLocaleLowerCase()
    || technicalAnimationTitles.has(normalizedGeneralTitle)
    || technicalAnimationTerms.some((term) => normalizedGeneralTitle === term)
    || (!!catalogTitleKey && renderedCopyKey(generalTitle) === catalogTitleKey)
    ? ""
    : generalTitle;
  const descriptionHtml = !["video-background", "video-pin-reveal"].includes(animation.type) && !isTextAnimation && (publicTitle || publicDescription)
    ? `<div class="store-motion-description" data-animation-general-copy${hasSceneCopy ? "" : " data-animation-copy"}>${publicTitle ? `<h3>${escapeHtml(publicTitle)}</h3>` : ""}${publicDescription ? `<p>${escapeHtml(publicDescription)}</p>` : ""}</div>`
    : "";
  const html = blockHtml
	      ? `<section class="store-motion-section" data-animation-id="${escapeHtml(animation.id)}" data-motion-experience="${animation.type}"${blockHtml.includes("data-animation-incomplete") ? " data-animation-is-incomplete" : ""} aria-label="${escapeHtml(accessibleLabel)}"${animationAttributes}>${descriptionHtml}${blockHtml}${extraTextHtml}${buttonActionHtml}${productActionHtml}</section>`
    : "";
  return [sectionKey, html];
}
