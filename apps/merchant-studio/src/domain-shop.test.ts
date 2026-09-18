import { expect, it } from 'vitest';
import { expiryNotice } from './domain-shop';

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();

it('says nothing about a domain that has not been registered yet', () => {
  expect(expiryNotice(null)).toBe('');
});

it('states the date plainly while renewal is far away', () => {
  const notice = expiryNotice(inDays(200));
  expect(notice).toContain('Vence el');
  expect(notice).not.toMatch(/escríbenos/i);
});

it('asks the merchant to write to support inside the last month', () => {
  // Renewal is manual, so a merchant who ignores this loses the storefront.
  const notice = expiryNotice(inDays(20));
  expect(notice).toContain('20 días');
  expect(notice).toMatch(/escríbenos/i);
});

it('counts a domain that already expired as expired rather than as days left', () => {
  expect(expiryNotice(inDays(-3))).toContain('venció');
});
