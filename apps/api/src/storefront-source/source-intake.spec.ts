import { BUILD_NOW, INTAKE_SCHEMA, intakeFacts, intakeInstruction, intakeMessage, intakePhone, normalizeIntake, pendingIntake, wantsBuildNow, type IntakeState } from './source-intake';

const state = (extra: Partial<IntakeState> = {}): IntakeState => ({ pending: true, words: 'hola quiero mi tienda para vender laminas', photos: [], asked: [], answers: [], ...extra });
const facts = intakeFacts({ name: 'Láminas Lu', onboarding: { what: 'laminas de arte', story: '' }, products: [{ name: 'Café', imageUrls: ['/v1/uploads/a.jpg'] }, { name: 'Té', imageUrls: [] }],
  zones: 0, locations: [], codes: [], links: [], contactPhone: null });
// A store with delivery set and a photo on every product: nothing for the facts to ask.
const settled = intakeFacts({ name: 'Láminas Lu', onboarding: {}, products: [{ name: 'Café', imageUrls: ['1', '2', '3'] }], zones: 1, locations: [], codes: [], links: [], contactPhone: null });

describe('intake facts', () => {
  it('summarises the catalogue and the settings the questions depend on', () => {
    expect(facts).toEqual({ tienda: 'Láminas Lu', vende: 'laminas de arte', historia: '', productos: 2, conFoto: ['Café'], sinFoto: ['Té'], fotos: 1,
      envios: false, recojo: false, codigo: '', whatsapp: false, instagram: false });
    const full = intakeFacts({ name: 'X', onboarding: {}, products: [], zones: 1, locations: [{ pickupEnabled: true }], codes: ['HOLA10'],
      links: [{ label: 'Instagram', url: 'https://instagram.com/x' }], contactPhone: '+59170000000' });
    expect(full).toMatchObject({ envios: true, recojo: true, codigo: 'HOLA10', whatsapp: true, instagram: true });
  });
});

describe('normalizeIntake', () => {
  const ask = { understood: 'láminas de arte para decorar', reply: '', ready: false, topic: 'look', question: '¿Cómo quieres que se vea?', options: ['Tranquila', 'Colorida', 'Créala ya'] };

  it('keeps one question with «Créala ya» exactly once, at the end (review focus 5)', () => {
    expect(normalizeIntake(ask, state(), facts)).toEqual({ ...ask, options: ['Tranquila', 'Colorida', BUILD_NOW] });
  });

  it('is ready when the model says so, at the cap, or on a topic already asked', () => {
    expect(normalizeIntake({ ...ask, ready: true }, state(), settled)?.ready).toBe(true);
    expect(normalizeIntake(ask, state({ asked: ['what', 'look', 'musts', 'photos'] }), facts)?.ready).toBe(true);
    expect(normalizeIntake(ask, state({ asked: ['look'] }), settled)?.ready).toBe(true);
  });

  it('re-asks the pending topic only with a one-line reply to a merchant question', () => {
    const pending = state({ asked: ['look'], question: { topic: 'look', text: '¿Cómo quieres que se vea?' } });
    expect(normalizeIntake({ ...ask, reply: 'Sí, puedes cambiarlo después.' }, pending, facts)).toMatchObject({ ready: false, topic: 'look', reply: 'Sí, puedes cambiarlo después.' });
  });

  // Live check 2026-11-04 (Libros de Ana: «vendo novelas y cuadernos, algo bonito y sencillo» → no question, though the store had no
  // delivery, pickup, code or WhatsApp): what the facts can check is asked even when the model calls the brief ready.
  it('asks the must-haves when the store has none of them, and photos when products have none, even on «ready»', () => {
    const none = intakeFacts({ name: 'Libros', onboarding: {}, products: [{ name: 'Ghosts', imageUrls: ['1', '2', '3'] }], zones: 0, locations: [], codes: [], links: [], contactPhone: null });
    expect(normalizeIntake({ ...ask, ready: true }, state(), none)).toMatchObject({ ready: false, topic: 'musts', options: ['Envíos', 'Recojo en mi local', 'Los dos', 'Por WhatsApp', BUILD_NOW] });
    expect(normalizeIntake({ ...ask, ready: true }, state({ asked: ['musts'] }), facts)).toMatchObject({ ready: false, topic: 'photos', question: '¿Me mandas fotos de Té?' });
    expect(normalizeIntake({ ...ask, ready: true }, state({ asked: ['musts', 'photos'] }), facts)?.ready).toBe(true);
    const some = intakeFacts({ name: 'Miga', onboarding: {}, products: [{ name: 'Roll', imageUrls: ['1', '2', '3'] }], zones: 1, locations: [], codes: [], links: [], contactPhone: null });
    expect(normalizeIntake({ ...ask, ready: true }, state(), some)?.ready).toBe(true);
  });

  it('never asks for photos when every product has one and there are three or more', () => {
    const covered = intakeFacts({ name: 'X', onboarding: {}, products: [{ name: 'A', imageUrls: ['1', '2'] }, { name: 'B', imageUrls: ['3'] }], zones: 1, locations: [], codes: [], links: [], contactPhone: null });
    expect(normalizeIntake({ ...ask, topic: 'photos' }, state(), covered)?.ready).toBe(true);
  });

  it('an unknown topic, an empty question or an unreadable answer is ready (or null) (review focus 5)', () => {
    expect(normalizeIntake({ ...ask, topic: 'budget' }, state(), settled)?.ready).toBe(true);
    expect(normalizeIntake({ ...ask, question: '  ' }, state(), settled)?.ready).toBe(true);
    expect(normalizeIntake(null, state(), facts)).toBeNull();
    expect(INTAKE_SCHEMA.properties.topic.enum).toEqual(['what', 'look', 'musts', 'photos', 'none']);
  });
});

