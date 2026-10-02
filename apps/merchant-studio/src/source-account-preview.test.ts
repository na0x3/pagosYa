// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountSourceAccountHost } from '@pagosya/storefront-preview';
let dispose: (()=>void) | undefined;
afterEach(()=>{dispose?.();document.body.replaceChildren();vi.restoreAllMocks();});
function setup() {
 const source=document.createElement('iframe');source.setAttribute('sandbox','allow-scripts');document.body.append(source);
 const navigate=vi.fn();
 dispose=mountSourceAccountHost(source,{checkoutOrigin:'https://checkout.test',slug:'my-store',preview:true,branding:{},navigate});
 const message=(data:any,origin='null',sender:Window|null=source.contentWindow)=>window.dispatchEvent(new MessageEvent('message',{data,origin,source:sender}));
 const slot={type:'pagosya:account-slot',view:'register',rect:{top:100,left:20,width:400,height:620}};
 return {source,navigate,message,slot};
}
it('mounts the real form as a trusted sibling, never inside the source sandbox',()=>{
 const {source,message,slot}=setup(); message(slot);
 const frame=document.querySelector<HTMLIFrameElement>('[data-trusted-account] iframe')!;
 expect(frame).not.toBeNull(); expect(source.contains(frame)).toBe(false);
 expect(frame.src).toContain('https://checkout.test/cuenta/my-store/registro?account_embed=1&account_preview=1');
 expect(frame.hasAttribute('srcdoc')).toBe(false);
});
it('rejects forged slot events and arbitrary views and validates account navigation origin',()=>{
 const {source,message,slot,navigate}=setup();
 message(slot,'https://evil.test'); message({...slot,view:'https://evil.test'});
 expect(document.querySelector('[data-trusted-account]')).toBeNull();
 message(slot);const frame=document.querySelector<HTMLIFrameElement>('[data-trusted-account] iframe')!;
 message({type:'pagosya:account-navigate',view:'registro'},'null',source.contentWindow);
 message({type:'pagosya:account-navigate',view:'registro'},'https://evil.test',frame.contentWindow);
 expect(navigate).not.toHaveBeenCalled();
 message({type:'pagosya:account-navigate',view:'ingresar'},'https://checkout.test',frame.contentWindow);
 expect(navigate).toHaveBeenCalledWith('acceso-ingresar.html');
});
it('removes an old form on source navigation and on unmount',async()=>{
 const {source,message,slot}=setup();message(slot);
 source.srcdoc='<h1>Other page</h1>';await Promise.resolve();
 expect(document.querySelector('[data-trusted-account]')).toBeNull();
 message(slot);source.remove();await Promise.resolve();
 expect(document.querySelector('[data-trusted-account]')).toBeNull();
});
