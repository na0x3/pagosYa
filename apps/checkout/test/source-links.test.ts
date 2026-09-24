import { expect, it } from 'vitest';
import { merchantDestination } from '../src/source-links';

const store = { links: [{ url: 'https://instagram.com/pliegue/' }, { url: 'https://www.tiktok.com/@pliegue' }], leadCaptureUrl: 'https://forms.example/pedido', contactPhone: '+591 700-00000', contactEmail: 'Hola@Pliegue.bo' };

it('opens only destinations the merchant configured', () => {
  expect(merchantDestination('https://instagram.com/pliegue', store)).toEqual({ href: 'https://instagram.com/pliegue', newTab: true });
  expect(merchantDestination('https://INSTAGRAM.com/pliegue/', store)?.newTab).toBe(true);
  expect(merchantDestination('https://www.tiktok.com/@pliegue', store)).not.toBeNull();
  expect(merchantDestination('https://forms.example/pedido', store)).not.toBeNull();
  expect(merchantDestination('https://wa.me/59170000000', store)).toEqual({ href: 'https://wa.me/59170000000', newTab: true });
  expect(merchantDestination('https://api.whatsapp.com/send?phone=59170000000&text=hola', store)?.newTab).toBe(true);
  expect(merchantDestination('tel:+59170000000', store)).toEqual({ href: 'tel:+59170000000', newTab: false });
  expect(merchantDestination('mailto:hola@pliegue.bo?subject=x', store)).toEqual({ href: 'mailto:hola@pliegue.bo', newTab: false });
});

it('refuses anything the merchant did not configure', () => {
  for (const href of ['https://instagram.com/otra-tienda', 'https://evil.example/?data=secret', 'https://wa.me/59171111111', 'tel:+59171111111', 'mailto:attacker@evil.example', 'javascript:alert(1)', 'https://user:pass@instagram.com/pliegue', 'data:text/html,hi', 'nonsense']) {
    expect(merchantDestination(href, store)).toBeNull();
  }
  expect(merchantDestination('https://wa.me/', { contactPhone: null })).toBeNull();
});
