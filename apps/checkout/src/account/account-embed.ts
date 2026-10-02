import { normalizeCheckoutBranding, accountFormStyles } from '@pagosya/shared-types';
const style = document.createElement('style'); style.dataset.accountStyles = ''; style.textContent = accountFormStyles; document.head.append(style);

export const accountPreview = () => new URLSearchParams(location.search).get('account_preview') === '1';
export const accountEmbedded = () => new URLSearchParams(location.search).get('account_embed') === '1' && window.parent !== window;
let parentOrigin = '';
export function accountNavigate(view: string): boolean {
  if (!accountEmbedded() || !parentOrigin) return false;
  parent.postMessage({type:'pagosya:account-navigate',view},parentOrigin);
  return true;
}
export function bindAccountEmbed(app: HTMLElement): void {
  if (!accountEmbedded()) return;
  try {
    const url = new URL(new URLSearchParams(location.hash.slice(1)).get('parent_origin') || '');
    if (!['http:','https:'].includes(url.protocol)) return;
    parentOrigin = url.origin;
  } catch { return; }
  document.body.classList.add('account-embedded');
  const scroll = (delta: number) => parent.postMessage({type:'pagosya:account-scroll',delta},parentOrigin);
  window.addEventListener('wheel',event=>{const root=document.scrollingElement; if (root && ((event.deltaY > 0 && root.scrollTop + innerHeight < root.scrollHeight - 2) || (event.deltaY < 0 && root.scrollTop > 0))) return; event.preventDefault();scroll(event.deltaY);},{passive:false});
  let touchY = 0;
  window.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY || 0;},{passive:true});
  window.addEventListener('touchmove',event=>{const y=event.touches[0]?.clientY; if (y === undefined || document.documentElement.scrollHeight > innerHeight + 2) return; event.preventDefault();scroll(touchY-y);touchY=y;},{passive:false});
  app.addEventListener('focusin',event=>{const target=event.target as HTMLElement; const rect=target.getBoundingClientRect(); parent.postMessage({type:'pagosya:account-focus',top:rect.top,bottom:rect.bottom},parentOrigin);});
  const report = () => parent.postMessage({type:'pagosya:account-height',height:Math.ceil(app.getBoundingClientRect().height)},parentOrigin);
  const resize = new ResizeObserver(report); resize.observe(app);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.type !== 'pagosya:account-branding') return;
    const brand = normalizeCheckoutBranding(event.data.branding, '');
    for (const [key,value] of Object.entries({background:brand.background,foreground:brand.foreground,accent:brand.accent,'accent-foreground':brand.accentForeground,'body-font':brand.bodyFont,'heading-font':brand.headingFont,radius:brand.radius})) document.body.style.setProperty('--account-'+key,value);
    for (const font of brand.fonts) { const face = new FontFace(font.family, `url(${font.source})`, {weight:font.weight,style:font.style}); document.fonts.add(face); void face.load().then(report).catch(()=>undefined); }
    report();
  });
  window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
  parent.postMessage({type:'pagosya:account-ready'},parentOrigin); report();
}
