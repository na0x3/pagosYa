import { useEffect, type ComponentType } from 'react';
import { CreativeProvider } from './creative';
export function withCommerce(Content: ComponentType) { return function StorefrontPage() { useEffect(() => { if (document.querySelector('script[data-pagosya-runtime]')) return; const script = document.createElement('script'); script.src = '/commerce.js'; script.dataset.pagosyaRuntime = 'true'; document.body.append(script); }, []); return <CreativeProvider><Content/></CreativeProvider>; }; }
