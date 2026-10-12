import { commerceRuntimeDna, type CommerceDraw } from './design-engine/commerce-draw';
import type { AccountTheme } from './account-theme';

/** What a commerce draw adds to config.js (spec 2026-10-11 commerce surfaces). A kept draw (an ordinary edit) re-applies the DNA
 *  and the word but never the account theme: the store's saved theme, possibly with YAPI's CSS, carries over instead. */
export function commerceConfig(input: { commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string }; photos: string[] }): { dna: Record<string, string>; accountTheme?: AccountTheme; checkoutPhoto?: string; cartWord?: string } {
  const commerce = input.commerce;
  if (!commerce) return { dna: {} };
  const photo = input.photos[0];
  const { account, checkout } = commerce.draw;
  return {
    dna: commerceRuntimeDna(commerce.draw),
    ...(commerce.fresh && account ? { accountTheme: { layout: account, ...(account === 'split' && photo ? { photo } : {}) } } : {}),
    ...(checkout === 'brand' && photo ? { checkoutPhoto: photo } : {}),
    ...(commerce.cartWord ? { cartWord: commerce.cartWord } : {}),
  };
}
