// YAPI capability sweep (owner 2026-11-06 «prueba todo lo que puede hacer yapi, no podemos dejar nada a la suerte»).
// Each entry: the merchant's words, and a check over the store after YAPI answered (s = helpers from sweep.cjs).
module.exports = [
  // Home sections
  { id: 'home-title', say: 'cambia el título de la portada a «Comida de verdad para tu perro»', check: s => /Comida de verdad para tu perro/i.test(s.layout[0]?.title ?? '') },
  { id: 'home-add-faq', say: 'agrega una sección de preguntas frecuentes a la portada', check: s => s.layout.some(b => /faq/.test(b.type)) },
  { id: 'home-move', say: 'mueve los productos arriba, justo después de la portada', check: s => /products/.test(s.layout[1]?.type ?? '') },
  { id: 'home-remove', say: 'quita la sección de preguntas frecuentes de la portada', check: s => !s.layout.some(b => /faq/.test(b.type)) },
  { id: 'home-photo', say: 'cambia la foto de la portada por la foto del plan semanal', check: (s, before) => s.layout[0]?.photo && s.layout[0].photo !== before.layout[0]?.photo },
  { id: 'home-vague', say: 'hazla más corta', check: (s, before) => s.layout.length < before.layout.length },
  // Menu pages and new pages
  { id: 'page-shipping', say: 'mejora la sección de envíos y entregas', check: s => (s.pageLayouts.shipping ?? []).length > 0, quick: true },
  { id: 'page-about', say: 'haz la página nosotros más bonita', check: s => (s.pageLayouts.about ?? []).length > 0, quick: true },
  { id: 'page-new', say: 'crea una página Recetas con 3 recetas fáciles para perros', check: s => s.extraPages.some(p => /recetas/i.test(p.name)) },
  { id: 'page-link', say: 'pon la página Recetas en el menú', check: s => JSON.stringify(s.menu ?? {}).includes('extra:recetas') },
  // Store data
  { id: 'data-phone', say: 'cambia el teléfono de contacto a 70012345', check: s => /70012345/.test(s.store.contactPhone ?? '') },
  { id: 'data-faq', say: 'agrega una pregunta frecuente: ¿Hacen envíos a El Alto? No, solo entregamos en Cochabamba', check: s => JSON.stringify(s.store.policies ?? {}).includes('El Alto') },
  { id: 'data-announce', say: 'pon una cinta arriba que diga: Envío gratis desde Bs 200', check: s => /Env[ií]o gratis desde Bs 200/i.test(s.copy.announcement ?? '') },
  { id: 'data-popup', say: 'activa la ventana de suscripción con 10% de descuento', check: s => s.retention?.signupEnabled === true },
  // Catalogue
  { id: 'cat-create', say: 'crea la categoría Premios y agrega Galletas de avena a Bs 25 en Premios', check: s => s.product('Galletas de avena')?.category === 'Premios' && s.product('Galletas de avena')?.amount === 2500 },
  { id: 'cat-stock', say: 'quedan 3 del Plan semanal 7 porciones', check: s => s.product('Plan semanal')?.stock === 3 },
  { id: 'cat-colours', say: 'agrega Collar reflectante a Bs 60 en rojo y azul', check: s => (s.product('Collar reflectante')?.variants ?? []).some(v => (v.options ?? []).some(o => o.name === 'Color')) },
  { id: 'cat-archive', say: 'quita las Galletas de avena', check: s => s.product('Galletas de avena')?.status === 'ARCHIVED' },
  { id: 'cat-restore', say: 'vuelve a poner las Galletas de avena', check: s => s.product('Galletas de avena')?.status === 'ACTIVE' },
  { id: 'code-add', say: 'crea un código GUAU15 de 15 %', check: s => s.code('GUAU15')?.isActive === true && s.code('GUAU15')?.discountValue === 15 },
  { id: 'code-off', say: 'apaga el código GUAU15', check: s => s.code('GUAU15')?.isActive === false },
  { id: 'cat-rename', say: 'renombra la categoría Premios a Snacks premium', check: s => s.categories.includes('Snacks premium') && !s.categories.includes('Premios') },
  { id: 'cat-remove', say: 'borra la categoría Snacks premium', check: s => !s.categories.includes('Snacks premium') && s.product('Galletas de avena')?.category === null },
  { id: 'cat-ask', say: 'agrega Hueso dental', check: s => !s.product('Hueso dental'), expectAsk: true },
  { id: 'cat-answer', say: 'Bs 18', check: s => s.products.filter(p => p.name === 'Hueso dental').length === 1 && s.product('Hueso dental')?.amount === 1800 },
  // Look
  { id: 'look-colours', say: 'cambia los colores a algo más cálido', check: (s, before) => JSON.stringify(s.look) !== JSON.stringify(before.look) },
  { id: 'look-font', say: 'usa una letra más redonda para los títulos', check: (s, before) => JSON.stringify([s.look, s.variants]) !== JSON.stringify([before.look, before.variants]) },
  // Conversation
  { id: 'question', say: '¿cuánto cuesta el plan semanal?', check: (s, before) => s.revision === before.revision, expectReply: /250/ },
  // Template
  { id: 'template-switch', say: 'prueba otra plantilla', check: (s, before) => s.theme !== before.theme && s.layout.length >= 11, slow: true },
];
