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
});
