import { Header, Footer, Commerce } from './Shell';

export default function Checkout() {
  return <div className="tr">
    <Header />
    <main id="contenido" className="tr-page tr-page--checkout" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="tr-status" />
    <Footer />
    <Commerce />
  </div>;
}
