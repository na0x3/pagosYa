import { commerceRuntimeDna, type CommerceDraw } from './design-engine/commerce-draw';
import type { AccountTheme } from './account-theme';

/** What a commerce draw adds to config.js (spec 2026-10-11 commerce surfaces). A kept draw (an ordinary edit) re-applies the DNA
 *  and the word but never the account theme: the store's saved theme, possibly with YAPI's CSS, carries over instead. It also
 *  keeps the brand panel's photo (`keptPhoto`, still bundled): an edit's photos are only what that edit attached. */
export function commerceConfig(input: { commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string }; photos: string[]; keptPhoto?: string }): { dna: Record<string, string>; accountTheme?: AccountTheme; checkoutPhoto?: string; cartWord?: string } {
  const commerce = input.commerce;
  if (!commerce) return { dna: {} };
  const photo = input.photos[0];
  const panelPhoto = commerce.fresh ? photo : input.keptPhoto;
  const { account, checkout } = commerce.draw;
  return {
    dna: commerceRuntimeDna(commerce.draw),
    ...(commerce.fresh && account ? { accountTheme: { layout: account, ...(account === 'split' && photo ? { photo } : {}) } } : {}),
    ...(checkout === 'brand' && panelPhoto ? { checkoutPhoto: panelPhoto } : {}),
    ...(commerce.cartWord ? { cartWord: commerce.cartWord } : {}),
  };
}
