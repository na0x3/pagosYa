import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ne">
    <Header />
    <main id="contenido" className="ne-page ne-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ne-status" />
    <Footer />
    <Commerce />
  </div>;
}
