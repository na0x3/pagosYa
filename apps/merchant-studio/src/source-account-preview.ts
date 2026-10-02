import { sourceAccountBranding } from '@pagosya/shared-types';
import { mountSourceAccountHost, type SourceSnapshot } from '@pagosya/storefront-preview';
import { CHECKOUT_ORIGIN } from './api';

export function mountSourceAccountPreview(frame: HTMLIFrameElement, snapshot: SourceSnapshot, navigate: (page: string) => void) {
  let config: any = {};
  try {
    const text = snapshot.files.find(file => file.path === 'config.js')?.content;
    const match = text?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (match) config = JSON.parse(match[1]);
  } catch { /* A template may not have a store yet. */ }
  const branding = sourceAccountBranding({ ...config.data, name: config.data?.storeName || config.data?.name || 'Tu tienda' }, snapshot);
  return mountSourceAccountHost(frame, {checkoutOrigin:CHECKOUT_ORIGIN,slug:config.slug || 'preview',preview:true,branding,navigate});
}
