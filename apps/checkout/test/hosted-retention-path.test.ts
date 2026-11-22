import { expect, it, vi } from 'vitest';
import { hostedRetentionMethod, hostedRetentionRequest } from '../src/source-storefront';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));

// Spec 2026-11-09 popup games: a published store's popup draws its prize through the hosted parent.
it('forwards the game draw as a POST, alongside the existing retention paths', () => {
  expect(hostedRetentionMethod('play', false)).toBe('POST');
  expect(hostedRetentionMethod('subscribe', true)).toBe('POST');
  expect(hostedRetentionMethod('', false)).toBe('GET');
  expect(hostedRetentionMethod(`cards/${'a'.repeat(64)}`, false)).toBe('GET');
  expect(hostedRetentionMethod('', true)).toBeNull();
  expect(hostedRetentionMethod('admin', false)).toBeNull();
});

// Spec 2026-11-09 YAPI A/B tests: the parent tells the API which test visit asks, so a B visitor sees B's popup and gets B's code.
it('carries the test visit on the popup read and the signup, and nowhere else', () => {
  const visit = 'v'.repeat(32);
  expect(hostedRetentionRequest('https://api.test/v1', 'remo', '', undefined, visit).url).toBe(`https://api.test/v1/stores/public/remo/retention?visit=${visit}`);
  expect(hostedRetentionRequest('https://api.test/v1', 'remo', 'subscribe', { email: 'a@b.co' }, visit).body).toEqual({ email: 'a@b.co', sourceVisitToken: visit });
  expect(hostedRetentionRequest('https://api.test/v1', 'remo', 'carts', { email: 'a@b.co' }, visit).body).toEqual({ email: 'a@b.co' });
  expect(hostedRetentionRequest('https://api.test/v1', 'remo', '', undefined, undefined).url).toBe('https://api.test/v1/stores/public/remo/retention');
  expect(hostedRetentionRequest('https://api.test/v1', 'remo', 'subscribe', { email: 'a@b.co' }, undefined).body).toEqual({ email: 'a@b.co' });
});

// Spec 2026-11-21 popups part 2: a published store's popups report what shoppers did and check a code before reminding it.
it('forwards the popup events and the code check as POSTs, never as reads', () => {
  expect(hostedRetentionMethod('popup-events', true)).toBe('POST');
  expect(hostedRetentionMethod('code-status', true)).toBe('POST');
  expect(hostedRetentionMethod('popup-events/x', true)).toBeNull();
});
