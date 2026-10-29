import { checklistFixBrief, checklistReply, normalizeChecklist, storeDigest } from './source-brief-checklist';

// Owner 2026-10-27 («more accurateness per store»): Remolino asked for the REMOLINO10 popup, the Club and the combos.
it('keeps the asks the check can use and reads the code\'s percent from its name', () => {
  const checklist = normalizeChecklist({ items: [
    { ask: 'Ventana de suscripción con REMOLINO10', status: 'missing', setting: 'signupPopup', fix: '' },
    { ask: 'Sección Club Remolino', status: 'missing', setting: 'none', fix: 'Agrega la sección Club Remolino.' },
    { ask: '', status: 'done', setting: 'none', fix: '' },
    { ask: 'Formulario de contacto', status: 'weird', setting: 'other', fix: '' },
  ], popupCode: 'remolino10', popupPercent: 0 })!;
  expect(checklist.items.map(item => item.ask)).toEqual(['Ventana de suscripción con REMOLINO10', 'Sección Club Remolino', 'Formulario de contacto']);
  expect(checklist.items[2]).toMatchObject({ status: 'missing', setting: 'none' });
  expect(checklist).toMatchObject({ popupCode: 'REMOLINO10', popupPercent: 10 });
  expect(normalizeChecklist({ items: [], popupCode: '', popupPercent: 15 })).toMatchObject({ popupCode: '', popupPercent: 0 });
  expect(normalizeChecklist(null)).toBeNull();
});

it('reads the store without template code nobody touched', () => {
  const files = [
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"storeName":"Remolino","items":[{"name":"Licuadora Pro","amount":89000,"description":"long text","imageUrls":["a.jpg"]}]}};' },
    { path: 'components/store-data.tsx', content: 'export const copy = { headline: "Licuadoras" };' },
    { path: 'components/home.tsx', content: 'TEMPLATE HOME' },
    { path: 'components/club.tsx', content: 'export function Club() { return <section>Club Remolino</section>; }' },
    { path: '_compiled/home.js', content: 'compiled' },
    { path: 'index.html', content: '<html></html>' },
  ];
  const digest = storeDigest(files as never, [{ path: 'components/home.tsx', content: 'TEMPLATE HOME' }], { contactForm: false, signupPopup: true, popupCode: null, assistant: true });
  expect(digest).toContain('ventana de suscripción activada sin código de descuento');
  expect(digest).toContain('PÁGINAS: index.html');
  expect(digest).toContain('"name":"Licuadora Pro"');
  expect(digest).not.toContain('long text');
  expect(digest).toContain('components/club.tsx (nuevo)');
  expect(digest).not.toContain('TEMPLATE HOME');
  expect(digest).not.toContain('compiled');
});

it('answers with the list: ticks, what is being added, what YAPI needs', () => {
  const items = [
    { ask: 'Formulario de contacto', status: 'done', setting: 'contactForm', fix: '' },
    { ask: 'Sección Club Remolino', status: 'missing', setting: 'none', fix: 'Agrega el Club.' },
    { ask: 'Guía en PDF', status: 'needs_merchant', setting: 'none', fix: 'Sube el PDF de la guía.' },
  ] as const;
  expect(checklistReply(items, false)).toBe('Revisé tu pedido punto por punto. Falta 1 cosa; la agrego ahora:\n✓ Formulario de contacto\n… Sección Club Remolino\n? Guía en PDF — Sube el PDF de la guía.');
  expect(checklistReply(items, true)).toContain('✗ Sección Club Remolino');
  expect(checklistReply(items, true)).toContain('pídemelo aquí');
  expect(checklistReply(items, true, true)).toContain('· Sección Club Remolino');
  expect(checklistReply(items, true, true)).toContain('todavía no está en tu tienda');
  expect(checklistReply([], true)).toBe('');
  expect(checklistFixBrief([items[1]], 'Crea la tienda de Remolino')).toContain('1. Sección Club Remolino: Agrega el Club.');
});
