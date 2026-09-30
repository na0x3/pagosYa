import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="ar">
    <Header />
    <main id="contenido" className="ar-page ar-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="ar-status" />
    <Footer />
    <Commerce />
  </div>;
}
