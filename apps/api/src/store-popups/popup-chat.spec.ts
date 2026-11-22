import { popupChatRequest } from './popup-chat';

describe('popup requests in the chat', () => {
  it('reads a redesign, a discount and a contact change, only when the popup is named', () => {
    expect(popupChatRequest('rediseña mi popup')).toEqual({ redesign: true });
    expect(popupChatRequest('hazme otro popup más divertido')).toEqual({ redesign: true, request: 'hazme otro popup más divertido' });
    expect(popupChatRequest('pon 15% de descuento en el popup')).toEqual({ redesign: false, percent: 15 });
    expect(popupChatRequest('que el popup pida email en vez de WhatsApp')).toEqual({ redesign: false, capture: 'email' });
    expect(popupChatRequest('el popup que pida whatsapp')).toEqual({ redesign: false, capture: 'whatsapp' });
    expect(popupChatRequest('agrega una pregunta sobre tallas al popup')).toEqual({ redesign: true, request: 'agrega una pregunta sobre tallas al popup' });
    for (const text of ['cambia el color del botón', 'pon 15% de descuento en las poleras', 'mejorar mi marca']) expect(popupChatRequest(text)).toBeNull();
  });
  // Final review (I4): on/off, timing and A/B tests keep their own paths; «quita» a whole popup is not a redesign.
  it('leaves switching, timing and tests to the other paths', () => {
    for (const text of ['apaga el popup', 'quita el popup', 'desactiva el popup', 'activa mi popup', 'pon el popup a los 10 segundos', 'prueba el popup con 20%', 'haz un test A/B del popup']) expect(popupChatRequest(text)).toBeNull();
    expect(popupChatRequest('quita la pregunta del popup')).toEqual({ redesign: true, request: 'quita la pregunta del popup' });
  });
  it('reads a full-page request', () => {
    expect(popupChatRequest('haz mi popup a pantalla completa')).toEqual({ redesign: true, request: 'haz mi popup a pantalla completa', layout: 'full' });
    expect(popupChatRequest('quiero un popup full screen')).toMatchObject({ redesign: true, layout: 'full' });
  });
});

describe('moments in chat (spec 2026-11-21 §8)', () => {
  it('names the moment a redesign is for', () => {
    expect(popupChatRequest('haz el popup del carrito más simple')).toMatchObject({ redesign: true, moment: 'rescue' });
    expect(popupChatRequest('rediseña el popup de regreso')).toMatchObject({ redesign: true, moment: 'return' });
    expect(popupChatRequest('rediseña todos mis popups')).toMatchObject({ redesign: true, moment: 'all' });
    expect(popupChatRequest('rediseña mi popup')).toEqual({ redesign: true });
  });
  it('switches one moment on or off without a model call', () => {
    expect(popupChatRequest('apaga el popup de regreso')).toEqual({ redesign: false, moment: 'return', on: false });
    expect(popupChatRequest('activa el popup del carrito')).toEqual({ redesign: false, moment: 'rescue', on: true });
    expect(popupChatRequest('apaga el popup')).toBeNull();
  });
});

describe('switch words are orders, not adjectives (minor 6)', () => {
  it('«más activo» is a redesign, «activa» a switch', () => {
    expect(popupChatRequest('haz el popup del carrito más activo')).toMatchObject({ redesign: true, moment: 'rescue' });
    expect(popupChatRequest('activa el popup del carrito')).toEqual({ redesign: false, moment: 'rescue', on: true });
    expect(popupChatRequest('desactivar el popup de regreso')).toEqual({ redesign: false, moment: 'return', on: false });
  });
});
