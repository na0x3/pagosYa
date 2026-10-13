import { dialDigits, primaryActionLink, savedPrimaryAction, sourcePrimaryAction, withShowcaseContactSlot, PRIMARY_ACTION_KINDS } from './source-primary-action';

describe('a showcase main action (spec 2026-10-13)', () => {
  it('offers exactly WhatsApp, the contact form, a booking link and a phone call', () => {
    expect([...PRIMARY_ACTION_KINDS]).toEqual(['whatsapp', 'form', 'booking', 'phone']);
  });

  it('keeps a valid choice and normalises its value', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp', value: '+591 700-12345' })).toEqual({ kind: 'whatsapp', value: '59170012345' });
    expect(sourcePrimaryAction({ kind: 'phone', value: '+591 2 2441234' })).toEqual({ kind: 'phone', value: '59122441234' });
    expect(sourcePrimaryAction({ kind: 'booking', value: ' https://cal.com/estudio-deff ' })).toEqual({ kind: 'booking', value: 'https://cal.com/estudio-deff' });
    expect(sourcePrimaryAction({ kind: 'form' })).toEqual({ kind: 'form' });
  });

  it('uses the store number for a WhatsApp or phone choice saved without one', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp' }, '+591 71234567')).toEqual({ kind: 'whatsapp', value: '59171234567' });
  });

  it('turns an unusable or unknown choice into the contact form', () => {
    expect(sourcePrimaryAction({ kind: 'whatsapp' }, null)).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'phone', value: '123' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'booking', value: 'http://cal.com/x' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'booking', value: 'agenda conmigo' })).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction({ kind: 'fax', value: '70012345' }, '+591 71234567')).toEqual({ kind: 'form' });
  });

  it('with no choice at all, uses WhatsApp when the store has a number, otherwise the form', () => {
    expect(sourcePrimaryAction(undefined, '+591 71234567')).toEqual({ kind: 'whatsapp', value: '59171234567' });
    expect(sourcePrimaryAction(undefined, null)).toEqual({ kind: 'form' });
    expect(sourcePrimaryAction(null, '')).toEqual({ kind: 'form' });
  });

  it('dials a Bolivian mobile typed without its country code', () => {
    expect(dialDigits('70012345')).toBe('59170012345');
    expect(dialDigits('6 123 4567')).toBe('59161234567');
    expect(dialDigits('22441234')).toBe('22441234');
    expect(primaryActionLink(sourcePrimaryAction({ kind: 'whatsapp', value: '70012345' })).href).toBe('https://wa.me/59170012345');
  });

  it('links each action the same way for the header and the page', () => {
    expect(primaryActionLink({ kind: 'whatsapp', value: '59170012345' })).toEqual({ href: 'https://wa.me/59170012345', label: 'Escríbenos', attributes: ' target="_blank" rel="noopener"' });
    expect(primaryActionLink({ kind: 'form' })).toEqual({ href: 'contacto.html', label: 'Pide una cotización', attributes: ' data-pagosya-contact-open' });
    expect(primaryActionLink({ kind: 'booking', value: 'https://cal.com/deff' })).toEqual({ href: 'https://cal.com/deff', label: 'Agenda una cita', attributes: ' target="_blank" rel="noopener"' });
    expect(primaryActionLink({ kind: 'phone', value: '59122441234' })).toEqual({ href: 'tel:+59122441234', label: 'Llámanos', attributes: '' });
  });
});

describe('where a showcase keeps its action and its contact slot', () => {
  it('reads the action a store saved in config.js, and nothing from a malformed or absent one', () => {
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"sitePurpose":"service","primaryAction":{"kind":"phone","value":"59122441234"}};\n' }])).toEqual({ kind: 'phone', value: '59122441234' });
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"sitePurpose":"shop"};' }])).toBeUndefined();
    expect(savedPrimaryAction([{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {roto' }])).toBeUndefined();
    expect(savedPrimaryAction([])).toBeUndefined();
  });

  it('adds the hidden contact slot to a showcase home once, before </main>, and leaves other pages alone', () => {
    const files = [{ path: 'index.html', content: '<body><main><h1>Hola</h1></main></body>' }, { path: 'nosotros.html', content: '<main></main>' }];
    const once = withShowcaseContactSlot(files);
    expect(once[0].content).toBe('<body><main><h1>Hola</h1><section data-pagosya-contact hidden></section></main></body>');
    expect(once[1]).toBe(files[1]);
    expect(withShowcaseContactSlot(once)).toEqual(once);
    const marked = [{ path: 'index.html', content: '<main><a href="contacto.html" data-pagosya-contact-open>Cotiza</a></main>' }];
    expect(withShowcaseContactSlot(marked)[0].content).toContain('<section data-pagosya-contact hidden></section></main>');
  });
});
