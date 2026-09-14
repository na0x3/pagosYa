import React from 'react';

type IconProps={name:string;className?:string};
export function Icon({name,className=''}:IconProps){
  const shared={className:`icon ${className}`,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true};
  if(name==='shopping-bag')return <svg {...shared}><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
  if(name==='arrow-right')return <svg {...shared}><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></svg>;
  if(name==='arrow-left')return <svg {...shared}><path d="M19 12H5"/><path d="m10 7-5 5 5 5"/></svg>;
  if(name==='chevron-down')return <svg {...shared}><path d="m6 9 6 6 6-6"/></svg>;
  if(name==='chevron-right')return <svg {...shared}><path d="m9 6 6 6-6 6"/></svg>;
  return null;
}

export function Header(){return <header className="site-header"><a className="brand" href="index.html" aria-label="ÓRBITA, inicio"><span className="orbit-mark" aria-hidden="true"><i/></span><span>ÓRBITA</span></a><nav className="site-nav" aria-label="Navegación principal"><a href="index.html#field-catalog">Equipo</a><a href="index.html#north-manifesto">Misión</a><a href="index.html#buying-faq">Cómo comprar</a></nav><span className="mission-code" aria-hidden="true">ORB / 001</span></header>}

export function Footer(){return <footer className="site-footer"><div className="footer-top"><a href="index.html">Inicio</a><a href="index.html#field-catalog">Colección</a><a href="index.html#buying-faq">Ayuda de compra</a><span>EXPEDICIÓN 001</span></div><div className="footer-word" aria-hidden="true">ÓRBITA</div><div className="footer-base"><p>Colección conceptual · Tienda de demostración</p><p>Equipo para otros mundos.</p></div></footer>}

export function CartDock(){return <div className="cart-dock"><button type="button" data-cart-open>Lista de carga <span data-pagosya-cart-count data-cart-count>0</span><Icon name="shopping-bag"/></button></div>}
