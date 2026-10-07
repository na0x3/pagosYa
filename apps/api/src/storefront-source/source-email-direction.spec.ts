import { readFileSync } from 'node:fs';
import { SOURCE_ORDER_EMAIL_DIRECTION } from './source-email-html';
import { ORDER_EMAIL_SLOTS, ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';

describe('the generator is told to author the confirmation email', () => {
  it('names the file it must write', () => {
    expect(SOURCE_ORDER_EMAIL_DIRECTION).toContain(ORDER_EMAIL_TEMPLATE_PATH);
  });

  it('names every slot the renderer fills', () => {
    for (const slot of ORDER_EMAIL_SLOTS) expect(SOURCE_ORDER_EMAIL_DIRECTION).toContain(slot);
  });

  it('forbids writing an amount and forbids implying an automatic charge', () => {
    expect(SOURCE_ORDER_EMAIL_DIRECTION).toContain('nunca escribas un monto');
    expect(SOURCE_ORDER_EMAIL_DIRECTION.toLowerCase()).toContain('automátic');
  });

  it('tells the author that email drops flexbox, grid and custom properties', () => {
    expect(SOURCE_ORDER_EMAIL_DIRECTION).toMatch(/flex/i);
    expect(SOURCE_ORDER_EMAIL_DIRECTION).toMatch(/grid/i);
    expect(SOURCE_ORDER_EMAIL_DIRECTION).toMatch(/table/i);
  });

  it('is actually carried in the live generator prompt', () => {
    const service = readFileSync(`${__dirname}/source-generation.service.ts`, 'utf8');
    expect(service).toContain('SOURCE_ORDER_EMAIL_DIRECTION');
  });

  it('is NOT carried into the pinned September 5 author', () => {
    const sep5 = readFileSync(`${__dirname}/design-engine/sep5-author.ts`, 'utf8');
    expect(sep5).not.toContain('SOURCE_ORDER_EMAIL_DIRECTION');
    expect(sep5).not.toContain('order-confirmation');
  });
});
