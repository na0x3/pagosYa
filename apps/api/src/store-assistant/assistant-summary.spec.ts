import { buildAssistantSummary, storePassages, type SummaryStore } from './assistant-summary';
import { assistantInstructions } from './assistant-prompt';

const store: SummaryStore = {
  name: 'Café Yungas', tagline: 'Café de altura', aboutText: 'Somos una familia de Coroico que tuesta café desde 1998.', announcement: null,
  contactPhone: '+591 70000000', checkoutMode: 'payment', shippingEnabled: true, shippingPickupEnabled: true,
  locations: [{ id: 'l1', name: 'Sopocachi', address: 'Av. 20 de Octubre 123', pickupEnabled: true, deliveryEnabled: true, openingHours: [{ day: 1, open: '09:00', close: '18:00', closed: false }, { day: 0, open: '', close: '', closed: true }] }],
  policies: { returns: 'Aceptamos cambios hasta 7 días después.', delivery: 'Enviamos a todo el país con courier.' },
  categories: ['Café en grano', 'Molido'],
};
const profile = { name: 'Carla', notes: 'Tostamos los martes.\n\nNo trabajamos feriados.', formality: 'tu' };

describe('assistant summary', () => {
  it('says who the store is, how to buy, where and when, and what it wants known', () => {
    const summary = buildAssistantSummary(store, profile);
    expect(summary).toContain('Tienda: Café Yungas — Café de altura');
    expect(summary).toContain('Quiénes somos: Somos una familia de Coroico');
    expect(summary).toContain('Local Sopocachi (Av. 20 de Octubre 123), recojo, envíos; horario: dom cerrado, lun 09:00–18:00');
    expect(summary).toContain('Categorías: Café en grano, Molido');
    expect(summary).toContain('Políticas publicadas: Cambios y devoluciones, Envíos');
    expect(summary).toContain('La tienda atiende por WhatsApp.');
    expect(summary).toContain('Tostamos los martes.\n\nNo trabajamos feriados.');
  });

  it('never carries sales or revenue figures', () => {
    expect(buildAssistantSummary(store, profile)).not.toMatch(/ventas|ingresos|conversi/i);
  });

  it('splits searchable passages from the story, policies, locations and notes', () => {
    const titles = storePassages(store, profile).map((p) => p.title);
    expect(titles).toEqual(['Quiénes somos', 'Cambios y devoluciones', 'Envíos', 'Local Sopocachi', 'Información de la tienda', 'Información de la tienda']);
  });

  it('splits a long policy into passages of at most 1500 characters', () => {
    const long = { ...store, policies: { terms: Array.from({ length: 40 }, (_, i) => `Cláusula ${i} con texto suficiente para ocupar espacio.`).join('\n\n') } };
    const terms = storePassages(long, { ...profile, notes: '' }).filter((p) => p.title === 'Términos');
    expect(terms.length).toBeGreaterThan(1);
    expect(terms.every((p) => p.body.length <= 1500)).toBe(true);
  });

  it('puts the summary first in the instructions, then the rules', () => {
    const text = assistantInstructions('RESUMEN', { ...profile, formality: 'usted' }, 'Café Yungas');
    expect(text.indexOf('RESUMEN')).toBeLessThan(text.indexOf('REGLAS'));
    expect(text).toContain('Eres Carla, el asistente automático de Café Yungas');
    expect(text).toContain('Trata al cliente de usted.');
  });
});
