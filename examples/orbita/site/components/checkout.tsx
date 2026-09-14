import React from 'react';
import {Header,Footer,Icon} from './site';

export default function Checkout(){return <div className="store-page checkout-shell"><Header/><div className="cart-dock"><button type="button" data-cart-open>Lista de carga <span data-pagosya-cart-count data-cart-count>0</span><Icon name="shopping-bag"/></button></div><main className="checkout-main"><div className="checkout-intro"><p className="eyebrow">PROTOCOLO FINAL / EXP-001</p><p>Revisa tu lista de carga y completa los datos solicitados para continuar al pago.</p></div><div data-pagosya-checkout-page></div></main><div data-pagosya-status role="status" aria-live="polite"></div><Footer/></div>}
