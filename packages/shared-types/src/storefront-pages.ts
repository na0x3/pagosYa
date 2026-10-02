/** Versioned route and ownership contract shared by Studio, compilation and YAPI. */
export const STOREFRONT_CAPABILITIES_VERSION = 1;
export type StorefrontPageDefinition = { key: string; label: string; url: string; owner: 'authored' | 'information' | 'catalog' | 'account' | 'commerce'; contentSource: string; view?: string; kind?: string };
export const STOREFRONT_PAGES: readonly StorefrontPageDefinition[] = [
  { key:'home',label:'Inicio',url:'index.html',owner:'authored',contentSource:'components/home.tsx' },
  { key:'product',label:'Producto',url:'product.html',owner:'commerce',contentSource:'catalog + product theme' },
  { key:'checkout',label:'Pago',url:'checkout.html',owner:'commerce',contentSource:'trusted checkout' },
  ...[
    ['about','Nosotros','nosotros','about','store.aboutText'],['contact','Contacto','contacto','contact','store.contactEmail/contactPhone/locations'],
    ['shipping','Envíos y entregas','envios','shipping','store policies.delivery/locations'],['faq','Preguntas frecuentes','faq','faq','confirmed shipping/contact/payment facts'],
    ['refund-policy','Cambios y devoluciones','reembolsos','refund','store policies.returns'],['privacy','Privacidad','privacidad','privacy','store policies.privacy'],
    ['terms','Términos y condiciones','terminos','terms','store policies.terms'],['cookies','Cookies','cookies','cookies','platform storage policy'],
    ['not-found','Página no encontrada','404','notfound','platform'],
  ].map(([key,label,slug,kind,contentSource])=>({key:`pages/${key}`,label,url:slug+'.html',owner:'information' as const,kind,contentSource})),
  ...[['collections','Colecciones','colecciones'],['search','Búsqueda','buscar']].map(([key,label,slug])=>({key:`catalog/${key}`,label,url:slug+'.html',owner:'catalog' as const,kind:key,contentSource:'live catalog'})),
  ...[
    ['auth/login','Ingresar','acceso-ingresar','ingresar'],['auth/register','Crear cuenta','acceso-registro','registro'],
    ['auth/forgot-password','Recuperar contraseña','acceso-olvide-mi-contrasena','recuperar'],['auth/reset-password','Nueva contraseña','acceso-restablecer-contrasena','restablecer'],
    ['account/orders','Mis pedidos','cuenta-pedidos','pedidos'],['account/addresses','Mis direcciones','cuenta-direcciones','direcciones'],
    ['account/profile','Mi perfil','cuenta-perfil','perfil'],['account/subscriptions','Mis suscripciones','cuenta-suscripciones','suscripciones'],
  ].map(([key,label,slug,view])=>({key,label,url:slug+'.html',owner:'account' as const,view,contentSource:'trusted customer account; preview is simulated'})),
];
export function storefrontPageRoute(path: string): {name:string;path:string} | null {
  const match=/^components\/(pages|catalog|auth|account)\/([a-z][a-z0-9-]{0,47})\.tsx$/.exec(path);
  if(!match)return null;
  const name=`${match[1]}/${match[2]}`;
  const legacy:Record<string,string>={'account/downloads':'cuenta-descargas.html','account/payment-methods':'cuenta-metodos-de-pago.html'};
  return {name,path:STOREFRONT_PAGES.find(page=>page.key===name)?.url || legacy[name] || `${match[1]==='auth'?'acceso-':match[1]==='account'?'cuenta-':''}${match[2]}.html`};
}
export function storefrontPageIndex(files: readonly {path:string;content:string}[]) {
  return files.flatMap(file=>{
    const core=STOREFRONT_PAGES.find(page=>`components/${page.key}.tsx`===file.path && !page.key.includes('/'));
    const standard=/^\s*\/\/\s*@pagosya-page\b/.test(file.content)?storefrontPageRoute(file.path):null;
    const custom=/^components\/page-(?!index\.|product\.|checkout\.)([a-z][a-z0-9-]{0,47})\.tsx$/.exec(file.path);
    if(!core&&!standard&&!custom)return [];
    const definition=core||STOREFRONT_PAGES.find(page=>page.key===standard?.name);
    return [{...definition,key:definition?.key||standard?.name||custom![1],file:file.path,url:definition?.url||standard?.path||`${custom![1]}.html`,label:definition?.label||custom?.[1]||standard!.name,owner:definition?.owner||'authored',contentSource:definition?.contentSource||file.path,dependencies:[...(file.content.matchAll(/from\s*['"]([^'"]+)['"]/g))].map(m=>m[1]),operations:definition?.owner==='account'?['edit_layout','set_account_appearance','inspect_account_preview']:definition?.owner==='information'?['edit_layout','edit_styles','request_confirmed_settings']:['edit_layout','edit_styles','inspect_page']}];
  });
}
