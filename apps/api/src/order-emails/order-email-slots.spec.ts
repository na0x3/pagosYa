import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { ORDER_EMAIL_REQUIRED_SLOTS, ORDER_EMAIL_SLOTS, ORDER_EMAIL_TEMPLATE_PATH } from './order-email-slots';

const floor = () => readFileSync(kitPath('emails', 'order-confirmation.html'), 'utf8');

describe('order email slot contract', () => {
  it('names the template path the generator writes', () => {
    expect(ORDER_EMAIL_TEMPLATE_PATH).toBe('emails/order-confirmation.html');
  });

  it('requires the two slots that make a receipt a receipt', () => {
    expect([...ORDER_EMAIL_REQUIRED_SLOTS].sort()).toEqual(['data-order-items', 'data-order-total']);
  });

  it('the kit floor carries every slot in the contract', () => {
    const html = floor();
    for (const slot of ORDER_EMAIL_SLOTS) expect(html).toContain(slot);
  });

  it('the kit floor is table-based and declares a colour scheme', () => {
    const html = floor();
    expect(html).toContain('<table');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).toContain('color-scheme');
  });

  it('the kit floor states no automatic charge is made', () => {
    expect(floor()).toContain('No se cobra automáticamente');
  });
});
