import React from 'react';
import {Header,Footer,Icon} from './site';

export default function Product(){return <div className="store-page product-shell"><Header/><div className="cart-dock"><button type="button" data-cart-open>Lista de carga <span data-pagosya-cart-count data-cart-count>0</span><Icon name="shopping-bag"/></button></div><main className="product-main"><div className="product-route"><a href="index.html#field-catalog"><Icon name="arrow-left"/> Volver a la colección</a><span>CONFIGURA TU MISIÓN / 001</span></div><div data-pagosya-product-page></div><p className="photo-note">Fotografía del color de portada</p></main><div data-pagosya-cart hidden></div><div data-pagosya-contact hidden></div><div data-pagosya-status role="status" aria-live="polite"></div><Footer/></div>}
