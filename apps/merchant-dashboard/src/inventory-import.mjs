/** Turns the products the AI read from an inventory file into reviewable rows, matching the photos the merchant chose. */

export const MAX_IMAGE_BYTES = 8_000_000;
export const MAX_GALLERY_IMAGES = 10;

export function inventoryFilenameKey(value) {
  let filename = String(value || "").trim();
  try { filename = decodeURIComponent(filename); } catch { /* malformed escape: keep the raw name */ }
  filename = filename.split(/[?#]/, 1)[0].replace(/\\/g, "/").split("/").pop() || filename;
  return filename.normalize("NFC").toLocaleLowerCase("es");
}

export function inventoryStemKey(value) {
  return inventoryFilenameKey(value)
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles) {
  const nameKey = inventoryStemKey(name);
  const skuKey = inventoryStemKey(codigoProducto);
  const nameTokens = nameKey.split(" ").filter((token) => token.length >= 3);
  const candidates = imageFiles
    .filter((file) => !matchedImageFiles.has(file))
    .map((file) => {
      const stem = inventoryStemKey(file.name);
      let score = 0;
      if (skuKey && stem === skuKey) score = 100;
      else if (nameKey && stem === nameKey) score = 100;
      else if (skuKey && (stem.startsWith(`${skuKey} `) || stem.endsWith(` ${skuKey}`))) score = 92;
      else if (nameKey && (stem.startsWith(`${nameKey} `) || stem.endsWith(` ${nameKey}`))) score = 88;
      else if (nameTokens.length && nameTokens.every((token) => stem.includes(token))) score = 72;
      return { file, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.file.name.localeCompare(right.file.name, "es"));
  const strongMatches = candidates.filter((candidate) => candidate.score >= 88).slice(0, MAX_GALLERY_IMAGES);
  if (strongMatches.length) return strongMatches.map((candidate) => candidate.file);
  return candidates.length === 1 ? [candidates[0].file] : [];
}

function markDuplicateInventorySkus(rows) {
  const firstRowBySku = new Map();
  rows.forEach((row) => {
    const sku = row.product.codigoProducto;
    if (!sku) return;
    if (firstRowBySku.has(sku)) {
      row.errors.push(`El SKU ${sku} ya aparece en la fila ${firstRowBySku.get(sku)}`);
    } else {
      firstRowBySku.set(sku, row.rowNumber);
    }
  });
}

export function prepareAiInventoryRows(products, imageFiles) {
  if (!Array.isArray(products) || products.length === 0) throw new Error("La IA no encontró productos en el archivo.");
  if (products.length > 100) throw new Error("La IA encontró más de 100 productos. Divide el archivo e intenta nuevamente.");
  const imagesByName = new Map();
  const imagesByStem = new Map();
  const matchedImageFiles = new Set();
  imageFiles.forEach((file) => {
    imagesByName.set(inventoryFilenameKey(file.name), file);
    const stem = inventoryStemKey(file.name);
    imagesByStem.set(stem, [...(imagesByStem.get(stem) || []), file]);
  });

  const rows = products.map((source, index) => {
    const errors = Array.isArray(source.errors) ? source.errors.map((value) => String(value)).filter(Boolean) : [];
    const name = String(source.name || "").trim();
    const codigoProducto = String(source.codigoProducto || "").trim();
    if (codigoProducto.length > 64) errors.push("El SKU supera 64 caracteres");
    if (codigoProducto && !/^[A-Za-z0-9._-]+$/.test(codigoProducto)) errors.push("El SKU solo admite letras, números, punto, guion y guion bajo");
    const requestedImages = Array.isArray(source.imageNames) ? source.imageNames.map((value) => String(value).trim()).filter(Boolean) : [];
    const matchedImages = requestedImages.map((filename) => {
      const exact = imagesByName.get(inventoryFilenameKey(filename));
      const stemMatches = imagesByStem.get(inventoryStemKey(filename)) || [];
      const file = exact || (stemMatches.length === 1 ? stemMatches[0] : undefined);
      if (!file) errors.push(`No se seleccionó la foto "${filename}"`);
      else matchedImageFiles.add(file);
      return file;
    }).filter(Boolean);
    if (requestedImages.length === 0 && name) {
      const automaticMatches = inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles);
      automaticMatches.forEach((file) => matchedImageFiles.add(file));
      matchedImages.push(...automaticMatches);
    }
    matchedImages.forEach((file) => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) errors.push(`Formato no admitido para "${file.name}"`);
      else if (file.size > MAX_IMAGE_BYTES) errors.push(`"${file.name}" supera 8 MB`);
    });
    const variants = Array.isArray(source.variants) ? source.variants : [];
    if (variants.length === 1) errors.push("Un producto con tamaños necesita por lo menos 2 opciones");
    return {
      rowNumber: Number.isInteger(source.sourceRow) ? source.sourceRow : index + 2,
      errors,
      imageFiles: matchedImages,
      product: {
        name,
        codigoProducto: codigoProducto || null,
        description: source.description || null,
        tags: Array.isArray(source.tags) ? source.tags : [],
        stock: variants.length ? null : source.stock ?? null,
        variants,
        categoryName: source.categoryName || undefined,
        color: source.color || null,
        amount: source.amount,
        currency: "BOB",
      },
    };
  });
  const unmatchedImageCount = imageFiles.filter((file) => !matchedImageFiles.has(file)).length;
  markDuplicateInventorySkus(rows);
  return {
    rows,
    warnings: unmatchedImageCount
      ? [`${unmatchedImageCount} ${unmatchedImageCount === 1 ? "foto no pudo relacionarse" : "fotos no pudieron relacionarse"} con un producto. Puedes renombrarlas con el nombre o SKU del producto y volver a adaptar el archivo.`]
      : [],
  };
}