describe('the words of the build', () => {
  it('«créala ya» and its variants, never an ordinary answer', () => {
    for (const text of ['Créala ya', 'creala ya!', 'ya', 'dale', 'hazla ya', 'así está bien', 'no más preguntas']) expect(wantsBuildNow(text)).toBe(true);
    for (const text of ['ya tengo fotos', 'Colorida', 'envíos a todo Bolivia']) expect(wantsBuildNow(text)).toBe(false);
  });

  it('the first words plus each real answer, «Créala ya» left out', () => {
    const done = state({ answers: [{ topic: 'look', question: '¿Cómo quieres que se vea?', answer: 'Colorida' }, { topic: 'musts', question: '¿Haces envíos?', answer: 'Créala ya' }] });
    expect(intakeInstruction(done)).toBe('hola quiero mi tienda para vender laminas\n\nRespuestas del comercio:\n- ¿Cómo quieres que se vea? → Colorida');
    expect(intakeInstruction(state())).toBe('hola quiero mi tienda para vender laminas');
  });

  it('the first question opens with what YAPI understood; a reply goes first', () => {
    const turn = { understood: 'láminas de arte para decorar', reply: '', ready: false, topic: 'look' as const, question: '¿Cómo quieres que se vea?', options: [] };
    expect(intakeMessage(turn, true)).toBe('Entendí: láminas de arte para decorar.\n\n¿Cómo quieres que se vea?');
    expect(intakeMessage(turn, false)).toBe('¿Cómo quieres que se vea?');
    expect(intakeMessage({ ...turn, reply: 'Sí, se puede.' }, false)).toBe('Sí, se puede.\n\n¿Cómo quieres que se vea?');
  });
});

describe('pendingIntake', () => {
  const open = { role: 'ASSISTANT', metadata: { intake: state() } };
  it('reads the open intake from YAPI\'s newest message on an unbuilt store only (review focus 3)', () => {
    expect(pendingIntake([{ role: 'USER', metadata: {} }, open], 0)).toEqual(state());
    expect(pendingIntake([open, { role: 'USER', metadata: {} }], 0)).toEqual(state());
    expect(pendingIntake([open], 2)).toBeNull();
    expect(pendingIntake([open, { role: 'ASSISTANT', metadata: { sourceRevision: 1 } }], 0)).toBeNull();
    expect(pendingIntake([{ role: 'ASSISTANT', metadata: { intake: state({ pending: false }) } }], 0)).toBeNull();
  });
});

// Live check 2026-11-09 (Miga, Bruma, Pawby): «¿Quieres un WhatsApp?» → «Sí, al 71234567» never reached the store, so the build had no
// number and YAPI's own checklist then said WhatsApp was missing.
describe('the number in the answers', () => {
  const asked = (answer: string, question = '¿Quieres incluir un WhatsApp para pedidos?') => state({ answers: [{ topic: 'musts', question, answer }] });
  it('finds the WhatsApp the merchant gave when asked', () => {
    expect(intakePhone(asked('Sí, al 71234567'))).toBe('71234567');
    expect(intakePhone(asked('si +591 7222 3344 porfa'))).toBe('+591 7222 3344');
    expect(intakePhone(state({ words: 'Vendo licuadoras, mi whatsapp es 75556677' }))).toBe('75556677');
  });
  it('takes nothing that is not a phone', () => {
    expect(intakePhone(asked('Sí'))).toBeNull();
    expect(intakePhone(asked('Envíos desde Bs 200, el 10 %'))).toBeNull();
    expect(intakePhone(asked('Cálida', '¿Qué estilo quieres?'))).toBeNull();
    expect(intakePhone(state({ words: 'Somos una panadería, horneamos 120 cookies por día desde 2019' }))).toBeNull();
  });
});
